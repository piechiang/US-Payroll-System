import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { z } from 'zod';
import { AuthRequest, hasCompanyAccess, authorizeRoles } from '../middleware/auth.js';

const router = Router();

/**
 * Federal Tax Deposit Schedule Types
 * - MONTHLY: Deposits due by the 15th of the following month
 * - SEMIWEEKLY: Deposits due Wednesday (for Wed-Fri paydays) or Friday (for Sat-Tue paydays)
 */
type DepositSchedule = 'MONTHLY' | 'SEMIWEEKLY';

/**
 * Calculate the deposit due date based on pay date and schedule
 */
function calculateDepositDueDate(payDate: Date, schedule: DepositSchedule): Date {
  const dueDate = new Date(payDate);

  if (schedule === 'MONTHLY') {
    // Due by the 15th of the following month
    dueDate.setMonth(dueDate.getMonth() + 1);
    dueDate.setDate(15);
  } else {
    // SEMIWEEKLY
    const dayOfWeek = payDate.getDay(); // 0 = Sunday, 6 = Saturday

    if (dayOfWeek >= 3 && dayOfWeek <= 5) {
      // Wednesday, Thursday, Friday -> Due following Wednesday
      const daysUntilWednesday = (10 - dayOfWeek) % 7 || 7;
      dueDate.setDate(dueDate.getDate() + daysUntilWednesday);
    } else {
      // Saturday, Sunday, Monday, Tuesday -> Due following Friday
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
      dueDate.setDate(dueDate.getDate() + daysUntilFriday);
    }
  }

  return dueDate;
}

/**
 * Get the quarter dates for a given year and quarter
 */
function getQuarterDates(year: number, quarter: number): { start: Date; end: Date } {
  const quarterStartMonth = (quarter - 1) * 3;
  const start = new Date(year, quarterStartMonth, 1);
  const end = new Date(year, quarterStartMonth + 3, 0); // Last day of quarter
  return { start, end };
}

// Validation schema for period query
const periodQuerySchema = z.object({
  companyId: z.string(),
  year: z.coerce.number().int().min(2020).max(2100),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  month: z.coerce.number().int().min(1).max(12).optional()
});

/**
 * GET /api/tax-liability/941
 * Get Form 941 (Employer's Quarterly Federal Tax Return) data
 *
 * Query params:
 * - companyId: Company ID
 * - year: Tax year
 * - quarter: Quarter (1-4)
 */
