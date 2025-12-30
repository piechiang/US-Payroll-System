/**
 * ACH Direct Deposit Routes
 *
 * Endpoints for generating ACH files for payroll direct deposits.
 */

import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest, hasCompanyAccess, isRoleAllowed } from '../middleware/auth.js';
import { decrypt, isEncrypted } from '../services/encryption.js';
import {
  generateACHFile,
  validateACHFile,
  validateRoutingNumber,
  ACHOriginatorInfo,
  ACHCompanyInfo,
  ACHEntry,
  ACHBatch
} from '../services/achGenerator.js';
import { logger } from '../services/logger.js';
import { exportLimiter } from '../middleware/rateLimit.js';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const generateACHSchema = z.object({
  payPeriodId: z.string(),
  effectiveDate: z.string().transform(s => new Date(s)),
  // Bank origination info (would typically come from company settings)
  immediateDestination: z.string().regex(/^\d{9}$/, 'Must be 9-digit routing number'),
  immediateDestinationName: z.string().max(23),
  companyBankRouting: z.string().regex(/^\d{9}$/, 'Must be 9-digit routing number'),
  companyBankAccount: z.string().min(4).max(17)
});

/**
 * POST /api/ach/generate
 * Generate an ACH file for a pay period
 * Rate limited: 10 exports per hour
 */
router.post('/generate', exportLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const data = generateACHSchema.parse(req.body);

    // Get pay period with payrolls and employee bank info
    const payPeriod = await prisma.payPeriod.findUnique({
      where: { id: data.payPeriodId },
      include: {
        company: true,
        payrolls: {
          where: { status: { not: 'VOID' } },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                bankRoutingNumber: true,
                bankAccountNumber: true,
                bankAccountType: true
              }
            }
          }
        }
      }
    });

    if (!payPeriod) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    if (!hasCompanyAccess(req, payPeriod.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isRoleAllowed(req, ['ADMIN', 'ACCOUNTANT'], payPeriod.companyId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'This action requires one of the following roles: ADMIN, ACCOUNTANT'
      });
    }

    // Only generate ACH for approved or processed payrolls
    if (!['APPROVED', 'PROCESSED', 'PAID'].includes(payPeriod.status)) {
      return res.status(400).json({
        error: 'Invalid pay period status',
        message: 'ACH files can only be generated for approved or processed payrolls',
        currentStatus: payPeriod.status
      });
    }

    // Filter employees with direct deposit info
    const directDepositPayrolls = payPeriod.payrolls.filter(p =>
      p.employee.bankRoutingNumber &&
      p.employee.bankAccountNumber &&
      p.employee.bankAccountType
    );

    if (directDepositPayrolls.length === 0) {
      return res.status(400).json({
        error: 'No direct deposit employees',
        message: 'No employees in this pay period have direct deposit configured'
      });
    }

    // Validate routing numbers
    const invalidRouting: string[] = [];
    for (const payroll of directDepositPayrolls) {
      let routing = payroll.employee.bankRoutingNumber!;
      if (isEncrypted(routing)) {
        routing = decrypt(routing);
      }
      if (!validateRoutingNumber(routing)) {
        invalidRouting.push(`${payroll.employee.firstName} ${payroll.employee.lastName}`);
      }
    }

    if (invalidRouting.length > 0) {
      return res.status(400).json({
        error: 'Invalid routing numbers',
        message: 'The following employees have invalid bank routing numbers',
        employees: invalidRouting
      });
    }

    // Build ACH entries
    const entries: ACHEntry[] = directDepositPayrolls.map(payroll => {
      let routingNumber = payroll.employee.bankRoutingNumber!;
      let accountNumber = payroll.employee.bankAccountNumber!;

      // Decrypt if needed
      if (isEncrypted(routingNumber)) {
        routingNumber = decrypt(routingNumber);
      }
      if (isEncrypted(accountNumber)) {
        accountNumber = decrypt(accountNumber);
      }

      return {
        employeeId: payroll.employee.id,
        employeeName: `${payroll.employee.lastName} ${payroll.employee.firstName}`.toUpperCase(),
        routingNumber,
        accountNumber,
        accountType: payroll.employee.bankAccountType as 'CHECKING' | 'SAVINGS',
        amount: Number(payroll.netPay),
        individualId: payroll.employee.id.slice(-15)
      };
    });

    // Company EIN without dashes
    const companyId = payPeriod.company.ein.replace(/-/g, '');

    // Build originator info
    const originator: ACHOriginatorInfo = {
      originatorId: companyId,
      originatorName: payPeriod.company.name.toUpperCase(),
      originatingDFI: data.companyBankRouting.substring(0, 8),
      immediateDestination: data.immediateDestination,
      immediateDestinationName: data.immediateDestinationName.toUpperCase(),
      immediateOrigin: data.companyBankRouting,
      immediateOriginName: payPeriod.company.name.toUpperCase()
    };

    // Build company info
    const company: ACHCompanyInfo = {
      companyName: payPeriod.company.name.toUpperCase(),
      companyId,
      routingNumber: data.companyBankRouting,
      accountNumber: data.companyBankAccount,
      accountType: 'CHECKING'
    };

    // Build batch
    const batch: ACHBatch = {
      entries,
      effectiveDate: data.effectiveDate,
      companyEntryDescription: 'PAYROLL'
    };

    // Generate ACH file
    const achContent = generateACHFile(originator, company, batch);

    // Validate the generated file
    const validation = validateACHFile(achContent);
    if (!validation.valid) {
      return res.status(500).json({
        error: 'ACH file validation failed',
        details: validation.errors
      });
    }

    // Calculate totals
    const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);

    res.json({
      success: true,
      payPeriodId: payPeriod.id,
      effectiveDate: data.effectiveDate,
      summary: {
        employeeCount: entries.length,
        totalAmount: Math.round(totalAmount * 100) / 100,
        skippedEmployees: payPeriod.payrolls.length - directDepositPayrolls.length
      },
      achFile: {
        content: achContent,
        filename: `ACH_${payPeriod.company.ein.replace(/-/g, '')}_${formatDateForFilename(data.effectiveDate)}.txt`,
        recordCount: achContent.split('\n').length
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Error generating ACH file:', error);
    res.status(500).json({ error: 'Failed to generate ACH file' });
  }
});

