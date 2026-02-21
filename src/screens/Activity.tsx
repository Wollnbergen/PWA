/**
 * Activity Screen
 * 
 * Transaction history for the current account.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useTransactions } from '../hooks/useBalance';
import { useTheme } from '../hooks/useTheme';
import { SultanWallet } from '../core/wallet';
import './Activity.css';

// Premium SVG Icons
const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const ArrowUpIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

const ArrowDownIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </svg>
);

const ActivityEmptyIcon = () => (
  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
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

export default function Activity() {
  const navigate = useNavigate();
  const { currentAccount } = useWallet();
  const { data: transactions, isLoading, error, refetch } = useTransactions(currentAccount?.address);
  const { theme, setTheme } = useTheme();
  
  const [filter, setFilter] = useState<'all' | 'sent' | 'received'>('all');

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      if (hours === 0) {
        const mins = Math.floor(diff / 60000);
        return mins <= 1 ? 'Just now' : `${mins} mins ago`;
      }
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    }
    
    // Less than 7 days
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return days === 1 ? 'Yesterday' : `${days} days ago`;
    }
    
    // Otherwise show date
    return date.toLocaleDateString();
  };

  const filteredTransactions = transactions?.filter(tx => {
    if (filter === 'all') return true;
    if (filter === 'sent') return tx.from === currentAccount?.address;
    if (filter === 'received') return tx.to === currentAccount?.address;
    return true;
  }) || [];

  const formatAddress = (address: string) => {
    return `${address.slice(0, 10)}...${address.slice(-6)}`;
  };

  return (
    <div className="activity-screen">
      <header className="screen-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          <BackIcon />
        </button>
        <h2>Activity</h2>
        <div className="header-actions">
          <button className="btn-icon" onClick={() => refetch()} title="Refresh">
            <RefreshIcon />
          </button>
          <button className="btn-icon theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <div className="activity-filters">
        <button 
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button 
          className={`filter-btn ${filter === 'sent' ? 'active' : ''}`}
          onClick={() => setFilter('sent')}
        >
          Sent
        </button>
        <button 
          className={`filter-btn ${filter === 'received' ? 'active' : ''}`}
          onClick={() => setFilter('received')}
        >
          Received
        </button>
      </div>

      <div className="activity-list fade-in">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>Loading transactions...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>Failed to load transactions</p>
            <button className="btn btn-secondary" onClick={() => refetch()}>
              Try Again
            </button>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><ActivityEmptyIcon /></div>
            <p>No transactions yet</p>
            <p className="text-muted">Your transaction history will appear here</p>
          </div>
        ) : (
          filteredTransactions.map(tx => {
            const isSent = tx.from === currentAccount?.address;
            const amount = SultanWallet.formatSLTN(tx.amount);
            
            return (
              <div key={tx.hash} className="tx-item slide-in" style={{ animationDelay: `${(filteredTransactions.indexOf(tx) % 10) * 50}ms` }}>
                <div className={`tx-icon ${isSent ? 'sent' : 'received'}`}>
                  {isSent ? <ArrowUpIcon /> : <ArrowDownIcon />}
                </div>
                <div className="tx-details">
                  <div className="tx-primary">
                    <span className="tx-type">{isSent ? 'Sent' : 'Received'}</span>
                    <span className={`tx-amount ${isSent ? 'sent' : 'received'}`}>
                      {isSent ? '-' : '+'}{amount} SLTN
                    </span>
                  </div>
                  <div className="tx-secondary">
                    <span className="tx-address">
                      {isSent ? `To: ${formatAddress(tx.to)}` : `From: ${formatAddress(tx.from)}`}
                    </span>
                    <span className="tx-time">{formatDate(tx.timestamp)}</span>
                  </div>
                </div>
                <div className={`tx-status ${tx.status}`}>
                  {tx.status === 'confirmed' && <CheckIcon />}
                  {tx.status === 'pending' && <ClockIcon />}
                  {tx.status === 'failed' && <XIcon />}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
