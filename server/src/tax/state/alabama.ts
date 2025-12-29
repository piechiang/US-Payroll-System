/**
 * Alabama State Tax Calculator
 * Based on Alabama Department of Revenue (2024)
 *
 * Alabama has progressive income tax with rates from 2% to 5%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Alabama Tax Brackets
const AL_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 500, rate: 0.02, base: 0 },
    { min: 500, max: 3000, rate: 0.04, base: 10 },
    { min: 3000, max: Infinity, rate: 0.05, base: 110 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 1000, rate: 0.02, base: 0 },
    { min: 1000, max: 6000, rate: 0.04, base: 20 },
    { min: 6000, max: Infinity, rate: 0.05, base: 220 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 500, rate: 0.02, base: 0 },
    { min: 500, max: 3000, rate: 0.04, base: 10 },
    { min: 3000, max: Infinity, rate: 0.05, base: 110 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 500, rate: 0.02, base: 0 },
    { min: 500, max: 3000, rate: 0.04, base: 10 },
    { min: 3000, max: Infinity, rate: 0.05, base: 110 }
  ]
};

// Alabama Standard Deduction
const AL_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 2500,
  MARRIED_FILING_JOINTLY: 7500,
  MARRIED_FILING_SEPARATELY: 3750,
  HEAD_OF_HOUSEHOLD: 4700
};

// Alabama Personal Exemption
const AL_PERSONAL_EXEMPTION_2024: Record<string, number> = {
  SINGLE: 1500,
  MARRIED_FILING_JOINTLY: 3000,
  MARRIED_FILING_SEPARATELY: 1500,
  HEAD_OF_HOUSEHOLD: 3000
};

export function calculateAlabamaTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = AL_TAX_BRACKETS_2024[filingStatus as keyof typeof AL_TAX_BRACKETS_2024]
    || AL_TAX_BRACKETS_2024.SINGLE;

  const annualStandardDeduction = AL_STANDARD_DEDUCTION_2024[filingStatus] || 2500;
  const annualPersonalExemption = AL_PERSONAL_EXEMPTION_2024[filingStatus] || 1500;
  const totalDeductionPerPeriod = (annualStandardDeduction + annualPersonalExemption) / payPeriodsPerYear;

  let taxableWages = grossPay - totalDeductionPerPeriod;
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

export const AL_TAX_INFO = {
  brackets: AL_TAX_BRACKETS_2024,
  standardDeductions: AL_STANDARD_DEDUCTION_2024,
  personalExemptions: AL_PERSONAL_EXEMPTION_2024
};
