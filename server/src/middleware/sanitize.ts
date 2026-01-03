import { Request, Response, NextFunction } from 'express';

/**
 * Input Sanitization Middleware
 *
 * Protects against XSS attacks by detecting dangerous HTML/JavaScript patterns.
 *
 * NOTE ON SQL INJECTION:
 * This middleware does NOT check for SQL injection patterns because:
 * 1. Prisma ORM uses parameterized queries that prevent SQL injection by design
 * 2. SQL keyword patterns (SELECT, DROP, OR, etc.) cause false positives
 *    - Legitimate use cases: "Selector Tool", "Drop-in Support", "OR gate operator"
 *    - Department names, job titles, descriptions may contain SQL keywords
 * 3. Defense in depth: SQL injection is prevented at the ORM layer (Prisma)
 *    - All database queries use parameterized statements
 *    - User input is never concatenated into SQL strings
 *    - Prisma automatically escapes and validates all parameters
 *
 * For additional protection against raw SQL queries (if any):
 * - Always use Prisma's query builder methods
 * - Never use prisma.$queryRaw with string concatenation
 * - Use prisma.$queryRaw`...` template literals (parameterized)
 * - Validate data types with Zod schemas before database operations
 */

// Patterns that indicate potential XSS attacks
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,  // Script tags
  /javascript:/gi,                                         // javascript: protocol
  /on\w+\s*=/gi,                                          // Event handlers (onclick=, onerror=, etc.)
  /data:\s*text\/html/gi,                                 // Data URLs with HTML
  /<iframe/gi,                                            // iframes
  /<object/gi,                                            // object tags
  /<embed/gi,                                             // embed tags
  /<svg\b[^>]*onload/gi,                                  // SVG with onload
  /<img[^>]+on\w+/gi,                                     // img tags with event handlers
  /vbscript:/gi,                                          // vbscript: protocol
];

/**
 * Check if a string contains dangerous XSS patterns
 */
function containsDangerousContent(value: string): { dangerous: boolean; pattern?: string } {
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(value)) {
      return { dangerous: true, pattern: 'XSS' };
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
