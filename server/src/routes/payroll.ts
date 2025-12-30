import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index.js';
import { z } from 'zod';
import { PayrollCalculator, PayrollResult, UnsupportedStateError, isStateSupported } from '../services/payrollCalculator.js';
import { generatePaystubPDF } from '../services/paystubGenerator.js';
import { AuthRequest, authorizeRoles, hasCompanyAccess } from '../middleware/auth.js';
import { getSupportedStates } from '../tax/state/index.js';
import { payrollRunLimiter, exportLimiter } from '../middleware/rateLimit.js';
import { logPayrollOperation } from '../services/auditLog.js';
import { acquirePayrollLock, releasePayrollLock, generateIdempotencyKey, getPayrollLockStatus } from '../services/payrollLock.js';
import { logger } from '../services/logger.js';

// Type for employee with company included
type EmployeeWithCompany = Prisma.EmployeeGetPayload<{ include: { company: true } }>;

const router = Router();

// Validation schemas
const calculatePayrollSchema = z.object({
  employeeId: z.string(),
  payPeriodStart: z.string().transform(str => new Date(str)),
  payPeriodEnd: z.string().transform(str => new Date(str)),
  hoursWorked: z.number().min(0).optional(), // For hourly employees
  overtimeHours: z.number().min(0).default(0),
  bonus: z.number().min(0).default(0),
  commission: z.number().min(0).default(0),
  reimbursements: z.number().min(0).default(0), // Non-taxable
  // Tips
  creditCardTips: z.number().min(0).default(0), // Tips from credit cards (employer distributes)
  cashTips: z.number().min(0).default(0),       // Cash tips reported by employee
});

const runPayrollSchema = z.object({
  companyId: z.string(),
  payPeriodStart: z.string().transform(str => new Date(str)),
  payPeriodEnd: z.string().transform(str => new Date(str)),
  payDate: z.string().transform(str => new Date(str)),
  employeePayData: z.array(z.object({
    employeeId: z.string(),
    hoursWorked: z.number().min(0).optional(),
    overtimeHours: z.number().min(0).default(0),
    bonus: z.number().min(0).default(0),
    commission: z.number().min(0).default(0),
    reimbursements: z.number().min(0).default(0),
    // Tips
    creditCardTips: z.number().min(0).default(0), // Tips from credit cards (employer distributes)
    cashTips: z.number().min(0).default(0),       // Cash tips reported by employee
  }))
}).refine(
  data => data.payPeriodStart < data.payPeriodEnd,
  { message: 'Pay period start must be before pay period end', path: ['payPeriodStart'] }
).refine(
  data => data.payPeriodEnd <= data.payDate,
  { message: 'Pay date must be on or after pay period end', path: ['payDate'] }
);

// POST /api/payroll/calculate - Calculate payroll for single employee (preview)
// Multi-tenant: Verifies user has access to the employee's company
router.post('/calculate', async (req: AuthRequest, res: Response) => {
  try {
    const data = calculatePayrollSchema.parse(req.body);

    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
      include: { company: true }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Multi-tenant check
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, employee.companyId)) {
      return res.status(403).json({ error: 'Access denied to this employee' });
    }
    if (employee.state === 'MD' && !employee.county) {
      return res.status(400).json({
        error: 'Missing county',
        message: 'Maryland employees require a county for local tax calculation'
      });
    }

    const calculator = new PayrollCalculator();
    const result = calculator.calculate({
      employee,
      payPeriodStart: data.payPeriodStart,
      payPeriodEnd: data.payPeriodEnd,
      hoursWorked: data.hoursWorked,
      overtimeHours: data.overtimeHours,
      bonus: data.bonus,
      commission: data.commission,
      reimbursements: data.reimbursements,
      creditCardTips: data.creditCardTips,
      cashTips: data.cashTips,
      city: employee.city,
      county: employee.county || undefined,
      workCity: employee.workCity || undefined,
      workState: employee.workState || undefined,
      isResident: employee.localResident ?? true,
      sutaRate: employee.company.sutaRate ? Number(employee.company.sutaRate) : undefined
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    if (error instanceof UnsupportedStateError) {
      return res.status(400).json({
        error: 'Unsupported state',
        message: error.message,
        state: error.state,
        supportedStates: error.supportedStates
      });
    }
    logger.error('Error calculating payroll:', error);
    res.status(500).json({ error: 'Failed to calculate payroll' });
  }
});

