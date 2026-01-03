/**
 * Production-Safe Logger
 * 
 * SECURITY: Prevents sensitive data from being logged in production.
 * - In development: Full logging with all details
 * - In production: Critical errors only, no sensitive data
 */

const isDev = import.meta.env.DEV;
const isTest = import.meta.env.MODE === 'test';

/**
 * Sensitive patterns that should NEVER be logged
 * SECURITY: These patterns detect sensitive data in log arguments
 */
const SENSITIVE_PATTERNS = [
  /mnemonic/i,
  /private.*key/i,
  /seed/i,
  /secret/i,
  /password/i,
  /pin/i,
  /[a-f0-9]{64}/i, // Private key hex pattern (32 bytes)
  /^sultan1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{30,}$/i, // Bech32 Sultan addresses (38+ total chars)
];

/**
 * Check if a message contains sensitive data
 */
function containsSensitiveData(args: unknown[]): boolean {
  const str = args.map(a => String(a)).join(' ');
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(str));
}

/**
 * Sanitize arguments by redacting sensitive data
 */
function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map(arg => {
    if (typeof arg === 'string') {
      let sanitized = arg;
      for (const pattern of SENSITIVE_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      }
      return sanitized;
    }
    if (typeof arg === 'object' && arg !== null) {
      return '[Object]'; // Don't risk logging sensitive object properties
    }
    return arg;
  });
}

/**
 * Production-safe logger
 * 
 * Usage:
 *   import { logger } from './logger';
 *   logger.debug('Processing request'); // Only in dev
 *   logger.info('User action');         // Only in dev
 *   logger.warn('Deprecated usage');    // Only in dev
 *   logger.error('Critical failure');   // Always (sanitized in prod)
 */
export const logger = {
  /**
   * Debug level - development only
   */
  debug: (...args: unknown[]): void => {
    if (isDev && !containsSensitiveData(args)) {
      console.debug('[DEBUG]', ...args);
    }
  },

  /**
   * Info level - development only
   */
  info: (...args: unknown[]): void => {
    if (isDev && !containsSensitiveData(args)) {
      console.info('[INFO]', ...args);
    }
  },

  /**
   * Warning level - development only
   */
  warn: (...args: unknown[]): void => {
    if (isDev) {
      console.warn('[WARN]', ...sanitizeArgs(args));
    }
  },

  /**
   * Error level - always logs (sanitized in production)
   * Critical errors that need attention
   */
  error: (...args: unknown[]): void => {
    if (isDev || isTest) {
      console.error('[ERROR]', ...args);
    } else {
      // In production, sanitize before logging
      console.error('[ERROR]', ...sanitizeArgs(args));
    }
  },

  /**
   * Development-only console group
   */
  group: (label: string): void => {
    if (isDev) {
      console.group(label);
    }
  },

  /**
   * Development-only console groupEnd
   */
  groupEnd: (): void => {
    if (isDev) {
      console.groupEnd();
    }
  },

  /**
   * Development-only table output
   */
  table: (data: unknown): void => {
    if (isDev) {
      console.table(data);
    }
  },
};

/**
 * Assert condition (development only)
 */
export function devAssert(condition: boolean, message: string): void {
  if (isDev && !condition) {
    console.error('[ASSERT FAILED]', message);
  }
}

export default logger;
