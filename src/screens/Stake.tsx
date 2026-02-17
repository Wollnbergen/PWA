/**
 * Stake Screen
 * 
 * Stake SLTN with validators for 13.33% APY.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useTheme } from '../hooks/useTheme';
import { useBalance, useStakingInfo, useValidators } from '../hooks/useBalance';
import { SultanWallet } from '../core/wallet';
import { sultanAPI, Validator } from '../api/sultanAPI';
import { validateAmount, verifySessionPin, isHighValueTransaction, HIGH_VALUE_THRESHOLD_SLTN } from '../core/security';
import './Stake.css';
import '../components/PinInput.css';

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

// GiftIcon removed - rewards are auto-credited, no claim button needed

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

type Tab = 'stake' | 'unstake' | 'validators';
type Step = 'form' | 'pin';
type PendingAction = 'stake' | 'unstake' | 'claim' | 'exit-validator' | null;

// Truncate long validator names/addresses for display
const truncateName = (name: string, startChars: number = 10, endChars: number = 5): string => {
  if (name.length <= startChars + endChars + 3) return name;
  return `${name.slice(0, startChars)}...${name.slice(-endChars)}`;
};

export default function Stake() {
  const navigate = useNavigate();
  const { wallet, currentAccount, lock } = useWallet();
  const { theme, setTheme } = useTheme();
  const { data: balanceData } = useBalance(currentAccount?.address);
  const { data: stakingData, refetch: refetchStaking } = useStakingInfo(currentAccount?.address);
  const { data: validators } = useValidators();
  
  const [tab, setTab] = useState<Tab>('stake');
  const [step, setStep] = useState<Step>('form');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [amount, setAmount] = useState('');
  const [selectedValidator, setSelectedValidator] = useState<Validator | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [highValueWarning, setHighValueWarning] = useState(false);
  
  // PIN verification state
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // Formatted for display (with commas)
  const availableBalance = SultanWallet.formatSLTN(balanceData?.available || '0');
  const stakedBalance = SultanWallet.formatSLTN(stakingData?.staked || '0');
  const pendingRewards = SultanWallet.formatSLTN(stakingData?.pendingRewards || '0');
  // Raw for form input (no commas) - defensive strip
  const availableBalanceRaw = SultanWallet.formatSLTNRaw(balanceData?.available || '0').replace(/,/g, '');
  const stakedBalanceRaw = SultanWallet.formatSLTNRaw(stakingData?.staked || '0').replace(/,/g, '');

  useEffect(() => {
    if (validators && validators.length > 0 && !selectedValidator) {
      setSelectedValidator(validators[0]);
    }
  }, [validators, selectedValidator]);

  // Focus first PIN input when entering PIN step
  useEffect(() => {
    if (step === 'pin') {
      pinInputRefs.current[0]?.focus();
    }
  }, [step]);

  /**
   * Handle PIN input with auto-focus
   */
  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only digits
    
    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);
    
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
   * Request PIN verification before staking
   * SECURITY: PIN must be verified before any signing operation
   * SECURITY: Validates validator exists to prevent staking to unknown addresses
   */
  const handleStake = () => {
    if (!wallet || !currentAccount || !selectedValidator) return;

    const amountValidation = validateAmount(amount, availableBalanceRaw);
    if (!amountValidation.valid) {
      setError(amountValidation.error || 'Invalid amount');
      return;
    }

    // SECURITY: Verify validator exists in the active validators list
    if (!validators || validators.length === 0) {
      setError('Unable to verify validators. Please try again.');
      return;
    }

    const validatorExists = validators.some(v => v.address === selectedValidator.address);
    if (!validatorExists) {
      setError('Selected validator is not in the active validators list');
      return;
    }

    // SECURITY: Warn user about high-value transactions
    setHighValueWarning(isHighValueTransaction(amount));

    setError('');
    setPin(['', '', '', '', '', '']);
    setPendingAction('stake');
    setStep('pin');
  };

  /**
   * Request PIN verification before unstaking
   * SECURITY: PIN must be verified before any signing operation
   */
  const handleUnstake = () => {
    if (!wallet || !currentAccount) return;

    const amountValidation = validateAmount(amount, stakedBalanceRaw);
    if (!amountValidation.valid) {
      setError(amountValidation.error || 'Invalid amount');
      return;
    }

    // SECURITY: Warn user about high-value transactions
    setHighValueWarning(isHighValueTransaction(amount));

    setError('');
    setPin(['', '', '', '', '', '']);
    setPendingAction('unstake');
    setStep('pin');
  };

  // NOTE: Rewards are credited automatically to reward_wallet on each block
  // No manual claiming needed - removed handleClaimRewards()

  /**
   * Verify PIN and execute pending action
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
      const pinValid = await verifySessionPin(fullPin);
      if (!pinValid) {
        setError('Incorrect PIN. Please try again.');
        setPin(['', '', '', '', '', '']);
        pinInputRefs.current[0]?.focus();
        setIsLoading(false);
        return;
      }

      // PIN verified - execute pending action
      if (pendingAction === 'stake') {
        await executeStake();
      } else if (pendingAction === 'unstake') {
        await executeUnstake();
      } else if (pendingAction === 'exit-validator') {
        await executeExitValidator();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
      setIsLoading(false);
    }
  };

  /**
   * Execute stake after PIN verification
   */
  const executeStake = async () => {
    if (!wallet || !currentAccount || !selectedValidator) return;

    try {
      const atomicAmount = SultanWallet.parseSLTN(amount);
      
      // Fetch nonce from blockchain BEFORE signing to ensure consistency
      const currentNonce = await sultanAPI.getNonce(currentAccount.address);
      const timestamp = Date.now();
      
      // Sign the EXACT transaction that will be sent to the API
      // Must match the JSON format expected by the node's signature verification
      const txData = {
        from: currentAccount.address,
        to: selectedValidator.address,
        amount: atomicAmount,
        memo: '',
        nonce: currentNonce,
        timestamp,
      };

      const signature = await wallet.signTransaction(txData, currentAccount.index);
      
      await sultanAPI.stakeTokens({
        transaction: txData,
        signature,
        publicKey: currentAccount.publicKey,
      });

      setSuccess(`Successfully staked ${amount} SLTN!`);
      setAmount('');
      setStep('form');
      setPendingAction(null);
      refetchStaking();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Staking failed');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Execute unstake after PIN verification
   */
  const executeUnstake = async () => {
    if (!wallet || !currentAccount) return;

    try {
      const atomicAmount = SultanWallet.parseSLTN(amount);
      
      // Fetch nonce from blockchain BEFORE signing
      const currentNonce = await sultanAPI.getNonce(currentAccount.address);
      const timestamp = Date.now();
      
      // Get validator address from current delegation
      const validatorAddr = stakingData?.validator || '';
      
      // Sign the EXACT transaction that will be sent to the API
      const txData = {
        from: currentAccount.address,
        to: validatorAddr,
        amount: atomicAmount,
        memo: '',
        nonce: currentNonce,
        timestamp,
      };

      const signature = await wallet.signTransaction(txData, currentAccount.index);
      
      await sultanAPI.unstakeTokens({
        transaction: txData,
        signature,
        publicKey: currentAccount.publicKey,
      });

      setSuccess(`Unstaking ${amount} SLTN initiated. 21-day unbonding period.`);
      setAmount('');
      setStep('form');
      setPendingAction(null);
      refetchStaking();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unstaking failed');
    } finally {
      setIsLoading(false);
    }
  };

  // NOTE: Rewards are credited automatically - no manual executeClaim needed

  /**
   * Check if current user is a validator
   */
  const isValidator = validators?.some(v => v.address === currentAccount?.address) ?? false;
  const myValidator = validators?.find(v => v.address === currentAccount?.address);
  const myStake = myValidator ? SultanWallet.formatSLTN(myValidator.totalStaked) : '0';

  /**
   * Request PIN verification before exiting as validator
   */
  const handleExitValidator = () => {
    if (!wallet || !currentAccount || !isValidator) return;

    setError('');
    setPin(['', '', '', '', '', '']);
    setPendingAction('exit-validator');
    setHighValueWarning(true); // Always warn for validator exit
    setStep('pin');
  };

  /**
   * Execute validator exit after PIN verification
   */
  const executeExitValidator = async () => {
    if (!wallet || !currentAccount) return;

    try {
      // Fetch nonce from blockchain BEFORE signing
      const currentNonce = await sultanAPI.getNonce(currentAccount.address);
      const timestamp = Date.now();
      
      // Sign exit request
      const txData = {
        type: 'exit_validator',
        validator_address: currentAccount.address,
        nonce: currentNonce,
        timestamp,
      };

      const signature = await wallet.signTransaction(txData, currentAccount.index);
      
      await sultanAPI.exitValidator({
        validatorAddress: currentAccount.address,
        signature,
        publicKey: currentAccount.publicKey,
      });

      setSuccess('Validator exit initiated. 21-day unbonding period for stake.');
      setStep('form');
      setPendingAction(null);
      refetchStaking();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Exit validator failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLock = () => {
    lock();
    navigate('/unlock');
  };

  const handleCancelPin = () => {
    setStep('form');
    setPendingAction(null);
    setPin(['', '', '', '', '', '']);
    setError('');
  };

  // PIN verification screen
  if (step === 'pin') {
    return (
      <div className="stake-screen">
        <header className="screen-header">
          <div className="header-left">
            <button className="btn-back" onClick={handleCancelPin}>
              <BackIcon />
            </button>
          </div>
          <h2>Confirm PIN</h2>
          <div className="header-right">
            <button className="btn-icon theme-toggle" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>

        <div className="stake-content fade-in" style={{ textAlign: 'center', paddingTop: '60px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <LockIcon />
          </div>
          <h3 style={{ marginTop: '0', marginBottom: '8px' }}>Enter PIN to {pendingAction === 'exit-validator' ? 'exit' : pendingAction}</h3>
          <p className="text-muted" style={{ marginBottom: '16px' }}>
            {pendingAction === 'stake' && `Stake ${amount} SLTN with validator`}
            {pendingAction === 'unstake' && `Unstake ${amount} SLTN (21-day unbonding)`}
            {pendingAction === 'exit-validator' && `Exit as validator and unbond your stake`}
          </p>
          {highValueWarning && (
            <div style={{ 
              background: 'rgba(255, 193, 7, 0.15)', 
              border: '1px solid rgba(255, 193, 7, 0.5)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
              maxWidth: '300px',
              margin: '0 auto 16px'
            }}>
              <p style={{ color: '#ffc107', fontSize: '14px', margin: 0 }}>
                ⚠️ High-value transaction (&gt;{HIGH_VALUE_THRESHOLD_SLTN} SLTN)
              </p>
            </div>
          )}

          <div className="pin-input">
            {pin.map((digit, index) => (
              <div key={index} className="pin-digit-container">
                <input
                  ref={el => { pinInputRefs.current[index] = el; }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handlePinChange(index, e.target.value)}
                  onKeyDown={e => handlePinKeyDown(index, e)}
                  className="pin-digit"
                  autoComplete="off"
                />
              </div>
            ))}
          </div>

          {error && <p className="text-error mb-md">{error}</p>}

          <div className="button-row" style={{ justifyContent: 'center', maxWidth: '300px', margin: '24px auto 0' }}>
            <button
              className="btn btn-secondary"
              onClick={handleCancelPin}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handlePinSubmit}
              disabled={isLoading || pin.join('').length !== 6}
            >
              {isLoading ? 'Processing...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stake-screen">
      <header className="screen-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            <BackIcon />
          </button>
        </div>
        <h2>Staking</h2>
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

      <div className="stake-content fade-in">
        <div className="staking-overview">
          <div className="overview-card">
            <span className="overview-label">APY</span>
            <span className="overview-value accent">~13.33%</span>
          </div>
          <div className="overview-card">
            <span className="overview-label">Staked</span>
            <span className="overview-value">{stakedBalance} SLTN</span>
          </div>
          <div className="overview-card">
            <span className="overview-label">Auto Rewards</span>
            <span className="overview-value">{pendingRewards} SLTN</span>
          </div>
        </div>

        {/* Rewards are auto-credited each block - no claim button needed */}

        <div className="tab-bar">
          <button 
            className={`tab ${tab === 'stake' ? 'active' : ''}`}
            onClick={() => setTab('stake')}
          >
            Stake
          </button>
          <button 
            className={`tab ${tab === 'unstake' ? 'active' : ''}`}
            onClick={() => setTab('unstake')}
          >
            Unstake
          </button>
          <button 
            className={`tab ${tab === 'validators' ? 'active' : ''}`}
            onClick={() => setTab('validators')}
          >
            Validators
          </button>
        </div>

        {(tab === 'stake' || tab === 'unstake') && (
          <div className="stake-form">
            <div className="form-group">
              <div className="label-row">
                <label>Amount</label>
                <span className="balance-hint">
                  {tab === 'stake' ? `Available: ${availableBalance}` : `Staked: ${stakedBalance}`} SLTN
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
                <button 
                  className="max-btn" 
                  onClick={() => setAmount(tab === 'stake' ? availableBalanceRaw : stakedBalanceRaw)}
                >
                  MAX
                </button>
              </div>
            </div>

            {tab === 'stake' && selectedValidator && (
              <div className="selected-validator">
                <span className="text-muted">Staking with:</span>
                <span className="validator-name" title={selectedValidator.name}>{truncateName(selectedValidator.name)}</span>
              </div>
            )}

            {tab === 'unstake' && (
              <div className="unstake-notice">
                ⏱️ 21-day unbonding period applies
              </div>
            )}

            {error && <p className="text-error mt-md">{error}</p>}
            {success && <p className="text-success mt-md">{success}</p>}

            <button 
              className="btn btn-primary mt-lg"
              onClick={tab === 'stake' ? handleStake : handleUnstake}
              disabled={isLoading || !amount || Number(amount) <= 0}
            >
              {isLoading ? 'Processing...' : tab === 'stake' ? 'Stake SLTN' : 'Unstake SLTN'}
            </button>
          </div>
        )}

        {tab === 'validators' && (
          <div className="validators-list">
            {/* Validator Search - scales to thousands */}
            <div className="validator-search">
              <input
                type="text"
                className="input"
                placeholder="🔍 Search validators by name or address..."
                onChange={(e) => {
                  const search = e.target.value.toLowerCase();
                  // Filter is handled by showing only matching validators
                  const filtered = validators?.filter(v => 
                    v.name.toLowerCase().includes(search) || 
                    v.address.toLowerCase().includes(search)
                  );
                  if (filtered && filtered.length > 0) {
                    setSelectedValidator(filtered[0]);
                  }
                }}
              />
              <p className="search-hint">
                {validators?.length || 0} active validators • Select one to stake with
              </p>
            </div>

            {/* Show top 10 validators or filtered results */}
            {validators?.slice(0, 10).map(validator => (
              <div 
                key={validator.address}
                className={`validator-card ${selectedValidator?.address === validator.address ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedValidator(validator);
                  setTab('stake');
                }}
              >
                <div className="validator-info">
                  <span className="validator-name" title={validator.name}>{truncateName(validator.name)}</span>
                  <span className="validator-address">
                    {validator.address.slice(0, 16)}...
                  </span>
                </div>
                <div className="validator-stats">
                  <div className="stat">
                    <span className="stat-label">Commission</span>
                    <span className="stat-value">{validator.commission}%</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Staked</span>
                    <span className="stat-value">
                      {SultanWallet.formatSLTN(validator.totalStaked)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {validators && validators.length > 10 && (
              <p className="text-muted text-center" style={{ padding: '12px' }}>
                Showing top 10 of {validators.length} validators. Use search to find more.
              </p>
            )}
            {(!validators || validators.length === 0) && (
              <p className="text-muted text-center">No validators available</p>
            )}

            {/* Show validator status if user is a validator */}
            {isValidator && myValidator && (
              <div className="validator-status-card" style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05))',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px'
              }}>
                <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
                  ✅ You are a Validator
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div>
                    <span className="text-muted" style={{ fontSize: '12px' }}>Your Stake</span>
                    <p style={{ margin: '4px 0 0', fontWeight: '500' }}>{myStake} SLTN</p>
                  </div>
                  <div>
                    <span className="text-muted" style={{ fontSize: '12px' }}>Commission</span>
                    <p style={{ margin: '4px 0 0', fontWeight: '500' }}>{myValidator.commission}%</p>
                  </div>
                </div>
                <button 
                  className="btn btn-secondary"
                  style={{ width: '100%', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#ef4444' }}
                  onClick={handleExitValidator}
                  disabled={isLoading}
                >
                  {isLoading ? 'Processing...' : 'Exit as Validator'}
                </button>
                <p className="text-muted" style={{ fontSize: '11px', marginTop: '8px', textAlign: 'center' }}>
                  ⚠️ 21-day unbonding period. Stake returns after unbonding.
                </p>
              </div>
            )}

            {/* Become Validator CTA - only show if not already a validator */}
            {!isValidator && (
            <div className="validator-cta-card">
              <div className="cta-content" style={{ textAlign: 'center', display: 'block' }}>
                <div className="cta-text">
                  <h3>Run a Validator</h3>
                  <p>Earn commission & secure the network</p>
                </div>
              </div>
              <button 
                className="btn btn-secondary cta-btn"
                onClick={() => navigate('/become-validator')}
                style={{ margin: '0 auto' }}
              >
                Start Now <span style={{ fontSize: '1.2em', marginLeft: '4px' }}>→</span>
              </button>
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
