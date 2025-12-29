/**
 * Kansas City, MO Earnings Tax Calculator
 * Based on City of Kansas City (2024)
 *
 * Kansas City has a 1% earnings tax:
 * - Residents: 1% on all earnings
 * - Non-residents: 1% on earnings from work performed in the city
 *
 * Note: This applies to Kansas City, Missouri only
 * Kansas City, Kansas does NOT have an earnings tax
 */

import { LocalTaxInput, LocalTaxResult } from './index.js';

// Kansas City Earnings Tax Rate
const KC_EARNINGS_TAX_RATE = 0.01;  // 1%

/**
 * Calculate Kansas City earnings tax
 */
export function calculateKansasCityTax(input: LocalTaxInput): LocalTaxResult {
  const { grossPay, city, state, isResident, workCity } = input;

  // Only Kansas City, MO has this tax
  if (state.toUpperCase() !== 'MO') {
    return {
      cityTax: 0,
      countyTax: 0,
      schoolDistrictTax: 0,
      otherLocalTax: 0,
      total: 0,
      details: {
        cityName: city,
        taxType: 'No Tax (Not in Missouri)',
        rate: 0,
        isResident
      }
    };
  }

  // Non-residents only pay if they work in Kansas City
  if (!isResident) {
    const worksInCity = !workCity || workCity.toUpperCase() === 'KANSAS CITY';
    if (!worksInCity) {
      return {
        cityTax: 0,
        countyTax: 0,
        schoolDistrictTax: 0,
        otherLocalTax: 0,
        total: 0,
        details: {
          cityName: 'Kansas City',
          taxType: 'No Tax (Non-Resident, Works Outside City)',
          rate: 0,
          isResident: false
        }
      };
    }
  }

  const cityTax = Math.round(grossPay * KC_EARNINGS_TAX_RATE * 100) / 100;

  return {
    cityTax,
    countyTax: 0,
    schoolDistrictTax: 0,
    otherLocalTax: 0,
    total: cityTax,
    details: {
      cityName: 'Kansas City',
      taxType: isResident ? 'Resident Earnings Tax' : 'Non-Resident Earnings Tax',
      rate: KC_EARNINGS_TAX_RATE * 100,
      isResident
    }
  };
}

// Export tax info for reference
export const KC_TAX_INFO = {
  rate: KC_EARNINGS_TAX_RATE
};
