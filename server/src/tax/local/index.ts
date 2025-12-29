/**
 * Local/City Tax Calculator Index
 * Routes to appropriate local tax calculator based on city/locality
 *
 * Supports major US cities with local income taxes:
 * - New York City, NY (NYC)
 * - Philadelphia, PA
 * - Detroit, MI
 * - Baltimore, MD (city + county)
 * - Cleveland, Columbus, Cincinnati, OH
 * - Pittsburgh, PA
 * - St. Louis, MO (city earnings tax)
 * - Kansas City, MO
 * - Newark, NJ
 * - Wilmington, DE
 * - Various PA localities (LST, EIT)
 */

import { calculateNYCTax } from './nyc.js';
import { calculatePhiladelphiaTax } from './philadelphia.js';
import { calculateDetroitTax } from './detroit.js';
import { calculateBaltimoreTax } from './baltimore.js';
import { calculateOhioCityTax } from './ohio-cities.js';
import { calculatePittsburghTax } from './pittsburgh.js';
import { calculateStLouisTax } from './stlouis.js';
import { calculateKansasCityTax } from './kansascity.js';
import { calculateNewarkTax } from './newark.js';
import { calculateWilmingtonTax } from './wilmington.js';

export interface LocalTaxInput {
  city: string;              // City name
  state: string;             // State code
  county?: string;           // County (for MD, OH)
  grossPay: number;
  annualIncome: number;
  filingStatus: string;
  payPeriodsPerYear: number;
  isResident: boolean;       // Resident vs non-resident rates differ
  workCity?: string;         // Where work is performed (for reciprocity)
}

export interface LocalTaxResult {
  cityTax: number;           // City/municipal tax
  countyTax: number;         // County tax (if applicable)
  schoolDistrictTax: number; // School district tax (OH, PA)
  otherLocalTax: number;     // Other local taxes (LST, transit, etc.)
  total: number;
  details: {
    cityName: string;
    taxType: string;
    rate: number;
    isResident: boolean;
  };
}

// Cities with local income tax
const LOCAL_TAX_CITIES: Record<string, { state: string; hasLocalTax: boolean }> = {
  // New York
  'NEW YORK': { state: 'NY', hasLocalTax: true },
  'NEW YORK CITY': { state: 'NY', hasLocalTax: true },
  'NYC': { state: 'NY', hasLocalTax: true },
  'YONKERS': { state: 'NY', hasLocalTax: true },

  // Pennsylvania
  'PHILADELPHIA': { state: 'PA', hasLocalTax: true },
  'PITTSBURGH': { state: 'PA', hasLocalTax: true },
  'SCRANTON': { state: 'PA', hasLocalTax: true },
  'READING': { state: 'PA', hasLocalTax: true },
  'ERIE': { state: 'PA', hasLocalTax: true },
  'ALLENTOWN': { state: 'PA', hasLocalTax: true },
  'BETHLEHEM': { state: 'PA', hasLocalTax: true },
  'HARRISBURG': { state: 'PA', hasLocalTax: true },

  // Michigan
  'DETROIT': { state: 'MI', hasLocalTax: true },
  'GRAND RAPIDS': { state: 'MI', hasLocalTax: true },
  'LANSING': { state: 'MI', hasLocalTax: true },
  'FLINT': { state: 'MI', hasLocalTax: true },
  'SAGINAW': { state: 'MI', hasLocalTax: true },

  // Ohio
  'CLEVELAND': { state: 'OH', hasLocalTax: true },
  'COLUMBUS': { state: 'OH', hasLocalTax: true },
  'CINCINNATI': { state: 'OH', hasLocalTax: true },
  'TOLEDO': { state: 'OH', hasLocalTax: true },
  'AKRON': { state: 'OH', hasLocalTax: true },
  'DAYTON': { state: 'OH', hasLocalTax: true },
  'YOUNGSTOWN': { state: 'OH', hasLocalTax: true },

  // Maryland (all cities/counties have local tax)
  'BALTIMORE': { state: 'MD', hasLocalTax: true },

  // Missouri
  'ST. LOUIS': { state: 'MO', hasLocalTax: true },
  'SAINT LOUIS': { state: 'MO', hasLocalTax: true },
  'KANSAS CITY': { state: 'MO', hasLocalTax: true },

  // New Jersey (Newark only)
  'NEWARK': { state: 'NJ', hasLocalTax: true },

  // Delaware
  'WILMINGTON': { state: 'DE', hasLocalTax: true },

  // Kentucky (all cities have occupational tax)
  'LOUISVILLE': { state: 'KY', hasLocalTax: true },
  'LEXINGTON': { state: 'KY', hasLocalTax: true },

  // Indiana (county taxes)
  'INDIANAPOLIS': { state: 'IN', hasLocalTax: true },
};

/**
 * Calculate local/city tax
 */
