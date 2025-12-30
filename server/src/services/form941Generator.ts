/**
 * IRS Form 941 Generator
 * Employer's Quarterly Federal Tax Return
 *
 * Form 941 is used to report:
 * - Income taxes withheld from employee wages
 * - Social Security and Medicare taxes (FICA)
 * - Additional Medicare Tax withheld
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const prisma = new PrismaClient();

export interface Form941Data {
  // Header Information
  quarter: 1 | 2 | 3 | 4;
  year: number;

  // Employer Information
  ein: string;
  companyName: string;
  tradeNameDBA?: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;

  // Part 1: Answer these questions for this quarter
  line1: number;  // Number of employees who received wages, tips, or other compensation
  line2: number;  // Wages, tips, and other compensation
  line3: number;  // Federal income tax withheld from wages, tips, and other compensation
  line5a: number; // Taxable social security wages (wages × 0.124)
  line5b: number; // Taxable social security tips (tips × 0.124)
  line5c: number; // Taxable Medicare wages and tips (wages × 0.029)
  line5d: number; // Taxable wages & tips subject to Additional Medicare Tax withholding (wages × 0.009)
  line5e: number; // Total social security and Medicare taxes
  line5f: number; // Section 3121(q) Notice and Demand—Tax due on unreported tips
  line6: number;  // Total taxes before adjustments (line 3 + line 5e + line 5f)
  line7: number;  // Current quarter's adjustment for tips and group-term life insurance
  line8: number;  // Current quarter's adjustment for sick pay
  line9: number;  // Current quarter's adjustments for tips and group-term life insurance
  line10: number; // Total taxes after adjustments (line 6 + lines 7-9)
  line11a: number; // Qualified small business payroll tax credit for increasing research activities
  line11b: number; // Nonrefundable portion of credit for qualified sick and family leave wages
  line11c: number; // Reserved for future use
  line11d: number; // Nonrefundable portion of employee retention credit
  line12: number; // Total taxes after adjustments and credits (line 10 - lines 11a-11d)
  line13a: number; // Total deposits for this quarter
  line13b: number; // Reserved for future use
  line13c: number; // Refundable portion of credit for qualified sick and family leave wages
  line13d: number; // Refundable portion of employee retention credit
  line13e: number; // Reserved for future use
  line13f: number; // Total deposits and refundable credits (lines 13a + 13c + 13d)
  line14: number; // Balance due (line 12 - line 13f)
  line15: number; // Overpayment (line 13f - line 12)

  // Part 2: Tell us about your deposit schedule and tax liability for this quarter
  depositSchedule: 'MONTHLY' | 'SEMIWEEKLY';
  monthlyTaxLiability?: {
    month1: number;
    month2: number;
    month3: number;
  };

  // Additional metadata
  generatedAt: Date;
  preparedBy?: string;
}

/**
 * Generate Form 941 for a specific quarter
 */
