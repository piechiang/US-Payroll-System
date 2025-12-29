import { Response } from 'express';

/**
 * Standardized API Response Helpers
 *
 * Ensures consistent response format across all endpoints.
 *
 * Success responses:
 * {
 *   success: true,
 *   data: <payload>,
 *   message?: <optional message>,
 *   pagination?: <for list endpoints>
 * }
 *
 * Error responses:
 * {
 *   success: false,
 *   error: <error type>,
 *   message: <human-readable message>,
 *   reference?: <error tracking ID>,
 *   details?: <validation details>
 * }
 */

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
  pagination?: PaginationMeta;
}

export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  reference?: string;
  details?: unknown;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

/**
 * Send a successful response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  options: {
    status?: number;
    message?: string;
    pagination?: PaginationMeta;
  } = {}
): Response {
  const { status = 200, message, pagination } = options;

  const response: SuccessResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
    ...(pagination && { pagination })
  };

  return res.status(status).json(response);
}

/**
 * Send a created response (201)
 */
export function sendCreated<T>(
  res: Response,
  data: T,
  message?: string
): Response {
  return sendSuccess(res, data, { status: 201, message: message || 'Created successfully' });
}

/**
 * Send a paginated response
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta
): Response {
  return sendSuccess(res, data, { pagination });
}

/**
 * Send an error response
 */
export function sendError(
  res: Response,
  statusCode: number,
  error: string,
  message: string,
  options: {
    reference?: string;
    details?: unknown;
  } = {}
): Response {
  const response: ErrorResponse = {
    success: false,
    error,
    message,
  };

  if (options.reference) {
    response.reference = options.reference;
  }
  if (options.details) {
    response.details = options.details;
  }

  return res.status(statusCode).json(response);
}

/**
 * Common error responses
 */
export const errors = {
  badRequest: (res: Response, message: string, details?: unknown) =>
    sendError(res, 400, 'BAD_REQUEST', message, { details }),

  unauthorized: (res: Response, message = 'Authentication required') =>
    sendError(res, 401, 'UNAUTHORIZED', message),

  forbidden: (res: Response, message = 'Access denied') =>
    sendError(res, 403, 'FORBIDDEN', message),

  notFound: (res: Response, resource = 'Resource') =>
    sendError(res, 404, 'NOT_FOUND', `${resource} not found`),

  conflict: (res: Response, message: string) =>
    sendError(res, 409, 'CONFLICT', message),

  validationFailed: (res: Response, details: unknown) =>
    sendError(res, 400, 'VALIDATION_ERROR', 'Validation failed', { details }),

  tooManyRequests: (res: Response, message = 'Too many requests') =>
    sendError(res, 429, 'RATE_LIMIT', message),

  internal: (res: Response, reference?: string) =>
    sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred', { reference })
};

/**
 * Calculate pagination metadata
 */
export function calculatePagination(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

/**
 * Parse pagination query parameters
 */
export function parsePaginationParams(query: {
  page?: string;
  limit?: string;
}): { page: number; limit: number; skip: number } {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
