/**
 * Unlock Screen
 * 
 * PIN entry to unlock an existing wallet.
 * If 2FA is enabled, shows TOTP verification after PIN.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import PinInput from '../components/PinInput';
import TOTPVerify from '../components/TOTPVerify';
import { is2FAEnabled } from '../core/totp';
import { getPendingApprovals, isExtensionContext } from '../core/extension-bridge';
import './Unlock.css';

// Sultan Crown Logo - uses PNG images based on theme
const SultanLogo = ({ size = 64, isDark }: { size?: number; isDark: boolean }) => (
  <img 
    src={isDark ? "/sultan-logo-dark.png" : "/sultan-logo-light.png"} 
    alt="Sultan" 
    width={size} 
    height={size}
    className="sultan-logo-img"
  />
);

// Lock Icon for locked state
const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

type UnlockStep = 'pin' | 'totp';

export default function Unlock() {
  const navigate = useNavigate();
  const { unlock, lock, error, clearError } = useWallet();
  
  const [step, setStep] = useState<UnlockStep>('pin');
  const [isLoading, setIsLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  // Force dark mode for Unlock screen
  const isDark = true;

  useEffect(() => {
    // Force dark theme on mount
    document.documentElement.setAttribute('data-theme', 'dark');
    
    // Optional: Restore theme when unmounting if you want to preserve user preference elsewhere
    // But since this is a critical flow, we might just leave it
  }, []);
  const [key, setKey] = useState(0); // Force PinInput reset

  const MAX_ATTEMPTS = 5;

  /**
   * Navigate to appropriate screen after successful unlock
   * Checks for pending deep link connection first, then pending approvals
   */
  const navigateAfterUnlock = async () => {
    // Check for pending deep link connection
    const pendingConnect = sessionStorage.getItem('sultan_pending_connect');
    if (pendingConnect) {
      sessionStorage.removeItem('sultan_pending_connect');
      navigate(pendingConnect);
      return;
    }
    
    if (isExtensionContext()) {
      try {
        const pending = await getPendingApprovals();
        if (pending.length > 0) {
          navigate('/approve');
          return;
        }
      } catch (e) {
        // If we can't check, just go to dashboard
        console.error('Failed to check pending approvals:', e);
      }
    }
    navigate('/dashboard');
  };

  const handlePinComplete = async (pin: string) => {
    setIsLoading(true);
    clearError();
    
    try {
      const success = await unlock(pin);
      if (success) {
        // Check if 2FA is enabled
        if (is2FAEnabled()) {
          setStep('totp');
        } else {
          await navigateAfterUnlock();
        }
      } else {
        setAttempts(prev => prev + 1);
        setKey(prev => prev + 1); // Reset PIN input
      }
    } catch {
      setAttempts(prev => prev + 1);
      setKey(prev => prev + 1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTOTPSuccess = () => {
    navigateAfterUnlock();
  };

  const handleTOTPCancel = () => {
    // Lock wallet and go back to PIN
    lock();
    setStep('pin');
    setKey(prev => prev + 1);
  };

  const remainingAttempts = MAX_ATTEMPTS - attempts;
  const isLocked = attempts >= MAX_ATTEMPTS;

  if (isLocked) {
    return (
      <div className="unlock-screen full-screen-overlay">
        <div className="unlock-content fade-in">
          <div className="lock-icon">
            <LockIcon />
          </div>
          <h2>Wallet Locked</h2>
          <p className="text-muted mb-lg">
            Too many incorrect attempts. Please wait 5 minutes or restore from recovery phrase.
          </p>
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/import')}
          >
            Restore with Recovery Phrase
          </button>
        </div>
      </div>
    );
  }

  // Show TOTP verification step
  if (step === 'totp') {
    return (
      <div className="unlock-screen full-screen-overlay">
        <TOTPVerify 
          onSuccess={handleTOTPSuccess}
          onCancel={handleTOTPCancel}
        />
      </div>
    );
  }

  return (
    <div className="unlock-screen full-screen-overlay">
      <div className="unlock-content fade-in">
        <div className="sultan-icon">
          <SultanLogo size={64} isDark={isDark} />
        </div>
        
        <h2>Welcome Back</h2>
        <p className="text-muted mb-lg">
          Enter your PIN to unlock
        </p>

        {isLoading ? (
          <div className="spinner" />
        ) : (
          <PinInput key={key} length={6} onComplete={handlePinComplete} />
        )}

        {error && (
          <p className="text-error mt-md">
            Incorrect PIN. {remainingAttempts} attempts remaining.
          </p>
        )}

        <button 
          className="btn-link mt-xl"
          onClick={() => navigate('/import')}
        >
          Restore with Recovery Phrase
        </button>
      </div>
    </div>
  );
}
