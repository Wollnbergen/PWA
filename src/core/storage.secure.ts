/**
 * Secure Storage for Sultan Wallet - Production Version
 * 
 * Uses IndexedDB with AES-GCM encryption for persistent storage.
 * All sensitive data is encrypted with a user-provided PIN/password.
 * 
 * SECURITY FEATURES:
 * - AES-256-GCM authenticated encryption
 * - PBKDF2 key derivation with 600,000 iterations (OWASP 2024)
 * - 32-byte random salt per encryption
 * - 12-byte random IV per encryption
 * - Secure memory wiping
 * - Rate limiting on decryption attempts
 * - Session timeout with auto-lock
 */

import { randomBytes } from '@noble/hashes/utils';
import {
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  IV_LENGTH,
  secureWipe,
  SecureString,
  isLockedOut,
  recordFailedAttempt,
  clearFailedAttempts,
  startSession,
  endSession,
  recordActivity,
} from './security';

const DB_NAME = 'sultan-wallet';
const DB_VERSION = 2; // Bumped for security upgrade
const STORE_NAME = 'wallet';

interface StoredWallet {
  encryptedMnemonic: string;
  mnemonicChecksum: string; // Added for integrity verification
  accounts: string[];
  createdAt: number;
  updatedAt: number;
  version: number;
  securityVersion: number; // Track encryption parameters
}

interface EncryptedData {
  salt: string;
  iv: string;
  ciphertext: string;
  version: number;
}

let db: IDBDatabase | null = null;

// Session state
let sessionMnemonic: SecureString | null = null;
let sessionId: string | null = null;
let sessionPinSecure: SecureString | null = null; // SECURITY: XOR-encrypted in memory, not plaintext

/**
 * Initialize IndexedDB with proper error handling
 */
async function initDB(): Promise<IDBDatabase> {
  if (db && db.name === DB_NAME) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open database:', request.error);
      reject(new Error('Database initialization failed'));
    };
    
    request.onsuccess = () => {
      db = request.result;
      
      // Handle database close events
      db.onclose = () => {
        db = null;
      };
      
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      // Create store if it doesn't exist
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    
    request.onblocked = () => {
      reject(new Error('Database blocked by another connection'));
    };
  });
}

/**
 * Derive encryption key from PIN using PBKDF2
 * Uses OWASP 2024 recommended iteration count
 */
async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const pinBytes = encoder.encode(pin);
  
  try {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      pinBytes,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } finally {
    // Note: We can't wipe encoder output as it's managed by the engine
  }
}

/**
 * Encrypt data with AES-256-GCM
 * Returns base64-encoded encrypted data with embedded salt and IV
 */
async function encrypt(data: string, pin: string): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  
  const key = await deriveKey(pin, salt);
  const plaintext = encoder.encode(data);
  
  try {
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintext
    );

    return {
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      version: 2, // Encryption version for future upgrades
    };
  } finally {
    // Wipe sensitive data
    secureWipe(salt);
    secureWipe(iv);
  }
}

/**
 * Decrypt data with AES-256-GCM
 */
async function decrypt(encrypted: EncryptedData, pin: string): Promise<string> {
  const salt = base64ToBytes(encrypted.salt);
  const iv = base64ToBytes(encrypted.iv);
  const ciphertext = base64ToBytes(encrypted.ciphertext);

  const key = await deriveKey(pin, salt);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new Error('Decryption failed - invalid PIN or corrupted data');
  } finally {
    secureWipe(salt);
    secureWipe(iv);
    secureWipe(ciphertext);
  }
}

/**
 * Save encrypted wallet to storage
 */
export async function saveWallet(mnemonic: string, pin: string): Promise<void> {
  const database = await initDB();
  
  // Encrypt the mnemonic
  const encryptedData = await encrypt(mnemonic, pin);
  
  // Create checksum for integrity verification
  const checksumHash = await crypto.subtle.digest(
    'SHA-256', 
    new TextEncoder().encode(mnemonic)
  );
  const checksum = Array.from(new Uint8Array(checksumHash).slice(0, 4))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const wallet: StoredWallet = {
    encryptedMnemonic: JSON.stringify(encryptedData),
    mnemonicChecksum: checksum,
    accounts: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    securityVersion: 2,
  };

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(wallet, 'wallet');

    request.onerror = () => reject(new Error('Failed to save wallet'));
    request.onsuccess = () => resolve();
  });
}

/**
 * Load and decrypt wallet from storage with rate limiting
 */
