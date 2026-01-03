/**
 * TOTP (Time-based One-Time Password) Implementation
 * 
 * RFC 6238 compliant implementation using Web Crypto API.
 * No external dependencies required.
 * 
 * Used for optional 2FA at login (not for transaction signing).
 */

// ============================================================================
// Constants
// ============================================================================

/** TOTP time step in seconds (standard is 30) */
export const TOTP_TIME_STEP = 30;

/** Number of digits in TOTP code */
export const TOTP_DIGITS = 6;

/** Base32 alphabet for encoding/decoding secrets */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Secret length in bytes (160 bits = 20 bytes, standard) */
const SECRET_LENGTH = 20;

// ============================================================================
// Base32 Encoding/Decoding
// ============================================================================

/**
 * Encode bytes to base32 string
 */
export function base32Encode(data: Uint8Array): string {
  let result = '';
  let bits = 0;
  let value = 0;
  
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  
  // Handle remaining bits
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  
  return result;
}

/**
 * Decode base32 string to bytes
 */
export function base32Decode(str: string): Uint8Array {
  // Remove spaces and convert to uppercase
  const input = str.replace(/\s+/g, '').toUpperCase();
  
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  
  for (const char of input) {
    // Skip padding
    if (char === '=') continue;
    
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    
    value = (value << 5) | index;
    bits += 5;
    
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  
  return new Uint8Array(bytes);
}

// ============================================================================
// HMAC-SHA1 using Web Crypto API
// NOTE: SHA1 is used per RFC 6238 for compatibility with authenticator apps.
// FUTURE: Consider SHA256 upgrade when authenticator apps widely support it.
// Most apps (Google Authenticator, Authy) still expect SHA1 by default.
// ============================================================================

/**
 * Compute HMAC-SHA1
 * SECURITY: SHA1 is cryptographically weak for collision resistance but
 * HMAC-SHA1 remains secure for authentication per RFC 2104.
 */
async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  // Create new ArrayBuffers to satisfy TypeScript's strict typing
  const keyBuffer = new Uint8Array(key).buffer;
  const msgBuffer = new Uint8Array(message).buffer;
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
  return new Uint8Array(signature);
}

// ============================================================================
// HOTP/TOTP Core
// ============================================================================

/**
 * Convert number to 8-byte big-endian array
 */
function numberToBytes(num: number): Uint8Array {
  const bytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    bytes[i] = num & 0xff;
    num = Math.floor(num / 256);
  }
  return bytes;
}

/**
 * Dynamic Truncation (RFC 4226)
 */
function dynamicTruncate(hmac: Uint8Array, digits: number): string {
  // Get offset from last 4 bits
  const offset = hmac[hmac.length - 1] & 0x0f;
  
  // Get 4 bytes starting at offset, mask MSB
  const binary = 
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  
  // Generate code
  const otp = binary % Math.pow(10, digits);
  
  // Pad with leading zeros
  return otp.toString().padStart(digits, '0');
}

/**
 * Generate HOTP code (RFC 4226)
 */
export async function generateHOTP(
  secret: Uint8Array,
  counter: number,
  digits: number = TOTP_DIGITS
): Promise<string> {
  const message = numberToBytes(counter);
  const hmac = await hmacSha1(secret, message);
  return dynamicTruncate(hmac, digits);
}

/**
 * Generate TOTP code (RFC 6238)
 */
export async function generateTOTP(
  secret: Uint8Array | string,
  timeStep: number = TOTP_TIME_STEP,
  digits: number = TOTP_DIGITS
): Promise<string> {
  // Convert base32 string to bytes if needed
  const secretBytes = typeof secret === 'string' ? base32Decode(secret) : secret;
  
  // Calculate counter from current time
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  
  return generateHOTP(secretBytes, counter, digits);
}

/**
 * Verify TOTP code with time drift tolerance
 * Allows ±1 time window for clock skew
 */
export async function verifyTOTP(
  secret: Uint8Array | string,
  code: string,
  timeStep: number = TOTP_TIME_STEP,
  digits: number = TOTP_DIGITS,
  window: number = 1 // Allow ±1 time window
): Promise<boolean> {
  const secretBytes = typeof secret === 'string' ? base32Decode(secret) : secret;
  const now = Math.floor(Date.now() / 1000 / timeStep);
  
  // Check current window and adjacent windows
  for (let i = -window; i <= window; i++) {
    const expectedCode = await generateHOTP(secretBytes, now + i, digits);
    if (constantTimeEqual(code, expectedCode)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ============================================================================
// Secret Generation & QR Code URL
// ============================================================================

/**
 * Generate a cryptographically secure TOTP secret
 */
export function generateTOTPSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SECRET_LENGTH));
  return base32Encode(bytes);
}

