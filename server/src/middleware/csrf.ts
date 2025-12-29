import { doubleCsrf } from 'csrf-csrf';
import { Request, Response, NextFunction } from 'express';

/**
 * CSRF Protection Middleware
 *
 * Uses the Double Submit Cookie pattern:
 * - A CSRF token is stored in a cookie
 * - The same token must be sent in a header (X-CSRF-Token) for state-changing requests
 * - The server validates that both match
 */

// Get CSRF secret from environment
function getCSRFSecret(): string {
  const secret = process.env.CSRF_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CSRF_SECRET environment variable must be set in production');
    }
    // Use a default for development only
    console.warn('⚠️  WARNING: Using default CSRF secret. Set CSRF_SECRET in production!');
    return 'dev-csrf-secret-change-in-production-32chars!';
  }
  if (secret.length < 32) {
    throw new Error('CSRF_SECRET must be at least 32 characters long');
  }
  return secret;
}

const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => getCSRFSecret(),
  getSessionIdentifier: (req) => req.ip || 'anonymous', // Use IP as session identifier
  cookieName: '__Host-psifi.x-csrf-token', // Secure cookie name
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  },
  size: 64, // Token size in bytes
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'], // Don't require CSRF for safe methods
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] as string, // Get token from header
});

/**
 * Generate CSRF token endpoint handler
 * Call this to get a token for the frontend to use
 */
export function csrfTokenHandler(req: Request, res: Response) {
  const token = generateCsrfToken(req, res);
  res.json({ csrfToken: token });
}

/**
 * CSRF protection middleware
 * Apply to routes that need CSRF protection (POST, PUT, DELETE, PATCH)
 */
export const csrfProtection = doubleCsrfProtection;

/**
 * Error handler for CSRF validation failures
 */
export function csrfErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (err.message === 'invalid csrf token') {
    return res.status(403).json({
      error: 'CSRF validation failed',
      message: 'Invalid or missing CSRF token. Please refresh and try again.'
    });
  }
  next(err);
}
