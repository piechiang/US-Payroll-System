/**
 * Maine State Tax Calculator
 * Based on Maine Revenue Services (2024)
 *
 * Maine has progressive income tax with rates from 5.8% to 7.15%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Maine Tax Brackets
const ME_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 26050, rate: 0.058, base: 0 },
    { min: 26050, max: 61600, rate: 0.0675, base: 1510.90 },
    { min: 61600, max: Infinity, rate: 0.0715, base: 3910.53 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 52100, rate: 0.058, base: 0 },
    { min: 52100, max: 123250, rate: 0.0675, base: 3021.80 },
    { min: 123250, max: Infinity, rate: 0.0715, base: 7824.43 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 26050, rate: 0.058, base: 0 },
    { min: 26050, max: 61600, rate: 0.0675, base: 1510.90 },
    { min: 61600, max: Infinity, rate: 0.0715, base: 3910.53 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 39100, rate: 0.058, base: 0 },
    { min: 39100, max: 92450, rate: 0.0675, base: 2267.80 },
    { min: 92450, max: Infinity, rate: 0.0715, base: 5869.93 }
  ]
};

// Maine Standard Deduction
const ME_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 14600,
  MARRIED_FILING_JOINTLY: 29200,
  MARRIED_FILING_SEPARATELY: 14600,
  HEAD_OF_HOUSEHOLD: 21900
};

export function calculateMaineTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = ME_TAX_BRACKETS_2024[filingStatus as keyof typeof ME_TAX_BRACKETS_2024]
    || ME_TAX_BRACKETS_2024.SINGLE;

  const annualStandardDeduction = ME_STANDARD_DEDUCTION_2024[filingStatus] || 14600;
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

export const ME_TAX_INFO = {
  brackets: ME_TAX_BRACKETS_2024,
  standardDeductions: ME_STANDARD_DEDUCTION_2024
};
