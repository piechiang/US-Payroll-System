/**
 * Vermont State Tax Calculator
 * Based on Vermont Department of Taxes (2024)
 *
 * Vermont has progressive income tax with rates from 3.35% to 8.75%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Vermont Tax Brackets
const VT_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 45400, rate: 0.0335, base: 0 },
    { min: 45400, max: 110050, rate: 0.066, base: 1520.90 },
    { min: 110050, max: 229550, rate: 0.076, base: 5787.79 },
    { min: 229550, max: Infinity, rate: 0.0875, base: 14869.79 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 75850, rate: 0.0335, base: 0 },
    { min: 75850, max: 183400, rate: 0.066, base: 2540.98 },
    { min: 183400, max: 279450, rate: 0.076, base: 9638.28 },
    { min: 279450, max: Infinity, rate: 0.0875, base: 16936.08 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 37925, rate: 0.0335, base: 0 },
    { min: 37925, max: 91700, rate: 0.066, base: 1270.49 },
    { min: 91700, max: 139725, rate: 0.076, base: 4819.14 },
    { min: 139725, max: Infinity, rate: 0.0875, base: 8468.04 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 60600, rate: 0.0335, base: 0 },
    { min: 60600, max: 156700, rate: 0.066, base: 2030.10 },
    { min: 156700, max: 254500, rate: 0.076, base: 8372.70 },
    { min: 254500, max: Infinity, rate: 0.0875, base: 15805.50 }
  ]
};

// Vermont Standard Deduction (mirrors federal)
const VT_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 14600,
  MARRIED_FILING_JOINTLY: 29200,
  MARRIED_FILING_SEPARATELY: 14600,
  HEAD_OF_HOUSEHOLD: 21900
};

export function calculateVermontTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = VT_TAX_BRACKETS_2024[filingStatus as keyof typeof VT_TAX_BRACKETS_2024]
    || VT_TAX_BRACKETS_2024.SINGLE;

  const annualStandardDeduction = VT_STANDARD_DEDUCTION_2024[filingStatus] || 14600;
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

export const VT_TAX_INFO = {
  brackets: VT_TAX_BRACKETS_2024,
  standardDeductions: VT_STANDARD_DEDUCTION_2024
};
