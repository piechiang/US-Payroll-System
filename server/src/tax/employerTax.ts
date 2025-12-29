/**
 * Employer Tax Calculator for US Payroll
 *
 * Includes:
 * - Federal Unemployment Tax (FUTA) - 6.0% on first $7,000
 * - State Unemployment Tax (SUTA) - varies by state and employer experience rating
 * - Employer portion of FICA (matches employee SS + Medicare)
 *
 * Note: Most employers get a FUTA credit of up to 5.4% if they pay SUTA,
 * reducing effective FUTA rate to 0.6%
 */

export interface EmployerTaxInput {
  grossPay: number;
  state: string;
  ytdGrossWages?: number;           // YTD gross for wage caps
  sutaRate?: number;                // Employer's SUTA rate (experience rating)
  isNewEmployer?: boolean;          // New employers get default rates
}

export interface EmployerTaxResult {
  futa: number;                     // Federal Unemployment Tax
  suta: number;                     // State Unemployment Tax
  socialSecurity: number;           // Employer's SS match (6.2%)
  medicare: number;                 // Employer's Medicare match (1.45%)
  total: number;
  details: {
    futaWages: number;              // Wages subject to FUTA
    sutaWages: number;              // Wages subject to SUTA
    sutaRate: number;               // Applied SUTA rate
  };
}

// 2024 FUTA Constants
const FUTA_RATE = 0.06;                // 6.0% gross rate
const FUTA_CREDIT_RATE = 0.054;        // 5.4% credit if SUTA is paid
const FUTA_EFFECTIVE_RATE = 0.006;     // 0.6% effective rate after credit
const FUTA_WAGE_CAP = 7000;            // First $7,000 per employee per year

// Employer FICA rates (same as employee)
const EMPLOYER_SS_RATE = 0.062;        // 6.2%
const EMPLOYER_MEDICARE_RATE = 0.0145; // 1.45%
const SS_WAGE_CAP_2024 = 168600;

// State Unemployment Tax (SUTA) configurations
// Rates shown are typical NEW EMPLOYER rates - actual rates vary by experience
export interface SUTAConfig {
  wageBase: number;           // Taxable wage base
  newEmployerRate: number;    // Rate for new employers
  minRate: number;            // Minimum experience rate
  maxRate: number;            // Maximum experience rate
}

export const SUTA_RATES_2024: Record<string, SUTAConfig> = {
  // States with income tax
  CA: { wageBase: 7000, newEmployerRate: 0.034, minRate: 0.015, maxRate: 0.062 },
  NY: { wageBase: 12500, newEmployerRate: 0.041, minRate: 0.006, maxRate: 0.099 },
  NJ: { wageBase: 42300, newEmployerRate: 0.028, minRate: 0.005, maxRate: 0.059 },
  PA: { wageBase: 10000, newEmployerRate: 0.0307, minRate: 0.006, maxRate: 0.102 },
  IL: { wageBase: 13590, newEmployerRate: 0.0275, minRate: 0.0025, maxRate: 0.0675 },
  MA: { wageBase: 15000, newEmployerRate: 0.0162, minRate: 0.0056, maxRate: 0.1439 },
  OH: { wageBase: 9000, newEmployerRate: 0.027, minRate: 0.003, maxRate: 0.087 },
  GA: { wageBase: 9500, newEmployerRate: 0.027, minRate: 0.004, maxRate: 0.086 },
  NC: { wageBase: 31400, newEmployerRate: 0.01, minRate: 0.006, maxRate: 0.059 },
  VA: { wageBase: 8000, newEmployerRate: 0.026, minRate: 0.001, maxRate: 0.065 },
  AZ: { wageBase: 8000, newEmployerRate: 0.02, minRate: 0.0005, maxRate: 0.1285 },

  // States with no income tax
  AK: { wageBase: 47100, newEmployerRate: 0.018, minRate: 0.01, maxRate: 0.054 },
  FL: { wageBase: 7000, newEmployerRate: 0.027, minRate: 0.001, maxRate: 0.054 },
  NV: { wageBase: 40600, newEmployerRate: 0.03, minRate: 0.0025, maxRate: 0.0525 },
  SD: { wageBase: 15000, newEmployerRate: 0.012, minRate: 0.0, maxRate: 0.095 },
  TX: { wageBase: 9000, newEmployerRate: 0.027, minRate: 0.003, maxRate: 0.063 },
  WA: { wageBase: 68500, newEmployerRate: 0.0189, minRate: 0.0, maxRate: 0.0556 },
  WY: { wageBase: 30900, newEmployerRate: 0.0185, minRate: 0.001, maxRate: 0.085 },
  NH: { wageBase: 14000, newEmployerRate: 0.025, minRate: 0.001, maxRate: 0.07 },
  TN: { wageBase: 7000, newEmployerRate: 0.027, minRate: 0.01, maxRate: 0.10 }
};

