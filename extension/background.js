/**
 * Sultan Wallet - Background Service Worker
 * 
 * Handles:
 * - Message routing between content scripts and popup
 * - Connection state management
 * - Pending approval queue
 * - RPC communication with Sultan node
 * - Dynamic icon switching based on system color scheme
 * 
 * Cross-browser compatible: Chrome (MV3) and Firefox (MV2)
 */

// =====================================================
// Cross-browser compatibility layer
// =====================================================

// Detect browser type
const IS_FIREFOX = typeof browser !== 'undefined' && browser.runtime?.id;
const IS_CHROME = typeof chrome !== 'undefined' && chrome.runtime?.id && !IS_FIREFOX;

// Use appropriate API namespace
const browserAPI = IS_FIREFOX ? browser : chrome;

/**
 * Get the action/browserAction API (MV3 uses action, MV2 uses browserAction)
 */
function getActionAPI() {
  if (browserAPI.action) {
    return browserAPI.action;
  }
  if (browserAPI.browserAction) {
    return browserAPI.browserAction;
  }
  return null;
}

// Production RPC endpoints (HTTPS required)
const SULTAN_RPC_URLS = [
  'https://rpc.sltn.io',
  'https://api.sltn.io/rpc',
];
// Development fallback (only used if HTTPS fails)
const SULTAN_RPC_URL_DEV = 'http://206.189.224.142:8545';

/**
 * Get the best available RPC URL
 * Prefers HTTPS endpoints, falls back to HTTP only in dev
 */
async function getRpcUrl() {
  for (const url of SULTAN_RPC_URLS) {
    try {
      const response = await fetch(`${url}/status`, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      if (response.ok) return url;
    } catch {
      // Try next
    }
  }
  // Fallback to dev URL (console warning)
  debugWarn('[Sultan BG] HTTPS RPC unavailable, using HTTP fallback');
  return SULTAN_RPC_URL_DEV;
}

// =====================================================
// Security: Rate Limiting
// =====================================================

/**
 * Rate limiter for RPC requests per origin
 */
class RateLimiter {
  constructor(maxRequests = 60, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map(); // origin -> [timestamps]
  }

  /**
   * Check if request is allowed
   * @returns {boolean} true if allowed, false if rate limited
   */
  isAllowed(origin) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get or create request array for origin
    let originRequests = this.requests.get(origin) || [];
    
    // Filter to only requests within window
    originRequests = originRequests.filter(ts => ts > windowStart);
    
    if (originRequests.length >= this.maxRequests) {
      debugWarn('[Sultan BG] Rate limit exceeded for:', origin);
      return false;
    }
    
    // Add current request
    originRequests.push(now);
    this.requests.set(origin, originRequests);
    
    return true;
  }

  /**
   * Clean up old entries periodically
   */
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    for (const [origin, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter(ts => ts > windowStart);
      if (filtered.length === 0) {
        this.requests.delete(origin);
      } else {
        this.requests.set(origin, filtered);
      }
    }
  }
}

// Global rate limiter: 60 requests per minute per origin
const rateLimiter = new RateLimiter(60, 60000);

// Production mode - disable verbose logging
const IS_PRODUCTION = true;
function debugLog(...args) {
  if (!IS_PRODUCTION) console.log(...args);
}
function debugWarn(...args) {
  if (!IS_PRODUCTION) console.warn(...args);
}

// Cleanup rate limiter every 5 minutes
setInterval(() => rateLimiter.cleanup(), 300000);

// =====================================================
// Security: Nonce tracking for replay protection
// =====================================================

const usedNonces = new Set();
const NONCE_EXPIRY_MS = 300000; // 5 minutes

/**
 * Generate a secure nonce
 */
function generateNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if nonce is valid and mark as used
 */
function validateNonce(nonce) {
  if (!nonce || typeof nonce !== 'string' || nonce.length !== 32) {
    return false;
  }
  if (usedNonces.has(nonce)) {
    debugWarn('[Sultan BG] Replay attack detected - duplicate nonce');
    return false;
  }
  usedNonces.add(nonce);
  
  // Clean up old nonces periodically
  setTimeout(() => usedNonces.delete(nonce), NONCE_EXPIRY_MS);
  
  return true;
}

