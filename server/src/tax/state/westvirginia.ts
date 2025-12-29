/**
 * West Virginia State Tax Calculator
 * Based on West Virginia State Tax Department (2024)
 *
 * West Virginia has progressive income tax with rates from 2.36% to 5.12%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 West Virginia Tax Brackets (same for all filing statuses)
const WV_TAX_BRACKETS_2024 = [
  { min: 0, max: 10000, rate: 0.0236, base: 0 },
  { min: 10000, max: 25000, rate: 0.0315, base: 236 },
  { min: 25000, max: 40000, rate: 0.0354, base: 708.50 },
  { min: 40000, max: 60000, rate: 0.0472, base: 1239.50 },
  { min: 60000, max: Infinity, rate: 0.0512, base: 2183.50 }
];

export function calculateWestVirginiaTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, payPeriodsPerYear } = input;

  // WV doesn't have a standard deduction, uses personal exemptions
  const annualTaxableWages = grossPay * payPeriodsPerYear;

  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of WV_TAX_BRACKETS_2024) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  const topBracket = WV_TAX_BRACKETS_2024[WV_TAX_BRACKETS_2024.length - 1];
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
      taxableWages: Math.round(grossPay * 100) / 100,
      marginalRate: marginalRate * 100
    }
  };
}

export const WV_TAX_INFO = {
  brackets: WV_TAX_BRACKETS_2024
};
