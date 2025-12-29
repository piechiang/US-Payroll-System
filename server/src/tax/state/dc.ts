/**
 * District of Columbia Tax Calculator
 * Based on DC Office of Tax and Revenue (2024)
 *
 * DC has progressive income tax with rates from 4% to 10.75%
 * Also has DC Paid Family Leave
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 DC Tax Brackets (same for all filing statuses)
const DC_TAX_BRACKETS_2024 = [
  { min: 0, max: 10000, rate: 0.04, base: 0 },
  { min: 10000, max: 40000, rate: 0.06, base: 400 },
  { min: 40000, max: 60000, rate: 0.065, base: 2200 },
  { min: 60000, max: 250000, rate: 0.085, base: 3500 },
  { min: 250000, max: 500000, rate: 0.0925, base: 19650 },
  { min: 500000, max: 1000000, rate: 0.0975, base: 42775 },
  { min: 1000000, max: Infinity, rate: 0.1075, base: 91525 }
];

// DC Standard Deduction
const DC_STANDARD_DEDUCTION_2024: Record<string, number> = {
  SINGLE: 14600,
  MARRIED_FILING_JOINTLY: 29200,
  MARRIED_FILING_SEPARATELY: 14600,
  HEAD_OF_HOUSEHOLD: 21900
};

// DC Paid Family Leave (employer-paid, but tracking here for reference)
const DC_PFL_RATE_2024 = 0; // Employee pays nothing, employer pays 0.62%

export function calculateDCTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  const annualStandardDeduction = DC_STANDARD_DEDUCTION_2024[filingStatus] || 14600;
  const deductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  let taxableWages = grossPay - deductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of DC_TAX_BRACKETS_2024) {
    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracket.max) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  const topBracket = DC_TAX_BRACKETS_2024[DC_TAX_BRACKETS_2024.length - 1];
  if (annualTaxableWages > topBracket.min) {
    annualTax = topBracket.base + (annualTaxableWages - topBracket.min) * topBracket.rate;
    marginalRate = topBracket.rate;
  }

  const incomeTax = Math.round((annualTax / payPeriodsPerYear) * 100) / 100;
  const sdi = 0; // DC PFL is employer-paid
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

export const DC_TAX_INFO = {
  brackets: DC_TAX_BRACKETS_2024,
  standardDeductions: DC_STANDARD_DEDUCTION_2024,
  pflRate: DC_PFL_RATE_2024
};
