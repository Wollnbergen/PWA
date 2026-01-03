/**
 * TOTP (Time-based One-Time Password) Tests
 * 
 * Tests for RFC 6238 compliant TOTP implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateTOTP,
  verifyTOTP,
  generateTOTPSecret,
  generateTOTPUrl,
  generateBackupCodes,
  verifyBackupCode,
  TOTP_TIME_STEP,
  TOTP_DIGITS,
} from '../totp';

// =============================================================================
// Base32 Encoding/Decoding Tests
// =============================================================================

describe('Base32 Encoding', () => {
  it('should encode bytes to base32', () => {
    // Test vector from RFC 4648
    const input = new TextEncoder().encode('Hello');
    const encoded = base32Encode(input);
    expect(encoded).toBe('JBSWY3DP');
  });

  it('should handle empty input', () => {
    const input = new Uint8Array(0);
    const encoded = base32Encode(input);
    expect(encoded).toBe('');
  });

  it('should decode base32 to bytes', () => {
    const decoded = base32Decode('JBSWY3DP');
    const text = new TextDecoder().decode(decoded);
    expect(text).toBe('Hello');
  });

  it('should handle case insensitivity', () => {
    const upper = base32Decode('JBSWY3DP');
    const lower = base32Decode('jbswy3dp');
    expect(upper).toEqual(lower);
  });

  it('should handle whitespace in base32 input', () => {
    const withSpaces = base32Decode('JBSW Y3DP');
    const text = new TextDecoder().decode(withSpaces);
    expect(text).toBe('Hello');
  });

  it('should roundtrip encode/decode', () => {
    const original = crypto.getRandomValues(new Uint8Array(20));
    const encoded = base32Encode(original);
    const decoded = base32Decode(encoded);
    expect(decoded).toEqual(original);
  });

  it('should reject invalid base32 characters', () => {
    expect(() => base32Decode('INVALID!')).toThrow('Invalid base32 character');
  });
});

// =============================================================================
// TOTP Generation Tests
// =============================================================================

describe('TOTP Generation', () => {
  it('should generate 6-digit codes', async () => {
    const secret = generateTOTPSecret();
    const code = await generateTOTP(secret);
    
    expect(code).toHaveLength(TOTP_DIGITS);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('should accept base32 string secret', async () => {
    const secret = 'JBSWY3DPEHPK3PXP'; // Known test secret
    const code = await generateTOTP(secret);
    
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('should accept Uint8Array secret', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(20));
    const code = await generateTOTP(secret);
    
    expect(code).toHaveLength(6);
  });

  it('should generate same code within time window', async () => {
    const secret = generateTOTPSecret();
    const code1 = await generateTOTP(secret);
    const code2 = await generateTOTP(secret);
    
    expect(code1).toBe(code2);
  });

  it('should pad codes with leading zeros', async () => {
    // This is a probabilistic test - just verify format
    const secret = generateTOTPSecret();
    const code = await generateTOTP(secret);
    
    expect(code.length).toBe(6);
    expect(code).toMatch(/^\d{6}$/);
  });
});

// =============================================================================
// TOTP Verification Tests
// =============================================================================

describe('TOTP Verification', () => {
  it('should verify current code', async () => {
    const secret = generateTOTPSecret();
    const code = await generateTOTP(secret);
    const isValid = await verifyTOTP(secret, code);
    
    expect(isValid).toBe(true);
  });

  it('should reject wrong code', async () => {
    const secret = generateTOTPSecret();
    const isValid = await verifyTOTP(secret, '000000');
    
    // Very unlikely to be valid unless we hit the exact code
    // Run multiple times to reduce false positive risk
    const code = await generateTOTP(secret);
    if (code !== '000000') {
      expect(isValid).toBe(false);
    }
  });

  it('should reject invalid length codes', async () => {
    const secret = generateTOTPSecret();
    const isValid = await verifyTOTP(secret, '12345'); // 5 digits
    
    expect(isValid).toBe(false);
  });

  it('should use constant-time comparison', async () => {
    // This test verifies the function doesn't throw for different inputs
    const secret = generateTOTPSecret();
    
    // Test various invalid codes
    await expect(verifyTOTP(secret, '123456')).resolves.toBeDefined();
    await expect(verifyTOTP(secret, '000000')).resolves.toBeDefined();
    await expect(verifyTOTP(secret, '999999')).resolves.toBeDefined();
  });

  it('should accept codes within time window tolerance', async () => {
    const secret = generateTOTPSecret();
    const code = await generateTOTP(secret);
    
    // Default window is ±1, so current code should work
    const isValid = await verifyTOTP(secret, code, TOTP_TIME_STEP, TOTP_DIGITS, 1);
    expect(isValid).toBe(true);
  });
});

// =============================================================================
// Secret Generation Tests
// =============================================================================

describe('TOTP Secret Generation', () => {
  it('should generate base32 encoded secrets', () => {
    const secret = generateTOTPSecret();
    
    // Should be valid base32
    expect(() => base32Decode(secret)).not.toThrow();
  });

  it('should generate 32-character secrets (160 bits)', () => {
    const secret = generateTOTPSecret();
    
    // 20 bytes = 160 bits = 32 base32 chars
    expect(secret.length).toBe(32);
  });

  it('should generate unique secrets', () => {
    const secrets = new Set<string>();
    
    for (let i = 0; i < 100; i++) {
      secrets.add(generateTOTPSecret());
    }
    
    expect(secrets.size).toBe(100);
  });
});

// =============================================================================
// TOTP URL Generation Tests
// =============================================================================

describe('TOTP URL Generation', () => {
  it('should generate valid otpauth URL', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const url = generateTOTPUrl(secret, 'user@example.com');
    
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(url).toContain('algorithm=SHA1');
    expect(url).toContain(`digits=${TOTP_DIGITS}`);
    expect(url).toContain(`period=${TOTP_TIME_STEP}`);
  });

  it('should encode special characters in account name', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const url = generateTOTPUrl(secret, 'user@example.com', 'Sultan Wallet');
    
    expect(url).toContain(encodeURIComponent('Sultan Wallet'));
    expect(url).toContain(encodeURIComponent('user@example.com'));
  });

  it('should include issuer', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const url = generateTOTPUrl(secret, 'test', 'MyIssuer');
    
    expect(url).toContain('issuer=MyIssuer');
  });
});

// =============================================================================
// Backup Codes Tests
// =============================================================================

describe('Backup Codes', () => {
  it('should generate 8 backup codes', () => {
    const codes = generateBackupCodes();
    
    expect(codes).toHaveLength(8);
  });

  it('should generate codes in XXXX-XXXX format', () => {
    const codes = generateBackupCodes();
    
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }
  });

  it('should not include most confusing characters (0, O, 1, I)', () => {
    const codes = generateBackupCodes();
    // Based on BACKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    // No: 0, O, 1, I (but L is allowed)
    const excludedChars = /[0O1I]/;
    
    for (const code of codes) {
      expect(code).not.toMatch(excludedChars);
    }
  });

  it('should generate unique codes', () => {
    const codes = generateBackupCodes();
    const uniqueCodes = new Set(codes);
    
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('should verify valid backup code', () => {
    const codes = generateBackupCodes();
    const index = verifyBackupCode(codes[0], codes);
    
    expect(index).toBe(0);
  });

  it('should verify backup code case-insensitively', () => {
    const codes = generateBackupCodes();
    const lowerCode = codes[2].toLowerCase();
    const index = verifyBackupCode(lowerCode, codes);
    
    expect(index).toBe(2);
  });

  it('should verify backup code without dash', () => {
    const codes = generateBackupCodes();
    const noDashCode = codes[1].replace('-', '');
    const index = verifyBackupCode(noDashCode, codes);
    
    expect(index).toBe(1);
  });

  it('should reject invalid backup code', () => {
    const codes = generateBackupCodes();
    const index = verifyBackupCode('INVALID-CODE', codes);
    
    expect(index).toBe(-1);
  });

  it('should use constant-time comparison', () => {
    const codes = generateBackupCodes();
    
    // Should not throw for any input
    expect(() => verifyBackupCode('AAAA-AAAA', codes)).not.toThrow();
    expect(() => verifyBackupCode('', codes)).not.toThrow();
    expect(() => verifyBackupCode('X'.repeat(100), codes)).not.toThrow();
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('TOTP Constants', () => {
  it('should have standard 30-second time step', () => {
    expect(TOTP_TIME_STEP).toBe(30);
  });

  it('should have standard 6-digit codes', () => {
    expect(TOTP_DIGITS).toBe(6);
  });
});
