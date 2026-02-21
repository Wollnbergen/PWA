/**
 * Dashboard Screen
 * 
 * Main wallet view with balance and quick actions.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useTheme } from '../hooks/useTheme';
import { useBalance, useStakingInfo, useTransactions } from '../hooks/useBalance';
import { SultanWallet } from '../core/wallet';
import { hapticFeedback } from '../utils/haptics';
import hodlLogo from '@assets/Asset_7@4x-8_1771061774583.png';
import './Dashboard.css';

// Animated counter hook for smooth balance transitions
function useAnimatedNumber(value: number, duration: number = 500) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  
  useEffect(() => {
    if (value === previousValue.current) return;
    
    const startValue = previousValue.current;
    const diff = value - startValue;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + diff * eased);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValue.current = value;
      }
    };
    
    requestAnimationFrame(animate);
  }, [value, duration]);
  
  return displayValue;
}

// Premium SVG Icons - matching Welcome screen style
const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

const ReceiveIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </svg>
);

const StakeIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const ArrowUpIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

const ArrowDownIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
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

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const NFTIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);





const GovernanceIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

// Skeleton loader component
const BalanceSkeleton = () => (
  <div className="balance-skeleton">
    <div className="skeleton-line skeleton-title"></div>
    <div className="skeleton-line skeleton-amount"></div>
    <div className="skeleton-breakdown">
      <div className="skeleton-line skeleton-item"></div>
      <div className="skeleton-line skeleton-item"></div>
    </div>
  </div>
);

const TransactionSkeleton = () => (
  <div className="tx-skeleton">
    {[1, 2, 3].map(i => (
      <div key={i} className="tx-skeleton-item">
        <div className="skeleton-circle"></div>
        <div className="skeleton-lines">
          <div className="skeleton-line"></div>
          <div className="skeleton-line short"></div>
        </div>
        <div className="skeleton-line amount"></div>
      </div>
    ))}
  </div>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const { lock, currentAccount } = useWallet();
  const { theme, setTheme } = useTheme();
  const { data: balanceData, isLoading: balanceLoading } = useBalance(currentAccount?.address);
  const { data: stakingData, isLoading: stakingLoading } = useStakingInfo(currentAccount?.address);
  const { data: rawTransactions, isLoading: txLoading } = useTransactions(currentAccount?.address, 3);
  
  // Deduplicate transactions by hash to prevent display bugs
  const transactions = rawTransactions ? 
    [...new Map(rawTransactions.map(tx => [tx.hash, tx])).values()] : 
    undefined;
  
  const [showCopied, setShowCopied] = useState(false);

  const toggleTheme = () => {
    hapticFeedback.soft();
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleCopyAddress = async () => {
    if (currentAccount?.address) {
      hapticFeedback.success();
      await navigator.clipboard.writeText(currentAccount.address);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    }
  };

  const handleLock = () => {
    hapticFeedback.medium();
    lock();
    navigate('/unlock');
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 12)}...${address.slice(-8)}`;
  };

  const formatBalance = (atomicBalance: string | undefined) => {
    if (!atomicBalance) return '0.00';
    return SultanWallet.formatSLTN(atomicBalance);
  };

  // Parse formatted balance string to number (removes commas)
  const parseFormattedBalance = (formatted: string): number => {
    const num = Number(formatted.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const available = parseFormattedBalance(formatBalance(balanceData?.available));
  const staked = parseFormattedBalance(formatBalance(stakingData?.staked));
  const totalBalance = available + staked;
  
  // Animated balance display
  const animatedBalance = useAnimatedNumber(isNaN(totalBalance) ? 0 : totalBalance, 600);
  const animatedAvailable = useAnimatedNumber(isNaN(available) ? 0 : available, 600);
  const animatedStaked = useAnimatedNumber(isNaN(staked) ? 0 : staked, 600);
  const isLoading = balanceLoading || stakingLoading;

  return (
    <div className="dashboard-screen">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <div className="account-selector">
              <span className="account-name">{currentAccount?.name || 'Account 1'}</span>
              <span className="account-address" onClick={handleCopyAddress}>
                {currentAccount?.address ? formatAddress(currentAccount.address) : '...'}
                {showCopied && <span className="copied-badge">Copied!</span>}
              </span>
            </div>
          </div>
          <div className="header-right" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px' }}>
            <button className="btn-icon theme-toggle" onClick={toggleTheme} title="Toggle theme" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="btn-icon" onClick={() => navigate('/settings')} title="Settings" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SettingsIcon />
            </button>
            <button className="btn-icon" onClick={handleLock} title="Lock Wallet" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LockIcon />
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main fade-in">
        {isLoading ? (
          <div className="balance-card scale-in">
            <BalanceSkeleton />
          </div>
        ) : (
          <div className="balance-card balance-card-loaded scale-in">
            <span className="balance-label fade-in stagger-1">Total Balance</span>
            <h1 className="balance-amount fade-in stagger-2">
              <span className="balance-value">
                {animatedBalance.toLocaleString(undefined, { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: animatedBalance > 1000000 ? 2 : 4 
                })}
              </span>
              <span className="balance-currency"> SLTN</span>
            </h1>
            
            <div className="balance-breakdown fade-in stagger-3">
              <div className="breakdown-item">
                <span>Available</span>
                <span className="breakdown-value">{animatedAvailable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: animatedAvailable > 1000000 ? 2 : 4 })} SLTN</span>
              </div>
              <div className="breakdown-item">
                <span>Staked</span>
                <span className="breakdown-value">{animatedStaked.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: animatedStaked > 1000000 ? 2 : 4 })} SLTN</span>
              </div>
            </div>
          </div>
        )}

        <div className="quick-actions fade-in stagger-3">
          <button className="action-btn scale-in stagger-1" onClick={() => { hapticFeedback.soft(); navigate('/send'); }}>
            <span className="action-icon"><SendIcon /></span>
            <span>Send</span>
          </button>
          <button className="action-btn scale-in stagger-2" onClick={() => { hapticFeedback.soft(); navigate('/receive'); }}>
            <span className="action-icon"><ReceiveIcon /></span>
            <span>Receive</span>
          </button>
          <button className="action-btn scale-in stagger-3" onClick={() => { hapticFeedback.soft(); navigate('/stake'); }}>
            <span className="action-icon"><StakeIcon /></span>
            <span>Stake</span>
          </button>
          <button className="action-btn scale-in stagger-4" onClick={() => { hapticFeedback.soft(); navigate('/governance'); }}>
            <span className="action-icon"><GovernanceIcon /></span>
            <span>Governance</span>
          </button>
          <button className="action-btn scale-in stagger-5" onClick={() => { hapticFeedback.soft(); navigate('/nfts'); }}>
            <span className="action-icon"><NFTIcon /></span>
            <span>NFTs</span>
          </button>
        </div>

        <div className="dex-banner fade-in stagger-4" onClick={() => window.open('https://hodlholdings.com', '_blank')}>
          <div className="dex-banner-content">
            <img src={hodlLogo} alt="HODL Holdings" className="dex-logo" />
            <div className="dex-banner-text">
              <span className="dex-title">Trade on HODL Holdings</span>
            </div>
          </div>
        </div>

        {stakingLoading ? (
          <div className="staking-summary fade-in stagger-4" style={{ height: '120px', opacity: 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="loading-shimmer" style={{ width: '100%', height: '100%', borderRadius: '12px' }}></div>
          </div>
        ) : stakingData && stakingData.staked !== '0' ? (
          <div className="staking-summary staking-active scale-in stagger-4">
            <div className="staking-header">
              <h3>Your Staking</h3>
              <span className="staking-badge">Active</span>
            </div>
            <div className="staking-info">
              <div className="staking-stat">
                <span className="stat-label">APY</span>
                <span className="stat-value accent">{stakingData?.stakingAPY || 13.33}%</span>
              </div>
              <div className="staking-stat">
                <span className="stat-label">Pending Rewards</span>
                <span className="stat-value rewards">{formatBalance(stakingData.pendingRewards)} SLTN</span>
              </div>
              <div className="staking-stat">
                <span className="stat-label">Staked</span>
                <span className="stat-value">{formatBalance(stakingData.staked)} SLTN</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="activity-section fade-in stagger-5">
          <div className="section-header">
            <h3>Recent Activity</h3>
            <button className="btn-link" onClick={() => navigate('/activity')}>
              See All →
            </button>
          </div>
          {txLoading ? (
            <TransactionSkeleton />
          ) : transactions && transactions.length > 0 ? (
            <div className="recent-transactions">
              {transactions.map((tx, index) => {
                const isSent = tx.from === currentAccount?.address;
                return (
                  <div 
                    key={tx.hash} 
                    className="tx-preview tx-animate" 
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <span className={`tx-icon ${isSent ? 'sent' : 'received'}`}>
                      {isSent ? <ArrowUpIcon /> : <ArrowDownIcon />}
                    </span>
                    <div className="tx-details">
                      <span className="tx-type">{isSent ? 'Sent' : 'Received'}</span>
                      <span className="tx-address">
                        {isSent ? tx.to.slice(0, 10) + '...' : tx.from.slice(0, 10) + '...'}
                      </span>
                    </div>
                    <span className={`tx-amount ${isSent ? 'sent' : 'received'}`}>
                      {isSent ? '-' : '+'}{formatBalance(tx.amount)} SLTN
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-activity fade-in">
              <div className="empty-icon" style={{ filter: 'none', opacity: 1 }}>📭</div>
              <h3 className="empty-title" style={{ color: 'var(--color-text)', marginTop: '12px' }}>No recent transactions</h3>
              <p className="empty-hint" style={{ color: 'var(--color-text-muted)', opacity: 0.8 }}>Send or receive SLTN to see activity here</p>
            </div>
          )}
        </div>
      </main>

    </div>
  );
}
