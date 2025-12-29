/**
 * Arkansas State Tax Calculator
 * Based on Arkansas Department of Finance and Administration (2024)
 *
 * Arkansas has progressive income tax with rates from 0% to 4.4%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Arkansas Tax Brackets (same for all filing statuses)
const AR_TAX_BRACKETS_2024 = [
  { min: 0, max: 5100, rate: 0, base: 0 },
  { min: 5100, max: 10299, rate: 0.02, base: 0 },
  { min: 10299, max: 14699, rate: 0.03, base: 103.98 },
  { min: 14699, max: 24299, rate: 0.034, base: 235.98 },
  { min: 24299, max: 87000, rate: 0.044, base: 562.38 },
  { min: 87000, max: Infinity, rate: 0.044, base: 3321.22 }
];

// Arkansas Standard Deduction
const AR_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 2340,
  MARRIED_FILING_JOINTLY: 4680,
  MARRIED_FILING_SEPARATELY: 2340,
  HEAD_OF_HOUSEHOLD: 2340
};

export function calculateArkansasTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const annualStandardDeduction = AR_STANDARD_DEDUCTION_2024[filingStatus] || 2340;
  const deductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of AR_TAX_BRACKETS_2024) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  const topBracket = AR_TAX_BRACKETS_2024[AR_TAX_BRACKETS_2024.length - 1];
  if (annualTaxableWages > topBracket.min) {
    annualTax = topBracket.base + (annualTaxableWages - topBracket.min) * topBracket.rate;
    marginalRate = topBracket.rate;
  }

  const incomeTax = Math.round((annualTax / payPeriodsPerYear) * 100) / 100;
  const sdi = 0;
  const sui = 0;
  const total = incomeTax + sdi + sui;

  return {
    incomeTax,
    sdi,
    sui,
    total: Math.round(total * 100) / 100,
    details: {
      taxableWages: Math.round(taxableWages * 100) / 100,
      marginalRate: marginalRate * 100
    }
  };
}

export const AR_TAX_INFO = {
  brackets: AR_TAX_BRACKETS_2024,
  standardDeductions: AR_STANDARD_DEDUCTION_2024
};
