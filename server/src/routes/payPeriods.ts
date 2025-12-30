import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { AuthRequest, authorizeRoles, hasCompanyAccess } from '../middleware/auth.js';
import { logger } from '../services/logger.js';

const router = Router();

const payPeriodSchema = z.object({
  companyId: z.string(),
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().transform(str => new Date(str)),
  payDate: z.string().transform(str => new Date(str))
}).refine(
  data => data.startDate < data.endDate,
  { message: 'Pay period start must be before pay period end', path: ['startDate'] }
).refine(
  data => data.endDate <= data.payDate,
  { message: 'Pay date must be on or after pay period end', path: ['payDate'] }
);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { companyId, status } = req.query;

    const where: Record<string, unknown> = {};

    if (companyId) {
      if (!hasCompanyAccess(req, String(companyId))) {
        return res.status(403).json({ error: 'Access denied to this company' });
      }
      where.companyId = String(companyId);
    } else if (req.accessibleCompanyIds && req.accessibleCompanyIds.length > 0) {
      where.companyId = { in: req.accessibleCompanyIds };
    }

    if (status) {
      where.status = String(status);
    }

    const periods = await prisma.payPeriod.findMany({
      where,
      include: {
        company: {
          select: { id: true, name: true }
        },
        payrolls: {
          select: {
            grossPay: true,
            netPay: true
          }
        }
      },
      orderBy: { startDate: 'desc' }
    });

    const results = periods.map(period => {
      const totalGrossPay = period.payrolls.reduce((sum, payroll) => sum + Number(payroll.grossPay), 0);
      const totalNetPay = period.payrolls.reduce((sum, payroll) => sum + Number(payroll.netPay), 0);

      return {
        id: period.id,
        company: period.company,
        startDate: period.startDate,
        endDate: period.endDate,
        payDate: period.payDate,
        status: period.status,
        employeeCount: period.payrolls.length,
        totalGrossPay: Math.round(totalGrossPay * 100) / 100,
        totalNetPay: Math.round(totalNetPay * 100) / 100
      };
    });

    res.json({
      count: results.length,
      payPeriods: results
    });
  } catch (error) {
    logger.error('Error fetching pay periods:', error);
    res.status(500).json({ error: 'Failed to fetch pay periods' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const period = await prisma.payPeriod.findUnique({
      where: { id: req.params.id },
      include: {
        company: {
          select: { id: true, name: true, ein: true }
        },
        payrolls: {
          include: {
            employee: {
              select: { id: true, firstName: true, lastName: true, department: true }
            }
          }
        }
      }
    });

    if (!period) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    if (!hasCompanyAccess(req, period.companyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const summary = {
      totalEmployees: period.payrolls.length,
      totalGrossPay: 0,
      totalNetPay: 0,
      totalFederalTax: 0,
      totalStateTax: 0,
      totalLocalTax: 0,
      totalSocialSecurity: 0,
      totalMedicare: 0,
      total401k: 0,
      totalEmployerTax: 0
    };

    const payrolls = period.payrolls.map(payroll => {
      summary.totalGrossPay += Number(payroll.grossPay);
      summary.totalNetPay += Number(payroll.netPay);
      summary.totalFederalTax += Number(payroll.federalWithholding);
      summary.totalStateTax += Number(payroll.stateWithholding);
      summary.totalLocalTax += Number(payroll.localWithholding);
      summary.totalSocialSecurity += Number(payroll.socialSecurity);
      summary.totalMedicare += Number(payroll.medicare);
      summary.total401k += Number(payroll.retirement401k);
      summary.totalEmployerTax += Number(payroll.totalEmployerTax);

      return {
        id: payroll.id,
        employee: payroll.employee,
        grossPay: Number(payroll.grossPay),
        netPay: Number(payroll.netPay),
        federalWithholding: Number(payroll.federalWithholding),
        stateWithholding: Number(payroll.stateWithholding),
        localWithholding: Number(payroll.localWithholding),
        socialSecurity: Number(payroll.socialSecurity),
        medicare: Number(payroll.medicare),
        retirement401k: Number(payroll.retirement401k),
        totalDeductions: Number(payroll.totalDeductions)
      };
    });

    for (const key of Object.keys(summary) as (keyof typeof summary)[]) {
      if (key !== 'totalEmployees') {
        summary[key] = Math.round(summary[key] * 100) / 100;
      }
    }

    res.json({
      id: period.id,
      company: period.company,
      startDate: period.startDate,
      endDate: period.endDate,
      payDate: period.payDate,
      status: period.status,
      workflow: {
        submittedBy: period.submittedBy,
        submittedAt: period.submittedAt,
        approvedBy: period.approvedBy,
        approvedAt: period.approvedAt,
        rejectedBy: period.rejectedBy,
        rejectedAt: period.rejectedAt,
        rejectionNote: period.rejectionNote
      },
      summary,
      payrolls
    });
  } catch (error) {
    logger.error('Error fetching pay period details:', error);
    res.status(500).json({ error: 'Failed to fetch pay period details' });
  }
});

router.post('/', authorizeRoles('ADMIN', 'ACCOUNTANT', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const data = payPeriodSchema.parse(req.body);

    if (!hasCompanyAccess(req, data.companyId)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    const existing = await prisma.payPeriod.findFirst({
      where: {
        companyId: data.companyId,
        startDate: data.startDate,
        endDate: data.endDate
      }
    });

    if (existing) {
      const updated = await prisma.payPeriod.update({
        where: { id: existing.id },
        data: {
          payDate: data.payDate
        }
      });

      return res.json({
        message: 'Pay period already exists',
        payPeriod: updated
      });
    }

    const payPeriod = await prisma.payPeriod.create({
      data: {
        companyId: data.companyId,
        startDate: data.startDate,
        endDate: data.endDate,
        payDate: data.payDate,
        status: 'DRAFT'
      }
    });

    res.status(201).json({
      message: 'Pay period created',
      payPeriod
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Error creating pay period:', error);
    res.status(500).json({ error: 'Failed to create pay period' });
  }
});

export default router;
