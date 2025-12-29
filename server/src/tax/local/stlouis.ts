/**
 * St. Louis City Earnings Tax Calculator
 * Based on City of St. Louis (2024)
 *
 * St. Louis City has a 1% earnings tax:
 * - Residents: 1% on all earnings
 * - Non-residents: 1% on earnings from work performed in the city
 *
 * Note: St. Louis County does NOT have an earnings tax
 */

import { LocalTaxInput, LocalTaxResult } from './index.js';

// St. Louis City Earnings Tax Rate
const STL_EARNINGS_TAX_RATE = 0.01;  // 1%

/**
 * Calculate St. Louis City earnings tax
 */
export function calculateStLouisTax(input: LocalTaxInput): LocalTaxResult {
  const { grossPay, city, isResident, workCity } = input;

  // Only St. Louis City has this tax, not St. Louis County
  const isStLouisCity = city.toUpperCase().includes('ST. LOUIS') ||
                        city.toUpperCase().includes('SAINT LOUIS');

  if (!isStLouisCity) {
    return {
      cityTax: 0,
      countyTax: 0,
      schoolDistrictTax: 0,
      otherLocalTax: 0,
      total: 0,
      details: {
        cityName: city,
        taxType: 'No Tax (Outside St. Louis City)',
        rate: 0,
        isResident
      }
    };
  }

  // Non-residents only pay if they work in St. Louis City
  if (!isResident) {
    const worksInCity = !workCity ||
                        workCity.toUpperCase().includes('ST. LOUIS') ||
                        workCity.toUpperCase().includes('SAINT LOUIS');
    if (!worksInCity) {
      return {
        cityTax: 0,
        countyTax: 0,
        schoolDistrictTax: 0,
        otherLocalTax: 0,
        total: 0,
        details: {
          cityName: 'St. Louis',
          taxType: 'No Tax (Non-Resident, Works Outside City)',
          rate: 0,
          isResident: false
        }
      };
    }
  }

  const cityTax = Math.round(grossPay * STL_EARNINGS_TAX_RATE * 100) / 100;

  return {
    cityTax,
    countyTax: 0,
    schoolDistrictTax: 0,
    otherLocalTax: 0,
    total: cityTax,
    details: {
      cityName: 'St. Louis',
      taxType: isResident ? 'Resident Earnings Tax' : 'Non-Resident Earnings Tax',
      rate: STL_EARNINGS_TAX_RATE * 100,
      isResident
    }
  };
}

// Export tax info for reference
export const STL_TAX_INFO = {
  rate: STL_EARNINGS_TAX_RATE
};
