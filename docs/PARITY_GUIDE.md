# PWA ↔ Browser Extension Parity Guide

## Overview

The Sultan Wallet exists in two forms:
1. **PWA (Progressive Web App)** - Mobile standalone wallet
2. **Browser Extension** - Desktop dApp integration

Both share the same core TypeScript code to ensure security consistency.

## Architecture

```
wallet-extension/
├── src/                      # SHARED: Used by BOTH PWA and Extension
│   ├── core/                 # Security-critical modules (DO NOT DUPLICATE)
│   │   ├── wallet.ts         # Mnemonic, keys, signing
│   │   ├── security.ts       # PIN, lockout, session, SecureString
│   │   ├── storage.secure.ts # AES-GCM, PBKDF2 encryption
│   │   ├── logger.ts         # Sanitized logging
│   │   ├── csp.ts            # Content Security Policy
│   │   ├── clipboard.ts      # Secure clipboard operations
│   │   └── totp.ts           # 2FA (optional)
│   ├── api/                  # API client (shared)
│   ├── screens/              # React screens (shared)
│   ├── components/           # UI components (shared)
│   └── hooks/                # React hooks (shared)
│
├── extension/                # EXTENSION-ONLY: Message passing layer
│   ├── background.js         # Service worker (rate limiting, routing)
│   ├── content-script.js     # Page bridge (message validation)
│   └── inpage-provider.js    # window.sultan API (frozen, no crypto)
│
├── dist/                     # PWA build output
└── dist-extension/           # Extension build output (includes extension/ files)
```

## The Golden Rules

### 1. Single Source of Truth

All cryptographic and security code lives in `src/core/`. This code is:
- Used directly by the PWA
- Used by the extension popup (React app)
- **NOT duplicated** in `extension/*.js` files

```
✅ CORRECT: Extension popup calls wallet.signTransaction()
❌ WRONG:   background.js implements its own signing
```

### 2. Extension Scripts Are Dumb Pipes

The `extension/*.js` files should ONLY:
- Pass messages between dApp ↔ popup
- Apply rate limiting
- Validate message structure
- Log for security audit

They should NEVER:
- Implement cryptographic operations
- Store private keys or mnemonics
- Make decisions about transaction validity
- Access `crypto.subtle` directly

### 3. Security Constants Must Match

These constants in `src/core/security.ts` are the law:

| Constant | Value | Purpose |
|----------|-------|---------|
| `PBKDF2_ITERATIONS` | 600,000 | OWASP 2024 minimum |
| `MIN_PIN_LENGTH` | 6 | User PIN minimum |
| `MAX_PIN_ATTEMPTS` | 5 | Before lockout |
| `LOCKOUT_DURATION_MS` | 300,000 | 5 minute lockout |
| `SESSION_TIMEOUT_MS` | 300,000 | 5 minute auto-lock |

If you change these, BOTH builds use the new value automatically.

### 4. No Forbidden Patterns

The following are BANNED from all source files:

```typescript
// ❌ FORBIDDEN
eval(code)                    // XSS vector
new Function(code)            // XSS vector
Math.random()                 // Not cryptographically secure
document.write()              // XSS vector
innerHTML = userInput         // XSS vector

// ✅ REQUIRED ALTERNATIVES
crypto.getRandomValues()      // For random bytes
crypto.subtle.encrypt()       // For encryption
React JSX                     // Auto-escapes user input
```

## Build Process

Both builds compile the same TypeScript source:

```bash
# PWA (uses vite.config.ts)
npm run build
# Output: dist/

# Extension (uses vite.config.extension.ts)
npm run build:extension
# Output: dist-extension/

# Both at once
npm run build:all
```

The extension build additionally copies `extension/*.js` to `dist-extension/`.

## Verification

### Manual Check
```bash
npm run verify:parity
```

### CI/CD (Automatic)
The GitHub Actions workflow runs on every PR:
1. **Parity Check** - Verifies shared modules exist and constants match
2. **Unit Tests** - Runs all 219+ tests
3. **Security Audit** - Checks for forbidden patterns
4. **Build Verification** - Ensures both builds succeed

### Pre-commit Hook (Recommended)
```bash
npm run precommit
```

## Adding New Features

### For Shared Features (e.g., new transaction type)

1. Add to `src/core/` or `src/api/`
2. Import in screens as needed
3. Both builds automatically get the feature
4. No changes needed to `extension/*.js`

### For Extension-Only Features (e.g., phishing detection)

1. Add to `extension/background.js`
2. Keep it to message handling only
3. If crypto is needed, delegate to popup via message

### For PWA-Only Features (e.g., install prompt)

1. Add to `src/` with conditional check:
   ```typescript
   if (!isExtensionContext()) {
     // PWA-only code
   }
   ```

## Version Synchronization

Both builds share the same version in `package.json`:

```json
{
  "version": "1.0.0"
}
```

The extension manifest (`public/manifest.json`) should match:

```json
{
  "version": "1.0.0"
}
```

## Troubleshooting

### "Parity check failed: Missing core module"
A required file was deleted or renamed. Restore it or update `scripts/verify-parity.ts`.

### "Security constant mismatch"
Someone changed a security constant. Verify this was intentional and update the expected value in the verification script.

### "Forbidden pattern found"
Insecure code was added. Remove the pattern and use the secure alternative.

### "Extension doesn't work but PWA does"
1. Check `extension/*.js` for JavaScript errors
2. Verify `manifest.json` permissions
3. Check browser console for CSP violations

## FAQ

**Q: Why not separate repos for PWA and extension?**
A: Shared code means shared security. One vulnerability fix applies to both.

**Q: Can extension scripts use TypeScript?**
A: Yes, but it adds build complexity. Vanilla JS for message passing is simpler and auditable.

**Q: What about WalletConnect for mobile dApp connectivity?**
A: Planned for Q2 2026. Will be added to `src/core/` as shared code.

**Q: How do I update crypto dependencies?**
A: Update in `package.json`, run tests, verify both builds work. The parity check ensures both use the same versions.
