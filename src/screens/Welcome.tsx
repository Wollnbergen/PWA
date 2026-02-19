/**
 * Welcome Screen
 * 
 * First screen shown to new users - create or import wallet.
 * Premium design matching the Unlock screen aesthetic.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BackgroundAnimation from '../components/BackgroundAnimation';
import { isExtensionContext, getPendingApprovals, rejectRequest } from '../core/extension-bridge';
import './Welcome.css';

// Sultan Crown Logo - uses PNG images, switches based on theme
const SultanLogo = ({ size = 56, isDark }: { size?: number; isDark: boolean }) => (
  <img 
    src={isDark ? "/sultan-logo-dark.png" : "/sultan-logo-light.png"} 
    alt="Sultan" 
    width={size}
    className="sultan-logo-img"
    style={{ height: 'auto' }}
  />
);

// Premium SVG Icons
const StakeIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const NFTIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

const VoteIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export default function Welcome() {
  const navigate = useNavigate();
  const isDark = true;

  useEffect(() => {
    // Ensure dark mode is set on welcome screen
    document.documentElement.setAttribute('data-theme', 'dark');
    
    // If running as extension and there are pending approvals,
    // reject them since no wallet exists yet
    if (isExtensionContext()) {
      getPendingApprovals().then(pending => {
        if (pending.length > 0) {
          console.log('[Sultan] Rejecting pending approvals - no wallet created');
          pending.forEach(req => rejectRequest(req.id));
        }
      }).catch(() => {});
    }
  }, []);

  return (
    <>
      <BackgroundAnimation />
      <div className="welcome-screen">

        <div className="welcome-content fade-in">
          <div className="logo-container">
            <div className="sultan-icon">
              <SultanLogo size={56} isDark={isDark} />
            </div>
            <h1>Wallet</h1>
            <p className="tagline">Asset management made easy: earn, own, govern</p>
          </div>

          <div className="features-card">
            <div className="feature feature-item-1">
              <div className="feature-icon-wrapper">
                <StakeIcon />
              </div>
              <div className="feature-text">
                <span className="feature-title">Staking Rewards</span>
                <span className="feature-desc">Earn up to 13.33% APY</span>
              </div>
            </div>
            <div className="feature feature-item-2">
              <div className="feature-icon-wrapper">
                <NFTIcon />
              </div>
              <div className="feature-text">
                <span className="feature-title">NFT Gallery</span>
                <span className="feature-desc">Manage digital collectibles</span>
              </div>
            </div>
            <div className="feature feature-item-3">
              <div className="feature-icon-wrapper">
                <ShieldIcon />
              </div>
              <div className="feature-text">
                <span className="feature-title">Self-Custody</span>
                <span className="feature-desc">You control your keys</span>
              </div>
            </div>
            <div className="feature feature-item-4">
              <div className="feature-icon-wrapper">
                <VoteIcon />
              </div>
              <div className="feature-text">
                <span className="feature-title">Governance</span>
                <span className="feature-desc">Vote on proposals</span>
              </div>
            </div>
          </div>

          <div className="button-group">
            <button 
              className="btn btn-primary"
              onClick={() => navigate('/create')}
            >
              <PlusIcon />
              Create New Wallet
            </button>
            
            <button 
              className="btn btn-secondary"
              onClick={() => navigate('/import')}
            >
              <DownloadIcon />
              Import Existing Wallet
            </button>
          </div>

          <div className="footer-badge">
            <span>v1.6.8</span>
            <span className="separator">•</span>
            <span>Made by Sultan Labs</span>
          </div>
        </div>
      </div>
    </>
  );
}
