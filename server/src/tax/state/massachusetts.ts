/**
 * Massachusetts State Tax Calculator
 * Based on MA Department of Revenue (2024)
 *
 * Massachusetts has a FLAT income tax rate (5.0%)
 * Plus a 4% surtax on income over $1 million (total 9% on that portion)
 *
 * Includes:
 * - MA Personal Income Tax (flat 5.0%, 9% over $1M)
 * - MA Paid Family and Medical Leave (PFML)
 */

import { StateTaxInput, StateTaxResult } from './index.js';

// 2024 Massachusetts Tax Rate - FLAT TAX
const MA_FLAT_TAX_RATE_2024 = 0.05; // 5.0%
const MA_MILLIONAIRE_SURTAX_RATE = 0.04; // Additional 4% on income over $1M
const MA_MILLIONAIRE_THRESHOLD = 1000000;

// Massachusetts Personal Exemptions 2024
const MA_PERSONAL_EXEMPTION_2024: Record<string, number> = {
  SINGLE: 4400,
  MARRIED_FILING_JOINTLY: 8800,
  MARRIED_FILING_SEPARATELY: 4400,
  HEAD_OF_HOUSEHOLD: 6800
};

// Massachusetts Paid Family and Medical Leave (PFML) 2024
// Total rate: 0.88% (split between employer and employee)
// Employee portion: 0.318% for family leave + portion of medical leave
const MA_PFML_EMPLOYEE_RATE_2024 = 0.00318; // Approximate employee portion
const MA_PFML_WAGE_CAP_2024 = 168600; // Same as Social Security wage base

export function calculateMassachusettsTax(input: StateTaxInput): StateTaxResult {
  const {
    grossPay,
    annualIncome,
    filingStatus,
    payPeriodsPerYear,
    ytdGrossWages = 0
  } = input;

  // Calculate exemption per pay period
  const annualExemption = MA_PERSONAL_EXEMPTION_2024[filingStatus] || 4400;
  const exemptionPerPeriod = annualExemption / payPeriodsPerYear;

  // Calculate taxable wages for this period
  let taxableWages = grossPay - exemptionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  // Calculate annual taxable income for millionaire surtax check
  const annualTaxableIncome = taxableWages * payPeriodsPerYear;

  // Calculate base income tax (flat rate)
  let incomeTax = taxableWages * MA_FLAT_TAX_RATE_2024;

  // Apply millionaire surtax if annual income exceeds threshold
  if (annualTaxableIncome > MA_MILLIONAIRE_THRESHOLD) {
    const amountOverMillion = annualTaxableIncome - MA_MILLIONAIRE_THRESHOLD;
    const surtaxAnnual = amountOverMillion * MA_MILLIONAIRE_SURTAX_RATE;
    const surtaxPerPeriod = surtaxAnnual / payPeriodsPerYear;
    incomeTax += surtaxPerPeriod;
  }

  // Round to 2 decimal places
  incomeTax = Math.round(incomeTax * 100) / 100;

  // Calculate PFML (similar to SDI in other states)
  const remainingWagesForPFML = Math.max(0, MA_PFML_WAGE_CAP_2024 - ytdGrossWages);
  const wagesSubjectToPFML = Math.min(grossPay, remainingWagesForPFML);
  const sdi = Math.round(wagesSubjectToPFML * MA_PFML_EMPLOYEE_RATE_2024 * 100) / 100;

  // MA doesn't have employee-paid SUI
  const sui = 0;

  const total = incomeTax + sdi + sui;

  // Determine marginal rate
  let marginalRate = MA_FLAT_TAX_RATE_2024;
  if (annualTaxableIncome > MA_MILLIONAIRE_THRESHOLD) {
    marginalRate = MA_FLAT_TAX_RATE_2024 + MA_MILLIONAIRE_SURTAX_RATE;
  }

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

export const MA_TAX_INFO = {
  flatRate: MA_FLAT_TAX_RATE_2024,
  millionaireSurtax: MA_MILLIONAIRE_SURTAX_RATE,
  millionaireThreshold: MA_MILLIONAIRE_THRESHOLD,
  personalExemptions: MA_PERSONAL_EXEMPTION_2024,
  pfmlRate: MA_PFML_EMPLOYEE_RATE_2024,
  pfmlWageCap: MA_PFML_WAGE_CAP_2024
};