/**
 * GET /api/ach/preview/:payPeriodId
 * Preview direct deposit details before generating ACH
 */
router.get('/preview/:payPeriodId', async (req: AuthRequest, res: Response) => {
  try {
    const payPeriod = await prisma.payPeriod.findUnique({
      where: { id: req.params.payPeriodId },
      include: {
        company: {
          select: { id: true, name: true, ein: true }
        },
        payrolls: {
          where: { status: { not: 'VOID' } },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                bankRoutingNumber: true,
                bankAccountNumber: true,
                bankAccountType: true
              }
            }
          }
        }
      }
    });

    if (!payPeriod) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    if (!hasCompanyAccess(req, payPeriod.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isRoleAllowed(req, ['ADMIN', 'ACCOUNTANT'], payPeriod.companyId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'This action requires one of the following roles: ADMIN, ACCOUNTANT'
      });
    }

    // Categorize employees
    const directDeposit: any[] = [];
    const noDirectDeposit: any[] = [];

    for (const payroll of payPeriod.payrolls) {
      const emp = payroll.employee;
      const hasDD = emp.bankRoutingNumber && emp.bankAccountNumber && emp.bankAccountType;

      const record = {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        netPay: Number(payroll.netPay),
        accountType: emp.bankAccountType,
        // Mask sensitive info
        routingNumber: emp.bankRoutingNumber ? maskBankNumber(emp.bankRoutingNumber) : null,
        accountNumber: emp.bankAccountNumber ? maskBankNumber(emp.bankAccountNumber) : null
      };

      if (hasDD) {
        directDeposit.push(record);
      } else {
        noDirectDeposit.push(record);
      }
    }

    const totalDirectDeposit = directDeposit.reduce((sum, e) => sum + e.netPay, 0);
    const totalCheck = noDirectDeposit.reduce((sum, e) => sum + e.netPay, 0);

    res.json({
      payPeriod: {
        id: payPeriod.id,
        startDate: payPeriod.startDate,
        endDate: payPeriod.endDate,
        payDate: payPeriod.payDate,
        status: payPeriod.status
      },
      company: payPeriod.company,
      summary: {
        totalEmployees: payPeriod.payrolls.length,
        directDepositCount: directDeposit.length,
        checkCount: noDirectDeposit.length,
        totalDirectDeposit: Math.round(totalDirectDeposit * 100) / 100,
        totalCheck: Math.round(totalCheck * 100) / 100,
        grandTotal: Math.round((totalDirectDeposit + totalCheck) * 100) / 100
      },
      directDeposit,
      requiresCheck: noDirectDeposit
    });
  } catch (error) {
    logger.error('Error previewing ACH:', error);
    res.status(500).json({ error: 'Failed to preview ACH' });
  }
});

/**
 * POST /api/ach/validate-routing
 * Validate a bank routing number
 */
