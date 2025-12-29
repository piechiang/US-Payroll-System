/**
 * Federal Tax Calculator for US Payroll
 * Based on IRS Publication 15-T (2024)
 *
 * Includes:
 * - Federal Income Tax Withholding (using percentage method)
 * - Social Security Tax (6.2%)
 * - Medicare Tax (1.45% + 0.9% additional for high earners)
 */

export interface FederalTaxInput {
  grossPay: number;
  annualIncome: number;
  filingStatus: string;
  allowances: number;           // W-4 Step 3 dependents
  additionalWithholding: number; // W-4 Step 4(c)
  otherIncome?: number;          // W-4 Step 4(a) - other income not from jobs
  deductions?: number;           // W-4 Step 4(b) - itemized deductions beyond standard
  payPeriodsPerYear: number;
  ytdGrossWages?: number;       // For Social Security wage cap
}

export interface FederalTaxResult {
  incomeTax: number;
  socialSecurity: number;
  medicare: number;
  medicareAdditional: number;
  total: number;
  details: {
    taxableWages: number;
    standardDeduction: number;
    dependentCredit: number;
  };
}

// 2024 Federal Tax Brackets (Percentage Method Tables)
// Source: IRS Publication 15-T
const TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 11600, rate: 0.10, base: 0 },
    { min: 11600, max: 47150, rate: 0.12, base: 1160 },
    { min: 47150, max: 100525, rate: 0.22, base: 5426 },
    { min: 100525, max: 191950, rate: 0.24, base: 17168.50 },
    { min: 191950, max: 243725, rate: 0.32, base: 39110.50 },
    { min: 243725, max: 609350, rate: 0.35, base: 55678.50 },
    { min: 609350, max: Infinity, rate: 0.37, base: 183647.25 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 23200, rate: 0.10, base: 0 },
    { min: 23200, max: 94300, rate: 0.12, base: 2320 },
    { min: 94300, max: 201050, rate: 0.22, base: 10852 },
    { min: 201050, max: 383900, rate: 0.24, base: 34337 },
    { min: 383900, max: 487450, rate: 0.32, base: 78221 },
    { min: 487450, max: 731200, rate: 0.35, base: 111357 },
    { min: 731200, max: Infinity, rate: 0.37, base: 196669.50 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 11600, rate: 0.10, base: 0 },
    { min: 11600, max: 47150, rate: 0.12, base: 1160 },
    { min: 47150, max: 100525, rate: 0.22, base: 5426 },
    { min: 100525, max: 191950, rate: 0.24, base: 17168.50 },
    { min: 191950, max: 243725, rate: 0.32, base: 39110.50 },
    { min: 243725, max: 365600, rate: 0.35, base: 55678.50 },
    { min: 365600, max: Infinity, rate: 0.37, base: 98334.75 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 16550, rate: 0.10, base: 0 },
    { min: 16550, max: 63100, rate: 0.12, base: 1655 },
    { min: 63100, max: 100500, rate: 0.22, base: 7241 },
    { min: 100500, max: 191950, rate: 0.24, base: 15469 },
    { min: 191950, max: 243700, rate: 0.32, base: 37417 },
    { min: 243700, max: 609350, rate: 0.35, base: 53977 },
    { min: 609350, max: Infinity, rate: 0.37, base: 181954.50 }
  ]
};

// 2024 Standard Deduction amounts (per pay period)
const ANNUAL_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 14600,
  MARRIED_FILING_JOINTLY: 29200,
  MARRIED_FILING_SEPARATELY: 14600,
  HEAD_OF_HOUSEHOLD: 21900
};

// 2024 FICA Constants
const SOCIAL_SECURITY_RATE = 0.062;           // 6.2%
const SOCIAL_SECURITY_WAGE_CAP_2024 = 168600; // 2024 wage base
const MEDICARE_RATE = 0.0145;                 // 1.45%
const MEDICARE_ADDITIONAL_RATE = 0.009;       // 0.9% additional
// IMPORTANT: For employer WITHHOLDING purposes, IRS requires a fixed $200,000 threshold
// regardless of filing status. The actual liability based on filing status is reconciled
// on the employee's tax return. See IRS Publication 15 and Form 941 instructions.
const MEDICARE_ADDITIONAL_WITHHOLDING_THRESHOLD = 200000;

// Dependent credit per W-4 Step 3
const DEPENDENT_CREDIT_PER_ALLOWANCE = 2000;

