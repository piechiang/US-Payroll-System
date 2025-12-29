/**
 * Wisconsin State Tax Calculator
 * Based on Wisconsin Department of Revenue (2024)
 *
 * Wisconsin has progressive income tax with rates from 3.5% to 7.65%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Wisconsin Tax Brackets
const WI_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 14320, rate: 0.035, base: 0 },
    { min: 14320, max: 28640, rate: 0.044, base: 501.20 },
    { min: 28640, max: 315310, rate: 0.053, base: 1131.28 },
    { min: 315310, max: Infinity, rate: 0.0765, base: 16324.79 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 19090, rate: 0.035, base: 0 },
    { min: 19090, max: 38190, rate: 0.044, base: 668.15 },
    { min: 38190, max: 420420, rate: 0.053, base: 1508.55 },
    { min: 420420, max: Infinity, rate: 0.0765, base: 21766.74 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 9550, rate: 0.035, base: 0 },
    { min: 9550, max: 19090, rate: 0.044, base: 334.25 },
    { min: 19090, max: 210210, rate: 0.053, base: 754.01 },
    { min: 210210, max: Infinity, rate: 0.0765, base: 10883.37 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 14320, rate: 0.035, base: 0 },
    { min: 14320, max: 28640, rate: 0.044, base: 501.20 },
    { min: 28640, max: 315310, rate: 0.053, base: 1131.28 },
    { min: 315310, max: Infinity, rate: 0.0765, base: 16324.79 }
  ]
};

// Wisconsin Standard Deduction (complex formula, using simplified version)
const WI_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 13230,
  MARRIED_FILING_JOINTLY: 24640,
  MARRIED_FILING_SEPARATELY: 11560,
  HEAD_OF_HOUSEHOLD: 16650
};

export function calculateWisconsinTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = WI_TAX_BRACKETS_2024[filingStatus as keyof typeof WI_TAX_BRACKETS_2024]
    || WI_TAX_BRACKETS_2024.SINGLE;

  const annualStandardDeduction = WI_STANDARD_DEDUCTION_2024[filingStatus] || 13230;
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

export const WI_TAX_INFO = {
  brackets: WI_TAX_BRACKETS_2024,
  standardDeductions: WI_STANDARD_DEDUCTION_2024
};
