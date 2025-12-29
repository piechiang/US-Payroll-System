/**
 * California State Tax Calculator
 * Based on California EDD DE 44 (2024)
 *
 * Includes:
 * - California Personal Income Tax (PIT)
 * - State Disability Insurance (SDI)
 *
 * California has a progressive income tax with rates from 1% to 13.3%
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 California Tax Brackets
// Source: California Franchise Tax Board
const CA_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 10412, rate: 0.01, base: 0 },
    { min: 10412, max: 24684, rate: 0.02, base: 104.12 },
    { min: 24684, max: 38959, rate: 0.04, base: 389.56 },
    { min: 38959, max: 54081, rate: 0.06, base: 960.56 },
    { min: 54081, max: 68350, rate: 0.08, base: 1867.88 },
    { min: 68350, max: 349137, rate: 0.093, base: 3009.40 },
    { min: 349137, max: 418961, rate: 0.103, base: 29122.59 },
    { min: 418961, max: 698271, rate: 0.113, base: 36314.06 },
    { min: 698271, max: 1000000, rate: 0.123, base: 67876.10 },
    { min: 1000000, max: Infinity, rate: 0.133, base: 104988.77 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 20824, rate: 0.01, base: 0 },
    { min: 20824, max: 49368, rate: 0.02, base: 208.24 },
    { min: 49368, max: 77918, rate: 0.04, base: 779.12 },
    { min: 77918, max: 108162, rate: 0.06, base: 1921.12 },
    { min: 108162, max: 136700, rate: 0.08, base: 3735.76 },
    { min: 136700, max: 698274, rate: 0.093, base: 6018.80 },
    { min: 698274, max: 837922, rate: 0.103, base: 58245.19 },
    { min: 837922, max: 1396542, rate: 0.113, base: 72628.11 },
    { min: 1396542, max: 2000000, rate: 0.123, base: 135752.21 },
    { min: 2000000, max: Infinity, rate: 0.133, base: 209977.54 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 20839, rate: 0.01, base: 0 },
    { min: 20839, max: 49371, rate: 0.02, base: 208.39 },
    { min: 49371, max: 63644, rate: 0.04, base: 779.03 },
    { min: 63644, max: 78765, rate: 0.06, base: 1349.95 },
    { min: 78765, max: 93037, rate: 0.08, base: 2257.21 },
    { min: 93037, max: 474824, rate: 0.093, base: 3398.97 },
    { min: 474824, max: 569790, rate: 0.103, base: 38895.16 },
    { min: 569790, max: 949649, rate: 0.113, base: 48676.69 },
    { min: 949649, max: 1000000, rate: 0.123, base: 91600.77 },
    { min: 1000000, max: Infinity, rate: 0.133, base: 97794.94 }
  ]
};

// California SDI (State Disability Insurance) 2024
const CA_SDI_RATE_2024 = 0.009;         // 0.9% for 2024
const CA_SDI_WAGE_CAP_2024 = 153164;    // 2024 taxable wage limit

// California Standard Deduction 2024
const CA_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 5363,
  MARRIED_FILING_JOINTLY: 10726,
  MARRIED_FILING_SEPARATELY: 5363,
  HEAD_OF_HOUSEHOLD: 10726
};

// California Exemption Credit 2024
const CA_EXEMPTION_CREDIT_2024: Record<string, number> = {
  SINGLE: 144,
  MARRIED_FILING_JOINTLY: 288,
  MARRIED_FILING_SEPARATELY: 144,
  HEAD_OF_HOUSEHOLD: 144
};

export function calculateCaliforniaTax(input: StateTaxInput): StateTaxResult {
  const {
    grossPay,
    annualIncome,
    filingStatus,
    payPeriodsPerYear,
    ytdGrossWages = 0
  } = input;

  // Map filing status (handle MARRIED_FILING_SEPARATELY same as SINGLE)
  let caFilingStatus = filingStatus;
  if (filingStatus === 'MARRIED_FILING_SEPARATELY') {
    caFilingStatus = 'SINGLE';
  }

  // Get appropriate tax brackets
  const brackets = CA_TAX_BRACKETS_2024[caFilingStatus as keyof typeof CA_TAX_BRACKETS_2024]
    || CA_TAX_BRACKETS_2024.SINGLE;

  // Calculate standard deduction per pay period
  const annualStandardDeduction = CA_STANDARD_DEDUCTION_2024[caFilingStatus] || 5363;
  const standardDeductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  // Calculate taxable wages
  let taxableWages = grossPay - standardDeductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  // Annualize for bracket lookup
  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  // Calculate annual tax using brackets
  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of brackets) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  // Handle top bracket
  const topBracket = brackets[brackets.length - 1];
  if (annualTaxableWages > topBracket.min) {
    annualTax = topBracket.base + (annualTaxableWages - topBracket.min) * topBracket.rate;
    marginalRate = topBracket.rate;
  }

  // Convert to per-period tax
  let incomeTax = annualTax / payPeriodsPerYear;

  // Apply exemption credit
  const exemptionCredit = (CA_EXEMPTION_CREDIT_2024[caFilingStatus] || 144) / payPeriodsPerYear;
  incomeTax = Math.max(0, incomeTax - exemptionCredit);

  // Round to 2 decimal places
  incomeTax = Math.round(incomeTax * 100) / 100;

  // Calculate SDI
  // Check if we've hit the wage cap
  const remainingWagesForSDI = Math.max(0, CA_SDI_WAGE_CAP_2024 - ytdGrossWages);
  const wagesSubjectToSDI = Math.min(grossPay, remainingWagesForSDI);
  const sdi = Math.round(wagesSubjectToSDI * CA_SDI_RATE_2024 * 100) / 100;

  // California doesn't have employee-paid SUI
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

// Export constants for reference
export const CA_TAX_INFO = {
  rates: CA_TAX_BRACKETS_2024,
  sdiRate: CA_SDI_RATE_2024,
  sdiWageCap: CA_SDI_WAGE_CAP_2024,
  standardDeductions: CA_STANDARD_DEDUCTION_2024,
  exemptionCredits: CA_EXEMPTION_CREDIT_2024
};
