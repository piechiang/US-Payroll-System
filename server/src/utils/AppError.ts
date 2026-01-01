/**
 * Custom application error class with HTTP status codes and error codes
 * Provides structured error handling across the application
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);

    // Set the prototype explicitly for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Convert error to JSON for API responses
   */
  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        timestamp: this.timestamp.toISOString()
      }
    };
  }

  // Common error factory methods
  static badRequest(message: string, code: string = 'BAD_REQUEST'): AppError {
    return new AppError(message, 400, code);
  }

  static unauthorized(message: string = 'Unauthorized', code: string = 'UNAUTHORIZED'): AppError {
    return new AppError(message, 401, code);
  }

  static forbidden(message: string = 'Forbidden', code: string = 'FORBIDDEN'): AppError {
    return new AppError(message, 403, code);
  }

  static notFound(resource: string, code: string = 'NOT_FOUND'): AppError {
    return new AppError(`${resource} not found`, 404, code);
  }

  static conflict(message: string, code: string = 'CONFLICT'): AppError {
    return new AppError(message, 409, code);
  }

  static unprocessableEntity(message: string, code: string = 'VALIDATION_ERROR'): AppError {
    return new AppError(message, 422, code);
  }

  static internal(message: string = 'Internal server error', code: string = 'INTERNAL_ERROR'): AppError {
    return new AppError(message, 500, code, false);
  }

  static serviceUnavailable(message: string = 'Service temporarily unavailable', code: string = 'SERVICE_UNAVAILABLE'): AppError {
    return new AppError(message, 503, code);
  }
}

// Specific payroll-related errors
export class PayrollError extends AppError {
  constructor(message: string, code: string = 'PAYROLL_ERROR') {
    super(message, 422, code);
  }

  static invalidPayPeriod(message: string = 'Invalid pay period'): PayrollError {
    return new PayrollError(message, 'INVALID_PAY_PERIOD');
  }

  static calculationError(message: string): PayrollError {
    return new PayrollError(message, 'CALCULATION_ERROR');
  }

  static insufficientData(message: string): PayrollError {
    return new PayrollError(message, 'INSUFFICIENT_DATA');
  }
}

export class EncryptionError extends AppError {
  constructor(message: string, code: string = 'ENCRYPTION_ERROR') {
    super(message, 500, code, false);
  }

  static decryptionFailed(message: string = 'Failed to decrypt data'): EncryptionError {
    return new EncryptionError(message, 'DECRYPTION_FAILED');
  }

  static encryptionFailed(message: string = 'Failed to encrypt data'): EncryptionError {
    return new EncryptionError(message, 'ENCRYPTION_FAILED');
  }
}

export class TenantError extends AppError {
  constructor(message: string, code: string = 'TENANT_ERROR') {
    super(message, 403, code);
  }

  static noTenantContext(message: string = 'No tenant context found'): TenantError {
    return new TenantError(message, 'NO_TENANT_CONTEXT');
  }

  static accessDenied(message: string = 'Access denied to this tenant resource'): TenantError {
    return new TenantError(message, 'TENANT_ACCESS_DENIED');
  }
}