/**
 * Sultan Wallet - Content Script
 * 
 * This script runs in the context of web pages and acts as a bridge
 * between the inpage provider (window.sultan) and the background service worker.
 * 
 * SECURITY:
 * - Validates all messages from page
 * - Rate limits requests
 * - Verifies extension context
 * 
 * Message flow:
 * dApp → inpage-provider.js → content-script.js → background.js → popup
 */

(function() {
  'use strict';

  const EXTENSION_ID = 'sultan-wallet';
  
  // Version stamp for debugging cache issues
  const CONTENT_SCRIPT_VERSION = '2.0.0-staking';
  console.log('[Sultan Content] Loaded version:', CONTENT_SCRIPT_VERSION);
  
  // Production mode - disable verbose logging
  const IS_PRODUCTION = true;
  const debugLog = (...args) => { if (!IS_PRODUCTION) console.log(...args); };
  const debugWarn = (...args) => { if (!IS_PRODUCTION) console.warn(...args); };
  
  // Security: Rate limiting (100 requests per minute)
  const REQUEST_LIMIT = 100;
  const REQUEST_WINDOW_MS = 60000;
  let requestTimestamps = [];
  
  function isRateLimited() {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter(ts => ts > now - REQUEST_WINDOW_MS);
    if (requestTimestamps.length >= REQUEST_LIMIT) {
      debugWarn('[Sultan Content] Rate limit exceeded');
      return true;
    }
    requestTimestamps.push(now);
    return false;
  }
  
  // Security: Allowed RPC methods (whitelist)
  const ALLOWED_METHODS = Object.freeze([
    'connect', 'disconnect', 'checkConnection',
    'getBalance', 'signMessage', 'signTransaction',
    'addToken', 'getNetwork', 'getStakingInfo', 'getValidators'
  ]);

  /**
   * Security: Validate message structure strictly
   */
  function isValidMessage(data) {
    // Type checks
    if (!data || typeof data !== 'object') return false;
    if (typeof data.id !== 'number' || !Number.isInteger(data.id) || data.id < 0) return false;
    if (typeof data.method !== 'string') return false;
    if (!ALLOWED_METHODS.includes(data.method)) return false;
    if (data.params !== undefined && data.params !== null && typeof data.params !== 'object') return false;
    if (data.source !== EXTENSION_ID) return false;
    
    // Limit message size (prevent DoS)
    const messageSize = JSON.stringify(data).length;
    if (messageSize > 1024 * 100) { // 100KB max
      debugWarn('[Sultan Content] Message too large:', messageSize);
      return false;
    }
    
    return true;
  }

  /**
   * Inject the inpage provider script into the page
   * This makes window.sultan available to dApps
   */
  function injectProvider() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inpage-provider.js');
      script.type = 'text/javascript';
      
      // Security: Set nonce if CSP requires it
      const nonce = document.querySelector('script[nonce]')?.nonce;
      if (nonce) {
        script.nonce = nonce;
      }
      
      script.onload = function() {
        this.remove();
      };
      
      // Inject as early as possible
      const container = document.head || document.documentElement;
      container.insertBefore(script, container.firstChild);
    } catch (error) {
      console.error('[Sultan Content] Failed to inject provider:', error);
    }
  }

  /**
   * Listen for messages from the inpage provider
   */
  window.addEventListener('message', async (event) => {
    // Only accept messages from same window
    if (event.source !== window) return;
    
    // Check message format
    if (!event.data || event.data.type !== 'SULTAN_PROVIDER_REQUEST') return;
    if (event.data.source !== EXTENSION_ID) return;

    const { id, method, params } = event.data;
    
    // Security: Rate limiting
    if (isRateLimited()) {
      window.postMessage({
        type: 'SULTAN_PROVIDER_RESPONSE',
        id,
        error: { message: 'Rate limit exceeded. Please slow down.' },
        source: EXTENSION_ID
      }, window.location.origin);
      return;
    }
    
    // Security: Validate message structure
    if (!isValidMessage(event.data)) {
      debugWarn('[Sultan Content] Invalid message rejected:', method);
      window.postMessage({
        type: 'SULTAN_PROVIDER_RESPONSE',
        id,
        error: { message: 'Invalid request' },
        source: EXTENSION_ID
      }, window.location.origin);
      return;
    }

    try {
      // Forward to background service worker
      const response = await chrome.runtime.sendMessage({
        type: 'SULTAN_RPC_REQUEST',
        id,
        method,
        params,
        origin: window.location.origin,
        href: window.location.href
      });

      // Send response back to inpage provider (use specific origin, not '*')
      window.postMessage({
        type: 'SULTAN_PROVIDER_RESPONSE',
        id,
        result: response.result,
        error: response.error,
        source: EXTENSION_ID
      }, window.location.origin);
    } catch (error) {
      // Handle extension context invalidation
      window.postMessage({
        type: 'SULTAN_PROVIDER_RESPONSE',
        id,
        error: { message: error.message || 'Extension communication failed' },
        source: EXTENSION_ID
      }, window.location.origin);
    }
  });

  /**
   * Listen for events from background service worker
   * Security: Verify sender is our extension
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Security: Only accept messages from our own extension
    if (sender.id !== chrome.runtime.id) {
      debugWarn('[Sultan Content] Rejected message from unknown sender:', sender.id);
      return;
    }
    
    if (message.type === 'SULTAN_PROVIDER_EVENT') {
      debugLog('[Sultan Content] Received event from background:', message.eventName, message.payload);
      // Forward event to inpage provider (use specific origin)
      window.postMessage({
        type: 'SULTAN_PROVIDER_EVENT',
        eventName: message.eventName,
        payload: message.payload,
        source: EXTENSION_ID
      }, window.location.origin);
      sendResponse({ received: true });
    }
    
    // Return true to indicate we may respond asynchronously
    return true;
  });

  /**
   * Notify background that content script is ready
   */
  function notifyReady() {
    try {
      chrome.runtime.sendMessage({
        type: 'SULTAN_CONTENT_READY',
        origin: window.location.origin,
        href: window.location.href
      }).catch(() => {
        // Ignore errors during page load
      });
    } catch (e) {
      // Extension context may not be ready yet
    }
  }

  /**
   * Detect and report system color scheme to background
   * This enables dynamic icon switching based on light/dark mode
   */
  function setupColorSchemeDetection() {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    function reportColorScheme(isDark) {
      try {
        chrome.runtime.sendMessage({
          type: 'SYSTEM_COLOR_SCHEME_CHANGED',
          colorScheme: isDark ? 'dark' : 'light'
        }).catch(() => {
          // Ignore errors
        });
      } catch (e) {
        // Extension context may not be ready
      }
    }
    
    // Report initial state
    reportColorScheme(darkModeQuery.matches);
    
    // Listen for changes
    darkModeQuery.addEventListener('change', (e) => {
      reportColorScheme(e.matches);
    });
  }

  // Inject provider immediately
  injectProvider();
  
  // Setup color scheme detection
  setupColorSchemeDetection();
  
  // Notify background when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', notifyReady);
  } else {
    notifyReady();
  }

})();
