/**
 * Caching Service
 *
 * Provides in-memory caching for frequently accessed data like:
 * - Tax rate configurations
 * - Company settings
 * - Employee tax withholding info
 */

import NodeCache from 'node-cache';
import { logger } from './logger.js';

// Cache instances with different TTLs
const taxRateCache = new NodeCache({
  stdTTL: 3600,      // 1 hour TTL for tax rates
  checkperiod: 120,  // Check for expired keys every 2 minutes
  useClones: false   // Don't clone objects (performance)
});

const companyCache = new NodeCache({
  stdTTL: 300,       // 5 minutes TTL for company config
  checkperiod: 60,
  useClones: false
});

const employeeCache = new NodeCache({
  stdTTL: 60,        // 1 minute TTL for employee data
  checkperiod: 30,
  useClones: false
});

// Cache statistics
interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
}

/**
 * Get cached tax rates
 */
export function getCachedTaxRates<T>(key: string): T | undefined {
  const value = taxRateCache.get<T>(key);
  if (value) {
    logger.debug(`Cache hit: tax rates ${key}`);
  }
  return value;
}

/**
 * Set cached tax rates
 */
export function setCachedTaxRates<T>(key: string, value: T, ttl?: number): void {
  if (ttl !== undefined) {
    taxRateCache.set(key, value, ttl);
  } else {
    taxRateCache.set(key, value);
  }
  logger.debug(`Cache set: tax rates ${key}`);
}

/**
 * Get cached company config
 */
export function getCachedCompany<T>(companyId: string): T | undefined {
  return companyCache.get<T>(`company:${companyId}`);
}

/**
 * Set cached company config
 */
export function setCachedCompany<T>(companyId: string, value: T): void {
  companyCache.set(`company:${companyId}`, value);
}

/**
 * Invalidate company cache
 */
export function invalidateCompanyCache(companyId: string): void {
  companyCache.del(`company:${companyId}`);
  logger.debug(`Cache invalidated: company ${companyId}`);
}

/**
 * Get cached employee data
 */
export function getCachedEmployee<T>(employeeId: string): T | undefined {
  return employeeCache.get<T>(`employee:${employeeId}`);
}

/**
 * Set cached employee data
 */
export function setCachedEmployee<T>(employeeId: string, value: T): void {
  employeeCache.set(`employee:${employeeId}`, value);
}

/**
 * Invalidate employee cache
 */
export function invalidateEmployeeCache(employeeId: string): void {
  employeeCache.del(`employee:${employeeId}`);
}

/**
 * Clear all caches (useful for testing or manual refresh)
 */
export function clearAllCaches(): void {
  taxRateCache.flushAll();
  companyCache.flushAll();
  employeeCache.flushAll();
  logger.info('All caches cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  taxRates: CacheStats;
  company: CacheStats;
  employee: CacheStats;
} {
  const taxStats = taxRateCache.getStats();
  const companyStats = companyCache.getStats();
  const employeeStats = employeeCache.getStats();

  return {
    taxRates: {
      hits: taxStats.hits,
      misses: taxStats.misses,
      keys: taxRateCache.keys().length
    },
    company: {
      hits: companyStats.hits,
      misses: companyStats.misses,
      keys: companyCache.keys().length
    },
    employee: {
      hits: employeeStats.hits,
      misses: employeeStats.misses,
      keys: employeeCache.keys().length
    }
  };
}

/**
 * Memoize async function with cache
 */
export function memoize<T>(
  fn: (...args: unknown[]) => Promise<T>,
  keyFn: (...args: unknown[]) => string,
  cache: NodeCache = taxRateCache
): (...args: unknown[]) => Promise<T> {
  return async (...args: unknown[]): Promise<T> => {
    const key = keyFn(...args);
    const cached = cache.get<T>(key);

    if (cached !== undefined) {
      return cached;
    }

    const result = await fn(...args);
    cache.set(key, result);
    return result;
  };
}

// Export cache instances for advanced use cases
export { taxRateCache, companyCache, employeeCache };
