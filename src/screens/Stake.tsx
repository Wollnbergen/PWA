/**
 * Stake Screen
 * 
 * Stake SLTN with validators for 13.33% APY.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useTheme } from '../hooks/useTheme';
import { useBalance, useStakingInfo, useValidators } from '../hooks/useBalance';
import { SultanWallet } from '../core/wallet';
import { sultanAPI, Validator } from '../api/sultanAPI';
import { validateAmount } from '../core/security';
import './Stake.css';

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

const GiftIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 12 20 22 4 22 4 12" />
    <rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </svg>
);

type Tab = 'stake' | 'unstake' | 'validators';

export default function Stake() {
  const navigate = useNavigate();
  const { wallet, currentAccount } = useWallet();
  const { theme, setTheme } = useTheme();
  const { data: balanceData } = useBalance(currentAccount?.address);
  const { data: stakingData, refetch: refetchStaking } = useStakingInfo(currentAccount?.address);
  const { data: validators } = useValidators();
  
  const [tab, setTab] = useState<Tab>('stake');
  const [amount, setAmount] = useState('');
  const [selectedValidator, setSelectedValidator] = useState<Validator | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const availableBalance = SultanWallet.formatSLTN(balanceData?.available || '0');
  const stakedBalance = SultanWallet.formatSLTN(stakingData?.staked || '0');
  const pendingRewards = SultanWallet.formatSLTN(stakingData?.pendingRewards || '0');

  useEffect(() => {
    if (validators && validators.length > 0 && !selectedValidator) {
      setSelectedValidator(validators[0]);
    }
  }, [validators, selectedValidator]);

  const handleStake = async () => {
    if (!wallet || !currentAccount || !selectedValidator) return;

    // Validate amount before proceeding
    const amountValidation = validateAmount(amount, availableBalance);
    if (!amountValidation.valid) {
      setError(amountValidation.error || 'Invalid amount');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const atomicAmount = SultanWallet.parseSLTN(amount);
      
      const txData = {
        type: 'stake' as const,
        from: currentAccount.address,
        validatorAddress: selectedValidator.address,
        amount: atomicAmount,
        timestamp: Date.now(),
      };

      const signature = await wallet.signTransaction(txData, currentAccount.index);
      
      await sultanAPI.stake({
        delegatorAddress: currentAccount.address,
        validatorAddress: selectedValidator.address,
        amount: atomicAmount,
        signature,
        publicKey: currentAccount.publicKey,
      });

      setSuccess(`Successfully staked ${amount} SLTN!`);
      setAmount('');
      refetchStaking();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Staking failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnstake = async () => {
    if (!wallet || !currentAccount) return;

    // Validate amount against staked balance
    const amountValidation = validateAmount(amount, stakedBalance);
    if (!amountValidation.valid) {
      setError(amountValidation.error || 'Invalid amount');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const atomicAmount = SultanWallet.parseSLTN(amount);
      
      const txData = {
        type: 'unstake' as const,
        from: currentAccount.address,
        amount: atomicAmount,
        timestamp: Date.now(),
      };

      const signature = await wallet.signTransaction(txData, currentAccount.index);
      
      await sultanAPI.unstake({
        delegatorAddress: currentAccount.address,
        amount: atomicAmount,
        signature,
        publicKey: currentAccount.publicKey,
      });

      setSuccess(`Unstaking ${amount} SLTN initiated. 21-day unbonding period.`);
      setAmount('');
      refetchStaking();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unstaking failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaimRewards = async () => {
    if (!wallet || !currentAccount) return;

    setIsLoading(true);
    setError('');

    try {
      const txData = {
        type: 'claim_rewards' as const,
        from: currentAccount.address,
        timestamp: Date.now(),
      };

      const signature = await wallet.signTransaction(txData, currentAccount.index);
      
      await sultanAPI.claimRewards({
        delegatorAddress: currentAccount.address,
        signature,
        publicKey: currentAccount.publicKey,
      });

      setSuccess('Rewards claimed successfully!');
      refetchStaking();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claiming failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="stake-screen">
      <header className="screen-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          <BackIcon />
        </button>
        <h2>Staking</h2>
        <button className="btn-icon theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
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
            <span className="overview-label">Rewards</span>
            <span className="overview-value">{pendingRewards} SLTN</span>
          </div>
        </div>

        {Number(pendingRewards) > 0 && (
          <button 
            className="btn btn-secondary claim-btn"
            onClick={handleClaimRewards}
            disabled={isLoading}
          >
            <GiftIcon /> Claim {pendingRewards} SLTN Rewards
          </button>
        )}

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
                  onClick={() => setAmount(tab === 'stake' ? availableBalance : stakedBalance)}
                >
                  MAX
                </button>
              </div>
            </div>

            {tab === 'stake' && selectedValidator && (
              <div className="selected-validator">
                <span className="text-muted">Staking with:</span>
                <span className="validator-name">{selectedValidator.name}</span>
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
                  <span className="validator-name">{validator.name}</span>
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

            {/* Become Validator CTA */}
            <div className="become-validator-cta">
              <p>Want to run your own validator?</p>
              <button 
                className="btn btn-secondary"
                onClick={() => navigate('/become-validator')}
              >
                🚀 Become a Validator
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
