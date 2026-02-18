/**
 * NFT Gallery Tests
 * 
 * Tests for the NFT Gallery screen and Sultan native NFT integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import NFTs from '../screens/NFTs';
import { sultanAPI } from '../api/sultanAPI';

// Mock the hooks
vi.mock('../hooks/useWallet', () => ({
  useWallet: () => ({
    currentAccount: {
      address: 'sultan1testaddress12345678901234567890',
      name: 'Test Account',
      index: 0,
      publicKey: 'testpubkey',
    },
  }),
}));

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: vi.fn(),
  }),
}));

// Mock the API
vi.mock('../api/sultanAPI', () => ({
  sultanAPI: {
    queryNFTs: vi.fn(),
  },
}));

// Unused variable removed
// const mockNFTResponse = ...

const renderNFTs = () => {
  return render(
    <BrowserRouter>
      <NFTs />
    </BrowserRouter>
  );
};

describe('NFT Gallery Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading state initially', () => {
    vi.mocked(sultanAPI.queryNFTs).mockImplementation(() => new Promise(() => {}));
    renderNFTs();
    
    expect(screen.getByText('Loading your NFTs...')).toBeInTheDocument();
  });

  it('should show empty state when no NFTs', async () => {
    vi.mocked(sultanAPI.queryNFTs).mockResolvedValue([]);
    renderNFTs();
    
    await waitFor(() => {
      expect(screen.getByText('No NFTs Yet')).toBeInTheDocument();
    });
  });

  it('should display NFT collections when available', async () => {
    // Mock should return an array of NFTs, not { collections: [...] }
    vi.mocked(sultanAPI.queryNFTs).mockResolvedValue([
      {
        collection: 'sultan1nftcontract123',
        tokenId: '1',
        name: 'Sultan #1',
        image: 'https://example.com/nft1.png',
        owner: 'sultan1testaddress12345678901234567890',
        description: 'The first Sultan NFT'
      },
      {
        collection: 'sultan1nftcontract123',
        tokenId: '42',
        name: 'Sultan #42',
        image: 'https://example.com/nft42.png',
        owner: 'sultan1testaddress12345678901234567890',
        description: 'A rare Sultan NFT'
      }
    ]);
    renderNFTs();
    
    await waitFor(() => {
      // Logic inside component defaults name to "Sultan Collection" if metadata missing
      expect(screen.getByText('Sultan Collection')).toBeInTheDocument();
      expect(screen.getByText('Sultan #1')).toBeInTheDocument();
      expect(screen.getByText('Sultan #42')).toBeInTheDocument();
    });
  });

  it('should show stats with correct counts', async () => {
    vi.mocked(sultanAPI.queryNFTs).mockResolvedValue([
      {
        collection: 'sultan1nftcontract123',
        tokenId: '1',
        name: 'Sultan #1',
        image: 'https://example.com/nft1.png',
        owner: 'sultan1testaddress12345678901234567890',
      },
      {
        collection: 'sultan1nftcontract123',
        tokenId: '42',
        name: 'Sultan #42',
        image: 'https://example.com/nft42.png',
        owner: 'sultan1testaddress12345678901234567890',
      }
    ]);
    renderNFTs();
    
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument(); // Total NFTs
      expect(screen.getByText('1')).toBeInTheDocument(); // Collections
      expect(screen.getByText('2 items')).toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    vi.mocked(sultanAPI.queryNFTs).mockRejectedValue(new Error('Network error'));
    renderNFTs();
    
    // Should show empty state, not crash
    await waitFor(() => {
      expect(screen.getByText('No NFTs Yet')).toBeInTheDocument();
    });
  });

  it('should have NFT Gallery in header', async () => {
    vi.mocked(sultanAPI.queryNFTs).mockResolvedValue([]);
    renderNFTs();
    
    expect(screen.getByText('NFT Gallery')).toBeInTheDocument();
  });
});

describe('NFT API Integration', () => {
  it('should call queryNFTs with correct address', async () => {
    vi.mocked(sultanAPI.queryNFTs).mockResolvedValue([]);
    renderNFTs();
    
    await waitFor(() => {
      expect(sultanAPI.queryNFTs).toHaveBeenCalledWith('sultan1testaddress12345678901234567890');
    });
  });
});