// POST /api/payroll/run - Run payroll for entire company
// Multi-tenant: Verifies user has access to the target company
// Uses database transaction to ensure all-or-nothing processing
// Role restriction: Only ADMIN, ACCOUNTANT, or MANAGER can run payroll
// Concurrency control: Prevents duplicate payroll runs for same period
router.post('/run', payrollRunLimiter, authorizeRoles('ADMIN', 'ACCOUNTANT', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  let lockId: string | undefined;

  try {
    const data = runPayrollSchema.parse(req.body);

    // Multi-tenant check
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, data.companyId)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    // Acquire payroll lock to prevent concurrent runs
    // Uses client-provided idempotency key or generates one from parameters
    const clientIdempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
    const idempotencyKey = clientIdempotencyKey || generateIdempotencyKey({
      companyId: data.companyId,
      payPeriodStart: data.payPeriodStart,
      payPeriodEnd: data.payPeriodEnd,
      payDate: data.payDate
    });

    const lockResult = await acquirePayrollLock({
      companyId: data.companyId,
      payPeriodStart: data.payPeriodStart,
      payPeriodEnd: data.payPeriodEnd,
      userId: req.user?.userId || 'unknown',
      idempotencyKey
    });

    if (!lockResult.success) {
      // Return appropriate error based on lock failure reason
      const statusCode = lockResult.error === 'ALREADY_PROCESSED' ? 409 : 423;
      return res.status(statusCode).json({
        error: lockResult.error,
        message: lockResult.message,
        existingLock: lockResult.existingLock
      });
    }

    lockId = lockResult.lockId;

    // Get all employees for the company
    const employees = await prisma.employee.findMany({
      where: {
        companyId: data.companyId,
        isActive: true
      },
      include: { company: true }
    });

    // Build employee lookup map for O(1) access instead of O(n) Array.find()
    const employeeMap = new Map<string, EmployeeWithCompany>(employees.map(e => [e.id, e]));

    // Pre-validate: Check if all employees have supported states
    const unsupportedStates: { employeeId: string; employeeName: string; state: string }[] = [];
    const missingCounty: { employeeId: string; employeeName: string }[] = [];
    for (const employeePayData of data.employeePayData) {
      const employee = employeeMap.get(employeePayData.employeeId);
      if (employee && !isStateSupported(employee.state)) {
        unsupportedStates.push({
          employeeId: employee.id,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          state: employee.state
        });
      }
      if (employee && employee.state === 'MD' && !employee.county) {
        missingCounty.push({
          employeeId: employee.id,
          employeeName: `${employee.firstName} ${employee.lastName}`
        });
      }
    }

    if (unsupportedStates.length > 0) {
      return res.status(400).json({
        error: 'Unsupported states found',
        message: 'Some employees have states that are not supported for tax calculation',
        unsupportedEmployees: unsupportedStates,
        supportedStates: getSupportedStates()
      });
    }
    if (missingCounty.length > 0) {
      return res.status(400).json({
        error: 'Missing county',
        message: 'Maryland employees require a county for local tax calculation',
        employees: missingCounty
      });
    }

    // Use transaction to ensure all-or-nothing processing
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const calculator = new PayrollCalculator();
      const payrollResults: (PayrollResult & { payrollId: string; ytd: Record<string, number> })[] = [];

      // Get the year of the pay date for YTD calculations
      const payYear = data.payDate.getFullYear();
      const yearStart = new Date(payYear, 0, 1);

      // Calculate and save payroll for each employee
      for (const employeePayData of data.employeePayData) {
        const employee = employeeMap.get(employeePayData.employeeId);
        if (!employee) continue;

        // Get YTD totals for this employee (before this payroll)
        const ytdTotals = await tx.payroll.aggregate({
          where: {
            employeeId: employee.id,
            payDate: {
              gte: yearStart,
              lt: data.payDate
            },
            status: { not: 'VOID' }
          },
          _sum: {
            grossPay: true,
            federalWithholding: true,
            socialSecurity: true,
            medicare: true,
            stateWithholding: true,
            netPay: true
          }
        });

        // Get previous YTD gross for wage cap calculations
        const prevGross = Number(ytdTotals._sum.grossPay || 0);

        const calcResult = calculator.calculate({
          employee,
          payPeriodStart: data.payPeriodStart,
          payPeriodEnd: data.payPeriodEnd,
          hoursWorked: employeePayData.hoursWorked,
          overtimeHours: employeePayData.overtimeHours,
          bonus: employeePayData.bonus,
          commission: employeePayData.commission,
          reimbursements: employeePayData.reimbursements,
          creditCardTips: employeePayData.creditCardTips,
          cashTips: employeePayData.cashTips,
          city: employee.city,
          county: employee.county || undefined,
          workCity: employee.workCity || undefined,
          workState: employee.workState || undefined,
          isResident: employee.localResident ?? true,
          ytdGrossWages: prevGross, // Pass YTD wages for FICA/SDI wage caps
          sutaRate: employee.company.sutaRate ? Number(employee.company.sutaRate) : undefined
        });

        // Calculate new YTD totals (previous + current)
        const prevFederal = Number(ytdTotals._sum.federalWithholding || 0);
        const prevSS = Number(ytdTotals._sum.socialSecurity || 0);
        const prevMedicare = Number(ytdTotals._sum.medicare || 0);
        const prevState = Number(ytdTotals._sum.stateWithholding || 0);
        const prevNet = Number(ytdTotals._sum.netPay || 0);

        const newYtdGross = prevGross + calcResult.earnings.grossPay;
        const newYtdFederal = prevFederal + calcResult.taxes.federal.incomeTax;
        const newYtdSS = prevSS + calcResult.taxes.federal.socialSecurity;
        const newYtdMedicare = prevMedicare + calcResult.taxes.federal.medicare;
        const newYtdState = prevState + calcResult.taxes.state.incomeTax;
        const newYtdNet = prevNet + calcResult.netPay;

        // Save payroll record to database within transaction
        const payroll = await tx.payroll.create({
          data: {
            employeeId: employee.id,
            companyId: data.companyId,
            payPeriodStart: data.payPeriodStart,
            payPeriodEnd: data.payPeriodEnd,
            payDate: data.payDate,

            // Earnings
            regularHours: calcResult.earnings.regularHours,
            overtimeHours: calcResult.earnings.overtimeHours,
            regularPay: calcResult.earnings.regularPay,
            overtimePay: calcResult.earnings.overtimePay,
            bonus: calcResult.earnings.bonus,
            commission: calcResult.earnings.commission,
            // Tips
            creditCardTips: calcResult.earnings.creditCardTips,
            cashTips: calcResult.earnings.cashTips,
            grossPay: calcResult.earnings.grossPay,

            // Taxes (Employee)
            federalWithholding: calcResult.taxes.federal.incomeTax,
            socialSecurity: calcResult.taxes.federal.socialSecurity,
            medicare: calcResult.taxes.federal.medicare,
            stateWithholding: calcResult.taxes.state.incomeTax,
            stateDisability: calcResult.taxes.state.sdi,
            localWithholding: calcResult.taxes.local?.total || 0,

            // Retirement
            retirement401k: calcResult.retirement401k,

            // Employer Taxes
            employerFuta: calcResult.employerTaxes.futa,
            employerSuta: calcResult.employerTaxes.suta,
            employerSocialSecurity: calcResult.employerTaxes.socialSecurity,
            employerMedicare: calcResult.employerTaxes.medicare,
            totalEmployerTax: calcResult.employerTaxes.total,

            // Employer Contributions
            employer401kMatch: calcResult.employer401kMatch,

            // Totals
            totalDeductions: calcResult.totalDeductions,
            netPay: calcResult.netPay,
            reimbursements: calcResult.reimbursements,

            // YTD Totals (including this payroll)
            ytdGrossPay: newYtdGross,
            ytdFederalTax: newYtdFederal,
            ytdSocialSecurity: newYtdSS,
            ytdMedicare: newYtdMedicare,
            ytdStateTax: newYtdState,
            ytdNetPay: newYtdNet,

            // Status
            status: 'PROCESSED'
          }
        });

        payrollResults.push({
          ...calcResult,
          payrollId: payroll.id,
          ytd: {
            grossPay: newYtdGross,
            federalTax: newYtdFederal,
            socialSecurity: newYtdSS,
            medicare: newYtdMedicare,
            stateTax: newYtdState,
            netPay: newYtdNet
          }
        });
      }

      return payrollResults;
    });

    // Release lock on success
    if (lockId) {
      await releasePayrollLock(lockId, true);
    }

    // Audit log: record payroll run
    logPayrollOperation(req, 'PAYROLL_RUN', data.companyId, {
      payDate: data.payDate.toISOString(),
      payPeriodStart: data.payPeriodStart.toISOString(),
      payPeriodEnd: data.payPeriodEnd.toISOString(),
      employeeCount: result.length,
      totalGrossPay: result.reduce((sum, r) => sum + r.earnings.grossPay, 0),
      totalNetPay: result.reduce((sum, r) => sum + r.netPay, 0),
    });

    res.status(201).json({
      message: 'Payroll processed successfully',
      payDate: data.payDate,
      payPeriod: {
        start: data.payPeriodStart,
        end: data.payPeriodEnd
      },
      results: result,
      summary: {
        totalEmployees: result.length,
        totalGrossPay: result.reduce((sum, r) => sum + r.earnings.grossPay, 0),
        totalNetPay: result.reduce((sum, r) => sum + r.netPay, 0),
        totalEmployeeTaxes: result.reduce((sum, r) => sum + r.totalEmployeeTaxes, 0),
        totalEmployeeDeductions: result.reduce((sum, r) => sum + r.totalDeductions, 0),
        totalEmployerTaxes: result.reduce((sum, r) => sum + r.employerTaxes.total, 0),
        totalEmployerCost: result.reduce((sum, r) => sum + r.totalEmployerCost, 0)
      }
    });
  } catch (error) {
    // Release lock on failure
    if (lockId) {
      await releasePayrollLock(lockId, false);
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    if (error instanceof UnsupportedStateError) {
      return res.status(400).json({
        error: 'Unsupported state',
        message: error.message,
        state: error.state,
        supportedStates: error.supportedStates
      });
    }
    logger.error('Error running payroll:', error);
    res.status(500).json({ error: 'Failed to run payroll' });
  }
});

