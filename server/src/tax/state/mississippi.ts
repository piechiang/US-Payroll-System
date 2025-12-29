/**
 * Mississippi State Tax Calculator
 * Based on Mississippi Department of Revenue (2024)
 *
 * Mississippi has a FLAT income tax rate: 4.7% for 2024
 * (Transitioning to flat tax)
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Mississippi Tax Rate - FLAT TAX
const MS_FLAT_TAX_RATE_2024 = 0.047; // 4.7%

// Mississippi Standard Deduction
const MS_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 2300,
  MARRIED_FILING_JOINTLY: 4600,
  MARRIED_FILING_SEPARATELY: 2300,
  HEAD_OF_HOUSEHOLD: 3400
};

// Mississippi Personal Exemption
const MS_PERSONAL_EXEMPTION_2024: Record<string, number> = {
  SINGLE: 6000,
  MARRIED_FILING_JOINTLY: 12000,
  MARRIED_FILING_SEPARATELY: 6000,
  HEAD_OF_HOUSEHOLD: 8000
};

export function calculateMississippiTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const annualStandardDeduction = MS_STANDARD_DEDUCTION_2024[filingStatus] || 2300;
  const annualPersonalExemption = MS_PERSONAL_EXEMPTION_2024[filingStatus] || 6000;
  const totalDeductionPerPeriod = (annualStandardDeduction + annualPersonalExemption) / payPeriodsPerYear;

  let taxableWages = grossPay - totalDeductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const incomeTax = Math.round(taxableWages * MS_FLAT_TAX_RATE_2024 * 100) / 100;
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
      marginalRate: MS_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const MS_TAX_INFO = {
  flatRate: MS_FLAT_TAX_RATE_2024,
  standardDeductions: MS_STANDARD_DEDUCTION_2024,
  personalExemptions: MS_PERSONAL_EXEMPTION_2024
};
