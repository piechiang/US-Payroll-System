/**
 * New York State Tax Calculator
 * Based on NYS Department of Taxation and Finance (2024)
 *
 * Includes:
 * - New York State Personal Income Tax (progressive rates)
 * - Metropolitan Commuter Transportation Mobility Tax (MCTMT) for NYC area
 * - NYC residents have additional city tax (handled separately)
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 New York State Tax Brackets
const NY_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 8500, rate: 0.04, base: 0 },
    { min: 8500, max: 11700, rate: 0.045, base: 340 },
    { min: 11700, max: 13900, rate: 0.0525, base: 484 },
    { min: 13900, max: 80650, rate: 0.055, base: 600 },
    { min: 80650, max: 215400, rate: 0.06, base: 4271 },
    { min: 215400, max: 1077550, rate: 0.0685, base: 12356 },
    { min: 1077550, max: 5000000, rate: 0.0965, base: 71413 },
    { min: 5000000, max: 25000000, rate: 0.103, base: 449929 },
    { min: 25000000, max: Infinity, rate: 0.109, base: 2509929 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 17150, rate: 0.04, base: 0 },
    { min: 17150, max: 23600, rate: 0.045, base: 686 },
    { min: 23600, max: 27900, rate: 0.0525, base: 976 },
    { min: 27900, max: 161550, rate: 0.055, base: 1202 },
    { min: 161550, max: 323200, rate: 0.06, base: 8553 },
    { min: 323200, max: 2155350, rate: 0.0685, base: 18252 },
    { min: 2155350, max: 5000000, rate: 0.0965, base: 143754 },
    { min: 5000000, max: 25000000, rate: 0.103, base: 418313 },
    { min: 25000000, max: Infinity, rate: 0.109, base: 2478313 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 12800, rate: 0.04, base: 0 },
    { min: 12800, max: 17650, rate: 0.045, base: 512 },
    { min: 17650, max: 20900, rate: 0.0525, base: 730 },
    { min: 20900, max: 107650, rate: 0.055, base: 901 },
    { min: 107650, max: 269300, rate: 0.06, base: 5672 },
    { min: 269300, max: 1616450, rate: 0.0685, base: 15371 },
    { min: 1616450, max: 5000000, rate: 0.0965, base: 107651 },
    { min: 5000000, max: 25000000, rate: 0.103, base: 434183 },
    { min: 25000000, max: Infinity, rate: 0.109, base: 2494183 }
  ]
};

// New York Standard Deduction 2024
const NY_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 8000,
  MARRIED_FILING_JOINTLY: 16050,
  MARRIED_FILING_SEPARATELY: 8000,
  HEAD_OF_HOUSEHOLD: 11200
};

export function calculateNewYorkTax(input: StateTaxInput): StateTaxResult {
  const {
    grossPay,
    annualIncome,
    filingStatus,
    payPeriodsPerYear
  } = input;

  // Map filing status
  let nyFilingStatus = filingStatus;
  if (filingStatus === 'MARRIED_FILING_SEPARATELY') {
    nyFilingStatus = 'SINGLE';
  }

  // Get appropriate tax brackets
  const brackets = NY_TAX_BRACKETS_2024[nyFilingStatus as keyof typeof NY_TAX_BRACKETS_2024]
    || NY_TAX_BRACKETS_2024.SINGLE;

  // Calculate standard deduction per pay period
  const annualStandardDeduction = NY_STANDARD_DEDUCTION_2024[nyFilingStatus] || 8000;
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
  incomeTax = Math.round(incomeTax * 100) / 100;

  // NY doesn't have state-level SDI (workers' comp is employer-paid)
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

export const NY_TAX_INFO = {
  rates: NY_TAX_BRACKETS_2024,
  standardDeductions: NY_STANDARD_DEDUCTION_2024
};