// GET /api/payroll/history/:employeeId - Get payroll history for employee
// Multi-tenant: Verifies user has access to the employee's company
router.get('/history/:employeeId', async (req: AuthRequest, res: Response) => {
  try {
    // First get the employee to check company access
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.employeeId },
      select: { companyId: true }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Multi-tenant check
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, employee.companyId)) {
      return res.status(403).json({ error: 'Access denied to this employee' });
    }

    const payrolls = await prisma.payroll.findMany({
      where: { employeeId: req.params.employeeId },
      orderBy: { payDate: 'desc' },
      take: 52 // Last year of pay stubs
    });

    res.json(payrolls);
  } catch (error) {
    logger.error('Error fetching payroll history:', error);
    res.status(500).json({ error: 'Failed to fetch payroll history' });
  }
});

// GET /api/payroll/:id - Get single payroll record
// Multi-tenant: Verifies user has access to the payroll's company
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const payroll = await prisma.payroll.findUnique({
      where: { id: req.params.id },
      include: {
        employee: true,
        company: true
      }
    });

    if (!payroll) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }

    // Multi-tenant check
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, payroll.companyId)) {
      return res.status(403).json({ error: 'Access denied to this payroll record' });
    }

    res.json(payroll);
  } catch (error) {
    logger.error('Error fetching payroll:', error);
    res.status(500).json({ error: 'Failed to fetch payroll record' });
  }
});

