/**
 * Arizona State Tax Calculator
 * Based on Arizona Department of Revenue (2024)
 *
 * Arizona has a FLAT income tax rate: 2.5% for 2024
 * (Previously had progressive brackets, moved to flat in 2023)
 *
 * Includes:
 * - AZ Personal Income Tax (flat 2.5%)
 * - No state-level SDI or employee SUI
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Arizona Tax Rate - FLAT TAX
const AZ_FLAT_TAX_RATE_2024 = 0.025; // 2.5%

// Arizona Standard Deduction 2024
const AZ_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 14600,
  MARRIED_FILING_JOINTLY: 29200,
  MARRIED_FILING_SEPARATELY: 14600,
  HEAD_OF_HOUSEHOLD: 21900
};

export function calculateArizonaTax(input: StateTaxInput): StateTaxResult {
  const {
    grossPay,
    filingStatus,
    payPeriodsPerYear
  } = input;

  // Calculate standard deduction per pay period
  const annualStandardDeduction = AZ_STANDARD_DEDUCTION_2024[filingStatus] || 14600;
  const deductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  // Calculate taxable wages
  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  // Calculate income tax (flat rate)
  let incomeTax = taxableWages * AZ_FLAT_TAX_RATE_2024;
  incomeTax = Math.round(incomeTax * 100) / 100;

  // AZ doesn't have state-level SDI or employee UI
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
      marginalRate: AZ_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const AZ_TAX_INFO = {
  flatRate: AZ_FLAT_TAX_RATE_2024,
  standardDeductions: AZ_STANDARD_DEDUCTION_2024
};
