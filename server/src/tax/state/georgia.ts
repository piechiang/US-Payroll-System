/**
 * Georgia State Tax Calculator
 * Based on Georgia Department of Revenue (2024)
 *
 * Georgia moved to a FLAT tax rate starting 2024: 5.49%
 * (Previously had progressive brackets)
 *
 * Includes:
 * - GA Personal Income Tax (flat 5.49%)
 * - No state-level SDI or employee SUI
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Georgia Tax Rate - FLAT TAX (new as of 2024)
const GA_FLAT_TAX_RATE_2024 = 0.0549; // 5.49%

// Georgia Standard Deduction 2024
const GA_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 12000,
  MARRIED_FILING_JOINTLY: 24000,
  MARRIED_FILING_SEPARATELY: 12000,
  HEAD_OF_HOUSEHOLD: 18000
};

// Georgia Personal Exemption 2024
const GA_PERSONAL_EXEMPTION_2024: Record<string, number> = {
  SINGLE: 2700,
  MARRIED_FILING_JOINTLY: 7400, // Taxpayer + spouse
  MARRIED_FILING_SEPARATELY: 2700,
  HEAD_OF_HOUSEHOLD: 2700
};

export function calculateGeorgiaTax(input: StateTaxInput): StateTaxResult {
  const {
    grossPay,
    filingStatus,
    payPeriodsPerYear
  } = input;

  // Calculate deductions per pay period
  const annualStandardDeduction = GA_STANDARD_DEDUCTION_2024[filingStatus] || 12000;
  const annualPersonalExemption = GA_PERSONAL_EXEMPTION_2024[filingStatus] || 2700;
  const totalAnnualDeduction = annualStandardDeduction + annualPersonalExemption;
  const deductionPerPeriod = totalAnnualDeduction / payPeriodsPerYear;

  // Calculate taxable wages
  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  // Calculate income tax (flat rate)
  let incomeTax = taxableWages * GA_FLAT_TAX_RATE_2024;
  incomeTax = Math.round(incomeTax * 100) / 100;

  // Georgia doesn't have state-level SDI or employee UI
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
      marginalRate: GA_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const GA_TAX_INFO = {
  flatRate: GA_FLAT_TAX_RATE_2024,
  standardDeductions: GA_STANDARD_DEDUCTION_2024,
  personalExemptions: GA_PERSONAL_EXEMPTION_2024
};
