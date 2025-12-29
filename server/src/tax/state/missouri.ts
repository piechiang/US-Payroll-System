/**
 * Missouri State Tax Calculator
 * Based on Missouri Department of Revenue (2024)
 *
 * Missouri has a FLAT income tax rate: 4.8% for 2024
 * (Was progressive, transitioned to flat in 2024)
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Missouri Tax Rate - FLAT TAX
const MO_FLAT_TAX_RATE_2024 = 0.048; // 4.8%

// Missouri Standard Deduction (mirrors federal)
const MO_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 14600,
  MARRIED_FILING_JOINTLY: 29200,
  MARRIED_FILING_SEPARATELY: 14600,
  HEAD_OF_HOUSEHOLD: 21900
};

export function calculateMissouriTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const annualStandardDeduction = MO_STANDARD_DEDUCTION_2024[filingStatus] || 14600;
  const deductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const incomeTax = Math.round(taxableWages * MO_FLAT_TAX_RATE_2024 * 100) / 100;
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
      marginalRate: MO_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const MO_TAX_INFO = {
  flatRate: MO_FLAT_TAX_RATE_2024,
  standardDeductions: MO_STANDARD_DEDUCTION_2024
};
