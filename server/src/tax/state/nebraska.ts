/**
 * Nebraska State Tax Calculator
 * Based on Nebraska Department of Revenue (2024)
 *
 * Nebraska has progressive income tax with rates from 2.46% to 5.84%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Nebraska Tax Brackets
const NE_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 3700, rate: 0.0246, base: 0 },
    { min: 3700, max: 22170, rate: 0.0351, base: 91.02 },
    { min: 22170, max: 35730, rate: 0.0501, base: 739.12 },
    { min: 35730, max: Infinity, rate: 0.0584, base: 1418.52 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 7390, rate: 0.0246, base: 0 },
    { min: 7390, max: 44350, rate: 0.0351, base: 181.79 },
    { min: 44350, max: 71460, rate: 0.0501, base: 1479.00 },
    { min: 71460, max: Infinity, rate: 0.0584, base: 2837.41 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 3700, rate: 0.0246, base: 0 },
    { min: 3700, max: 22170, rate: 0.0351, base: 91.02 },
    { min: 22170, max: 35730, rate: 0.0501, base: 739.12 },
    { min: 35730, max: Infinity, rate: 0.0584, base: 1418.52 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 6620, rate: 0.0246, base: 0 },
    { min: 6620, max: 33500, rate: 0.0351, base: 162.85 },
    { min: 33500, max: 53590, rate: 0.0501, base: 1106.14 },
    { min: 53590, max: Infinity, rate: 0.0584, base: 2112.65 }
  ]
};

// Nebraska Standard Deduction
const NE_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 7900,
  MARRIED_FILING_JOINTLY: 15800,
  MARRIED_FILING_SEPARATELY: 7900,
  HEAD_OF_HOUSEHOLD: 11600
};

export function calculateNebraskaTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = NE_TAX_BRACKETS_2024[filingStatus as keyof typeof NE_TAX_BRACKETS_2024]
    || NE_TAX_BRACKETS_2024.SINGLE;

  const annualStandardDeduction = NE_STANDARD_DEDUCTION_2024[filingStatus] || 7900;
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

export const NE_TAX_INFO = {
  brackets: NE_TAX_BRACKETS_2024,
  standardDeductions: NE_STANDARD_DEDUCTION_2024
};
