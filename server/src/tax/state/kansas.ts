/**
 * Kansas State Tax Calculator
 * Based on Kansas Department of Revenue (2024)
 *
 * Kansas has progressive income tax with rates from 3.1% to 5.7%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Kansas Tax Brackets
const KS_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 15000, rate: 0.031, base: 0 },
    { min: 15000, max: 30000, rate: 0.0525, base: 465 },
    { min: 30000, max: Infinity, rate: 0.057, base: 1252.50 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 30000, rate: 0.031, base: 0 },
    { min: 30000, max: 60000, rate: 0.0525, base: 930 },
    { min: 60000, max: Infinity, rate: 0.057, base: 2505 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 15000, rate: 0.031, base: 0 },
    { min: 15000, max: 30000, rate: 0.0525, base: 465 },
    { min: 30000, max: Infinity, rate: 0.057, base: 1252.50 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 15000, rate: 0.031, base: 0 },
    { min: 15000, max: 30000, rate: 0.0525, base: 465 },
    { min: 30000, max: Infinity, rate: 0.057, base: 1252.50 }
  ]
};

// Kansas Standard Deduction
const KS_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 3500,
  MARRIED_FILING_JOINTLY: 8000,
  MARRIED_FILING_SEPARATELY: 4000,
  HEAD_OF_HOUSEHOLD: 6000
};

export function calculateKansasTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = KS_TAX_BRACKETS_2024[filingStatus as keyof typeof KS_TAX_BRACKETS_2024]
    || KS_TAX_BRACKETS_2024.SINGLE;

  const annualStandardDeduction = KS_STANDARD_DEDUCTION_2024[filingStatus] || 3500;
  const deductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of brackets) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  const topBracket = brackets[brackets.length - 1];
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

export const KS_TAX_INFO = {
  brackets: KS_TAX_BRACKETS_2024,
  standardDeductions: KS_STANDARD_DEDUCTION_2024
};
