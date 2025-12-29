/**
 * Pennsylvania State Tax Calculator
 * Based on PA Department of Revenue (2024)
 *
 * Pennsylvania has a FLAT income tax rate (3.07%)
 * Local Earned Income Tax (EIT) varies by municipality (not included here)
 *
 * Includes:
 * - PA Personal Income Tax (flat 3.07%)
 * - PA Unemployment Compensation (employee portion)
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Pennsylvania Tax Rate - FLAT TAX
const PA_FLAT_TAX_RATE_2024 = 0.0307; // 3.07%

// PA UC (Unemployment Compensation) - employee portion
const PA_UC_RATE_2024 = 0.0006; // 0.06%
const PA_UC_WAGE_BASE_2024 = 10000; // Very low wage base

export function calculatePennsylvaniaTax(input: StateTaxInput): StateTaxResult {
  const {
    grossPay,
    ytdGrossWages = 0
  } = input;

  // PA has flat tax - no brackets, no deductions for withholding
  const taxableWages = grossPay;

  // Calculate income tax (flat rate)
  const incomeTax = Math.round(taxableWages * PA_FLAT_TAX_RATE_2024 * 100) / 100;

  // Calculate UC (employee portion)
  const remainingWagesForUC = Math.max(0, PA_UC_WAGE_BASE_2024 - ytdGrossWages);
  const wagesSubjectToUC = Math.min(grossPay, remainingWagesForUC);
  const sui = Math.round(wagesSubjectToUC * PA_UC_RATE_2024 * 100) / 100;

  // PA doesn't have state-level SDI
  const sdi = 0;

  const total = incomeTax + sdi + sui;

  return {
    incomeTax,
    sdi,
    sui,
    total: Math.round(total * 100) / 100,
    details: {
      taxableWages: Math.round(taxableWages * 100) / 100,
      marginalRate: PA_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const PA_TAX_INFO = {
  flatRate: PA_FLAT_TAX_RATE_2024,
  ucRate: PA_UC_RATE_2024,
  ucWageBase: PA_UC_WAGE_BASE_2024
};
