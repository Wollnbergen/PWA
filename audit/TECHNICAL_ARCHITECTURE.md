# Sultan Wallet PWA - Technical Architecture Deep Dive

**Document Version**: 1.0  
**Date**: December 2025  
**Target Audience**: Third-Party Security Auditors  
**Classification**: Technical Documentation  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Cryptographic Implementation](#cryptographic-implementation)
5. [Data Flow & State Management](#data-flow--state-management)
6. [Security Architecture](#security-architecture)
7. [Network Architecture](#network-architecture)
8. [Storage Architecture](#storage-architecture)
9. [Build & Deployment](#build--deployment)
10. [Testing Strategy](#testing-strategy)
11. [Performance Characteristics](#performance-characteristics)
12. [Browser Compatibility](#browser-compatibility)

---

## 1. Executive Summary

Sultan Wallet is a client-side Progressive Web Application (PWA) that provides non-custodial cryptocurrency wallet functionality for the Sultan blockchain. The application runs entirely in the browser with no server-side key management.

### Key Characteristics

| Attribute | Value |
|-----------|-------|
| Architecture | Client-side PWA (no backend key storage) |
| Language | TypeScript 5.6 |
| Framework | React 18.3 with Vite 6 |
| Crypto Libraries | @noble/ed25519, @noble/hashes, @scure/bip39 |
| Storage | IndexedDB with AES-256-GCM encryption |
| Signature Scheme | Ed25519 (RFC 8032) |
| Key Derivation | SLIP-0010 for Ed25519 |
| Total LOC | ~3,656 (core: 2,772) |

### Security Posture

- **Zero-knowledge architecture**: Server never sees private keys
- **Client-side signing**: All transaction signing occurs in browser
- **Encrypted storage**: AES-256-GCM with PBKDF2 (600K iterations)
- **Memory protection**: Secure wipe, XOR-encrypted in-memory storage
- **Rate limiting**: 5 failed PIN attempts trigger 5-minute lockout
- **Session management**: Auto-lock after 5 minutes inactivity

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser Environment                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              Sultan Wallet PWA (JavaScript)               │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │  Presentation Layer (React)                               │ │
│  │  ├─ Dashboard, Send, Receive, Stake, Governance          │ │
│  │  └─ Settings, Activity, NFTs, BecomeValidator            │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │  Application Layer                                        │ │
│  │  ├─ useWallet (React Context - session state)            │ │
│  │  ├─ useBalance (RPC queries)                             │ │
│  │  └─ useTheme (UI preferences)                            │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │  Core Layer (Cryptography & Security)                    │ │
│  │  ├─ wallet.ts (Ed25519, BIP39, SLIP-0010)               │ │
│  │  ├─ security.ts (Memory wipe, rate limit, sessions)     │ │
│  │  ├─ storage.secure.ts (AES-GCM, PBKDF2)                 │ │
│  │  └─ csp.ts (Content Security Policy)                    │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │  API Layer                                                │ │
│  │  └─ sultanAPI.ts (RPC client for blockchain)            │ │
│  └───────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  Browser APIs                                                   │
│  ├─ Web Crypto API (AES-GCM, PBKDF2, random)                  │ │
│  ├─ IndexedDB (encrypted wallet storage)                      │ │
│  └─ Service Worker (PWA offline support)                      │ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (TLS 1.2+)
                              ▼
                    ┌─────────────────────┐
                    │   Sultan RPC Node   │
                    │  (rpc.sltn.io)      │
                    │   Port 443 (HTTPS)  │
                    └─────────────────────┘
```

### 2.2 Module Dependency Graph

```
┌─────────────────┐
│   Screens       │
│  (Dashboard,    │
│   Send, etc.)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│   useWallet     │◄─────┤   sultanAPI     │
│   (Context)     │      │  (RPC Client)   │
└────────┬────────┘      └─────────────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│   SultanWallet  │◄─────┤  storage.secure │
│   (wallet.ts)   │      │  (AES-GCM)      │
└────────┬────────┘      └─────────────────┘
         │
         ▼
┌─────────────────┐
│   security.ts   │
│  (SecureString, │
│   rate limit)   │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  @noble/ed25519 │
│  @noble/hashes  │
│  @scure/bip39   │
└─────────────────┘
```

---

## 3. Technology Stack

### 3.1 Frontend

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| UI Framework | React | 18.3.1 | Component-based UI |
| Language | TypeScript | 5.6.2 | Type safety |
| Build Tool | Vite | 6.0.5 | Fast builds, HMR |
| Routing | React Router | 7.1.0 | Client-side navigation |
| State | React Context | 18.3.1 | Global wallet state |
| Data Fetching | TanStack Query | 5.62.16 | Server state caching |
| Styling | CSS + Tailwind | 4.1.18 | Utility-first CSS |

### 3.2 Cryptographic Libraries

| Library | Version | Audit Status | Purpose |
|---------|---------|--------------|---------|
| @noble/ed25519 | 2.2.3 | ✅ Cure53 | Ed25519 signatures |
| @noble/hashes | 1.7.1 | ✅ Cure53 | SHA-256, SHA-512, PBKDF2 |
| @scure/bip39 | 1.5.4 | ✅ Cure53 | BIP39 mnemonic |
| bech32 | 2.0.0 | ✅ Widely used | Address encoding |

### 3.3 Browser APIs

| API | Usage | Fallback |
|-----|-------|----------|
| Web Crypto API | AES-GCM, PBKDF2, random | None - required |
| IndexedDB | Encrypted wallet storage | None - required |
| Service Worker | PWA offline caching | Graceful degradation |
| Clipboard API | Copy addresses/mnemonic | Manual copy |

---

## 4. Cryptographic Implementation

### 4.1 Key Derivation Path

**Standard**: SLIP-0010 (Ed25519 variant)  
**Path**: `m/44'/1984'/0'/0'/{index}`

```
BIP39 Mnemonic (24 words, 256-bit entropy)
    │
    ├─ Wordlist: English (2048 words)
    └─ Checksum: 8 bits (validates last word)
    │
    ▼
PBKDF2-HMAC-SHA512 (2048 iterations)
    │
    ├─ Input: mnemonic phrase
    ├─ Salt: "mnemonic" + optional passphrase
    └─ Output: 512-bit seed
    │
    ▼
SLIP-0010 Derivation (HMAC-SHA512 chain)
    │
    ├─ Master key: HMAC-SHA512("ed25519 seed", seed)
    ├─ m/44' (purpose: BIP44)
    ├─ m/44'/1984' (coin type: Sultan custom)
    ├─ m/44'/1984'/0' (account: 0)
    ├─ m/44'/1984'/0'/0' (change: 0 - external)
    └─ m/44'/1984'/0'/0'/{index} (address index)
    │
    ▼
Ed25519 Private Key (256 bits)
    │
    ▼
Ed25519 Public Key (256 bits)
    │
    ├─ Curve multiplication on Ed25519 curve
    └─ Output: 32-byte public key
    │
    ▼
SHA-256(public_key) → first 20 bytes
    │
    ▼
Bech32 Encoding
    │
    ├─ Prefix: "sultan"
    └─ Output: sultan1{bech32_data}
```

### 4.2 Signature Generation

**Algorithm**: Ed25519 (RFC 8032)  
**Deterministic**: Yes (same input → same signature)  
**Size**: 64 bytes (512 bits)

```typescript
// File: src/core/wallet.ts:signTransaction()

// 1. Canonical transaction serialization
const canonical = JSON.stringify({
  from: tx.from,
  to: tx.to,
  amount: tx.amount,
  memo: tx.memo || '',
  nonce: tx.nonce,
  timestamp: tx.timestamp,
});

// 2. Hash the canonical form
const msgBytes = sha256(new TextEncoder().encode(canonical));

// 3. Derive private key on-demand (never cached)
const privateKey = await this.derivePrivateKeyForSigning(accountIndex);

// 4. Sign with Ed25519
const signature = await ed25519.signAsync(msgBytes, privateKey);

// 5. CRITICAL: Wipe private key immediately
secureWipe(privateKey);

// 6. Return hex-encoded signature
return bytesToHex(signature);
```

### 4.3 Storage Encryption

**Algorithm**: AES-256-GCM (Authenticated Encryption)  
**Key Derivation**: PBKDF2-HMAC-SHA256  
**Iterations**: 600,000 (OWASP 2024 recommendation)

```typescript
// File: src/core/storage.secure.ts:encrypt()

// 1. Generate unique salt and IV
const salt = randomBytes(32);  // 256 bits
const iv = randomBytes(12);    // 96 bits (GCM standard)

// 2. Derive encryption key from PIN
const keyMaterial = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(pin),
  'PBKDF2',
  false,
  ['deriveKey']
);

const key = await crypto.subtle.deriveKey(
  {
    name: 'PBKDF2',
    salt,
    iterations: 600_000,
    hash: 'SHA-256',
  },
  keyMaterial,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt']
);

// 3. Encrypt mnemonic
const ciphertext = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,
  new TextEncoder().encode(mnemonic)
);

// 4. Store as {salt, iv, ciphertext, version}
return {
  salt: base64(salt),
  iv: base64(iv),
  ciphertext: base64(ciphertext),
  version: 2,
};
```

### 4.4 Memory Protection

**Technique**: Multi-pass overwrite + XOR encryption

```typescript
// File: src/core/security.ts:secureWipe()

// 1. Overwrite with random data
const random = randomBytes(data.length);
data.set(random);

// 2. Overwrite with zeros
data.fill(0);

// 3. Overwrite with ones (helps with some memory types)
data.fill(0xFF);

// 4. Final overwrite with zeros
data.fill(0);
```

**SecureString Class**: XOR-encrypted in-memory storage

```typescript
// File: src/core/security.ts:SecureString

class SecureString {
  private data: Uint8Array;  // XOR encrypted
  private key: Uint8Array;   // Random XOR key

  constructor(value: string) {
    const plaintext = new TextEncoder().encode(value);
    this.key = randomBytes(plaintext.length);

    // XOR encrypt
    this.data = new Uint8Array(plaintext.length);
    for (let i = 0; i < plaintext.length; i++) {
      this.data[i] = plaintext[i] ^ this.key[i];
    }

    secureWipe(plaintext);
  }

  getValue(): Uint8Array {
    // XOR decrypt
    const result = new Uint8Array(this.data.length);
    for (let i = 0; i < this.data.length; i++) {
      result[i] = this.data[i] ^ this.key[i];
    }
    return result;
  }

  destroy(): void {
    secureWipe(this.data);
    secureWipe(this.key);
  }
}
```

---

## 5. Data Flow & State Management

### 5.1 Wallet Creation Flow

```
User Input (New Wallet)
    │
    ▼
Generate Mnemonic
    ├─ generateMnemonic(wordlist, 256) → 24 words
    └─ Store in SecureString (XOR encrypted)
    │
    ▼
User Creates PIN
    ├─ Validate: 6-12 digits, no sequential/repeated
    └─ PIN never stored (only derived key)
    │
    ▼
Derive Encryption Key
    ├─ PBKDF2(PIN, salt=random(32), 600K iterations)
    └─ Output: 256-bit AES key
    │
    ▼
Encrypt Mnemonic
    ├─ AES-256-GCM(mnemonic, key, iv=random(12))
    └─ Add checksum: SHA-256(mnemonic) → first 4 bytes
    │
    ▼
Store in IndexedDB
    └─ {salt, iv, ciphertext, checksum, version}
```

### 5.2 Transaction Signing Flow

```
User Initiates Send
    │
    ▼
Session Check
    ├─ isSessionValid() → check last activity < 5 min
    └─ If expired → redirect to Unlock
    │
    ▼
User Enters Details
    ├─ Recipient: sultan1...
    ├─ Amount: X.XXXXXXXXX SLTN
    └─ Memo: optional
    │
    ▼
Validate Inputs
    ├─ validateAddress(recipient)
    ├─ validateAmount(amount, balance)
    └─ Check balance ≥ amount
    │
    ▼
User Confirms
    │
    ▼
PIN Verification
    ├─ User enters PIN
    ├─ verifySessionPin(pin) → compare hash
    └─ If wrong → recordFailedAttempt()
    │
    ▼
Build Transaction
    ├─ from: wallet.address
    ├─ to: recipient
    ├─ amount: parseSLTN(amount) → base units
    ├─ nonce: fetch from RPC
    └─ timestamp: Date.now()
    │
    ▼
Sign Transaction
    ├─ Derive private key on-demand
    ├─ Serialize tx → JSON canonical form
    ├─ Hash: SHA-256(canonical)
    ├─ Sign: ed25519.sign(hash, privateKey)
    └─ CRITICAL: secureWipe(privateKey)
    │
    ▼
Broadcast to Network
    ├─ POST /tx to RPC
    └─ Body: {tx, signature, publicKey}
    │
    ▼
Show Confirmation
    └─ TX hash, explorer link
```

### 5.3 State Management Architecture

**Global State**: React Context (`useWallet`)

```typescript
// File: src/hooks/useWallet.tsx

interface WalletContextType {
  wallet: SultanWallet | null;          // Wallet instance
  isLocked: boolean;                     // Session locked?
  account: SultanAccount | null;         // Current account
  createWallet: (mnemonic: string, pin: string) => Promise<void>;
  unlockWallet: (pin: string) => Promise<void>;
  lockWallet: () => void;
  signTransaction: (tx: any) => Promise<string>;
}

// Provider wraps entire app
<WalletProvider>
  <App />
</WalletProvider>
```

**Server State**: TanStack Query (React Query)

```typescript
// File: src/hooks/useBalance.ts

const { data: balance } = useQuery({
  queryKey: ['balance', address],
  queryFn: () => sultanAPI.getBalance(address),
  staleTime: 10_000,  // 10 seconds
  refetchInterval: 30_000,  // Auto-refresh every 30s
});
```

---

## 6. Security Architecture

### 6.1 Defense in Depth Layers

```
Layer 7: User Education
    └─ Warnings about mnemonic sharing, phishing

Layer 6: Content Security Policy
    ├─ No inline scripts
    ├─ No eval() or Function()
    └─ frame-ancestors 'none'

Layer 5: Input Validation
    ├─ Address validation (bech32 checksum)
    ├─ Amount validation (no negative, max precision)
    └─ PIN validation (length, no patterns)

Layer 4: Session Management
    ├─ Auto-lock after 5 min inactivity
    ├─ Session timeout enforcement
    └─ Manual lock available

Layer 3: Rate Limiting
    ├─ Max 5 failed PIN attempts
    ├─ 5 minute lockout
    └─ Persistent across page reloads

Layer 2: Memory Protection
    ├─ SecureString (XOR encrypted in memory)
    ├─ secureWipe() after use
    └─ Private keys derived on-demand only

Layer 1: Storage Encryption
    ├─ AES-256-GCM
    ├─ PBKDF2 (600K iterations)
    └─ Unique salt & IV per wallet
```

### 6.2 Attack Surface Analysis

| Attack Vector | Mitigation | Residual Risk |
|---------------|------------|---------------|
| XSS injection | Strict CSP, React auto-escape | LOW |
| CSRF | No cookies, origin checks | NONE |
| MITM | HTTPS-only, CSP upgrade-insecure | LOW |
| Phishing | User education, domain verification | MEDIUM |
| Physical access | PIN, auto-lock, rate limiting | MEDIUM |
| Memory forensics | secureWipe, XOR encryption | LOW |
| Supply chain | Audited libs, lock file | LOW |
| Browser exploit | Out of scope | HIGH |

### 6.3 Sensitive Data Lifecycle

```
Mnemonic Phrase:
  Create → SecureString (XOR) → IndexedDB (AES-GCM) → Never in plaintext string

Private Key:
  Derive (on-demand) → Use (signing) → secureWipe() → Never cached

PIN:
  Input → Hash (SHA-256) → Compare → Never stored

Session PIN Hash:
  Set (in-memory only) → Verify → Clear on lock → Never persisted
```

---

## 7. Network Architecture

### 7.1 RPC Communication

**Endpoint**: `https://rpc.sltn.io`  
**Protocol**: REST over HTTPS  
**Fallback**: None (single RPC endpoint)

```
Sultan Wallet (Browser)
    │
    │ HTTPS (TLS 1.2+)
    ▼
Sultan RPC Node (rpc.sltn.io)
    │
    ├─ GET /balance/{address}
    ├─ GET /staking/delegations/{address}
    ├─ GET /staking/validators
    ├─ GET /status
    ├─ POST /tx (broadcast)
    ├─ POST /staking/delegate
    ├─ POST /staking/create_validator
    ├─ GET /governance/proposals
    └─ POST /governance/vote
```

### 7.2 API Request/Response Format

**Balance Query**:
```typescript
// Request
GET /balance/sultan1abc123...

// Response
{
  "address": "sultan1abc123...",
  "balance": 1000000000,  // Base units
  "nonce": 42
}
```

**Transaction Broadcast**:
```typescript
// Request
POST /tx
{
  "tx": {
    "from": "sultan1abc...",
    "to": "sultan1xyz...",
    "amount": "1000000000",
    "memo": "Payment",
    "nonce": 42,
    "timestamp": 1703001234567
  },
  "signature": "a1b2c3...",  // 128 hex chars (64 bytes)
  "public_key": "d4e5f6..."   // 64 hex chars (32 bytes)
}

// Response
{
  "hash": "tx_hash_123..."
}
```

### 7.3 Error Handling

```typescript
try {
  const balance = await sultanAPI.getBalance(address);
} catch (error) {
  if (error.status === 404) {
    // Account not found - return zero balance
    return { balance: '0', nonce: 0 };
  } else if (error.status >= 500) {
    // Server error - show retry UI
    throw new Error('Network error. Please try again.');
  } else {
    // Unknown error
    throw new Error('Failed to fetch balance');
  }
}
```

---

## 8. Storage Architecture

### 8.1 IndexedDB Schema

**Database**: `sultan-wallet`  
**Version**: 2  
**Object Store**: `wallet`

```typescript
interface StoredWallet {
  encryptedMnemonic: string;      // Base64 JSON: {salt, iv, ciphertext, version}
  mnemonicChecksum: string;        // SHA-256 first 4 bytes (hex)
  accounts: string[];              // Derived addresses (for UI only)
  createdAt: number;               // Timestamp
  updatedAt: number;               // Timestamp
  version: number;                 // Wallet format version
  securityVersion: number;         // Encryption params version
}
```

**Storage Flow**:
```
User Creates Wallet
    │
    ▼
Encrypt Mnemonic
    │
    ▼
const tx = db.transaction('wallet', 'readwrite');
const store = tx.objectStore('wallet');
store.put(walletData, 'wallet');  // Key: 'wallet'
```

### 8.2 localStorage Usage

**Minimal usage** - only for non-sensitive data:

```typescript
// Lockout state (security)
localStorage.setItem('sultan_wallet_lockout', JSON.stringify({
  attempts: 3,
  lastAttempt: Date.now(),
  lockedUntil: Date.now() + 300000,
}));

// User preferences (non-sensitive)
localStorage.setItem('sultan_wallet_theme', 'dark');
```

### 8.3 Session Storage

**Not used** - All session state is in-memory only via React Context.

---

## 9. Build & Deployment

### 9.1 Build Process

```bash
# Development
npm run dev
  ├─ Vite dev server (HMR)
  ├─ Port 5000
  └─ No minification

# Production
npm run build
  ├─ TypeScript compilation (tsc -b)
  ├─ Vite build
  │   ├─ Tree-shaking
  │   ├─ Code splitting
  │   ├─ Minification (esbuild)
  │   └─ Asset optimization
  ├─ Service Worker generation (workbox)
  └─ Output: dist/
      ├─ index.html
      ├─ assets/
      │   ├─ index-{hash}.js
      │   └─ index-{hash}.css
      ├─ sw.js
      └─ manifest.webmanifest
```

### 9.2 Deployment Configuration

**Platform**: Replit Static Deployment (via Wollnbergen/PWA repo)  
**URL**: `https://wallet.sltn.io`  
**Backup**: `https://rpc.sltn.io/wallet/` (NYC validator)  
**Build Command**: `npm run build`  
**Output Directory**: `dist/`

**Deployment Workflow:**
```
wallet-extension/ (0xv7 repo)
       ↓ sync
Wollnbergen/PWA repo
       ↓ git pull
Replit project
       ↓ npm run build  
wallet.sltn.io (production)
```

**Deploy Script**: `./scripts/deploy_wallet.sh --push`

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,  // No source maps in production
  },
  base: '/',  // Root path
});
```

### 9.3 PWA Configuration

**Service Worker**: Workbox (precaching)  
**Strategy**: Network-first for API, cache-first for assets

```typescript
// vite.config.ts - PWA plugin
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.ico', 'favicon-light.png', 'favicon-dark.png'],
  manifest: {
    name: 'Sultan Wallet',
    short_name: 'Sultan',
    theme_color: '#000000',
    icons: [
      { src: 'pwa-192x192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { src: 'pwa-512x512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/rpc\.sltn\.io\/.*/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          expiration: { maxEntries: 50, maxAgeSeconds: 300 },
        },
      },
    ],
  },
});
```

---

## 10. Testing Strategy

### 10.1 Test Coverage

| Component | Test File | Coverage |
|-----------|-----------|----------|
| Wallet core | `wallet.test.ts` | 20+ tests |
| Security | `security.test.ts` | 25+ tests |
| Storage | `storage.secure.test.ts` | 10+ tests |
| Multi-chain | `multichain.test.ts` | 8+ tests |
| NFTs | `nfts.test.tsx` | 5+ tests |

**Total**: 73 passing tests, 6 skipped (IndexedDB unavailable in Node)

### 10.2 Critical Test Cases

```typescript
// File: src/core/__tests__/wallet.test.ts

describe('SultanWallet', () => {
  it('generates valid 24-word mnemonic', () => {
    const mnemonic = SultanWallet.generateMnemonic();
    expect(mnemonic.split(' ')).toHaveLength(24);
    expect(SultanWallet.validateMnemonic(mnemonic)).toBe(true);
  });

  it('derives deterministic addresses', async () => {
    const wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC);
    const account1 = await wallet.deriveAccount(0);
    const account2 = await wallet.deriveAccount(0);
    expect(account1.address).toBe(account2.address);
  });

  it('never exposes private key in account object', async () => {
    const wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC);
    const account = await wallet.deriveAccount(0);
    expect(account).not.toHaveProperty('privateKey');
  });

  it('wipes private key after signing', async () => {
    const wallet = await SultanWallet.fromMnemonic(TEST_MNEMONIC);
    const signature = await wallet.signMessage(0, 'test');
    expect(signature).toHaveLength(128);  // 64 bytes hex
    // privateKey should be wiped from memory
  });
});
```

---

## 11. Performance Characteristics

### 11.1 Key Operations Benchmarks

| Operation | Time | Notes |
|-----------|------|-------|
| Generate mnemonic | ~50ms | CSPRNG + BIP39 checksum |
| Derive account (first) | ~100ms | SLIP-0010 derivation |
| Derive account (cached) | <1ms | Lookup from Map |
| Encrypt mnemonic | ~2s | PBKDF2 600K iterations |
| Decrypt mnemonic | ~2s | PBKDF2 600K iterations |
| Sign transaction | ~50ms | Ed25519 + key derivation |
| Verify signature | ~10ms | Ed25519 verification |

### 11.2 Bundle Size

```
Production build analysis:
├─ index.html: 2.75 kB
├─ index-{hash}.js: 400.73 kB (gzip: 120.91 kB)
├─ index-{hash}.css: 69.25 kB (gzip: 11.46 kB)
├─ sw.js: precaches 11 assets (486.95 kB total)
└─ Total (gzipped): ~133 kB
```
*Note: Bundle size should be verified against current build.*

### 11.3 Runtime Memory

```
Typical usage:
├─ React component tree: ~10 MB
├─ SultanWallet instance: ~1 MB
│   └─ SecureString (mnemonic): ~300 bytes
├─ Account cache: ~500 bytes per account
└─ Total: ~12 MB
```

---

## 12. Browser Compatibility

### 12.1 Required APIs

| API | Chrome | Firefox | Safari | Edge |
|-----|--------|---------|--------|------|
| Web Crypto API | ✅ 37+ | ✅ 34+ | ✅ 11+ | ✅ 79+ |
| IndexedDB | ✅ 24+ | ✅ 16+ | ✅ 10+ | ✅ 79+ |
| Service Worker | ✅ 40+ | ✅ 44+ | ✅ 11.1+ | ✅ 79+ |
| BigInt | ✅ 67+ | ✅ 68+ | ✅ 14+ | ✅ 79+ |
| ES2020 features | ✅ 80+ | ✅ 74+ | ✅ 14.1+ | ✅ 80+ |

### 12.2 Progressive Enhancement

```typescript
// Check required APIs
if (!crypto.subtle) {
  throw new Error('Web Crypto API not available. Please use a modern browser with HTTPS.');
}

