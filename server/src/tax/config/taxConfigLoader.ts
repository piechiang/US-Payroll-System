/**
 * Tax Configuration Loader
 *
 * Loads tax rates and brackets from JSON configuration files.
 * This allows updating tax rates for new years without code changes.
 *
 * Configuration files are located in:
 * - Federal: config/federal-{year}.json
 * - State: config/states/{state}-{year}.json
 *
 * Usage:
 * 1. Copy existing config file for new year
 * 2. Update rates and brackets per IRS/state announcements
 * 3. Restart server to load new configs
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// Config directory path - relative to project root
// This is resolved at runtime to work in both dev and production
const CONFIG_DIR = join(process.cwd(), 'src', 'tax', 'config');

// Cache for loaded configurations
const federalConfigCache = new Map<number, FederalTaxConfig>();
const stateConfigCache = new Map<string, StateTaxConfig>();

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
  base: number;
}

export interface FederalTaxConfig {
  year: number;
  effectiveDate: string;
  fica: {
    socialSecurityRate: number;
    medicareRate: number;
    additionalMedicareRate: number;
    additionalMedicareThreshold: number;
    socialSecurityWageCap: number;
  };
  futa: {
    rate: number;
    creditRate: number;
    effectiveRate: number;
    wageCap: number;
  };
  federalWithholding: {
    [filingStatus: string]: {
      standardDeduction: number;
      brackets: TaxBracket[];
    };
  };
  dependentCredit: number;
}

export interface StateTaxConfig {
  state: string;
  stateName: string;
  year: number;
  effectiveDate: string;
  hasIncomeTax: boolean;
  sdi?: {
    rate: number;
    wageCap: number;
  };
  sui?: {
    employeePaid: boolean;
    rate?: number;
  };
  suta: {
    wageBase: number;
    newEmployerRate: number;
    minRate: number;
    maxRate: number;
  };
  standardDeduction?: {
    [filingStatus: string]: number;
  };
  exemptionCredit?: {
    [filingStatus: string]: number;
  };
  brackets?: {
    [filingStatus: string]: TaxBracket[];
  };
  flatRate?: number;
}

/**
 * Load federal tax configuration for a specific year
 * Falls back to most recent year if specified year not found
 */
export function loadFederalConfig(year: number): FederalTaxConfig {
  // Check cache first
  if (federalConfigCache.has(year)) {
    return federalConfigCache.get(year)!;
  }

  const configPath = join(CONFIG_DIR, `federal-${year}.json`);

  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as FederalTaxConfig;
    federalConfigCache.set(year, config);
    return config;
  }

  // Find most recent available year
  const availableYears = getAvailableFederalYears();
  const closestYear = availableYears
    .filter(y => y <= year)
    .sort((a, b) => b - a)[0];

  if (closestYear) {
    console.warn(`Federal tax config for ${year} not found, using ${closestYear}`);
    return loadFederalConfig(closestYear);
  }

  throw new Error(`No federal tax configuration available for year ${year} or earlier`);
}

/**
 * Load state tax configuration for a specific state and year
 * Falls back to most recent year if specified year not found
 */
export function loadStateConfig(state: string, year: number): StateTaxConfig | null {
  const cacheKey = `${state}-${year}`;

  // Check cache first
  if (stateConfigCache.has(cacheKey)) {
    return stateConfigCache.get(cacheKey)!;
  }

  const statesDir = join(CONFIG_DIR, 'states');
  const configPath = join(statesDir, `${state.toLowerCase()}-${year}.json`);

  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as StateTaxConfig;
    stateConfigCache.set(cacheKey, config);
    return config;
  }

  // Find most recent available year for this state
  const availableYears = getAvailableStateYears(state);
  const closestYear = availableYears
    .filter(y => y <= year)
    .sort((a, b) => b - a)[0];

  if (closestYear) {
    console.warn(`State tax config for ${state} ${year} not found, using ${closestYear}`);
    return loadStateConfig(state, closestYear);
  }

  // No config file found for this state
  return null;
}

/**
 * Get all available federal tax years
 */
export function getAvailableFederalYears(): number[] {
  const years: number[] = [];
  const files = readdirSync(CONFIG_DIR);

  for (const file of files) {
    const match = file.match(/^federal-(\d{4})\.json$/);
    if (match) {
      years.push(parseInt(match[1], 10));
    }
  }

  return years.sort((a, b) => b - a);
}

/**
 * Get all available years for a specific state
 */
export function getAvailableStateYears(state: string): number[] {
  const years: number[] = [];
  const statesDir = join(CONFIG_DIR, 'states');

  if (!existsSync(statesDir)) {
    return years;
  }

  const files = readdirSync(statesDir);
  const statePrefix = state.toLowerCase();

  for (const file of files) {
    const match = file.match(new RegExp(`^${statePrefix}-(\\d{4})\\.json$`));
    if (match) {
      years.push(parseInt(match[1], 10));
    }
  }

  return years.sort((a, b) => b - a);
}

/**
 * Get all states with configuration files
 */
export function getConfiguredStates(): string[] {
  const states = new Set<string>();
  const statesDir = join(CONFIG_DIR, 'states');

  if (!existsSync(statesDir)) {
    return [];
  }

  const files = readdirSync(statesDir);

  for (const file of files) {
    const match = file.match(/^([a-z]+)-\d{4}\.json$/);
    if (match) {
      states.add(match[1].toUpperCase());
    }
  }

  return Array.from(states).sort();
}

/**
 * Clear configuration cache (useful for hot-reloading in development)
 */
export function clearConfigCache(): void {
  federalConfigCache.clear();
  stateConfigCache.clear();
}

/**
 * Get current tax year based on pay date
 */
export function getTaxYear(payDate: Date): number {
  return payDate.getFullYear();
}

/**
 * Validate tax configuration structure
 */
export function validateFederalConfig(config: unknown): config is FederalTaxConfig {
  if (!config || typeof config !== 'object') return false;

  const c = config as Record<string, unknown>;
  return (
    typeof c.year === 'number' &&
    typeof c.effectiveDate === 'string' &&
    typeof c.fica === 'object' &&
    typeof c.futa === 'object' &&
    typeof c.federalWithholding === 'object' &&
    typeof c.dependentCredit === 'number'
  );
}

export function validateStateConfig(config: unknown): config is StateTaxConfig {
  if (!config || typeof config !== 'object') return false;

  const c = config as Record<string, unknown>;
  return (
    typeof c.state === 'string' &&
    typeof c.year === 'number' &&
    typeof c.hasIncomeTax === 'boolean' &&
    typeof c.suta === 'object'
  );
}