// =====================================================
// Security: Audit Logging
// =====================================================

const AUDIT_LOG_KEY = 'sultan_audit_log';
const MAX_AUDIT_ENTRIES = 1000;

/**
 * Log security-relevant events
 */
async function auditLog(event, origin, details = {}) {
  try {
    const entry = {
      timestamp: Date.now(),
      event,
      origin,
      ...details
    };
    
    // Get existing log
    const data = await chrome.storage.local.get([AUDIT_LOG_KEY]);
    let log = data[AUDIT_LOG_KEY] || [];
    
    // Add new entry
    log.push(entry);
    
    // Trim to max size
    if (log.length > MAX_AUDIT_ENTRIES) {
      log = log.slice(-MAX_AUDIT_ENTRIES);
    }
    
    // Save
    await chrome.storage.local.set({ [AUDIT_LOG_KEY]: log });
  } catch (e) {
    console.error('[Sultan BG] Audit log error:', e);
  }
}

// =====================================================
// Security: Input Validation & Sanitization
// =====================================================

/**
 * Validate origin format to prevent injection attacks
 */
function isValidOrigin(origin) {
  if (typeof origin !== 'string') return false;
  if (origin.length > 2048) return false; // Prevent DoS
  try {
    const url = new URL(origin);
    // Only allow http/https protocols
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate method name to prevent injection
 */
function isValidMethod(method) {
  const allowedMethods = [
    'connect', 'disconnect', 'checkConnection',
    'getBalance', 'signMessage', 'signTransaction',
    'addToken', 'getNetwork', 'getStakingInfo', 'getValidators'
  ];
  return typeof method === 'string' && allowedMethods.includes(method);
}

/**
 * Sanitize string input
 */
function sanitizeString(str, maxLength = 1024) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength);
}

/**
 * Known phishing domains (basic list - should be updated regularly)
 * This is a static fallback - production should use a remote blocklist
 */
const PHISHING_PATTERNS = [
  // Wallet impersonators
  'metamask-', 'phantom-', 'wallet-connect', 'trust-wallet',
  'coinbase-wallet', 'sultan-wallet', 'sltn-wallet',
  // Common scam patterns
  'crypto-', '-airdrop', '-claim', '-verify', '-mint',
  '-stake', 'free-', '-giveaway', 'bonus-',
  // Typosquatting
  'sul7an', 'su1tan', 'sulten', 'sultaan',
  // Generic phishing
  'signin-', 'login-', 'secure-', 'update-', 'verify-'
];

/**
 * Known legitimate domains that should never be blocked
 */
const WHITELIST_DOMAINS = [
  'sltn.io',
  'sultan.io', 
  'sultanchain.com',
  'localhost',
  'github.dev',
  '127.0.0.1'
];

/**
 * Dynamic blocklist (loaded from storage, can be updated)
 */
let dynamicBlocklist = [];

/**
 * Load dynamic blocklist from storage
 */
async function loadBlocklist() {
  try {
    const data = await chrome.storage.local.get(['phishingBlocklist']);
    dynamicBlocklist = data.phishingBlocklist || [];
  } catch (e) {
    console.error('[Sultan BG] Failed to load blocklist:', e);
  }
}

/**
 * Check if origin might be a phishing site
 */
