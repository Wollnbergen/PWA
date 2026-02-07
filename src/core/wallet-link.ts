/**
 * Sultan WalletLink - Mobile PWA to Desktop dApp Connection
 * 
 * This module enables the PWA wallet (wallet.sltn.io) to connect to dApps
 * on desktop browsers via QR code scanning. Similar to WalletConnect but
 * simpler and Sultan-specific.
 * 
 * Flow:
 * 1. Desktop dApp generates session with QR code
 * 2. Mobile user scans QR with PWA wallet camera
 * 3. WebSocket relay connects both parties
 * 4. dApp sends signing requests, wallet responds with signatures
 * 
 * Security:
 * - AES-256-GCM end-to-end encryption
 * - HKDF key derivation from session key
 * - Random 12-byte IV per message
 * - Session expires after inactivity
 * - User must approve each signing request
 */

import {
  deriveEncryptionKey,
  encryptMessage,
  decryptMessage,
  generateSessionId,
  generateSessionKey,
  encodeSessionKey,
  decodeSessionKey,
} from './walletlink-crypto';

// Relay server URLs
// Primary: Fly.io deployment
// Fallback: Custom domain via relay.sltn.io CNAME pointing to the same
const RELAY_URL = 'wss://sultan-walletlink-relay.fly.dev';
const RELAY_URL_DEV = 'wss://localhost:8765';

// Session storage key for persistence
const SESSION_STORAGE_KEY = 'sultan_walletlink_session';

// Message types for the relay protocol
export enum MessageType {
  // Session lifecycle
  SESSION_INIT = 'session_init',
  SESSION_JOIN = 'session_join',
  SESSION_ACK = 'session_ack',
  SESSION_END = 'session_end',
  HEARTBEAT = 'heartbeat',
  
  // dApp requests (from desktop to mobile)
  CONNECT_REQUEST = 'connect_request',
  SIGN_MESSAGE_REQUEST = 'sign_message_request',
  SIGN_TX_REQUEST = 'sign_tx_request',
  
  // Wallet responses (from mobile to desktop)
  CONNECT_RESPONSE = 'connect_response',
  SIGN_MESSAGE_RESPONSE = 'sign_message_response',
  SIGN_TX_RESPONSE = 'sign_tx_response',
  
  // Errors
  ERROR = 'error',
}

export interface WalletLinkSession {
  sessionId: string;
  sessionKey: Uint8Array;
  bridgeUrl: string;
  isConnected: boolean;
  peerAddress?: string;
  createdAt: number;
  lastActivity: number;
}

export interface RelayMessage {
  type: MessageType;
  sessionId: string;
  payload: any;
  timestamp: number;
  signature?: string;
}

export interface SignRequest {
  id: string;
  type: 'message' | 'transaction';
  data: any;
  origin: string;
  timestamp: number;
}

export type WalletLinkEventHandler = (event: WalletLinkEvent) => void;

export interface WalletLinkEvent {
  type: 'connected' | 'disconnected' | 'request' | 'error';
  data?: any;
}

/**
 * WalletLink Client for the PWA wallet side
 * Handles incoming requests from desktop dApps
 */
export class WalletLinkClient {
  private ws: WebSocket | null = null;
  private session: WalletLinkSession | null = null;
  private encryptionKey: CryptoKey | null = null;
  private pendingRequests: Map<string, SignRequest> = new Map();
  private eventHandlers: Set<WalletLinkEventHandler> = new Set();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(private isDev = false) {}

  /**
   * Connect to a session by scanning QR code data
   * QR contains: sultan://wl?s=<sessionId>&k=<base64Key>&b=<bridgeUrl>
   */
  async connectFromQR(qrData: string): Promise<boolean> {
    try {
      const parsed = this.parseQRData(qrData);
      if (!parsed) {
        throw new Error('Invalid QR code format');
      }

      const sessionKey = decodeSessionKey(parsed.key);

      this.session = {
        sessionId: parsed.sessionId,
        sessionKey,
        bridgeUrl: parsed.bridgeUrl || (this.isDev ? RELAY_URL_DEV : RELAY_URL),
        isConnected: false,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };

      // Derive AES-256-GCM encryption key from session key
      this.encryptionKey = await deriveEncryptionKey(sessionKey);

      await this.connect();
      this.persistSession();
      return true;
    } catch (error) {
      console.error('[WalletLink] Connection error:', error);
      this.emit({ type: 'error', data: error });
      return false;
    }
  }

