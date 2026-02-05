# Sultan Wallet Integration Guide

This guide explains how to integrate your dApp with the Sultan Wallet browser extension.

## Quick Start

```javascript
// Check if Sultan Wallet is installed
if (typeof window.sultan !== 'undefined') {
  console.log('Sultan Wallet is installed!');
}

// Wait for wallet to be ready
window.addEventListener('sultan#initialized', () => {
  console.log('Sultan Wallet is ready');
});
```

## Installation

Users can install Sultan Wallet from:
- Chrome Web Store: [link coming soon]
- Firefox Add-ons: [link coming soon]

## API Reference

### Connection

#### `sultan.connect()`

Request connection to the wallet. Opens a popup for user approval.

```javascript
try {
  const { address, publicKey } = await window.sultan.connect();
  console.log('Connected:', address);
} catch (error) {
  console.error('User rejected connection');
}
```

**Returns:** `Promise<{ address: string, publicKey: string }>`

#### `sultan.disconnect()`

Disconnect from the wallet.

```javascript
await window.sultan.disconnect();
```

#### `sultan.isConnected()`

Check if wallet is connected.

```javascript
if (window.sultan.isConnected()) {
  // Wallet is connected
}
```

**Returns:** `boolean`

### Account Info

#### `sultan.getAddress()`

Get the connected wallet address.

```javascript
const address = await window.sultan.getAddress();
// Returns: "sultan1abc123..."
```

**Returns:** `Promise<string | null>`

#### `sultan.getPublicKey()`

Get the connected wallet's public key.

```javascript
const pubKey = await window.sultan.getPublicKey();
// Returns: "0x..."
```

**Returns:** `Promise<string | null>`

#### `sultan.getBalance()`

Get wallet balance.

```javascript
const balance = await window.sultan.getBalance();
console.log('Available:', balance.available);
console.log('Staked:', balance.staked);
console.log('Rewards:', balance.rewards);
```

**Returns:** `Promise<{ available: string, staked: string, rewards: string }>`

### Signing

#### `sultan.signMessage(message)`

Sign an arbitrary message. Opens popup for user approval.

```javascript
const message = 'Sign this message to verify your identity';
const { signature, publicKey } = await window.sultan.signMessage(message);
```

**Parameters:**
- `message`: `string | Uint8Array` - Message to sign

**Returns:** `Promise<{ signature: string, publicKey: string }>`

#### `sultan.signTransaction(transaction, broadcast?)`

Sign a transaction. Opens popup for user approval.

```javascript
const tx = {
  type: 'transfer',
  to: 'sultan1recipient...',
  amount: '1000000000', // 1 SLTN in base units
  memo: 'Payment for services'
};

const { signature, publicKey, txHash } = await window.sultan.signTransaction(tx, true);
```

**Parameters:**
- `transaction`: `object` - Transaction to sign
- `broadcast`: `boolean` (optional, default: `false`) - Whether to broadcast after signing

**Returns:** `Promise<{ signature: string, publicKey: string, txHash?: string }>`

#### `sultan.sendTransaction(transaction)`

Sign and broadcast a transaction. Convenience wrapper for `signTransaction(tx, true)`.

```javascript
const { txHash } = await window.sultan.sendTransaction({
  type: 'transfer',
  to: 'sultan1recipient...',
  amount: '1000000000'
});
console.log('Transaction hash:', txHash);
```

### Transaction Types

```typescript
// Transfer SLTN
{
  type: 'transfer',
  to: string,        // Recipient address
  amount: string,    // Amount in base units (1 SLTN = 1e9)
  memo?: string      // Optional memo
}

// DEX Swap
{
  type: 'swap',
  pool_id: string,   // Pool identifier
  token_in: string,  // Input token denom
  amount_in: string, // Input amount
  min_out: string    // Minimum output (slippage protection)
}

// Add Liquidity
{
  type: 'add_liquidity',
  pool_id: string,
  amount_a: string,
  amount_b: string
}

// Remove Liquidity
{
  type: 'remove_liquidity',
  pool_id: string,
  lp_amount: string
}

// Create Token
{
  type: 'create_token',
  name: string,
  symbol: string,
  decimals: number,
  initial_supply: string
}

// Stake
{
  type: 'stake',
  validator_address: string,
  amount: string
}

// Unstake
{
  type: 'unstake',
  validator_address: string,
  amount: string
}
```

### Events

#### `sultan.on(event, handler)`

Subscribe to wallet events.

