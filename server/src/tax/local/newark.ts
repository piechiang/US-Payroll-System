/**
 * Newark, NJ Payroll Tax Calculator
 * Based on City of Newark (2024)
 *
 * Newark has a payroll tax on employers, not employees
 * For employee withholding, there is no city-level income tax
 *
 * Note: New Jersey municipalities generally don't have local income taxes
 * Newark's payroll tax is an employer tax
 */

import { LocalTaxInput, LocalTaxResult } from './index.js';

/**
 * Calculate Newark local tax
 * Newark does not have an employee income tax, only employer payroll tax
 */
export function calculateNewarkTax(input: LocalTaxInput): LocalTaxResult {
  const { city, isResident } = input;

  // Newark has no employee-side local income tax
  // The payroll tax is paid by employers
  return {
    cityTax: 0,
    countyTax: 0,
    schoolDistrictTax: 0,
    otherLocalTax: 0,
    total: 0,
    details: {
      cityName: 'Newark',
      taxType: 'No Employee Tax (NJ cities have no local income tax)',
      rate: 0,
      isResident
    }
  };
}

// Export tax info for reference
export const NEWARK_TAX_INFO = {
  hasEmployeeTax: false,
  note: 'Newark has employer payroll tax only, no employee income tax'
};
