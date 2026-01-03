/**
 * Transaction Security Tests
 * 
 * Tests the security features for transactions including:
 * - High-value transaction warnings
 * - Moniker sanitization
 * - Input validation
 */

import { describe, it, expect } from 'vitest';
import { 
  validateMoniker, 
  isHighValueTransaction, 
  HIGH_VALUE_THRESHOLD_SLTN,
  MIN_MONIKER_LENGTH,
  MAX_MONIKER_LENGTH,
  validateAddress,
  validateAmount,
  sanitizeInput,
} from '../core/security';

// =============================================================================
// Unit Tests: High-Value Transaction Detection
// =============================================================================

describe('High-Value Transaction Detection', () => {
  it('should detect transactions >= 1000 SLTN as high-value', () => {
    expect(isHighValueTransaction(1000)).toBe(true);
    expect(isHighValueTransaction(1001)).toBe(true);
    expect(isHighValueTransaction(10000)).toBe(true);
    expect(isHighValueTransaction('1000')).toBe(true);
    expect(isHighValueTransaction('5000.50')).toBe(true);
  });

  it('should NOT detect transactions < 1000 SLTN as high-value', () => {
    expect(isHighValueTransaction(999)).toBe(false);
    expect(isHighValueTransaction(999.99)).toBe(false);
    expect(isHighValueTransaction(100)).toBe(false);
    expect(isHighValueTransaction(0)).toBe(false);
    expect(isHighValueTransaction('500')).toBe(false);
  });

  it('should handle edge cases gracefully', () => {
    expect(isHighValueTransaction(NaN)).toBe(false);
    expect(isHighValueTransaction('')).toBe(false);
    expect(isHighValueTransaction('invalid')).toBe(false);
  });

  it('should export the correct threshold constant', () => {
    expect(HIGH_VALUE_THRESHOLD_SLTN).toBe(1000);
  });
});

// =============================================================================
// Unit Tests: Moniker Validation
// =============================================================================

describe('Moniker Validation', () => {
  it('should validate correct monikers', () => {
    expect(validateMoniker('SultanValidator').valid).toBe(true);
    expect(validateMoniker('My-Validator').valid).toBe(true);
    expect(validateMoniker('Test_Validator_123').valid).toBe(true);
    expect(validateMoniker('Sultan Validator').valid).toBe(true);
  });

  it('should reject monikers that are too short', () => {
    const result = validateMoniker('AB');
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`at least ${MIN_MONIKER_LENGTH}`);
  });

  it('should reject monikers that are too long', () => {
    const longMoniker = 'A'.repeat(MAX_MONIKER_LENGTH + 1);
    const result = validateMoniker(longMoniker);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`at most ${MAX_MONIKER_LENGTH}`);
  });

  it('should reject monikers with special characters', () => {
    expect(validateMoniker('Test@Validator').valid).toBe(false);
    expect(validateMoniker('Test!#$%').valid).toBe(false);
    expect(validateMoniker('Test(parens)').valid).toBe(false);
  });

  it('should sanitize HTML in monikers', () => {
    // After sanitization, angle brackets are removed but () remain
    const result = validateMoniker('<script>alert(1)</script>Valid');
    expect(result.valid).toBe(false); // Parentheses are invalid
  });

  it('should reject empty monikers', () => {
    expect(validateMoniker('').valid).toBe(false);
    expect(validateMoniker('').error).toBe('Moniker is required');
  });

  it('should return sanitized moniker on success', () => {
    const result = validateMoniker('  Sultan Validator  ');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('Sultan Validator');
  });
});

// =============================================================================
// Unit Tests: Input Sanitization
// =============================================================================

describe('Input Sanitization', () => {
  it('should remove angle brackets', () => {
    expect(sanitizeInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('should remove javascript: protocol', () => {
    expect(sanitizeInput('javascript:alert(1)')).toBe('alert(1)');
  });

  it('should remove event handlers', () => {
    // The regex removes 'onerror=' and 'onclick=' patterns
    const result1 = sanitizeInput('onerror=alert(1)');
    const result2 = sanitizeInput('onclick=doSomething()');
    // After removing the event handler pattern, what remains may vary
    // The key is that the dangerous handler is removed
    expect(result1).not.toContain('onerror=');
    expect(result2).not.toContain('onclick=');
  });

  it('should trim whitespace', () => {
    expect(sanitizeInput('  test  ')).toBe('test');
  });

  it('should handle empty input', () => {
    expect(sanitizeInput('')).toBe('');
    expect(sanitizeInput(null as unknown as string)).toBe('');
    expect(sanitizeInput(undefined as unknown as string)).toBe('');
  });
});

// =============================================================================
// Unit Tests: Address Validation
// =============================================================================

describe('Address Validation', () => {
  it('should validate Sultan addresses', () => {
    const result = validateAddress('sultan1qpzry9x8gf2tvdw0s3jn54khce6mua7lz');
    expect(result.valid).toBe(true);
    expect(result.chain).toBe('sultan');
  });

  it('should validate Ethereum addresses', () => {
    const result = validateAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f8e2D0');
    expect(result.valid).toBe(true);
    expect(result.chain).toBe('ethereum');
  });

  it('should reject invalid addresses', () => {
    const result = validateAddress('invalid-address');
    expect(result.valid).toBe(false);
  });

  it('should reject empty addresses', () => {
    expect(validateAddress('').valid).toBe(false);
    expect(validateAddress('   ').valid).toBe(false);
  });
});

// =============================================================================
// Unit Tests: Amount Validation
// =============================================================================

describe('Amount Validation', () => {
  it('should validate valid amounts', () => {
    expect(validateAmount('100', '1000').valid).toBe(true);
    expect(validateAmount('999.99', '1000').valid).toBe(true);
  });

  it('should reject amounts greater than balance', () => {
    const result = validateAmount('1001', '1000');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Insufficient');
  });

  it('should reject zero amount', () => {
    const result = validateAmount('0', '1000');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('greater than 0');
  });

  it('should reject negative amounts', () => {
    const result = validateAmount('-100', '1000');
    expect(result.valid).toBe(false);
  });

  it('should reject non-numeric amounts', () => {
    const result = validateAmount('abc', '1000');
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// Integration Tests: Security Constants
// =============================================================================

describe('Security Constants', () => {
  it('should have HIGH_VALUE_THRESHOLD set to 1000 SLTN', () => {
    expect(HIGH_VALUE_THRESHOLD_SLTN).toBe(1000);
  });

  it('should have MIN_MONIKER_LENGTH set to 3', () => {
    expect(MIN_MONIKER_LENGTH).toBe(3);
  });

  it('should have MAX_MONIKER_LENGTH set to 50', () => {
    expect(MAX_MONIKER_LENGTH).toBe(50);
  });

  it('should properly chain validation functions', () => {
    // Test that all validations work together
    const validMoniker = validateMoniker('ValidMonikerName');
    const isHighValue = isHighValueTransaction(5000);
    
    expect(validMoniker.valid).toBe(true);
    expect(isHighValue).toBe(true);
  });
});
