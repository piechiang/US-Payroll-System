/**
 * New Jersey State Tax Calculator
 * Based on NJ Division of Taxation (2024)
 *
 * Includes:
 * - New Jersey Gross Income Tax (progressive rates)
 * - NJ State Disability Insurance (SDI)
 * - NJ Family Leave Insurance (FLI)
 * - NJ Unemployment Insurance (employee portion)
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 New Jersey Tax Brackets
const NJ_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 20000, rate: 0.014, base: 0 },
    { min: 20000, max: 35000, rate: 0.0175, base: 280 },
    { min: 35000, max: 40000, rate: 0.035, base: 542.50 },
    { min: 40000, max: 75000, rate: 0.05525, base: 717.50 },
    { min: 75000, max: 500000, rate: 0.0637, base: 2651.25 },
    { min: 500000, max: 1000000, rate: 0.0897, base: 29723.75 },
    { min: 1000000, max: Infinity, rate: 0.1075, base: 74573.75 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 20000, rate: 0.014, base: 0 },
    { min: 20000, max: 50000, rate: 0.0175, base: 280 },
    { min: 50000, max: 70000, rate: 0.0245, base: 805 },
    { min: 70000, max: 80000, rate: 0.035, base: 1295 },
    { min: 80000, max: 150000, rate: 0.05525, base: 1645 },
    { min: 150000, max: 500000, rate: 0.0637, base: 5512.50 },
    { min: 500000, max: 1000000, rate: 0.0897, base: 27807.50 },
    { min: 1000000, max: Infinity, rate: 0.1075, base: 72657.50 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 20000, rate: 0.014, base: 0 },
    { min: 20000, max: 50000, rate: 0.0175, base: 280 },
    { min: 50000, max: 70000, rate: 0.0245, base: 805 },
    { min: 70000, max: 80000, rate: 0.035, base: 1295 },
    { min: 80000, max: 150000, rate: 0.05525, base: 1645 },
    { min: 150000, max: 500000, rate: 0.0637, base: 5512.50 },
    { min: 500000, max: 1000000, rate: 0.0897, base: 27807.50 },
    { min: 1000000, max: Infinity, rate: 0.1075, base: 72657.50 }
  ]
};

// 2024 NJ SDI/FLI/UI Rates
const NJ_SDI_RATE_2024 = 0.0014;           // 0.14% SDI
const NJ_FLI_RATE_2024 = 0.0009;           // 0.09% Family Leave Insurance
const NJ_UI_RATE_2024 = 0.003825;          // 0.3825% Unemployment (employee)
const NJ_WF_RATE_2024 = 0.000425;          // 0.0425% Workforce Development
const NJ_TAXABLE_WAGE_BASE_2024 = 161400;  // 2024 taxable wage base

export function calculateNewJerseyTax(input: StateTaxInput): StateTaxResult {
  const {
    grossPay,
    annualIncome,
    filingStatus,
    payPeriodsPerYear,
    ytdGrossWages = 0
  } = input;

  // Map filing status
  let njFilingStatus = filingStatus;
  if (filingStatus === 'MARRIED_FILING_SEPARATELY') {
    njFilingStatus = 'SINGLE';
  }

  // Get appropriate tax brackets
  const brackets = NJ_TAX_BRACKETS_2024[njFilingStatus as keyof typeof NJ_TAX_BRACKETS_2024]
    || NJ_TAX_BRACKETS_2024.SINGLE;

  // NJ doesn't have standard deduction for withholding
  const taxableWages = grossPay;

  // Annualize for bracket lookup
  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  // Calculate annual tax using brackets
  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of brackets) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  // Handle top bracket
  const topBracket = brackets[brackets.length - 1];
  if (annualTaxableWages > topBracket.min) {
    annualTax = topBracket.base + (annualTaxableWages - topBracket.min) * topBracket.rate;
    marginalRate = topBracket.rate;
  }

  // Convert to per-period tax
  let incomeTax = annualTax / payPeriodsPerYear;
  incomeTax = Math.round(incomeTax * 100) / 100;

  // Calculate SDI/FLI/UI (combined as SDI for simplicity)
  const remainingWages = Math.max(0, NJ_TAXABLE_WAGE_BASE_2024 - ytdGrossWages);
  const wagesSubjectToSDI = Math.min(grossPay, remainingWages);

  const sdiRate = NJ_SDI_RATE_2024 + NJ_FLI_RATE_2024; // Combined SDI + FLI
  const sdi = Math.round(wagesSubjectToSDI * sdiRate * 100) / 100;

  // UI and WF combined
  const sui = Math.round(wagesSubjectToSDI * (NJ_UI_RATE_2024 + NJ_WF_RATE_2024) * 100) / 100;

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

export const NJ_TAX_INFO = {
  rates: NJ_TAX_BRACKETS_2024,
  sdiRate: NJ_SDI_RATE_2024,
  fliRate: NJ_FLI_RATE_2024,
  uiRate: NJ_UI_RATE_2024,
  taxableWageBase: NJ_TAXABLE_WAGE_BASE_2024
};
