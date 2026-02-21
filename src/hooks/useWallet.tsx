/**
 * Wallet State Hook
 * 
 * Manages wallet initialization, locking, and account state.
 * Includes production security features:
 * - Rate limiting on unlock attempts
 * - Session timeout with auto-lock
 * - Secure PIN handling
 */

import { useState, useEffect, useCallback, createContext, useContext, ReactNode, useRef } from 'react';
import { SultanWallet, SultanAccount } from '../core/wallet';
import {
  hasWallet,
  saveWallet,
  loadWallet,
  deleteWallet,
  setSessionPin,
  getSessionPin,
  clearSession,
} from '../core/storage.secure';
import {
  validatePin,
  recordFailedAttempt,
  clearFailedAttempts,
  isLockedOut,
  getRemainingLockoutTime,
  updateActivity,
  checkSessionTimeout,
  startSession,
  endSession as endSecuritySession,
  setSessionPinHash,
  clearSessionPinHash,
  hashPinForVerification,
} from '../core/security';

interface WalletState {
  isLoading: boolean;
  isInitialized: boolean;
  isLocked: boolean;
  wallet: SultanWallet | null;
  accounts: SultanAccount[];
  activeAccountIndex: number;
  error: string | null;
  lockoutRemainingSeconds: number; // Rate limiting lockout
}

interface WalletContextValue extends WalletState {
  // Computed
  currentAccount: SultanAccount | null;
  isLockedOut: boolean;