// GET /api/payroll/:id/pdf - Generate PDF paystub
// Multi-tenant: Verifies user has access to the payroll's company
// Rate limited: 10 exports per hour
router.get('/:id/pdf', exportLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const payroll = await prisma.payroll.findUnique({
      where: { id: req.params.id },
      include: {
        employee: true,
        company: true
      }
    });

    if (!payroll) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }

    // Multi-tenant check
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, payroll.companyId)) {
      return res.status(403).json({ error: 'Access denied to this payroll record' });
    }

    // Set response headers for PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="paystub-${payroll.employee.lastName}-${new Date(payroll.payDate).toISOString().split('T')[0]}.pdf"`
    );

    // Generate and pipe PDF to response
    const pdfDoc = generatePaystubPDF({
      payroll,
      employee: payroll.employee,
      company: payroll.company
    });

    pdfDoc.pipe(res);
  } catch (error) {
    logger.error('Error generating paystub PDF:', error);
    res.status(500).json({ error: 'Failed to generate paystub' });
  }
});

// GET /api/payroll/company/:companyId - Get all payrolls for a company
// Multi-tenant: Verifies user has access to the target company
router.get('/company/:companyId', async (req: AuthRequest, res: Response) => {
  try {
    // Multi-tenant check
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, req.params.companyId)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    const payrolls = await prisma.payroll.findMany({
      where: { companyId: req.params.companyId },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { payDate: 'desc' },
      take: 100
    });

    res.json(payrolls);
  } catch (error) {
    logger.error('Error fetching company payrolls:', error);
    res.status(500).json({ error: 'Failed to fetch payrolls' });
  }
});

// GET /api/payroll/lock-status - Check if a payroll run is in progress or already processed
// Useful for frontend to show status before attempting a run
router.get('/lock-status', async (req: AuthRequest, res: Response) => {
  try {
    const { companyId, payPeriodStart, payPeriodEnd } = req.query;

    if (!companyId || !payPeriodStart || !payPeriodEnd) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['companyId', 'payPeriodStart', 'payPeriodEnd']
      });
    }

    // Validate date parameters
    const startDate = new Date(String(payPeriodStart));
    const endDate = new Date(String(payPeriodEnd));

    if (isNaN(startDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'payPeriodStart must be a valid date (ISO 8601 format recommended)'
      });
    }

    if (isNaN(endDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'payPeriodEnd must be a valid date (ISO 8601 format recommended)'
      });
    }

    if (startDate >= endDate) {
      return res.status(400).json({
        error: 'Invalid date range',
        message: 'payPeriodStart must be before payPeriodEnd'
      });
    }

    // Multi-tenant check
    if (!hasCompanyAccess(req, String(companyId))) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    const status = await getPayrollLockStatus(
      String(companyId),
      startDate,
      endDate
    );

    res.json(status);
  } catch (error) {
    logger.error('Error checking payroll lock status:', error);
    res.status(500).json({ error: 'Failed to check lock status' });
  }
});

export default router;
