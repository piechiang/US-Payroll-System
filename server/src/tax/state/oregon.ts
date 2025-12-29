/**
 * Oregon State Tax Calculator
 * Based on Oregon Department of Revenue (2024)
 *
 * Oregon has progressive income tax with rates from 4.75% to 9.9%
 * Oregon also has Statewide Transit Tax
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Oregon Tax Brackets
const OR_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 4300, rate: 0.0475, base: 0 },
    { min: 4300, max: 10750, rate: 0.0675, base: 204.25 },
    { min: 10750, max: 125000, rate: 0.0875, base: 639.63 },
    { min: 125000, max: Infinity, rate: 0.099, base: 10636.50 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 8600, rate: 0.0475, base: 0 },
    { min: 8600, max: 21500, rate: 0.0675, base: 408.50 },
    { min: 21500, max: 250000, rate: 0.0875, base: 1279.25 },
    { min: 250000, max: Infinity, rate: 0.099, base: 21273 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 4300, rate: 0.0475, base: 0 },
    { min: 4300, max: 10750, rate: 0.0675, base: 204.25 },
    { min: 10750, max: 125000, rate: 0.0875, base: 639.63 },
    { min: 125000, max: Infinity, rate: 0.099, base: 10636.50 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 8600, rate: 0.0475, base: 0 },
    { min: 8600, max: 21500, rate: 0.0675, base: 408.50 },
    { min: 21500, max: 250000, rate: 0.0875, base: 1279.25 },
    { min: 250000, max: Infinity, rate: 0.099, base: 21273 }
  ]
};

// Oregon Standard Deduction
const OR_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 2745,
  MARRIED_FILING_JOINTLY: 5495,
  MARRIED_FILING_SEPARATELY: 2745,
  HEAD_OF_HOUSEHOLD: 4420
};

// Oregon Statewide Transit Tax
const OR_TRANSIT_TAX_RATE_2024 = 0.001; // 0.1%

export function calculateOregonTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = OR_TAX_BRACKETS_2024[filingStatus as keyof typeof OR_TAX_BRACKETS_2024]
    || OR_TAX_BRACKETS_2024.SINGLE;

  const annualStandardDeduction = OR_STANDARD_DEDUCTION_2024[filingStatus] || 2745;
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

  // Transit tax (included in SDI field for simplicity)
  const sdi = Math.round(grossPay * OR_TRANSIT_TAX_RATE_2024 * 100) / 100;

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

export const OR_TAX_INFO = {
  brackets: OR_TAX_BRACKETS_2024,
  standardDeductions: OR_STANDARD_DEDUCTION_2024,
  transitTaxRate: OR_TRANSIT_TAX_RATE_2024
};
