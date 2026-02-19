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
import { AlertCircle, Link, Globe, Shield, Check } from 'lucide-react';
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
  const { connectFromQR, disconnect } = useWalletLink();
  
  const [request, setRequest] = useState<ConnectionRequest | null>(null);
  const [status, setStatus] = useState<'parsing' | 'connecting' | 'connected' | 'error'>('parsing');
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
      // Decode the session data
      const sessionData = decodeURIComponent(sessionParam);
      
      // Parse to extract dApp info if present
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
    setTimeout(() => {
      if (request?.returnUrl) {
        window.location.href = request.returnUrl;
      } else {
        navigate('/dashboard');
      }
    }, 500);
  };

  // Handle rejection
  const handleReject = () => {
    disconnect();
    if (request?.returnUrl) {
      window.location.href = request.returnUrl;
    } else {
      navigate('/dashboard');
    }
  };

  // Error state
  if (status === 'error' || searchParams.get('test') === 'error') {
    return (
      <div className="approval-screen">
        <div className="request-card" style={{ marginTop: '40px' }}>
          <div className="type-icon" style={{ background: 'rgba(255, 68, 68, 0.1)', color: 'var(--color-error)' }}>
            <AlertCircle size={32} />
          </div>
          <h2 className="request-title">Connection Failed</h2>
          <p className="request-description" style={{ color: 'var(--color-error)' }}>
            {error || 'An unexpected error occurred during connection.'}
          </p>
        </div>

        <div className="approval-actions" style={{ marginTop: '24px' }}>
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

  // Connected - show approval screen
  if (status === 'connected' || searchParams.get('test') === 'approve') {
    return (
      <div className="approval-screen">
        <header className="approval-header">
          <Shield className="shield-icon" />
          <span className="header-title">Sultan Wallet</span>
        </header>

        <div className="request-card">
          <div className="type-icon connect">
            <Link size={32} />
          </div>
          <h2 className="request-title">Connection Request</h2>
          <p className="request-description">
            A dApp wants to connect to your wallet
          </p>
        </div>

        <div className="origin-card">
          <div className="origin-favicon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
            <Globe size={24} />
          </div>
          <div className="origin-info">
            <span className="origin-name">{request?.dappName || 'HODL Holdings'}</span>
            <span className="origin-url">{request?.dappOrigin || 'https://hodlholdings.com'}</span>
          </div>
        </div>

        <div className="permissions-list">
          <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px', color: 'var(--color-text)' }}>
            This dApp will be able to:
          </p>
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

        <div className="warning-banner" style={{ marginTop: 'auto' }}>
          <AlertCircle className="warning-icon" size={20} />
          <span>Only connect to sites you trust. Never approve transactions you don't understand.</span>
        </div>

        <div className="approval-actions">
          <button
            className="btn btn-reject"
            onClick={handleReject}
          >
            Reject
          </button>
          <button
            className="btn btn-approve"
            onClick={handleApprove}
          >
            Connect
          </button>
        </div>
      </div>
    );
  }
}

export default DeepLinkConnect;
