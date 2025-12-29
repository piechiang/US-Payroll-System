/**
 * Oklahoma State Tax Calculator
 * Based on Oklahoma Tax Commission (2024)
 *
 * Oklahoma has progressive income tax with rates from 0.25% to 4.75%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Oklahoma Tax Brackets
const OK_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 1000, rate: 0.0025, base: 0 },
    { min: 1000, max: 2500, rate: 0.0075, base: 2.50 },
    { min: 2500, max: 3750, rate: 0.0175, base: 13.75 },
    { min: 3750, max: 4900, rate: 0.0275, base: 35.63 },
    { min: 4900, max: 7200, rate: 0.0375, base: 67.25 },
    { min: 7200, max: Infinity, rate: 0.0475, base: 153.50 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 2000, rate: 0.0025, base: 0 },
    { min: 2000, max: 5000, rate: 0.0075, base: 5 },
    { min: 5000, max: 7500, rate: 0.0175, base: 27.50 },
    { min: 7500, max: 9800, rate: 0.0275, base: 71.25 },
    { min: 9800, max: 12200, rate: 0.0375, base: 134.50 },
    { min: 12200, max: Infinity, rate: 0.0475, base: 224.50 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 1000, rate: 0.0025, base: 0 },
    { min: 1000, max: 2500, rate: 0.0075, base: 2.50 },
    { min: 2500, max: 3750, rate: 0.0175, base: 13.75 },
    { min: 3750, max: 4900, rate: 0.0275, base: 35.63 },
    { min: 4900, max: 7200, rate: 0.0375, base: 67.25 },
    { min: 7200, max: Infinity, rate: 0.0475, base: 153.50 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 2000, rate: 0.0025, base: 0 },
    { min: 2000, max: 5000, rate: 0.0075, base: 5 },
    { min: 5000, max: 7500, rate: 0.0175, base: 27.50 },
    { min: 7500, max: 9800, rate: 0.0275, base: 71.25 },
    { min: 9800, max: 12200, rate: 0.0375, base: 134.50 },
    { min: 12200, max: Infinity, rate: 0.0475, base: 224.50 }
  ]
};

// Oklahoma Standard Deduction
const OK_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 6350,
  MARRIED_FILING_JOINTLY: 12700,
  MARRIED_FILING_SEPARATELY: 6350,
  HEAD_OF_HOUSEHOLD: 9350
};

export function calculateOklahomaTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = OK_TAX_BRACKETS_2024[filingStatus as keyof typeof OK_TAX_BRACKETS_2024]
    || OK_TAX_BRACKETS_2024.SINGLE;

  const annualStandardDeduction = OK_STANDARD_DEDUCTION_2024[filingStatus] || 6350;
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

export const OK_TAX_INFO = {
  brackets: OK_TAX_BRACKETS_2024,
  standardDeductions: OK_STANDARD_DEDUCTION_2024
};