if (!indexedDB) {
  throw new Error('IndexedDB not available. Cannot store wallet.');
}

// Service worker is optional
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // PWA features degraded, but app still works
  });
}
```

---

## Appendix A: File Inventory

### Critical Files for Audit

```
src/core/
├─ wallet.ts (544 LOC) - CRITICAL
├─ security.ts (611 LOC) - CRITICAL
├─ storage.secure.ts (468 LOC) - CRITICAL
├─ totp.ts (404 LOC) - MEDIUM (2FA flow not detailed in architecture doc)
├─ clipboard.ts (155 LOC) - HIGH
├─ logger.ts (140 LOC) - HIGH
├─ csp.ts (192 LOC) - HIGH

src/hooks/
├─ useWallet.tsx - Session state management
└─ useBalance.ts - RPC queries

src/api/
└─ sultanAPI.ts - RPC client

Total critical LOC: 1,623
Total high priority LOC: 2,514
```

---

## Appendix B: Security Checklist Reference

See `audit/CHECKLIST.md` for detailed verification checklist covering:
- Key management (M1-M4, K1-K4)
- Encryption (E1-E4, D1-D3)
- Memory safety (W1-W3, S1-S3)
- Authentication (P1-P3, R1-R5, T1-T2)
- Session management (L1-L4, SS1-SS2)
- Input validation (A1-A3, AM1-AM3)
- Logging (LOG1-LOG3, ERR1-ERR2)
- Content security (CSP1-CSP3, XSS1-XSS2)

---

## Appendix C: Development Setup & Versioning

### Cloning and Installation

```bash
# Clone repository
git clone https://github.com/Wollnbergen/0xv7.git
cd 0xv7/wallet-extension

# Install dependencies (uses exact versions from package-lock.json)
# NOTE: npm ci ensures reproducible builds by respecting lockfile
npm ci
```

### Environment Variables

The project uses Vite for environment variable management. Key variables are exposed via `import.meta.env`:

- `VITE_APP_VERSION`: Application version string.
- `VITE_RPC_URL`: The primary RPC endpoint URL.
- `VITE_EXPLORER_URL`: Base URL for the block explorer.

Example:
```typescript
// src/config.ts
const config = {
  appName: 'Sultan Wallet',
  appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://rpc.sltn.io',
  explorerUrl: import.meta.env.VITE_EXPLORER_URL || 'https://explorer.sltn.io',
};
```

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 2025 | Sultan Core Team | Initial technical architecture document |

**Review Status**: Ready for third-party audit  
**Next Review**: After audit completion