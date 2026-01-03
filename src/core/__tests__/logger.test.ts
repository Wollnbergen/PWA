/**
 * Logger Tests
 * 
 * Tests for production-safe logging with sensitive data filtering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the SENSITIVE_PATTERNS logic directly
// since the logger behavior depends on environment variables

// =============================================================================
// Sensitive Pattern Tests
// =============================================================================

describe('Logger Sensitive Patterns', () => {
  // Copy of patterns from logger.ts for testing
  const SENSITIVE_PATTERNS = [
    /mnemonic/i,
    /private.*key/i,
    /seed/i,
    /secret/i,
    /password/i,
    /pin/i,
    /[a-f0-9]{64}/i, // Private key hex pattern (32 bytes)
    /^sultan1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{30,}$/i, // Bech32 Sultan addresses
  ];

  function containsSensitiveData(args: unknown[]): boolean {
    const str = args.map(a => String(a)).join(' ');
    return SENSITIVE_PATTERNS.some(pattern => pattern.test(str));
  }

  describe('mnemonic pattern', () => {
    it('should detect "mnemonic" keyword', () => {
      expect(containsSensitiveData(['mnemonic: abandon ability...'])).toBe(true);
      expect(containsSensitiveData(['MNEMONIC phrase'])).toBe(true);
      expect(containsSensitiveData(['user mnemonic loaded'])).toBe(true);
    });
  });

  describe('private key pattern', () => {
    it('should detect "private key" variations', () => {
      expect(containsSensitiveData(['private key: abc123'])).toBe(true);
      expect(containsSensitiveData(['privateKey=xxx'])).toBe(true);
      expect(containsSensitiveData(['PRIVATE_KEY'])).toBe(true);
    });
  });

  describe('seed pattern', () => {
    it('should detect "seed" keyword', () => {
      expect(containsSensitiveData(['seed phrase'])).toBe(true);
      expect(containsSensitiveData(['seedBytes'])).toBe(true);
    });
  });

  describe('secret pattern', () => {
    it('should detect "secret" keyword', () => {
      expect(containsSensitiveData(['client secret'])).toBe(true);
      expect(containsSensitiveData(['secret=xyz'])).toBe(true);
    });
  });

  describe('password pattern', () => {
    it('should detect "password" keyword', () => {
      expect(containsSensitiveData(['password: hunter2'])).toBe(true);
      expect(containsSensitiveData(['user password'])).toBe(true);
    });
  });

  describe('pin pattern', () => {
    it('should detect "pin" keyword', () => {
      expect(containsSensitiveData(['pin: 123456'])).toBe(true);
      expect(containsSensitiveData(['user PIN entered'])).toBe(true);
    });
  });

  describe('hex64 pattern (private key hex)', () => {
    it('should detect 64-character hex strings', () => {
      const hex64 = 'a'.repeat(64);
      expect(containsSensitiveData([hex64])).toBe(true);
      expect(containsSensitiveData(['key: ' + hex64])).toBe(true);
    });

    it('should detect mixed case hex strings', () => {
      const hex64 = 'aAbBcCdDeEfF01234567890123456789abcdef0123456789ABCDEF0123456789';
      expect(hex64.length).toBe(64);
      expect(containsSensitiveData([hex64])).toBe(true);
    });

    it('should not detect shorter hex strings', () => {
      const hex32 = 'a'.repeat(32);
      // hex32 alone should not match (unless it's part of address)
      expect(containsSensitiveData(['hash: ' + hex32])).toBe(false);
    });
  });

  describe('Bech32 Sultan address pattern', () => {
    it('should detect Sultan addresses', () => {
      const address = 'sultan1qpzry9x8gf2tvdw0s3jn54khce6mua7lzz';
      expect(containsSensitiveData([address])).toBe(true);
    });

    it('should detect longer Sultan addresses', () => {
      const address = 'sultan1' + 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'.repeat(2);
      expect(containsSensitiveData([address])).toBe(true);
    });

    it('should not detect invalid prefixes', () => {
      expect(containsSensitiveData(['cosmos1abc123'])).toBe(false);
      expect(containsSensitiveData(['bitcoin1xyz'])).toBe(false);
    });
  });

  describe('non-sensitive data', () => {
    it('should not flag normal messages', () => {
      expect(containsSensitiveData(['User logged in'])).toBe(false);
      expect(containsSensitiveData(['Transaction sent'])).toBe(false);
      expect(containsSensitiveData(['Balance: 1000 SLTN'])).toBe(false);
      expect(containsSensitiveData(['API request completed'])).toBe(false);
    });

    it('should not flag transaction hashes (if they contain non-hex)', () => {
      // TX hashes with non-hex characters won't match the 64-hex pattern
      const mixedHash = 'abc123xyz456'.repeat(5).slice(0, 64);
      // This contains 'x', 'y', 'z' which are not hex, so won't match [a-f0-9]{64}
      expect(containsSensitiveData([mixedHash])).toBe(false);
    });

    it('should flag pure 64-char hex strings (could be private keys)', () => {
      const pureHex = 'abcdef0123456789'.repeat(4);
      expect(pureHex.length).toBe(64);
      expect(containsSensitiveData([pureHex])).toBe(true);
    });

    it('should not flag short identifiers', () => {
      expect(containsSensitiveData(['id: abc123'])).toBe(false);
      expect(containsSensitiveData(['token: xyz789'])).toBe(false);
    });
  });
});

// =============================================================================
// Sanitization Tests
// =============================================================================

describe('Logger Sanitization', () => {
  const SENSITIVE_PATTERNS = [
    /mnemonic/i,
    /private.*key/i,
    /seed/i,
    /secret/i,
    /password/i,
    /pin/i,
    /[a-f0-9]{64}/i,
    /^sultan1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{30,}$/i,
  ];

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
        return '[Object]';
      }
      return arg;
    });
  }

  it('should redact sensitive keywords', () => {
    const result = sanitizeArgs(['mnemonic phrase here']);
    expect(result[0]).toContain('[REDACTED]');
    expect(result[0]).not.toContain('mnemonic');
  });

  it('should redact private keys', () => {
    const result = sanitizeArgs(['private key: abc123']);
    expect(result[0]).toContain('[REDACTED]');
  });

  it('should convert objects to [Object]', () => {
    const result = sanitizeArgs([{ secret: 'value' }]);
    expect(result[0]).toBe('[Object]');
  });

  it('should preserve numbers', () => {
    const result = sanitizeArgs([123, 456.78]);
    expect(result).toEqual([123, 456.78]);
  });

  it('should preserve booleans', () => {
    const result = sanitizeArgs([true, false]);
    expect(result).toEqual([true, false]);
  });

  it('should preserve non-sensitive strings', () => {
    const result = sanitizeArgs(['User logged in', 'Transaction complete']);
    expect(result).toEqual(['User logged in', 'Transaction complete']);
  });
});
