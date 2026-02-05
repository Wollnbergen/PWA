/**
 * Sultan Wallet - Inpage Provider
 * 
 * This script is injected into web pages and exposes window.sultan
 * for dApps to interact with the Sultan Wallet extension.
 * 
 * SECURITY:
 * - Provider is frozen to prevent tampering
 * - Input validation on all methods
 * - Size limits to prevent DoS
 * - No sensitive data exposed
 * 
 * Provider Interface (EIP-1193 inspired):
 * - connect(): Request wallet connection
 * - disconnect(): Disconnect wallet
 * - isConnected(): Check connection status
 * - getAddress(): Get connected address
 * - getPublicKey(): Get connected public key
 * - signMessage(message): Sign arbitrary message
 * - signTransaction(tx): Sign and optionally broadcast transaction
 * - on(event, handler): Subscribe to events
 * - off(event, handler): Unsubscribe from events
 */

(function() {
  'use strict';

  // Prevent double injection
  if (window.sultan) {
    // Silent in production
    return;
  }

  // Security: Freeze critical objects to prevent prototype pollution
  if (typeof Object.freeze === 'function') {
    // Already frozen by browser, but ensure our objects are too
  }

  const EXTENSION_ID = 'sultan-wallet';
  
  // Production mode - disable verbose logging
  const IS_PRODUCTION = true;
  const debugLog = (...args) => { if (!IS_PRODUCTION) console.log(...args); };
  const debugWarn = (...args) => { if (!IS_PRODUCTION) console.warn(...args); };
  
  // Security: Maximum event listeners per event (prevent memory leaks)
  const MAX_LISTENERS_PER_EVENT = 100;
  
  // Event emitter with security limits
  // Event emitter with security limits
  class EventEmitter {
    constructor() {
      this._events = {};
    }

    on(event, handler) {
      if (typeof event !== 'string' || typeof handler !== 'function') {
        throw new Error('Invalid event or handler');
      }
      if (!this._events[event]) {
        this._events[event] = [];
      }
      // Security: Limit number of listeners per event
      if (this._events[event].length >= MAX_LISTENERS_PER_EVENT) {
        debugWarn('[Sultan] Max listeners reached for event:', event);
        return this;
      }
      this._events[event].push(handler);
      return this;
    }

    off(event, handler) {
      if (!this._events[event]) return this;
      if (!handler) {
        delete this._events[event];
      } else {
        this._events[event] = this._events[event].filter(h => h !== handler);
      }
      return this;
    }

    emit(event, ...args) {
      if (!this._events[event]) return false;
      // Clone array to prevent modification during iteration
      const handlers = [...this._events[event]];
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (e) {
          console.error('[Sultan] Event handler error:', e);
        }
      });
      return true;
    }

    removeAllListeners() {
      this._events = {};
    }
  }

  // Request ID counter (use random base for unpredictability)
  let requestId = Math.floor(Math.random() * 1000000);
  const pendingRequests = new Map();
  
  // Security: Limit pending requests to prevent memory exhaustion
  const MAX_PENDING_REQUESTS = 50;

  // Connection state
  let connectedAccount = null;
  let isConnectedState = false;

  /**
   * Send message to content script (which forwards to background)
   */
  function sendMessage(method, params = {}) {
    return new Promise((resolve, reject) => {
      // Security: Limit pending requests
      if (pendingRequests.size >= MAX_PENDING_REQUESTS) {
        reject(new Error('Too many pending requests'));
        return;
      }
      
      const id = ++requestId;
      
      pendingRequests.set(id, { resolve, reject, createdAt: Date.now() });

      // Security: Use specific origin when possible
      const targetOrigin = window.location.origin || '*';
      
      window.postMessage({
        type: 'SULTAN_PROVIDER_REQUEST',
        id,
        method,
        params,
        source: EXTENSION_ID
      }, targetOrigin);

      // Timeout after 5 minutes (for user approval)
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 300000);
    });
  }

  /**
   * Handle responses from content script
   */
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'SULTAN_PROVIDER_RESPONSE') return;
    if (event.data.source !== EXTENSION_ID) return;

    const { id, result, error } = event.data;
    const pending = pendingRequests.get(id);
    
    if (pending) {
      pendingRequests.delete(id);
      if (error) {
        pending.reject(new Error(error.message || 'Unknown error'));
      } else {
        pending.resolve(result);
      }
    }
  });

  /**
   * Handle events from content script
   */
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'SULTAN_PROVIDER_EVENT') return;
    if (event.data.source !== EXTENSION_ID) return;

    const { eventName, payload } = event.data;
    debugLog('[Sultan Provider] Received event:', eventName, payload);
    
    // Update internal state
    switch (eventName) {
      case 'connect':
        isConnectedState = true;
        connectedAccount = payload;
        break;
      case 'disconnect':
        isConnectedState = false;
        connectedAccount = null;
        break;
      case 'accountChange':
        connectedAccount = payload;
        break;
    }
    
    // Emit to listeners (provider may not exist yet on first load)
    if (typeof provider !== 'undefined' && provider) {
      debugLog('[Sultan Provider] Emitting event:', eventName, 'listeners:', provider._events[eventName]?.length || 0);
      provider.emit(eventName, payload);
    } else {
      debugLog('[Sultan Provider] Provider not ready, cannot emit');
    }
  });

  /**
   * Sultan Provider
   */
  class SultanProvider extends EventEmitter {
    constructor() {
      super();
      this.isSultan = true;
      this.version = '1.0.0';
    }

    /**
     * Request wallet connection
     * Opens extension popup for user approval
     * @returns {Promise<{address: string, publicKey: string}>}
     */
    async connect() {
      const result = await sendMessage('connect');
      isConnectedState = true;
      connectedAccount = result;
      this.emit('connect', result);
      return result;
    }

    /**
     * Disconnect wallet
     * @returns {Promise<void>}
     */
    async disconnect() {
      await sendMessage('disconnect');
      isConnectedState = false;
      connectedAccount = null;
      this.emit('disconnect');
    }

    /**
     * Check if wallet is connected
     * @returns {boolean}
     */
    isConnected() {
      return isConnectedState;
    }

    /**
     * Get connected address
     * @returns {Promise<string|null>}
     */
    async getAddress() {
      if (!isConnectedState) return null;
      return connectedAccount?.address || null;
    }

    /**
     * Get connected public key
     * @returns {Promise<string|null>}
     */
    async getPublicKey() {
      if (!isConnectedState) return null;
      return connectedAccount?.publicKey || null;
    }

    /**
     * Get connected accounts (returns array for compatibility)
     * @returns {Promise<Array<{address: string, publicKey: string}>>}
     */
    async getAccounts() {
      if (!isConnectedState || !connectedAccount) return [];
      return [connectedAccount];
    }

    /**
     * Get chain/network info (alias for getNetwork)
     * @returns {Promise<{chainId: string, name: string, rpcUrl: string}>}
     */
    async getChainInfo() {
      return this.getNetwork();
    }

    /**
     * Get account balance
     * @returns {Promise<{available: string, staked: string, rewards: string}>}
     */
    async getBalance() {
      if (!isConnectedState) {
        throw new Error('Wallet not connected');
      }
      return sendMessage('getBalance');
    }

    /**
     * Sign arbitrary message
     * Opens extension popup for user approval
     * @param {string|Uint8Array} message - Message to sign
     * @returns {Promise<{signature: string, publicKey: string}>}
     */
    async signMessage(message) {
      if (!isConnectedState) {
        throw new Error('Wallet not connected');
      }
      
      // Security: Validate input
      if (message === null || message === undefined) {
        throw new Error('Message cannot be empty');
      }
      
      // Convert Uint8Array to hex if needed
      let messageHex;
      if (message instanceof Uint8Array) {
        // Security: Limit message size (1MB)
        if (message.length > 1024 * 1024) {
          throw new Error('Message too large (max 1MB)');
        }
        messageHex = Array.from(message).map(b => b.toString(16).padStart(2, '0')).join('');
      } else if (typeof message === 'string') {
        // Security: Limit message size (1MB)
        if (message.length > 1024 * 1024) {
          throw new Error('Message too large (max 1MB)');
        }
        // Encode string as UTF-8 then to hex
        const encoder = new TextEncoder();
        const bytes = encoder.encode(message);
        messageHex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      } else {
        throw new Error('Message must be string or Uint8Array');
      }

      return sendMessage('signMessage', { message: messageHex });
    }

    /**
     * Sign a transaction
     * Opens extension popup for user approval
     * @param {object} transaction - Transaction object
     * @param {object} [options] - Options (broadcast: boolean)
     * @returns {Promise<{signature: string, publicKey: string, txHash?: string}>}
     */
    async signTransaction(transaction, options = {}) {
      if (!isConnectedState) {
        throw new Error('Wallet not connected');
      }

      // Security: Validate transaction object
      if (!transaction || typeof transaction !== 'object') {
        throw new Error('Transaction must be an object');
      }
      
      // Security: Limit transaction size (prevent DoS)
      const txJson = JSON.stringify(transaction);
      if (txJson.length > 100 * 1024) { // 100KB limit
        throw new Error('Transaction too large');
      }
      
      // Security: Validate required fields for known types
      if (transaction.type === 'send') {
        if (!transaction.to || typeof transaction.to !== 'string') {
          throw new Error('Send transaction requires valid "to" address');
        }
        if (transaction.amount !== undefined && typeof transaction.amount !== 'string' && typeof transaction.amount !== 'number') {
          throw new Error('Invalid amount type');
        }
      }

      // Support both signTransaction(tx, {broadcast: true}) and signTransaction(tx, true)
      const broadcast = typeof options === 'boolean' ? options : (options.broadcast || false);

      // Default type to 'send' if not specified and has 'to' field
      if (!transaction.type && transaction.to) {
        transaction.type = 'send';
      }

      return sendMessage('signTransaction', { transaction, broadcast });
    }

    /**
     * Sign and broadcast a transaction
     * Convenience wrapper for signTransaction with broadcast=true
     * @param {object} transaction - Transaction object
     * @returns {Promise<{signature: string, publicKey: string, txHash: string}>}
     */
    async sendTransaction(transaction) {
      return this.signTransaction(transaction, true);
    }

    /**
     * Request to add a custom token to the wallet
     * @param {object} token - Token details
     * @returns {Promise<boolean>}
     */
    async addToken(token) {
      if (!token.denom || !token.symbol) {
        throw new Error('Token must have denom and symbol');
      }
      return sendMessage('addToken', { token });
    }

    /**
     * Get network information
     * @returns {Promise<{chainId: string, name: string, rpcUrl: string}>}
     */
    async getNetwork() {
      return sendMessage('getNetwork');
    }

    /**
     * Get staking information for the connected wallet
     * @returns {Promise<{address: string, staked: string, pendingRewards: string, stakingAPY: number, validator?: string}>}
     */
    async getStakingInfo() {
      if (!isConnectedState) {
        throw new Error('Wallet not connected');
      }
      return sendMessage('getStakingInfo');
    }

    /**
     * Get list of available validators
     * @returns {Promise<Array<{address: string, name: string, totalStaked: string, commission: number, uptime: number, status: string}>>}
     */
    async getValidators() {
      return sendMessage('getValidators');
    }

    /**
     * Stake tokens to a validator
     * Opens extension popup for user approval
     * @param {string} validatorAddress - The validator address to stake to
     * @param {string} amount - Amount in base units (atomic)
     * @returns {Promise<{signature: string, publicKey: string, txHash: string}>}
     */
    async stake(validatorAddress, amount) {
      if (!isConnectedState) {
        throw new Error('Wallet not connected');
      }

      // Security: Validate inputs
      if (!validatorAddress || typeof validatorAddress !== 'string') {
        throw new Error('Invalid validator address');
      }
      if (!amount || (typeof amount !== 'string' && typeof amount !== 'number')) {
        throw new Error('Invalid amount');
      }

      const transaction = {
        type: 'stake',
        to: validatorAddress,
        amount: String(amount),
      };

      return sendMessage('signTransaction', { transaction, broadcast: true });
    }

    /**
     * Unstake tokens from a validator
     * Opens extension popup for user approval
     * @param {string} validatorAddress - The validator address to unstake from
     * @param {string} amount - Amount in base units (atomic)
     * @returns {Promise<{signature: string, publicKey: string, txHash: string}>}
     */
    async unstake(validatorAddress, amount) {
      if (!isConnectedState) {
        throw new Error('Wallet not connected');
      }

      // Security: Validate inputs
      if (!validatorAddress || typeof validatorAddress !== 'string') {
        throw new Error('Invalid validator address');
      }
      if (!amount || (typeof amount !== 'string' && typeof amount !== 'number')) {
        throw new Error('Invalid amount');
      }

      const transaction = {
        type: 'unstake',
        to: validatorAddress,
        amount: String(amount),
      };

      return sendMessage('signTransaction', { transaction, broadcast: true });
    }

    /**
     * Claim staking rewards
     * Opens extension popup for user approval
     * @param {string} [validatorAddress] - Optional specific validator, or all if not specified
     * @returns {Promise<{signature: string, publicKey: string, txHash: string}>}
     */
    async claimRewards(validatorAddress) {
      if (!isConnectedState) {
        throw new Error('Wallet not connected');
      }

      const transaction = {
        type: 'claimRewards',
        to: validatorAddress || '',
      };

      return sendMessage('signTransaction', { transaction, broadcast: true });
    }

    /**
     * Check connection status with background (useful on page load)
     * @returns {Promise<{connected: boolean, address?: string, publicKey?: string}>}
     */
    async checkConnection() {
      try {
        const result = await sendMessage('checkConnection');
        if (result && result.connected) {
          isConnectedState = true;
          connectedAccount = { address: result.address, publicKey: result.publicKey };
          return result;
        }
      } catch (e) {
        // Not connected or extension not available
      }
      isConnectedState = false;
      connectedAccount = null;
      return { connected: false };
    }

    /**
     * Check if extension is installed and available
     * @returns {boolean}
     */
    static isAvailable() {
      return typeof window.sultan !== 'undefined' && window.sultan.isSultan === true;
    }
  }

  // Create provider instance
  const provider = new SultanProvider();
  
  // Security: Freeze provider to prevent tampering
  // This prevents malicious scripts from modifying the provider
  Object.freeze(provider);
  Object.freeze(SultanProvider.prototype);

  // Expose on window with maximum protection
  Object.defineProperty(window, 'sultan', {
    value: provider,
    writable: false,
    configurable: false,
    enumerable: true
  });

  // Announce availability
  window.dispatchEvent(new CustomEvent('sultan#initialized'));
  
  debugLog('[Sultan] Wallet provider injected v' + provider.version);

  // Check existing connection on load (delay to let content script initialize)
  setTimeout(async () => {
    try {
      const result = await provider.checkConnection();
      if (result.connected) {
        debugLog('[Sultan] Restored connection:', result.address);
        provider.emit('connect', { address: result.address, publicKey: result.publicKey });
      }
    } catch (e) {
      debugLog('[Sultan] No existing connection');
    }
  }, 500);
})();