router.get('/941', authorizeRoles('ADMIN', 'ACCOUNTANT', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const query = periodQuerySchema.parse(req.query);

    if (!query.quarter) {
      return res.status(400).json({ error: 'Quarter is required for Form 941' });
    }

    // Multi-tenant check
    if (!hasCompanyAccess(req, query.companyId)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    // Get company info
    const company = await prisma.company.findUnique({
      where: { id: query.companyId },
      select: {
        id: true,
        name: true,
        ein: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        federalDepositSchedule: true
      }
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const { start, end } = getQuarterDates(query.year, query.quarter);

    // Get all payrolls for the quarter
    const payrolls = await prisma.payroll.findMany({
      where: {
        companyId: query.companyId,
        payDate: {
          gte: start,
          lte: end
        },
        status: { not: 'VOID' }
      },
      include: {
        employee: {
          select: { firstName: true, lastName: true }
        }
      },
      orderBy: { payDate: 'asc' }
    });

    // Calculate totals
    let totalWages = 0;
    let totalFederalWithholding = 0;
    let totalSocialSecurityWages = 0;
    let totalSocialSecurityTax = 0;
    let totalMedicareWages = 0;
    let totalMedicareTax = 0;
    let totalTips = 0;

    // Group by month for monthly depositors
    const monthlyLiability: Record<number, number> = { 1: 0, 2: 0, 3: 0 };

    // Group by pay date for semi-weekly depositors
    const depositSchedule: Array<{
      payDate: Date;
      dueDate: Date;
      liability: number;
      federalWithholding: number;
      socialSecurityTax: number;
      medicareTax: number;
    }> = [];

    for (const payroll of payrolls) {
      const grossPay = Number(payroll.grossPay);
      const federalWithholding = Number(payroll.federalWithholding);
      const socialSecurity = Number(payroll.socialSecurity);
      const medicare = Number(payroll.medicare);
      const employerSS = Number(payroll.employerSocialSecurity);
      const employerMedicare = Number(payroll.employerMedicare);
      const creditCardTips = Number(payroll.creditCardTips || 0);
      const cashTips = Number(payroll.cashTips || 0);

      // Total employer + employee FICA
      const totalSSForPeriod = socialSecurity + employerSS;
      const totalMedicareForPeriod = medicare + employerMedicare;
      const liability = federalWithholding + totalSSForPeriod + totalMedicareForPeriod;

      totalWages += grossPay;
      totalFederalWithholding += federalWithholding;
      totalSocialSecurityWages += grossPay; // Simplified - should consider wage cap
      totalSocialSecurityTax += totalSSForPeriod;
      totalMedicareWages += grossPay;
      totalMedicareTax += totalMedicareForPeriod;
      totalTips += creditCardTips + cashTips;

      // Determine month within quarter (1, 2, or 3)
      const payMonth = new Date(payroll.payDate).getMonth();
      const quarterStartMonth: number = (query.quarter! - 1) * 3;
      const monthInQuarter = payMonth - quarterStartMonth + 1;
      if (monthInQuarter >= 1 && monthInQuarter <= 3) {
        monthlyLiability[monthInQuarter] += liability;
      }

      // Build deposit schedule
      const dueDate = calculateDepositDueDate(
        new Date(payroll.payDate),
        company.federalDepositSchedule as DepositSchedule
      );

      depositSchedule.push({
        payDate: payroll.payDate,
        dueDate,
        liability,
        federalWithholding,
        socialSecurityTax: totalSSForPeriod,
        medicareTax: totalMedicareForPeriod
      });
    }

    // Get unique employee count
    const uniqueEmployees = new Set(payrolls.map(p => p.employeeId)).size;

    // Total tax liability
    const totalTaxLiability = totalFederalWithholding + totalSocialSecurityTax + totalMedicareTax;

    // Round all values
    const round = (n: number) => Math.round(n * 100) / 100;

    res.json({
      form: '941',
      period: {
        year: query.year,
        quarter: query.quarter,
        startDate: start,
        endDate: end
      },
      company: {
        name: company.name,
        ein: company.ein,
        address: `${company.address}, ${company.city}, ${company.state} ${company.zipCode}`,
        depositSchedule: company.federalDepositSchedule
      },

      // Part 1: Answer questions
      employeeCount: uniqueEmployees,

      // Line 2: Total wages, tips, and other compensation
      totalWages: round(totalWages),

      // Line 3: Federal income tax withheld
      federalIncomeTaxWithheld: round(totalFederalWithholding),

      // Line 5a: Taxable social security wages
      socialSecurityWages: round(totalSocialSecurityWages),
      socialSecurityTax: round(totalSocialSecurityTax),

      // Line 5b: Taxable social security tips
      socialSecurityTips: round(totalTips),

      // Line 5c: Taxable Medicare wages & tips
      medicareWages: round(totalMedicareWages),
      medicareTax: round(totalMedicareTax),

      // Line 6: Total taxes before adjustments
      totalTaxBeforeAdjustments: round(totalTaxLiability),

      // Line 10: Total taxes after adjustments (same as line 6 if no adjustments)
      totalTaxAfterAdjustments: round(totalTaxLiability),

      // Part 2: Deposit schedule
      depositScheduleType: company.federalDepositSchedule,
      monthlyLiability: company.federalDepositSchedule === 'MONTHLY' ? {
        month1: round(monthlyLiability[1]),
        month2: round(monthlyLiability[2]),
        month3: round(monthlyLiability[3]),
        total: round(monthlyLiability[1] + monthlyLiability[2] + monthlyLiability[3])
      } : null,

      // Semi-weekly deposit details
      semiweeklyDeposits: company.federalDepositSchedule === 'SEMIWEEKLY' ? depositSchedule.map(d => ({
        payDate: d.payDate,
        dueDate: d.dueDate,
        liability: round(d.liability),
        breakdown: {
          federalWithholding: round(d.federalWithholding),
          socialSecurityTax: round(d.socialSecurityTax),
          medicareTax: round(d.medicareTax)
        }
      })) : null,

      // Summary
      summary: {
        totalLiability: round(totalTaxLiability),
        payrollCount: payrolls.length,
        employeeCount: uniqueEmployees
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error generating 941 report:', error);
    res.status(500).json({ error: 'Failed to generate Form 941 report' });
  }
});

/**
 * GET /api/tax-liability/state-withholding
 * Get state income tax withholding liability report
 */
router.get('/state-withholding', authorizeRoles('ADMIN', 'ACCOUNTANT', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const query = periodQuerySchema.parse(req.query);

    // Multi-tenant check
    if (!hasCompanyAccess(req, query.companyId)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    // Get company info
    const company = await prisma.company.findUnique({
      where: { id: query.companyId },
      select: {
        id: true,
        name: true,
        ein: true,
        state: true,
        stateWithholdingId: true,
        stateUnemploymentId: true
      }
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Determine date range
    let start: Date, end: Date;
    if (query.quarter) {
      const dates = getQuarterDates(query.year, query.quarter);
      start = dates.start;
      end = dates.end;
    } else if (query.month) {
      start = new Date(query.year, query.month - 1, 1);
      end = new Date(query.year, query.month, 0);
    } else {
      // Full year
      start = new Date(query.year, 0, 1);
      end = new Date(query.year, 11, 31);
    }

    // Get all payrolls for the period
    const payrolls = await prisma.payroll.findMany({
      where: {
        companyId: query.companyId,
        payDate: {
          gte: start,
          lte: end
        },
        status: { not: 'VOID' }
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            state: true
          }
        }
      },
      orderBy: { payDate: 'asc' }
    });

    // Group by state
    const stateBreakdown: Record<string, {
      stateWithholding: number;
      stateDisability: number;
      stateUnemployment: number;
      localWithholding: number;
      grossWages: number;
      employeeCount: Set<string>;
      payrollCount: number;
    }> = {};

    for (const payroll of payrolls) {
      const state = payroll.employee.state;

      if (!stateBreakdown[state]) {
        stateBreakdown[state] = {
          stateWithholding: 0,
          stateDisability: 0,
          stateUnemployment: 0,
          localWithholding: 0,
          grossWages: 0,
          employeeCount: new Set(),
          payrollCount: 0
        };
      }

      stateBreakdown[state].stateWithholding += Number(payroll.stateWithholding);
      stateBreakdown[state].stateDisability += Number(payroll.stateDisability || 0);
      stateBreakdown[state].stateUnemployment += Number(payroll.stateUnemployment || 0);
      stateBreakdown[state].localWithholding += Number(payroll.localWithholding || 0);
      stateBreakdown[state].grossWages += Number(payroll.grossPay);
      stateBreakdown[state].employeeCount.add(payroll.employee.id);
      stateBreakdown[state].payrollCount++;
    }

    // Convert to array and round values
    const round = (n: number) => Math.round(n * 100) / 100;

    const stateReports = Object.entries(stateBreakdown).map(([state, data]) => ({
      state,
      grossWages: round(data.grossWages),
      stateWithholding: round(data.stateWithholding),
      stateDisability: round(data.stateDisability),
      stateUnemployment: round(data.stateUnemployment),
      localWithholding: round(data.localWithholding),
      totalStateTaxes: round(
        data.stateWithholding + data.stateDisability + data.stateUnemployment + data.localWithholding
      ),
      employeeCount: data.employeeCount.size,
      payrollCount: data.payrollCount
    })).sort((a, b) => b.stateWithholding - a.stateWithholding);

    // Calculate totals
    const totals = stateReports.reduce((acc, state) => ({
      grossWages: acc.grossWages + state.grossWages,
      stateWithholding: acc.stateWithholding + state.stateWithholding,
      stateDisability: acc.stateDisability + state.stateDisability,
      stateUnemployment: acc.stateUnemployment + state.stateUnemployment,
      localWithholding: acc.localWithholding + state.localWithholding,
      totalStateTaxes: acc.totalStateTaxes + state.totalStateTaxes
    }), {
      grossWages: 0,
      stateWithholding: 0,
      stateDisability: 0,
      stateUnemployment: 0,
      localWithholding: 0,
      totalStateTaxes: 0
    });

    res.json({
      report: 'State Withholding Liability',
      period: {
        year: query.year,
        quarter: query.quarter || null,
        month: query.month || null,
        startDate: start,
        endDate: end
      },
      company: {
        name: company.name,
        ein: company.ein,
        primaryState: company.state,
        stateWithholdingId: company.stateWithholdingId,
        stateUnemploymentId: company.stateUnemploymentId
      },
      stateBreakdown: stateReports,
      totals: {
        grossWages: round(totals.grossWages),
        stateWithholding: round(totals.stateWithholding),
        stateDisability: round(totals.stateDisability),
        stateUnemployment: round(totals.stateUnemployment),
        localWithholding: round(totals.localWithholding),
        totalStateTaxes: round(totals.totalStateTaxes)
      },
      summary: {
        stateCount: stateReports.length,
        totalPayrolls: payrolls.length,
        uniqueEmployees: new Set(payrolls.map(p => p.employeeId)).size
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error generating state withholding report:', error);
    res.status(500).json({ error: 'Failed to generate state withholding report' });
  }
});

/**
 * GET /api/tax-liability/deposit-schedule
 * Get upcoming tax deposit due dates and amounts
 */
router.get('/deposit-schedule', authorizeRoles('ADMIN', 'ACCOUNTANT', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }

    // Multi-tenant check
    if (!hasCompanyAccess(req, String(companyId))) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    // Get company info
    const company = await prisma.company.findUnique({
      where: { id: String(companyId) },
      select: {
        id: true,
        name: true,
        federalDepositSchedule: true
      }
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get payrolls from the last 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const payrolls = await prisma.payroll.findMany({
      where: {
        companyId: String(companyId),
        payDate: { gte: sixtyDaysAgo },
        status: { not: 'VOID' }
      },
      orderBy: { payDate: 'asc' }
    });

    const schedule = company.federalDepositSchedule as DepositSchedule;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate deposits
    const deposits: Array<{
      payDate: Date;
      dueDate: Date;
      federalLiability: number;
      isPastDue: boolean;
      isUpcoming: boolean;
    }> = [];

    for (const payroll of payrolls) {
      const federalWithholding = Number(payroll.federalWithholding);
      const socialSecurity = Number(payroll.socialSecurity) + Number(payroll.employerSocialSecurity);
      const medicare = Number(payroll.medicare) + Number(payroll.employerMedicare);
      const liability = federalWithholding + socialSecurity + medicare;

      const dueDate = calculateDepositDueDate(new Date(payroll.payDate), schedule);

      deposits.push({
        payDate: payroll.payDate,
        dueDate,
        federalLiability: Math.round(liability * 100) / 100,
        isPastDue: dueDate < today,
        isUpcoming: dueDate >= today
      });
    }

    // Separate past due and upcoming
    const pastDue = deposits.filter(d => d.isPastDue);
    const upcoming = deposits.filter(d => d.isUpcoming);

    // Monthly summary if applicable
    let monthlySummary = null;
    if (schedule === 'MONTHLY') {
      const currentMonth = new Date();
      const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

      const monthPayrolls = payrolls.filter(p => {
        const payDate = new Date(p.payDate);
        return payDate >= monthStart && payDate <= monthEnd;
      });

      const monthLiability = monthPayrolls.reduce((sum, p) => {
        return sum + Number(p.federalWithholding) +
          Number(p.socialSecurity) + Number(p.employerSocialSecurity) +
          Number(p.medicare) + Number(p.employerMedicare);
      }, 0);

      monthlySummary = {
        month: currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        liability: Math.round(monthLiability * 100) / 100,
        dueDate: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 15),
        payrollCount: monthPayrolls.length
      };
    }

    res.json({
      company: {
        name: company.name,
        depositSchedule: schedule
      },
      scheduleType: schedule,
      scheduleDescription: schedule === 'MONTHLY'
        ? 'Deposits are due by the 15th of the following month'
        : 'Deposits are due within 3 banking days of payday',

      monthlySummary,

      upcomingDeposits: upcoming.map(d => ({
        payDate: d.payDate,
        dueDate: d.dueDate,
        liability: d.federalLiability
      })),

      pastDueDeposits: pastDue.map(d => ({
        payDate: d.payDate,
        dueDate: d.dueDate,
        liability: d.federalLiability
      })),

      totals: {
        upcomingLiability: Math.round(upcoming.reduce((s, d) => s + d.federalLiability, 0) * 100) / 100,
        pastDueLiability: Math.round(pastDue.reduce((s, d) => s + d.federalLiability, 0) * 100) / 100
      }
    });
  } catch (error) {
    console.error('Error generating deposit schedule:', error);
    res.status(500).json({ error: 'Failed to generate deposit schedule' });
  }
});

/**
 * GET /api/tax-liability/summary
 * Get tax liability summary for a period
 */
router.get('/summary', authorizeRoles('ADMIN', 'ACCOUNTANT', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const query = periodQuerySchema.parse(req.query);

    // Multi-tenant check
    if (!hasCompanyAccess(req, query.companyId)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    // Determine date range
    let start: Date, end: Date;
    let periodType: string;

    if (query.quarter) {
      const dates = getQuarterDates(query.year, query.quarter);
      start = dates.start;
      end = dates.end;
      periodType = `Q${query.quarter} ${query.year}`;
    } else if (query.month) {
      start = new Date(query.year, query.month - 1, 1);
      end = new Date(query.year, query.month, 0);
      periodType = new Date(query.year, query.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
      start = new Date(query.year, 0, 1);
      end = new Date(query.year, 11, 31);
      periodType = `Year ${query.year}`;
    }

    // Aggregate payroll data
    const aggregation = await prisma.payroll.aggregate({
      where: {
        companyId: query.companyId,
        payDate: { gte: start, lte: end },
        status: { not: 'VOID' }
      },
      _sum: {
        grossPay: true,
        federalWithholding: true,
        socialSecurity: true,
        medicare: true,
        employerSocialSecurity: true,
        employerMedicare: true,
        employerFuta: true,
        employerSuta: true,
        stateWithholding: true,
        stateDisability: true,
        localWithholding: true,
        creditCardTips: true,
        cashTips: true
      },
      _count: true
    });

    const round = (n: unknown) => Math.round(Number(n || 0) * 100) / 100;

    const federalWithholding = round(aggregation._sum.federalWithholding);
    const employeeSS = round(aggregation._sum.socialSecurity);
    const employerSS = round(aggregation._sum.employerSocialSecurity);
    const employeeMedicare = round(aggregation._sum.medicare);
    const employerMedicare = round(aggregation._sum.employerMedicare);
    const futa = round(aggregation._sum.employerFuta);
    const suta = round(aggregation._sum.employerSuta);
    const stateWithholding = round(aggregation._sum.stateWithholding);
    const stateDisability = round(aggregation._sum.stateDisability);
    const localWithholding = round(aggregation._sum.localWithholding);

    const totalFICA = employeeSS + employerSS + employeeMedicare + employerMedicare;
    const form941Liability = federalWithholding + totalFICA;
    const totalFederalLiability = form941Liability + futa;
    const totalStateLiability = stateWithholding + stateDisability + suta + localWithholding;

    res.json({
      period: periodType,
      dateRange: { start, end },

      grossWages: round(aggregation._sum.grossPay),
      tips: {
        creditCard: round(aggregation._sum.creditCardTips),
        cash: round(aggregation._sum.cashTips),
        total: round(Number(aggregation._sum.creditCardTips || 0) + Number(aggregation._sum.cashTips || 0))
      },

      federal: {
        form941: {
          federalWithholding,
          socialSecurity: {
            employee: employeeSS,
            employer: employerSS,
            total: round(employeeSS + employerSS)
          },
          medicare: {
            employee: employeeMedicare,
            employer: employerMedicare,
            total: round(employeeMedicare + employerMedicare)
          },
          totalLiability: form941Liability
        },
        futa,
        totalFederalLiability
      },

      state: {
        withholding: stateWithholding,
        disability: stateDisability,
        unemployment: suta,
        local: localWithholding,
        totalStateLiability
      },

      grandTotal: round(totalFederalLiability + totalStateLiability),

      payrollCount: aggregation._count
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error generating tax liability summary:', error);
    res.status(500).json({ error: 'Failed to generate tax liability summary' });
  }
});

export default router;
