/**
 * Test setup for Sultan Wallet
 * Configures jsdom environment and polyfills for browser APIs
 */

import '@testing-library/jest-dom';
import { sha512 } from '@noble/hashes/sha512';
import * as ed25519 from '@noble/ed25519';
import { webcrypto } from 'node:crypto';

// ─── Fix 1: @noble/ed25519 sha512 ──────────────────────────────────────────
// Force @noble/ed25519 to use synchronous sha512 from @noble/hashes
// Avoids SubtleCrypto issues in jsdom CI environments
ed25519.etc.sha512Sync = (...msgs: Uint8Array[]) =>
  sha512(ed25519.etc.concatBytes(...msgs));
ed25519.etc.sha512Async = (...msgs: Uint8Array[]) =>
  Promise.resolve(sha512(ed25519.etc.concatBytes(...msgs)));

// ─── Fix 2: jsdom SubtleCrypto Uint8Array compatibility ────────────────────
// jsdom's SubtleCrypto.importKey / digest / sign / verify reject Uint8Array
// with "2nd argument is not instance of ArrayBuffer, Buffer, TypedArray, or
// DataView" because jsdom's internal instanceof checks fail across realms.
// Replace globalThis.crypto with Node's native webcrypto which handles
// Uint8Array correctly.
if (typeof globalThis.crypto?.subtle !== 'undefined') {
  // Node's webcrypto works correctly with Uint8Array
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}

// ─── Fix 3: IndexedDB graceful skip ────────────────────────────────────────
if (typeof globalThis.indexedDB === 'undefined') {
  console.warn('IndexedDB not available in test environment - related tests will be skipped');
}
