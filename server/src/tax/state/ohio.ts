/**
 * Ohio State Tax Calculator
 * Based on Ohio Department of Taxation (2024)
 *
 * Ohio has a progressive income tax with rates from 0% to 3.75%
 * Note: Ohio reduced rates significantly in recent years
 *
 * Includes:
 * - Ohio Personal Income Tax
 * - No state-level SDI or employee SUI
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Ohio Tax Brackets (same for all filing statuses)
// Ohio uses a simplified bracket system
const OH_TAX_BRACKETS_2024 = [
  { min: 0, max: 26050, rate: 0, base: 0 },           // 0%
  { min: 26050, max: 100000, rate: 0.02765, base: 0 }, // 2.765%
  { min: 100000, max: Infinity, rate: 0.0375, base: 2044.63 } // 3.75%
];

// Ohio Personal Exemption 2024
const OH_PERSONAL_EXEMPTION_2024 = 2400; // Per exemption
const OH_DEPENDENT_EXEMPTION_2024 = 2500; // Per dependent

export function calculateOhioTax(input: StateTaxInput): StateTaxResult {
  const {
    grossPay,
    filingStatus,
    payPeriodsPerYear
  } = input;

  // Ohio doesn't use standard deduction, but has personal exemptions
  // For simplicity, we'll apply the personal exemption
  const exemptionPerPeriod = OH_PERSONAL_EXEMPTION_2024 / payPeriodsPerYear;

  // Calculate taxable wages
  let taxableWages = grossPay - exemptionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  // Annualize for bracket lookup
  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  // Calculate annual tax using brackets
  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of OH_TAX_BRACKETS_2024) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  // Handle top bracket
  const topBracket = OH_TAX_BRACKETS_2024[OH_TAX_BRACKETS_2024.length - 1];
  if (annualTaxableWages > topBracket.min) {
    annualTax = topBracket.base + (annualTaxableWages - topBracket.min) * topBracket.rate;
    marginalRate = topBracket.rate;
  }

  // Convert to per-period tax
  let incomeTax = annualTax / payPeriodsPerYear;
  incomeTax = Math.round(incomeTax * 100) / 100;

  // Ohio doesn't have state-level SDI or employee UI
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
      marginalRate: marginalRate * 100
    }
  };
}

export const OH_TAX_INFO = {
  brackets: OH_TAX_BRACKETS_2024,
  personalExemption: OH_PERSONAL_EXEMPTION_2024,
  dependentExemption: OH_DEPENDENT_EXEMPTION_2024
};
