import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index.js';
import { logger } from '../services/logger.js';

/**
 * Get JWT secret with security validation
 * SECURITY: No default value - must be explicitly configured
 */
function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET environment variable must be set');
  }

  // Validate minimum security requirements
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  // Block known insecure defaults
  if (secret === 'dev-secret-change-in-production' || secret.startsWith('change-me')) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Insecure JWT_SECRET detected in production. Please generate a secure random key.');
    }
    console.warn('⚠️  WARNING: Using insecure JWT_SECRET. Change this before deploying to production!');
  }

  return secret;
}

// Validate JWT secret at startup (will throw if invalid)
const JWT_SECRET = getJWTSecret();

// Extended request type with user info
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
  // Companies the user has access to
  accessibleCompanyIds?: string[];
}

/**
 * Authentication middleware - verifies JWT token
 */
export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        email: string;
        role: string;
      };

      req.user = decoded;

      // Fetch accessible company IDs for this user
      const companyAccess = await prisma.companyAccess.findMany({
        where: { userId: decoded.userId },
        select: { companyId: true }
      });

      req.accessibleCompanyIds = companyAccess.map(ca => ca.companyId);

      next();
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Authorization middleware - checks if user has access to a specific company
 */
export function authorizeCompanyAccess(companyIdParam: string = 'companyId') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Admin users have access to all companies
      if (req.user.role === 'ADMIN') {
        return next();
      }

      // Get company ID from params, body, or query
      const companyId =
        req.params[companyIdParam] ||
        req.body?.companyId ||
        req.query?.companyId;

      if (!companyId) {
        return next(); // No company specified, let the route handle it
      }

      // Check if user has access to this company
      if (!req.accessibleCompanyIds?.includes(companyId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this company'
        });
      }

      next();
    } catch (error) {
      logger.error('Authorization error:', error);
      return res.status(500).json({ error: 'Authorization failed' });
    }
  };
}

/**
 * Role-based authorization middleware
 */
export function authorizeRoles(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Filter query to only include companies the user has access to
 * SECURITY: Non-admin users with no company access will get empty results (not all results)
 */
export function filterByAccessibleCompanies(req: AuthRequest): { companyId: { in: string[] } } | {} {
  if (req.user?.role === 'ADMIN') {
    return {}; // Admin can see all
  }

  // Non-admin users can only see companies they have explicit access to
  // If they have no access to any company, they see nothing (empty array = empty results)
  return {
    companyId: { in: req.accessibleCompanyIds || [] }
  };
}

/**
 * Check if user has access to a specific company
 * SECURITY: Returns false for non-admin users with no company access
 */
export function hasCompanyAccess(req: AuthRequest, companyId: string): boolean {
  if (!req.user) {
    return false;
  }

  // Admin users have access to all companies
  if (req.user.role === 'ADMIN') {
    return true;
  }

  // Non-admin users must have explicit access
  // Empty accessibleCompanyIds means no access to any company
  if (!req.accessibleCompanyIds || req.accessibleCompanyIds.length === 0) {
    return false;
  }

  return req.accessibleCompanyIds.includes(companyId);
}

/**
 * Require user to have access to at least one company
 * SECURITY: Blocks non-admin users with no company access
 */
export function requireCompanyAccess() {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admin users bypass this check
    if (req.user.role === 'ADMIN') {
      return next();
    }

    // Non-admin users must have access to at least one company
    if (!req.accessibleCompanyIds || req.accessibleCompanyIds.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to any company. Contact an administrator.'
      });
    }

    next();
  };
}
