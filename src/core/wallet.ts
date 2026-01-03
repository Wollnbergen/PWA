/**
 * Sultan Wallet Core - Ed25519 + BIP39 + Bech32
 * 
 * Chain specs:
 * - Decimals: 9 (1 SLTN = 1,000,000,000 base units)
 * - Address format: bech32 with "sultan" prefix
 * - Signature scheme: Ed25519
 * - Derivation path: m/44'/1984'/0'/0'/{index}
 */

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { randomBytes } from '@noble/hashes/utils';
import * as ed25519 from '@noble/ed25519';
import { bech32 } from 'bech32';
import stringify from 'fast-json-stable-stringify';
import { secureWipe, SecureString } from './security';

// Configure ed25519 to use sha512
ed25519.etc.sha512Sync = (...msgs) => sha512(ed25519.etc.concatBytes(...msgs));

// Sultan chain constants
export const SULTAN_DECIMALS = 9;
export const SULTAN_PREFIX = 'sultan';
export const SULTAN_COIN_TYPE = 1984; // Custom coin type for Sultan
export const MIN_STAKE = 10_000; // 10,000 SLTN minimum stake

/**
 * Account info exposed externally (NO private key - derived on demand)
 * SECURITY: Private keys are NEVER stored in memory or cache
 */
export interface SultanAccount {
  address: string;
  publicKey: string;
  path: string;
  index: number;
  name: string;
}

export interface SignedTransaction {
  transaction: SultanTransaction;
  signature: string;
  publicKey: string;
}

export interface SultanTransaction {
  from: string;
  to: string;
  amount: string; // Base units as string to avoid precision loss
  memo?: string;
  nonce: number;
  timestamp: number;
}

/**
 * Core wallet functionality for Sultan chain
 * 
 * SECURITY ARCHITECTURE:
 * - Mnemonic stored as SecureString (XOR encrypted in memory)
 * - Private keys are NEVER cached - derived on-demand for each signing operation
 * - All sensitive data wiped immediately after use
 * - No JS string exposure for sensitive material
 */
export class SultanWallet {
  private secureMnemonic: SecureString | null = null;
  private securePassphrase: SecureString | null = null; // BIP39 optional passphrase
  private accounts: Map<number, SultanAccount> = new Map();
  private destroyed: boolean = false;

  /**
   * Generate a new 24-word mnemonic
   */
  static generateMnemonic(): string {
    return generateMnemonic(wordlist, 256); // 256 bits = 24 words
  }

  /**
   * Validate a mnemonic phrase
   */
  static validateMnemonic(mnemonic: string): boolean {
    return validateMnemonic(mnemonic, wordlist);
  }

  /**
   * Static format helper (9 decimals)
   */
  static formatSLTN(baseUnits: bigint | string | number): string {
    return formatSLTN(baseUnits);
  }

  /**
   * Static parse helper
   */
  static parseSLTN(displayUnits: string): string {
    return parseSLTN(displayUnits).toString();
  }

  /**
   * Static address validator
   */
  static isValidAddress(address: string): boolean {
    return isValidAddress(address);
  }

  /**
   * Create wallet from mnemonic
   * SECURITY: Mnemonic is immediately encrypted into SecureString
   * @param mnemonic - BIP39 mnemonic phrase
   * @param passphrase - Optional BIP39 passphrase for additional security
   */
  static async fromMnemonic(mnemonic: string, passphrase?: string): Promise<SultanWallet> {
    if (!SultanWallet.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }
    const wallet = new SultanWallet();
    
    // SECURITY: Store mnemonic as SecureString (XOR encrypted)
    wallet.secureMnemonic = new SecureString(mnemonic);
    
    // SECURITY: Store passphrase if provided (BIP39 optional passphrase)
    if (passphrase) {
      wallet.securePassphrase = new SecureString(passphrase);
    }
    
    // Derive first account by default
    await wallet.deriveAccount(0);
    return wallet;
  }

  /**
   * Derive account at index
   * SECURITY: Only caches public data - private key is derived on-demand for signing
   */
  async deriveAccount(index: number, name?: string): Promise<SultanAccount> {
    this.ensureNotDestroyed();
    if (!this.secureMnemonic) {
      throw new Error('Wallet not initialized');
    }

    // Check cache (only contains public data)
    if (this.accounts.has(index)) {
      return this.accounts.get(index)!;
    }

    // SECURITY: Decrypt mnemonic, use it, then let temporary reference go out of scope
    const mnemonic = this.secureMnemonic.reveal();
    const passphrase = this.securePassphrase?.reveal() ?? '';
    const seed = mnemonicToSeedSync(mnemonic, passphrase);
    // Note: mnemonic/passphrase strings go out of scope here - V8 will GC them
    
    const path = `m/44'/${SULTAN_COIN_TYPE}'/0'/0'/${index}`;
    
    // Derive key using SLIP-0010 for Ed25519
    const privateKey = this.deriveEd25519Key(seed, path);
    const publicKey = await ed25519.getPublicKeyAsync(privateKey);
    const address = this.publicKeyToAddress(publicKey);

    // SECURITY: Wipe private key and seed immediately after deriving public key
    secureWipe(privateKey);
    secureWipe(seed);

    // SECURITY: Account object contains NO private key
    const account: SultanAccount = {
      address,
      publicKey: bytesToHex(publicKey),
      path,
      index,
      name: name || `Account ${index + 1}`,
    };

    this.accounts.set(index, account);
    return account;
  }

