/**
 * Deep Link Connect Handler
 * 
 * Handles incoming deep links from dApps on the same mobile device.
 * URL format: https://wallet.sltn.io/connect?session=<encoded-session-data>
 * 
 * Flow:
 * 1. dApp generates WalletLink session
 * 2. dApp redirects to this URL with session data
 * 3. This screen parses session and connects via WalletLink
 * 4. User approves connection
 * 5. Redirects back to dApp (via document.referrer or return URL)
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWalletLink } from '../hooks/useWalletLink';
import { useWallet } from '../hooks/useWallet';

import { X, Check, Globe, AlertTriangle } from 'lucide-react';
import '../styles/approval.css';

interface ConnectionRequest {
  sessionData: string;
  dappName?: string;
  dappOrigin?: string;
  returnUrl?: string;
}

export function DeepLinkConnect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { connectFromQR, disconnect, sendConnectionApproval } = useWalletLink();
  const { currentAccount } = useWallet();
  
  const [request, setRequest] = useState<ConnectionRequest | null>(null);
  const [status, setStatus] = useState<'parsing' | 'connecting' | 'connected' | 'error' | 'approving' | 'approved'>('parsing');
  const [error, setError] = useState<string | null>(null);

  // Parse session from URL on mount
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    const returnUrl = searchParams.get('return') || document.referrer || null;
    
    if (!sessionParam) {
      setError('No session data provided');
      setStatus('error');
      return;
    }

    try {
      const sessionData = decodeURIComponent(sessionParam);
      const url = new URL(sessionData);
      const dappName = url.searchParams.get('n') || 'Unknown dApp';
      const dappOrigin = url.searchParams.get('o') || 'Unknown origin';
      
      setRequest({
        sessionData,
        dappName,
        dappOrigin,
        returnUrl: returnUrl || undefined,
      });
      
      setStatus('connecting');
    } catch (e) {
      setError(`Invalid session format: ${(e as Error).message}`);
      setStatus('error');
    }
  }, [searchParams]);

  // Auto-connect when request is parsed
  useEffect(() => {
    if (status === 'connecting' && request?.sessionData) {
      connectFromQR(request.sessionData)
        .then((success) => {
          if (success) {
            setStatus('connected');
          } else {
            setError('Connection failed');
            setStatus('error');
          }
        })
        .catch((e) => {
          setError(e.message);
          setStatus('error');
        });
    }
  }, [status, request, connectFromQR]);

  // Handle connection approval
  const handleApprove = async () => {
    if (!currentAccount) {
      setError('No wallet account available');
      setStatus('error');
      return;
    }

    setStatus('approving');
    
    try {
      await sendConnectionApproval(
        currentAccount.address,
        currentAccount.publicKey || ''
      );
      setStatus('approved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send approval');
      setStatus('error');
    }
  };

  // Handle rejection
  const handleReject = () => {
    disconnect();
    navigate('/dashboard');
  };

  // Error state
  if (status === 'error') {
    return (
      <div className="approval-screen">
        <div className="request-card">
          <div className="type-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <X size={32} />
          </div>
          <h2 className="request-title">Connection Failed</h2>
          <p className="request-description">{error}</p>
        </div>
        <div className="approval-actions">
          <button 
            className="btn btn-approve"
            onClick={() => navigate('/dashboard')}
          >
            Return to Wallet
          </button>
        </div>
      </div>
    );
  }

  // Approved - show confirmation screen
  if (status === 'approved') {
    return (
      <div className="approval-screen">
        <div className="request-card">
          <div className="type-icon" style={{ background: 'rgba(0, 255, 159, 0.1)', color: 'var(--color-success)' }}>
            <Check size={32} />
          </div>
          <h2 className="request-title">Connection Confirmed</h2>
          <p className="request-description">
            Your wallet is now connected to<br/>
            <strong style={{ color: 'var(--color-text)' }}>{request?.dappName || 'the dApp'}</strong>
          </p>
        </div>

        <div className="details-card">
          <div className="detail-row">
            <span className="detail-label">Account</span>
            <span className="detail-value">
              {currentAccount?.address
                ? `${currentAccount.address.slice(0, 12)}...${currentAccount.address.slice(-8)}`
                : ''}
            </span>
          </div>
        </div>

        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', textAlign: 'center', maxWidth: '320px' }}>
          You can close this tab and return to {request?.dappName || 'the dApp'}.
        </p>

        <div className="approval-actions">
          <button
            className="btn btn-approve"
            onClick={() => navigate('/dashboard')}
          >
            Go to Wallet
          </button>
          <button
            className="btn btn-reject"
            onClick={() => window.close()}
          >
            Close Tab
          </button>
        </div>
      </div>
    );
  }

  // Connecting or approving state
  if (status === 'connecting' || status === 'parsing' || status === 'approving') {
    return (
      <div className="approval-screen">
        <div className="spinner" />
        <h2 className="request-title" style={{ marginTop: '24px' }}>
          {status === 'approving' ? 'Approving...' : 'Connecting...'}
        </h2>
        <p className="request-description">
          {status === 'approving' 
            ? 'Sending approval...' 
            : `Establishing secure connection with ${request?.dappName || 'dApp'}...`}
        </p>
      </div>
    );
  }

  // Connected - show approval screen
  return (
    <div className="approval-screen">
      {/* Origin Card */}
      <div className="origin-card">
        <div className="type-icon connect" style={{ margin: 0, width: '48px', height: '48px' }}>
          <Globe size={24} />
        </div>
        <div className="origin-info">
          <span className="origin-name">{request?.dappName || 'Unknown dApp'}</span>
          <span className="origin-url">{request?.dappOrigin || 'Unknown origin'}</span>
        </div>
      </div>

      {/* Request Content */}
      <div className="request-card">
        <h2 className="request-title">Connection Request</h2>
        <p className="request-description">A dApp wants to connect to your wallet</p>
        
        <div className="permissions-list">
          <div className="permission-item">
            <Check size={16} className="text-success" />
            <span>View your wallet address</span>
          </div>
          <div className="permission-item">
            <Check size={16} className="text-success" />
            <span>Request transaction signatures</span>
          </div>
          <div className="permission-item">
            <Check size={16} className="text-success" />
            <span>Request message signatures</span>
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="warning-banner">
        <AlertTriangle className="warning-icon" />
        <span>Only connect to sites you trust. Never approve transactions you don't understand.</span>
      </div>

      {/* Actions */}
      <div className="approval-actions">
        <button
          className="btn btn-approve"
          onClick={handleApprove}
        >
          Connect
        </button>
        <button
          className="btn btn-reject"
          onClick={handleReject}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export default DeepLinkConnect;
