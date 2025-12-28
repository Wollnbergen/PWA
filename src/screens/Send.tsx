/**
 * Send Screen
 * 
 * Send SLTN to another address.
 * SECURITY: Requires PIN confirmation before signing transactions.
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useTheme } from '../hooks/useTheme';
import { useBalance } from '../hooks/useBalance';
import { SultanWallet } from '../core/wallet';
import { sultanAPI } from '../api/sultanAPI';
import { validateSultanOnlyAddress, validateAmount, verifySessionPin } from '../core/security';
import './Send.css';

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

const CheckCircleIcon = () => (
  <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

type Step = 'form' | 'confirm' | 'pin' | 'pending' | 'success';

export default function Send() {
  const navigate = useNavigate();
  const { wallet, currentAccount } = useWallet();
  const { theme, setTheme } = useTheme();
  const { data: balanceData } = useBalance(currentAccount?.address);
  
  const [step, setStep] = useState<Step>('form');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [confirmationStatus, setConfirmationStatus] = useState('Broadcasting...');
  
  // Store original recipient balance to detect confirmation
  const [originalRecipientBalance, setOriginalRecipientBalance] = useState<string | null>(null);
  
  // PIN verification state
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const availableBalance = SultanWallet.formatSLTN(balanceData?.available || '0');

  const handleMaxClick = () => {
    setAmount(availableBalance);
  };

  const validateForm = (): boolean => {
    setError('');

    // Validate recipient address (Sultan-only wallet)
    const addressValidation = validateSultanOnlyAddress(recipient);
    if (!addressValidation.valid) {
      setError(addressValidation.error || 'Invalid recipient address');
      return false;
    }

    // Validate amount
    const amountValidation = validateAmount(amount, availableBalance);
    if (!amountValidation.valid) {
      setError(amountValidation.error || 'Invalid amount');
      return false;
    }

    return true;
  };

  const handleContinue = () => {
    if (validateForm()) {
      setStep('confirm');
    }
  };

  /**
   * Proceed to PIN verification step
   * SECURITY: PIN must be verified before any signing operation
   */
  const handleConfirmToPin = () => {
    setError('');
    setPin(['', '', '', '', '', '']);
    setStep('pin');
  };

  /**
   * Handle PIN input with auto-focus
   */
  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only digits
    
    const newPin = [...pin];
    newPin[index] = value.slice(-1); // Take last character
    setPin(newPin);
    
    // Auto-focus next input
    if (value && index < 5) {
      pinInputRefs.current[index + 1]?.focus();
    }
  };

  /**
   * Handle PIN backspace
   */
  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    }
  };

  /**
   * Verify PIN and execute transaction
   * SECURITY: PIN verification required before signing
   */
  const handlePinSubmit = async () => {
    const fullPin = pin.join('');
    if (fullPin.length !== 6) {
      setError('Please enter your 6-digit PIN');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // SECURITY: Verify PIN before allowing transaction
      const pinValid = await verifySessionPin(fullPin);
      if (!pinValid) {
        setError('Incorrect PIN. Please try again.');
        setPin(['', '', '', '', '', '']);
        pinInputRefs.current[0]?.focus();
        setIsLoading(false);
        return;
      }

      // PIN verified - proceed with transaction
      await executeTransaction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setIsLoading(false);
    }
  };

  /**
   * Execute transaction after PIN verification
   */
  const executeTransaction = async () => {
    if (!wallet || !currentAccount) return;

    try {
      const atomicAmount = SultanWallet.parseSLTN(amount);
      
      // Fetch the current nonce from the blockchain
      const currentNonce = await sultanAPI.getNonce(currentAccount.address);
      
      // Get recipient's current balance to detect confirmation later
      try {
        const recipientBalance = await sultanAPI.getBalance(recipient);
        setOriginalRecipientBalance(recipientBalance.available || '0');
      } catch {
        setOriginalRecipientBalance('0');
      }
      
      // Sign the transaction (includes nonce for replay protection)
      const txData = {
        from: currentAccount.address,
        to: recipient,
        amount: atomicAmount,
        memo,
        nonce: currentNonce,
        timestamp: Date.now(),
      };

      const signature = await wallet.signTransaction(txData, currentAccount.index);
      
      // Broadcast
      const result = await sultanAPI.broadcastTransaction({
        ...txData,
        signature,
        publicKey: currentAccount.publicKey,
      });

      setTxHash(result.hash);
      setConfirmationStatus('Confirming on blockchain...');
      setStep('pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Focus first PIN input when entering PIN step
  useEffect(() => {
    if (step === 'pin') {
      pinInputRefs.current[0]?.focus();
    }
  }, [step]);

  // Poll for transaction confirmation when in pending step
  useEffect(() => {
    if (step !== 'pending' || !originalRecipientBalance) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds max (2s per poll)
    const atomicAmount = SultanWallet.parseSLTN(amount);

    const pollConfirmation = async () => {
      if (cancelled) return;
      attempts++;

      try {
        const newBalance = await sultanAPI.getBalance(recipient);
        const originalBigInt = BigInt(originalRecipientBalance);
        const newBigInt = BigInt(newBalance.available || '0');
        const expectedBigInt = originalBigInt + BigInt(atomicAmount);

        // Check if recipient balance increased by expected amount
        if (newBigInt >= expectedBigInt) {
          setConfirmationStatus('Transaction confirmed!');
          setTimeout(() => {
            if (!cancelled) setStep('success');
          }, 500);
          return;
        }
      } catch {
        // Ignore polling errors, keep trying
      }

      // Update status message
      if (attempts < 5) {
        setConfirmationStatus('Confirming on blockchain...');
      } else if (attempts < 15) {
        setConfirmationStatus('Waiting for block confirmation...');
      } else {
        setConfirmationStatus('Still confirming... (cross-shard transactions may take longer)');
      }

      // If not confirmed yet and under max attempts, poll again
      if (!cancelled && attempts < maxAttempts) {
        setTimeout(pollConfirmation, 2000);
      } else if (attempts >= maxAttempts) {
        // Timeout - allow user to proceed anyway since tx was broadcast
        setConfirmationStatus('Transaction broadcast. Confirmation taking longer than expected.');
        setTimeout(() => {
          if (!cancelled) setStep('success');
        }, 2000);
      }
    };

    // Start polling after a short delay (let block propagate)
    const initialDelay = setTimeout(pollConfirmation, 2000);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
    };
  }, [step, recipient, originalRecipientBalance, amount]);

  // Pending step - show while waiting for confirmation
  if (step === 'pending') {
    return (
      <div className="send-screen">
        <div className="send-content fade-in">
          <div className="pending-animation">
            <div className="spinner-ring"></div>
            <div className="pulse-dot"></div>
          </div>
          <h2>Processing Transaction</h2>
          <p className="text-muted mb-lg">{confirmationStatus}</p>
          
          <div className="tx-details">
            <div className="detail-row">
              <span>Amount</span>
              <span>{amount} SLTN</span>
            </div>
            <div className="detail-row">
              <span>To</span>
              <span className="address">{recipient.slice(0, 16)}...</span>
            </div>
            {txHash && (
              <div className="detail-row">
                <span>TX Hash</span>
                <span className="address">{txHash.slice(0, 16)}...</span>
              </div>
            )}
          </div>

          <p className="text-muted text-sm mt-lg">
            Please wait while your transaction is being confirmed on the Sultan blockchain.
          </p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="send-screen">
        <div className="send-content fade-in">
          <div className="success-icon"><CheckCircleIcon /></div>
          <h2>Transaction Sent!</h2>
          <p className="text-muted mb-lg">
            Your transaction has been broadcast to the network
          </p>
          
          <div className="tx-details">
            <div className="detail-row">
              <span>Amount</span>
              <span>{amount} SLTN</span>
            </div>
            <div className="detail-row">
              <span>To</span>
              <span className="address">{recipient.slice(0, 16)}...</span>
            </div>
            {txHash && (
              <div className="detail-row">
                <span>TX Hash</span>
                <span className="address">{txHash.slice(0, 16)}...</span>
              </div>
            )}
          </div>

          <button 
            className="btn btn-primary mt-lg"
            onClick={() => navigate('/dashboard')}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="send-screen">
        <div className="send-content fade-in">
          <h2>Confirm Transaction</h2>
          
          <div className="confirm-card">
            <div className="confirm-amount">
              <span className="amount-value">{amount}</span>
              <span className="amount-currency">SLTN</span>
            </div>
            
            <div className="confirm-details">
              <div className="detail-row">
                <span>From</span>
                <span className="address">{currentAccount?.address.slice(0, 16)}...</span>
              </div>
              <div className="detail-row">
                <span>To</span>
                <span className="address">{recipient.slice(0, 16)}...</span>
              </div>
              <div className="detail-row">
                <span>Network Fee</span>
                <span className="fee-zero">0 SLTN (Zero Fee)</span>
              </div>
              {memo && (
                <div className="detail-row">
                  <span>Memo</span>
                  <span>{memo}</span>
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-error mt-md">{error}</p>}

          <div className="button-row mt-lg">
            <button 
              className="btn btn-secondary"
              onClick={() => setStep('form')}
              disabled={isLoading}
            >
              Back
            </button>
            <button 
              className="btn btn-primary"
              onClick={handleConfirmToPin}
              disabled={isLoading}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PIN verification step
  if (step === 'pin') {
    return (
      <div className="send-screen">
        <div className="send-content fade-in">
          <div className="pin-header">
            <div className="lock-icon">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h2>Confirm with PIN</h2>
            <p className="text-muted">Enter your 6-digit PIN to authorize this transaction</p>
          </div>

          <div className="tx-summary-mini">
            <span className="amount">{amount} SLTN</span>
            <span className="arrow">→</span>
            <span className="recipient">{recipient.slice(0, 12)}...</span>
          </div>

          <div className="pin-input-group">
            {pin.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { pinInputRefs.current[index] = el; }}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handlePinChange(index, e.target.value)}
                onKeyDown={(e) => handlePinKeyDown(index, e)}
                className="pin-input"
                autoComplete="off"
              />
            ))}
          </div>

          {error && <p className="text-error mt-md">{error}</p>}

          <div className="button-row mt-lg">
            <button 
              className="btn btn-secondary"
              onClick={() => {
                setStep('confirm');
                setPin(['', '', '', '', '', '']);
                setError('');
              }}
              disabled={isLoading}
            >
              Back
            </button>
            <button 
              className="btn btn-primary"
              onClick={handlePinSubmit}
              disabled={isLoading || pin.some(d => !d)}
            >
              {isLoading ? 'Sending...' : 'Confirm & Send'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="send-screen">
      <header className="screen-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          <BackIcon />
        </button>
        <h2>Send SLTN</h2>
        <button className="btn-icon theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <div className="send-content fade-in">
        <div className="form-group">
          <label>Recipient Address</label>
          <input
            type="text"
            className="input"
            placeholder="sultan1..."
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="form-group">
          <div className="label-row">
            <label>Amount</label>
            <span className="balance-hint">
              Available: {availableBalance} SLTN
            </span>
          </div>
          <div className="amount-input-wrapper">
            <input
              type="number"
              className="input amount-input"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              step="0.000000001"
              min="0"
            />
            <button className="max-btn" onClick={handleMaxClick}>
              MAX
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Memo (Optional)</label>
          <input
            type="text"
            className="input"
            placeholder="Add a note..."
            value={memo}
            onChange={e => setMemo(e.target.value)}
            maxLength={256}
          />
        </div>

        <div className="fee-notice">
          <span className="fee-badge">🎉 Zero Fee</span>
          <span className="text-muted">Sultan Network has no transaction fees</span>
        </div>

        {error && <p className="text-error mt-md">{error}</p>}

        <button 
          className="btn btn-primary mt-lg"
          onClick={handleContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
