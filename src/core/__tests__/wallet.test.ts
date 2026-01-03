/**
 * Sultan Wallet Core - Unit Tests
 * 
 * Tests for key derivation, signing, and address encoding.
 * These tests are critical for security audit compliance.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SultanWallet,
  SULTAN_PREFIX,
  SULTAN_DECIMALS,
  SULTAN_COIN_TYPE,
  formatSLTN,
  parseSLTN,
  isValidAddress,
} from '../wallet';

// ============================================================================
// Test Vectors
// ============================================================================

/**
 * Known test vectors for deterministic testing.
 * These should match the BIP39/SLIP-0010 specification.
 */
const TEST_MNEMONIC_24 =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

const TEST_MNEMONIC_INVALID = 'invalid mnemonic phrase that should not work';

// ============================================================================
// Mnemonic Tests
// ============================================================================

describe('SultanWallet - Mnemonic', () => {
  describe('generateMnemonic', () => {
    it('should generate a valid 24-word mnemonic', () => {
      const mnemonic = SultanWallet.generateMnemonic();
      const words = mnemonic.split(' ');
      
      expect(words).toHaveLength(24);
      expect(SultanWallet.validateMnemonic(mnemonic)).toBe(true);
    });

    it('should generate unique mnemonics each time', () => {
      const mnemonic1 = SultanWallet.generateMnemonic();
      const mnemonic2 = SultanWallet.generateMnemonic();
      
      expect(mnemonic1).not.toBe(mnemonic2);
    });
  });

  describe('validateMnemonic', () => {
    it('should validate a correct 24-word mnemonic', () => {
      expect(SultanWallet.validateMnemonic(TEST_MNEMONIC_24)).toBe(true);
    });

    it('should reject an invalid mnemonic', () => {
      expect(SultanWallet.validateMnemonic(TEST_MNEMONIC_INVALID)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(SultanWallet.validateMnemonic('')).toBe(false);
    });

    it('should reject mnemonic with wrong word count', () => {
      expect(SultanWallet.validateMnemonic('abandon abandon abandon')).toBe(false);
    });
  });
});

// ============================================================================
// Wallet Creation Tests
// ============================================================================

describe('SultanWallet - Creation', () => {
  let wallet: SultanWallet;

  afterEach(() => {
    // Ensure wallet is cleaned up
    wallet = null as unknown as SultanWallet;
  });

  it('should create wallet from valid mnemonic', async () => {
    wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24);
    
    expect(wallet).toBeDefined();
    expect(wallet.getAccounts()).toHaveLength(1); // Default account
  });

  it('should reject invalid mnemonic', async () => {
    await expect(
      SultanWallet.fromMnemonic(TEST_MNEMONIC_INVALID)
    ).rejects.toThrow('Invalid mnemonic phrase');
  });

  it('should derive deterministic addresses from same mnemonic', async () => {
    const wallet1 = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24);
    const wallet2 = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24);
    
    const account1 = wallet1.getAccounts()[0];
    const account2 = wallet2.getAccounts()[0];
    
    expect(account1.address).toBe(account2.address);
    expect(account1.publicKey).toBe(account2.publicKey);
  });
});

// ============================================================================
// BIP39 Passphrase Tests (Security Feature)
// ============================================================================

