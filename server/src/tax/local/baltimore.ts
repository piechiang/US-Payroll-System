/**
 * Maryland Local Income Tax Calculator
 * Based on Maryland Comptroller (2024)
 *
 * Maryland has county income taxes in addition to state tax
 * - All 23 counties and Baltimore City have local income tax
 * - Rates range from 2.25% to 3.20%
 * - Tax is based on Maryland taxable income
 *
 * The local tax is collected by the state as part of state return
 */

import { LocalTaxInput, LocalTaxResult } from './index.js';

// Maryland County/City Tax Rates 2024
const MARYLAND_LOCAL_RATES: Record<string, number> = {
  // Independent city
  'BALTIMORE CITY': 0.032,      // 3.20%
  'BALTIMORE': 0.032,           // Alias

  // Counties
  'ALLEGANY': 0.0305,           // 3.05%
  'ANNE ARUNDEL': 0.0281,       // 2.81%
  'BALTIMORE COUNTY': 0.032,    // 3.20%
  'CALVERT': 0.03,              // 3.00%
  'CAROLINE': 0.032,            // 3.20%
  'CARROLL': 0.0305,            // 3.05%
  'CECIL': 0.03,                // 3.00%
  'CHARLES': 0.0303,            // 3.03%
  'DORCHESTER': 0.0315,         // 3.15%
  'FREDERICK': 0.0296,          // 2.96%
  'GARRETT': 0.0265,            // 2.65%
  'HARFORD': 0.0306,            // 3.06%
  'HOWARD': 0.032,              // 3.20%
  'KENT': 0.0285,               // 2.85%
  'MONTGOMERY': 0.032,          // 3.20%
  'PRINCE GEORGES': 0.032,      // 3.20%
  'QUEEN ANNES': 0.032,         // 3.20%
  'ST MARYS': 0.03,             // 3.00%
  'SOMERSET': 0.032,            // 3.20%
  'TALBOT': 0.0225,             // 2.25% (lowest)
  'WASHINGTON': 0.0295,         // 2.95%
  'WICOMICO': 0.032,            // 3.20%
  'WORCESTER': 0.0225,          // 2.25%
};

// Default to Baltimore City rate
const DEFAULT_MD_RATE = 0.032;

/**
 * Calculate Maryland local (county/city) income tax
 */
export function calculateBaltimoreTax(input: LocalTaxInput): LocalTaxResult {
  const { grossPay, city, county, isResident } = input;

  // Non-residents don't pay MD local tax
  // (MD local tax is based on residence, not work location)
  if (!isResident) {
    return {
      cityTax: 0,
      countyTax: 0,
      schoolDistrictTax: 0,
      otherLocalTax: 0,
      total: 0,
      details: {
        cityName: city,
        taxType: 'No Tax (Non-Resident)',
        rate: 0,
        isResident: false
      }
    };
  }

  // Determine locality for tax rate
  const locality = county?.toUpperCase() || city.toUpperCase();
  const rate = MARYLAND_LOCAL_RATES[locality] || DEFAULT_MD_RATE;

  // For Baltimore City, it's cityTax; for counties, it's countyTax
  const isBaltimoreCity = city.toUpperCase().includes('BALTIMORE') && !county;

  const localTax = Math.round(grossPay * rate * 100) / 100;

  return {
    cityTax: isBaltimoreCity ? localTax : 0,
    countyTax: isBaltimoreCity ? 0 : localTax,
    schoolDistrictTax: 0,
    otherLocalTax: 0,
    total: localTax,
    details: {
      cityName: isBaltimoreCity ? 'Baltimore City' : (county || city),
      taxType: isBaltimoreCity ? 'City Income Tax' : 'County Income Tax',
      rate: rate * 100,
      isResident: true
    }
  };
}

/**
 * Get Maryland county/city tax rate
 */
export function getMarylandLocalRate(locality: string): number {
  return MARYLAND_LOCAL_RATES[locality.toUpperCase()] || DEFAULT_MD_RATE;
}

// Export tax info for reference
export const MARYLAND_LOCAL_TAX_INFO = {
  rates: MARYLAND_LOCAL_RATES,
  defaultRate: DEFAULT_MD_RATE,
  minRate: 0.0225,
  maxRate: 0.032
};
