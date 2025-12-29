/**
 * Indiana State Tax Calculator
 * Based on Indiana Department of Revenue (2024)
 *
 * Indiana has a FLAT income tax rate: 3.05% for 2024
 * Note: Many Indiana counties also have local income taxes
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Indiana Tax Rate - FLAT TAX
const IN_FLAT_TAX_RATE_2024 = 0.0305; // 3.05%

// Indiana Personal Exemption
const IN_PERSONAL_EXEMPTION_2024 = 1000;
const IN_DEPENDENT_EXEMPTION_2024 = 1500;

export function calculateIndianaTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  // Calculate exemption per period
  let exemptions = IN_PERSONAL_EXEMPTION_2024;
  if (filingStatus === 'MARRIED_FILING_JOINTLY') {
    exemptions += IN_PERSONAL_EXEMPTION_2024; // Spouse exemption
  }
  const exemptionPerPeriod = exemptions / payPeriodsPerYear;

  let taxableWages = grossPay - exemptionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const incomeTax = Math.round(taxableWages * IN_FLAT_TAX_RATE_2024 * 100) / 100;
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
      marginalRate: IN_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const IN_TAX_INFO = {
  flatRate: IN_FLAT_TAX_RATE_2024,
  personalExemption: IN_PERSONAL_EXEMPTION_2024,
  dependentExemption: IN_DEPENDENT_EXEMPTION_2024
};