describe('SultanWallet - BIP39 Passphrase', () => {
  it('should derive different addresses with passphrase', async () => {
    const walletNoPass = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24);
    const walletWithPass = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24, 'my-secure-passphrase');
    
    const accountNoPass = walletNoPass.getAccounts()[0];
    const accountWithPass = walletWithPass.getAccounts()[0];
    
    // Different passphrase = different derived keys
    expect(accountNoPass.address).not.toBe(accountWithPass.address);
    expect(accountNoPass.publicKey).not.toBe(accountWithPass.publicKey);
  });

  it('should derive same addresses with same passphrase', async () => {
    const wallet1 = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24, 'secret');
    const wallet2 = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24, 'secret');
    
    const account1 = wallet1.getAccounts()[0];
    const account2 = wallet2.getAccounts()[0];
    
    expect(account1.address).toBe(account2.address);
    expect(account1.publicKey).toBe(account2.publicKey);
  });

  it('should derive different addresses with different passphrases', async () => {
    const wallet1 = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24, 'passphrase1');
    const wallet2 = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24, 'passphrase2');
    
    const account1 = wallet1.getAccounts()[0];
    const account2 = wallet2.getAccounts()[0];
    
    expect(account1.address).not.toBe(account2.address);
    expect(account1.publicKey).not.toBe(account2.publicKey);
  });

  it('should treat empty passphrase same as no passphrase', async () => {
    const walletNoPass = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24);
    const walletEmptyPass = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24, '');
    
    const accountNoPass = walletNoPass.getAccounts()[0];
    const accountEmptyPass = walletEmptyPass.getAccounts()[0];
    
    expect(accountNoPass.address).toBe(accountEmptyPass.address);
    expect(accountNoPass.publicKey).toBe(accountEmptyPass.publicKey);
  });

  it('should produce deterministic signatures with passphrase', async () => {
    const wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24, 'sign-test');
    
    const tx = {
      from: 'sultan1test',
      to: 'sultan1recipient',
      amount: '1000000000',
      nonce: 1,
      timestamp: 1234567890,
    };
    
    const sig1 = await wallet.signTransaction(tx, 0);
    const sig2 = await wallet.signTransaction(tx, 0);
    
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[0-9a-f]{128}$/);
  });
});

// ============================================================================
// Account Derivation Tests
// ============================================================================

describe('SultanWallet - Account Derivation', () => {
  let wallet: SultanWallet;

  beforeEach(async () => {
    wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24);
  });

  it('should derive accounts at different indices', async () => {
    const account0 = await wallet.deriveAccount(0);
    const account1 = await wallet.deriveAccount(1);
    const account2 = await wallet.deriveAccount(2);
    
    // Each account should have unique address
    expect(account0.address).not.toBe(account1.address);
    expect(account1.address).not.toBe(account2.address);
    expect(account0.address).not.toBe(account2.address);
    
    // Each should have correct index
    expect(account0.index).toBe(0);
    expect(account1.index).toBe(1);
    expect(account2.index).toBe(2);
  });

  it('should use correct derivation path', async () => {
    const account = await wallet.deriveAccount(5);
    
    expect(account.path).toBe(`m/44'/${SULTAN_COIN_TYPE}'/0'/0'/5`);
  });

  it('should cache derived accounts', async () => {
    const account1 = await wallet.deriveAccount(0);
    const account2 = await wallet.deriveAccount(0);
    
    // Should be same object reference (cached)
    expect(account1).toBe(account2);
  });

  it('should generate valid bech32 addresses', async () => {
    const account = await wallet.deriveAccount(0);
    
    expect(account.address.startsWith(SULTAN_PREFIX)).toBe(true);
    expect(isValidAddress(account.address)).toBe(true);
  });

  it('should generate 64-character hex public keys', async () => {
    const account = await wallet.deriveAccount(0);
    
    expect(account.publicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should NOT expose private keys in account object (security)', async () => {
    const account = await wallet.deriveAccount(0);
    
    // SECURITY: Private keys should never be stored or exposed in account objects
    // They are derived on-demand when signing
    expect((account as unknown as { privateKey?: string }).privateKey).toBeUndefined();
  });
});

// ============================================================================
// Address Validation Tests
// ============================================================================

describe('SultanWallet - Address Validation', () => {
  it('should validate correct sultan addresses', async () => {
    const wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24);
    const account = wallet.getAccounts()[0];
    
    expect(isValidAddress(account.address)).toBe(true);
  });

  it('should reject addresses with wrong prefix', () => {
    expect(isValidAddress('cosmos1abc123def456')).toBe(false);
    expect(isValidAddress('osmo1abc123def456')).toBe(false);
  });

  it('should reject malformed addresses', () => {
    expect(isValidAddress('')).toBe(false);
    expect(isValidAddress('sultan')).toBe(false);
    expect(isValidAddress('sultan1')).toBe(false);
    expect(isValidAddress('not-an-address')).toBe(false);
  });

  it('should reject addresses with invalid checksum', () => {
    // Corrupted address (changed last character)
    expect(isValidAddress('sultan1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx')).toBe(false);
  });
});

