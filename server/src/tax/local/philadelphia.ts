/**
 * Philadelphia Wage Tax Calculator
 * Based on City of Philadelphia Department of Revenue (2024)
 *
 * Philadelphia has a wage tax (not income tax) on all wages:
 * - Residents: 3.75% (effective July 1, 2024)
 * - Non-residents working in Philly: 3.44%
 *
 * This is one of the highest local wage taxes in the US
 */

import { LocalTaxInput, LocalTaxResult } from './index.js';

// 2024 Philadelphia Wage Tax Rates
const PHILLY_RESIDENT_RATE = 0.0375;      // 3.75%
const PHILLY_NONRESIDENT_RATE = 0.0344;   // 3.44%

// School Income Tax (SIT) - applies to unearned income, not wages
// Net Profits Tax - for self-employed, not W-2 wages

/**
 * Calculate Philadelphia wage tax
 */
export function calculatePhiladelphiaTax(input: LocalTaxInput): LocalTaxResult {
  const { grossPay, isResident, workCity } = input;

  // Determine if tax applies
  // Residents always pay (resident rate)
  // Non-residents pay only if they work in Philadelphia
  const worksInPhilly = !workCity || workCity.toUpperCase() === 'PHILADELPHIA';

  if (!isResident && !worksInPhilly) {
    return {
      cityTax: 0,
      countyTax: 0,
      schoolDistrictTax: 0,
      otherLocalTax: 0,
      total: 0,
      details: {
        cityName: 'Philadelphia',
        taxType: 'No Tax (Non-Resident, Work Outside Philly)',
        rate: 0,
        isResident: false
      }
    };
  }

  // Apply appropriate rate
  const rate = isResident ? PHILLY_RESIDENT_RATE : PHILLY_NONRESIDENT_RATE;
  const cityTax = Math.round(grossPay * rate * 100) / 100;

  return {
    cityTax,
    countyTax: 0,
    schoolDistrictTax: 0,
    otherLocalTax: 0,
    total: cityTax,
    details: {
      cityName: 'Philadelphia',
      taxType: isResident ? 'Resident Wage Tax' : 'Non-Resident Wage Tax',
      rate: rate * 100,
      isResident
    }
  };
}

// Export tax info for reference
export const PHILADELPHIA_TAX_INFO = {
  residentRate: PHILLY_RESIDENT_RATE,
  nonResidentRate: PHILLY_NONRESIDENT_RATE
};
