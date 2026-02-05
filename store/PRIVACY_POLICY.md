# Sultan Wallet Privacy Policy

**Last Updated: January 7, 2026**

## Introduction

Sultan Wallet ("we," "our," or "the Extension") is a browser extension that enables users to manage their Sultan L1 blockchain assets. This Privacy Policy explains how we handle your information when you use our browser extension.

## Summary

**We do not collect, store, or transmit any personal data to external servers.** Sultan Wallet operates entirely locally on your device.

## Information We Do NOT Collect

- ❌ Personal identification information
- ❌ Email addresses or contact information
- ❌ Browsing history or web activity
- ❌ IP addresses or location data
- ❌ Analytics or usage tracking data
- ❌ Cookies or tracking identifiers

## Data Storage

### Local Storage Only

All wallet data is stored **exclusively on your device** using your browser's secure local storage mechanisms:

- **Encrypted Wallet Data**: Your seed phrase and private keys are encrypted using AES-256-GCM encryption with PBKDF2 key derivation (600,000 iterations) before being stored locally.
- **Connection Preferences**: Your list of connected dApps and trusted sites is stored locally.
- **Settings**: Theme preferences and account names are stored locally.

### What We Store Locally

| Data Type | Storage Method | Purpose |
|-----------|---------------|---------|
| Encrypted seed phrase | AES-256-GCM encrypted | Wallet recovery |
| Derived addresses | Plain text | Display and transactions |
| Connected dApps | Plain text | Remember approved sites |
| Trusted sites | Plain text | Auto-approve connections |
| User preferences | Plain text | Theme, account names |

## Network Communications

Sultan Wallet communicates with the following external services:

### 1. Sultan L1 RPC Nodes
- **Purpose**: Query blockchain state, submit transactions
- **Data sent**: Transaction data, address queries
- **Endpoints**: `rpc.sltn.io`, `api.sltn.io`

### 2. WalletLink Relay Server (Optional)
- **Purpose**: Connect mobile wallet to desktop dApps via QR code
- **Data sent**: End-to-end encrypted messages only
- **Note**: The relay server cannot read message contents

### 3. Favicon Service
- **Purpose**: Display website icons for connected dApps
- **Service**: Google Favicon API
- **Data sent**: Domain names of connected sites

## Security Measures

We implement industry-standard security practices:

- **AES-256-GCM Encryption**: Military-grade encryption for sensitive data
- **PBKDF2 Key Derivation**: 600,000 iterations to protect against brute force
- **No Remote Key Storage**: Private keys never leave your device
- **Content Security Policy**: Strict CSP to prevent XSS attacks
- **Rate Limiting**: Protection against automated attacks
- **Phishing Detection**: Built-in blocklist for known malicious sites

## Third-Party Services

Sultan Wallet does not integrate with any third-party analytics, advertising, or tracking services.

## Data Retention

Since all data is stored locally on your device:
- Data persists until you uninstall the extension or clear browser data
- You can manually delete your wallet data at any time through Settings
- We have no access to your data and cannot delete it remotely

## Your Rights

You have complete control over your data:

- **Access**: View all stored data in your browser's developer tools
- **Delete**: Remove the extension to delete all associated data
- **Export**: Export your seed phrase for backup purposes
- **Portability**: Use your seed phrase in any compatible wallet

## Children's Privacy

Sultan Wallet is not intended for use by children under 13. We do not knowingly collect information from children.

## Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be reflected in the "Last Updated" date. Continued use of the extension after changes constitutes acceptance of the updated policy.

## Open Source

Sultan Wallet is open source software. You can review our code to verify our privacy practices:

- **Repository**: https://github.com/Wollnbergen/0xv7
- **License**: MIT

## Contact

For privacy-related questions or concerns:

- **Email**: privacy@sltn.io
- **Website**: https://sltn.io
- **GitHub Issues**: https://github.com/Wollnbergen/0xv7/issues

## Jurisdiction

This Privacy Policy is governed by applicable data protection laws. For EU residents, we comply with GDPR requirements. For California residents, we comply with CCPA requirements.

---

**By using Sultan Wallet, you acknowledge that you have read and understood this Privacy Policy.**