```javascript
// Connection events
window.sultan.on('connect', ({ address, publicKey }) => {
  console.log('Connected:', address);
});

window.sultan.on('disconnect', () => {
  console.log('Disconnected');
});

// Account change
window.sultan.on('accountChange', ({ address, publicKey }) => {
  console.log('Account changed:', address);
});

// Network change
window.sultan.on('networkChange', ({ chainId, name }) => {
  console.log('Network changed:', name);
});
```

**Events:**
- `connect` - Wallet connected
- `disconnect` - Wallet disconnected
- `accountChange` - User switched accounts
- `networkChange` - Network changed

#### `sultan.off(event, handler?)`

Unsubscribe from events.

```javascript
window.sultan.off('connect', myHandler);
// Or remove all listeners for an event
window.sultan.off('connect');
```

### Network

#### `sultan.getNetwork()`

Get current network info.

```javascript
const network = await window.sultan.getNetwork();
console.log(network.chainId);  // "sultan-1"
console.log(network.name);     // "Sultan Mainnet"
console.log(network.rpcUrl);   // "http://..."
```

**Returns:** `Promise<{ chainId: string, name: string, rpcUrl: string }>`

### Custom Tokens

#### `sultan.addToken(token)`

Request to add a custom token to the wallet display.

```javascript
await window.sultan.addToken({
  denom: 'factory/sultan1.../mytoken',
  symbol: 'MYT',
  name: 'My Token',
  decimals: 9,
  logoUrl: 'https://...'
});
```

## Example: Complete Integration

```html
<!DOCTYPE html>
<html>
<head>
  <title>Sultan dApp</title>
</head>
<body>
  <button id="connect">Connect Wallet</button>
  <button id="send" disabled>Send 1 SLTN</button>
  <p id="status">Not connected</p>

  <script>
    const connectBtn = document.getElementById('connect');
    const sendBtn = document.getElementById('send');
    const status = document.getElementById('status');

    // Check wallet availability
    function checkWallet() {
      if (typeof window.sultan === 'undefined') {
        status.textContent = 'Please install Sultan Wallet';
        connectBtn.disabled = true;
        return false;
      }
      return true;
    }

    // Connect wallet
    connectBtn.onclick = async () => {
      if (!checkWallet()) return;
      
      try {
        const { address } = await window.sultan.connect();
        status.textContent = `Connected: ${address.slice(0, 12)}...`;
        sendBtn.disabled = false;
        connectBtn.textContent = 'Connected ✓';
      } catch (e) {
        status.textContent = 'Connection rejected';
      }
    };

    // Send transaction
    sendBtn.onclick = async () => {
      try {
        const { txHash } = await window.sultan.sendTransaction({
          type: 'transfer',
          to: 'sultan1recipient...',
          amount: '1000000000' // 1 SLTN
        });
        status.textContent = `Sent! TX: ${txHash.slice(0, 16)}...`;
      } catch (e) {
        status.textContent = `Error: ${e.message}`;
      }
    };

    // Listen for account changes
    if (window.sultan) {
      window.sultan.on('accountChange', ({ address }) => {
        status.textContent = `Account changed: ${address.slice(0, 12)}...`;
      });

      window.sultan.on('disconnect', () => {
        status.textContent = 'Disconnected';
        sendBtn.disabled = true;
        connectBtn.textContent = 'Connect Wallet';
      });
    }

    // Initial check
    checkWallet();
  </script>
</body>
</html>
```

## SDK (Coming Soon)

We're developing an official SDK for easier integration:

```bash
npm install @sultan/wallet-sdk
```

```javascript
import { SultanWallet } from '@sultan/wallet-sdk';

const wallet = new SultanWallet();

// Auto-connects if previously approved
await wallet.connect();

// Use typed transaction builders
const tx = wallet.transfer('sultan1...', '1.5'); // SLTN amount
await wallet.send(tx);
```

## Security Best Practices

1. **Always verify addresses** - Display the full address to users before transactions
2. **Show transaction details** - Let users review what they're signing
3. **Handle rejections gracefully** - Users may decline requests
4. **Don't store sensitive data** - The wallet handles all key management
5. **Use HTTPS** - Always serve your dApp over HTTPS in production

## Support

- Discord: [discord.gg/sultan](https://discord.gg/sultan)
- Telegram: [t.me/SultanChain](https://t.me/SultanChain)
- GitHub: [github.com/sultan-chain](https://github.com/sultan-chain)

## Changelog

### v1.0.0
- Initial release
- Connection management
- Message signing
- Transaction signing with broadcast
- Event system
- Custom token support
