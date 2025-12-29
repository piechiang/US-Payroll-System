/**
 * Minnesota State Tax Calculator
 * Based on Minnesota Department of Revenue (2024)
 *
 * Minnesota has progressive income tax with rates from 5.35% to 9.85%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Minnesota Tax Brackets
const MN_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 31690, rate: 0.0535, base: 0 },
    { min: 31690, max: 104090, rate: 0.068, base: 1695.42 },
    { min: 104090, max: 193240, rate: 0.0785, base: 6618.54 },
    { min: 193240, max: Infinity, rate: 0.0985, base: 13617.32 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 46330, rate: 0.0535, base: 0 },
    { min: 46330, max: 184040, rate: 0.068, base: 2478.66 },
    { min: 184040, max: 321450, rate: 0.0785, base: 11842.96 },
    { min: 321450, max: Infinity, rate: 0.0985, base: 22629.74 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 23165, rate: 0.0535, base: 0 },
    { min: 23165, max: 92020, rate: 0.068, base: 1239.33 },
    { min: 92020, max: 160725, rate: 0.0785, base: 5921.47 },
    { min: 160725, max: Infinity, rate: 0.0985, base: 11314.87 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 39010, rate: 0.0535, base: 0 },
    { min: 39010, max: 156570, rate: 0.068, base: 2087.04 },
    { min: 156570, max: 257370, rate: 0.0785, base: 10081.12 },
    { min: 257370, max: Infinity, rate: 0.0985, base: 17994.92 }
  ]
};

// Minnesota Standard Deduction
const MN_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 14575,
  MARRIED_FILING_JOINTLY: 29150,
  MARRIED_FILING_SEPARATELY: 14575,
  HEAD_OF_HOUSEHOLD: 21850
};

export function calculateMinnesotaTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = MN_TAX_BRACKETS_2024[filingStatus as keyof typeof MN_TAX_BRACKETS_2024]
    || MN_TAX_BRACKETS_2024.SINGLE;

  const annualStandardDeduction = MN_STANDARD_DEDUCTION_2024[filingStatus] || 14575;
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

export const MN_TAX_INFO = {
  brackets: MN_TAX_BRACKETS_2024,
  standardDeductions: MN_STANDARD_DEDUCTION_2024
};
