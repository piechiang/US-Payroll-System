import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';
import { ZodError } from 'zod';
import { storage } from './requestLogger.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = storage.getStore()?.get('requestId') || 'unknown';

  // 1. Handle known operational errors
  if (err instanceof AppError) {
    console.warn(`[${requestId}] [${err.code}] Operational Error: ${err.message}`);
    return res.status(err.statusCode).json({
      status: 'error',
      code: err.code,
      message: err.message,
      timestamp: err.timestamp.toISOString(),
      requestId
    });
  }

  // 2. Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      status: 'fail',
      message: 'Validation Error',
      errors: err.errors,
      requestId
    });
  }

  // 3. Handle unexpected errors (do not leak stack trace in production)
  console.error(`[${requestId}] 💥 Unexpected Error:`, err);
  return res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
    requestId
  });
}

export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
}