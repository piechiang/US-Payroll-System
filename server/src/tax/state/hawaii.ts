/**
 * Hawaii State Tax Calculator
 * Based on Hawaii Department of Taxation (2024)
 *
 * Hawaii has progressive income tax with rates from 1.4% to 11%
 * Also has Temporary Disability Insurance (TDI)
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Hawaii Tax Brackets
const HI_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 2400, rate: 0.014, base: 0 },
    { min: 2400, max: 4800, rate: 0.032, base: 33.60 },
    { min: 4800, max: 9600, rate: 0.055, base: 110.40 },
    { min: 9600, max: 14400, rate: 0.064, base: 374.40 },
    { min: 14400, max: 19200, rate: 0.068, base: 681.60 },
    { min: 19200, max: 24000, rate: 0.072, base: 1008 },
    { min: 24000, max: 36000, rate: 0.076, base: 1353.60 },
    { min: 36000, max: 48000, rate: 0.079, base: 2265.60 },
    { min: 48000, max: 150000, rate: 0.0825, base: 3213.60 },
    { min: 150000, max: 175000, rate: 0.09, base: 11628.60 },
    { min: 175000, max: 200000, rate: 0.10, base: 13878.60 },
    { min: 200000, max: Infinity, rate: 0.11, base: 16378.60 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 4800, rate: 0.014, base: 0 },
    { min: 4800, max: 9600, rate: 0.032, base: 67.20 },
    { min: 9600, max: 19200, rate: 0.055, base: 220.80 },
    { min: 19200, max: 28800, rate: 0.064, base: 748.80 },
    { min: 28800, max: 38400, rate: 0.068, base: 1363.20 },
    { min: 38400, max: 48000, rate: 0.072, base: 2016 },
    { min: 48000, max: 72000, rate: 0.076, base: 2707.20 },
    { min: 72000, max: 96000, rate: 0.079, base: 4531.20 },
    { min: 96000, max: 300000, rate: 0.0825, base: 6427.20 },
    { min: 300000, max: 350000, rate: 0.09, base: 23257.20 },
    { min: 350000, max: 400000, rate: 0.10, base: 27757.20 },
    { min: 400000, max: Infinity, rate: 0.11, base: 32757.20 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 2400, rate: 0.014, base: 0 },
    { min: 2400, max: 4800, rate: 0.032, base: 33.60 },
    { min: 4800, max: 9600, rate: 0.055, base: 110.40 },
    { min: 9600, max: 14400, rate: 0.064, base: 374.40 },
    { min: 14400, max: 19200, rate: 0.068, base: 681.60 },
    { min: 19200, max: 24000, rate: 0.072, base: 1008 },
    { min: 24000, max: 36000, rate: 0.076, base: 1353.60 },
    { min: 36000, max: 48000, rate: 0.079, base: 2265.60 },
    { min: 48000, max: 150000, rate: 0.0825, base: 3213.60 },
    { min: 150000, max: 175000, rate: 0.09, base: 11628.60 },
    { min: 175000, max: 200000, rate: 0.10, base: 13878.60 },
    { min: 200000, max: Infinity, rate: 0.11, base: 16378.60 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 3600, rate: 0.014, base: 0 },
    { min: 3600, max: 7200, rate: 0.032, base: 50.40 },
    { min: 7200, max: 14400, rate: 0.055, base: 165.60 },
    { min: 14400, max: 21600, rate: 0.064, base: 561.60 },
    { min: 21600, max: 28800, rate: 0.068, base: 1022.40 },
    { min: 28800, max: 36000, rate: 0.072, base: 1512 },
    { min: 36000, max: 54000, rate: 0.076, base: 2030.40 },
    { min: 54000, max: 72000, rate: 0.079, base: 3398.40 },
    { min: 72000, max: 225000, rate: 0.0825, base: 4820.40 },
    { min: 225000, max: 262500, rate: 0.09, base: 17442.90 },
    { min: 262500, max: 300000, rate: 0.10, base: 20817.90 },
    { min: 300000, max: Infinity, rate: 0.11, base: 24567.90 }
  ]
};

// Hawaii TDI (Temporary Disability Insurance)
const HI_TDI_RATE_2024 = 0.005; // 0.5% employee portion
const HI_TDI_WAGE_CAP_2024 = 70908.96;

export function calculateHawaiiTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear, ytdGrossWages = 0 } = input;

  const brackets = HI_TAX_BRACKETS_2024[filingStatus as keyof typeof HI_TAX_BRACKETS_2024]
    || HI_TAX_BRACKETS_2024.SINGLE;

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

  // TDI calculation with wage cap
  const remainingTdiWages = Math.max(0, HI_TDI_WAGE_CAP_2024 - ytdGrossWages);
  const tdiWages = Math.min(grossPay, remainingTdiWages);
  const sdi = Math.round(tdiWages * HI_TDI_RATE_2024 * 100) / 100;

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

export const HI_TAX_INFO = {
  brackets: HI_TAX_BRACKETS_2024,
  tdiRate: HI_TDI_RATE_2024,
  tdiWageCap: HI_TDI_WAGE_CAP_2024
};
