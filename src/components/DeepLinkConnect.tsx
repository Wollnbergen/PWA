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
    console.log('[DeepLinkConnect] Component mounted, parsing session URL');
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
      // Format: sultan://wl?s=<sessionId>&k=<key>&b=<bridgeUrl>&n=<name>&o=<origin>
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
      console.log('[DeepLinkConnect] Status=connecting, calling connectFromQR');
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
      // Send approval with wallet address to dApp via relay
      await sendConnectionApproval(
        currentAccount.address,
        currentAccount.publicKey || ''
      );
      
      // Show confirmation screen (stay on wallet.sltn.io)
      setStatus('approved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send approval');
      setStatus('error');
    }
  };

  // Handle rejection
  const handleReject = () => {
    // Disconnect the WalletLink session
    disconnect();
    // Stay on wallet — navigate to dashboard
    navigate('/dashboard');
  };

  // Error state
  if (status === 'error') {
    return (
      <div className="screen-container" style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
        <h2 style={{ margin: '0 0 8px' }}>Connection Failed</h2>
        <p style={{ color: '#666', marginBottom: '24px' }}>{error}</p>
        <button 
          className="btn-primary"
          onClick={() => navigate('/dashboard')}
        >
          Return to Wallet
        </button>
      </div>
    );
  }

  // Approved - show confirmation screen
  if (status === 'approved') {
    return (
      <div className="screen-container" style={{
        padding: '24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #00c853, #00e676)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '40px',
          marginBottom: '24px',
          boxShadow: '0 4px 20px rgba(0, 200, 83, 0.3)'
        }}>
          ✓
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: '22px' }}>Connection Confirmed</h2>
        <p style={{ color: '#666', margin: '0 0 4px', fontSize: '15px' }}>
          Your wallet is now connected to
        </p>
        <p style={{ 
          color: 'var(--text-primary, #333)',
          fontWeight: 600,
          fontSize: '16px',
          margin: '0 0 8px'
        }}>
          {request?.dappName || 'the dApp'}
        </p>
        <p style={{
          color: '#888',
          fontSize: '13px',
          margin: '0 0 32px',
          wordBreak: 'break-all'
        }}>
          {currentAccount?.address
            ? `${currentAccount.address.slice(0, 12)}...${currentAccount.address.slice(-8)}`
            : ''}
        </p>
        <p style={{ color: '#999', fontSize: '13px', margin: '0 0 24px' }}>
          You can close this tab and return to {request?.dappName || 'the dApp'}.
        </p>
        <div style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '320px' }}>
          <button
            className="btn-secondary"
            style={{ flex: 1 }}
            onClick={() => navigate('/dashboard')}
          >
            Go to Wallet
          </button>
          <button
            className="btn-primary"
            style={{ flex: 1 }}
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
    const message = status === 'approving' 
      ? 'Sending approval...' 
      : 'Establishing secure connection with ' + (request?.dappName || 'dApp');
    return (
      <div className="screen-container" style={{ 
        padding: '24px', 
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh'
      }}>
        <div className="spinner" style={{ marginBottom: '24px' }} />
        <h2 style={{ margin: '0 0 8px' }}>{status === 'approving' ? 'Approving...' : 'Connecting...'}</h2>
        <p style={{ color: '#666' }}>
          {message}
        </p>
      </div>
    );
  }

  // Connected - show approval screen
  return (
    <div className="screen-container" style={{ padding: '24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{ 
          fontSize: '48px', 
          marginBottom: '16px',
          animation: 'pulse 2s infinite'
        }}>
          🔗
        </div>
        <h2 style={{ margin: '0 0 8px' }}>Connection Request</h2>
        <p style={{ color: '#666', margin: 0 }}>
          A dApp wants to connect to your wallet
        </p>
      </div>

      {/* dApp Info Card */}
      <div style={{
        background: 'var(--card-bg, #f5f5f5)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '24px',
            marginRight: '16px'
          }}>
            🌐
          </div>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '16px' }}>
              {request?.dappName || 'Unknown dApp'}
            </h3>
            <p style={{ 
              margin: 0, 
              fontSize: '13px', 
              color: '#666',
              wordBreak: 'break-all'
            }}>
              {request?.dappOrigin || 'Unknown origin'}
            </p>
          </div>
        </div>

        <div style={{ 
          borderTop: '1px solid var(--border-color, #e0e0e0)',
          paddingTop: '16px'
        }}>
          <p style={{ 
            margin: '0 0 8px', 
            fontSize: '14px',
            fontWeight: 500
          }}>
            This dApp will be able to:
          </p>
          <ul style={{ 
            margin: 0, 
            padding: '0 0 0 20px',
            fontSize: '13px',
            color: '#666'
          }}>
            <li>View your wallet address</li>
            <li>Request transaction signatures</li>
            <li>Request message signatures</li>
          </ul>
        </div>
      </div>

      {/* Warning */}
      <div style={{
        background: 'rgba(255, 193, 7, 0.1)',
        border: '1px solid rgba(255, 193, 7, 0.3)',
        borderRadius: '8px',
        padding: '12px 16px',
        marginBottom: '24px',
        fontSize: '13px',
        color: '#856404'
      }}>
        ⚠️ Only connect to sites you trust. Never approve transactions you don't understand.
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          className="btn-secondary"
          style={{ flex: 1 }}
          onClick={handleReject}
        >
          Reject
        </button>
        <button
          className="btn-primary"
          style={{ flex: 1 }}
          onClick={handleApprove}
        >
          Connect
        </button>
      </div>
    </div>
  );
}

export default DeepLinkConnect;
