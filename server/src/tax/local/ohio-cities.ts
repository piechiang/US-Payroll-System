/**
 * Ohio Municipal Income Tax Calculator
 * Based on Ohio Department of Taxation (2024)
 *
 * Ohio has over 600 municipalities with local income taxes
 * Major cities include:
 * - Cleveland: 2.5%
 * - Columbus: 2.5%
 * - Cincinnati: 1.8%
 * - Toledo: 2.25%
 * - Akron: 2.5%
 * - Dayton: 2.5%
 * - Youngstown: 2.75%
 *
 * Ohio has reciprocity agreements between cities for tax credits
 */

import { LocalTaxInput, LocalTaxResult } from './index.js';

// Ohio City Tax Rates 2024
const OHIO_CITY_RATES: Record<string, number> = {
  // Major cities
  'CLEVELAND': 0.025,       // 2.5%
  'COLUMBUS': 0.025,        // 2.5%
  'CINCINNATI': 0.018,      // 1.8%
  'TOLEDO': 0.0225,         // 2.25%
  'AKRON': 0.025,           // 2.5%
  'DAYTON': 0.025,          // 2.5%
  'YOUNGSTOWN': 0.0275,     // 2.75%
  'CANTON': 0.02,           // 2.0%
  'PARMA': 0.025,           // 2.5%
  'LORAIN': 0.025,          // 2.5%
  'HAMILTON': 0.02,         // 2.0%
  'SPRINGFIELD': 0.02,      // 2.0%
  'KETTERING': 0.0225,      // 2.25%
  'ELYRIA': 0.0215,         // 2.15%
  'LAKEWOOD': 0.015,        // 1.5%
  'CUYAHOGA FALLS': 0.02,   // 2.0%
  'EUCLID': 0.0285,         // 2.85%
  'MIDDLETOWN': 0.0175,     // 1.75%
  'NEWARK': 0.0175,         // 1.75%
  'MANSFIELD': 0.02,        // 2.0%
  'MENTOR': 0.02,           // 2.0%
  'CLEVELAND HEIGHTS': 0.02, // 2.0%
  'STRONGSVILLE': 0.02,     // 2.0%
  'FAIRFIELD': 0.015,       // 1.5%
  'DUBLIN': 0.02,           // 2.0%
  'WARREN': 0.0275,         // 2.75%
  'MASSILLON': 0.02,        // 2.0%
};

// Default rate for unlisted Ohio cities
const DEFAULT_OH_RATE = 0.02;  // 2.0%

// Ohio School District Income Tax rates (some examples)
const OHIO_SCHOOL_DISTRICT_RATES: Record<string, number> = {
  // These are just examples - there are hundreds of school districts
  'CLEVELAND MUNICIPAL': 0,
  'COLUMBUS CITY': 0,
  // Most school districts range from 0.5% to 2%
};

/**
 * Calculate Ohio municipal income tax
 */
export function calculateOhioCityTax(input: LocalTaxInput): LocalTaxResult {
  const { grossPay, city, isResident, workCity } = input;

  const cityKey = city.toUpperCase();
  const rate = OHIO_CITY_RATES[cityKey] || DEFAULT_OH_RATE;

  // Ohio cities tax both residents and those who work in the city
  // Credit is typically given for taxes paid to other municipalities
  let taxableInCity = true;

  if (!isResident) {
    // Non-residents only pay if working in the city
    const worksInCity = !workCity || workCity.toUpperCase() === cityKey;
    taxableInCity = worksInCity;
  }

  if (!taxableInCity) {
    return {
      cityTax: 0,
      countyTax: 0,
      schoolDistrictTax: 0,
      otherLocalTax: 0,
      total: 0,
      details: {
        cityName: city,
        taxType: 'No Tax (Does Not Work In City)',
        rate: 0,
        isResident
      }
    };
  }

  const cityTax = Math.round(grossPay * rate * 100) / 100;

  // Note: Ohio also has school district income tax in many areas
  // This would require knowing the specific school district
  const schoolDistrictTax = 0; // Would need school district info

  return {
    cityTax,
    countyTax: 0,
    schoolDistrictTax,
    otherLocalTax: 0,
    total: cityTax + schoolDistrictTax,
    details: {
      cityName: city,
      taxType: 'Municipal Income Tax',
      rate: rate * 100,
      isResident
    }
  };
}

/**
 * Get Ohio city tax rate
 */
export function getOhioCityRate(city: string): number {
  return OHIO_CITY_RATES[city.toUpperCase()] || DEFAULT_OH_RATE;
}

/**
 * Get all Ohio cities with known rates
 */
export function getOhioCitiesWithTax(): string[] {
  return Object.keys(OHIO_CITY_RATES);
}

// Export tax info for reference
export const OHIO_CITY_TAX_INFO = {
  rates: OHIO_CITY_RATES,
  defaultRate: DEFAULT_OH_RATE,
  schoolDistrictRates: OHIO_SCHOOL_DISTRICT_RATES
};
