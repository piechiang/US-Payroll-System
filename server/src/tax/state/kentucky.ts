/**
 * Kentucky State Tax Calculator
 * Based on Kentucky Department of Revenue (2024)
 *
 * Kentucky has a FLAT income tax rate: 4.0% for 2024
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Kentucky Tax Rate - FLAT TAX
const KY_FLAT_TAX_RATE_2024 = 0.04; // 4.0%

// Kentucky Standard Deduction
const KY_STANDARD_DEDUCTION_2024 = 3160;

export function calculateKentuckyTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, payPeriodsPerYear } = input;

  const deductionPerPeriod = KY_STANDARD_DEDUCTION_2024 / payPeriodsPerYear;

  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const incomeTax = Math.round(taxableWages * KY_FLAT_TAX_RATE_2024 * 100) / 100;
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
      marginalRate: KY_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const KY_TAX_INFO = {
  flatRate: KY_FLAT_TAX_RATE_2024,
  standardDeduction: KY_STANDARD_DEDUCTION_2024
};
