/**
 * Federal Tax Calculator for US Payroll (Decimal.js Version)
 * Based on IRS Publication 15-T (2024)
 *
 * CRITICAL CHANGE: All calculations now use Decimal.js for penny-perfect precision
 * This eliminates floating-point rounding errors in tax calculations
 *
 * Includes:
 * - Federal Income Tax Withholding (using percentage method)
 * - Social Security Tax (6.2%)
 * - Medicare Tax (1.45% + 0.9% additional for high earners)
 */

import { Decimal } from '../utils/decimal.js';
import { decimal, toNumber, add, subtract, multiply, divide, percentOf, min, max, nonNegative } from '../utils/decimal.js';

export interface FederalTaxInput {
  grossPay: number | Decimal;
  annualIncome: number | Decimal;
  filingStatus: string;
  allowances: number;           // W-4 Step 3 dependents
  additionalWithholding: number | Decimal; // W-4 Step 4(c)
  otherIncome?: number | Decimal;          // W-4 Step 4(a) - other income not from jobs
  deductions?: number | Decimal;           // W-4 Step 4(b) - itemized deductions beyond standard
  payPeriodsPerYear: number;
  ytdGrossWages?: number | Decimal;       // For Social Security wage cap
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
interface TaxBracket {
  min: number;
  max: number;
  rate: number;
  base: number;
}

const TAX_BRACKETS_2024: Record<string, TaxBracket[]> = {
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

// 2024 Standard Deduction amounts (annual)
const ANNUAL_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 14600,
  MARRIED_FILING_JOINTLY: 29200,
  MARRIED_FILING_SEPARATELY: 14600,
  HEAD_OF_HOUSEHOLD: 21900
};

// 2024 FICA Constants
const SOCIAL_SECURITY_RATE = decimal('0.062');           // 6.2%
const SOCIAL_SECURITY_WAGE_CAP_2024 = decimal('168600'); // 2024 wage base
const MEDICARE_RATE = decimal('0.0145');                 // 1.45%
const MEDICARE_ADDITIONAL_RATE = decimal('0.009');       // 0.9% additional
// IMPORTANT: For employer WITHHOLDING purposes, IRS requires a fixed $200,000 threshold
// regardless of filing status. The actual liability based on filing status is reconciled
// on the employee's tax return. See IRS Publication 15 and Form 941 instructions.
const MEDICARE_ADDITIONAL_WITHHOLDING_THRESHOLD = decimal('200000');

// Dependent credit per W-4 Step 3
const DEPENDENT_CREDIT_PER_ALLOWANCE = decimal('2000');

export function calculateFederalTax(input: FederalTaxInput): FederalTaxResult {
  const {
    filingStatus,
    allowances,
    payPeriodsPerYear
  } = input;

  // Convert all inputs to Decimal for precision
  const grossPay = decimal(input.grossPay);
  const additionalWithholding = decimal(input.additionalWithholding);
  const otherIncome = decimal(input.otherIncome || 0);
  const deductions = decimal(input.deductions || 0);
  const ytdGrossWages = decimal(input.ytdGrossWages || 0);

  // Get the appropriate tax brackets
  const brackets = TAX_BRACKETS_2024[filingStatus as keyof typeof TAX_BRACKETS_2024]
    || TAX_BRACKETS_2024.SINGLE;

  // Calculate standard deduction per pay period
  const annualStandardDeduction = ANNUAL_STANDARD_DEDUCTION_2024[filingStatus] || 14600;
  const standardDeductionPerPeriod = divide(annualStandardDeduction, payPeriodsPerYear);

  // W-4 Step 4(a): Add other income per pay period (increases withholding)
  const otherIncomePerPeriod = divide(otherIncome, payPeriodsPerYear);

  // W-4 Step 4(b): Additional deductions per pay period (decreases withholding)
  const additionalDeductionsPerPeriod = divide(deductions, payPeriodsPerYear);

  // Calculate dependent credit per pay period
  const dependentCredit = divide(
    multiply(allowances, DEPENDENT_CREDIT_PER_ALLOWANCE),
    payPeriodsPerYear
  );

  // Calculate taxable wages (Adjusted Annual Wage Method)
  // = Gross Pay + Other Income (Step 4a) - Standard Deduction - Additional Deductions (Step 4b)
  let taxableWages = add(grossPay, otherIncomePerPeriod);
  taxableWages = subtract(taxableWages, standardDeductionPerPeriod, additionalDeductionsPerPeriod);
  taxableWages = nonNegative(taxableWages);

  // Calculate annualized taxable wages for bracket lookup
  const annualTaxableWages = multiply(taxableWages, payPeriodsPerYear);
  const annualTaxableWagesNum = toNumber(annualTaxableWages);

  // Find applicable bracket and calculate annual tax using Decimal
  let annualTax = decimal(0);
  for (const bracket of brackets) {
    if (annualTaxableWagesNum > bracket.min &&
        (annualTaxableWagesNum <= bracket.max || bracket.max === Infinity)) {
      // Tax = base + (income - min) * rate
      const excessIncome = subtract(annualTaxableWages, bracket.min);
      const taxOnExcess = multiply(excessIncome, bracket.rate);
      annualTax = add(bracket.base, taxOnExcess);
      break;
    }
  }

  // Convert to per-period tax
  let incomeTax = divide(annualTax, payPeriodsPerYear);

  // Subtract dependent credit
  incomeTax = nonNegative(subtract(incomeTax, dependentCredit));

  // Add additional withholding from W-4 Step 4(c)
  incomeTax = add(incomeTax, additionalWithholding);

  // Calculate Social Security tax
  // Check if we've hit the wage cap
  const remainingWagesForSS = nonNegative(
    subtract(SOCIAL_SECURITY_WAGE_CAP_2024, ytdGrossWages)
  );
  const wagesSubjectToSS = min(grossPay, remainingWagesForSS);
  const socialSecurity = multiply(wagesSubjectToSS, SOCIAL_SECURITY_RATE);

  // Calculate Medicare tax
  const medicare = multiply(grossPay, MEDICARE_RATE);

  // Calculate Additional Medicare tax (0.9% on wages over threshold)
  // IMPORTANT: For withholding, employers MUST use the fixed $200,000 threshold
  // regardless of filing status. This is per IRS Publication 15.
  let medicareAdditional = decimal(0);
  const ytdAfterThisPay = add(ytdGrossWages, grossPay);

  if (ytdAfterThisPay.greaterThan(MEDICARE_ADDITIONAL_WITHHOLDING_THRESHOLD)) {
    const excessOverThreshold = subtract(ytdAfterThisPay, MEDICARE_ADDITIONAL_WITHHOLDING_THRESHOLD);
    const wagesOverThreshold = min(grossPay, excessOverThreshold);
    medicareAdditional = multiply(nonNegative(wagesOverThreshold), MEDICARE_ADDITIONAL_RATE);
  }

  const total = add(incomeTax, socialSecurity, medicare, medicareAdditional);

  return {
    incomeTax: toNumber(incomeTax),
    socialSecurity: toNumber(socialSecurity),
    medicare: toNumber(medicare),
    medicareAdditional: toNumber(medicareAdditional),
    total: toNumber(total),
    details: {
      taxableWages: toNumber(taxableWages),
      standardDeduction: toNumber(standardDeductionPerPeriod),
      dependentCredit: toNumber(dependentCredit)
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
