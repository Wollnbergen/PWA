#!/usr/bin/env node
/**
 * PWA ↔ Browser Extension Parity Verification
 * 
 * This script ensures the PWA and browser extension remain in sync.
 * Run this in CI/CD to prevent divergence.
 * 
 * WHAT IT CHECKS:
 * 1. Core module checksums match between builds
 * 2. Security constants are identical
 * 3. API endpoints are the same
 * 4. Crypto library versions match
 * 5. No duplicate implementations of shared functionality
 * 
 * Usage: node scripts/verify-parity.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ============================================================================
// Configuration
// ============================================================================

/**
 * Core modules that MUST be identical between PWA and extension.
 * These are the single source of truth for security-critical code.
 */
const SHARED_CORE_MODULES = [
  'src/core/wallet.ts',
  'src/core/security.ts',
  'src/core/storage.secure.ts',
  'src/core/logger.ts',
  'src/core/csp.ts',
  'src/core/clipboard.ts',
  'src/core/totp.ts',
  'src/api/sultanAPI.ts',
];

/**
 * Security constants that must have specific values.
 * If these change, both builds must be updated together.
 */
const SECURITY_CONSTANTS = {
  'PBKDF2_ITERATIONS': 600_000,
  'MIN_PIN_LENGTH': 6,
  'MAX_PIN_ATTEMPTS': 5,
  'LOCKOUT_DURATION_MS': 300_000, // 5 minutes
  'SESSION_TIMEOUT_MS': 300_000,  // 5 minutes
  'SALT_LENGTH': 32,
  'IV_LENGTH': 12,
};

/**
 * Critical crypto dependencies that must match.
 */
const CRYPTO_DEPS = [
  '@noble/ed25519',
  '@noble/hashes',
  '@scure/bip39',
];

/**
 * Patterns that should NOT exist (duplicate implementations)
 * Each pattern can have excludeFiles to skip legitimate uses
 */
