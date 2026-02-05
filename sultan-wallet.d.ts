/**
 * Sultan Wallet TypeScript Definitions
 * 
 * Add this file to your project for full TypeScript support
 * when integrating with Sultan Wallet.
 */

export interface SultanAccount {
  address: string;
  publicKey: string;
}

export interface SultanBalance {
  available: string;
  staked: string;
  rewards: string;
}

export interface SultanNetwork {
  chainId: string;
  name: string;
  rpcUrl: string;
}

export interface SignMessageResult {
  signature: string;
  publicKey: string;
}

export interface SignTransactionResult {
  signature: string;
  publicKey: string;
  transaction: Record<string, unknown>;
  txHash?: string;
}

export interface SultanToken {
  denom: string;
  symbol: string;
  name?: string;
  decimals?: number;
  logoUrl?: string;
}

// Transaction types
export interface TransferTransaction {
  type: 'transfer';
  to: string;
  amount: string;
  memo?: string;
}

export interface SwapTransaction {
  type: 'swap';
  pool_id: string;
  token_in: string;
  amount_in: string;
  min_out: string;
}

export interface AddLiquidityTransaction {
  type: 'add_liquidity';
  pool_id: string;
  amount_a: string;
  amount_b: string;
}

export interface RemoveLiquidityTransaction {
  type: 'remove_liquidity';
  pool_id: string;
  lp_amount: string;
}

export interface CreateTokenTransaction {
  type: 'create_token';
  name: string;
  symbol: string;
  decimals: number;
  initial_supply: string;
}

export interface StakeTransaction {
  type: 'stake';
  validator_address: string;
  amount: string;
}

export interface UnstakeTransaction {
  type: 'unstake';
  validator_address: string;
  amount: string;
}

export type SultanTransaction =
  | TransferTransaction
  | SwapTransaction
  | AddLiquidityTransaction
  | RemoveLiquidityTransaction
  | CreateTokenTransaction
  | StakeTransaction
  | UnstakeTransaction;

export type SultanEventType = 'connect' | 'disconnect' | 'accountChange' | 'networkChange';

export interface SultanProvider {
  /** Version of the provider */
  readonly version: string;
  
  /** Identifies this as Sultan Wallet */
  readonly isSultan: true;

  /**
   * Request connection to wallet
   * Opens popup for user approval
   */
  connect(): Promise<SultanAccount>;

  /**
   * Disconnect from wallet
   */
  disconnect(): Promise<void>;

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean;

  /**
   * Get connected address
   */
  getAddress(): Promise<string | null>;

  /**
   * Get connected public key
   */
  getPublicKey(): Promise<string | null>;

  /**
   * Get account balance
   */
  getBalance(): Promise<SultanBalance>;

  /**
   * Sign arbitrary message
   * Opens popup for user approval
   */
  signMessage(message: string | Uint8Array): Promise<SignMessageResult>;

  /**
   * Sign a transaction
   * Opens popup for user approval
   * @param transaction - Transaction to sign
   * @param broadcast - Whether to broadcast after signing (default: false)
   */
  signTransaction(
    transaction: SultanTransaction | Record<string, unknown>,
    broadcast?: boolean
  ): Promise<SignTransactionResult>;

  /**
   * Sign and broadcast a transaction
   * Convenience wrapper for signTransaction with broadcast=true
   */
  sendTransaction(
    transaction: SultanTransaction | Record<string, unknown>
  ): Promise<SignTransactionResult>;

  /**
   * Request to add a custom token
   */
  addToken(token: SultanToken): Promise<boolean>;

  /**
   * Get current network info
   */
  getNetwork(): Promise<SultanNetwork>;

  /**
   * Subscribe to events
   */
  on(event: 'connect', handler: (account: SultanAccount) => void): this;
  on(event: 'disconnect', handler: () => void): this;
  on(event: 'accountChange', handler: (account: SultanAccount) => void): this;
  on(event: 'networkChange', handler: (network: SultanNetwork) => void): this;

  /**
   * Unsubscribe from events
   */
  off(event: SultanEventType, handler?: Function): this;

  /**
   * Check if Sultan Wallet is available
   */
  static isAvailable(): boolean;
}

// Extend Window interface
declare global {
  interface Window {
    sultan?: SultanProvider;
  }

  interface WindowEventMap {
    'sultan#initialized': CustomEvent<void>;
  }
}

/**
 * Helper to wait for Sultan Wallet to be ready
 */
export function waitForSultan(timeout = 3000): Promise<SultanProvider> {
  return new Promise((resolve, reject) => {
    if (window.sultan) {
      resolve(window.sultan);
      return;
    }

    const timeoutId = setTimeout(() => {
      window.removeEventListener('sultan#initialized', handler);
      reject(new Error('Sultan Wallet not detected'));
    }, timeout);

    const handler = () => {
      clearTimeout(timeoutId);
      if (window.sultan) {
        resolve(window.sultan);
      } else {
        reject(new Error('Sultan Wallet not initialized'));
      }
    };

    window.addEventListener('sultan#initialized', handler, { once: true });
  });
}

/**
 * Format SLTN amount from base units (9 decimals)
 */
export function formatSLTN(baseUnits: string | bigint): string {
  const value = typeof baseUnits === 'string' ? BigInt(baseUnits) : baseUnits;
  const whole = value / BigInt(1e9);
  const fraction = value % BigInt(1e9);
  
  if (fraction === BigInt(0)) {
    return whole.toString();
  }
  
  const fractionStr = fraction.toString().padStart(9, '0').replace(/0+$/, '');
  return `${whole}.${fractionStr}`;
}

/**
 * Parse SLTN amount to base units (9 decimals)
 */
export function parseSLTN(displayUnits: string): bigint {
  const [whole, fraction = ''] = displayUnits.split('.');
  const paddedFraction = fraction.padEnd(9, '0').slice(0, 9);
  return BigInt(whole) * BigInt(1e9) + BigInt(paddedFraction);
}

export default SultanProvider;
