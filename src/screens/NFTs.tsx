/**
 * NFT Gallery Screen
 * 
 * Display Native NFTs from Sultan's Token Factory.
 * Sultan is a native Rust L1 - NOT Cosmos/CW721.
 * Supports viewing, sending, and NFT details.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useTheme } from '../hooks/useTheme';
import { sultanAPI } from '../api/sultanAPI';
import BackgroundAnimation from '../components/BackgroundAnimation';
import './NFTs.css';

// Premium SVG Icons
const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const SunIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const ImageIcon = () => (
  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// NFT Interface
interface NFT {
  tokenId: string;
  contractAddress: string;
  name: string;
  description?: string;
  image?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
  collection?: string;
}

interface NFTCollection {
  address: string;
  name: string;
  symbol: string;
  nfts: NFT[];
}

export default function NFTs() {
  const navigate = useNavigate();
  const { currentAccount, lock } = useWallet();
  const { theme, setTheme } = useTheme();
  
  const [collections, setCollections] = useState<NFTCollection[]>([]);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [view] = useState<'grid' | 'list'>('grid');
  
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleLock = () => {
    lock();
    navigate('/unlock');
  };

  // Fetch user's NFTs
  useEffect(() => {
    const fetchNFTs = async () => {
      if (!currentAccount?.address) return;
      
      setIsLoading(true);
      setError('');
      
      try {
        // Query Sultan's native token factory for user's NFTs
        const response = await sultanAPI.queryNFTs(currentAccount.address);
        
        if (response.collections) {
          setCollections(response.collections);
        } else {
          // Mock data for development - remove in production
          setCollections([
            {
              address: 'sultan1nft...',
              name: 'Sultan Genesis',
              symbol: 'SGEN',
              nfts: [
                {
                  tokenId: '1',
                  contractAddress: 'sultan1nft...',
                  name: 'Sultan #1',
                  description: 'The first Sultan NFT ever minted',
                  image: 'https://placeholder.pics/svg/300/1a1a2e/00d4aa/Sultan%20%231',
                  collection: 'Sultan Genesis',
                  attributes: [
                    { trait_type: 'Rarity', value: 'Legendary' },
                    { trait_type: 'Power', value: '100' }
                  ]
                },
                {
                  tokenId: '42',
                  contractAddress: 'sultan1nft...',
                  name: 'Sultan #42',
                  description: 'A rare Sultan NFT',
                  image: 'https://placeholder.pics/svg/300/1a1a2e/627eea/Sultan%20%2342',
                  collection: 'Sultan Genesis',
                  attributes: [
                    { trait_type: 'Rarity', value: 'Epic' },
                    { trait_type: 'Power', value: '88' }
                  ]
                }
              ]
            }
          ]);
        }
      } catch (err) {
        console.error('Failed to fetch NFTs:', err);
        // Show empty state instead of error for now
        setCollections([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNFTs();
  }, [currentAccount?.address]);

  const totalNFTs = collections.reduce((sum, col) => sum + col.nfts.length, 0);

  // NFT Detail Modal
  if (selectedNFT) {
    return (
      <div className="nft-screen">
        <header className="screen-header">
          <button className="btn-back" onClick={() => setSelectedNFT(null)}>
            <BackIcon />
          </button>
          <h2>{selectedNFT.name}</h2>
          <button className="btn-icon theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </header>

        <div className="nft-detail fade-in">
          <div className="nft-image-large">
            {selectedNFT.image ? (
              <img src={selectedNFT.image} alt={selectedNFT.name} />
            ) : (
              <div className="nft-placeholder">
                <ImageIcon />
              </div>
            )}
          </div>

          <div className="nft-info">
            <div className="nft-collection-badge">{selectedNFT.collection}</div>
            <h2>{selectedNFT.name}</h2>
            {selectedNFT.description && (
              <p className="nft-description">{selectedNFT.description}</p>
            )}

            {selectedNFT.attributes && selectedNFT.attributes.length > 0 && (
              <div className="nft-attributes">
                <h4>Attributes</h4>
                <div className="attributes-grid">
                  {selectedNFT.attributes.map((attr, index) => (
                    <div key={index} className="attribute-card">
                      <span className="attr-type">{attr.trait_type}</span>
                      <span className="attr-value">{attr.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="nft-meta">
              <div className="meta-row">
                <span>Token ID</span>
                <span className="mono">#{selectedNFT.tokenId}</span>
              </div>
              <div className="meta-row">
                <span>Contract</span>
                <span className="mono">{selectedNFT.contractAddress.slice(0, 16)}...</span>
              </div>
            </div>

            <div className="nft-actions">
              <button 
                className="btn btn-primary"
                onClick={() => navigate(`/send?nft=${selectedNFT.tokenId}&contract=${selectedNFT.contractAddress}`)}
              >
                <SendIcon /> Send NFT
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => window.open(`https://x.sltn.io/nft/${selectedNFT.contractAddress}/${selectedNFT.tokenId}`, '_blank')}
              >
                <ExternalLinkIcon /> View on Explorer
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nft-screen">
      <BackgroundAnimation />
      <header className="screen-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          <BackIcon />
        </button>
        <h2>NFT Gallery</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn-icon theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="btn-icon" onClick={() => navigate('/settings')} title="Settings">
            <SettingsIcon />
          </button>
          <button className="btn-icon" onClick={handleLock} title="Lock Wallet">
            <LockIcon />
          </button>
        </div>
      </header>

      <div className="nft-content fade-in">
        {isLoading ? (
          <div className="nft-loading">
            <div className="spinner"></div>
            <p>Loading your NFTs...</p>
          </div>
        ) : error ? (
          <div className="nft-error">
            <p className="text-error">{error}</p>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              Try Again
            </button>
          </div>
        ) : totalNFTs === 0 ? (
          <div className="nft-empty">
            <div className="empty-icon">
              <ImageIcon />
            </div>
            <h3>No NFTs Yet</h3>
            <p className="text-muted">
              Your NFTs will appear here once you receive or mint them.
            </p>
          </div>
        ) : (
          <>
            <div className="nft-stats">
              <div className="stat-card">
                <span className="stat-value">{totalNFTs}</span>
                <span className="stat-label">Total NFTs</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{collections.length}</span>
                <span className="stat-label">Collections</span>
              </div>
            </div>

            {collections.map((collection) => (
              <div key={collection.address} className="nft-collection">
                <div className="collection-header">
                  <h3>{collection.name}</h3>
                  <span className="collection-count">{collection.nfts.length} items</span>
                </div>
                
                <div className={`nft-grid ${view}`}>
                  {collection.nfts.map((nft) => (
                    <div 
                      key={`${nft.contractAddress}-${nft.tokenId}`} 
                      className="nft-card"
                      onClick={() => setSelectedNFT(nft)}
                    >
                      <div className="nft-image">
                        {nft.image ? (
                          <img src={nft.image} alt={nft.name} loading="lazy" />
                        ) : (
                          <div className="nft-placeholder">
                            <ImageIcon />
                          </div>
                        )}
                      </div>
                      <div className="nft-card-info">
                        <span className="nft-name">{nft.name}</span>
                        <span className="nft-id">#{nft.tokenId}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
