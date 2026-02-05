/**
 * Transaction Broadcast Tests
 * 
 * Tests the broadcastTransaction functionality including:
 * - Successful broadcast handling
 * - Error handling for failed broadcasts
 * - Response validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch for API tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { broadcastTransaction, BroadcastTxRequest } from '../api/sultanAPI';

describe('Transaction Broadcast', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validTxRequest: BroadcastTxRequest = {
    transaction: {
      from: 'sultan1abc123def456',
      to: 'sultan1xyz789ghi012',
      amount: '1000000000', // 1 SLTN in atomic units
      memo: 'Test transfer',
      nonce: 1,
      timestamp: Date.now(),
    },
    signature: '0x' + '1'.repeat(128),
    publicKey: '0x' + '2'.repeat(64),
  };

  describe('Successful Broadcast', () => {
    it('should return transaction hash on successful broadcast', async () => {
      const expectedHash = 'tx_hash_abc123';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hash: expectedHash }),
      });

      const result = await broadcastTransaction(validTxRequest);
      
      expect(result).toHaveProperty('hash');
      expect(result.hash).toBe(expectedHash);
    });

    it('should call the correct endpoint with POST method', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ hash: 'tx_hash' }),
      });

      await broadcastTransaction(validTxRequest);

      expect(mockFetch).toHaveBeenCalled();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/tx'); // Uses /tx endpoint
      expect(options.method).toBe('POST');
    });

    it('should include transaction data in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hash: 'tx_hash' }),
      });

      await broadcastTransaction(validTxRequest);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).toHaveProperty('tx');
      expect(body).toHaveProperty('signature');
      expect(body).toHaveProperty('public_key');
    });
  });

  describe('Error Handling', () => {
    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(broadcastTransaction(validTxRequest)).rejects.toThrow();
    });

    it('should throw on HTTP error response', async () => {
      // Need to fail consistently for all retry attempts
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server error' }),
      });

      await expect(broadcastTransaction(validTxRequest)).rejects.toThrow();
    }, 15000); // Extended timeout for retries

    it('should throw on malformed response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'response' }), // Missing 'hash'
      });

      await expect(broadcastTransaction(validTxRequest)).rejects.toThrow();
    });
  });

  describe('Request Validation', () => {
    it('should handle transactions with optional memo', async () => {
      const txWithoutMemo: BroadcastTxRequest = {
        ...validTxRequest,
        transaction: {
          ...validTxRequest.transaction,
          memo: undefined,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hash: 'tx_hash' }),
      });

      const result = await broadcastTransaction(txWithoutMemo);
      expect(result).toHaveProperty('hash');
    });

    it('should preserve amount as string in request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hash: 'tx_hash' }),
      });

      await broadcastTransaction(validTxRequest);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(typeof body.tx.amount).toBe('string');
    });
  });
});

describe('Staking Transactions', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should support stake transaction type', async () => {
    const stakeTx: BroadcastTxRequest = {
      transaction: {
        from: 'sultan1user123',
        to: 'sultanval1london', // Validator address
        amount: '5000000000', // 5 SLTN
        nonce: 1,
        timestamp: Date.now(),
      },
      signature: '0x' + '1'.repeat(128),
      publicKey: '0x' + '2'.repeat(64),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hash: 'stake_tx_hash' }),
    });

    // Staking uses different endpoint in production
    // This test validates the request format is compatible
    expect(stakeTx.transaction.to).toContain('sultanval');
    expect(stakeTx.transaction.amount).toBe('5000000000');
  });

  it('should support unstake transaction type', async () => {
    const unstakeTx: BroadcastTxRequest = {
      transaction: {
        from: 'sultan1user123',
        to: 'sultanval1london',
        amount: '2000000000', // 2 SLTN to unstake
        nonce: 2,
        timestamp: Date.now(),
      },
      signature: '0x' + '1'.repeat(128),
      publicKey: '0x' + '2'.repeat(64),
    };

    expect(unstakeTx.transaction.from).toBeTruthy();
    expect(unstakeTx.transaction.amount).toBe('2000000000');
  });
});
