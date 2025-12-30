import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import crypto from 'crypto';
import { logger } from '../services/logger.js';

/**
 * Error Handler Middleware
 *
 * Provides consistent error responses while hiding sensitive details in production.
 * Logs full error details server-side for debugging.
 */

// Error types for categorization
export type ErrorType =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMIT'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR';

// Custom error class for application errors
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorType: ErrorType;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    errorType: ErrorType = 'INTERNAL_ERROR',
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Predefined error factories
export const Errors = {
  validation: (message: string, details?: unknown) =>
    new AppError(message, 400, 'VALIDATION_ERROR', details),

  unauthorized: (message = 'Authentication required') =>
    new AppError(message, 401, 'AUTHENTICATION_ERROR'),

  forbidden: (message = 'Access denied') =>
    new AppError(message, 403, 'AUTHORIZATION_ERROR'),

  notFound: (resource = 'Resource') =>
    new AppError(`${resource} not found`, 404, 'NOT_FOUND'),

  conflict: (message: string) =>
    new AppError(message, 409, 'CONFLICT'),

  rateLimit: (message = 'Too many requests') =>
    new AppError(message, 429, 'RATE_LIMIT'),

  internal: (message = 'Internal server error') =>
    new AppError(message, 500, 'INTERNAL_ERROR')
};

/**
 * Generate error reference ID for tracking
 */
function generateErrorRef(): string {
  return crypto.randomBytes(8).toString('hex').toUpperCase();
}

/**
 * Determine if error details should be exposed
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if error is a Prisma known request error
 */
function isPrismaKnownRequestError(error: unknown): error is { code: string; meta?: Record<string, unknown> } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

/**
 * Check if error is a Prisma validation error
 */
function isPrismaValidationError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'PrismaClientValidationError'
  );
}

/**
 * Map Prisma errors to user-friendly messages
 */
function handlePrismaError(error: { code: string; meta?: Record<string, unknown> }): {
  statusCode: number;
  message: string;
  errorType: ErrorType;
} {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      const field = (error.meta?.target as string[])?.join(', ') || 'field';
      return {
        statusCode: 409,
        message: `A record with this ${field} already exists`,
        errorType: 'CONFLICT'
      };

    case 'P2025':
      // Record not found
      return {
        statusCode: 404,
        message: 'Record not found',
        errorType: 'NOT_FOUND'
      };

    case 'P2003':
      // Foreign key constraint violation
      return {
        statusCode: 400,
        message: 'Related record not found',
        errorType: 'VALIDATION_ERROR'
      };

    case 'P2014':
      // Required relation violation
      return {
        statusCode: 400,
        message: 'Required relation is missing',
        errorType: 'VALIDATION_ERROR'
      };

    default:
      return {
        statusCode: 500,
        message: 'Database operation failed',
        errorType: 'DATABASE_ERROR'
      };
  }
}

/**
 * Map Zod validation errors to user-friendly format
 */
function handleZodError(error: ZodError): {
  statusCode: number;
  message: string;
  details: unknown;
} {
  const issues = error.issues.map(issue => ({
    field: issue.path.join('.'),
    message: issue.message
  }));

  return {
    statusCode: 400,
    message: 'Validation failed',
    details: issues
  };
}

/**
 * Central error handling middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const errorRef = generateErrorRef();
  const isProd = isProduction();

  // Default error response
  let statusCode = 500;
  let errorType: ErrorType = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: unknown = undefined;

  // Handle known error types
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorType = err.errorType;
    message = err.message;
    details = isProd ? undefined : err.details;
  } else if (err instanceof ZodError) {
    const zodResult = handleZodError(err);
    statusCode = zodResult.statusCode;
    errorType = 'VALIDATION_ERROR';
    message = zodResult.message;
    details = zodResult.details; // Always show validation details
  } else if (isPrismaKnownRequestError(err)) {
    const prismaResult = handlePrismaError(err);
    statusCode = prismaResult.statusCode;
    errorType = prismaResult.errorType;
    message = prismaResult.message;
  } else if (isPrismaValidationError(err)) {
    statusCode = 400;
    errorType = 'VALIDATION_ERROR';
    message = 'Invalid data format';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorType = 'AUTHENTICATION_ERROR';
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorType = 'AUTHENTICATION_ERROR';
    message = 'Token expired';
  }

  // Log full error details server-side (sanitized)
  logger.error(`[${errorRef}] ${errorType}:`, {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: (req as any).user?.userId
  });

  // Build response
  const response: Record<string, unknown> = {
    error: errorType,
    message,
    reference: errorRef
  };

  // Include details if available and appropriate
  if (details) {
    response.details = details;
  }

  // In development, include stack trace
  if (!isProd && err.stack) {
    response.stack = err.stack.split('\n');
  }

  res.status(statusCode).json(response);
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`
  });
}

/**
 * Async handler wrapper to catch promise rejections
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
