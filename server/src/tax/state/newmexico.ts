/**
 * New Mexico State Tax Calculator
 * Based on New Mexico Taxation and Revenue (2024)
 *
 * New Mexico has progressive income tax with rates from 1.7% to 5.9%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 New Mexico Tax Brackets
const NM_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 5500, rate: 0.017, base: 0 },
    { min: 5500, max: 11000, rate: 0.032, base: 93.50 },
    { min: 11000, max: 16000, rate: 0.047, base: 269.50 },
    { min: 16000, max: 210000, rate: 0.049, base: 504.50 },
    { min: 210000, max: Infinity, rate: 0.059, base: 10010.50 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 8000, rate: 0.017, base: 0 },
    { min: 8000, max: 16000, rate: 0.032, base: 136 },
    { min: 16000, max: 24000, rate: 0.047, base: 392 },
    { min: 24000, max: 315000, rate: 0.049, base: 768 },
    { min: 315000, max: Infinity, rate: 0.059, base: 15027 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 4000, rate: 0.017, base: 0 },
    { min: 4000, max: 8000, rate: 0.032, base: 68 },
    { min: 8000, max: 12000, rate: 0.047, base: 196 },
    { min: 12000, max: 157500, rate: 0.049, base: 384 },
    { min: 157500, max: Infinity, rate: 0.059, base: 7513.50 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 8000, rate: 0.017, base: 0 },
    { min: 8000, max: 16000, rate: 0.032, base: 136 },
    { min: 16000, max: 24000, rate: 0.047, base: 392 },
    { min: 24000, max: 315000, rate: 0.049, base: 768 },
    { min: 315000, max: Infinity, rate: 0.059, base: 15027 }
  ]
};

// New Mexico Standard Deduction
const NM_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 14600,
  MARRIED_FILING_JOINTLY: 29200,
  MARRIED_FILING_SEPARATELY: 14600,
  HEAD_OF_HOUSEHOLD: 21900
};

export function calculateNewMexicoTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = NM_TAX_BRACKETS_2024[filingStatus as keyof typeof NM_TAX_BRACKETS_2024]
    || NM_TAX_BRACKETS_2024.SINGLE;

  const annualStandardDeduction = NM_STANDARD_DEDUCTION_2024[filingStatus] || 14600;
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

export const NM_TAX_INFO = {
  brackets: NM_TAX_BRACKETS_2024,
  standardDeductions: NM_STANDARD_DEDUCTION_2024
};