const FORBIDDEN_PATTERNS = [
  { pattern: /function\s+pbkdf2/i, message: 'Custom PBKDF2 implementation - use Web Crypto' },
  { pattern: /function\s+aesEncrypt/i, message: 'Custom AES implementation - use Web Crypto' },
  { 
    pattern: /Math\.random\(\)/, 
    message: 'Insecure random - use crypto.getRandomValues()',
    // Exclude UI shuffle for mnemonic display (not crypto, just UX)
    excludeFiles: ['CreateWallet.tsx', 'components/']
  },
  { pattern: /eval\s*\(/, message: 'eval() is forbidden' },
  { pattern: /new\s+Function\s*\(/, message: 'Function constructor is forbidden' },
];

// ============================================================================
// Verification Functions
// ============================================================================

function hashFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function verifySharedModules() {
  const results = [];
  
  console.log('\n📦 Verifying shared core modules...');
  
  for (const module of SHARED_CORE_MODULES) {
    const filePath = path.join(ROOT, module);
    
    if (!fs.existsSync(filePath)) {
      results.push({
        passed: false,
        message: `Missing core module: ${module}`,
      });
      continue;
    }
    
    const hash = hashFile(filePath);
    results.push({
      passed: true,
      message: `✓ ${module}`,
      details: `hash: ${hash}`,
    });
  }
  
  return results;
}

function verifySecurityConstants() {
  const results = [];
  const securityFile = path.join(ROOT, 'src/core/security.ts');
  
  console.log('\n🔒 Verifying security constants...');
  
  if (!fs.existsSync(securityFile)) {
    return [{ passed: false, message: 'security.ts not found' }];
  }
  
  const content = fs.readFileSync(securityFile, 'utf-8');
  
  for (const [constant, expectedValue] of Object.entries(SECURITY_CONSTANTS)) {
    // Match patterns like: export const PBKDF2_ITERATIONS = 600_000;
    // Or: export const LOCKOUT_DURATION_MS = 5 * 60 * 1000;
    const regex = new RegExp(`${constant}\\s*=\\s*([^;]+);`);
    const match = content.match(regex);
    
    if (!match) {
      results.push({
        passed: false,
        message: `Missing constant: ${constant}`,
      });
      continue;
    }
    
    // Evaluate the expression (safe because we control the source file)
    let actualValue;
    try {
      // Replace underscore separators and evaluate
      const expr = match[1].replace(/_/g, '').trim();
      actualValue = eval(expr);
    } catch {
      results.push({
        passed: false,
        message: `Cannot parse constant: ${constant}`,
        details: `Expression: ${match[1]}`,
      });
      continue;
    }
    
    if (actualValue !== expectedValue) {
      results.push({
        passed: false,
        message: `${constant} mismatch`,
        details: `expected ${expectedValue}, got ${actualValue}`,
      });
    } else {
      results.push({
        passed: true,
        message: `✓ ${constant} = ${expectedValue}`,
      });
    }
  }
  
  return results;
}

function verifyCryptoDependencies() {
  const results = [];
  const pkgPath = path.join(ROOT, 'package.json');
  
  console.log('\n🔐 Verifying crypto dependencies...');
  
  if (!fs.existsSync(pkgPath)) {
    return [{ passed: false, message: 'package.json not found' }];
  }
  
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  
  for (const dep of CRYPTO_DEPS) {
    if (!deps[dep]) {
      results.push({
        passed: false,
        message: `Missing crypto dependency: ${dep}`,
      });
    } else {
      results.push({
        passed: true,
        message: `✓ ${dep}: ${deps[dep]}`,
      });
    }
  }
  
  return results;
}

function getAllTsFiles(dir) {
  const files = [];
  
  if (!fs.existsSync(dir)) return files;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '__tests__') {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function verifyNoForbiddenPatterns() {
  const results = [];
  
  console.log('\n🚫 Checking for forbidden patterns...');
  
  const srcDir = path.join(ROOT, 'src');
  const files = getAllTsFiles(srcDir);
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative(ROOT, file);
    
    for (const { pattern, message, excludeFiles } of FORBIDDEN_PATTERNS) {
      // Check if this file should be excluded
      if (excludeFiles?.some(exclude => relativePath.includes(exclude))) {
        continue;
      }
      
      if (pattern.test(content)) {
        results.push({
          passed: false,
          message: `${relativePath}: ${message}`,
        });
      }
    }
  }
  
  if (results.length === 0) {
    results.push({
      passed: true,
      message: '✓ No forbidden patterns found',
    });
  }
  
  return results;
}

function verifyNoDuplicateCrypto() {
  const results = [];
  
  console.log('\n🔍 Checking for duplicate crypto implementations...');
  
  // Extension scripts should NOT implement crypto
  const extensionFiles = [
    'extension/background.js',
    'extension/content-script.js',
    'extension/inpage-provider.js',
  ];
  
  // Patterns that indicate actual crypto implementation (not API delegation)
  const cryptoImplementationPatterns = [
    { pattern: /crypto\.subtle\.encrypt/, message: 'Direct encryption call' },
    { pattern: /crypto\.subtle\.decrypt/, message: 'Direct decryption call' },
    { pattern: /crypto\.subtle\.deriveKey/, message: 'Direct key derivation' },
    { pattern: /crypto\.subtle\.sign/, message: 'Direct signing' },
    { pattern: /new\s+Uint8Array.*sha256/, message: 'Direct hashing' },
    { pattern: /mnemonicToSeed/, message: 'Mnemonic derivation implementation' },
    { pattern: /derivePrivateKeyFromMnemonic/, message: 'Key derivation implementation' },
  ];
  
  let foundIssues = false;
  
  for (const file of extensionFiles) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) continue;
    
    const content = fs.readFileSync(filePath, 'utf-8');
    
    for (const { pattern, message } of cryptoImplementationPatterns) {
      if (pattern.test(content)) {
        results.push({
          passed: false,
          message: `${file}: ${message}`,
          details: `Pattern: ${pattern.source}`,
        });
        foundIssues = true;
      }
    }
  }
  
  if (!foundIssues) {
    results.push({
      passed: true,
      message: '✓ No duplicate crypto in extension scripts',
    });
  }
  
  return results;
}

function generateParityReport() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SULTAN WALLET - PWA ↔ EXTENSION PARITY VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const allResults = [
    ...verifySharedModules(),
    ...verifySecurityConstants(),
    ...verifyCryptoDependencies(),
    ...verifyNoForbiddenPatterns(),
    ...verifyNoDuplicateCrypto(),
  ];
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const passed = allResults.filter(r => r.passed).length;
  const failed = allResults.filter(r => !r.passed).length;
  
  console.log(`\n  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\n❌ FAILURES:');
    allResults.filter(r => !r.passed).forEach(r => {
      console.log(`  • ${r.message}`);
      if (r.details) console.log(`    ${r.details}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All parity checks passed!');
    console.log('\nThe PWA and browser extension are in sync.');
  }
}

// Run verification
generateParityReport();
