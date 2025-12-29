/**
 * Illinois State Tax Calculator
 * Based on IL Department of Revenue (2024)
 *
 * Illinois has a FLAT income tax rate (4.95%)
 *
 * Includes:
 * - IL Personal Income Tax (flat 4.95%)
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Illinois Tax Rate - FLAT TAX
const IL_FLAT_TAX_RATE_2024 = 0.0495; // 4.95%

// Illinois Exemption Allowance (reduces taxable income)
const IL_PERSONAL_EXEMPTION_2024: Record<string, number> = {
  SINGLE: 2625,
  MARRIED_FILING_JOINTLY: 5250,
  MARRIED_FILING_SEPARATELY: 2625,
  HEAD_OF_HOUSEHOLD: 2625
};

export function calculateIllinoisTax(input: StateTaxInput): StateTaxResult {
  const {
    grossPay,
    filingStatus,
    payPeriodsPerYear
  } = input;

  // Calculate exemption per pay period
  const annualExemption = IL_PERSONAL_EXEMPTION_2024[filingStatus] || 2625;
  const exemptionPerPeriod = annualExemption / payPeriodsPerYear;

  // Calculate taxable wages
  let taxableWages = grossPay - exemptionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  // Calculate income tax (flat rate)
  const incomeTax = Math.round(taxableWages * IL_FLAT_TAX_RATE_2024 * 100) / 100;

  // IL doesn't have state-level SDI or employee UI
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
      marginalRate: IL_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const IL_TAX_INFO = {
  flatRate: IL_FLAT_TAX_RATE_2024,
  personalExemptions: IL_PERSONAL_EXEMPTION_2024
};