/**
 * Generate otpauth:// URL for QR code scanning
 * Compatible with Google Authenticator, Authy, etc.
 */
export function generateTOTPUrl(
  secret: string,
  accountName: string,
  issuer: string = 'Sultan Wallet'
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  const encodedSecret = secret.replace(/\s/g, '');
  
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${encodedSecret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_TIME_STEP}`;
}

// ============================================================================
// Backup Codes
// ============================================================================

/** Number of backup codes to generate */
const BACKUP_CODE_COUNT = 8;

/** Backup code format: XXXX-XXXX */
const BACKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars

/**
 * Generate backup codes for 2FA recovery
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    let code = '';
    for (let j = 0; j < 8; j++) {
      if (j === 4) code += '-';
      const randomIndex = crypto.getRandomValues(new Uint8Array(1))[0] % BACKUP_CODE_CHARS.length;
      code += BACKUP_CODE_CHARS[randomIndex];
    }
    codes.push(code);
  }
  
  return codes;
}

/**
 * Verify a backup code
 * Returns the index of the matched code, or -1 if not found
 */
export function verifyBackupCode(code: string, validCodes: string[]): number {
  const normalizedInput = code.toUpperCase().replace(/\s|-/g, '');
  
  for (let i = 0; i < validCodes.length; i++) {
    const normalizedValid = validCodes[i].replace(/-/g, '');
    if (constantTimeEqual(normalizedInput, normalizedValid)) {
      return i;
    }
  }
  
  return -1;
}

// ============================================================================
// 2FA State Management
// ============================================================================

export interface TwoFactorState {
  enabled: boolean;
  secret: string;           // Base32 encoded secret
  backupCodes: string[];    // Remaining unused backup codes
  createdAt: number;
  lastUsedAt: number | null;
}

const TOTP_STORAGE_KEY = 'sultan_2fa';

/**
 * Save 2FA state (encrypted with PIN)
 * Note: This should be encrypted in production - for now stores in localStorage
 * The main wallet encryption already protects the device
 */
export function save2FAState(state: TwoFactorState): void {
  localStorage.setItem(TOTP_STORAGE_KEY, JSON.stringify(state));
}

/**
 * Load 2FA state
 */
export function load2FAState(): TwoFactorState | null {
  const data = localStorage.getItem(TOTP_STORAGE_KEY);
  if (!data) return null;
  
  try {
    return JSON.parse(data) as TwoFactorState;
  } catch {
    return null;
  }
}

/**
 * Check if 2FA is enabled
 */
export function is2FAEnabled(): boolean {
  const state = load2FAState();
  return state?.enabled ?? false;
}

/**
 * Enable 2FA with a new secret
 */
export function enable2FA(): { secret: string; backupCodes: string[] } {
  const secret = generateTOTPSecret();
  const backupCodes = generateBackupCodes();
  
  const state: TwoFactorState = {
    enabled: true,
    secret,
    backupCodes,
    createdAt: Date.now(),
    lastUsedAt: null,
  };
  
  save2FAState(state);
  
  return { secret, backupCodes };
}

/**
 * Disable 2FA
 */
export function disable2FA(): void {
  localStorage.removeItem(TOTP_STORAGE_KEY);
}

/**
 * Verify 2FA code (TOTP or backup code)
 * Consumes backup code if used
 */
export async function verify2FA(code: string): Promise<boolean> {
  const state = load2FAState();
  if (!state?.enabled) return true; // 2FA not enabled, always pass
  
  // Normalize code - remove spaces and dashes
  const normalizedCode = code.replace(/[\s-]/g, '');
  
  // Try TOTP first (6 digits)
  if (normalizedCode.length === TOTP_DIGITS && /^\d+$/.test(normalizedCode)) {
    const isValid = await verifyTOTP(state.secret, normalizedCode);
    if (isValid) {
      // Update last used time
      state.lastUsedAt = Date.now();
      save2FAState(state);
      return true;
    }
  }
  
  // Try backup code (8 chars, possibly with dash)
  const backupIndex = verifyBackupCode(code, state.backupCodes);
  if (backupIndex >= 0) {
    // Consume the backup code
    state.backupCodes.splice(backupIndex, 1);
    state.lastUsedAt = Date.now();
    save2FAState(state);
    return true;
  }
  
  return false;
}

/**
 * Get remaining backup codes count
 */
export function getRemainingBackupCodes(): number {
  const state = load2FAState();
  return state?.backupCodes.length ?? 0;
}
