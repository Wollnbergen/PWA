/**
 * Become Validator Screen
 * 
 * Premium flow for setting up a validator node.
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useTheme } from '../hooks/useTheme';
import { useBalance } from '../hooks/useBalance';
import { SultanWallet } from '../core/wallet';
import { sultanAPI } from '../api/sultanAPI';
import { validateAddress, validateAmount, verifySessionPin, validateMoniker } from '../core/security';
import './BecomeValidator.css';
import '../components/PinInput.css';

// --- Icons ---

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

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

type Step = 'overview' | 'server' | 'address' | 'fund' | 'pin';

export default function BecomeValidator() {
  const navigate = useNavigate();
  const { wallet, currentAccount, lock } = useWallet();
  const { theme, setTheme } = useTheme();
  const { data: balanceData, refetch: refetchBalance } = useBalance(currentAccount?.address);
  
  const [step, setStep] = useState<Step>('overview');
  // Validator address is the SERVER's address from install.sh output
  const [validatorAddress, setValidatorAddress] = useState(currentAccount?.address || '');
  // Server's Ed25519 public key for block signing (from install.sh output)
  const [serverPublicKey, setServerPublicKey] = useState('');
  const [moniker, setMoniker] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  
  // PIN verification state
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleLock = () => {
    lock();
    navigate('/unlock');
  };

  const availableBalance = SultanWallet.formatSLTN(balanceData?.available || '0');
  const availableBalanceRaw = SultanWallet.formatSLTNRaw(balanceData?.available || '0').replace(/,/g, '');
  // Use raw balance (no commas) for numeric comparison
  const parsedBalance = parseFloat(availableBalanceRaw) || 0;
  const hasMinimumStake = parsedBalance >= 10000;

  const handleCopyCommand = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Validate form and proceed to PIN verification
   * SECURITY: PIN must be verified before any signing operation
   */
  const handleFundValidator = () => {
    const addrValidation = validateAddress(validatorAddress);
    if (!addrValidation.valid) {
      setError(addrValidation.error || 'Invalid validator address');
      return;
    }

    // Validate moniker (sanitize and check length/chars)
    const monikerToValidate = moniker.trim() || 'Sultan Validator';
    const monikerValidation = validateMoniker(monikerToValidate);
    if (!monikerValidation.valid) {
      setError(monikerValidation.error || 'Invalid moniker');
      return;
    }

    const amount = '10000';
    const amountValidation = validateAmount(amount, availableBalanceRaw);
    if (!amountValidation.valid) {
      setError(amountValidation.error || 'Insufficient balance');
      return;
    }

    // Proceed to PIN verification
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
   * Verify PIN and execute fund validator
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

      // PIN verified - proceed with fund validator
      await executeFundValidator();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setIsLoading(false);
    }
  };

  /**
   * Execute create validator after PIN verification
   * In v0.2.7: validator address = user's own wallet address
   */
  const executeFundValidator = async () => {
    if (!wallet || !currentAccount) {
      setError('Wallet not available. Please unlock your wallet and try again.');
      setIsLoading(false);
      return;
    }

    try {
      console.log('[BecomeValidator] Starting registration for:', currentAccount.address);
      // Fixed 10,000 SLTN stake for validator
      const stakeAmount = '10000';
      const atomicAmount = SultanWallet.parseSLTN(stakeAmount);
      const monikerValue = moniker.trim() || 'Sultan Validator';
      
      // Fetch current nonce from blockchain BEFORE signing
      const currentNonce = await sultanAPI.getNonce(currentAccount.address);
      const timestamp = Date.now();
      
      // For create_validator, the validator_address is the server address; delegator = user's wallet
      const txData = {
        type: 'create_validator',
        validator_address: validatorAddress.trim(),
        delegator_address: currentAccount.address,
        moniker: monikerValue,
        initial_stake: atomicAmount,
        commission_rate: 0.10, // 10% as decimal (0.10 = 10%)
        nonce: currentNonce,
        timestamp,
        ...(serverPublicKey.trim() && { server_public_key: serverPublicKey.trim() }),
      };

      console.log('[BecomeValidator] Signing transaction with index:', currentAccount.index);
      const signature = await wallet.signTransaction(txData, currentAccount.index);
      console.log('[BecomeValidator] Signature obtained, calling createValidator API');
      console.log('[BecomeValidator] PublicKey:', currentAccount.publicKey);
      
      // Call create_validator API endpoint
      await sultanAPI.createValidator({
        validatorAddress: validatorAddress.trim(),
        delegatorAddress: currentAccount.address,
        moniker: monikerValue,
        initialStake: atomicAmount,
        commissionRate: 0.10, // 10% as decimal
        signature,
        publicKey: currentAccount.publicKey,
        serverPublicKey: serverPublicKey.trim() || undefined,
        rewardWallet: currentAccount.address, // rewards go to user's wallet
      });

      setSuccess(`🎉 Congratulations! You are now a Sultan validator!`);
      refetchBalance();
      
      setTimeout(() => {
        navigate('/stake');
      }, 3000);
    } catch (err) {
      console.error('[BecomeValidator] Registration failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to register validator');
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { id: 'overview', label: 'Start' },
    { id: 'server', label: 'Setup Server' },
    { id: 'address', label: 'Configure' },
    { id: 'fund', label: 'Register' },
    { id: 'pin', label: 'Confirm' }
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);

  return (
    <div className="validator-screen">
      <header className="screen-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => step === 'overview' ? navigate('/stake') : setStep('overview')}>
            <BackIcon />
          </button>
        </div>
        <h2>Become Validator</h2>
        <div className="header-right">
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

      <div className="validator-content fade-in">
        
        {/* Step Progress Bar */}
        <div className="steps-progress">
          {steps.map((s, index) => (
            <div 
              key={s.id} 
              className={`step-item ${index <= currentStepIndex ? 'active' : ''}`}
            >
              <div className="step-bar"></div>
              <span className="step-label">{s.label}</span>
            </div>
          ))}
        </div>

        {step === 'overview' && (
          <div className="overview-section">
            <div className="hero-card">
              <h3>Run a Full Node</h3>
              <p>Earn ~13.33% APY + Commission</p>
            </div>

            <div className="requirements-grid">
              <div className="req-card">
                <span className="req-label">Stake Required</span>
                <span className="req-val">10,000 SLTN</span>
              </div>
              <div className="req-card">
                <span className="req-label">Server Cost</span>
                <span className="req-val">~$5/month</span>
              </div>
              <div className="req-card">
                <span className="req-label">Difficulty</span>
                <span className="req-val">Medium</span>
              </div>
            </div>

            <div className="balance-check-card">
              <div className="balance-row">
                <span>Your Balance:</span>
                <span className={hasMinimumStake ? 'text-success' : 'text-error'}>
                  {availableBalance} SLTN
                </span>
              </div>
              {!hasMinimumStake && (
                <p className="balance-note">You need 10,000 SLTN to start.</p>
              )}
            </div>

            <button 
              className="btn btn-primary btn-large"
              disabled={!hasMinimumStake}
              onClick={() => setStep('server')}
            >
              Get Started
            </button>
          </div>
        )}

        {step === 'server' && (
          <div className="step-section">
            <h3>1. Server Setup</h3>
            <p className="text-muted">
              Get a VPS from <strong>Hetzner</strong>, <strong>DigitalOcean</strong>, <strong>Vultr</strong>, 
              or similar (~$5/mo, Ubuntu 22.04). Then SSH in and run:
            </p>
            
            <div className="code-block">
              <pre>
curl -L https://wallet.sltn.io/install.sh -o install.sh && bash install.sh
              </pre>
              <button className="copy-btn" onClick={() => handleCopyCommand('curl -L https://wallet.sltn.io/install.sh -o install.sh && bash install.sh')}>
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>

            <div className="info-box">
              <p>This installs the Sultan node, syncs the blockchain, and generates your validator keys. Your address will be displayed when complete.</p>
            </div>

            <button className="btn btn-primary btn-full" onClick={() => setStep('address')}>
              I've installed the node
            </button>
          </div>
        )}

        {step === 'address' && (
          <div className="step-section">
            <h3>2. Configure Validator</h3>
            <p className="text-muted">Set up your validator details:</p>
            
            <div className="input-group">
              <label>Server Validator Address</label>
              <input 
                type="text" 
                className="input" 
                placeholder="sultan1... (from installer output)"
                value={validatorAddress}
                onChange={(e) => setValidatorAddress(e.target.value)}
              />
              <small className="input-hint">Paste the address shown by install.sh on your server</small>
            </div>

            <div className="input-group">
              <label>Server Public Key <span style={{ color: 'var(--text-muted)', fontSize: '0.8em' }}>(from install output)</span></label>
              <input 
                type="text" 
                className="input" 
                placeholder="64 hex characters from installer"
                value={serverPublicKey}
                onChange={(e) => setServerPublicKey(e.target.value)}
              />
              <small className="input-hint">Copy from server terminal: "Public Key: ..."</small>
            </div>

            <div className="input-group">
              <label>Moniker (Name)</label>
              <input 
                type="text" 
                className="input" 
                placeholder="My Node"
                value={moniker}
                onChange={(e) => setMoniker(e.target.value)}
              />
            </div>

            <button 
              className="btn btn-primary btn-full"
              disabled={!validatorAddress.startsWith('sultan1')} 
              onClick={() => setStep('fund')}
            >
              Continue
            </button>
          </div>
        )}

        {step === 'fund' && (
          <div className="step-section">
            <h3>3. Register Validator</h3>
            <p className="text-muted">Register your node and stake 10,000 SLTN.</p>

            <div className="summary-card">
              <div className="summary-row">
                <span>Validator Address</span>
                <span className="mono">{validatorAddress.slice(0, 10)}...</span>
              </div>
              <div className="summary-row highlight">
                <span>Initial Stake</span>
                <span>10,000 SLTN</span>
              </div>
              <div className="summary-row">
                <span>Commission</span>
                <span>10%</span>
              </div>
            </div>

            {error && <p className="text-error">{error}</p>}
            {success && <p className="text-success">{success}</p>}

            <button 
              className="btn btn-primary btn-full"
              disabled={isLoading}
              onClick={handleFundValidator}
            >
              {isLoading ? 'Processing...' : 'Register & Stake'}
            </button>
          </div>
        )}

        {/* PIN Verification Step - SECURITY: Required before signing */}
        {step === 'pin' && (
          <div className="step-section pin-confirmation-section">
            <div className="pin-header">
              <div className="lock-icon-container">
                <LockIcon />
              </div>
              <h3>Confirm with PIN</h3>
              <p className="text-muted">Enter your 6-digit PIN to authorize registration</p>
            </div>

            <div className="summary-card">
              <div className="summary-row">
                <span className="label">Action</span>
                <span className="value">Register Validator</span>
              </div>
              <div className="summary-row highlight">
                <span className="label">Stake</span>
                <span className="value">10,000 SLTN</span>
              </div>
            </div>

            <div className="pin-input-group">
              <div className="pin-input">
                {pin.map((digit, index) => (
                  <div key={index} className="pin-digit-container">
                    <input
                      ref={(el) => { pinInputRefs.current[index] = el; }}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(index, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(index, e)}
                      className="pin-digit"
                      autoComplete="off"
                    />
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-error" style={{ textAlign: 'center', marginTop: '16px' }}>{error}</p>}

            <div className="pin-actions">
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  setStep('fund');
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
                {isLoading ? 'Registering...' : 'Confirm Registration'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