router.post('/validate-routing', async (req: AuthRequest, res: Response) => {
  try {
    const { routingNumber } = z.object({
      routingNumber: z.string()
    }).parse(req.body);

    const isValid = validateRoutingNumber(routingNumber);

    res.json({
      routingNumber: routingNumber.substring(0, 4) + '****' + routingNumber.slice(-1),
      valid: isValid,
      message: isValid ? 'Valid routing number' : 'Invalid routing number (check digit failed)'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ error: 'Validation failed' });
  }
});

/**
 * GET /api/ach/download/:payPeriodId
 * Download ACH file directly
 * Rate limited: 10 exports per hour
 */
router.get('/download/:payPeriodId', exportLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { effectiveDate, immediateDestination, immediateDestinationName, companyBankRouting, companyBankAccount } = req.query;

    // Validate required params
    if (!effectiveDate || !immediateDestination || !companyBankRouting || !companyBankAccount) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['effectiveDate', 'immediateDestination', 'companyBankRouting', 'companyBankAccount']
      });
    }

    // Forward to generate endpoint logic
    req.body = {
      payPeriodId: req.params.payPeriodId,
      effectiveDate: String(effectiveDate),
      immediateDestination: String(immediateDestination),
      immediateDestinationName: String(immediateDestinationName || 'BANK'),
      companyBankRouting: String(companyBankRouting),
      companyBankAccount: String(companyBankAccount)
    };

    // Get the generated content
    const data = generateACHSchema.parse(req.body);

    const payPeriod = await prisma.payPeriod.findUnique({
      where: { id: data.payPeriodId },
      include: {
        company: true,
        payrolls: {
          where: { status: { not: 'VOID' } },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                bankRoutingNumber: true,
                bankAccountNumber: true,
                bankAccountType: true
              }
            }
          }
        }
      }
    });

    if (!payPeriod) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    if (!hasCompanyAccess(req, payPeriod.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isRoleAllowed(req, ['ADMIN', 'ACCOUNTANT'], payPeriod.companyId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'This action requires one of the following roles: ADMIN, ACCOUNTANT'
      });
    }

    // Filter and build entries (same as generate)
    const directDepositPayrolls = payPeriod.payrolls.filter(p =>
      p.employee.bankRoutingNumber &&
      p.employee.bankAccountNumber &&
      p.employee.bankAccountType
    );

    if (directDepositPayrolls.length === 0) {
      return res.status(400).json({ error: 'No direct deposit employees' });
    }

    const entries: ACHEntry[] = directDepositPayrolls.map(payroll => {
      let routingNumber = payroll.employee.bankRoutingNumber!;
      let accountNumber = payroll.employee.bankAccountNumber!;

      if (isEncrypted(routingNumber)) {
        routingNumber = decrypt(routingNumber);
      }
      if (isEncrypted(accountNumber)) {
        accountNumber = decrypt(accountNumber);
      }

      return {
        employeeId: payroll.employee.id,
        employeeName: `${payroll.employee.lastName} ${payroll.employee.firstName}`.toUpperCase(),
        routingNumber,
        accountNumber,
        accountType: payroll.employee.bankAccountType as 'CHECKING' | 'SAVINGS',
        amount: Number(payroll.netPay),
        individualId: payroll.employee.id.slice(-15)
      };
    });

    const companyId = payPeriod.company.ein.replace(/-/g, '');

    const originator: ACHOriginatorInfo = {
      originatorId: companyId,
      originatorName: payPeriod.company.name.toUpperCase(),
      originatingDFI: data.companyBankRouting.substring(0, 8),
      immediateDestination: data.immediateDestination,
      immediateDestinationName: data.immediateDestinationName.toUpperCase(),
      immediateOrigin: data.companyBankRouting,
      immediateOriginName: payPeriod.company.name.toUpperCase()
    };

    const company: ACHCompanyInfo = {
      companyName: payPeriod.company.name.toUpperCase(),
      companyId,
      routingNumber: data.companyBankRouting,
      accountNumber: data.companyBankAccount,
      accountType: 'CHECKING'
    };

    const batch: ACHBatch = {
      entries,
      effectiveDate: data.effectiveDate,
      companyEntryDescription: 'PAYROLL'
    };

    const achContent = generateACHFile(originator, company, batch);
    const filename = `ACH_${companyId}_${formatDateForFilename(data.effectiveDate)}.txt`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(achContent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Error downloading ACH file:', error);
    res.status(500).json({ error: 'Failed to download ACH file' });
  }
});

// Helper functions
function maskBankNumber(encrypted: string): string {
  try {
    let value = encrypted;
    if (isEncrypted(value)) {
      value = decrypt(value);
    }
    if (value.length <= 4) {
      return '****';
    }
    return '****' + value.slice(-4);
  } catch {
    return '****';
  }
}

function formatDateForFilename(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export default router;
