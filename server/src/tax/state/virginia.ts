/**
 * Virginia State Tax Calculator
 * Based on Virginia Department of Taxation (2024)
 *
 * Virginia has a progressive income tax with rates from 2% to 5.75%
 *
 * Includes:
 * - VA Personal Income Tax (progressive 2% - 5.75%)
 * - No state-level SDI or employee SUI
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Virginia Tax Brackets (same for all filing statuses)
const VA_TAX_BRACKETS_2024 = [
  { min: 0, max: 3000, rate: 0.02, base: 0 },
  { min: 3000, max: 5000, rate: 0.03, base: 60 },
  { min: 5000, max: 17000, rate: 0.05, base: 120 },
  { min: 17000, max: Infinity, rate: 0.0575, base: 720 }
];

// Virginia Standard Deduction 2024
const VA_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 8000,
  MARRIED_FILING_JOINTLY: 16000,
  MARRIED_FILING_SEPARATELY: 8000,
  HEAD_OF_HOUSEHOLD: 8000
};

// Virginia Personal Exemption 2024
const VA_PERSONAL_EXEMPTION_2024 = 930; // Per person

export function calculateVirginiaTax(input: StateTaxInput): StateTaxResult {
  const {
    grossPay,
    filingStatus,
    payPeriodsPerYear
  } = input;

  // Calculate deductions per pay period
  const annualStandardDeduction = VA_STANDARD_DEDUCTION_2024[filingStatus] || 8000;

  // Personal exemption: 1 for single, 2 for married filing jointly
  let numExemptions = 1;
  if (filingStatus === 'MARRIED_FILING_JOINTLY') {
    numExemptions = 2;
  }
  const annualPersonalExemption = VA_PERSONAL_EXEMPTION_2024 * numExemptions;

  const totalAnnualDeduction = annualStandardDeduction + annualPersonalExemption;
  const deductionPerPeriod = totalAnnualDeduction / payPeriodsPerYear;

  // Calculate taxable wages
  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  // Annualize for bracket lookup
  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  // Calculate annual tax using brackets
  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of VA_TAX_BRACKETS_2024) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  // Handle top bracket
  const topBracket = VA_TAX_BRACKETS_2024[VA_TAX_BRACKETS_2024.length - 1];
  if (annualTaxableWages > topBracket.min) {
    annualTax = topBracket.base + (annualTaxableWages - topBracket.min) * topBracket.rate;
    marginalRate = topBracket.rate;
  }

  // Convert to per-period tax
  let incomeTax = annualTax / payPeriodsPerYear;
  incomeTax = Math.round(incomeTax * 100) / 100;

  // Virginia doesn't have state-level SDI or employee UI
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

export const VA_TAX_INFO = {
  brackets: VA_TAX_BRACKETS_2024,
  standardDeductions: VA_STANDARD_DEDUCTION_2024,
  personalExemption: VA_PERSONAL_EXEMPTION_2024
};
