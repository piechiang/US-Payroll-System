/**
 * IRS Form 940 Generator
 * Employer's Annual Federal Unemployment (FUTA) Tax Return
 *
 * Form 940 is used to report:
 * - Federal Unemployment Tax Act (FUTA) tax
 * - Standard FUTA tax rate: 6.0% on first $7,000 of wages per employee
 * - Credit reduction states may have higher rates
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const prisma = new PrismaClient();

export interface Form940Data {
  // Header Information
  year: number;

  // Employer Information
  ein: string;
  companyName: string;
  tradeNameDBA?: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;

  // Part 1: Tell us about your return
  line1a: boolean; // Did you pay unemployment contributions to only one state?
  line1b: boolean; // Did you pay all state unemployment contributions by the due date?
  stateAbbreviation: string;

  // Part 2: Determine your FUTA tax before adjustments
  line3: number;  // Total payments to all employees
  line4: number;  // Payments exempt from FUTA tax
  line5: number;  // Total taxable FUTA wages (line 3 - line 4)
  line6: number;  // FUTA tax before adjustments (line 5 × 0.006)

  // Part 3: Determine your adjustments
  line7: number;  // FUTA tax on fringe benefits
  line8: number;  // Reserved for future use
  line9: number;  // Total adjustments
  line10: number; // FUTA tax after adjustments (line 6 + line 9)

  // Part 4: Determine your FUTA tax and balance due or overpayment
  line11: number; // FUTA tax deposited for the year
  line12: number; // Balance due (line 10 - line 11, if positive)
  line13: number; // Overpayment (line 11 - line 10, if positive)

  // Part 5: Report your FUTA tax liability by quarter
  quarterlyLiability: {
    q1: number;
    q2: number;
    q3: number;
    q4: number;
    total: number;
  };

  // Part 6: May we speak with your third-party designee?
  thirdPartyDesignee?: {
    name: string;
    phone: string;
  };

  // Additional metadata
  generatedAt: Date;
  preparedBy?: string;
}

/**
 * Generate Form 940 for a specific year
 */
export async function generateForm940(
  companyId: string,
  year: number
): Promise<Form940Data> {
  logger.info('Generating Form 940', { companyId, year });

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  // Fetch company information
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  // Fetch all payrolls for the year
  const payrolls = await prisma.payroll.findMany({
    where: {
      companyId,
      payDate: {
        gte: yearStart,
        lte: yearEnd,
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

  // Group payrolls by employee to calculate FUTA wages
  // FUTA is only on first $7,000 of wages per employee per year
  const FUTA_WAGE_BASE = 7000;
  const employeeWages = new Map<string, number>();

  payrolls.forEach((p) => {
    const currentWages = employeeWages.get(p.employeeId) || 0;
    employeeWages.set(p.employeeId, currentWages + Number(p.grossPay));
  });

  // Calculate total payments and taxable FUTA wages
  let totalPayments = 0;
  let taxableFutaWages = 0;

  employeeWages.forEach((wages) => {
    totalPayments += wages;
    // FUTA tax only applies to first $7,000 per employee
    taxableFutaWages += Math.min(wages, FUTA_WAGE_BASE);
  });

  // Line 3: Total payments to all employees
  const line3 = Math.round(totalPayments * 100) / 100;

  // Line 4: Payments exempt from FUTA tax
  // This includes payments over $7,000 per employee
  const line4 = Math.round((totalPayments - taxableFutaWages) * 100) / 100;

  // Line 5: Total taxable FUTA wages
  const line5 = Math.round(taxableFutaWages * 100) / 100;

  // Line 6: FUTA tax before adjustments
  // Standard FUTA rate: 6.0%, but with state credit it's usually 0.6%
  // We use 0.6% (0.006) assuming state credit applies
  const FUTA_TAX_RATE = 0.006; // 0.6% after state credit
  const line6 = Math.round(line5 * FUTA_TAX_RATE * 100) / 100;

  // Line 7-9: Adjustments (usually 0 for small businesses)
  const line7 = 0;
  const line8 = 0;
  const line9 = line7 + line8;

  // Line 10: FUTA tax after adjustments
  const line10 = Math.round((line6 + line9) * 100) / 100;

  // Calculate quarterly liability
  const quarterlyLiability = await calculateQuarterlyFutaLiability(
    companyId,
    year
  );

  // Line 11: FUTA tax deposited (should match quarterly liability)
  const line11 = Math.round(quarterlyLiability.total * 100) / 100;

  // Line 12: Balance due
  const line12 = Math.max(0, Math.round((line10 - line11) * 100) / 100);

  // Line 13: Overpayment
  const line13 = Math.max(0, Math.round((line11 - line10) * 100) / 100);

  return {
    year,
    ein: company.ein,
    companyName: company.name,
    address: company.address,
    city: company.city,
    state: company.state,
    zipCode: company.zipCode,
    line1a: true, // Assuming single state
    line1b: true, // Assuming timely payments
    stateAbbreviation: company.state,
    line3,
    line4,
    line5,
    line6,
    line7,
    line8,
    line9,
    line10,
    line11,
    line12,
    line13,
    quarterlyLiability,
    generatedAt: new Date(),
  };
}

/**
 * Calculate quarterly FUTA liability for Part 5 of Form 940
 */
async function calculateQuarterlyFutaLiability(
  companyId: string,
  year: number
) {
  const quarters = [
    { q: 1, start: 0, end: 2 },   // Q1: Jan-Mar
    { q: 2, start: 3, end: 5 },   // Q2: Apr-Jun
    { q: 3, start: 6, end: 8 },   // Q3: Jul-Sep
    { q: 4, start: 9, end: 11 },  // Q4: Oct-Dec
  ];

  const liability = { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 };
  const FUTA_WAGE_BASE = 7000;

  for (const quarter of quarters) {
    const quarterStart = new Date(year, quarter.start, 1);
    const quarterEnd = new Date(year, quarter.end + 1, 0, 23, 59, 59, 999);

    const payrolls = await prisma.payroll.findMany({
      where: {
        companyId,
        payDate: {
          gte: quarterStart,
          lte: quarterEnd,
        },
      },
      include: {
        employee: true,
      },
    });

    // Group by employee and calculate YTD wages up to this quarter
    const employeeWages = new Map<string, number>();

    payrolls.forEach((p) => {
      const currentWages = employeeWages.get(p.employeeId) || 0;
      employeeWages.set(p.employeeId, currentWages + Number(p.grossPay));
    });

    // Calculate FUTA wages for this quarter
    let quarterFutaWages = 0;
    employeeWages.forEach((wages) => {
      quarterFutaWages += Math.min(wages, FUTA_WAGE_BASE);
    });

    const quarterLiability = Math.round(quarterFutaWages * 0.006 * 100) / 100;

    if (quarter.q === 1) liability.q1 = quarterLiability;
    else if (quarter.q === 2) liability.q2 = quarterLiability;
    else if (quarter.q === 3) liability.q3 = quarterLiability;
    else liability.q4 = quarterLiability;

    liability.total += quarterLiability;
  }

  liability.total = Math.round(liability.total * 100) / 100;

  return liability;
}