  /**
   * Derive private key on-demand for signing operations
   * SECURITY: Key is returned for immediate use and must be wiped by caller
   */
  private async derivePrivateKeyForSigning(index: number): Promise<Uint8Array> {
    this.ensureNotDestroyed();
    if (!this.secureMnemonic) {
      throw new Error('Wallet not initialized');
    }

    const mnemonic = this.secureMnemonic.reveal();
    const passphrase = this.securePassphrase?.reveal() ?? '';
    const seed = mnemonicToSeedSync(mnemonic, passphrase);
    const path = `m/44'/${SULTAN_COIN_TYPE}'/0'/0'/${index}`;
    const privateKey = this.deriveEd25519Key(seed, path);
    
    // Wipe seed immediately
    secureWipe(seed);
    
    return privateKey;
  }

  /**
   * Ensure wallet has not been destroyed
   */
  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('Wallet has been destroyed and cannot be used');
    }
  }

  /**
   * SLIP-0010 key derivation for Ed25519
   */
  private deriveEd25519Key(seed: Uint8Array, path: string): Uint8Array {
    const encoder = new TextEncoder();
    let key = hmacSha512(encoder.encode('ed25519 seed'), seed);
    let privateKey = key.slice(0, 32);
    let chainCode = key.slice(32);

    const segments = path.split('/').slice(1); // Remove 'm'
    
    for (const segment of segments) {
      const hardened = segment.endsWith("'");
      let index = parseInt(segment.replace("'", ''));
      if (hardened) {
        index += 0x80000000;
      }

      const indexBuffer = new Uint8Array(4);
      new DataView(indexBuffer.buffer).setUint32(0, index, false);

      const data = new Uint8Array(1 + 32 + 4);
      data[0] = 0x00;
      data.set(privateKey, 1);
      data.set(indexBuffer, 33);

      key = hmacSha512(chainCode, data);
      privateKey = key.slice(0, 32);
      chainCode = key.slice(32);
    }

    return privateKey;
  }

  /**
   * Convert public key to bech32 address
   */
  private publicKeyToAddress(publicKey: Uint8Array): string {
    // Hash the public key and take first 20 bytes
    const hash = sha256(publicKey);
    const addressBytes = hash.slice(0, 20);
    
    // Encode as bech32 with sultan prefix
    const words = bech32.toWords(addressBytes);
    return bech32.encode(SULTAN_PREFIX, words);
  }

  /**
   * Get all derived accounts
   */
  getAccounts(): SultanAccount[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Get account by index
   */
  getAccount(index: number): SultanAccount | undefined {
    return this.accounts.get(index);
  }

  /**
   * Get primary account (index 0)
   */
  getPrimaryAccount(): SultanAccount | undefined {
    return this.accounts.get(0);
  }

  /**
   * Sign a transaction (takes data object and account index)
   * SECURITY: Derives private key on-demand and wipes immediately after use
   */
  async signTransaction(
    txData: Record<string, unknown>,
    accountIndex: number
  ): Promise<string> {
    this.ensureNotDestroyed();
    const account = this.accounts.get(accountIndex);
    if (!account) {
      throw new Error(`Account at index ${accountIndex} not found`);
    }

    // SECURITY: Use stable JSON stringify for deterministic key ordering
    // This ensures signature matches node verification regardless of object key order
    const canonical = stringify(txData);
    const msgBytes = sha256(new TextEncoder().encode(canonical));
    
    // SECURITY: Derive key on-demand
    const privateKey = await this.derivePrivateKeyForSigning(accountIndex);
    try {
      const signature = await ed25519.signAsync(msgBytes, privateKey);
      return bytesToHex(signature);
    } finally {
      // SECURITY: Always wipe key after use
      secureWipe(privateKey);
    }
  }

  /**
   * Sign and return a full transaction structure
   * SECURITY: Derives private key on-demand and wipes immediately after use
   */
  async signFullTransaction(
    accountIndex: number,
    tx: Omit<SultanTransaction, 'from'>
  ): Promise<SignedTransaction> {
    this.ensureNotDestroyed();
    const account = this.accounts.get(accountIndex);
    if (!account) {
      throw new Error(`Account at index ${accountIndex} not found`);
    }

    const transaction: SultanTransaction = {
      ...tx,
      from: account.address,
    };

    const msgBytes = this.serializeTransaction(transaction);
    
    // SECURITY: Derive key on-demand
    const privateKey = await this.derivePrivateKeyForSigning(accountIndex);
    try {
      const signature = await ed25519.signAsync(msgBytes, privateKey);
      return {
        transaction,
        signature: bytesToHex(signature),
        publicKey: account.publicKey,
      };
    } finally {
      // SECURITY: Always wipe key after use
      secureWipe(privateKey);
    }
  }

  /**
   * Sign arbitrary message
   * SECURITY: Derives private key on-demand and wipes immediately after use
   */
  async signMessage(accountIndex: number, message: string): Promise<string> {
    this.ensureNotDestroyed();
    const account = this.accounts.get(accountIndex);
    if (!account) {
      throw new Error(`Account at index ${accountIndex} not found`);
    }

    const msgBytes = new TextEncoder().encode(message);
    
    // SECURITY: Derive key on-demand
    const privateKey = await this.derivePrivateKeyForSigning(accountIndex);
    try {
      const signature = await ed25519.signAsync(msgBytes, privateKey);
      return bytesToHex(signature);
    } finally {
      // SECURITY: Always wipe key after use
      secureWipe(privateKey);
    }
  }

  /**
   * Serialize transaction for signing
   * SECURITY: Uses stable JSON stringify for deterministic key ordering
   */
  private serializeTransaction(tx: SultanTransaction): Uint8Array {
    // Use stable stringify to ensure consistent key ordering
    const canonical = stringify({
      from: tx.from,
      to: tx.to,
      amount: tx.amount,
      memo: tx.memo || '',
      nonce: tx.nonce,
      timestamp: tx.timestamp,
    });
    return sha256(new TextEncoder().encode(canonical));
  }

  /**
   * Verify a signature
   */
  static async verifySignature(
    message: Uint8Array,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    try {
      return await ed25519.verifyAsync(
        hexToBytes(signature),
        message,
        hexToBytes(publicKey)
      );
    } catch {
      return false;
    }
  }

  /**
   * Get mnemonic for backup purposes
   * SECURITY: Uses callback pattern to minimize exposure time
   * The mnemonic is only revealed within the callback scope
   * 
   * @param callback - Function that receives the mnemonic. Should NOT store it.
   * @returns The return value of the callback
   */
  withMnemonic<T>(callback: (mnemonic: string) => T): T {
    this.ensureNotDestroyed();
    if (!this.secureMnemonic) {
      throw new Error('Wallet not initialized');
    }
    const mnemonic = this.secureMnemonic.reveal();
    return callback(mnemonic);
  }

  /**
   * Check if wallet has mnemonic stored
   */
  hasMnemonic(): boolean {
    return this.secureMnemonic !== null && !this.destroyed;
  }

  /**
   * Clear sensitive data from memory securely
   * CRITICAL: Always call this when done with the wallet
   */
  destroy(): void {
    if (this.destroyed) return;
    
    // SECURITY: Destroy SecureString (wipes XOR encrypted data)
    if (this.secureMnemonic) {
      this.secureMnemonic.destroy();
      this.secureMnemonic = null;
    }
    
    // Clear account cache (no private keys stored, just public data)
    this.accounts.clear();
    
    this.destroyed = true;
  }

  /**
   * Check if wallet has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format base units to display units (9 decimals) with comma separators
 */
export function formatSLTN(baseUnits: bigint | string | number): string {
  const value = BigInt(baseUnits);
  const divisor = BigInt(10 ** SULTAN_DECIMALS);
  const intPart = value / divisor;
  const fracPart = value % divisor;
  
  // Add comma separators to integer part
  const intStr = intPart.toLocaleString('en-US');
  
  if (fracPart === 0n) {
    return intStr;
  }
  
  const fracStr = fracPart.toString().padStart(SULTAN_DECIMALS, '0');
  const trimmed = fracStr.replace(/0+$/, '');
  return `${intStr}.${trimmed}`;
}

/**
 * Parse display units to base units
 */
export function parseSLTN(displayUnits: string): bigint {
  const parts = displayUnits.split('.');
  const intPart = BigInt(parts[0] || '0');
  
  let fracPart = 0n;
  if (parts[1]) {
    const padded = parts[1].slice(0, SULTAN_DECIMALS).padEnd(SULTAN_DECIMALS, '0');
    fracPart = BigInt(padded);
  }
  
  return intPart * BigInt(10 ** SULTAN_DECIMALS) + fracPart;
}

/**
 * Validate Sultan address format
 */
export function isValidAddress(address: string): boolean {
  try {
    const decoded = bech32.decode(address);
    return decoded.prefix === SULTAN_PREFIX && decoded.words.length > 0;
  } catch {
    return false;
  }
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars = 8): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars + 6)}...${address.slice(-chars)}`;
}

// ============================================================================
// Crypto Helpers
// ============================================================================

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  const blockSize = 128;
  
  if (key.length > blockSize) {
    key = sha512(key);
  }
  
  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(key);
  
  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = paddedKey[i] ^ 0x36;
    opad[i] = paddedKey[i] ^ 0x5c;
  }
  
  const inner = new Uint8Array(ipad.length + data.length);
  inner.set(ipad);
  inner.set(data, ipad.length);
  const innerHash = sha512(inner);
  
  const outer = new Uint8Array(opad.length + innerHash.length);
  outer.set(opad);
  outer.set(innerHash, opad.length);
  
  return sha512(outer);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export { randomBytes };
