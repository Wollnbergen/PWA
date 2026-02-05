# Sultan Wallet - Store Submission Checklist

## Pre-Submission

### Code Quality
- [x] All tests passing (271 tests)
- [x] No TypeScript errors
- [x] No console errors in production build
- [x] ESLint/Clippy warnings resolved
- [x] Build completes successfully

### Security Audit
- [x] npm audit shows 0 vulnerabilities
- [x] No hardcoded secrets or API keys
- [x] CSP properly configured
- [x] Rate limiting implemented
- [x] Phishing detection active
- [x] AES-256-GCM encryption verified

### Extension Packages
- [x] Chrome build: `sultan-wallet-chrome.zip`
- [x] Firefox build: `sultan-wallet-firefox.zip`
- [x] Manifest versions correct (MV3 for Chrome, MV2 for Firefox)

---

## Chrome Web Store Submission

### Account Setup
- [ ] Chrome Web Store Developer account created ($5 one-time fee)
- [ ] Developer verification completed
- [ ] Payment merchant account linked (if monetizing)

### Required Assets
- [ ] Extension icon 128x128 PNG
- [ ] At least 1 screenshot (1280x800 or 640x400)
- [ ] Small promotional tile 440x280 PNG
- [ ] Privacy policy URL live and accessible

### Submission Form
- [ ] Extension name: "Sultan Wallet"
- [ ] Short description (≤132 chars)
- [ ] Detailed description
- [ ] Category selected
- [ ] Language: English
- [ ] Upload `sultan-wallet-chrome.zip`

### Permission Justifications
- [ ] `storage` - Explain local wallet data storage
- [ ] `tabs` - Explain dApp URL detection
- [ ] `alarms` - Explain session timeout
- [ ] Host permissions - Explain dApp injection

### Review Preparation
- [ ] Test instructions provided
- [ ] No policy violations
- [ ] Accurate description
- [ ] Working support URL

---

## Firefox Add-ons Submission

### Account Setup
- [ ] Firefox Add-ons Developer account created (free)
- [ ] Email verified

### Required Assets
- [ ] Extension icon 64x64 PNG
- [ ] At least 1 screenshot
- [ ] Privacy policy URL

### Submission Form
- [ ] Add-on name: "Sultan Wallet"
- [ ] Summary (≤250 chars)
- [ ] Description
- [ ] Categories: Privacy & Security
- [ ] Upload `sultan-wallet-firefox.zip`
- [ ] Source code (optional but recommended for faster review)

### Self-Hosted Option
- [ ] Consider AMO unlisted if faster deployment needed
- [ ] Update manifest with `update_url` if self-hosting

---

## Post-Submission

### Chrome Web Store
- Review typically takes 1-3 business days
- May request additional information
- Watch for rejection emails

### Firefox Add-ons
- Review typically takes 1-5 business days
- Faster if source code provided
- Watch for reviewer questions

### After Approval
- [ ] Update website with store links
- [ ] Announce on social media
- [ ] Update README with installation links
- [ ] Monitor reviews and ratings
- [ ] Set up update pipeline

---

## Store URLs (after approval)

**Chrome Web Store**: 
```
https://chrome.google.com/webstore/detail/sultan-wallet/[EXTENSION_ID]
```

**Firefox Add-ons**:
```
https://addons.mozilla.org/firefox/addon/sultan-wallet/
```

---

## Quick Commands

### Build Fresh Packages
```bash
cd wallet-extension
npm run package:all
```

### Verify Package Contents
```bash
unzip -l sultan-wallet-chrome.zip
unzip -l sultan-wallet-firefox.zip
```

### Test Before Submission
```bash
npm test -- --run
npm run build:extension
```