function isPhishingSuspect(origin) {
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    
    // Check whitelist first
    for (const whitelisted of WHITELIST_DOMAINS) {
      if (hostname === whitelisted || hostname.endsWith('.' + whitelisted)) {
        return false;
      }
    }
    
    // Check dynamic blocklist (exact match)
    if (dynamicBlocklist.includes(hostname)) {
      auditLog('PHISHING_BLOCKED', origin, { reason: 'blocklist' });
      return true;
    }
    
    // Check for suspicious patterns
    for (const pattern of PHISHING_PATTERNS) {
      if (hostname.includes(pattern)) {
        auditLog('PHISHING_WARNING', origin, { reason: 'pattern', pattern });
        return true;
      }
    }
    
    // Check for lookalike domains (homograph attacks)
    // Cyrillic characters that look like Latin
    if (/[\u0430-\u044f\u0410-\u042f\u0400-\u04FF]/.test(hostname)) {
      auditLog('PHISHING_WARNING', origin, { reason: 'homograph' });
      return true;
    }
    
    // Check for excessive subdomains (common in phishing)
    const subdomainCount = hostname.split('.').length - 2;
    if (subdomainCount > 3) {
      auditLog('PHISHING_WARNING', origin, { reason: 'suspicious_subdomains' });
      return true;
    }
    
    // Check for IP-based URLs (suspicious for dApps)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      // Allow localhost IPs
      if (!hostname.startsWith('127.') && hostname !== '0.0.0.0') {
        return true;
      }
    }
    
    return false;
  } catch {
    return true; // Invalid URL is suspicious
  }
}

// Load blocklist on startup
loadBlocklist();

// =====================================================
// Dynamic Icon Switching (Light/Dark Mode)
// =====================================================

/**
 * Update extension icon based on color scheme
 * @param {boolean} isDark - Whether system is in dark mode
 */
function updateIcon(isDark) {
  const suffix = isDark ? '-dark' : '-light';
  const actionAPI = getActionAPI();
  if (!actionAPI) {
    debugLog('[Sultan BG] Action API not available');
    return;
  }
  
  const iconPaths = {
    16: `icons/icon-16${suffix}.png`,
    32: `icons/icon-32${suffix}.png`,
    48: `icons/icon-48${suffix}.png`,
    128: `icons/icon-128${suffix}.png`
  };
  
  // Firefox MV2 uses callback style, Chrome MV3 uses promises
  if (actionAPI.setIcon.length > 1 || IS_FIREFOX) {
    actionAPI.setIcon({ path: iconPaths }, () => {
      if (chrome.runtime.lastError) {
        debugLog('[Sultan BG] Themed icons not found, using defaults');
      }
    });
  } else {
    actionAPI.setIcon({ path: iconPaths }).catch(err => {
      debugLog('[Sultan BG] Themed icons not found, using defaults');
    });
  }
}

/**
 * Initialize icon based on system color scheme
 * Note: Service workers don't have access to window.matchMedia,
 * so we use a content script or offscreen document to detect theme
 */
function initializeIconSwitching() {
  // Check stored preference first
  chrome.storage.local.get(['systemColorScheme'], (result) => {
    const isDark = result.systemColorScheme === 'dark';
    updateIcon(isDark);
  });
}

// Listen for color scheme changes from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYSTEM_COLOR_SCHEME_CHANGED') {
    const isDark = message.colorScheme === 'dark';
    chrome.storage.local.set({ systemColorScheme: message.colorScheme });
    updateIcon(isDark);
    return;
  }
});

// Initialize icon on service worker start
initializeIconSwitching();

// Connection state per origin
const connections = new Map();

// Pending approval requests (waiting for user action in popup)
const pendingApprovals = new Map();
let approvalId = 0;

/**
 * Get connection for origin
 */
function getConnection(origin) {
  return connections.get(origin) || null;
}

/**
 * Set connection for origin
 */
function setConnection(origin, account) {
  connections.set(origin, {
    address: account.address,
    publicKey: account.publicKey,
    connectedAt: Date.now()
  });
  
  // Audit log connection
  auditLog('CONNECTION_ESTABLISHED', origin, { address: account.address });
  
  // Persist connections
  chrome.storage.local.set({ 
    connections: Object.fromEntries(connections) 
  });
}

/**
 * Remove connection for origin
 */
function removeConnection(origin) {
  const hadConnection = connections.has(origin);
  connections.delete(origin);
  
  if (hadConnection) {
    auditLog('CONNECTION_REMOVED', origin);
  }
  
  chrome.storage.local.set({ 
    connections: Object.fromEntries(connections) 
  });
}