  /**
   * Parse QR code data into session parameters
   */
  private parseQRData(data: string): { sessionId: string; key: string; bridgeUrl?: string } | null {
    try {
      // Format: sultan://wl?s=<sessionId>&k=<key>&b=<bridgeUrl>
      const url = new URL(data);
      if (url.protocol !== 'sultan:' || url.hostname !== 'wl') {
        return null;
      }

      const sessionId = url.searchParams.get('s');
      const key = url.searchParams.get('k');
      const bridgeUrl = url.searchParams.get('b') || undefined;

      if (!sessionId || !key) {
        return null;
      }

      return { sessionId, key, bridgeUrl };
    } catch {
      return null;
    }
  }

  /**
   * Connect to relay WebSocket
   */
  private async connect(): Promise<void> {
    if (!this.session) {
      throw new Error('No session configured');
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.session!.bridgeUrl);

      this.ws.onopen = async () => {
        console.log('[WalletLink] WebSocket connected');
        await this.sendJoinSession();
        this.startHeartbeat();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data).catch(e => {
          console.error('[WalletLink] Message handling error:', e);
        });
      };

      this.ws.onerror = (error) => {
        console.error('[WalletLink] WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('[WalletLink] WebSocket closed');
        this.stopHeartbeat();
        if (this.session?.isConnected) {
          this.attemptReconnect();
        }
      };
    });
  }

  /**
   * Send join session message to relay
   */
  private async sendJoinSession(): Promise<void> {
    if (!this.session || !this.ws) return;

    const message: RelayMessage = {
      type: MessageType.SESSION_JOIN,
      sessionId: this.session.sessionId,
      payload: { role: 'wallet' },
      timestamp: Date.now(),
    };

    const encrypted = await this.encrypt(JSON.stringify(message));
    this.ws.send(encrypted);
  }

  /**
   * Handle incoming relay messages
   */
  private async handleMessage(data: string): Promise<void> {
    try {
      const decrypted = await this.decrypt(data);
      const message: RelayMessage = JSON.parse(decrypted);

      this.updateActivity();

      switch (message.type) {
        case MessageType.SESSION_ACK:
          this.session!.isConnected = true;
          this.emit({ type: 'connected' });
          break;

        case MessageType.CONNECT_REQUEST:
          this.handleConnectRequest(message);
          break;

        case MessageType.SIGN_MESSAGE_REQUEST:
          this.handleSignMessageRequest(message);
          break;

        case MessageType.SIGN_TX_REQUEST:
          this.handleSignTxRequest(message);
          break;

        case MessageType.SESSION_END:
          this.disconnect();
          break;

        case MessageType.ERROR:
          this.emit({ type: 'error', data: message.payload });
          break;
      }
    } catch (error) {
      console.error('[WalletLink] Message handling error:', error);
    }
  }

  /**
   * Handle connection request from dApp
   */
  private handleConnectRequest(message: RelayMessage): void {
    const request: SignRequest = {
      id: message.payload.requestId || crypto.randomUUID(),
      type: 'message',
      data: {
        action: 'connect',
        origin: message.payload.origin,
        name: message.payload.dAppName,
        icon: message.payload.dAppIcon,
      },
      origin: message.payload.origin,
      timestamp: Date.now(),
    };

    this.pendingRequests.set(request.id, request);
    this.emit({ type: 'request', data: request });
  }

  /**
   * Handle sign message request from dApp
   */
  private handleSignMessageRequest(message: RelayMessage): void {
    const request: SignRequest = {
      id: message.payload.requestId || crypto.randomUUID(),
      type: 'message',
      data: {
        action: 'signMessage',
        message: message.payload.message,
        origin: message.payload.origin,
      },
      origin: message.payload.origin,
      timestamp: Date.now(),
    };

    this.pendingRequests.set(request.id, request);
    this.emit({ type: 'request', data: request });
  }

  /**
   * Handle sign transaction request from dApp
   */
  private handleSignTxRequest(message: RelayMessage): void {
    const request: SignRequest = {
      id: message.payload.requestId || crypto.randomUUID(),
      type: 'transaction',
      data: {
        action: 'signTransaction',
        transaction: message.payload.transaction,
        origin: message.payload.origin,
      },
      origin: message.payload.origin,
      timestamp: Date.now(),
    };

    this.pendingRequests.set(request.id, request);
    this.emit({ type: 'request', data: request });
  }

  /**
   * Approve a pending request (called after user confirmation)
   */
  async approveRequest(requestId: string, response: any): Promise<void> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    let messageType: MessageType;
    switch (request.data.action) {
      case 'connect':
        messageType = MessageType.CONNECT_RESPONSE;
        break;
      case 'signMessage':
        messageType = MessageType.SIGN_MESSAGE_RESPONSE;
        break;
      case 'signTransaction':
        messageType = MessageType.SIGN_TX_RESPONSE;
        break;
      default:
        throw new Error('Unknown request type');
    }

    this.sendResponse(messageType, {
      requestId,
      approved: true,
      ...response,
    });

    this.pendingRequests.delete(requestId);
  }

  /**
   * Reject a pending request
   */
  rejectRequest(requestId: string, reason = 'User rejected'): void {
    const request = this.pendingRequests.get(requestId);
    if (!request) return;

    let messageType: MessageType;
    switch (request.data.action) {
      case 'connect':
        messageType = MessageType.CONNECT_RESPONSE;
        break;
      case 'signMessage':
        messageType = MessageType.SIGN_MESSAGE_RESPONSE;
        break;
      case 'signTransaction':
        messageType = MessageType.SIGN_TX_RESPONSE;
        break;
      default:
        return;
    }

    this.sendResponse(messageType, {
      requestId,
      approved: false,
      error: reason,
    });

    this.pendingRequests.delete(requestId);
  }

  /**
   * Send response back to dApp via relay
   */
  private async sendResponse(type: MessageType, payload: any): Promise<void> {
    if (!this.session || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[WalletLink] Cannot send response - not connected');
      return;
    }

    const message: RelayMessage = {
      type,
      sessionId: this.session.sessionId,
      payload,
      timestamp: Date.now(),
    };

    const encrypted = await this.encrypt(JSON.stringify(message));
    this.ws.send(encrypted);
  }

  /**
   * Disconnect from session
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      if (this.session) {
        const message: RelayMessage = {
          type: MessageType.SESSION_END,
          sessionId: this.session.sessionId,
          payload: {},
          timestamp: Date.now(),
        };
        try {
          const encrypted = await this.encrypt(JSON.stringify(message));
          this.ws.send(encrypted);
        } catch {
          // Ignore send errors during disconnect
        }
      }
      this.ws.close();
      this.ws = null;
    }

    this.stopHeartbeat();
    this.clearStoredSession();
    this.session = null;
    this.encryptionKey = null;
    this.pendingRequests.clear();
    this.reconnectAttempts = 0;
    this.emit({ type: 'disconnected' });
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      if (this.ws?.readyState === WebSocket.OPEN && this.session) {
        const message: RelayMessage = {
          type: MessageType.HEARTBEAT,
          sessionId: this.session.sessionId,
          payload: {},
          timestamp: Date.now(),
        };
        try {
          const encrypted = await this.encrypt(JSON.stringify(message));
          this.ws.send(encrypted);
        } catch (e) {
          console.error('[WalletLink] Heartbeat encryption error:', e);
        }
      }
    }, 30000);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Attempt to reconnect after disconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WalletLink] Max reconnect attempts reached');
      this.disconnect();
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    setTimeout(() => {
      console.log(`[WalletLink] Reconnecting... attempt ${this.reconnectAttempts}`);
      this.connect().catch(() => {
        this.attemptReconnect();
      });
    }, delay);
  }

  /**
   * Update last activity timestamp
   */
  private updateActivity(): void {
    if (this.session) {
      this.session.lastActivity = Date.now();
      this.persistSession();
    }
  }

  /**
   * Persist session to localStorage for reconnection after page refresh
   */
  private persistSession(): void {
    if (!this.session) return;
    
    try {
      const sessionData = {
        sessionId: this.session.sessionId,
        sessionKey: encodeSessionKey(this.session.sessionKey),
        bridgeUrl: this.session.bridgeUrl,
        peerAddress: this.session.peerAddress,
        createdAt: this.session.createdAt,
        lastActivity: this.session.lastActivity,
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (e) {
      console.warn('[WalletLink] Failed to persist session:', e);
    }
  }

  /**
   * Restore session from localStorage
   */
  async restoreSession(): Promise<boolean> {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored) return false;

      const sessionData = JSON.parse(stored);
      
      // Check if session is still valid (less than 10 minutes old)
      const maxAge = 10 * 60 * 1000;
      if (Date.now() - sessionData.lastActivity > maxAge) {
        this.clearStoredSession();
        return false;
      }

      this.session = {
        sessionId: sessionData.sessionId,
        sessionKey: decodeSessionKey(sessionData.sessionKey),
        bridgeUrl: sessionData.bridgeUrl,
        isConnected: false,
        peerAddress: sessionData.peerAddress,
        createdAt: sessionData.createdAt,
        lastActivity: sessionData.lastActivity,
      };

      // Derive encryption key
      this.encryptionKey = await deriveEncryptionKey(this.session.sessionKey);

      // Attempt to reconnect
      await this.connect();
      return true;
    } catch (e) {
      console.warn('[WalletLink] Failed to restore session:', e);
      this.clearStoredSession();
      return false;
    }
  }

  /**
   * Clear stored session
   */
  private clearStoredSession(): void {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Encrypt message with AES-256-GCM
   */
  private async encrypt(data: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }
    return encryptMessage(data, this.encryptionKey);
  }

  /**
   * Decrypt message with AES-256-GCM
   */
  private async decrypt(data: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }
    return decryptMessage(data, this.encryptionKey);
  }

  /**
   * Add event handler
   */
  on(handler: WalletLinkEventHandler): void {
    this.eventHandlers.add(handler);
  }

  /**
   * Remove event handler
   */
  off(handler: WalletLinkEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  /**
   * Emit event to all handlers
   */
  private emit(event: WalletLinkEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('[WalletLink] Event handler error:', error);
      }
    });
  }

  /**
   * Get current session info
   */
  getSession(): WalletLinkSession | null {
    return this.session;
  }

  /**
   * Get pending requests
   */
  getPendingRequests(): SignRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.session?.isConnected ?? false;
  }
}

