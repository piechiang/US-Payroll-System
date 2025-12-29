/**
 * Rhode Island State Tax Calculator
 * Based on Rhode Island Division of Taxation (2024)
 *
 * Rhode Island has progressive income tax with rates from 3.75% to 5.99%
 * Also has Temporary Disability Insurance (TDI)
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Rhode Island Tax Brackets (same for all filing statuses)
const RI_TAX_BRACKETS_2024 = [
  { min: 0, max: 77450, rate: 0.0375, base: 0 },
  { min: 77450, max: 176050, rate: 0.0475, base: 2904.38 },
  { min: 176050, max: Infinity, rate: 0.0599, base: 7587.88 }
];

// Rhode Island Standard Deduction
const RI_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 10550,
  MARRIED_FILING_JOINTLY: 21100,
  MARRIED_FILING_SEPARATELY: 10550,
  HEAD_OF_HOUSEHOLD: 15800
};

// Rhode Island TDI (Temporary Disability Insurance)
const RI_TDI_RATE_2024 = 0.012; // 1.2%
const RI_TDI_WAGE_CAP_2024 = 87000;

export function calculateRhodeIslandTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear, ytdGrossWages = 0 } = input;

  const annualStandardDeduction = RI_STANDARD_DEDUCTION_2024[filingStatus] || 10550;
  const deductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of RI_TAX_BRACKETS_2024) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  const topBracket = RI_TAX_BRACKETS_2024[RI_TAX_BRACKETS_2024.length - 1];
  if (annualTaxableWages > topBracket.min) {
    annualTax = topBracket.base + (annualTaxableWages - topBracket.min) * topBracket.rate;
    marginalRate = topBracket.rate;
  }

  const incomeTax = Math.round((annualTax / payPeriodsPerYear) * 100) / 100;

  // TDI calculation with wage cap
  const remainingTdiWages = Math.max(0, RI_TDI_WAGE_CAP_2024 - ytdGrossWages);
  const tdiWages = Math.min(grossPay, remainingTdiWages);
  const sdi = Math.round(tdiWages * RI_TDI_RATE_2024 * 100) / 100;

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

export const RI_TAX_INFO = {
  brackets: RI_TAX_BRACKETS_2024,
  standardDeductions: RI_STANDARD_DEDUCTION_2024,
  tdiRate: RI_TDI_RATE_2024,
  tdiWageCap: RI_TDI_WAGE_CAP_2024
};
