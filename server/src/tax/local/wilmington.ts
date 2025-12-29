/**
 * Wilmington, DE City Wage Tax Calculator
 * Based on City of Wilmington (2024)
 *
 * Wilmington has a city wage tax:
 * - Residents: 1.25%
 * - Non-residents working in Wilmington: 1.25%
 *
 * This is the only city in Delaware with a local income tax
 */

import { LocalTaxInput, LocalTaxResult } from './index.js';

// Wilmington City Wage Tax Rate
const WILMINGTON_TAX_RATE = 0.0125;  // 1.25%

/**
 * Calculate Wilmington city wage tax
 */
export function calculateWilmingtonTax(input: LocalTaxInput): LocalTaxResult {
  const { grossPay, city, isResident, workCity } = input;

  // Non-residents only pay if they work in Wilmington
  if (!isResident) {
    const worksInWilmington = !workCity || workCity.toUpperCase() === 'WILMINGTON';
    if (!worksInWilmington) {
      return {
        cityTax: 0,
        countyTax: 0,
        schoolDistrictTax: 0,
        otherLocalTax: 0,
        total: 0,
        details: {
          cityName: 'Wilmington',
          taxType: 'No Tax (Non-Resident, Works Outside City)',
          rate: 0,
          isResident: false
        }
      };
    }
  }

  const cityTax = Math.round(grossPay * WILMINGTON_TAX_RATE * 100) / 100;

  return {
    cityTax,
    countyTax: 0,
    schoolDistrictTax: 0,
    otherLocalTax: 0,
    total: cityTax,
    details: {
      cityName: 'Wilmington',
      taxType: isResident ? 'Resident Wage Tax' : 'Non-Resident Wage Tax',
      rate: WILMINGTON_TAX_RATE * 100,
      isResident
    }
  };
}

// Export tax info for reference
export const WILMINGTON_TAX_INFO = {
  rate: WILMINGTON_TAX_RATE
};