/**
 * Load persisted connections on startup
 */
async function loadConnections() {
  try {
    const data = await chrome.storage.local.get(['connections']);
    if (data.connections) {
      Object.entries(data.connections).forEach(([origin, conn]) => {
        connections.set(origin, conn);
      });
    }
  } catch (e) {
    console.error('[Sultan BG] Failed to load connections:', e);
  }
}

/**
 * Create approval request and wait for user action
 */
function createApprovalRequest(type, origin, data) {
  return new Promise((resolve, reject) => {
    const id = ++approvalId;
    
    pendingApprovals.set(id, {
      id,
      type,
      origin,
      data,
      resolve,
      reject,
      createdAt: Date.now()
    });

    // Open popup for approval (if API available)
    const actionAPI = getActionAPI();
    if (actionAPI && actionAPI.openPopup) {
      // Chrome MV3 supports openPopup
      actionAPI.openPopup().catch(() => {
        // Popup may already be open or blocked
        // User can click the extension icon
      });
    }
    // Firefox MV2 doesn't support programmatic popup opening
    // User must click the extension icon

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingApprovals.has(id)) {
        pendingApprovals.delete(id);
        reject(new Error('Request expired'));
      }
    }, 300000);
  });
}

/**
 * Get pending approvals for popup
 */
function getPendingApprovals() {
  return Array.from(pendingApprovals.values()).map(req => ({
    id: req.id,
    type: req.type,
    origin: req.origin,
    data: req.data,
    createdAt: req.createdAt
  }));
}

/**
 * Resolve a pending approval
 */
function resolveApproval(id, approved, result = null) {
  const request = pendingApprovals.get(id);
  if (!request) {
    return { error: 'Approval request not found' };
  }

  pendingApprovals.delete(id);

  if (approved) {
    request.resolve(result);
  } else {
    request.reject(new Error('User rejected the request'));
  }

  return { success: true };
}

/**
 * Handle RPC request from content script
 */
