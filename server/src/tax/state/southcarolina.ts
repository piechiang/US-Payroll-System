/**
 * South Carolina State Tax Calculator
 * Based on South Carolina Department of Revenue (2024)
 *
 * South Carolina has progressive income tax with rates from 0% to 6.4%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 South Carolina Tax Brackets (same for all filing statuses)
const SC_TAX_BRACKETS_2024 = [
  { min: 0, max: 3460, rate: 0, base: 0 },
  { min: 3460, max: 17330, rate: 0.03, base: 0 },
  { min: 17330, max: Infinity, rate: 0.064, base: 416.10 }
];

// South Carolina Standard Deduction
const SC_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 14600,
  MARRIED_FILING_JOINTLY: 29200,
  MARRIED_FILING_SEPARATELY: 14600,
  HEAD_OF_HOUSEHOLD: 21900
};

export function calculateSouthCarolinaTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const annualStandardDeduction = SC_STANDARD_DEDUCTION_2024[filingStatus] || 14600;
  const deductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of SC_TAX_BRACKETS_2024) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  const topBracket = SC_TAX_BRACKETS_2024[SC_TAX_BRACKETS_2024.length - 1];
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

export const SC_TAX_INFO = {
  brackets: SC_TAX_BRACKETS_2024,
  standardDeductions: SC_STANDARD_DEDUCTION_2024
};