export async function generateForm941(
  companyId: string,
  year: number,
  quarter: 1 | 2 | 3 | 4
): Promise<Form941Data> {
  logger.info('Generating Form 941', { companyId, year, quarter });

  // Calculate quarter date range
  const quarterMonths = {
    1: { start: 0, end: 2 },  // Jan-Mar
    2: { start: 3, end: 5 },  // Apr-Jun
    3: { start: 6, end: 8 },  // Jul-Sep
    4: { start: 9, end: 11 }, // Oct-Dec
  };

  const { start, end } = quarterMonths[quarter];
  const startDate = new Date(year, start, 1);
  const endDate = new Date(year, end + 1, 0, 23, 59, 59, 999);

  // Fetch company information
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  // Fetch payroll data for the quarter
  const payrolls = await prisma.payroll.findMany({
    where: {
      companyId,
      payDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      employee: {
        select: {
          id: true,
        },
      },
    },
  });

  // Calculate unique employees
  const uniqueEmployees = new Set(payrolls.map((p) => p.employeeId));
  const line1 = uniqueEmployees.size;

  // Calculate totals
  let totalWages = 0;
  let totalFederalWithholding = 0;
  let totalSocialSecurity = 0;
  let totalMedicare = 0;
  let totalTips = 0;

  payrolls.forEach((p) => {
    totalWages += Number(p.grossPay);
    totalFederalWithholding += Number(p.federalWithholding);
    totalSocialSecurity += Number(p.socialSecurity);
    totalMedicare += Number(p.medicare);
    totalTips += Number(p.creditCardTips) + Number(p.cashTips);
  });

  // Line 2: Total wages, tips, and other compensation
  const line2 = Math.round(totalWages * 100) / 100;

  // Line 3: Federal income tax withheld
  const line3 = Math.round(totalFederalWithholding * 100) / 100;

  // Social Security tax rate: 6.2% (employee) + 6.2% (employer) = 12.4%
  // Medicare tax rate: 1.45% (employee) + 1.45% (employer) = 2.9%
  // Additional Medicare: 0.9% (employee only, on wages > $200,000)

  // Line 5a: Taxable social security wages × 12.4% (0.124)
  const socialSecurityWages = totalWages - totalTips; // Tips are reported separately
  const line5a = Math.round(socialSecurityWages * 0.124 * 100) / 100;

  // Line 5b: Taxable social security tips × 12.4%
  const line5b = Math.round(totalTips * 0.124 * 100) / 100;

  // Line 5c: Taxable Medicare wages and tips × 2.9% (0.029)
  const line5c = Math.round(totalWages * 0.029 * 100) / 100;

  // Line 5d: Additional Medicare Tax (0.9% on wages > $200,000)
  // This is withheld from employee only
  const line5d = Math.round(
    payrolls
      .filter((p) => Number(p.ytdGrossPay) > 200000)
      .reduce((sum, p) => {
        const excessWages = Math.max(0, Number(p.grossPay) - 200000);
        return sum + excessWages * 0.009;
      }, 0) * 100
  ) / 100;

  // Line 5e: Total social security and Medicare taxes
  const line5e = Math.round((line5a + line5b + line5c + line5d) * 100) / 100;

  // Line 5f: Section 3121(q) Notice and Demand (usually 0)
  const line5f = 0;

  // Line 6: Total taxes before adjustments
  const line6 = Math.round((line3 + line5e + line5f) * 100) / 100;

  // Lines 7-9: Adjustments (usually 0 for small businesses)
  const line7 = 0;
  const line8 = 0;
  const line9 = 0;

  // Line 10: Total taxes after adjustments
  const line10 = Math.round((line6 + line7 - line8 + line9) * 100) / 100;

  // Lines 11a-11d: Credits (usually 0 for small businesses)
  const line11a = 0;
  const line11b = 0;
  const line11c = 0;
  const line11d = 0;

  // Line 12: Total taxes after credits
  const line12 = Math.round((line10 - line11a - line11b - line11c - line11d) * 100) / 100;

  // Calculate monthly tax liability for deposit schedule
  const monthlyLiability = await calculateMonthlyTaxLiability(
    companyId,
    year,
    quarter
  );

  // Line 13a: Total deposits (should match monthly liability)
  const line13a = Math.round(
    (monthlyLiability.month1 + monthlyLiability.month2 + monthlyLiability.month3) * 100
  ) / 100;

  // Lines 13b-13e: Credits and refunds (usually 0)
  const line13b = 0;
  const line13c = 0;
  const line13d = 0;
  const line13e = 0;

  // Line 13f: Total deposits and refundable credits
  const line13f = Math.round((line13a + line13c + line13d) * 100) / 100;

  // Line 14: Balance due (if line 12 > line 13f)
  const line14 = Math.max(0, Math.round((line12 - line13f) * 100) / 100);

  // Line 15: Overpayment (if line 13f > line 12)
  const line15 = Math.max(0, Math.round((line13f - line12) * 100) / 100);

  return {
    quarter,
    year,
    ein: company.ein,
    companyName: company.name,
    address: company.address,
    city: company.city,
    state: company.state,
    zipCode: company.zipCode,
    line1,
    line2,
    line3,
    line5a,
    line5b,
    line5c,
    line5d,
    line5e,
    line5f,
    line6,
    line7,
    line8,
    line9,
    line10,
    line11a,
    line11b,
    line11c,
    line11d,
    line12,
    line13a,
    line13b,
    line13c,
    line13d,
    line13e,
    line13f,
    line14,
    line15,
    depositSchedule: company.federalDepositSchedule as 'MONTHLY' | 'SEMIWEEKLY',
    monthlyTaxLiability: monthlyLiability,
    generatedAt: new Date(),
  };
}

/**
 * Calculate monthly tax liability for Part 2 of Form 941
 */
async function calculateMonthlyTaxLiability(
  companyId: string,
  year: number,
  quarter: 1 | 2 | 3 | 4
) {
  const quarterMonths = {
    1: [0, 1, 2],  // Jan, Feb, Mar
    2: [3, 4, 5],  // Apr, May, Jun
    3: [6, 7, 8],  // Jul, Aug, Sep
    4: [9, 10, 11], // Oct, Nov, Dec
  };

  const months = quarterMonths[quarter];
  const monthlyTax = { month1: 0, month2: 0, month3: 0 };

  for (let i = 0; i < 3; i++) {
    const monthStart = new Date(year, months[i], 1);
    const monthEnd = new Date(year, months[i] + 1, 0, 23, 59, 59, 999);

    const monthPayrolls = await prisma.payroll.aggregate({
      where: {
        companyId,
        payDate: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      _sum: {
        federalWithholding: true,
        socialSecurity: true,
        medicare: true,
        employerSocialSecurity: true,
        employerMedicare: true,
      },
    });

    const sums = monthPayrolls._sum;
    const taxLiability =
      Number(sums.federalWithholding || 0) +
      Number(sums.socialSecurity || 0) +
      Number(sums.medicare || 0) +
      Number(sums.employerSocialSecurity || 0) +
      Number(sums.employerMedicare || 0);

    if (i === 0) monthlyTax.month1 = Math.round(taxLiability * 100) / 100;
    else if (i === 1) monthlyTax.month2 = Math.round(taxLiability * 100) / 100;
    else monthlyTax.month3 = Math.round(taxLiability * 100) / 100;
  }

  return monthlyTax;
}

/**
 * Get quarter name for display
 */
export function getQuarterName(quarter: 1 | 2 | 3 | 4): string {
  const names = {
    1: 'Q1 (January - March)',
    2: 'Q2 (April - June)',
    3: 'Q3 (July - September)',
    4: 'Q4 (October - December)',
  };
  return names[quarter];
}

/**
 * Get current quarter based on date
 */
export function getCurrentQuarter(date: Date = new Date()): 1 | 2 | 3 | 4 {
  const month = date.getMonth();
  if (month >= 0 && month <= 2) return 1;
  if (month >= 3 && month <= 5) return 2;
  if (month >= 6 && month <= 8) return 3;
  return 4;
}
