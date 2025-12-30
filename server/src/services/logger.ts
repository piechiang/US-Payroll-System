/**
 * Secure Logger Service
 *
 * Sanitizes sensitive data before logging to prevent accidental exposure
 * of SSNs, bank account numbers, passwords, tokens, and other PII.
 */

// Patterns to detect and sanitize sensitive data
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string; name: string }> = [
  // SSN patterns (XXX-XX-XXXX, XXXXXXXXX)
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '***-**-****', name: 'SSN' },
  { pattern: /\b\d{9}\b(?=.*(?:ssn|social|security))/gi, replacement: '*********', name: 'SSN' },

  // Bank account numbers (4-17 digits, common lengths)
  { pattern: /\b\d{4,17}\b(?=.*(?:account|acct|routing|bank))/gi, replacement: '****REDACTED****', name: 'Bank Account' },

  // Routing numbers (9 digits near routing/bank context)
  { pattern: /\b\d{9}\b(?=.*(?:routing|aba))/gi, replacement: '*********', name: 'Routing' },

  // Credit card numbers
  { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, replacement: '****-****-****-****', name: 'Credit Card' },
  { pattern: /\b\d{15,16}\b/g, replacement: '****************', name: 'Card Number' },

  // Email addresses (partial masking)
  { pattern: /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, replacement: '***@$2', name: 'Email' },

  // Bearer tokens and JWTs
  { pattern: /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi, replacement: 'Bearer [REDACTED]', name: 'JWT' },
  { pattern: /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g, replacement: '[JWT REDACTED]', name: 'JWT' },

  // API keys and secrets (common patterns)
  { pattern: /(api[_-]?key|secret|password|token|auth)['":\s]*[=:]\s*['"]?[\w\-]{16,}['"]?/gi, replacement: '$1=[REDACTED]', name: 'API Key/Secret' },

  // Encryption keys and IVs (hex strings)
  { pattern: /\b[a-fA-F0-9]{32,64}\b/g, replacement: '[HEX REDACTED]', name: 'Hex Key' },
];

// Keys to redact entirely from objects
const SENSITIVE_KEYS = new Set([
  'password',
  'ssn',
  'socialSecurityNumber',
  'bankAccountNumber',
  'bankRoutingNumber',
  'accountNumber',
  'routingNumber',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'secretKey',
  'privateKey',
  'encryptionKey',
  'creditCard',
  'cardNumber',
  'cvv',
  'pin',
]);

// Log levels
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  level?: LogLevel;
  enableConsole?: boolean;
  sanitize?: boolean;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel;
  private enableConsole: boolean;
  private sanitize: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level || (process.env.LOG_LEVEL as LogLevel) || 'info';
    this.enableConsole = options.enableConsole ?? true;
    this.sanitize = options.sanitize ?? true;
  }

  /**
   * Sanitize a string value
   */
  private sanitizeString(value: string): string {
    if (!this.sanitize) return value;

    let sanitized = value;
    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, replacement);
    }
    return sanitized;
  }

  /**
   * Deep sanitize an object, redacting sensitive keys and values
   */
  private sanitizeObject(obj: unknown, depth = 0): unknown {
    if (!this.sanitize) return obj;
    if (depth > 10) return '[MAX DEPTH]'; // Prevent infinite recursion

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: this.sanitizeString(obj.message),
        stack: obj.stack ? this.sanitizeString(obj.stack) : undefined,
      };
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, depth + 1));
    }

    if (typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_KEYS.has(lowerKey)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeObject(value, depth + 1);
        }
      }
      return sanitized;
    }

    return String(obj);
  }

  /**
   * Format log arguments for output
   */
  private formatArgs(args: unknown[]): unknown[] {
    return args.map(arg => this.sanitizeObject(arg));
  }

  /**
   * Check if the given level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  /**
   * Get timestamp for log entry
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Format log prefix
   */
  private formatPrefix(level: LogLevel): string {
    return `[${this.getTimestamp()}] [${level.toUpperCase()}]`;
  }

  /**
   * Debug level logging
   */
  debug(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('debug')) return;
    if (this.enableConsole) {
      console.debug(this.formatPrefix('debug'), this.sanitizeString(message), ...this.formatArgs(args));
    }
  }

  /**
   * Info level logging
   */
  info(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('info')) return;
    if (this.enableConsole) {
      console.info(this.formatPrefix('info'), this.sanitizeString(message), ...this.formatArgs(args));
    }
  }

  /**
   * Warning level logging
   */
  warn(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('warn')) return;
    if (this.enableConsole) {
      console.warn(this.formatPrefix('warn'), this.sanitizeString(message), ...this.formatArgs(args));
    }
  }

  /**
   * Error level logging
   */
  error(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('error')) return;
    if (this.enableConsole) {
      console.error(this.formatPrefix('error'), this.sanitizeString(message), ...this.formatArgs(args));
    }
  }

  /**
   * Log with explicit level
   */
  log(level: LogLevel, message: string, ...args: unknown[]): void {
    switch (level) {
      case 'debug':
        this.debug(message, ...args);
        break;
      case 'info':
        this.info(message, ...args);
        break;
      case 'warn':
        this.warn(message, ...args);
        break;
      case 'error':
        this.error(message, ...args);
        break;
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): ContextLogger {
    return new ContextLogger(this, context);
  }
}

/**
 * Context-aware logger that prefixes all messages with context
 */
class ContextLogger {
  constructor(
    private parent: Logger,
    private context: Record<string, unknown>
  ) {}

  private formatMessage(message: string): string {
    const contextStr = Object.entries(this.context)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    return `[${contextStr}] ${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    this.parent.debug(this.formatMessage(message), ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.parent.info(this.formatMessage(message), ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.parent.warn(this.formatMessage(message), ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.parent.error(this.formatMessage(message), ...args);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for custom instances
export { Logger, ContextLogger };

// Convenience function for creating route-specific loggers
export function createRouteLogger(routeName: string): ContextLogger {
  return logger.child({ route: routeName });
}
