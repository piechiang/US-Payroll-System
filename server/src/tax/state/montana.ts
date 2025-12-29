/**
 * Montana State Tax Calculator
 * Based on Montana Department of Revenue (2024)
 *
 * Montana has progressive income tax with rates from 4.7% to 5.9%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Montana Tax Brackets (same for all filing statuses)
const MT_TAX_BRACKETS_2024 = [
  { min: 0, max: 20500, rate: 0.047, base: 0 },
  { min: 20500, max: Infinity, rate: 0.059, base: 963.50 }
];

// Montana Standard Deduction
const MT_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 5540,
  MARRIED_FILING_JOINTLY: 11080,
  MARRIED_FILING_SEPARATELY: 5540,
  HEAD_OF_HOUSEHOLD: 8310
};

export function calculateMontanaTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const annualStandardDeduction = MT_STANDARD_DEDUCTION_2024[filingStatus] || 5540;
  const deductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of MT_TAX_BRACKETS_2024) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  const topBracket = MT_TAX_BRACKETS_2024[MT_TAX_BRACKETS_2024.length - 1];
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

export const MT_TAX_INFO = {
  brackets: MT_TAX_BRACKETS_2024,
  standardDeductions: MT_STANDARD_DEDUCTION_2024
};
