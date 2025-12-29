/**
 * New York City Tax Calculator
 * Based on NYC Department of Finance (2024)
 *
 * NYC has its own income tax in addition to NY state tax
 * - Residents: Progressive rates from 3.078% to 3.876%
 * - Non-residents: Generally not subject to NYC tax (work location rules apply)
 * - Yonkers: Has its own resident/non-resident surcharge
 */

import { LocalTaxInput, LocalTaxResult } from './index.js';

// 2024 NYC Tax Brackets (Residents)
const NYC_TAX_BRACKETS_2024 = {
  SINGLE: [
    { min: 0, max: 12000, rate: 0.03078, base: 0 },
    { min: 12000, max: 25000, rate: 0.03762, base: 369.36 },
    { min: 25000, max: 50000, rate: 0.03819, base: 858.42 },
    { min: 50000, max: Infinity, rate: 0.03876, base: 1813.17 }
  ],
  MARRIED_FILING_JOINTLY: [
    { min: 0, max: 21600, rate: 0.03078, base: 0 },
    { min: 21600, max: 45000, rate: 0.03762, base: 664.85 },
    { min: 45000, max: 90000, rate: 0.03819, base: 1544.65 },
    { min: 90000, max: Infinity, rate: 0.03876, base: 3263.20 }
  ],
  MARRIED_FILING_SEPARATELY: [
    { min: 0, max: 12000, rate: 0.03078, base: 0 },
    { min: 12000, max: 25000, rate: 0.03762, base: 369.36 },
    { min: 25000, max: 50000, rate: 0.03819, base: 858.42 },
    { min: 50000, max: Infinity, rate: 0.03876, base: 1813.17 }
  ],
  HEAD_OF_HOUSEHOLD: [
    { min: 0, max: 14400, rate: 0.03078, base: 0 },
    { min: 14400, max: 30000, rate: 0.03762, base: 443.23 },
    { min: 30000, max: 60000, rate: 0.03819, base: 1030.11 },
    { min: 60000, max: Infinity, rate: 0.03876, base: 2175.81 }
  ]
};

// Yonkers surcharge rates
const YONKERS_RESIDENT_SURCHARGE = 0.165;       // 16.5% of NY state tax
const YONKERS_NONRESIDENT_SURCHARGE = 0.005;    // 0.5% of wages

/**
 * Calculate NYC income tax
 */
export function calculateNYCTax(input: LocalTaxInput): LocalTaxResult {
  const { grossPay, filingStatus, payPeriodsPerYear, isResident, city } = input;

  // Check if it's Yonkers first (has both resident and non-resident taxes)
  if (city.toUpperCase() === 'YONKERS') {
    return calculateYonkersTax(input);
  }

  // Non-residents generally don't pay NYC tax
  // Exception: Some work-location rules may apply
  if (!isResident) {
    return {
      cityTax: 0,
      countyTax: 0,
      schoolDistrictTax: 0,
      otherLocalTax: 0,
      total: 0,
      details: {
        cityName: city,
        taxType: 'NYC Income Tax (Non-Resident)',
        rate: 0,
        isResident: false
      }
    };
  }

  // Get appropriate tax brackets
  const brackets = NYC_TAX_BRACKETS_2024[filingStatus as keyof typeof NYC_TAX_BRACKETS_2024]
    || NYC_TAX_BRACKETS_2024.SINGLE;

  // Calculate annual taxable wages
  const annualTaxableWages = grossPay * payPeriodsPerYear;

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
  const cityTax = Math.round((annualTax / payPeriodsPerYear) * 100) / 100;

  return {
    cityTax,
    countyTax: 0,
    schoolDistrictTax: 0,
    otherLocalTax: 0,
    total: cityTax,
    details: {
      cityName: 'New York City',
      taxType: 'NYC Resident Income Tax',
      rate: marginalRate * 100,
      isResident: true
    }
  };
}

/**
 * Calculate Yonkers tax (surcharge on NY state tax)
 */
function calculateYonkersTax(input: LocalTaxInput): LocalTaxResult {
  const { grossPay, isResident } = input;

  if (isResident) {
    // Residents pay 16.5% surcharge on NY state tax
    // This is simplified - actual calculation requires NY state tax amount
    // Using approximate effective rate of ~0.5% for estimation
    const estimatedSurcharge = grossPay * 0.005;
    const otherLocalTax = Math.round(estimatedSurcharge * 100) / 100;

    return {
      cityTax: 0,
      countyTax: 0,
      schoolDistrictTax: 0,
      otherLocalTax,
      total: otherLocalTax,
      details: {
        cityName: 'Yonkers',
        taxType: 'Yonkers Resident Surcharge',
        rate: 16.5, // % of NY state tax
        isResident: true
      }
    };
  } else {
    // Non-residents pay 0.5% of wages earned in Yonkers
    const otherLocalTax = Math.round(grossPay * YONKERS_NONRESIDENT_SURCHARGE * 100) / 100;

    return {
      cityTax: 0,
      countyTax: 0,
      schoolDistrictTax: 0,
      otherLocalTax,
      total: otherLocalTax,
      details: {
        cityName: 'Yonkers',
        taxType: 'Yonkers Non-Resident Earnings Tax',
        rate: 0.5,
        isResident: false
      }
    };
  }
}

// Export tax info for reference
export const NYC_TAX_INFO = {
  brackets: NYC_TAX_BRACKETS_2024,
  yonkersResidentSurcharge: YONKERS_RESIDENT_SURCHARGE,
  yonkersNonresidentRate: YONKERS_NONRESIDENT_SURCHARGE
};
