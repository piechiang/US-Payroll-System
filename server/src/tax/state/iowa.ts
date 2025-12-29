/**
 * Iowa State Tax Calculator
 * Based on Iowa Department of Revenue (2024)
 *
 * Iowa has a FLAT income tax rate: 3.8% for 2024
 * (Transitioning to flat tax - was progressive previously)
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Iowa Tax Rate - FLAT TAX
const IA_FLAT_TAX_RATE_2024 = 0.038; // 3.8%

// Iowa Standard Deduction
const IA_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 2210,
  MARRIED_FILING_JOINTLY: 5450,
  MARRIED_FILING_SEPARATELY: 2210,
  HEAD_OF_HOUSEHOLD: 5450
};

export function calculateIowaTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const annualStandardDeduction = IA_STANDARD_DEDUCTION_2024[filingStatus] || 2210;
  const deductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const incomeTax = Math.round(taxableWages * IA_FLAT_TAX_RATE_2024 * 100) / 100;
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
      marginalRate: IA_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const IA_TAX_INFO = {
  flatRate: IA_FLAT_TAX_RATE_2024,
  standardDeductions: IA_STANDARD_DEDUCTION_2024
};
