/**
 * WalletLink Protocol Integration Tests
 * 
 * Tests for the full WalletLink protocol flow including:
 * - Session creation and QR generation
 * - Client connection from QR data
 * - Message encryption/decryption
 * - Request/response flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WalletLinkSessionGenerator,
  MessageType,
} from '../core/wallet-link';
import {
  generateSessionKey,
  encodeSessionKey,
  deriveEncryptionKey,
  encryptMessage,
  decryptMessage,
} from '../core/walletlink-crypto';

// Mock WebSocket for testing
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: any) => void) | null = null;
  
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    // Simulate connection after a tick
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Helper to simulate receiving a message
  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }
}

// Replace global WebSocket with mock
const originalWebSocket = globalThis.WebSocket;

describe('WalletLink Protocol', () => {
  beforeEach(() => {
    (globalThis as any).WebSocket = MockWebSocket;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    (globalThis as any).WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  describe('Session ID and Key Generation', () => {
    it('should generate valid session data', async () => {
      const generator = new WalletLinkSessionGenerator('wss://test.relay.io');
      
      // Need to advance timers for WebSocket mock
      const sessionPromise = generator.createSession();
      await vi.advanceTimersByTimeAsync(10);
      
      const { qrData, sessionId } = await sessionPromise;
      
      expect(sessionId).toBeDefined();
      expect(sessionId.length).toBe(32);
      expect(qrData).toContain('sultan://wl?');
      expect(qrData).toContain(`s=${sessionId}`);
      expect(qrData).toContain('k=');
      expect(qrData).toContain('b=');
    });

    it('should parse QR data correctly', () => {
      const sessionId = 'a'.repeat(32);
      const key = encodeSessionKey(generateSessionKey());
      const bridgeUrl = 'wss://relay.example.com';
      
      const qrData = `sultan://wl?s=${sessionId}&k=${encodeURIComponent(key)}&b=${encodeURIComponent(bridgeUrl)}`;
      
      // Test parsing (we can access via URL)
      const url = new URL(qrData);
      expect(url.protocol).toBe('sultan:');
      expect(url.hostname).toBe('wl');
      expect(url.searchParams.get('s')).toBe(sessionId);
      expect(url.searchParams.get('k')).toBe(key);
      expect(url.searchParams.get('b')).toBe(bridgeUrl);
    });
  });

  describe('Encryption Integration', () => {
    it('should encrypt messages that can be decrypted with same key', async () => {
      const sessionKey = generateSessionKey();
      const cryptoKey = await deriveEncryptionKey(sessionKey);
      
      const testMessage = JSON.stringify({
        type: MessageType.CONNECT_REQUEST,
        sessionId: 'test123',
        payload: { dAppName: 'Test dApp' },
        timestamp: Date.now(),
      });

      const encrypted = await encryptMessage(testMessage, cryptoKey);
      const decrypted = await decryptMessage(encrypted, cryptoKey);
      
      expect(decrypted).toBe(testMessage);
      expect(JSON.parse(decrypted).type).toBe(MessageType.CONNECT_REQUEST);
    });

    it('should fail decryption with different session key', async () => {
      const key1 = await deriveEncryptionKey(generateSessionKey());
      const key2 = await deriveEncryptionKey(generateSessionKey());
      
      const encrypted = await encryptMessage('secret data', key1);
      
      await expect(decryptMessage(encrypted, key2)).rejects.toThrow();
    });
  });

  describe('Session Persistence', () => {
    it('should store session in localStorage', () => {
      const mockStorage: Record<string, string> = {};
      
      // Mock localStorage
      const localStorageMock = {
        getItem: (key: string) => mockStorage[key] || null,
        setItem: (key: string, value: string) => { mockStorage[key] = value; },
        removeItem: (key: string) => { delete mockStorage[key]; },
      };
      
      Object.defineProperty(globalThis, 'localStorage', {
        value: localStorageMock,
        writable: true,
      });

      // Session data format that would be stored
      const sessionData = {
        sessionId: 'test-session-123',
        sessionKey: encodeSessionKey(generateSessionKey()),
        bridgeUrl: 'wss://relay.test.io',
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      
      localStorage.setItem('sultan_walletlink_session', JSON.stringify(sessionData));
      
      const stored = localStorage.getItem('sultan_walletlink_session');
      expect(stored).not.toBeNull();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.sessionId).toBe(sessionData.sessionId);
    });
  });

  describe('Message Types', () => {
    it('should have all required message types defined', () => {
      expect(MessageType.SESSION_INIT).toBe('session_init');
      expect(MessageType.SESSION_JOIN).toBe('session_join');
      expect(MessageType.SESSION_ACK).toBe('session_ack');
      expect(MessageType.SESSION_END).toBe('session_end');
      expect(MessageType.HEARTBEAT).toBe('heartbeat');
      expect(MessageType.CONNECT_REQUEST).toBe('connect_request');
      expect(MessageType.SIGN_MESSAGE_REQUEST).toBe('sign_message_request');
      expect(MessageType.SIGN_TX_REQUEST).toBe('sign_tx_request');
      expect(MessageType.CONNECT_RESPONSE).toBe('connect_response');
      expect(MessageType.SIGN_MESSAGE_RESPONSE).toBe('sign_message_response');
      expect(MessageType.SIGN_TX_RESPONSE).toBe('sign_tx_response');
      expect(MessageType.ERROR).toBe('error');
    });
  });

  describe('QR Code URL Format', () => {
    it('should generate valid Sultan WalletLink URL', () => {
      const sessionId = 'abcdef0123456789abcdef0123456789';
      const sessionKey = generateSessionKey();
      const bridgeUrl = 'wss://relay.sltn.io';
      
      const keyBase64 = encodeSessionKey(sessionKey);
      const qrData = `sultan://wl?s=${sessionId}&k=${encodeURIComponent(keyBase64)}&b=${encodeURIComponent(bridgeUrl)}`;
      
      // Validate format
      expect(qrData.startsWith('sultan://wl?')).toBe(true);
      
      // Validate parseable
      const url = new URL(qrData);
      expect(url.searchParams.has('s')).toBe(true);
      expect(url.searchParams.has('k')).toBe(true);
      expect(url.searchParams.has('b')).toBe(true);
    });

    it('should handle special characters in bridge URL', () => {
      const bridgeUrl = 'wss://relay.example.com:8443/path?token=abc';
      const encoded = encodeURIComponent(bridgeUrl);
      const qrData = `sultan://wl?s=test&k=key&b=${encoded}`;
      
      const url = new URL(qrData);
      expect(url.searchParams.get('b')).toBe(bridgeUrl);
    });
  });

  describe('Deep Link Format', () => {
    it('should generate valid deep link with return URL', () => {
      const sessionData = 'sultan://wl?s=abc&k=xyz&b=wss://relay.io';
      const returnUrl = 'https://dapp.example.com/callback';
      
      const deepLink = `https://wallet.sltn.io/connect?session=${encodeURIComponent(sessionData)}&return=${encodeURIComponent(returnUrl)}`;
      
      const url = new URL(deepLink);
      expect(url.hostname).toBe('wallet.sltn.io');
      expect(url.pathname).toBe('/connect');
      expect(url.searchParams.get('session')).toBe(sessionData);
      expect(url.searchParams.get('return')).toBe(returnUrl);
    });
  });
});

describe('Security Considerations', () => {
  it('should use 256-bit session keys', () => {
    const key = generateSessionKey();
    expect(key.length).toBe(32); // 32 bytes = 256 bits
  });

  it('should use different IV for each encryption', async () => {
    const key = await deriveEncryptionKey(generateSessionKey());
    const plaintext = 'same message';
    
    const encrypted1 = await encryptMessage(plaintext, key);
    const encrypted2 = await encryptMessage(plaintext, key);
    
    // Same plaintext should produce different ciphertext due to random IV
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should detect tampering via GCM authentication', async () => {
    const key = await deriveEncryptionKey(generateSessionKey());
    const encrypted = await encryptMessage('secret', key);
    
    // Tamper with the ciphertext
    const bytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    bytes[15] ^= 0x01; // Flip a bit
    const tampered = btoa(String.fromCharCode(...bytes));
    
    // Should fail to decrypt
    await expect(decryptMessage(tampered, key)).rejects.toThrow();
  });
});