/**
 * WalletLink Session Generator for dApps
 * Creates sessions that mobile wallets can join
 */
export class WalletLinkSessionGenerator {
  private ws: WebSocket | null = null;
  private session: WalletLinkSession | null = null;
  private encryptionKey: CryptoKey | null = null;
  private eventHandlers: Set<WalletLinkEventHandler> = new Set();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private bridgeUrl = RELAY_URL) {}

  /**
   * Generate a new session and get QR data
   */
  async createSession(): Promise<{ qrData: string; sessionId: string }> {
    // Generate session ID and key using crypto module
    const sessionId = generateSessionId();
    const sessionKey = generateSessionKey();

    this.session = {
      sessionId,
      sessionKey,
      bridgeUrl: this.bridgeUrl,
      isConnected: false,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    // Derive AES-256-GCM encryption key
    this.encryptionKey = await deriveEncryptionKey(sessionKey);

    // Connect to relay and initialize session
    await this.connect();

    // Generate QR code data with encoded key
    const keyBase64 = encodeSessionKey(sessionKey);
    const qrData = `sultan://wl?s=${sessionId}&k=${encodeURIComponent(keyBase64)}&b=${encodeURIComponent(this.bridgeUrl)}`;

    return { qrData, sessionId };
  }

  /**
   * Connect to relay WebSocket
   */
  private async connect(): Promise<void> {
    if (!this.session) {
      throw new Error('No session configured');
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.bridgeUrl);

      this.ws.onopen = async () => {
        console.log('[WalletLink dApp] WebSocket connected');
        await this.sendInitSession();
        this.startHeartbeat();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data).catch(e => {
          console.error('[WalletLink dApp] Message handling error:', e);
        });
      };

      this.ws.onerror = (error) => {
        console.error('[WalletLink dApp] WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('[WalletLink dApp] WebSocket closed');
        this.stopHeartbeat();
        this.emit({ type: 'disconnected' });
      };
    });
  }

  /**
   * Send session init message to relay
   */
  private async sendInitSession(): Promise<void> {
    if (!this.session || !this.ws) return;

    const message: RelayMessage = {
      type: MessageType.SESSION_INIT,
      sessionId: this.session.sessionId,
      payload: { role: 'dapp' },
      timestamp: Date.now(),
    };

    const encrypted = await this.encrypt(JSON.stringify(message));
    this.ws.send(encrypted);
  }

  /**
   * Handle incoming relay messages
   */
  private async handleMessage(data: string): Promise<void> {
    try {
      const decrypted = await this.decrypt(data);
      const message: RelayMessage = JSON.parse(decrypted);

      switch (message.type) {
        case MessageType.SESSION_ACK:
          if (message.payload?.walletConnected) {
            this.session!.isConnected = true;
            this.session!.peerAddress = message.payload.address;
            this.emit({ 
              type: 'connected', 
              data: { address: message.payload.address } 
            });
          }
          break;

        case MessageType.CONNECT_RESPONSE:
        case MessageType.SIGN_MESSAGE_RESPONSE:
        case MessageType.SIGN_TX_RESPONSE:
          this.emit({ type: 'request', data: message.payload });
          break;

        case MessageType.SESSION_END:
          this.disconnect();
          break;

        case MessageType.ERROR:
          this.emit({ type: 'error', data: message.payload });
          break;
      }
    } catch (error) {
      console.error('[WalletLink dApp] Message handling error:', error);
    }
  }

  /**
   * Request wallet connection
   */
  async requestConnect(dAppInfo: { name: string; icon?: string; origin: string }): Promise<void> {
    const message: RelayMessage = {
      type: MessageType.CONNECT_REQUEST,
      sessionId: this.session!.sessionId,
      payload: {
        requestId: crypto.randomUUID(),
        dAppName: dAppInfo.name,
        dAppIcon: dAppInfo.icon,
        origin: dAppInfo.origin,
      },
      timestamp: Date.now(),
    };

    const encrypted = await this.encrypt(JSON.stringify(message));
    this.ws?.send(encrypted);
  }

  /**
   * Request message signature
   */
  async requestSignMessage(message: string): Promise<void> {
    const relayMessage: RelayMessage = {
      type: MessageType.SIGN_MESSAGE_REQUEST,
      sessionId: this.session!.sessionId,
      payload: {
        requestId: crypto.randomUUID(),
        message,
        origin: window.location.origin,
      },
      timestamp: Date.now(),
    };

    const encrypted = await this.encrypt(JSON.stringify(relayMessage));
    this.ws?.send(encrypted);
  }

  /**
   * Request transaction signature
   */
  async requestSignTransaction(transaction: any): Promise<void> {
    const relayMessage: RelayMessage = {
      type: MessageType.SIGN_TX_REQUEST,
      sessionId: this.session!.sessionId,
      payload: {
        requestId: crypto.randomUUID(),
        transaction,
        origin: window.location.origin,
      },
      timestamp: Date.now(),
    };

    const encrypted = await this.encrypt(JSON.stringify(relayMessage));
    this.ws?.send(encrypted);
  }

  /**
   * Disconnect session
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      if (this.session) {
        const message: RelayMessage = {
          type: MessageType.SESSION_END,
          sessionId: this.session.sessionId,
          payload: {},
          timestamp: Date.now(),
        };
        try {
          const encrypted = await this.encrypt(JSON.stringify(message));
          this.ws.send(encrypted);
        } catch {
          // Ignore send errors during disconnect
        }
      }
      this.ws.close();
      this.ws = null;
    }

    this.stopHeartbeat();
    this.session = null;
    this.encryptionKey = null;
    this.emit({ type: 'disconnected' });
  }

  /**
   * Encrypt message with AES-256-GCM
   */
  private async encrypt(data: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }
    return encryptMessage(data, this.encryptionKey);
  }

  /**
   * Decrypt message with AES-256-GCM
   */
  private async decrypt(data: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }
    return decryptMessage(data, this.encryptionKey);
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      if (this.ws?.readyState === WebSocket.OPEN && this.session) {
        const message: RelayMessage = {
          type: MessageType.HEARTBEAT,
          sessionId: this.session.sessionId,
          payload: {},
          timestamp: Date.now(),
        };
        try {
          const encrypted = await this.encrypt(JSON.stringify(message));
          this.ws.send(encrypted);
        } catch (e) {
          console.error('[WalletLink dApp] Heartbeat encryption error:', e);
        }
      }
    }, 30000);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Add event handler
   */
  on(handler: WalletLinkEventHandler): void {
    this.eventHandlers.add(handler);
  }

  /**
   * Remove event handler
   */
  off(handler: WalletLinkEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  /**
   * Emit event
   */
  private emit(event: WalletLinkEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('[WalletLink dApp] Event handler error:', error);
      }
    });
  }

  /**
   * Get current session
   */
  getSession(): WalletLinkSession | null {
    return this.session;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.session?.isConnected ?? false;
  }
}

/**
 * Helper: Check if device has camera (for QR scanning)
 */
export async function hasCamera(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device => device.kind === 'videoinput');
  } catch {
    return false;
  }
}

/**
 * Helper: Check if running on mobile device
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
