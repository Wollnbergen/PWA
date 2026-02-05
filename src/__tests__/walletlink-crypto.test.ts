/**
 * WalletLink Crypto Module Tests
 * 
 * Tests for AES-256-GCM encryption, key derivation, and utility functions.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  deriveEncryptionKey,
  encryptMessage,
  decryptMessage,
  generateSessionKey,
  generateSessionId,
  encodeSessionKey,
  decodeSessionKey,
  secureCompare,
  randomHex,
  sha256,
  hmacSign,
  hmacVerify,
} from '../core/walletlink-crypto';

describe('WalletLink Crypto', () => {
  describe('generateSessionKey', () => {
    it('should generate a 32-byte key', () => {
      const key = generateSessionKey();
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it('should generate unique keys each time', () => {
      const key1 = generateSessionKey();
      const key2 = generateSessionKey();
      expect(key1).not.toEqual(key2);
    });

    it('should have sufficient entropy', () => {
      const key = generateSessionKey();
      // Check that not all bytes are the same
      const uniqueBytes = new Set(Array.from(key));
      expect(uniqueBytes.size).toBeGreaterThan(10);
    });
  });

  describe('generateSessionId', () => {
    it('should generate a 32-character hex string', () => {
      const id = generateSessionId();
      expect(typeof id).toBe('string');
      expect(id.length).toBe(32);
      expect(/^[0-9a-f]+$/.test(id)).toBe(true);
    });

    it('should generate unique IDs each time', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('encodeSessionKey / decodeSessionKey', () => {
    it('should round-trip encode and decode', () => {
      const original = generateSessionKey();
      const encoded = encodeSessionKey(original);
      const decoded = decodeSessionKey(encoded);
      expect(decoded).toEqual(original);
    });

    it('should produce valid base64', () => {
      const key = generateSessionKey();
      const encoded = encodeSessionKey(key);
      expect(() => atob(encoded)).not.toThrow();
    });
  });

  describe('deriveEncryptionKey', () => {
    it('should derive a CryptoKey from session key', async () => {
      const sessionKey = generateSessionKey();
      const cryptoKey = await deriveEncryptionKey(sessionKey);
      expect(cryptoKey).toBeDefined();
      expect(cryptoKey.type).toBe('secret');
      expect(cryptoKey.algorithm.name).toBe('AES-GCM');
    });

    it('should derive same key from same input', async () => {
      const sessionKey = generateSessionKey();
      const key1 = await deriveEncryptionKey(sessionKey);
      const key2 = await deriveEncryptionKey(sessionKey);
      
      // Can't directly compare CryptoKeys, but we can test encryption
      const testData = 'test message';
      const encrypted1 = await encryptMessage(testData, key1);
      const decrypted = await decryptMessage(encrypted1, key2);
      expect(decrypted).toBe(testData);
    });

    it('should derive different keys for different inputs', async () => {
      const key1 = await deriveEncryptionKey(generateSessionKey());
      const key2 = await deriveEncryptionKey(generateSessionKey());
      
      // Encrypt with key1, try to decrypt with key2 - should fail
      const encrypted = await encryptMessage('test', key1);
      await expect(decryptMessage(encrypted, key2)).rejects.toThrow();
    });
  });

  describe('encryptMessage / decryptMessage', () => {
    let key: CryptoKey;

    beforeAll(async () => {
      key = await deriveEncryptionKey(generateSessionKey());
    });

    it('should encrypt and decrypt a simple message', async () => {
      const plaintext = 'Hello, World!';
      const encrypted = await encryptMessage(plaintext, key);
      const decrypted = await decryptMessage(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt JSON', async () => {
      const data = { type: 'sign_request', payload: { amount: 1000 } };
      const plaintext = JSON.stringify(data);
      const encrypted = await encryptMessage(plaintext, key);
      const decrypted = await decryptMessage(encrypted, key);
      expect(JSON.parse(decrypted)).toEqual(data);
    });

    it('should encrypt and decrypt unicode', async () => {
      const plaintext = '🔐 Secure message with émojis and ünïcödé';
      const encrypted = await encryptMessage(plaintext, key);
      const decrypted = await decryptMessage(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt large messages', async () => {
      const plaintext = 'x'.repeat(100000);
      const encrypted = await encryptMessage(plaintext, key);
      const decrypted = await decryptMessage(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV)', async () => {
      const plaintext = 'Same message';
      const encrypted1 = await encryptMessage(plaintext, key);
      const encrypted2 = await encryptMessage(plaintext, key);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should produce base64 output', async () => {
      const encrypted = await encryptMessage('test', key);
      expect(() => atob(encrypted)).not.toThrow();
    });

    it('should fail to decrypt with wrong key', async () => {
      const wrongKey = await deriveEncryptionKey(generateSessionKey());
      const encrypted = await encryptMessage('secret', key);
      await expect(decryptMessage(encrypted, wrongKey)).rejects.toThrow();
    });

    it('should fail to decrypt tampered ciphertext', async () => {
      const encrypted = await encryptMessage('secret', key);
      const bytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
      bytes[20] ^= 0xff; // Flip some bits
      const tampered = btoa(String.fromCharCode(...bytes));
      await expect(decryptMessage(tampered, key)).rejects.toThrow();
    });

    it('should fail to decrypt truncated ciphertext', async () => {
      const encrypted = await encryptMessage('secret', key);
      const truncated = encrypted.substring(0, 10);
      await expect(decryptMessage(truncated, key)).rejects.toThrow();
    });
  });

  describe('secureCompare', () => {
    it('should return true for equal arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 5]);
      expect(secureCompare(a, b)).toBe(true);
    });

    it('should return false for different arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 6]);
      expect(secureCompare(a, b)).toBe(false);
    });

    it('should return false for different lengths', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4]);
      expect(secureCompare(a, b)).toBe(false);
    });
  });

  describe('randomHex', () => {
    it('should generate hex string of correct length', () => {
      const hex = randomHex(16);
      expect(hex.length).toBe(32); // 16 bytes = 32 hex chars
      expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
    });

    it('should generate unique values', () => {
      const values = new Set<string>();
      for (let i = 0; i < 100; i++) {
        values.add(randomHex(16));
      }
      expect(values.size).toBe(100);
    });
  });

  describe('sha256', () => {
    it('should hash a string', async () => {
      const hash = await sha256('hello');
      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });

    it('should produce consistent hashes', async () => {
      const hash1 = await sha256('hello');
      const hash2 = await sha256('hello');
      expect(hash1).toEqual(hash2);
    });

    it('should produce different hashes for different inputs', async () => {
      const hash1 = await sha256('hello');
      const hash2 = await sha256('world');
      expect(hash1).not.toEqual(hash2);
    });
  });

  describe('hmacSign / hmacVerify', () => {
    it('should sign and verify a message', async () => {
      const key = generateSessionKey();
      const message = 'message to sign';
      const signature = await hmacSign(message, key);
      const isValid = await hmacVerify(message, signature, key);
      expect(isValid).toBe(true);
    });

    it('should fail to verify with wrong key', async () => {
      const key1 = generateSessionKey();
      const key2 = generateSessionKey();
      const signature = await hmacSign('message', key1);
      const isValid = await hmacVerify('message', signature, key2);
      expect(isValid).toBe(false);
    });

    it('should fail to verify tampered message', async () => {
      const key = generateSessionKey();
      const signature = await hmacSign('original', key);
      const isValid = await hmacVerify('tampered', signature, key);
      expect(isValid).toBe(false);
    });
  });
});
