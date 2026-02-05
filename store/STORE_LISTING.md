# Sultan Wallet - Store Listing Content

## Extension Name
**Sultan Wallet**

## Short Description (132 characters max for Chrome)
```
Zero-fee blockchain wallet for Sultan L1. Send, receive, stake SLTN and connect to dApps securely.
```

## Detailed Description

### Chrome Web Store / Firefox Add-ons

```
Sultan Wallet is the official browser extension for the Sultan L1 blockchain - the world's first truly zero-fee Layer 1 network.

🚀 KEY FEATURES

• Zero Transaction Fees - Send SLTN without paying gas fees
• Secure by Design - AES-256-GCM encryption protects your keys
• dApp Integration - Connect seamlessly to Sultan ecosystem dApps
• Multi-Account Support - Manage multiple wallets from one extension
• Staking Built-In - Stake SLTN directly from your wallet
• Mobile Connection - Link your mobile wallet via QR code (WalletLink)
• NFT Gallery - View and manage your Sultan NFT collection
• Transaction Preview - See exactly what you're signing before approval

🔐 SECURITY FIRST

Your private keys never leave your device. We use:
• AES-256-GCM encryption with PBKDF2 (600K iterations)
• Optional Two-Factor Authentication (TOTP)
• Phishing detection and site blocking
• Rate limiting to prevent automated attacks
• No analytics, no tracking, no data collection

💡 EASY TO USE

1. Create a new wallet or import an existing seed phrase
2. Set a secure PIN to protect your wallet
3. Start sending, receiving, and staking SLTN
4. Connect to dApps with one click

🌐 WALLETLINK - CONNECT ANYWHERE

Use your mobile Sultan Wallet to approve transactions on desktop:
1. Scan the QR code on any Sultan dApp
2. Approve requests securely on your phone
3. No extension needed on shared computers

📱 PERFECT FOR

• Sending payments without fees
• Staking SLTN to earn rewards
• Participating in governance votes
• Collecting and trading NFTs
• Interacting with DeFi applications
• Becoming a network validator

🔗 OPEN SOURCE

Sultan Wallet is fully open source. Review our code, report issues, or contribute:
https://github.com/Wollnbergen/0xv7

⚡ THE SULTAN DIFFERENCE

Unlike other blockchains that charge transaction fees, Sultan L1 uses an innovative fee-split model that eliminates user-facing fees entirely. Send 100 SLTN, receive 100 SLTN - it's that simple.

🆘 SUPPORT

• Documentation: https://docs.sltn.io
• Discord: https://discord.gg/sultan
• Twitter: https://twitter.com/SultanL1
• Email: support@sltn.io

Download Sultan Wallet today and experience truly free blockchain transactions!
```

## Category
- **Chrome**: Productivity (or Finance if available)
- **Firefox**: Privacy & Security

## Tags/Keywords
```
blockchain, wallet, cryptocurrency, crypto, web3, defi, nft, staking, sultan, sltn, zero-fee, browser extension
```

## Screenshots Required

### Screenshot 1: Dashboard
**Filename**: `screenshot-1-dashboard.png`
**Caption**: "Clean dashboard showing your SLTN balance and recent activity"

### Screenshot 2: Send Transaction
**Filename**: `screenshot-2-send.png`
**Caption**: "Send SLTN with zero fees - what you send is what they receive"

### Screenshot 3: dApp Connection
**Filename**: `screenshot-3-connect.png`
**Caption**: "Securely connect to dApps with transaction preview"

### Screenshot 4: Staking
**Filename**: `screenshot-4-stake.png`
**Caption**: "Stake your SLTN and earn rewards directly in the wallet"

### Screenshot 5: Settings/Security
**Filename**: `screenshot-5-security.png`
**Caption**: "Enterprise-grade security with 2FA and biometric options"

## Promotional Images

### Small Tile (440x280)
**Filename**: `promo-small.png`
**Design**: Sultan Wallet logo + "Zero-Fee Blockchain Wallet" tagline

### Large Tile (920x680) - Chrome only
**Filename**: `promo-large.png`
**Design**: Feature showcase with wallet UI mockup

### Marquee (1400x560) - Chrome only
**Filename**: `promo-marquee.png`
**Design**: Hero image with key features highlighted

## Icon Sizes Required

### Chrome Web Store
- 128x128 PNG (extension icon)

### Firefox Add-ons
- 64x64 PNG
- 48x48 PNG

## Support Information

**Support URL**: https://docs.sltn.io/wallet
**Privacy Policy URL**: https://sltn.io/privacy
**Homepage**: https://sltn.io

## Developer Information

**Developer Name**: Sultan Foundation
**Developer Email**: extensions@sltn.io
**Developer Website**: https://sltn.io

## Version Information

**Current Version**: 1.6.0
**Minimum Browser Version**: 
- Chrome: 102+
- Firefox: 109+

## Permissions Justification

### storage
"Stores encrypted wallet data, user preferences, and connected dApp information locally on the user's device."

### tabs
"Required to detect active tab URL for dApp connection requests and phishing protection."

### alarms
"Used for session timeout, automatic wallet locking, and rate limit cleanup."

### host permissions (http://*/*, https://*/*)
"Required to inject the wallet provider into web pages so dApps can request wallet connections and transactions."

## Review Notes for Store Reviewers

```
Sultan Wallet is a cryptocurrency wallet extension for the Sultan L1 blockchain.

Key points for review:
1. All cryptographic operations use Web Crypto API (AES-256-GCM, PBKDF2)
2. Private keys are encrypted and stored locally only
3. No remote analytics or tracking
4. Content scripts inject a wallet provider for dApp communication
5. Background service worker handles message routing and RPC calls

Test the extension:
1. Click extension icon → Create new wallet
2. Set a 6-digit PIN
3. View dashboard with mock balance
4. Try sending a transaction (will connect to testnet RPC)

The extension communicates only with:
- rpc.sltn.io (blockchain RPC)
- Google Favicon API (for dApp icons)
```
