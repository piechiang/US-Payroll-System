/**
 * Idaho State Tax Calculator
 * Based on Idaho State Tax Commission (2024)
 *
 * Idaho has a FLAT income tax rate: 5.8% for 2024
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Idaho Tax Rate - FLAT TAX
const ID_FLAT_TAX_RATE_2024 = 0.058; // 5.8%

// Idaho Standard Deduction (mirrors federal)
const ID_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 14600,
  MARRIED_FILING_JOINTLY: 29200,
  MARRIED_FILING_SEPARATELY: 14600,
  HEAD_OF_HOUSEHOLD: 21900
};

export function calculateIdahoTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const annualStandardDeduction = ID_STANDARD_DEDUCTION_2024[filingStatus] || 14600;
  const deductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const incomeTax = Math.round(taxableWages * ID_FLAT_TAX_RATE_2024 * 100) / 100;
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
      marginalRate: ID_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const ID_TAX_INFO = {
  flatRate: ID_FLAT_TAX_RATE_2024,
  standardDeductions: ID_STANDARD_DEDUCTION_2024
};