export async function loadWallet(pin: string): Promise<string> {
  // Check lockout status
  if (isLockedOut()) {
    throw new Error('Too many failed attempts. Please wait before trying again.');
  }
  
  const database = await initDB();

  const wallet = await new Promise<StoredWallet | undefined>((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('wallet');

    request.onerror = () => reject(new Error('Failed to read wallet'));
    request.onsuccess = () => resolve(request.result);
  });

  if (!wallet) {
    throw new Error('No wallet found');
  }

  try {
    let mnemonic: string;
    
    // Handle different encryption versions
    if (wallet.securityVersion === 2) {
      const encryptedData: EncryptedData = JSON.parse(wallet.encryptedMnemonic);
      mnemonic = await decrypt(encryptedData, pin);
    } else {
      // Legacy decryption for v1 wallets
      mnemonic = await decryptLegacy(wallet.encryptedMnemonic, pin);
    }
    
    // Verify checksum if available
    if (wallet.mnemonicChecksum) {
      const checksumHash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(mnemonic)
      );
      const computedChecksum = Array.from(new Uint8Array(checksumHash).slice(0, 4))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      if (computedChecksum !== wallet.mnemonicChecksum) {
        throw new Error('Data integrity check failed');
      }
    }
    
    // Clear failed attempts on success
    clearFailedAttempts();
    
    return mnemonic;
  } catch (error) {
    // Record failed attempt
    const { locked, attemptsRemaining } = recordFailedAttempt();
    
    if (locked) {
      throw new Error('Too many failed attempts. Wallet locked for 5 minutes.');
    }
    
    throw new Error(`Invalid PIN. ${attemptsRemaining} attempts remaining.`);
  }
}

/**
 * Legacy decryption for v1 wallets (backward compatibility)
 */
async function decryptLegacy(encryptedData: string, pin: string): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);

  const encoder = new TextEncoder();
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000, // Old iteration count
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Check if a wallet exists
 */
export async function hasWallet(): Promise<boolean> {
  try {
    const database = await initDB();
    
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get('wallet');

      request.onerror = () => resolve(false);
      request.onsuccess = () => resolve(!!request.result);
    });
  } catch {
    return false;
  }
}

/**
 * Delete wallet from storage securely
 */
export async function deleteWallet(): Promise<void> {
  // Clear session first
  clearSession();
  
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete('wallet');

    request.onerror = () => reject(new Error('Failed to delete wallet'));
    request.onsuccess = () => {
      // Also clear lockout state
      clearFailedAttempts();
      resolve();
    };
  });
}

/**
 * Session management - store mnemonic securely in memory
 */
export function setSessionMnemonic(mnemonic: string, onExpire: () => void): void {
  // Clear any existing session
  clearSession();
  
  // Store mnemonic in secure string
  sessionMnemonic = new SecureString(mnemonic);
  
  // Start session with timeout
  sessionId = startSession(onExpire);
}

/**
 * Get session mnemonic if session is valid
 */
export function getSessionMnemonic(): string | null {
  if (!sessionMnemonic || !sessionId) {
    return null;
  }
  
  recordActivity();
  return sessionMnemonic.toString();
}

/**
 * Clear current session securely
 */
export function clearSession(): void {
  if (sessionMnemonic) {
    sessionMnemonic.destroy();
    sessionMnemonic = null;
  }
  
  // SECURITY: Properly destroy SecureString PIN
  if (sessionPinSecure) {
    sessionPinSecure.destroy();
    sessionPinSecure = null;
  }
  
  sessionId = null;
  endSession();
}

/**
 * Get decrypted mnemonic using PIN
 */
export async function getMnemonic(pin: string): Promise<string | null> {
  try {
    return await loadWallet(pin);
  } catch {
    return null;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

// ============================================================================
// Exports
// ============================================================================

export const walletStorage = {
  saveWallet,
  loadWallet,
  hasWallet,
  deleteWallet,
  getMnemonic,
  setSessionMnemonic,
  getSessionMnemonic,
  clearSession,
};

// Session PIN management
// SECURITY: PIN is stored XOR-encrypted in memory via SecureString
export function setSessionPin(pin: string): void {
  // Destroy old session PIN if exists
  if (sessionPinSecure) {
    sessionPinSecure.destroy();
  }
  sessionPinSecure = new SecureString(pin);
}

export function getSessionPin(): string | null {
  if (!sessionPinSecure) return null;
  // SECURITY: Reveal returns decrypted value; caller should not store it
  return sessionPinSecure.reveal();
}

export function clearSessionPin(): void {
  if (sessionPinSecure) {
    sessionPinSecure.destroy();
    sessionPinSecure = null;
  }
}
