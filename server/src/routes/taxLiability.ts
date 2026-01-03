import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index.js';
import { z } from 'zod';
import { AuthRequest, hasCompanyAccess, authorizeRoles } from '../middleware/auth.js';
import { logger } from '../services/logger.js';

const router = Router();

/**
 * Social Security wage cap by year
 * Source: Social Security Administration
 */
const SOCIAL_SECURITY_WAGE_CAP: Record<number, number> = {
  2023: 160200,
  2024: 168600,
  2025: 176100
};

// Type for payroll records
type PayrollRecord = Prisma.PayrollGetPayload<object>;

/**
 * Round to 2 decimal places
 */
const round = (n: number) => Math.round(n * 100) / 100;

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
    const ssWageCap = SOCIAL_SECURITY_WAGE_CAP[query.year] || 168600;

    // Get YTD wages for all employees up to the start of the quarter
    const yearStart = new Date(query.year, 0, 1);
    const priorToQuarterPayrolls = await prisma.payroll.findMany({
      where: {
        companyId: query.companyId,
        payDate: {
          gte: yearStart,
          lt: start
        },
        status: { not: 'VOID' }
      },
      select: {
        employeeId: true,
        grossPay: true
      }
    });

    // Calculate YTD wages before this quarter for each employee
    const employeeYTDBeforeQuarter = new Map<string, number>();
    for (const payroll of priorToQuarterPayrolls) {
      const existing = employeeYTDBeforeQuarter.get(payroll.employeeId) || 0;
      employeeYTDBeforeQuarter.set(payroll.employeeId, existing + Number(payroll.grossPay));
    }

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

    // Track per-employee YTD during quarter for wage cap calculation
    const employeeYTD = new Map<string, number>(employeeYTDBeforeQuarter);

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

      // Calculate Social Security taxable wages considering wage cap
      const ytdBefore = employeeYTD.get(payroll.employeeId) || 0;
      let ssTaxableWages = 0;

      if (ytdBefore < ssWageCap) {
        // Employee hasn't hit the cap yet
        ssTaxableWages = Math.min(grossPay, ssWageCap - ytdBefore);
      }
      // If ytdBefore >= ssWageCap, employee already exceeded cap, so ssTaxableWages = 0

      // Update employee YTD
      employeeYTD.set(payroll.employeeId, ytdBefore + grossPay);

      // Total employer + employee FICA
      const totalSSForPeriod = socialSecurity + employerSS;
      const totalMedicareForPeriod = medicare + employerMedicare;
      const liability = federalWithholding + totalSSForPeriod + totalMedicareForPeriod;

      totalWages += grossPay;
      totalFederalWithholding += federalWithholding;
      totalSocialSecurityWages += ssTaxableWages; // Now properly considers wage cap
      totalSocialSecurityTax += totalSSForPeriod;
      totalMedicareWages += grossPay; // Medicare has no wage cap
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
    const uniqueEmployees = new Set(payrolls.map((p: { employeeId: string }) => p.employeeId)).size;

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
    logger.error('Error generating 941 report:', error);
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
        uniqueEmployees: new Set(payrolls.map((p: { employeeId: string }) => p.employeeId)).size
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Error generating state withholding report:', error);
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

      const monthPayrolls = payrolls.filter((p: PayrollRecord) => {
        const payDate = new Date(p.payDate);
        return payDate >= monthStart && payDate <= monthEnd;
      });

      const monthLiability = monthPayrolls.reduce((sum: number, p: PayrollRecord) => {
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
    logger.error('Error generating deposit schedule:', error);
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

    const roundDecimal = (n: unknown) => Math.round(Number(n || 0) * 100) / 100;

    const federalWithholding = roundDecimal(aggregation._sum.federalWithholding);
    const employeeSS = roundDecimal(aggregation._sum.socialSecurity);
    const employerSS = roundDecimal(aggregation._sum.employerSocialSecurity);
    const employeeMedicare = roundDecimal(aggregation._sum.medicare);
    const employerMedicare = roundDecimal(aggregation._sum.employerMedicare);
    const futa = roundDecimal(aggregation._sum.employerFuta);
    const suta = roundDecimal(aggregation._sum.employerSuta);
    const stateWithholding = roundDecimal(aggregation._sum.stateWithholding);
    const stateDisability = roundDecimal(aggregation._sum.stateDisability);
    const localWithholding = roundDecimal(aggregation._sum.localWithholding);

    const totalFICA = employeeSS + employerSS + employeeMedicare + employerMedicare;
    const form941Liability = federalWithholding + totalFICA;
    const totalFederalLiability = form941Liability + futa;
    const totalStateLiability = stateWithholding + stateDisability + suta + localWithholding;

    res.json({
      period: periodType,
      dateRange: { start, end },

      grossWages: roundDecimal(aggregation._sum.grossPay),
      tips: {
        creditCard: roundDecimal(aggregation._sum.creditCardTips),
        cash: roundDecimal(aggregation._sum.cashTips),
        total: roundDecimal(Number(aggregation._sum.creditCardTips || 0) + Number(aggregation._sum.cashTips || 0))
      },

      federal: {
        form941: {
          federalWithholding,
          socialSecurity: {
            employee: employeeSS,
            employer: employerSS,
            total: roundDecimal(employeeSS + employerSS)
          },
          medicare: {
            employee: employeeMedicare,
            employer: employerMedicare,
            total: roundDecimal(employeeMedicare + employerMedicare)
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
    logger.error('Error generating tax liability summary:', error);
    res.status(500).json({ error: 'Failed to generate tax liability summary' });
  }
});

/**
 * FUTA wage base limits by year
 */
const FUTA_WAGE_BASE: Record<number, number> = {
  2023: 7000,
  2024: 7000,
  2025: 7000
};

/**
 * GET /api/tax-liability/940
 * Get Form 940 (Employer's Annual Federal Unemployment Tax Return) data
 *
 * Query params:
 * - companyId: Company ID
 * - year: Tax year
 */
router.get('/940', authorizeRoles('ADMIN', 'ACCOUNTANT'), async (req: AuthRequest, res: Response) => {
  try {
    const query = z.object({
      companyId: z.string(),
      year: z.coerce.number().int().min(2020).max(2100)
    }).parse(req.query);

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
        sutaRate: true
      }
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const yearStart = new Date(query.year, 0, 1);
    const yearEnd = new Date(query.year, 11, 31, 23, 59, 59);
    const futaWageBase = FUTA_WAGE_BASE[query.year] || 7000;

    // Get all payrolls for the year
    const payrolls = await prisma.payroll.findMany({
      where: {
        companyId: query.companyId,
        payDate: { gte: yearStart, lte: yearEnd },
        status: { not: 'VOID' }
      },
      select: {
        employeeId: true,
        grossPay: true,
        employerFuta: true,
        payDate: true
      },
      orderBy: { payDate: 'asc' }
    });

    // Calculate FUTA taxable wages per employee (capped at $7,000)
    const employeeWages = new Map<string, { total: number; taxable: number; futa: number }>();
    const quarterlyFuta: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const quarterlyWages: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

    for (const payroll of payrolls) {
      const gross = Number(payroll.grossPay);
      const futa = Number(payroll.employerFuta);
      const quarter = Math.ceil((new Date(payroll.payDate).getMonth() + 1) / 3);

      // Track per-employee wages
      const existing = employeeWages.get(payroll.employeeId) || { total: 0, taxable: 0, futa: 0 };
      const previousTotal = existing.total;
      const newTotal = previousTotal + gross;

      // Calculate taxable wages (up to FUTA wage base)
      let taxableThisPeriod = 0;
      if (previousTotal < futaWageBase) {
        taxableThisPeriod = Math.min(gross, futaWageBase - previousTotal);
      }

      employeeWages.set(payroll.employeeId, {
        total: newTotal,
        taxable: existing.taxable + taxableThisPeriod,
        futa: existing.futa + futa
      });

      quarterlyFuta[quarter] += futa;
      quarterlyWages[quarter] += gross;
    }

    // Calculate totals
    let totalWages = 0;
    let totalFutaTaxableWages = 0;
    let totalFutaTax = 0;

    for (const [, data] of employeeWages) {
      totalWages += data.total;
      totalFutaTaxableWages += data.taxable;
      totalFutaTax += data.futa;
    }

    // FUTA tax rate is 6.0%, but most employers get a 5.4% credit for paying state unemployment
    // Net FUTA rate is typically 0.6%
    const futaGrossRate = 0.06;
    const stateUnemploymentCredit = 0.054; // Maximum credit
    const futaNetRate = futaGrossRate - stateUnemploymentCredit;

    // Calculate expected FUTA (at net rate)
    const expectedFutaTax = round(totalFutaTaxableWages * futaNetRate);

    // Employees who exceeded wage base
    const employeesExceedingBase = Array.from(employeeWages.entries())
      .filter(([, data]) => data.total > futaWageBase)
      .length;

    // Count unique employees
    const totalEmployees = employeeWages.size;

    // Quarterly liability breakdown
    const quarterlyLiability = [1, 2, 3, 4].map(q => ({
      quarter: q,
      totalWages: round(quarterlyWages[q]),
      futaTax: round(quarterlyFuta[q]),
      cumulativeFuta: round([1, 2, 3, 4].slice(0, q).reduce((sum, qtr) => sum + quarterlyFuta[qtr], 0))
    }));

    // Form 940 line items
    const form940 = {
      // Part 1: Tell us about your return
      taxYear: query.year,
      stateCode: company.state,

      // Part 2: Determine your FUTA tax before adjustments
      line3_totalPayments: round(totalWages),
      line4_exemptPayments: 0, // Would need to track exempt payments
      line5_totalExempt: 0,
      line6_totalTaxableWages: round(totalFutaTaxableWages),
      line7_futaTaxBeforeAdjustments: round(totalFutaTaxableWages * futaGrossRate),

      // Part 3: Determine your adjustments
      line9_stateUnemploymentCredit: round(totalFutaTaxableWages * stateUnemploymentCredit),
      line10_creditReductionStates: 0, // Credit reduction for states with outstanding loans

      // Part 4: Determine your FUTA tax and balance due
      line12_totalFutaTax: round(totalFutaTax),
      line13_depositsForYear: round(totalFutaTax), // Assumes all deposited
      line14_balanceDue: 0,
      line15_overpayment: 0,

      // Part 5: Report your FUTA tax liability by quarter
      quarterlyLiability
    };

    res.json({
      form: '940',
      formTitle: "Employer's Annual Federal Unemployment (FUTA) Tax Return",
      taxYear: query.year,

      company: {
        name: company.name,
        ein: company.ein,
        address: `${company.address}, ${company.city}, ${company.state} ${company.zipCode}`,
        sutaRate: company.sutaRate ? Number(company.sutaRate) : null
      },

      summary: {
        totalEmployees,
        employeesExceedingWageBase: employeesExceedingBase,
        futaWageBase,
        totalWages: round(totalWages),
        totalFutaTaxableWages: round(totalFutaTaxableWages),
        wagesExceedingBase: round(totalWages - totalFutaTaxableWages),
        futaGrossRate: `${(futaGrossRate * 100).toFixed(1)}%`,
        stateUnemploymentCredit: `${(stateUnemploymentCredit * 100).toFixed(1)}%`,
        futaNetRate: `${(futaNetRate * 100).toFixed(1)}%`,
        totalFutaTax: round(totalFutaTax),
        expectedFutaTax
      },

      form940,

      quarterlyBreakdown: quarterlyLiability,

      // Deposit schedule: FUTA deposits due by end of month following quarter
      // if liability exceeds $500
      depositSchedule: [
        { quarter: 1, dueDate: `${query.year}-04-30`, liability: round(quarterlyFuta[1]) },
        { quarter: 2, dueDate: `${query.year}-07-31`, liability: round(quarterlyFuta[2]) },
        { quarter: 3, dueDate: `${query.year}-10-31`, liability: round(quarterlyFuta[3]) },
        { quarter: 4, dueDate: `${query.year + 1}-01-31`, liability: round(quarterlyFuta[4]) }
      ],

      filingDeadline: `${query.year + 1}-01-31`,
      notes: [
        'Form 940 is due January 31 following the tax year',
        'If all FUTA tax was deposited on time, you have until February 10 to file',
        `FUTA wage base for ${query.year}: $${futaWageBase.toLocaleString()}`,
        'Deposit FUTA tax quarterly if liability exceeds $500'
      ]
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Error generating Form 940:', error);
    res.status(500).json({ error: 'Failed to generate Form 940' });
  }
});

export default router;
