/**
 * Michigan City Income Tax Calculator
 * Based on Michigan Department of Treasury (2024)
 *
 * Michigan cities with income tax:
 * - Detroit: Residents 2.4%, Non-residents 1.2%
 * - Grand Rapids: Residents 1.5%, Non-residents 0.75%
 * - Lansing: Residents 1%, Non-residents 0.5%
 * - Flint: Residents 1%, Non-residents 0.5%
 * - Saginaw: Residents 1.5%, Non-residents 0.75%
 * - Other cities: Typically 1% residents, 0.5% non-residents
 */

import { LocalTaxInput, LocalTaxResult } from './index.js';

// Michigan City Tax Rates 2024
const MICHIGAN_CITY_RATES: Record<string, { resident: number; nonResident: number }> = {
  'DETROIT': { resident: 0.024, nonResident: 0.012 },
  'GRAND RAPIDS': { resident: 0.015, nonResident: 0.0075 },
  'LANSING': { resident: 0.01, nonResident: 0.005 },
  'FLINT': { resident: 0.01, nonResident: 0.005 },
  'SAGINAW': { resident: 0.015, nonResident: 0.0075 },
  'PONTIAC': { resident: 0.01, nonResident: 0.005 },
  'HIGHLAND PARK': { resident: 0.02, nonResident: 0.01 },
  'HAMTRAMCK': { resident: 0.01, nonResident: 0.005 },
  'WALKER': { resident: 0.01, nonResident: 0.005 },
  'BATTLE CREEK': { resident: 0.01, nonResident: 0.005 },
  'JACKSON': { resident: 0.01, nonResident: 0.005 },
  'MUSKEGON': { resident: 0.01, nonResident: 0.005 },
  'MUSKEGON HEIGHTS': { resident: 0.01, nonResident: 0.005 },
  'PORT HURON': { resident: 0.01, nonResident: 0.005 },
  'SPRINGFIELD': { resident: 0.01, nonResident: 0.005 },
  'ALBION': { resident: 0.01, nonResident: 0.005 },
  'BIG RAPIDS': { resident: 0.01, nonResident: 0.005 },
  'GRAYLING': { resident: 0.01, nonResident: 0.005 },
  'HUDSON': { resident: 0.01, nonResident: 0.005 },
  'IONIA': { resident: 0.01, nonResident: 0.005 },
  'LAPEER': { resident: 0.01, nonResident: 0.005 },
};

// Default rate for unlisted Michigan cities with income tax
const DEFAULT_MI_RATE = { resident: 0.01, nonResident: 0.005 };

/**
 * Calculate Michigan city income tax (Detroit, Grand Rapids, etc.)
 */
export function calculateDetroitTax(input: LocalTaxInput): LocalTaxResult {
  const { grossPay, city, isResident, workCity } = input;

  const cityKey = city.toUpperCase();
  const rates = MICHIGAN_CITY_RATES[cityKey] || DEFAULT_MI_RATE;

  // Non-residents only pay if they work in the city
  if (!isResident) {
    const worksInCity = !workCity || workCity.toUpperCase() === cityKey;
    if (!worksInCity) {
      return {
        cityTax: 0,
        countyTax: 0,
        schoolDistrictTax: 0,
        otherLocalTax: 0,
        total: 0,
        details: {
          cityName: city,
          taxType: 'No Tax (Non-Resident, Works Outside City)',
          rate: 0,
          isResident: false
        }
      };
    }
  }

  const rate = isResident ? rates.resident : rates.nonResident;
  const cityTax = Math.round(grossPay * rate * 100) / 100;

  return {
    cityTax,
    countyTax: 0,
    schoolDistrictTax: 0,
    otherLocalTax: 0,
    total: cityTax,
    details: {
      cityName: city,
      taxType: isResident ? 'Resident City Income Tax' : 'Non-Resident City Income Tax',
      rate: rate * 100,
      isResident
    }
  };
}

// Export tax info for reference
export const MICHIGAN_CITY_TAX_INFO = {
  rates: MICHIGAN_CITY_RATES,
  defaultRate: DEFAULT_MI_RATE
};
