import { Request, Response, NextFunction } from 'express';

/**
 * Input Sanitization Middleware
 *
 * Sanitizes request body, query params, and params to prevent XSS attacks.
 * Does NOT modify values - only validates and rejects dangerous input.
 */

// Patterns that indicate potential XSS or injection attacks
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,  // Script tags
  /javascript:/gi,                                         // javascript: protocol
  /on\w+\s*=/gi,                                          // Event handlers (onclick=, onerror=, etc.)
  /data:\s*text\/html/gi,                                 // Data URLs with HTML
  /<iframe/gi,                                            // iframes
  /<object/gi,                                            // object tags
  /<embed/gi,                                             // embed tags
  /<svg\b[^>]*onload/gi,                                  // SVG with onload
];

// SQL injection patterns (basic detection)
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b.*\b(FROM|INTO|TABLE|DATABASE)\b)/gi,
  /(\b(UNION)\b.*\b(SELECT)\b)/gi,
  /(--|\#|\/\*)/g,  // SQL comments
  /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/gi,  // OR 1=1, AND 1=1
];

/**
 * Check if a string contains dangerous patterns
 */
function containsDangerousContent(value: string): { dangerous: boolean; pattern?: string } {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(value)) {
      return { dangerous: true, pattern: 'XSS' };
    }
  }

  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      return { dangerous: true, pattern: 'SQL Injection' };
    }
  }

  return { dangerous: false };
}

/**
 * Recursively check object for dangerous content
 */
function checkObject(obj: unknown, path: string = ''): { dangerous: boolean; path?: string; pattern?: string } {
  if (obj === null || obj === undefined) {
    return { dangerous: false };
  }

  if (typeof obj === 'string') {
    const result = containsDangerousContent(obj);
    if (result.dangerous) {
      return { dangerous: true, path, pattern: result.pattern };
    }
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = checkObject(obj[i], `${path}[${i}]`);
      if (result.dangerous) {
        return result;
      }
    }
  }

  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      // Check the key itself
      const keyResult = containsDangerousContent(key);
      if (keyResult.dangerous) {
        return { dangerous: true, path: `${path}.${key}`, pattern: keyResult.pattern };
      }

      // Check the value
      const valueResult = checkObject(value, path ? `${path}.${key}` : key);
      if (valueResult.dangerous) {
        return valueResult;
      }
    }
  }

  return { dangerous: false };
}

/**
 * Sanitization middleware
 *
 * Checks request body, query params, and URL params for dangerous content.
 * Rejects requests with potential XSS or injection attacks.
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  // Skip sanitization for certain content types (file uploads)
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return next();
  }

  // Check request body
  if (req.body) {
    const bodyResult = checkObject(req.body, 'body');
    if (bodyResult.dangerous) {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: `Potentially dangerous content detected in request`,
        field: bodyResult.path
      });
      return;
    }
  }

  // Check query parameters
  if (req.query) {
    const queryResult = checkObject(req.query, 'query');
    if (queryResult.dangerous) {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: `Potentially dangerous content detected in request`,
        field: queryResult.path
      });
      return;
    }
  }

  // Check URL parameters
  if (req.params) {
    const paramsResult = checkObject(req.params, 'params');
    if (paramsResult.dangerous) {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: `Potentially dangerous content detected in request`,
        field: paramsResult.path
      });
      return;
    }
  }

  next();
}

/**
 * HTML escape function for output encoding
 * Use this when rendering user input in HTML contexts
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize a string by removing potentially dangerous characters
 * Use for identifiers, names, etc.
 */
export function sanitizeString(input: string, options: {
  allowSpaces?: boolean;
  allowDashes?: boolean;
  allowUnderscores?: boolean;
  maxLength?: number;
} = {}): string {
  const {
    allowSpaces = true,
    allowDashes = true,
    allowUnderscores = true,
    maxLength = 255
  } = options;

  let pattern = 'a-zA-Z0-9';
  if (allowSpaces) pattern += ' ';
  if (allowDashes) pattern += '\\-';
  if (allowUnderscores) pattern += '_';

  const regex = new RegExp(`[^${pattern}]`, 'g');
  return input.replace(regex, '').substring(0, maxLength);
}
