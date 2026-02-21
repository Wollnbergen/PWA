/**
 * Sultan Wallet - Approval Screen
 * 
 * Displays pending dApp approval requests and allows user to approve/reject.
 * Includes transaction simulation preview and "Remember this site" option.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Check, AlertTriangle, Globe, FileText, ArrowRightLeft, Coins, Star } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { broadcastTransaction } from '../api/sultanAPI';
import {
  ApprovalRequest,
  getPendingApprovals,
  approveRequest,
  rejectRequest,
  formatOrigin,
  getFaviconUrl,
  isExtensionContext,
  addTrustedSite,
  isTrustedSite
} from '../core/extension-bridge';
import { TransactionSimulation } from '../components/TransactionSimulation';
import '../styles/approval.css';

export function ApprovalScreen() {
  const navigate = useNavigate();
  const { wallet, currentAccount, isInitialized, isLocked } = useWallet();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [rememberSite, setRememberSite] = useState(false);
  const [alreadyTrusted, setAlreadyTrusted] = useState(false);

  // Security check: Must have wallet created and unlocked
  useEffect(() => {
    if (!isInitialized) {
      // No wallet created - reject all pending approvals and go to welcome
      if (isExtensionContext()) {
        getPendingApprovals().then(pending => {
          pending.forEach(req => rejectRequest(req.id));
        });
      }
      navigate('/');
      return;
    }
    if (isLocked) {
      // Wallet locked - go to unlock (which will redirect back here)
      navigate('/unlock');
      return;
    }
  }, [isInitialized, isLocked, navigate]);

  // Load pending approvals
  useEffect(() => {
    async function load() {
      if (!isExtensionContext()) {
        setLoading(false);
        return;
      }

      try {
        const pending = await getPendingApprovals();
        setApprovals(pending);
        if (pending.length === 0) {
          // No pending approvals, go to dashboard
          navigate('/dashboard');
        }
      } catch (e) {
        console.error('Failed to load approvals:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  const current = approvals[currentIndex];

  // Check if current site is already trusted
  useEffect(() => {
    async function checkTrusted() {
      if (!current) return;
      const trusted = await isTrustedSite(current.origin, current.type as any);
      setAlreadyTrusted(trusted);
      // Reset remember checkbox when changing requests
      setRememberSite(false);
    }
    checkTrusted();
  }, [current]);

  const handleApprove = async () => {
    if (!current || !wallet || !currentAccount) return;
    
    setProcessing(true);
    setError('');

    try {
      let result: unknown;

      switch (current.type) {
        case 'connect':
          result = {
            address: currentAccount.address,
            publicKey: currentAccount.publicKey
          };
          break;

        case 'signMessage': {
          const messageHex = current.data.message as string;
          // Convert hex back to bytes for signing
          const messageBytes = new Uint8Array(
            messageHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
          );
          const signature = await wallet.signMessage(currentAccount.index, new TextDecoder().decode(messageBytes));
          result = {
            signature,
            publicKey: currentAccount.publicKey
          };
          break;
        }

        case 'signTransaction': {
          const tx = current.data.transaction as Record<string, unknown>;
          const signature = await wallet.signTransaction(tx, currentAccount.index);
          
          // Build result object
          const signResult: Record<string, unknown> = {
            signature,
            publicKey: currentAccount.publicKey,
            transaction: tx
          };
          
          // Broadcast to RPC if requested
          if (current.data.broadcast) {
            try {
              const broadcastResult = await broadcastTransaction({
                transaction: {
                  from: tx.from as string,
                  to: tx.to as string,
                  amount: tx.amount as string,
                  memo: tx.memo as string | undefined,
                  nonce: tx.nonce as number,
                  timestamp: tx.timestamp as number,
                },
                signature,
                publicKey: currentAccount.publicKey,
              });
              signResult.hash = broadcastResult.hash;
              signResult.broadcasted = true;
            } catch (broadcastError) {
              // Still return signature but indicate broadcast failed
              signResult.broadcasted = false;
              signResult.broadcastError = broadcastError instanceof Error 
                ? broadcastError.message 
                : 'Broadcast failed';
            }
          }
          
          result = signResult;
          break;
        }

        case 'addToken':
          // Store token in wallet's token list
          result = true;
          break;
      }

      await approveRequest(current.id, result);

      // Save to trusted sites if "remember" was checked
      if (rememberSite && current.type === 'connect') {
        await addTrustedSite(current.origin, formatOrigin(current.origin), ['connect']);
      }
      
      // Move to next or close
      if (currentIndex < approvals.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        navigate('/dashboard');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!current) return;
    
    setProcessing(true);
    try {
      await rejectRequest(current.id);
      
      if (currentIndex < approvals.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        navigate('/dashboard');
      }
    } catch (e) {
      console.error('Failed to reject:', e);
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectAll = async () => {
    setProcessing(true);
    try {
      for (const approval of approvals) {
        await rejectRequest(approval.id);
      }
      navigate('/dashboard');
    } catch (e) {
      console.error('Failed to reject all:', e);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="approval-screen">
        <div className="approval-loading">
          <div className="spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!current) {
    return null;
  }

  const getTypeIcon = () => {
    switch (current.type) {
      case 'connect': return <Globe className="type-icon connect" />;
      case 'signMessage': return <FileText className="type-icon sign" />;
      case 'signTransaction': return <ArrowRightLeft className="type-icon transaction" />;
      case 'addToken': return <Coins className="type-icon token" />;
    }
  };

  const getTypeTitle = () => {
    switch (current.type) {
      case 'connect': return 'Connection Request';
      case 'signMessage': return 'Sign Message';
      case 'signTransaction': return 'Sign Transaction';
      case 'addToken': return 'Add Token';
    }
  };

  const getTypeDescription = () => {
    switch (current.type) {
      case 'connect':
        return (
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
        );
      case 'signMessage':
        return 'This site wants you to sign a message';
      case 'signTransaction':
        return 'This site wants you to sign a transaction';
      case 'addToken':
        return 'This site wants to add a token to your wallet';
    }
  };

  return (
    <div className="approval-screen">
      {/* Phishing Warning */}
      {Boolean((current.data as Record<string, unknown>)?.phishingWarning) && (
        <div className="phishing-warning">
          <AlertTriangle className="warning-icon" />
          <div className="warning-content">
            <strong>⚠️ Phishing Warning</strong>
            <p>This site matches known phishing patterns. Proceed with extreme caution.</p>
          </div>
        </div>
      )}

      {/* Origin */}
      <div className="origin-card">
        <img 
          src={getFaviconUrl(current.origin)} 
          alt="" 
          className="origin-favicon"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="origin-info">
          <span className="origin-name">{formatOrigin(current.origin)}</span>
          <span className="origin-url">{current.origin}</span>
        </div>
      </div>

      {/* Request Type */}
      <div className="request-card">
        {getTypeIcon()}
        <h2 className="request-title">{getTypeTitle()}</h2>
        <p className="request-description">{getTypeDescription()}</p>
      </div>

      {/* Request Details */}
      <div className="details-card">
        {current.type === 'connect' && currentAccount && (
          <div className="detail-row">
            <span className="detail-label">Account</span>
            <span className="detail-value">{currentAccount.name}</span>
          </div>
        )}

        {current.type === 'signMessage' && (
          <div className="message-preview">
            <span className="detail-label">Message</span>
            <pre className="message-content">
              {(() => {
                const hex = current.data.message as string;
                const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
                return new TextDecoder().decode(bytes);
              })()}
            </pre>
          </div>
        )}

        {current.type === 'signTransaction' && (
          <>
            <TransactionSimulation 
              transaction={current.data.transaction as any}
            />
            <div className="transaction-preview">
              <span className="detail-label">Raw Transaction</span>
              <pre className="transaction-content">
                {JSON.stringify(current.data.transaction, null, 2)}
              </pre>
            </div>
          </>
        )}

        {current.type === 'addToken' && (
          <>
            <div className="detail-row">
              <span className="detail-label">Symbol</span>
              <span className="detail-value">{(current.data.token as any)?.symbol}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Denom</span>
              <span className="detail-value">{(current.data.token as any)?.denom}</span>
            </div>
          </>
        )}
      </div>

      {/* Warning */}
      <div className="warning-banner">
        <AlertTriangle className="warning-icon" />
        <span>Only approve requests from sites you trust</span>
      </div>

      {/* Remember This Site */}
      {current.type === 'connect' && !alreadyTrusted && (
        <label className="remember-site-option">
          <input
            type="checkbox"
            checked={rememberSite}
            onChange={(e) => setRememberSite(e.target.checked)}
          />
          <Star className="remember-icon" size={16} />
          <span>Remember this site (auto-approve future connections)</span>
        </label>
      )}

      {alreadyTrusted && (
        <div className="trusted-badge">
          <Star className="trusted-icon" size={16} />
          <span>Trusted site</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="approval-actions">
        <button 
          className="btn btn-reject"
          onClick={handleReject}
          disabled={processing}
        >
          <X className="btn-icon" />
          Reject
        </button>
        <button 
          className="btn btn-approve"
          onClick={handleApprove}
          disabled={processing}
        >
          <Check className="btn-icon" />
          Approve
        </button>
      </div>

      {/* Reject All */}
      {approvals.length > 1 && (
        <button 
          className="btn-link reject-all"
          onClick={handleRejectAll}
          disabled={processing}
        >
          Reject all {approvals.length} requests
        </button>
      )}
    </div>
  );
}

export default ApprovalScreen;
