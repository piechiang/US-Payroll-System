/**
 * North Dakota State Tax Calculator
 * Based on North Dakota Office of State Tax Commissioner (2024)
 *
 * North Dakota has progressive income tax with rates from 0% to 2.5%
 * Note: ND has very low state income tax rates
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 North Dakota Tax Brackets (same for all filing statuses, different thresholds)
const ND_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 44725, rate: 0, base: 0 },
    { min: 44725, max: 225975, rate: 0.0195, base: 0 },
    { min: 225975, max: Infinity, rate: 0.025, base: 3534.38 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 74750, rate: 0, base: 0 },
    { min: 74750, max: 275100, rate: 0.0195, base: 0 },
    { min: 275100, max: Infinity, rate: 0.025, base: 3906.83 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 37375, rate: 0, base: 0 },
    { min: 37375, max: 137550, rate: 0.0195, base: 0 },
    { min: 137550, max: Infinity, rate: 0.025, base: 1953.41 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 59950, rate: 0, base: 0 },
    { min: 59950, max: 250500, rate: 0.0195, base: 0 },
    { min: 250500, max: Infinity, rate: 0.025, base: 3715.73 }
  ]
};

export function calculateNorthDakotaTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = ND_TAX_BRACKETS_2024[filingStatus as keyof typeof ND_TAX_BRACKETS_2024]
    || ND_TAX_BRACKETS_2024.SINGLE;

  // ND uses federal taxable income (after standard deduction)
  // For simplicity, apply federal standard deduction
  const federalStandardDeduction: Record<string, number> = {
    SINGLE: 14600,
    MARRIED_FILING_JOINTLY: 29200,
    MARRIED_FILING_SEPARATELY: 14600,
    HEAD_OF_HOUSEHOLD: 21900
  };

  const deductionPerPeriod = (federalStandardDeduction[filingStatus] || 14600) / payPeriodsPerYear;

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

export const ND_TAX_INFO = {
  brackets: ND_TAX_BRACKETS_2024
};
