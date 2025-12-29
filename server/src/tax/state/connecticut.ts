/**
 * Connecticut State Tax Calculator
 * Based on CT Department of Revenue Services (2024)
 *
 * Connecticut has progressive income tax with rates from 3% to 6.99%
 *
 * Includes:
 * - CT Personal Income Tax (progressive)
 * - CT Paid Leave (employee contribution)
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Connecticut Tax Brackets
const CT_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 10000, rate: 0.03, base: 0 },
    { min: 10000, max: 50000, rate: 0.05, base: 300 },
    { min: 50000, max: 100000, rate: 0.055, base: 2300 },
    { min: 100000, max: 200000, rate: 0.06, base: 5050 },
    { min: 200000, max: 250000, rate: 0.065, base: 11050 },
    { min: 250000, max: 500000, rate: 0.069, base: 14300 },
    { min: 500000, max: Infinity, rate: 0.0699, base: 31550 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 20000, rate: 0.03, base: 0 },
    { min: 20000, max: 100000, rate: 0.05, base: 600 },
    { min: 100000, max: 200000, rate: 0.055, base: 4600 },
    { min: 200000, max: 400000, rate: 0.06, base: 10100 },
    { min: 400000, max: 500000, rate: 0.065, base: 22100 },
    { min: 500000, max: 1000000, rate: 0.069, base: 28600 },
    { min: 1000000, max: Infinity, rate: 0.0699, base: 63100 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 10000, rate: 0.03, base: 0 },
    { min: 10000, max: 50000, rate: 0.05, base: 300 },
    { min: 50000, max: 100000, rate: 0.055, base: 2300 },
    { min: 100000, max: 200000, rate: 0.06, base: 5050 },
    { min: 200000, max: 250000, rate: 0.065, base: 11050 },
    { min: 250000, max: 500000, rate: 0.069, base: 14300 },
    { min: 500000, max: Infinity, rate: 0.0699, base: 31550 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 16000, rate: 0.03, base: 0 },
    { min: 16000, max: 80000, rate: 0.05, base: 480 },
    { min: 80000, max: 160000, rate: 0.055, base: 3680 },
    { min: 160000, max: 320000, rate: 0.06, base: 8080 },
    { min: 320000, max: 400000, rate: 0.065, base: 17680 },
    { min: 400000, max: 800000, rate: 0.069, base: 22880 },
    { min: 800000, max: Infinity, rate: 0.0699, base: 50480 }
  ]
};

// CT Paid Leave rate
const CT_PAID_LEAVE_RATE_2024 = 0.005; // 0.5%

export function calculateConnecticutTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const brackets = CT_TAX_BRACKETS_2024[filingStatus as keyof typeof CT_TAX_BRACKETS_2024]
    || CT_TAX_BRACKETS_2024.SINGLE;

  // Annualize for bracket lookup
  const annualTaxableWages = grossPay * payPeriodsPerYear;

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
  const sdi = Math.round(grossPay * CT_PAID_LEAVE_RATE_2024 * 100) / 100;
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

export const CT_TAX_INFO = {
  brackets: CT_TAX_BRACKETS_2024,
  paidLeaveRate: CT_PAID_LEAVE_RATE_2024
};