async function handleRpcRequest(method, params, origin) {
  // Security: Validate origin
  if (!isValidOrigin(origin)) {
    debugWarn('[Sultan BG] Invalid origin rejected:', origin);
    auditLog('INVALID_ORIGIN', origin, { method });
    return { error: { message: 'Invalid origin' } };
  }
  
  // Security: Rate limiting
  if (!rateLimiter.isAllowed(origin)) {
    auditLog('RATE_LIMITED', origin, { method });
    return { error: { message: 'Too many requests. Please wait.' } };
  }
  
  // Security: Validate method
  if (!isValidMethod(method)) {
    debugWarn('[Sultan BG] Invalid method rejected:', method);
    auditLog('INVALID_METHOD', origin, { method });
    return { error: { message: 'Unknown method' } };
  }
  
  switch (method) {
    case 'connect': {
      // Check if already connected
      const existing = getConnection(origin);
      if (existing) {
        return { result: existing };
      }

      // Security: Check for phishing
      const phishingWarning = isPhishingSuspect(origin);
      
      // Request user approval
      try {
        const account = await createApprovalRequest('connect', origin, {
          phishingWarning
        });
        setConnection(origin, account);
        
        // Notify ALL tabs of this origin about the new connection
        // This ensures other tabs also update their state
        notifyOrigin(origin, 'connect', { address: account.address, publicKey: account.publicKey });
        
        return { result: { address: account.address, publicKey: account.publicKey } };
      } catch (error) {
        return { error: { message: error.message } };
      }
    }

    case 'checkConnection': {
      // Check if origin has an existing connection (for page load restoration)
      const existing = getConnection(origin);
      if (existing) {
        return { result: { connected: true, address: existing.address, publicKey: existing.publicKey } };
      }
      return { result: { connected: false } };
    }

    case 'disconnect': {
      removeConnection(origin);
      // Notify ALL tabs of this origin about disconnect
      notifyOrigin(origin, 'disconnect', {});
      return { result: true };
    }

    case 'getBalance': {
      const conn = getConnection(origin);
      if (!conn) {
        return { error: { message: 'Not connected' } };
      }

      try {
        const rpcUrl = await getRpcUrl();
        const response = await fetch(`${rpcUrl}/balance/${conn.address}`);
        const data = await response.json();
        return { result: data };
      } catch (error) {
        return { error: { message: 'Failed to fetch balance' } };
      }
    }

    case 'signMessage': {
      const conn = getConnection(origin);
      if (!conn) {
        return { error: { message: 'Not connected' } };
      }

      try {
        auditLog('SIGN_MESSAGE_REQUESTED', origin, { address: conn.address });
        const result = await createApprovalRequest('signMessage', origin, {
          message: params.message,
          address: conn.address
        });
        auditLog('SIGN_MESSAGE_APPROVED', origin, { address: conn.address });
        return { result };
      } catch (error) {
        auditLog('SIGN_MESSAGE_REJECTED', origin, { address: conn.address, error: error.message });
        return { error: { message: error.message } };
      }
    }

    case 'signTransaction': {
      const conn = getConnection(origin);
      if (!conn) {
        return { error: { message: 'Not connected' } };
      }

      try {
        auditLog('SIGN_TX_REQUESTED', origin, { 
          address: conn.address, 
          type: params.transaction?.type,
          to: params.transaction?.to,
          amount: params.transaction?.amount
        });
        const result = await createApprovalRequest('signTransaction', origin, {
          transaction: params.transaction,
          broadcast: params.broadcast || false,
          address: conn.address
        });
        auditLog('SIGN_TX_APPROVED', origin, { address: conn.address, broadcast: params.broadcast });
        return { result };
      } catch (error) {
        auditLog('SIGN_TX_REJECTED', origin, { address: conn.address, error: error.message });
        return { error: { message: error.message } };
      }
    }

    case 'addToken': {
      const conn = getConnection(origin);
      if (!conn) {
        return { error: { message: 'Not connected' } };
      }

      try {
        const result = await createApprovalRequest('addToken', origin, {
          token: params.token,
          address: conn.address
        });
        return { result };
      } catch (error) {
        return { error: { message: error.message } };
      }
    }

    case 'getNetwork': {
      const rpcUrl = await getRpcUrl();
      return {
        result: {
          chainId: 'sultan-1',
          name: 'Sultan Mainnet',
          rpcUrl: rpcUrl
        }
      };
    }

    case 'getStakingInfo': {
      const conn = getConnection(origin);
      if (!conn) {
        return { error: { message: 'Not connected' } };
      }

      try {
        const rpcUrl = await getRpcUrl();
        const response = await fetch(`${rpcUrl}/staking/delegations/${conn.address}`);
        const delegations = await response.json();
        
        // Sum up all delegations
        const totalStaked = Array.isArray(delegations) 
          ? delegations.reduce((sum, d) => sum + (d.amount || 0), 0)
          : 0;
        const totalRewards = Array.isArray(delegations)
          ? delegations.reduce((sum, d) => sum + (d.rewards_accumulated || 0), 0)
          : 0;
        const firstValidator = Array.isArray(delegations) && delegations.length > 0 
          ? delegations[0].validator_address 
          : undefined;

        return {
          result: {
            address: conn.address,
            staked: totalStaked.toString(),
            pendingRewards: totalRewards.toString(),
            stakingAPY: 13.33,
            validator: firstValidator
          }
        };
      } catch (error) {
        // Return zero staking info on error (user may not have staked)
        return {
          result: {
            address: conn.address,
            staked: '0',
            pendingRewards: '0',
            stakingAPY: 13.33
          }
        };
      }
    }

    case 'getValidators': {
      try {
        const rpcUrl = await getRpcUrl();
        const response = await fetch(`${rpcUrl}/staking/validators`);
        const validators = await response.json();
        
        if (!Array.isArray(validators) || validators.length === 0) {
          return { result: [] };
        }

        // Map validator names
        const validatorNames = {
          'sultanval1london': 'London Validator',
          'sultanval2singapore': 'Singapore Validator',
          'sultanval3amsterdam': 'Amsterdam Validator',
          'sultanval6newyork': 'New York Validator',
        };

        const result = validators.map(v => {
          const name = validatorNames[v.validator_address] || v.validator_address;
          const totalBlocks = (v.blocks_signed || 0) + (v.blocks_missed || 0);
          const uptime = totalBlocks > 0 ? (v.blocks_signed / totalBlocks) * 100 : 99.9;
          
          return {
            address: v.validator_address,
            name: name,
            totalStaked: (v.total_stake || 0).toString(),
            commission: v.commission_rate || 0.05,
            uptime: Math.round(uptime * 10) / 10,
            status: v.jailed ? 'jailed' : 'active'
          };
        });

        return { result };
      } catch (error) {
        return { result: [] };
      }
    }

    default:
      return { error: { message: `Unknown method: ${method}` } };
  }
}

