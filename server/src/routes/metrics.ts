import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { subMonths, format, startOfMonth, endOfMonth } from 'date-fns';
import { Decimal } from 'decimal.js';
import { AppError } from '../utils/AppError.js';

// Assuming you have an auth middleware available
// import { hasCompanyAccess, AuthRequest } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/metrics/cost-trend
// Note: Ensure you add authentication middleware here
router.get('/cost-trend', async (req: Request, res: Response) => {
  const { companyId } = req.query;
  
  if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
  }

  // Get data for the last 6 months
  const sixMonthsAgo = subMonths(new Date(), 6);

  const payrolls = await prisma.payroll.groupBy({
    by: ['payPeriodEnd'],
    where: {
      companyId: String(companyId),
      payPeriodEnd: { gte: sixMonthsAgo }
    },
    _sum: {
      grossPay: true,
      totalEmployerTax: true // Using the specific field from your schema
    },
    orderBy: {
      payPeriodEnd: 'asc'
    }
  });

  // Format for frontend charts with Decimal.js precision
  const data = payrolls.map(p => {
    const grossPay = new Decimal(p._sum.grossPay || 0);
    const employerTax = new Decimal(p._sum.totalEmployerTax || 0);
    const totalCost = grossPay.plus(employerTax);

    return {
      date: format(p.payPeriodEnd, 'MMM yyyy'),
      grossPay: grossPay.toNumber(),
      employerTaxes: employerTax.toNumber(),
      totalCost: totalCost.toNumber()
    };
  });

  res.json(data);
});

// GET /api/metrics/headcount
router.get('/headcount', async (req: Request, res: Response) => {
  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({ error: 'Company ID required' });
  }

  const activeEmployees = await prisma.employee.count({
    where: {
      companyId: String(companyId),
      terminationDate: null
    }
  });

  const totalEmployees = await prisma.employee.count({
    where: {
      companyId: String(companyId)
    }
  });

  res.json({
    active: activeEmployees,
    total: totalEmployees,
    terminated: totalEmployees - activeEmployees
  });
});

// GET /api/metrics/department-breakdown
router.get('/department-breakdown', async (req: Request, res: Response) => {
  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({ error: 'Company ID required' });
  }

  const departmentData = await prisma.employee.groupBy({
    by: ['department'],
    where: {
      companyId: String(companyId),
      terminationDate: null
    },
    _count: {
      id: true
    }
  });

  const data = departmentData.map(d => ({
    department: d.department || 'Unassigned',
    count: d._count.id
  }));

  res.json(data);
});

// GET /api/metrics/payroll-summary
router.get('/payroll-summary', async (req: Request, res: Response) => {
  const { companyId, startDate, endDate } = req.query;

  if (!companyId) {
    return res.status(400).json({ error: 'Company ID required' });
  }

  const currentMonth = new Date();
  const start = startDate ? new Date(startDate as string) : startOfMonth(currentMonth);
  const end = endDate ? new Date(endDate as string) : endOfMonth(currentMonth);

  const payrollSummary = await prisma.payroll.aggregate({
    where: {
      companyId: String(companyId),
      payPeriodEnd: {
        gte: start,
        lte: end
      }
    },
    _sum: {
      grossPay: true,
      netPay: true,
      federalWithholding: true,
      socialSecurity: true,
      medicare: true,
      stateWithholding: true,
      localWithholding: true,
      totalEmployerTax: true
    },
    _count: {
      id: true
    }
  });

  const grossPay = new Decimal(payrollSummary._sum.grossPay || 0);
  const netPay = new Decimal(payrollSummary._sum.netPay || 0);
  const employeeTaxes = new Decimal(payrollSummary._sum.federalWithholding || 0)
    .plus(payrollSummary._sum.socialSecurity || 0)
    .plus(payrollSummary._sum.medicare || 0)
    .plus(payrollSummary._sum.stateWithholding || 0)
    .plus(payrollSummary._sum.localWithholding || 0);
  const employerTaxes = new Decimal(payrollSummary._sum.totalEmployerTax || 0);
  const totalCost = grossPay.plus(employerTaxes);

  res.json({
    period: {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    },
    payrollCount: payrollSummary._count.id,
    grossPay: grossPay.toFixed(2),
    netPay: netPay.toFixed(2),
    employeeTaxes: employeeTaxes.toFixed(2),
    employerTaxes: employerTaxes.toFixed(2),
    totalCost: totalCost.toFixed(2)
  });
});

// GET /api/metrics/top-earners
router.get('/top-earners', async (req: Request, res: Response) => {
  const { companyId, limit = '10' } = req.query;

  if (!companyId) {
    return res.status(400).json({ error: 'Company ID required' });
  }

  const currentMonth = new Date();
  const start = startOfMonth(currentMonth);
  const end = endOfMonth(currentMonth);

  const topEarners = await prisma.payroll.groupBy({
    by: ['employeeId'],
    where: {
      companyId: String(companyId),
      payPeriodEnd: {
        gte: start,
        lte: end
      }
    },
    _sum: {
      grossPay: true
    },
    orderBy: {
      _sum: {
        grossPay: 'desc'
      }
    },
    take: parseInt(limit as string)
  });

  // Fetch employee names
  const employeeIds = topEarners.map(e => e.employeeId);
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, firstName: true, lastName: true, department: true }
  });

  const employeeMap = new Map(employees.map(e => [e.id, e]));

  const data = topEarners.map(e => {
    const employee = employeeMap.get(e.employeeId);
    return {
      employeeId: e.employeeId,
      name: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown',
      department: employee?.department || 'N/A',
      grossPay: new Decimal(e._sum.grossPay || 0).toFixed(2)
    };
  });

  res.json(data);
});

export default router;