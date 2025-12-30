/**
 * Prometheus Metrics Service
 *
 * Collects and exposes application metrics for monitoring.
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a custom registry
export const metricsRegistry = new Registry();

// Add default Node.js metrics (memory, CPU, etc.)
collectDefaultMetrics({ register: metricsRegistry });

// HTTP Request metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [metricsRegistry]
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry]
});

// Database metrics
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [metricsRegistry]
});

export const dbConnectionsActive = new Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections',
  registers: [metricsRegistry]
});

// Business metrics
export const payrollOperationsTotal = new Counter({
  name: 'payroll_operations_total',
  help: 'Total payroll operations',
  labelNames: ['operation', 'status'],
  registers: [metricsRegistry]
});

export const employeesTotal = new Gauge({
  name: 'employees_total',
  help: 'Total number of employees',
  labelNames: ['company_id', 'status'],
  registers: [metricsRegistry]
});

export const authEventsTotal = new Counter({
  name: 'auth_events_total',
  help: 'Total authentication events',
  labelNames: ['event', 'success'],
  registers: [metricsRegistry]
});

// Cache metrics
export const cacheHitsTotal = new Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_type'],
  registers: [metricsRegistry]
});

export const cacheMissesTotal = new Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_type'],
  registers: [metricsRegistry]
});

// Error metrics
export const errorsTotal = new Counter({
  name: 'errors_total',
  help: 'Total errors',
  labelNames: ['type', 'path'],
  registers: [metricsRegistry]
});

// Rate limiting metrics
export const rateLimitHitsTotal = new Counter({
  name: 'rate_limit_hits_total',
  help: 'Total rate limit hits',
  labelNames: ['endpoint'],
  registers: [metricsRegistry]
});

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}

/**
 * Get metrics content type
 */
export function getMetricsContentType(): string {
  return metricsRegistry.contentType;
}

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  path: string,
  status: number,
  durationMs: number
): void {
  // Normalize path to avoid high cardinality (replace IDs with :id)
  const normalizedPath = path
    .replace(/\/[a-f0-9-]{36}/gi, '/:id')  // UUID
    .replace(/\/\d+/g, '/:id');             // Numeric IDs

  httpRequestsTotal.labels(method, normalizedPath, String(status)).inc();
  httpRequestDuration.labels(method, normalizedPath, String(status)).observe(durationMs / 1000);
}

/**
 * Record payroll operation
 */
export function recordPayrollOperation(operation: string, success: boolean): void {
  payrollOperationsTotal.labels(operation, success ? 'success' : 'failure').inc();
}

/**
 * Record authentication event
 */
export function recordAuthEvent(event: string, success: boolean): void {
  authEventsTotal.labels(event, success ? 'true' : 'false').inc();
}

/**
 * Record error
 */
export function recordError(type: string, path: string): void {
  errorsTotal.labels(type, path).inc();
}

/**
 * Record cache hit/miss
 */
export function recordCacheAccess(cacheType: string, hit: boolean): void {
  if (hit) {
    cacheHitsTotal.labels(cacheType).inc();
  } else {
    cacheMissesTotal.labels(cacheType).inc();
  }
}