/**
 * Send event to specific origin via content script
 */
async function notifyOrigin(origin, eventName, payload) {
  debugLog('[Sultan BG] notifyOrigin:', origin, eventName);
  
  // Query all tabs - localhost URLs need special handling
  let tabs;
  try {
    // Try with origin pattern first
    tabs = await chrome.tabs.query({ url: `${origin}/*` });
    debugLog('[Sultan BG] Found tabs for origin:', tabs.length);
  } catch (e) {
    debugLog('[Sultan BG] Tab query failed:', e.message);
    tabs = [];
  }
  
  // If no tabs found with origin pattern, try querying all tabs and filtering
  if (tabs.length === 0) {
    try {
      const allTabs = await chrome.tabs.query({});
      tabs = allTabs.filter(tab => tab.url && tab.url.startsWith(origin));
      debugLog('[Sultan BG] Found tabs via filter:', tabs.length);
    } catch (e) {
      debugLog('[Sultan BG] Fallback query failed:', e.message);
    }
  }
  
  for (const tab of tabs) {
    try {
      debugLog('[Sultan BG] Sending event to tab:', tab.id, tab.url);
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SULTAN_PROVIDER_EVENT',
        eventName,
        payload
      });
    } catch (e) {
      debugLog('[Sultan BG] Failed to send to tab:', tab.id, e.message);
    }
  }
}

/**
 * Broadcast event to all connected origins
 */
async function broadcastEvent(eventName, payload) {
  for (const origin of connections.keys()) {
    await notifyOrigin(origin, eventName, payload);
  }
}

/**
 * Message handler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle content script ready notification
  if (message.type === 'SULTAN_CONTENT_READY') {
    // Could check if origin has existing connection
    return;
  }

  // Handle RPC request from content script
  if (message.type === 'SULTAN_RPC_REQUEST') {
    handleRpcRequest(message.method, message.params, message.origin)
      .then(sendResponse)
      .catch(error => sendResponse({ error: { message: error.message } }));
    return true; // Will respond asynchronously
  }

  // Handle popup requests
  if (message.type === 'SULTAN_POPUP_REQUEST') {
    switch (message.action) {
      case 'getPendingApprovals':
        sendResponse({ approvals: getPendingApprovals() });
        break;

      case 'resolveApproval':
        sendResponse(resolveApproval(message.id, message.approved, message.result));
        break;

      case 'getConnections':
        sendResponse({ connections: Object.fromEntries(connections) });
        break;

      case 'disconnectOrigin':
        removeConnection(message.origin);
        notifyOrigin(message.origin, 'disconnect', {});
        sendResponse({ success: true });
        break;

      case 'disconnectAll':
        for (const origin of connections.keys()) {
          notifyOrigin(origin, 'disconnect', {});
        }
        connections.clear();
        chrome.storage.local.set({ connections: {} });
        sendResponse({ success: true });
        break;

      case 'notifyAccountChange':
        broadcastEvent('accountChange', message.account);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
    return true;
  }
});

// Load connections on startup
loadConnections();

// Log service worker start
debugLog('[Sultan BG] Service worker started');
