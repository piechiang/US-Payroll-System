/**
 * Maryland State Tax Calculator
 * Based on Comptroller of Maryland (2024)
 *
 * Maryland has progressive income tax with rates from 2% to 5.75%
 * Note: Maryland also has county income taxes (not included here)
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Maryland Tax Brackets
const MD_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 1000, rate: 0.02, base: 0 },
    { min: 1000, max: 2000, rate: 0.03, base: 20 },
    { min: 2000, max: 3000, rate: 0.04, base: 50 },
    { min: 3000, max: 100000, rate: 0.0475, base: 90 },
    { min: 100000, max: 125000, rate: 0.05, base: 4697.50 },
    { min: 125000, max: 150000, rate: 0.0525, base: 5947.50 },
    { min: 150000, max: 250000, rate: 0.055, base: 7260 },
    { min: 250000, max: Infinity, rate: 0.0575, base: 12760 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 1000, rate: 0.02, base: 0 },
    { min: 1000, max: 2000, rate: 0.03, base: 20 },
    { min: 2000, max: 3000, rate: 0.04, base: 50 },
    { min: 3000, max: 150000, rate: 0.0475, base: 90 },
    { min: 150000, max: 175000, rate: 0.05, base: 7072.50 },
    { min: 175000, max: 225000, rate: 0.0525, base: 8322.50 },
    { min: 225000, max: 300000, rate: 0.055, base: 10947.50 },
    { min: 300000, max: Infinity, rate: 0.0575, base: 15072.50 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 1000, rate: 0.02, base: 0 },
    { min: 1000, max: 2000, rate: 0.03, base: 20 },
    { min: 2000, max: 3000, rate: 0.04, base: 50 },
    { min: 3000, max: 100000, rate: 0.0475, base: 90 },
    { min: 100000, max: 125000, rate: 0.05, base: 4697.50 },
    { min: 125000, max: 150000, rate: 0.0525, base: 5947.50 },
    { min: 150000, max: 250000, rate: 0.055, base: 7260 },
    { min: 250000, max: Infinity, rate: 0.0575, base: 12760 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 1000, rate: 0.02, base: 0 },
    { min: 1000, max: 2000, rate: 0.03, base: 20 },
    { min: 2000, max: 3000, rate: 0.04, base: 50 },
    { min: 3000, max: 150000, rate: 0.0475, base: 90 },
    { min: 150000, max: 175000, rate: 0.05, base: 7072.50 },
    { min: 175000, max: 225000, rate: 0.0525, base: 8322.50 },
    { min: 225000, max: 300000, rate: 0.055, base: 10947.50 },
    { min: 300000, max: Infinity, rate: 0.0575, base: 15072.50 }
  ]
};

// Maryland Standard Deduction
const MD_STANDARD_DEDUCTION_2024: Record<string, { min: number; max: number; percent: number }> = {
  SINGLE: { min: 1800, max: 2700, percent: 0.15 },
  MARRIED_FILING_JOINTLY: { min: 3600, max: 5400, percent: 0.15 },
  MARRIED_FILING_SEPARATELY: { min: 1800, max: 2700, percent: 0.15 },
  HEAD_OF_HOUSEHOLD: { min: 3600, max: 5400, percent: 0.15 }
};

export function calculateMarylandTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = MD_TAX_BRACKETS_2024[filingStatus as keyof typeof MD_TAX_BRACKETS_2024]
    || MD_TAX_BRACKETS_2024.SINGLE;

  // Maryland standard deduction is 15% of income, with min/max
  const deductionConfig = MD_STANDARD_DEDUCTION_2024[filingStatus] || MD_STANDARD_DEDUCTION_2024.SINGLE;
  const annualIncome = grossPay * payPeriodsPerYear;
  let annualStandardDeduction = annualIncome * deductionConfig.percent;
  annualStandardDeduction = Math.max(deductionConfig.min, Math.min(annualStandardDeduction, deductionConfig.max));
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

export const MD_TAX_INFO = {
  brackets: MD_TAX_BRACKETS_2024,
  standardDeductions: MD_STANDARD_DEDUCTION_2024
};
