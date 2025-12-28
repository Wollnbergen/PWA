/**
 * Become Validator Screen
 * 
 * Secure validator setup flow (like Solana/Cosmos):
 * 1. User sets up server and runs `sultan-node init`
 * 2. Server generates validator keypair locally (never leaves server)
 * 3. User copies validator address from server
 * 4. User sends 10,000 SLTN to fund the validator
 * 5. Server auto-registers when funded
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useTheme } from '../hooks/useTheme';
import { useBalance } from '../hooks/useBalance';
import { SultanWallet } from '../core/wallet';
import { sultanAPI } from '../api/sultanAPI';
import { validateAddress, validateAmount } from '../core/security';
import './BecomeValidator.css';

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

const ValidatorIcon = () => (
  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ServerIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
);

const KeyIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

type Step = 'overview' | 'server' | 'address' | 'fund';

export default function BecomeValidator() {
  const navigate = useNavigate();
  const { wallet, currentAccount } = useWallet();
  const { theme, setTheme } = useTheme();
  const { data: balanceData, refetch: refetchBalance } = useBalance(currentAccount?.address);
  
  const [step, setStep] = useState<Step>('overview');
  const [validatorAddress, setValidatorAddress] = useState('');
  const [moniker, setMoniker] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [serverReady, setServerReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showBeginnerGuide, setShowBeginnerGuide] = useState(false);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const availableBalance = SultanWallet.formatSLTN(balanceData?.available || '0');
  const hasMinimumStake = parseFloat(availableBalance) >= 10000;

  const handleCopyCommand = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFundValidator = async () => {
    if (!wallet || !currentAccount) return;

    // Validate address
    const addrValidation = validateAddress(validatorAddress);
    if (!addrValidation.valid) {
      setError(addrValidation.error || 'Invalid validator address');
      return;
    }

    if (!validatorAddress.startsWith('sltn1')) {
      setError('Address must start with sltn1');
      return;
    }

    // Validate amount
    const amount = '10000';
    const amountValidation = validateAmount(amount, availableBalance);
    if (!amountValidation.valid) {
      setError(amountValidation.error || 'Insufficient balance');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const atomicAmount = SultanWallet.parseSLTN(amount);
      
      // Fetch current nonce from blockchain
      const currentNonce = await sultanAPI.getNonce(currentAccount.address);
      
      const txData = {
        type: 'fund_validator' as const,
        from: currentAccount.address,
        to: validatorAddress,
        amount: atomicAmount,
        moniker: moniker.trim() || 'Sultan Validator',
        nonce: currentNonce,
        timestamp: Date.now(),
      };

      const signature = await wallet.signTransaction(txData, currentAccount.index);
      
      await sultanAPI.broadcastTransaction({
        from: currentAccount.address,
        to: validatorAddress,
        amount: atomicAmount,
        memo: `validator:${moniker.trim() || 'Sultan Validator'}`,
        nonce: currentNonce,
        timestamp: Date.now(),
        signature,
        publicKey: currentAccount.publicKey,
      });

      setSuccess(`🎉 Successfully funded validator with 10,000 SLTN! Your node will auto-register.`);
      refetchBalance();
      
      setTimeout(() => {
        navigate('/stake');
      }, 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fund validator');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="step-indicator">
      <div className={`step-dot ${step === 'overview' ? 'active' : ''}`}>1</div>
      <div className="step-line" />
      <div className={`step-dot ${step === 'server' ? 'active' : serverReady ? 'done' : ''}`}>2</div>
      <div className="step-line" />
      <div className={`step-dot ${step === 'address' ? 'active' : validatorAddress ? 'done' : ''}`}>3</div>
      <div className="step-line" />
      <div className={`step-dot ${step === 'fund' ? 'active' : ''}`}>4</div>
    </div>
  );

  return (
    <div className="container">
      <header className="header">
        <button className="back-btn" onClick={() => step === 'overview' ? navigate('/stake') : setStep('overview')}>
          <BackIcon />
        </button>
        <h1 className="title">Become Validator</h1>
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <main className="main-content">
        {renderStepIndicator()}

        {/* Step 1: Overview */}
        {step === 'overview' && (
          <>
            <div className="validator-hero">
              <div className="validator-icon">
                <ValidatorIcon />
              </div>
              <h2>Become a Sultan Validator</h2>
              <p className="hero-subtitle">Secure the network and earn ~13.33% APY (variable)</p>
            </div>

            {/* Beginner-friendly explainer */}
            <div className="beginner-guide-toggle" onClick={() => setShowBeginnerGuide(!showBeginnerGuide)}>
              <span>🆕 New to this? Start here!</span>
              <span className="toggle-arrow">{showBeginnerGuide ? '▲' : '▼'}</span>
            </div>

            {showBeginnerGuide && (
              <div className="beginner-guide">
                <div className="guide-item">
                  <strong>What is a validator?</strong>
                  <p>A validator is a computer that helps keep the Sultan network running. Think of it like being a helpful neighbor who verifies that transactions are legitimate. In return for helping, you earn rewards (~13.33% per year).</p>
                </div>
                <div className="guide-item">
                  <strong>What is SSH?</strong>
                  <p>SSH (Secure Shell) is a way to securely control a remote computer using text commands. It's like a secure phone call where you type instructions to the server.</p>
                </div>
                <div className="guide-item">
                  <strong>What is a VPS/Server?</strong>
                  <p>A VPS (Virtual Private Server) is a computer you rent in a data center. It runs 24/7 without you needing to keep your home computer on. Companies like DigitalOcean make this easy—you click a few buttons, and you have your own server!</p>
                </div>
                <div className="guide-item">
                  <strong>Do I need to be a programmer?</strong>
                  <p>No! You just need to copy-paste a few commands. If you can follow a recipe, you can do this. The whole setup takes about 5 minutes once you have your server.</p>
                </div>
                <div className="guide-item community">
                  <strong>Still nervous?</strong>
                  <p>Join our <a href="https://discord.gg/sultan" target="_blank" rel="noopener noreferrer">Discord</a> or <a href="https://t.me/sultanchain" target="_blank" rel="noopener noreferrer">Telegram</a>! Community members are happy to help beginners step-by-step.</p>
                </div>
              </div>
            )}

            <div className="security-badge">
              <ShieldIcon />
              <div>
                <strong>Bank-Grade Security</strong>
                <p>Keys generated on your server, never transmitted</p>
              </div>
            </div>

            <div className="benefits-card">
              <h3>Validator Benefits</h3>
              <ul className="benefits-list">
                <li><CheckIcon /> <span>~13.33% APY (variable based on network stake)</span></li>
                <li><CheckIcon /> <span>Commission on delegator rewards</span></li>
                <li><CheckIcon /> <span>Zero gas fees on all transactions</span></li>
                <li><CheckIcon /> <span>Help secure the Sultan network</span></li>
              </ul>
            </div>

            <div className="requirements-card">
              <h3>Requirements</h3>
              <div className="requirement-item">
                <span className="requirement-label">Minimum Stake</span>
                <span className="requirement-value">10,000 SLTN</span>
              </div>
              <div className="requirement-item">
                <span className="requirement-label">Your Balance</span>
                <span className={`requirement-value ${hasMinimumStake ? 'success' : 'error'}`}>
                  {parseFloat(availableBalance).toLocaleString()} SLTN
                </span>
              </div>
              <div className="requirement-item">
                <span className="requirement-label">Server Cost</span>
                <span className="requirement-value">~$5-6/month</span>
              </div>
            </div>

            <div className="steps-preview">
              <h3>How It Works</h3>
              <div className="step-preview-item">
                <div className="step-preview-num">1</div>
                <div>
                  <strong>Create a Server</strong>
                  <p>Get a $5/mo VPS from DigitalOcean, Vultr, etc.</p>
                </div>
              </div>
              <div className="step-preview-item">
                <div className="step-preview-num">2</div>
                <div>
                  <strong>Start Validator Node</strong>
                  <p>Run <code>sultan-node --validator</code> with your stake</p>
                </div>
              </div>
              <div className="step-preview-item">
                <div className="step-preview-num">3</div>
                <div>
                  <strong>Connect to Network</strong>
                  <p>Your node syncs with bootstrap peers automatically</p>
                </div>
              </div>
              <div className="step-preview-item">
                <div className="step-preview-num">4</div>
                <div>
                  <strong>Earn Rewards</strong>
                  <p>Start earning ~13.33% APY on your stake</p>
                </div>
              </div>
            </div>

            {hasMinimumStake ? (
              <button className="btn btn-primary btn-lg" onClick={() => setStep('server')}>
                Start Setup →
              </button>
            ) : (
              <div className="insufficient-funds">
                <p>You need <strong>10,000 SLTN</strong> to become a validator.</p>
                <button className="btn btn-secondary" onClick={() => navigate('/receive')}>
                  Receive SLTN
                </button>
              </div>
            )}
          </>
        )}

        {/* Step 2: Server Setup */}
        {step === 'server' && (
          <>
            <div className="step-header-large">
              <ServerIcon />
              <h2>Step 1: Set Up Your Server</h2>
            </div>

            <div className="info-card">
              <p>Create a VPS with these minimum specs:</p>
              <ul className="specs-list">
                <li>1 vCPU</li>
                <li>1GB RAM</li>
                <li>20GB SSD</li>
                <li>Ubuntu 24.04</li>
              </ul>
            </div>

            <div className="provider-cards">
              <a href="https://www.digitalocean.com" target="_blank" rel="noopener noreferrer" className="provider-card">
                <strong>DigitalOcean</strong>
                <span className="price">$6/mo</span>
              </a>
              <a href="https://www.vultr.com" target="_blank" rel="noopener noreferrer" className="provider-card">
                <strong>Vultr</strong>
                <span className="price">$5/mo</span>
              </a>
              <a href="https://www.hetzner.com/cloud" target="_blank" rel="noopener noreferrer" className="provider-card">
                <strong>Hetzner</strong>
                <span className="price">€4.51/mo</span>
              </a>
            </div>

            <div className="info-card">
              <h4>SSH into your server and run:</h4>
              <div className="command-block">
                <pre>{`# Download Sultan node
curl -L https://github.com/Wollnbergen/DOCS/releases/latest/download/sultan-node -o sultan-node
chmod +x sultan-node

# Open firewall ports
sudo ufw allow 26656/tcp && sudo ufw allow 26657/tcp

# Start validator (replace MyValidator with your name)
./sultan-node --validator \\
  --name "MyValidator" \\
  --validator-address "MyValidator" \\
  --validator-stake 10000 \\
  --enable-sharding --shard-count 16 \\
  --enable-p2p \\
  --bootstrap-peers /ip4/206.189.224.142/tcp/26656`}</pre>
                <button className="copy-btn" onClick={() => handleCopyCommand(`curl -L https://github.com/Wollnbergen/DOCS/releases/latest/download/sultan-node -o sultan-node && chmod +x sultan-node && sudo ufw allow 26656/tcp && sudo ufw allow 26657/tcp`)}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
            </div>

            <div className="tip-box">
              <strong>💡 What happens:</strong> Your node connects to the Sultan network via the bootstrap peer,
              syncs with other validators, and starts participating in consensus to earn rewards.
            </div>

            <div className="checkbox-item" onClick={() => setServerReady(!serverReady)}>
              <div className={`checkbox ${serverReady ? 'checked' : ''}`}>
                {serverReady && <CheckIcon />}
              </div>
              <span>My validator is running and connected to peers</span>
            </div>

            <div className="button-row">
              <button className="btn btn-secondary" onClick={() => setStep('overview')}>
                ← Back
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => navigate('/stake')}
                disabled={!serverReady}
              >
                Done → View Staking
              </button>
            </div>

            <div className="info-card" style={{ marginTop: '20px' }}>
              <h4>📚 Full Documentation</h4>
              <p>For systemd service setup, monitoring, and troubleshooting, see the <a href="https://github.com/Wollnbergen/0xv7/blob/main/VALIDATOR_GUIDE.md" target="_blank" rel="noopener noreferrer">Validator Guide</a>.</p>
            </div>
          </>
        )}

        {/* Step 3: Enter Address */}
        {step === 'address' && (
          <>
            <div className="step-header-large">
              <KeyIcon />
              <h2>Step 2: Copy Validator Address</h2>
            </div>

            <div className="info-card">
              <p>After running <code>sultan-node init</code>, your server displays:</p>
              <div className="command-block">
                <pre>{`✅ Sultan node initialized!

Validator Address: sltn1abc...xyz
Moniker: MyValidator

⚠️  IMPORTANT: Your validator key is stored at:
    ~/.sultan/validator_key.json
    Keep this file safe! Never share it.

Next: Fund this address with 10,000 SLTN to activate.`}</pre>
              </div>
            </div>

            <div className="form-group">
              <label>Paste Your Validator Address</label>
              <input
                type="text"
                className="input"
                placeholder="sltn1..."
                value={validatorAddress}
                onChange={(e) => setValidatorAddress(e.target.value.trim())}
              />
              <span className="input-hint">
                This is the address shown by your server (starts with sltn1)
              </span>
            </div>

            <div className="form-group">
              <label>Validator Name (Optional)</label>
              <input
                type="text"
                className="input"
                placeholder="e.g., MyValidator"
                value={moniker}
                onChange={(e) => setMoniker(e.target.value)}
                maxLength={32}
              />
            </div>

            <div className="security-note">
              <ShieldIcon />
              <div>
                <strong>Why this is secure</strong>
                <p>Your validator private key was generated on the server and stays there. 
                You're only entering the public address here — safe to share.</p>
              </div>
            </div>

            <div className="button-row">
              <button className="btn btn-secondary" onClick={() => setStep('server')}>
                ← Back
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => setStep('fund')}
                disabled={!validatorAddress || !validatorAddress.startsWith('sltn1')}
              >
                Continue →
              </button>
            </div>
          </>
        )}

        {/* Step 4: Fund Validator */}
        {step === 'fund' && (
          <>
            <div className="step-header-large">
              <SendIcon />
              <h2>Step 3: Fund Your Validator</h2>
            </div>

            <div className="fund-summary">
              <div className="fund-row">
                <span className="fund-label">From</span>
                <span className="fund-value">{currentAccount?.address.slice(0, 12)}...{currentAccount?.address.slice(-6)}</span>
              </div>
              <div className="fund-arrow">↓</div>
              <div className="fund-row">
                <span className="fund-label">To (Validator)</span>
                <span className="fund-value">{validatorAddress.slice(0, 12)}...{validatorAddress.slice(-6)}</span>
              </div>
              <div className="fund-row highlight">
                <span className="fund-label">Amount</span>
                <span className="fund-value">10,000 SLTN</span>
              </div>
            </div>

            <div className="info-card">
              <h4>What happens next:</h4>
              <ol className="next-list">
                <li>This wallet sends 10,000 SLTN to your validator address</li>
                <li>Your server detects the funding automatically</li>
                <li>Validator registers on-chain and starts earning rewards</li>
                <li>You earn 13.33% APY + delegator commissions</li>
              </ol>
            </div>

            <div className="tip-box">
              <strong>💡 Keep your server running!</strong> After funding, start the validator:
              <div className="command-block small">
                <pre>./sultan-node start --validator</pre>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <button
              className="btn btn-primary btn-lg"
              onClick={handleFundValidator}
              disabled={isLoading}
            >
              {isLoading ? (
                <><span className="spinner-small" /> Sending...</>
              ) : (
                '🚀 Fund Validator with 10,000 SLTN'
              )}
            </button>

            <div className="button-row">
              <button className="btn btn-secondary" onClick={() => setStep('address')}>
                ← Back
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
