import fs from 'fs/promises';
import path from 'path';

// For CommonJS builds, __dirname is defined
// For ESM builds, we would need import.meta.url
// Since we're building to CommonJS (tsc target), use __dirname
const configDir = __dirname;

/**
 * California State Tax Configuration Structure
 */
export interface CaliforniaConfig {
  state: string;
  stateName: string;
  year: number;
  effectiveDate: string;
  hasIncomeTax: boolean;
  sdi: {
    rate: number;
    wageCap: number;
  };
  sui: {
    employeePaid: boolean;
  };
  suta: {
    wageBase: number;
    newEmployerRate: number;
    minRate: number;
    maxRate: number;
  };
  standardDeduction: Record<string, number>;
  exemptionCredit: Record<string, number>;
  brackets: {
    SINGLE: Array<{ min: number; max: number | null; rate: number; base: number }>;
    MARRIED_FILING_JOINTLY: Array<{ min: number; max: number | null; rate: number; base: number }>;
    HEAD_OF_HOUSEHOLD: Array<{ min: number; max: number | null; rate: number; base: number }>;
  };
}

// Cache loaded configs to avoid repeated file I/O
const configCache = new Map<string, CaliforniaConfig>();

/**
 * Load California tax configuration for a given tax year
 *
 * Features:
 * - Loads from JSON config files in server/src/tax/config/states/
 * - Caches configs in memory to avoid repeated file reads
 * - Falls back to previous year if requested year not available
 * - Throws error only if no config found and year < 2024
 *
 * @param taxYear - The tax year (e.g., 2024, 2025)
 * @returns California tax configuration
 * @throws Error if config file not found and no fallback available
 *
 * @example
 * ```typescript
 * // Load 2024 config
 * const config2024 = await loadCaliforniaConfig(2024);
 * console.log(config2024.sdi.wageCap); // 153164
 *
 * // Load 2025 config (falls back to 2024 if not yet created)
 * const config2025 = await loadCaliforniaConfig(2025);
 * ```
 */
export async function loadCaliforniaConfig(taxYear: number): Promise<CaliforniaConfig> {
  const cacheKey = `CA-${taxYear}`;

  // Return cached config if available
  if (configCache.has(cacheKey)) {
    return configCache.get(cacheKey)!;
  }

  // Try to load config for requested year
  const configPath = path.join(configDir, 'states', `california-${taxYear}.json`);

  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    const config: CaliforniaConfig = JSON.parse(configData);

    // Validate config structure
    if (!config.sdi || !config.brackets || !config.standardDeduction || !config.exemptionCredit) {
      throw new Error(
        `Invalid California config structure for year ${taxYear}. ` +
        `Missing required fields: sdi, brackets, standardDeduction, or exemptionCredit`
      );
    }

    // Validate brackets for required filing statuses
    if (!config.brackets.SINGLE || !config.brackets.MARRIED_FILING_JOINTLY || !config.brackets.HEAD_OF_HOUSEHOLD) {
      throw new Error(
        `Invalid California config for year ${taxYear}. ` +
        `Missing required bracket types: SINGLE, MARRIED_FILING_JOINTLY, HEAD_OF_HOUSEHOLD`
      );
    }

    // Cache and return
    configCache.set(cacheKey, config);
    console.log(`Loaded California tax config for year ${taxYear}`);
    return config;
  } catch (error) {
    // If file not found, try fallback to previous year
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && taxYear > 2024) {
      console.warn(
        `California tax config for ${taxYear} not found at ${configPath}. ` +
        `Falling back to ${taxYear - 1}. ` +
        `WARNING: This may result in incorrect withholding. ` +
        `Please create california-${taxYear}.json with official CA FTB rates.`
      );
      return loadCaliforniaConfig(taxYear - 1);
    }

    // No fallback available - this is a critical error
    throw new Error(
      `California tax config not found for year ${taxYear} at ${configPath}. ` +
      `Please create this file with official California FTB tax rates. ` +
      `Original error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Clear config cache (useful for testing or hot-reloading)
 *
 * @example
 * ```typescript
 * // In tests
 * afterEach(() => {
 *   clearCaliforniaConfigCache();
 * });
 * ```
 */
export function clearCaliforniaConfigCache(): void {
  configCache.clear();
  console.log('California tax config cache cleared');
}

/**
 * Preload configs for common years (optional optimization)
 *
 * Call this during application startup to avoid first-request latency
 *
 * @param years - Array of years to preload (defaults to current year and next year)
 *
 * @example
 * ```typescript
 * // In server startup
 * await preloadCaliforniaConfigs([2024, 2025]);
 * ```
 */
export async function preloadCaliforniaConfigs(years?: number[]): Promise<void> {
  const currentYear = new Date().getFullYear();
  const yearsToLoad = years || [currentYear, currentYear + 1];

  console.log(`Preloading California tax configs for years: ${yearsToLoad.join(', ')}`);

  await Promise.allSettled(
    yearsToLoad.map(async (year) => {
      try {
        await loadCaliforniaConfig(year);
      } catch (error) {
        console.warn(`Failed to preload California config for ${year}:`, error);
      }
    })
  );

  console.log(`California tax config preload complete. Cached: ${configCache.size} configs`);
}
