/**
 * California State Tax Calculator
 * Based on California EDD DE 44 (2024+)
 *
 * Includes:
 * - California Personal Income Tax (PIT)
 * - State Disability Insurance (SDI)
 *
 * California has a progressive income tax with rates from 1% to 13.3%
 *
 * IMPORTANT: This calculator uses dynamic configuration loading based on tax year.
 * Tax rates, SDI caps, deductions, and brackets are loaded from JSON config files
 * in server/src/tax/config/states/california-{year}.json
 */

import { StateTaxInput, StateTaxResult } from './index.js';
import { loadCaliforniaConfig } from '../config/configLoader.js';

/**
 * Calculate California state tax withholding
 *
 * Uses dynamic configuration based on the tax year (year of the pay date).
 * Config includes: tax brackets, SDI rate/cap, standard deductions, exemption credits.
 *
 * @param input - Tax calculation input including gross pay, filing status, etc.
 * @param taxYear - Tax year for which to calculate (defaults to current year)
 * @returns Promise<StateTaxResult> with income tax, SDI, and details
 *
 * @example
 * ```typescript
 * // Calculate for 2024 payroll
 * const result = await calculateCaliforniaTax(
 *   {
 *     grossPay: 5000,
 *     annualIncome: 130000,
 *     filingStatus: 'SINGLE',
 *     payPeriodsPerYear: 26,
 *     ytdGrossWages: 100000
 *   },
 *   2024
 * );
 * console.log(result.incomeTax); // CA income tax withholding
 * console.log(result.sdi);       // CA SDI withholding
 * ```
 */
export async function calculateCaliforniaTax(
  input: StateTaxInput,
  taxYear?: number
): Promise<StateTaxResult> {
  const {
    grossPay,
    filingStatus,
    payPeriodsPerYear,
    ytdGrossWages = 0
  } = input;

  // Determine tax year (default to current year if not specified)
  const year = taxYear || new Date().getFullYear();

  // Load dynamic configuration for the tax year
  const config = await loadCaliforniaConfig(year);

  // Map filing status (handle MARRIED_FILING_SEPARATELY same as SINGLE)
  let caFilingStatus = filingStatus;
  if (filingStatus === 'MARRIED_FILING_SEPARATELY') {
    caFilingStatus = 'SINGLE';
  }

  // Get appropriate tax brackets from config
  const brackets = config.brackets[caFilingStatus as keyof typeof config.brackets]
    || config.brackets.SINGLE;

  // Calculate standard deduction per pay period from config
  const annualStandardDeduction = config.standardDeduction[caFilingStatus]
    || config.standardDeduction.SINGLE;
  const standardDeductionPerPeriod = annualStandardDeduction / payPeriodsPerYear;

  // Calculate taxable wages
  let taxableWages = grossPay - standardDeductionPerPeriod;
  taxableWages = Math.max(0, taxableWages);

  // Annualize for bracket lookup
  const annualTaxableWages = taxableWages * payPeriodsPerYear;

  // Calculate annual tax using progressive brackets from config
  let annualTax = 0;
  let marginalRate = 0;

  for (const bracket of brackets) {
    const bracketMax = bracket.max ?? Infinity;

    if (annualTaxableWages > bracket.min && annualTaxableWages <= bracketMax) {
      annualTax = bracket.base + (annualTaxableWages - bracket.min) * bracket.rate;
      marginalRate = bracket.rate;
      break;
    }
  }

  // Handle top bracket (where max is null/Infinity)
  const topBracket = brackets[brackets.length - 1];
  if (annualTaxableWages > topBracket.min) {
    annualTax = topBracket.base + (annualTaxableWages - topBracket.min) * topBracket.rate;
    marginalRate = topBracket.rate;
  }

  // Convert to per-period tax
  let incomeTax = annualTax / payPeriodsPerYear;

  // Apply exemption credit from config
  const exemptionCredit = (config.exemptionCredit[caFilingStatus]
    || config.exemptionCredit.SINGLE) / payPeriodsPerYear;
  incomeTax = Math.max(0, incomeTax - exemptionCredit);

  // Round to 2 decimal places
  incomeTax = Math.round(incomeTax * 100) / 100;

  // Calculate SDI using config values
  // SDI has an annual wage cap - once employee hits the cap, no more SDI withheld
  const remainingWagesForSDI = Math.max(0, config.sdi.wageCap - ytdGrossWages);
  const wagesSubjectToSDI = Math.min(grossPay, remainingWagesForSDI);
  const sdi = Math.round(wagesSubjectToSDI * config.sdi.rate * 100) / 100;

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
      marginalRate: marginalRate * 100,
      sdiRate: config.sdi.rate * 100,
      sdiWageCap: config.sdi.wageCap,
      standardDeduction: annualStandardDeduction,
      exemptionCredit: config.exemptionCredit[caFilingStatus] || config.exemptionCredit.SINGLE,
      configYear: config.year
    }
  };
}

/**
 * Get California tax info for a specific year (for reference/display purposes)
 *
 * @param taxYear - Tax year (defaults to current year)
 * @returns California tax configuration
 *
 * @example
 * ```typescript
 * // Get 2024 CA tax info
 * const info = await getCaliforniaTaxInfo(2024);
 * console.log(info.sdiWageCap); // 153164
 * console.log(info.sdiRate);    // 0.009 (0.9%)
 * ```
 */
export async function getCaliforniaTaxInfo(taxYear?: number) {
  const year = taxYear || new Date().getFullYear();
  const config = await loadCaliforniaConfig(year);

  return {
    year: config.year,
    effectiveDate: config.effectiveDate,
    rates: config.brackets,
    sdiRate: config.sdi.rate,
    sdiWageCap: config.sdi.wageCap,
    standardDeductions: config.standardDeduction,
    exemptionCredits: config.exemptionCredit
  };
}
