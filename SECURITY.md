# Sultan Wallet Security

This document describes the security architecture, threat model, and security assumptions of the Sultan Wallet PWA.

## Table of Contents

- [Security Architecture](#security-architecture)
- [Threat Model](#threat-model)
- [Cryptographic Design](#cryptographic-design)
- [Security Features](#security-features)
- [Known Limitations](#known-limitations)
- [Security Assumptions](#security-assumptions)
- [Vulnerability Disclosure](#vulnerability-disclosure)
- [Audit Status](#audit-status)

---

## Security Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                      Sultan Wallet PWA                          │
├─────────────────────────────────────────────────────────────────┤
│  UI Layer (React)                                               │
│  └── Screens: Dashboard, Send, Receive, Stake, Settings        │
├─────────────────────────────────────────────────────────────────┤
│  Core Layer (TypeScript)                                        │
│  ├── wallet.ts      - Key derivation, signing, address encoding│
│  ├── security.ts    - Memory wiping, rate limiting, sessions   │
│  ├── storage.secure.ts - AES-GCM encryption, IndexedDB storage│
│  └── csp.ts         - Content Security Policy                  │
├─────────────────────────────────────────────────────────────────┤
│  Cryptographic Primitives (@noble, @scure)                      │
│  ├── Ed25519 signatures                                         │
│  ├── SHA-256/SHA-512 hashing                                    │
│  ├── AES-256-GCM encryption                                     │
│  └── PBKDF2 key derivation                                      │
├─────────────────────────────────────────────────────────────────┤
│  Storage Layer                                                   │
│  ├── IndexedDB (encrypted wallet data)                          │
│  └── localStorage (lockout state, preferences)                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Wallet Creation**
   - Generate 24-word BIP39 mnemonic (256-bit entropy)
   - Derive master seed using PBKDF2
   - Derive Ed25519 keys using SLIP-0010
   - Encrypt mnemonic with user PIN using AES-256-GCM
   - Store encrypted blob in IndexedDB

2. **Wallet Unlock**
   - User enters PIN
   - Derive encryption key using PBKDF2 (600K iterations)
   - Decrypt mnemonic from IndexedDB
   - Store decrypted mnemonic in memory (XOR-encrypted)
   - Start session timer

3. **Transaction Signing**
   - Retrieve mnemonic from memory
   - Derive private key for account index
   - Sign transaction with Ed25519
   - Immediately wipe private key from memory

---

## Threat Model

### Assets to Protect

| Asset | Sensitivity | Storage |
|-------|-------------|---------|
| Mnemonic phrase | CRITICAL | Encrypted in IndexedDB |
| Private keys | CRITICAL | Derived on-demand, wiped after use |
| PIN/Password | HIGH | Never stored (derived key only) |
| Account addresses | LOW | Stored in plaintext |
| Transaction history | MEDIUM | Fetched from network |

### Threat Actors

1. **Remote Attacker (Network)**
   - XSS attacks via malicious content
   - Man-in-the-middle on RPC connections
   - Phishing via fake wallet sites

2. **Local Attacker (Device Access)**
   - Physical access to unlocked device
   - Malware with filesystem access
   - Memory forensics on crashed/hibernated device

3. **Supply Chain Attacker**
   - Compromised npm packages
   - Malicious browser extensions
   - Compromised CDN/hosting

### Threat Mitigations

| Threat | Mitigation |
|--------|------------|
| XSS | Strict CSP, no inline scripts, input sanitization |
| MITM | HTTPS-only, certificate pinning (planned) |
| Phishing | Domain verification, origin checks |
| Physical access | PIN lockout, session timeout, memory wiping |
| Memory forensics | Secure wipe, XOR-encrypted in-memory storage |
| Supply chain | Audited crypto libraries, lock file verification |

---

## Cryptographic Design

### Key Derivation

```
Mnemonic (24 words, 256-bit entropy)
    │
    ▼ BIP39 (PBKDF2-HMAC-SHA512, 2048 iterations)
Master Seed (512 bits)
    │
    ▼ SLIP-0010 (HMAC-SHA512)
Ed25519 Master Key
    │
    ▼ Hardened derivation: m/44'/1984'/0'/0'/{index}
Account Private Key (256 bits)
    │
    ▼ Ed25519 curve multiplication
Account Public Key (256 bits)
    │
    ▼ SHA-256 → First 20 bytes → Bech32
Sultan Address (sultan1...)
```

### Encryption at Rest

```
User PIN
    │
    ▼ PBKDF2-HMAC-SHA256 (600,000 iterations, 32-byte salt)
Encryption Key (256 bits)
    │
    ▼ AES-256-GCM (12-byte IV)
Encrypted Mnemonic
    │
    ▼ Store in IndexedDB
{salt, iv, ciphertext, version}
```

### Signature Scheme

- **Algorithm**: Ed25519 (RFC 8032)
- **Key size**: 256-bit private key, 256-bit public key
- **Signature size**: 512 bits (64 bytes)
- **Library**: @noble/ed25519 (audited by Cure53)

---

## Security Features

### 1. Memory Protection

- **Secure Wipe**: Overwrites sensitive data with random bytes, then zeros
- **XOR Encryption**: In-memory secrets stored XOR-encrypted with random key (`SecureString` class)
- **Minimal Exposure**: Private keys derived only when signing, wiped immediately
- **Session PIN Protection**: PIN stored as `SecureString` in memory, never as plaintext JS string

### 2. Rate Limiting

- **Max Attempts**: 5 failed PIN attempts
- **Lockout Duration**: 5 minutes
- **Persistent State**: Lockout survives browser restart

### 3. Session Management

- **Auto-lock**: 5 minutes of inactivity
- **Activity Tracking**: User interactions extend session
- **Manual Lock**: User can lock wallet at any time
- **PIN Verification**: Required for all sensitive operations (Send, Stake, Become Validator)

### 4. Content Security Policy

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
connect-src 'self' https://rpc.sltn.io https://api.sltn.io;
frame-ancestors 'none';
form-action 'self';
```

### 5. Input Validation

- Address format validation (bech32 checksum)
- Amount validation (no negative, max precision)
- Mnemonic validation (BIP39 wordlist, checksum)
- Validator moniker sanitization (3-50 chars, alphanumeric only)

### 6. API Security

- **Request Timeouts**: 30s timeout on all API calls
- **Retry with Backoff**: Automatic retry on 5xx errors (max 3 attempts)
- **Response Validation**: Zod schema validation on all API responses
- **User-Agent Header**: Identifies wallet version for debugging

### 7. Transaction Security

- **Deterministic Signing**: Uses `fast-json-stable-stringify` for consistent key ordering
- **SHA-256 Hashing**: Messages hashed before signing (matches node verification)
- **High-Value Warnings**: Transactions >1000 SLTN show confirmation banner
- **Validator Existence Check**: Verifies validator exists before staking

### 8. BIP39 Passphrase Support

- Optional 25th word (passphrase) for additional security
- Enables plausible deniability (different passphrases = different wallets)
- Passphrase stored as `SecureString` when in use

### 9. Sensitive Data Filtering

- Production logger filters: mnemonic, private key, seed, password, PIN
- Bech32 Sultan addresses redacted in logs
- 64-character hex strings (potential private keys) detected and filtered

---

## Known Limitations

### Browser Environment Constraints

1. **JavaScript String Immutability**: Strings cannot be securely wiped. We mitigate by using `Uint8Array` for sensitive data and `SecureString` wrapper class.

2. **No Memory Locking**: Browser cannot lock memory pages (like `mlock()`). Sensitive data may be swapped to disk.

3. **IndexedDB Encryption**: IndexedDB is not encrypted by browser. We add application-level encryption, but determined attacker with device access could extract encrypted blobs.

4. **Service Worker Security**: SW has broad access. Malicious SW could intercept requests.

### Not Protected Against

- Compromised browser or OS
- Hardware keyloggers
- Screen capture malware
- Rubber-hose cryptanalysis
- Sophisticated targeted attacks

---

## Security Assumptions

1. **Trusted Browser**: Browser correctly implements Web Crypto API, CSP, and origin isolation.

2. **Trusted Device**: Device is not compromised with malware.

3. **HTTPS**: All network communication uses TLS 1.2+.

4. **User Responsibility**: User keeps mnemonic backup secure and doesn't share PIN.

5. **Cryptographic Libraries**: @noble and @scure libraries are correctly implemented (independently audited).

---

## Vulnerability Disclosure

### Reporting Security Issues

**DO NOT** file public GitHub issues for security vulnerabilities.

Contact: security@sltn.io

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Any suggested mitigations

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Fix Development**: Depends on severity
- **Disclosure**: Coordinated disclosure after fix

### Bug Bounty

We offer bounties for responsibly disclosed vulnerabilities:

| Severity | Bounty |
|----------|--------|
| Critical (key extraction) | Up to $10,000 |
| High (fund loss possible) | Up to $5,000 |
| Medium (privacy leak) | Up to $1,000 |
| Low (minor issues) | Up to $200 |

---

## Audit Status

### Current Status: **SECURITY REVIEW COMPLETE (December 2025)**

The wallet has undergone an internal security review with the following results:

| Priority | Files | Score | Status |
|----------|-------|-------|--------|
| P1 Core Crypto | wallet.ts, security.ts, storage.secure.ts | 10/10 | ✅ |
| P2 API Layer | sultanAPI.ts | 10/10 | ✅ |
| P3 Critical Screens | Send.tsx, Stake.tsx, BecomeValidator.tsx | 10/10 | ✅ |
| P4 Supporting Files | logger.ts, totp.ts, useWallet.tsx | 10/10 | ✅ |
| P5 Tests | wallet.test.ts, security.test.ts, e2e.wallet.test.ts | 10/10 | ✅ |

**Test Coverage:** 219 tests passing (8 skipped - browser-only features)

### Security Improvements Implemented (December 2025)

1. **SecureString for Session PIN** - PIN no longer stored as plaintext JS string
2. **Stable JSON Stringify** - Deterministic signature generation matching node
3. **API Timeouts & Retry** - 30s timeout, exponential backoff on failures
4. **Zod Response Validation** - Type-safe API response parsing
5. **PIN Verification** - Required on Stake.tsx and BecomeValidator.tsx
6. **High-Value Warnings** - Confirmation for transactions >1000 SLTN
7. **Validator Existence Check** - Verify validator before staking
8. **Moniker Validation** - Sanitization for validator registration
9. **BIP39 Passphrase** - Optional 25th word support
10. **E2E Signature Tests** - Verify wallet signatures match node verification

### Planned Audits

- [ ] Third-party cryptographic implementation review
- [ ] Web security penetration testing
- [x] Internal security review (completed December 2025)

### Cryptographic Library Audits

The wallet uses audited cryptographic libraries:

| Library | Auditor | Report |
|---------|---------|--------|
| @noble/ed25519 | Cure53 | [Report](https://github.com/paulmillr/noble-curves#security) |
| @noble/hashes | Cure53 | [Report](https://github.com/paulmillr/noble-hashes#security) |
| @scure/bip39 | Cure53 | [Report](https://github.com/paulmillr/scure-bip39#security) |

---

## Security Checklist

For developers and auditors:

- [ ] All sensitive data uses `Uint8Array`, not strings
- [ ] `secureWipe()` called after using private keys
- [ ] No `console.log()` of sensitive data
- [ ] CSP meta tag applied on load
- [ ] HTTPS enforced in production
- [ ] No inline scripts or `eval()`
- [ ] Dependencies locked with exact versions
- [ ] No secrets in source code
- [ ] Rate limiting on all authentication
- [ ] Session timeout implemented
- [ ] Input validation on all user input

---

## Changelog

### v1.1.0 (December 2025) - Security Review Update
- SecureString for session PIN (XOR encrypted in memory)
- BIP39 passphrase support (optional 25th word)
- Stable JSON stringify for deterministic signatures
- API timeouts (30s) and retry with exponential backoff
- Zod schema validation on API responses
- PIN verification on Stake and BecomeValidator screens
- High-value transaction warnings (>1000 SLTN)
- Validator existence check before staking
- Moniker validation for validator registration
- E2E signature verification tests
- Logger filters Bech32 addresses and hex private keys
- TOTP SHA256 upgrade path documented
- 219 tests passing (up from 113)

### v1.0.0 (2024-12)
- Initial release
- Ed25519 key derivation
- AES-256-GCM storage encryption
- PBKDF2 with 600K iterations
- Rate limiting and session management
