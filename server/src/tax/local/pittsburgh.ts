/**
 * Pennsylvania Local Tax Calculator
 * Based on PA Department of Revenue (2024)
 *
 * Pennsylvania has several types of local taxes:
 * - Earned Income Tax (EIT): 0.5% to 3.1%
 * - Local Services Tax (LST): Flat amount per year (typically $52)
 * - School District EIT: Combined with municipal EIT
 *
 * Major cities:
 * - Pittsburgh: 3% (1% city + 2% school district)
 * - Scranton: 3.4%
 * - Reading: 3.6%
 * - Harrisburg: 2%
 * - Erie: 1.65%
 * - Allentown: 1.825%
 * - Bethlehem: 1%
 */

import { LocalTaxInput, LocalTaxResult } from './index.js';

// Pennsylvania City EIT Rates 2024 (combined city + school district)
const PA_CITY_EIT_RATES: Record<string, number> = {
  'PITTSBURGH': 0.03,           // 3.0% (1% city + 2% school)
  'SCRANTON': 0.034,            // 3.4%
  'READING': 0.036,             // 3.6%
  'HARRISBURG': 0.02,           // 2.0%
  'ERIE': 0.0165,               // 1.65%
  'ALLENTOWN': 0.01825,         // 1.825%
  'BETHLEHEM': 0.01,            // 1.0%
  'LANCASTER': 0.0135,          // 1.35%
  'YORK': 0.0136,               // 1.36%
  'WILKES-BARRE': 0.03,         // 3.0%
  'CHESTER': 0.0285,            // 2.85%
  'EASTON': 0.0175,             // 1.75%
  'NORRISTOWN': 0.015,          // 1.5%
  'STATE COLLEGE': 0.0135,      // 1.35%
  'JOHNSTOWN': 0.023,           // 2.3%
  'MCKEESPORT': 0.02,           // 2.0%
  'NEW CASTLE': 0.02,           // 2.0%
  'MONESSEN': 0.025,            // 2.5%
  'DUQUESNE': 0.025,            // 2.5%
};

// Local Services Tax (LST) - annual amount
const PA_LST_ANNUAL = 52;  // $52/year max

// Default EIT rate
const DEFAULT_PA_EIT_RATE = 0.01;

/**
 * Calculate Pennsylvania local earned income tax
 */
export function calculatePittsburghTax(input: LocalTaxInput): LocalTaxResult {
  const { grossPay, city, isResident, payPeriodsPerYear, workCity } = input;

  const cityKey = city.toUpperCase();
  const rate = PA_CITY_EIT_RATES[cityKey] || DEFAULT_PA_EIT_RATE;

  // PA EIT applies to:
  // - Residents of the municipality (full rate)
  // - Non-residents working in the municipality (may have credit for home municipality)
  let effectiveRate = rate;
  let taxType = 'Resident EIT';

  if (!isResident) {
    // Non-residents: work city rate applies, but credit given for home municipality rate
    // For simplicity, using work city rate
    const worksInCity = !workCity || workCity.toUpperCase() === cityKey;
    if (!worksInCity) {
      effectiveRate = 0;
      taxType = 'No Tax (Non-Resident, Works Outside City)';
    } else {
      taxType = 'Non-Resident EIT';
    }
  }

  const cityTax = Math.round(grossPay * effectiveRate * 100) / 100;

  // Local Services Tax (LST) - $52/year, typically withheld equally per pay period
  // Only applies if earning over $12,000/year
  const annualizedPay = grossPay * payPeriodsPerYear;
  let lstPerPeriod = 0;
  if (annualizedPay > 12000) {
    lstPerPeriod = Math.round((PA_LST_ANNUAL / payPeriodsPerYear) * 100) / 100;
  }

  return {
    cityTax,
    countyTax: 0,
    schoolDistrictTax: 0,  // Already included in combined EIT rate
    otherLocalTax: lstPerPeriod,
    total: Math.round((cityTax + lstPerPeriod) * 100) / 100,
    details: {
      cityName: city,
      taxType: taxType + (lstPerPeriod > 0 ? ' + LST' : ''),
      rate: effectiveRate * 100,
      isResident
    }
  };
}

/**
 * Get PA city EIT rate
 */
export function getPACityRate(city: string): number {
  return PA_CITY_EIT_RATES[city.toUpperCase()] || DEFAULT_PA_EIT_RATE;
}

// Export tax info for reference
export const PA_LOCAL_TAX_INFO = {
  eitRates: PA_CITY_EIT_RATES,
  defaultEitRate: DEFAULT_PA_EIT_RATE,
  lstAnnual: PA_LST_ANNUAL
};