  // Actions
  createWallet: (pin: string) => Promise<string>;
  importWallet: (mnemonic: string, pin: string) => Promise<void>;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  deleteWalletData: () => Promise<void>;
  setActiveAccount: (index: number) => void;
  switchAccount: (index: number) => void; // Alias for setActiveAccount
  deriveNewAccount: (name?: string) => Promise<SultanAccount>;
  updateAccountName: (index: number, name: string) => void;
  clearError: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    isLoading: true,
    isInitialized: false,
    isLocked: true,
    wallet: null,
    accounts: [],
    activeAccountIndex: 0,
    error: null,
    lockoutRemainingSeconds: 0,
  });

  // Session timeout interval ref
  const sessionTimeoutRef = useRef<number | null>(null);
  const lockoutIntervalRef = useRef<number | null>(null);

  // Setup activity tracking for session timeout
  useEffect(() => {
    const handleActivity = () => {
      if (!state.isLocked && state.wallet) {
        updateActivity();
      }
    };

    // Track user activity
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [state.isLocked, state.wallet]);

  // Session timeout check interval
  useEffect(() => {
    if (!state.isLocked && state.wallet) {
      sessionTimeoutRef.current = window.setInterval(() => {
        if (checkSessionTimeout()) {
          // Session expired - auto-lock
          state.wallet?.destroy();
          clearSession();
          endSecuritySession();
          setState(prev => ({
            ...prev,
            isLocked: true,
            wallet: null,
            accounts: [],
            error: 'Session expired - please unlock again',
          }));
        }
      }, 30000); // Check every 30 seconds
    }

    return () => {
      if (sessionTimeoutRef.current) {
        clearInterval(sessionTimeoutRef.current);
        sessionTimeoutRef.current = null;
      }
    };
  }, [state.isLocked, state.wallet]);

  // Update lockout timer display
  useEffect(() => {
    if (isLockedOut()) {
      const updateLockout = () => {
        const remaining = getRemainingLockoutTime();
        setState(prev => ({ ...prev, lockoutRemainingSeconds: remaining }));

        if (remaining === 0) {
          if (lockoutIntervalRef.current) {
            clearInterval(lockoutIntervalRef.current);
            lockoutIntervalRef.current = null;
          }
        }
      };

      updateLockout();
      lockoutIntervalRef.current = window.setInterval(updateLockout, 1000);
    }

    return () => {
      if (lockoutIntervalRef.current) {
        clearInterval(lockoutIntervalRef.current);
        lockoutIntervalRef.current = null;
      }
    };
  }, [state.error]); // Re-check when error changes (after failed attempt)

  // Check if wallet exists on mount
  useEffect(() => {
    async function checkWallet() {
      try {
        const exists = await hasWallet();
        const sessionPin = getSessionPin();

        if (exists && sessionPin) {
          // Try to restore session
          try {
            const mnemonic = await loadWallet(sessionPin);
            const wallet = await SultanWallet.fromMnemonic(mnemonic);
            const accounts = wallet.getAccounts();

            setState({
              isLoading: false,
              isInitialized: true,
              isLocked: false,
              wallet,
              accounts,
              activeAccountIndex: 0,
              error: null,
              lockoutRemainingSeconds: 0,
            });
            return;
          } catch {
            clearSession();
          }
        }

        setState(prev => ({
          ...prev,
          isLoading: false,
          isInitialized: exists,
          isLocked: true,
        }));
      } catch (err) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to check wallet',
        }));
      }
    }

    checkWallet();
  }, []);

  const createWallet = useCallback(async (pin: string): Promise<string> => {
    try {
      // Validate PIN format
      const pinValidation = validatePin(pin);
      if (!pinValidation.valid) {
        throw new Error(pinValidation.error);
      }

      const mnemonic = SultanWallet.generateMnemonic();
      const wallet = await SultanWallet.fromMnemonic(mnemonic);

      await saveWallet(mnemonic, pin);
      setSessionPin(pin);

      // SECURITY: Store hashed PIN for transaction verification
      const pinHash = hashPinForVerification(pin);
      setSessionPinHash(pinHash);

      // Initialize security session
      startSession(() => {
        wallet.destroy();
        clearSession();
        clearSessionPinHash();
      });

      const accounts = wallet.getAccounts();

      setState({
        isLoading: false,
        isInitialized: true,
        isLocked: false,
        wallet,
        accounts,
        activeAccountIndex: 0,
        error: null,
        lockoutRemainingSeconds: 0,
      });

      return mnemonic;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create wallet';
      setState(prev => ({ ...prev, error: message }));
      throw err;
    }
  }, []);

  const importWallet = useCallback(async (mnemonic: string, pin: string): Promise<void> => {
    try {
      // Validate PIN format
      const pinValidation = validatePin(pin);
      if (!pinValidation.valid) {
        throw new Error(pinValidation.error);
      }

      const wallet = await SultanWallet.fromMnemonic(mnemonic);

      await saveWallet(mnemonic, pin);
      setSessionPin(pin);

      // SECURITY: Store hashed PIN for transaction verification
      const pinHash = hashPinForVerification(pin);
      setSessionPinHash(pinHash);

      // Initialize security session
      startSession(() => {
        wallet.destroy();
        clearSession();
        clearSessionPinHash();
      });

      const accounts = wallet.getAccounts();

      setState({
        isLoading: false,
        isInitialized: true,
        isLocked: false,
        wallet,
        accounts,
        activeAccountIndex: 0,
        error: null,
        lockoutRemainingSeconds: 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import wallet';
      setState(prev => ({ ...prev, error: message }));
      throw err;
    }
  }, []);

  const unlock = useCallback(async (pin: string): Promise<boolean> => {
    // Check for rate limiting lockout
    if (isLockedOut()) {
      const remaining = getRemainingLockoutTime();
      setState(prev => ({
        ...prev,
        error: `Too many failed attempts. Try again in ${remaining} seconds.`,
        lockoutRemainingSeconds: remaining,
      }));
      return false;
    }

    try {
      const mnemonic = await loadWallet(pin);
      const wallet = await SultanWallet.fromMnemonic(mnemonic);

      // Successful unlock - clear failed attempts
      clearFailedAttempts();
      setSessionPin(pin);

      // SECURITY: Store hashed PIN for transaction verification
      const pinHash = hashPinForVerification(pin);
      setSessionPinHash(pinHash);

      // Initialize security session with auto-lock callback
      startSession(() => {
        // This will be called when session expires
        wallet.destroy();
        clearSession();
        clearSessionPinHash();
      });

      const accounts = wallet.getAccounts();

      setState(prev => ({
        ...prev,
        isLocked: false,
        wallet,
        accounts,
        error: null,
        lockoutRemainingSeconds: 0,
      }));
      return true;
    } catch (err) {
      // Record failed attempt for rate limiting
      const result = recordFailedAttempt();
      let message: string;

      if (isLockedOut()) {
        const remaining = getRemainingLockoutTime();
        message = `Too many failed attempts. Try again in ${remaining} seconds.`;
        setState(prev => ({ ...prev, error: message, lockoutRemainingSeconds: remaining }));
      } else {
        message = `Invalid PIN. ${result.attemptsRemaining} attempts remaining.`;
        setState(prev => ({ ...prev, error: message }));
      }
      return false;
    }
  }, []);

  const lock = useCallback(() => {
    state.wallet?.destroy();
    clearSession();
    clearSessionPinHash(); // SECURITY: Clear PIN hash on lock
    endSecuritySession(); // End the security session timer

    setState(prev => ({
      ...prev,
      isLocked: true,
      wallet: null,
      accounts: [],
    }));
  }, [state.wallet]);

  const deleteWalletData = useCallback(async () => {
    try {
      await deleteWallet();
      clearSessionPinHash();
      endSecuritySession();
      clearSession();
      clearFailedAttempts();

      if (state.wallet) {
        state.wallet.destroy();
      }

      setState({
        isLoading: false,
        isInitialized: false,
        isLocked: true,
        wallet: null,
        accounts: [],
        activeAccountIndex: 0,
        error: null,
        lockoutRemainingSeconds: 0,
      });
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: err instanceof Error ? err.message : 'Failed to delete wallet' 
      }));
      throw err;
    }
  }, [state.wallet]);

  const setActiveAccount = useCallback((index: number) => {
    setState(prev => ({ ...prev, activeAccountIndex: index }));
  }, []);

  const switchAccount = setActiveAccount; // Alias

  const deriveNewAccount = useCallback(async (name?: string): Promise<SultanAccount> => {
    if (!state.wallet) {
      throw new Error('Wallet not initialized');
    }

    const nextIndex = state.accounts.length;
    const account = await state.wallet.deriveAccount(nextIndex, name);

    setState(prev => ({
      ...prev,
      accounts: [...prev.accounts, account],
    }));

    return account;
  }, [state.wallet, state.accounts]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Computed values
  const currentAccount = state.accounts[state.activeAccountIndex] || null;
  const lockedOut = isLockedOut();

  const updateAccountName = useCallback((index: number, name: string) => {
    setState(prev => {
      const updated = prev.accounts.map(acc =>
        acc.index === index ? { ...acc, name } : acc
      );
      return { ...prev, accounts: updated };
    });
  }, []);

  const value: WalletContextValue = {
    ...state,
    currentAccount,
    isLockedOut: lockedOut,
    createWallet,
    importWallet,
    unlock,
    lock,
    deleteWalletData,
    setActiveAccount,
    switchAccount,
    deriveNewAccount,
    updateAccountName,
    clearError,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}

export { WalletContext };