// Default SUTA config for states not in our list
const DEFAULT_SUTA_CONFIG: SUTAConfig = {
  wageBase: 7000,
  newEmployerRate: 0.027,
  minRate: 0.005,
  maxRate: 0.10
};

/**
 * Calculate employer taxes for a pay period
 */
export function calculateEmployerTax(input: EmployerTaxInput): EmployerTaxResult {
  const {
    grossPay,
    state,
    ytdGrossWages = 0,
    sutaRate,
    isNewEmployer = true
  } = input;

  // Get SUTA configuration for state
  const sutaConfig = SUTA_RATES_2024[state] || DEFAULT_SUTA_CONFIG;

  // Determine SUTA rate to use
  let appliedSutaRate: number;
  if (sutaRate !== undefined) {
    // Use provided rate (employer's actual experience rate)
    appliedSutaRate = Math.max(sutaConfig.minRate, Math.min(sutaRate, sutaConfig.maxRate));
  } else if (isNewEmployer) {
    appliedSutaRate = sutaConfig.newEmployerRate;
  } else {
    // Default to new employer rate if no rate provided
    appliedSutaRate = sutaConfig.newEmployerRate;
  }

  // Calculate FUTA
  // Wages subject to FUTA (first $7,000 per employee per year)
  const remainingFutaWages = Math.max(0, FUTA_WAGE_CAP - ytdGrossWages);
  const futaWages = Math.min(grossPay, remainingFutaWages);

  // Apply effective FUTA rate (0.6% after credit for paying SUTA)
  const futa = Math.round(futaWages * FUTA_EFFECTIVE_RATE * 100) / 100;

  // Calculate SUTA
  // Wages subject to SUTA (based on state wage base)
  const remainingSutaWages = Math.max(0, sutaConfig.wageBase - ytdGrossWages);
  const sutaWages = Math.min(grossPay, remainingSutaWages);
  const suta = Math.round(sutaWages * appliedSutaRate * 100) / 100;

  // Calculate employer FICA (matches employee)
  const remainingSsWages = Math.max(0, SS_WAGE_CAP_2024 - ytdGrossWages);
  const ssWages = Math.min(grossPay, remainingSsWages);
  const socialSecurity = Math.round(ssWages * EMPLOYER_SS_RATE * 100) / 100;
  const medicare = Math.round(grossPay * EMPLOYER_MEDICARE_RATE * 100) / 100;

  const total = futa + suta + socialSecurity + medicare;

  return {
    futa,
    suta,
    socialSecurity,
    medicare,
    total: Math.round(total * 100) / 100,
    details: {
      futaWages: Math.round(futaWages * 100) / 100,
      sutaWages: Math.round(sutaWages * 100) / 100,
      sutaRate: appliedSutaRate
    }
  };
}

/**
 * Get SUTA configuration for a state
 */
export function getSUTAConfig(state: string): SUTAConfig {
  return SUTA_RATES_2024[state] || DEFAULT_SUTA_CONFIG;
}

/**
 * Get all states with SUTA configurations
 */
export function getStatesWithSUTA(): string[] {
  return Object.keys(SUTA_RATES_2024);
}

// Export constants for reference
export const EMPLOYER_TAX_INFO = {
  futaRate: FUTA_RATE,
  futaEffectiveRate: FUTA_EFFECTIVE_RATE,
  futaWageCap: FUTA_WAGE_CAP,
  employerSsRate: EMPLOYER_SS_RATE,
  employerMedicareRate: EMPLOYER_MEDICARE_RATE,
  ssWageCap: SS_WAGE_CAP_2024,
  sutaRates: SUTA_RATES_2024
};
