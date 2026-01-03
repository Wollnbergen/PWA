/**
 * Sultan API Tests
 * 
 * Tests for the RPC client including timeout, retry, and Zod validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { getBalance, getNetworkStatus, getValidators } from '../sultanAPI';

describe('Sultan API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('restApi timeout', () => {
    it('should handle AbortError gracefully', async () => {
      // Create an AbortError
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const result = await getBalance('sultan1test');
      
      // Should return fallback values
      expect(result.available).toBe('0');
      expect(result.nonce).toBe(0);
    });

    it('should return fallback on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await getBalance('sultan1test');
      
      // Should return fallback values  
      expect(result.available).toBe('0');
      expect(result.nonce).toBe(0);
    });
  });

  describe('restApi retry', () => {
    it('should retry on 5xx errors', async () => {
      // First call: 503, Second call: 503, Third call: success
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            address: 'sultan1test',
            balance: 1000000000,
            nonce: 5,
          }),
        });

      // Use real timers for this test
      vi.useRealTimers();
      
      const result = await getBalance('sultan1test');
      
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.available).toBe('1000000000');
      expect(result.nonce).toBe(5);
    });

    it('should fail after max retries', async () => {
      // All 3 calls return 503
      mockFetch.mockResolvedValue({ ok: false, status: 503 });

      // Use real timers for this test
      vi.useRealTimers();
      
      const result = await getBalance('sultan1test');
      
      // Should have tried 3 times
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // Should return fallback
      expect(result.available).toBe('0');
    });

    it('should retry on network errors', async () => {
      // First call: network error, Second call: success
      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            address: 'sultan1test',
            balance: 500000000,
            nonce: 2,
          }),
        });

      // Use real timers for this test
      vi.useRealTimers();
      
      const result = await getBalance('sultan1test');
      
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.available).toBe('500000000');
    });
  });

  describe('Zod response validation', () => {
    it('should validate balance response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          address: 'sultan1test',
          balance: 1000000000,
          nonce: 10,
        }),
      });

      const result = await getBalance('sultan1test');
      
      expect(result.address).toBe('sultan1test');
      expect(result.available).toBe('1000000000');
      expect(result.nonce).toBe(10);
    });

    it('should handle invalid balance response', async () => {
      // Missing required field
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          address: 'sultan1test',
          // Missing balance and nonce
        }),
      });

      const result = await getBalance('sultan1test');
      
      // Should return fallback on validation error
      expect(result.available).toBe('0');
    });

    it('should validate network status response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          height: 12345,
          validator_count: 5,
          shard_count: 1,
          validator_apy: 0.1333,
          sharding_enabled: false,
        }),
      });

      const result = await getNetworkStatus();
      
      expect(result.blockHeight).toBe(12345);
      expect(result.validatorCount).toBe(5);
      expect(result.stakingAPY).toBe(13.33);
    });

    it('should validate validators response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          {
            validator_address: 'sultanval1london',
            self_stake: 100000,
            delegated_stake: 500000,
            total_stake: 600000,
            commission_rate: 0.1,
            jailed: false,
            blocks_signed: 1000,
            blocks_missed: 10,
          },
        ]),
      });

      const result = await getValidators();
      
      expect(result).toHaveLength(1);
      expect(result[0].address).toBe('sultanval1london');
      expect(result[0].name).toBe('London Validator');
      expect(result[0].commission).toBe(0.1);
      expect(result[0].status).toBe('active');
    });
  });

  describe('User-Agent header', () => {
    it('should include User-Agent header in requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          address: 'sultan1test',
          balance: 0,
          nonce: 0,
        }),
      });

      await getBalance('sultan1test');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'Sultan-Wallet/1.0',
          }),
        })
      );
    });
  });
});
