/**
 * North Carolina State Tax Calculator
 * Based on NC Department of Revenue (2024)
 *
 * North Carolina has a FLAT income tax rate: 5.25% for 2024
 * (Rate has been decreasing: was 5.25% in 2023, 5.25% in 2024)
 *
 * Includes:
 * - NC Personal Income Tax (flat 5.25%)
 * - No state-level SDI or employee SUI
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 North Carolina Tax Rate - FLAT TAX
const NC_FLAT_TAX_RATE_2024 = 0.0525; // 5.25%

// North Carolina Standard Deduction 2024
const NC_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 12750,
  MARRIED_FILING_JOINTLY: 25500,
  MARRIED_FILING_SEPARATELY: 12750,
  HEAD_OF_HOUSEHOLD: 19125
};

export function calculateNorthCarolinaTax(input: StateTaxInput): StateTaxResult {
  const {
    grossPay,
    filingStatus,
    payPeriodsPerYear
  } = input;

  // Calculate standard deduction per pay period
  const annualStandardDeduction = NC_STANDARD_DEDUCTION_2024[filingStatus] || 12750;
  const deductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  // Calculate taxable wages
  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  // Calculate income tax (flat rate)
  let incomeTax = taxableWages * NC_FLAT_TAX_RATE_2024;
  incomeTax = Math.round(incomeTax * 100) / 100;

  // NC doesn't have state-level SDI or employee UI
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
      marginalRate: NC_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const NC_TAX_INFO = {
  flatRate: NC_FLAT_TAX_RATE_2024,
  standardDeductions: NC_STANDARD_DEDUCTION_2024
};
