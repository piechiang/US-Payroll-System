/**
 * Utah State Tax Calculator
 * Based on Utah State Tax Commission (2024)
 *
 * Utah has a FLAT income tax rate: 4.65% for 2024
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Utah Tax Rate - FLAT TAX
const UT_FLAT_TAX_RATE_2024 = 0.0465; // 4.65%

// Utah uses taxpayer tax credit instead of standard deduction
// Credit equals 6% of the federal standard deduction
const UT_CREDIT_RATE = 0.06;
const FEDERAL_STANDARD_DEDUCTION: Record<string, number> = {
  SINGLE: 14600,
  MARRIED_FILING_JOINTLY: 29200,
  MARRIED_FILING_SEPARATELY: 14600,
  HEAD_OF_HOUSEHOLD: 21900
};

export function calculateUtahTax(input: StateTaxInput): StateTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear } = input;

  // Calculate gross tax
  const grossTax = grossPay * UT_FLAT_TAX_RATE_2024;

  // Calculate taxpayer credit
  const federalDeduction = FEDERAL_STANDARD_DEDUCTION[filingStatus] || 14600;
  const annualCredit = federalDeduction * UT_CREDIT_RATE;
  const creditPerPeriod = annualCredit / payPeriodsPerYear;

  // Net tax after credit
  let incomeTax = grossTax - creditPerPeriod;
  incomeTax = Math.max(0, incomeTax);
  incomeTax = Math.round(incomeTax * 100) / 100;

  const sdi = 0;
  const sui = 0;
  const total = incomeTax + sdi + sui;

  return {
    incomeTax,
    sdi,
    sui,
    total: Math.round(total * 100) / 100,
    details: {
      taxableWages: Math.round(grossPay * 100) / 100,
      marginalRate: UT_FLAT_TAX_RATE_2024 * 100
    }
  };
}

export const UT_TAX_INFO = {
  flatRate: UT_FLAT_TAX_RATE_2024,
  creditRate: UT_CREDIT_RATE
};
