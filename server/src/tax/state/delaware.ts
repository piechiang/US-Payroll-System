/**
 * Delaware State Tax Calculator
 * Based on Delaware Division of Revenue (2024)
 *
 * Delaware has progressive income tax with rates from 2.2% to 6.6%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Delaware Tax Brackets (same for all filing statuses)
const DE_TAX_BRACKETS_2024 = [
  { min: 0, max: 2000, rate: 0, base: 0 },
  { min: 2000, max: 5000, rate: 0.022, base: 0 },
  { min: 5000, max: 10000, rate: 0.039, base: 66 },
  { min: 10000, max: 20000, rate: 0.048, base: 261 },
  { min: 20000, max: 25000, rate: 0.052, base: 741 },
  { min: 25000, max: 60000, rate: 0.0555, base: 1001 },
  { min: 60000, max: Infinity, rate: 0.066, base: 2943.50 }
];

// Delaware Standard Deduction
const DE_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 3250,
  MARRIED_FILING_JOINTLY: 6500,
  MARRIED_FILING_SEPARATELY: 3250,
  HEAD_OF_HOUSEHOLD: 3250
};

// Delaware Personal Credit
const DE_PERSONAL_CREDIT_2024 = 110;

export function calculateDelawareTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const annualStandardDeduction = DE_STANDARD_DEDUCTION_2024[filingStatus] || 3250;
  const deductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of DE_TAX_BRACKETS_2024) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  const topBracket = DE_TAX_BRACKETS_2024[DE_TAX_BRACKETS_2024.length - 1];
  if (annualTaxableWages > topBracket.min) {
    annualTax = topBracket.base + (annualTaxableWages - topBracket.min) * topBracket.rate;
    marginalRate = topBracket.rate;
  }

  // Apply personal credit
  annualTax = Math.max(0, annualTax - DE_PERSONAL_CREDIT_2024);

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

export const DE_TAX_INFO = {
  brackets: DE_TAX_BRACKETS_2024,
  standardDeductions: DE_STANDARD_DEDUCTION_2024,
  personalCredit: DE_PERSONAL_CREDIT_2024
};