// ============================================================================
// Amount Formatting Tests
// ============================================================================

describe('SultanWallet - Amount Formatting', () => {
  describe('formatSLTN', () => {
    it('should format base units to display units', () => {
      // formatSLTN trims trailing zeros for cleaner display
      expect(formatSLTN(1_000_000_000n)).toBe('1');
      expect(formatSLTN(1_500_000_000n)).toBe('1.5');
      expect(formatSLTN(123_456_789n)).toBe('0.123456789');
    });

    it('should handle zero', () => {
      expect(formatSLTN(0n)).toBe('0');
    });

    it('should handle large amounts', () => {
      // formatSLTN uses locale formatting with commas for readability
      expect(formatSLTN(1_000_000_000_000_000_000n)).toBe('1,000,000,000');
    });

    it('should handle string input', () => {
      expect(formatSLTN('1000000000')).toBe('1');
    });
  });

  describe('parseSLTN', () => {
    it('should parse display units to base units', () => {
      expect(parseSLTN('1')).toBe(1_000_000_000n);
      expect(parseSLTN('1.5')).toBe(1_500_000_000n);
      expect(parseSLTN('0.123456789')).toBe(123_456_789n);
    });

    it('should handle zero', () => {
      expect(parseSLTN('0')).toBe(0n);
    });

    it('should handle amounts with trailing zeros', () => {
      expect(parseSLTN('1.000000000')).toBe(1_000_000_000n);
    });

    it('should truncate excess precision', () => {
      // More than 9 decimal places should truncate
      expect(parseSLTN('1.1234567899999')).toBe(1_123_456_789n);
    });
  });

  it('should roundtrip correctly', () => {
    const original = 12_345_678_901n;
    const formatted = formatSLTN(original);
    const parsed = parseSLTN(formatted);
    
    expect(parsed).toBe(original);
  });
});

// ============================================================================
// Transaction Signing Tests
// ============================================================================

describe('SultanWallet - Transaction Signing', () => {
  let wallet: SultanWallet;

  beforeEach(async () => {
    wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC_24);
  });

  it('should sign transactions', async () => {
    const account = wallet.getAccounts()[0];
    const tx = {
      from: account.address,
      to: 'sultan1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5dc3f2',
      amount: '1000000000',
      nonce: 1,
      timestamp: Date.now(),
    };
    
    // signTransaction returns the signature string directly
    const signature = await wallet.signTransaction(tx, 0);
    
    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');
    expect(signature).toMatch(/^[0-9a-f]{128}$/); // Ed25519 signature is 64 bytes = 128 hex chars
  });

  it('should produce deterministic signatures', async () => {
    const tx = {
      from: 'sultan1test',
      to: 'sultan1recipient',
      amount: '1000000000',
      nonce: 1,
      timestamp: 1234567890,
    };
    
    const signature1 = await wallet.signTransaction(tx, 0);
    const signature2 = await wallet.signTransaction(tx, 0);
    
    expect(signature1).toBe(signature2);
  });

  it('should produce different signatures for different transactions', async () => {
    const tx1 = {
      from: 'sultan1test',
      to: 'sultan1recipient',
      amount: '1000000000',
      nonce: 1,
      timestamp: 1234567890,
    };
    
    const tx2 = { ...tx1, nonce: 2 };
    
    const signature1 = await wallet.signTransaction(tx1, 0);
    const signature2 = await wallet.signTransaction(tx2, 0);
    
    expect(signature1).not.toBe(signature2);
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('SultanWallet - Constants', () => {
  it('should have correct decimal precision', () => {
    expect(SULTAN_DECIMALS).toBe(9);
  });

  it('should have correct bech32 prefix', () => {
    expect(SULTAN_PREFIX).toBe('sultan');
  });

  it('should have unique coin type', () => {
    expect(SULTAN_COIN_TYPE).toBe(1984);
    // Should not conflict with common coin types
    expect(SULTAN_COIN_TYPE).not.toBe(0); // Bitcoin
    expect(SULTAN_COIN_TYPE).not.toBe(60); // Ethereum
    expect(SULTAN_COIN_TYPE).not.toBe(118); // Cosmos
  });
});
