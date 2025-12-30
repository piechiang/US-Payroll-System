import rateLimit from 'express-rate-limit';

/**
 * Rate limiting middleware to prevent abuse
 *
 * Different limits for different endpoint types:
 * - Auth endpoints: Stricter limits to prevent brute force attacks
 * - General API: Moderate limits for normal usage
 * - Payroll run: Very strict to prevent accidental double-runs
 */

// General API rate limit
// 100 requests per 15 minutes per IP
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: 'Too many requests',
    message: 'Please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
});

// Strict rate limit for authentication endpoints
// 5 login attempts per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    error: 'Too many login attempts',
    message: 'Please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
});

// Registration rate limit
// 3 registrations per hour per IP
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    error: 'Too many registration attempts',
    message: 'Please try again later',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Payroll run rate limit - very strict
// 5 payroll runs per hour per IP
export const payrollRunLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    error: 'Too many payroll run attempts',
    message: 'Please wait before running another payroll batch',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Write operations rate limit (create, update, delete)
// 30 write operations per 15 minutes per IP
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: {
    error: 'Too many write operations',
    message: 'Please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Export/Report rate limit - prevents bulk data exfiltration
// 10 exports per hour per IP (for PDF, ACH files, W-2 generation, tax reports)
export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    error: 'Too many export requests',
    message: 'Export rate limit exceeded. Please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