export function calculateFederalTax(input: FederalTaxInput): FederalTaxResult {
  const {
    grossPay,
    filingStatus,
    allowances,
    additionalWithholding,
    otherIncome = 0,      // W-4 Step 4(a)
    deductions = 0,       // W-4 Step 4(b)
    payPeriodsPerYear,
    ytdGrossWages = 0
  } = input;

  // Get the appropriate tax brackets
  const brackets = TAX_BRACKETS_2024[filingStatus as keyof typeof TAX_BRACKETS_2024]
    || TAX_BRACKETS_2024.SINGLE;

  // Calculate standard deduction per pay period
  const annualStandardDeduction = ANNUAL_STANDARD_DEDUCTION_2024[filingStatus] || 14600;
  const standardDeductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  // W-4 Step 4(a): Add other income per pay period (increases withholding)
  const otherIncomePerPeriod = otherIncome / payPeriodsPerYear;

  // W-4 Step 4(b): Additional deductions per pay period (decreases withholding)
  const additionalDeductionsPerPeriod = deductions / payPeriodsPerYear;

  // Calculate dependent credit per pay period
  const dependentCredit = (allowances * DEPENDENT_CREDIT_PER_ALLOWANCE) / payPeriodsPerYear;

  // Calculate taxable wages (Adjusted Annual Wage Method)
  // = Gross Pay + Other Income (Step 4a) - Standard Deduction - Additional Deductions (Step 4b)
  let taxableWages = grossPay + otherIncomePerPeriod - standardDeductionPerPeriod - additionalDeductionsPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  // Calculate annualized taxable wages for bracket lookup
  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  // Find applicable bracket and calculate annual tax
  let annualTax = 0;
  for (const bracket of brackets) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      break;
    } else if (annualTaxableWages > bracket.max && bracket.max === Infinity) {
      // Top bracket (max is Infinity)
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      break;
    }
  }

  // Convert to per-period tax
  let incomeTax = annualTax / payPeriodsPerYear;

  // Subtract dependent credit
  incomeTax = Math.max(0, incomeTax - dependentCredit);

  // Add additional withholding from W-4 Step 4(c)
  incomeTax += additionalWithholding;

  // Round to 2 decimal places
  incomeTax = Math.round(incomeTax * 100) / 100;

  // Calculate Social Security tax
  // Check if we've hit the wage cap
  const remainingWagesForSS = Math.max(0, SOCIAL_SECURITY_WAGE_CAP_2024 - ytdGrossWages);
  const wagesSubjectToSS = Math.min(grossPay, remainingWagesForSS);
  const socialSecurity = Math.round(wagesSubjectToSS * SOCIAL_SECURITY_RATE * 100) / 100;

  // Calculate Medicare tax
  const medicare = Math.round(grossPay * MEDICARE_RATE * 100) / 100;

  // Calculate Additional Medicare tax (0.9% on wages over threshold)
  // IMPORTANT: For withholding, employers MUST use the fixed $200,000 threshold
  // regardless of filing status. This is per IRS Publication 15.
  let medicareAdditional = 0;
  const ytdAfterThisPay = ytdGrossWages + grossPay;
  if (ytdAfterThisPay > MEDICARE_ADDITIONAL_WITHHOLDING_THRESHOLD) {
    const wagesOverThreshold = Math.min(grossPay, ytdAfterThisPay - MEDICARE_ADDITIONAL_WITHHOLDING_THRESHOLD);
    medicareAdditional = Math.round(Math.max(0, wagesOverThreshold) * MEDICARE_ADDITIONAL_RATE * 100) / 100;
  }

  const total = incomeTax + socialSecurity + medicare + medicareAdditional;

  return {
    incomeTax,
    socialSecurity,
    medicare,
    medicareAdditional,
    total: Math.round(total * 100) / 100,
    details: {
      taxableWages: Math.round(taxableWages * 100) / 100,
      standardDeduction: Math.round(standardDeductionPerPeriod * 100) / 100,
      dependentCredit: Math.round(dependentCredit * 100) / 100
    }
  };
}

// Helper function to get tax bracket info
export function getTaxBracketInfo(filingStatus: string, annualIncome: number) {
  const brackets = TAX_BRACKETS_2024[filingStatus as keyof typeof TAX_BRACKETS_2024]
    || TAX_BRACKETS_2024.SINGLE;

  for (const bracket of brackets) {
    if (annualIncome >= bracket.min && annualIncome < bracket.max) {
      return {
        marginalRate: bracket.rate * 100,
        bracketMin: bracket.min,
        bracketMax: bracket.max
      };
    }
  }

  // Return top bracket if income exceeds all brackets
  const topBracket = brackets[brackets.length - 1];
  return {
    marginalRate: topBracket.rate * 100,
    bracketMin: topBracket.min,
    bracketMax: Infinity
  };
}
