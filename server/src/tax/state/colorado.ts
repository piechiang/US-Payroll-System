/**
 * Colorado State Tax Calculator
 * Based on Colorado Department of Revenue (2024)
 *
 * Colorado has a FLAT income tax rate: 4.4% for 2024
 *
 * Includes:
 * - CO Personal Income Tax (flat 4.4%)
 * - CO Paid Family Medical Leave (PFML) - 0.9% split employer/employee
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Colorado Tax Rate - FLAT TAX
const CO_FLAT_TAX_RATE_2024 = 0.044; // 4.4%

// Colorado PFML (employee portion)
const CO_PFML_EMPLOYEE_RATE_2024 = 0.0045; // 0.45% employee portion

export function calculateColoradoTax(input: StateTaxInput): StateTaxResult {
  const { grossPay } = input;

  // Colorado uses federal taxable wages (no state-specific deductions)
  const taxableWages = grossPay;

  // Calculate income tax (flat rate)
  const incomeTax = Math.round(taxableWages * CO_FLAT_TAX_RATE_2024 * 100) / 100;

  // Colorado PFML (similar to SDI)
  const sdi = Math.round(grossPay * CO_PFML_EMPLOYEE_RATE_2024 * 100) / 100;

  const sui = 0;
  const total = incomeTax + sdi + sui;

  return {
    incomeTax,
    sdi,
    sui,
    total: Math.round(total * 100) / 100,
    details: {
      taxableWages: Math.round(taxableWages * 100) / 100,
      marginalRate: CO_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const CO_TAX_INFO = {
  flatRate: CO_FLAT_TAX_RATE_2024,
  pfmlRate: CO_PFML_EMPLOYEE_RATE_2024
};
