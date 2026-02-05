# Sultan Wallet - Technical Deep Dive

**Version:** 1.1.0  
**Last Updated:** December 31, 2025  
**Security Review:** Complete (10/10 all priorities)

---

## Executive Summary

The Sultan Wallet is a **non-custodial Progressive Web App (PWA)** for the Sultan L1 blockchain. It enables users to manage SLTN tokens, stake to validators, participate in governance, and hold NFTs - all without any server-side key custody.

**Key Security Properties:**
- Private keys never leave the device
- AES-256-GCM encryption at rest (PBKDF2 600K iterations)
- SecureString XOR encryption in memory
- Ed25519 signatures matching node verification
- 219 tests passing

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Sultan Wallet PWA                          │
├─────────────────────────────────────────────────────────────────┤
│  UI Layer (React 18 + TypeScript)                               │
│  └── Screens: Dashboard, Send, Receive, Stake, NFTs, Settings  │
├─────────────────────────────────────────────────────────────────┤
│  Core Layer                                                      │
│  ├── wallet.ts      - Ed25519 keys, BIP39, signing              │
│  ├── security.ts    - SecureString, rate limiting, validation  │
│  ├── storage.secure.ts - AES-256-GCM, IndexedDB                │
│  ├── logger.ts      - Sensitive data filtering                 │
│  └── totp.ts        - RFC 6238 TOTP (optional 2FA)             │
├─────────────────────────────────────────────────────────────────┤
│  API Layer                                                       │
│  └── sultanAPI.ts   - RPC client, Zod validation, retry logic  │
├─────────────────────────────────────────────────────────────────┤
│  Crypto Libraries (@noble, @scure - Cure53 audited)             │
│  ├── @noble/ed25519  - Signatures                               │
│  ├── @noble/hashes   - SHA-256, SHA-512, PBKDF2                │
│  └── @scure/bip39    - Mnemonic generation                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Security Review Summary (December 2025)

### Priority Scorecard

| Priority | Files | Score | Key Improvements |
|----------|-------|-------|------------------|
| P1 Core Crypto | wallet.ts, security.ts, storage.secure.ts | 10/10 | SecureString for PIN, stable JSON stringify |
| P2 API Layer | sultanAPI.ts | 10/10 | 30s timeouts, Zod validation, retry logic |
| P3 Critical Screens | Send.tsx, Stake.tsx, BecomeValidator.tsx | 10/10 | PIN verification on all, high-value warnings |
| P4 Supporting | logger.ts, totp.ts, useWallet.tsx | 10/10 | Bech32 filtering, SHA256 upgrade path |
| P5 Tests | All test files | 10/10 | E2E signature verification, BIP39 passphrase tests |

### Security Features Implemented

| Feature | Description |
|---------|-------------|
| **SecureString** | XOR-encrypted in-memory storage for sensitive data (PIN, mnemonic) |
| **BIP39 Passphrase** | Optional 25th word support for plausible deniability |
| **Deterministic Signing** | `fast-json-stable-stringify` ensures consistent key ordering |
| **API Timeouts** | 30-second timeout on all fetch requests |
| **Retry Logic** | Exponential backoff (1s, 2s, 4s) on 5xx errors |
| **Zod Validation** | Type-safe response parsing prevents injection attacks |
| **PIN Verification** | Required on Send, Stake, and BecomeValidator |
| **High-Value Warnings** | Confirmation banner for transactions >1000 SLTN |
| **Validator Check** | Verify validator exists before staking |
| **Moniker Validation** | 3-50 chars, alphanumeric only for validators |
| **Logger Filtering** | Redacts mnemonic, private keys, Bech32 addresses |

---

## Cryptographic Implementation

### Key Derivation Flow

```
Mnemonic (24 words, 256-bit entropy)
    │
    ▼ BIP39 (PBKDF2-HMAC-SHA512, 2048 iterations + optional passphrase)
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

### Transaction Signing

```
Transaction Object { from, to, amount, memo, nonce, timestamp }
    │
    ▼ fast-json-stable-stringify (deterministic key ordering)
Canonical JSON String
    │
    ▼ SHA-256 hash
32-byte Message Hash
    │
    ▼ Ed25519 sign with private key
64-byte Signature (128 hex chars)
    │
    ▼ Submit to RPC with public key
Node STRICTLY verifies signature
```

### Storage Encryption

```
User PIN
    │
    ▼ PBKDF2-HMAC-SHA256 (600,000 iterations, 32-byte salt)
Encryption Key (256 bits)
    │
    ▼ AES-256-GCM (12-byte IV)
Encrypted Mnemonic + Checksum
    │
    ▼ Store in IndexedDB
{salt, iv, ciphertext, checksum, version}
```

---

## Test Coverage

| Test File | Tests | Coverage |
|-----------|-------|----------|
| wallet.test.ts | 39 | Mnemonic, derivation, BIP39 passphrase, signing |
| security.test.ts | 30+ | SecureString, rate limiting, PBKDF2 constants |
| storage.secure.test.ts | 14 | Encryption, checksum, session management |
| e2e.wallet.test.ts | 12 | Full lifecycle, signature verification |
| sultanAPI.test.ts | 10 | Retry, timeouts, Zod validation |
| totp.test.ts | 34 | Base32, TOTP, backup codes |
| logger.test.ts | 22 | Sensitive pattern detection |
| transactions.security.test.ts | 29 | High-value warnings, validation |
| nfts.test.tsx | 7 | NFT gallery UI |
| Component tests | 22+ | Screen rendering |

**Total: 219 tests passing** (8 skipped - browser-only IndexedDB/WebCrypto)

---

## Known Limitations

1. **JS String Immutability** - Mitigated by SecureString wrapper
2. **No Memory Locking** - Browser cannot mlock() pages
3. **IndexedDB Encryption** - App-level encryption added
4. **Service Worker Access** - CSP applied, SW scope limited

---

## Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `core/wallet.ts` | ~560 | Ed25519 keys, BIP39, SLIP-0010 derivation |
| `core/security.ts` | ~830 | SecureString, rate limiting, validation |
| `core/storage.secure.ts` | ~470 | AES-256-GCM, IndexedDB, checksums |
| `core/logger.ts` | ~130 | Production-safe logging |
| `core/totp.ts` | ~410 | RFC 6238 TOTP, backup codes |
| `api/sultanAPI.ts` | ~400 | RPC client, Zod, retry |
| `screens/Send.tsx` | ~320 | Transfer with PIN verification |
| `screens/Stake.tsx` | ~370 | Staking with validator check |
| `screens/BecomeValidator.tsx` | ~280 | Validator registration |

---

## Recommendations for Third-Party Audit

1. **Focus Areas:**
   - SecureString XOR implementation
   - PBKDF2 iteration count adequacy
   - Ed25519 signature determinism
   - IndexedDB encryption strength

2. **Test Vectors:**
   - Use TEST_MNEMONIC_24 from wallet.test.ts
   - Verify signature output matches node

3. **Browser Testing:**
   - Test with fake-indexeddb for full CI coverage
   - Memory dump simulation for SecureString verification

---

*Document generated: December 31, 2025*