export function calculateLocalTax(input: LocalTaxInput): LocalTaxResult {
  const cityKey = input.city.toUpperCase().trim();
  const state = input.state.toUpperCase();

  if (state === 'MD') {
    return calculateBaltimoreTax(input);
  }

  // Check if city has local tax
  const cityInfo = LOCAL_TAX_CITIES[cityKey];
  if (!cityInfo || !cityInfo.hasLocalTax) {
    return createZeroResult(input.city, input.isResident);
  }

  // Route to specific city calculator
  switch (cityKey) {
    // New York
    case 'NEW YORK':
    case 'NEW YORK CITY':
    case 'NYC':
      return calculateNYCTax(input);

    // Pennsylvania
    case 'PHILADELPHIA':
      return calculatePhiladelphiaTax(input);
    case 'PITTSBURGH':
    case 'SCRANTON':
    case 'READING':
    case 'ERIE':
    case 'ALLENTOWN':
    case 'BETHLEHEM':
    case 'HARRISBURG':
      return calculatePittsburghTax({ ...input, city: cityKey });

    // Michigan
    case 'DETROIT':
    case 'GRAND RAPIDS':
    case 'LANSING':
    case 'FLINT':
    case 'SAGINAW':
      return calculateDetroitTax({ ...input, city: cityKey });

    // Ohio
    case 'CLEVELAND':
    case 'COLUMBUS':
    case 'CINCINNATI':
    case 'TOLEDO':
    case 'AKRON':
    case 'DAYTON':
    case 'YOUNGSTOWN':
      return calculateOhioCityTax({ ...input, city: cityKey });

    // Maryland
    case 'BALTIMORE':
      return calculateBaltimoreTax(input);

    // Missouri
    case 'ST. LOUIS':
    case 'SAINT LOUIS':
      return calculateStLouisTax(input);
    case 'KANSAS CITY':
      return calculateKansasCityTax(input);

    // New Jersey
    case 'NEWARK':
      return calculateNewarkTax(input);

    // Delaware
    case 'WILMINGTON':
      return calculateWilmingtonTax(input);

    // Kentucky - use generic occupational tax
    case 'LOUISVILLE':
    case 'LEXINGTON':
      return calculateKentuckyOccupationalTax(input);

    // Indiana - county tax
    case 'INDIANAPOLIS':
      return calculateIndianaCountyTax(input);

    default:
      return createZeroResult(input.city, input.isResident);
  }
}

/**
 * Create zero result for cities without local tax
 */
function createZeroResult(city: string, isResident: boolean): LocalTaxResult {
  return {
    cityTax: 0,
    countyTax: 0,
    schoolDistrictTax: 0,
    otherLocalTax: 0,
    total: 0,
    details: {
      cityName: city,
      taxType: 'None',
      rate: 0,
      isResident
    }
  };
}

/**
 * Kentucky Occupational Tax (generic for Louisville, Lexington, etc.)
 */
function calculateKentuckyOccupationalTax(input: LocalTaxInput): LocalTaxResult {
  const { grossPay, city, isResident } = input;

  // Louisville: 2.2%, Lexington: 2.25%
  const rates: Record<string, number> = {
    'LOUISVILLE': 0.022,
    'LEXINGTON': 0.0225
  };

  const rate = rates[city.toUpperCase()] || 0.02;
  const cityTax = Math.round(grossPay * rate * 100) / 100;

  return {
    cityTax,
    countyTax: 0,
    schoolDistrictTax: 0,
    otherLocalTax: 0,
    total: cityTax,
    details: {
      cityName: city,
      taxType: 'Occupational License Tax',
      rate: rate * 100,
      isResident
    }
  };
}

/**
 * Indiana County Tax
 */
function calculateIndianaCountyTax(input: LocalTaxInput): LocalTaxResult {
  const { grossPay, city, county, isResident } = input;

  // Marion County (Indianapolis): 2.02%
  // Rate varies by county
  const countyRates: Record<string, number> = {
    'MARION': 0.0202,
    'LAKE': 0.0175,
    'ALLEN': 0.0135,
    'HAMILTON': 0.01,
    'ST. JOSEPH': 0.0175
  };

  const countyKey = (county || 'MARION').toUpperCase();
  const rate = countyRates[countyKey] || 0.01;
  const countyTax = Math.round(grossPay * rate * 100) / 100;

  return {
    cityTax: 0,
    countyTax,
    schoolDistrictTax: 0,
    otherLocalTax: 0,
    total: countyTax,
    details: {
      cityName: city,
      taxType: 'County Income Tax',
      rate: rate * 100,
      isResident
    }
  };
}

/**
 * Check if city has local tax
 */
export function hasLocalTax(city: string, state: string): boolean {
  if (state.toUpperCase() === 'MD') {
    return true;
  }
  const cityKey = city.toUpperCase().trim();
  const cityInfo = LOCAL_TAX_CITIES[cityKey];
  return cityInfo?.hasLocalTax === true && cityInfo?.state === state.toUpperCase();
}

/**
 * Get list of cities with local tax
 */
export function getCitiesWithLocalTax(): string[] {
  return Object.keys(LOCAL_TAX_CITIES).filter(
    city => LOCAL_TAX_CITIES[city].hasLocalTax
  );
}

// Export city calculators
export {
  calculateNYCTax,
  calculatePhiladelphiaTax,
  calculateDetroitTax,
  calculateBaltimoreTax,
  calculateOhioCityTax,
  calculatePittsburghTax,
  calculateStLouisTax,
  calculateKansasCityTax,
  calculateNewarkTax,
  calculateWilmingtonTax
};
