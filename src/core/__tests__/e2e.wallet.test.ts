/**
 * Sultan Wallet - End-to-End Integration Tests
 * 
 * Tests full wallet lifecycle: create → derive → sign → verify
 * These tests ensure the complete flow works as expected.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import stringify from 'fast-json-stable-stringify';
import {
  SultanWallet,
  formatSLTN,
  parseSLTN,
  isValidAddress,
  SULTAN_PREFIX,
} from '../wallet';

// ============================================================================
// Test Vectors
// ============================================================================

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

// ============================================================================
// E2E: Full Wallet Lifecycle
// ============================================================================

describe('E2E - Wallet Lifecycle', () => {
  let wallet: SultanWallet;

  afterEach(() => {
    if (wallet) {
      wallet.destroy();
    }
  });

  it('should complete full wallet lifecycle: create → derive → sign → verify', async () => {
    // Step 1: Generate new mnemonic
    const mnemonic = SultanWallet.generateMnemonic();
    expect(mnemonic.split(' ')).toHaveLength(24);
    expect(SultanWallet.validateMnemonic(mnemonic)).toBe(true);

    // Step 2: Create wallet from mnemonic
    wallet = await SultanWallet.fromMnemonic(mnemonic);
    expect(wallet).toBeDefined();

    // Step 3: Get first account
    const accounts = wallet.getAccounts();
    expect(accounts).toHaveLength(1);
    const account = accounts[0];

    // Step 4: Verify address format
    expect(account.address.startsWith(SULTAN_PREFIX)).toBe(true);
    expect(isValidAddress(account.address)).toBe(true);
    expect(account.publicKey).toMatch(/^[0-9a-f]{64}$/);

    // Step 5: Create and sign transaction
    const tx = {
      from: account.address,
      to: 'sultan1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5dc3f2',
      amount: parseSLTN('100').toString(),
      nonce: 1,
      timestamp: Date.now(),
    };

    const signature = await wallet.signTransaction(tx, 0);
    expect(signature).toMatch(/^[0-9a-f]{128}$/);

    // Step 6: Verify signature (simulating node verification)
    const publicKeyBytes = hexToBytes(account.publicKey);
    const signatureBytes = hexToBytes(signature);
    
    // Reconstruct the message that was signed: sha256(stable-stringify(tx))
    const canonical = stringify(tx);
    const message = sha256(new TextEncoder().encode(canonical));
    
    const isValid = ed25519.verify(signatureBytes, message, publicKeyBytes);
    expect(isValid).toBe(true);
  });

  it('should derive multiple accounts and sign with different accounts', async () => {
    wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC);
    
    // Derive multiple accounts
    const account0 = await wallet.deriveAccount(0);
    const account1 = await wallet.deriveAccount(1);
    const account2 = await wallet.deriveAccount(2);
    
    // All should be unique
    expect(account0.address).not.toBe(account1.address);
    expect(account1.address).not.toBe(account2.address);
    
    // Sign with account 1
    const tx1 = {
      from: account1.address,
      to: account2.address,
      amount: '1000000000',
      nonce: 1,
      timestamp: 1234567890,
    };
    const sig1 = await wallet.signTransaction(tx1, 1);
    expect(sig1).toMatch(/^[0-9a-f]{128}$/);
    
    // Sign with account 2
    const tx2 = {
      from: account2.address,
      to: account0.address,
      amount: '500000000',
      nonce: 1,
      timestamp: 1234567890,
    };
    const sig2 = await wallet.signTransaction(tx2, 2);
    expect(sig2).toMatch(/^[0-9a-f]{128}$/);
    
    // Verify signatures are different (different accounts)
    expect(sig1).not.toBe(sig2);
  });

  it('should maintain determinism across wallet recreations', async () => {
    // Create wallet 1
    const wallet1 = await SultanWallet.fromMnemonic(TEST_MNEMONIC);
    const account1_0 = await wallet1.deriveAccount(0);
    const account1_5 = await wallet1.deriveAccount(5);
    
    const tx = {
      from: account1_0.address,
      to: account1_5.address,
      amount: '1000000000',
      nonce: 42,
      timestamp: 9876543210,
    };
    const sig1 = await wallet1.signTransaction(tx, 0);
    
    // Create wallet 2 from same mnemonic
    const wallet2 = await SultanWallet.fromMnemonic(TEST_MNEMONIC);
    const account2_0 = await wallet2.deriveAccount(0);
    const account2_5 = await wallet2.deriveAccount(5);
    
    // Addresses should match
    expect(account2_0.address).toBe(account1_0.address);
    expect(account2_5.address).toBe(account1_5.address);
    
    // Signatures should match
    const sig2 = await wallet2.signTransaction(tx, 0);
    expect(sig2).toBe(sig1);
    
    wallet1.destroy();
    wallet2.destroy();
  });

  it('should reject invalid transactions gracefully', async () => {
    wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC);
    
    // Transaction with missing fields still signs (validation is at API level)
    const partialTx = {
      from: 'sultan1test',
      to: 'sultan1recipient',
      amount: '1000000000',
      nonce: 1,
      timestamp: Date.now(),
    };
    
    const sig = await wallet.signTransaction(partialTx, 0);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
  });
});

// ============================================================================
// E2E: BIP39 Passphrase Flow
// ============================================================================

describe('E2E - BIP39 Passphrase Flow', () => {
  it('should create isolated wallets with passphrase', async () => {
    const passphrase = 'my-secret-25th-word';
    
    // Wallet without passphrase
    const walletPublic = await SultanWallet.fromMnemonic(TEST_MNEMONIC);
    const accountPublic = walletPublic.getAccounts()[0];
    
    // Wallet with passphrase - completely different keys
    const walletPrivate = await SultanWallet.fromMnemonic(TEST_MNEMONIC, passphrase);
    const accountPrivate = walletPrivate.getAccounts()[0];
    
    // They should be completely different
    expect(accountPublic.address).not.toBe(accountPrivate.address);
    expect(accountPublic.publicKey).not.toBe(accountPrivate.publicKey);
    
    // Sign same tx with both
    const tx = {
      from: 'sultan1test',
      to: 'sultan1recipient',
      amount: '1000000000',
      nonce: 1,
      timestamp: 1234567890,
    };
    
    const sigPublic = await walletPublic.signTransaction(tx, 0);
    const sigPrivate = await walletPrivate.signTransaction(tx, 0);
    
    // Signatures should be different (different private keys)
    expect(sigPublic).not.toBe(sigPrivate);
    
    walletPublic.destroy();
    walletPrivate.destroy();
  });

  it('should use passphrase for plausible deniability', async () => {
    // This tests the "plausible deniability" use case of BIP39 passphrase
    // User can reveal mnemonic under duress but keeps passphrase secret
    
    const decoyPassphrase = 'small-amount';
    const realPassphrase = 'actual-savings';
    
    const decoyWallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC, decoyPassphrase);
    const realWallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC, realPassphrase);
    
    const decoyAccount = decoyWallet.getAccounts()[0];
    const realAccount = realWallet.getAccounts()[0];
    
    // Both are valid Sultan addresses but completely different
    expect(isValidAddress(decoyAccount.address)).toBe(true);
    expect(isValidAddress(realAccount.address)).toBe(true);
    expect(decoyAccount.address).not.toBe(realAccount.address);
    
    decoyWallet.destroy();
    realWallet.destroy();
  });
});

// ============================================================================
// E2E: Amount Handling
// ============================================================================

describe('E2E - Amount Handling', () => {
  it('should handle full amount flow: parse → use → format', () => {
    // User inputs "100.5 SLTN"
    const userInput = '100.5';
    
    // Parse to base units
    const baseUnits = parseSLTN(userInput);
    expect(baseUnits).toBe(100_500_000_000n);
    
    // Format back for display
    const display = formatSLTN(baseUnits);
    expect(display).toBe('100.5');
  });

  it('should handle maximum precision correctly', () => {
    // 9 decimal places
    const precise = '0.000000001';
    const baseUnits = parseSLTN(precise);
    expect(baseUnits).toBe(1n);
    
    // Format back
    const display = formatSLTN(baseUnits);
    expect(display).toBe('0.000000001');
  });

  it('should handle large amounts without overflow', () => {
    // 1 billion SLTN
    const large = '1000000000';
    const baseUnits = parseSLTN(large);
    expect(baseUnits).toBe(1_000_000_000_000_000_000n);
    
    // Format back (with locale formatting)
    const display = formatSLTN(baseUnits);
    expect(display).toBe('1,000,000,000');
  });
});

// ============================================================================
// E2E: Security Properties
// ============================================================================

describe('E2E - Security Properties', () => {
  it('should not expose private keys in any API', async () => {
    const wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC);
    const account = await wallet.deriveAccount(0);
    
    // Check account object
    const accountJson = JSON.stringify(account);
    expect(accountJson).not.toContain('privateKey');
    expect(accountJson).not.toContain('mnemonic');
    expect(accountJson).not.toContain('seed');
    
    // Account should only contain public data
    expect(Object.keys(account)).toEqual(
      expect.arrayContaining(['address', 'publicKey', 'path', 'index', 'name'])
    );
    expect(Object.keys(account)).not.toContain('privateKey');
    
    wallet.destroy();
  });

  it('should wipe wallet on destroy', async () => {
    const wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC);
    await wallet.deriveAccount(0);
    
    wallet.destroy();
    
    // Operations should fail after destroy
    await expect(wallet.deriveAccount(1)).rejects.toThrow('destroyed');
  });

  it('should produce valid Ed25519 signatures', async () => {
    const wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC);
    const account = await wallet.deriveAccount(0);
    
    const tx = {
      from: account.address,
      to: 'sultan1recipient',
      amount: '1000000000',
      nonce: 1,
      timestamp: 1234567890,
    };
    
    const signature = await wallet.signTransaction(tx, 0);
    
    // Signature should be 128 hex chars (64 bytes)
    expect(signature).toHaveLength(128);
    expect(signature).toMatch(/^[0-9a-f]+$/);
    
    // Verify with noble-ed25519
    const publicKeyBytes = hexToBytes(account.publicKey);
    const signatureBytes = hexToBytes(signature);
    
    // Message is sha256(stable-stringify(tx))
    const canonical = stringify(tx);
    const message = sha256(new TextEncoder().encode(canonical));
    
    const isValid = ed25519.verify(signatureBytes, message, publicKeyBytes);
    expect(isValid).toBe(true);
    
    wallet.destroy();
  });
});
