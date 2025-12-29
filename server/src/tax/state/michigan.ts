/**
 * Michigan State Tax Calculator
 * Based on Michigan Department of Treasury (2024)
 *
 * Michigan has a FLAT income tax rate: 4.25% for 2024
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Michigan Tax Rate - FLAT TAX
const MI_FLAT_TAX_RATE_2024 = 0.0425; // 4.25%

// Michigan Personal Exemption
const MI_PERSONAL_EXEMPTION_2024 = 5600;

export function calculateMichiganTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  let exemptions = MI_PERSONAL_EXEMPTION_2024;
  if (filingStatus === 'MARRIED_FILING_JOINTLY') {
    exemptions += MI_PERSONAL_EXEMPTION_2024;
  }
  const exemptionPerPeriod = exemptions / payPeriodsPerYear;

  let taxableWages = grossPay - exemptionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const incomeTax = Math.round(taxableWages * MI_FLAT_TAX_RATE_2024 * 100) / 100;
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
      marginalRate: MI_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const MI_TAX_INFO = {
  flatRate: MI_FLAT_TAX_RATE_2024,
  personalExemption: MI_PERSONAL_EXEMPTION_2024
};
