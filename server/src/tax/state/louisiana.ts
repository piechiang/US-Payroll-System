/**
 * Louisiana State Tax Calculator
 * Based on Louisiana Department of Revenue (2024)
 *
 * Louisiana has progressive income tax with rates from 1.85% to 4.25%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Louisiana Tax Brackets
const LA_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 12500, rate: 0.0185, base: 0 },
    { min: 12500, max: 50000, rate: 0.035, base: 231.25 },
    { min: 50000, max: Infinity, rate: 0.0425, base: 1543.75 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 25000, rate: 0.0185, base: 0 },
    { min: 25000, max: 100000, rate: 0.035, base: 462.50 },
    { min: 100000, max: Infinity, rate: 0.0425, base: 3087.50 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 12500, rate: 0.0185, base: 0 },
    { min: 12500, max: 50000, rate: 0.035, base: 231.25 },
    { min: 50000, max: Infinity, rate: 0.0425, base: 1543.75 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 12500, rate: 0.0185, base: 0 },
    { min: 12500, max: 50000, rate: 0.035, base: 231.25 },
    { min: 50000, max: Infinity, rate: 0.0425, base: 1543.75 }
  ]
};

// Louisiana Personal Exemption
const LA_PERSONAL_EXEMPTION_2024: Record<string, number> = {
  SINGLE: 4500,
  MARRIED_FILING_JOINTLY: 9000,
  MARRIED_FILING_SEPARATELY: 4500,
  HEAD_OF_HOUSEHOLD: 9000
};

export function calculateLouisianaTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = LA_TAX_BRACKETS_2024[filingStatus as keyof typeof LA_TAX_BRACKETS_2024]
    || LA_TAX_BRACKETS_2024.SINGLE;

  const annualExemption = LA_PERSONAL_EXEMPTION_2024[filingStatus] || 4500;
  const exemptionPerPeriod = annualExemption / payPeriodsPerYear;

  let taxableWages = grossPay - exemptionPerPeriod;
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

export const LA_TAX_INFO = {
  brackets: LA_TAX_BRACKETS_2024,
  personalExemptions: LA_PERSONAL_EXEMPTION_2024
};
