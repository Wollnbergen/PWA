/**
 * Settings Screen
 * 
 * Wallet settings, backup, and account management.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useTheme } from '../hooks/useTheme';
import { walletStorage } from '../core/storage.secure';
import PinInput from '../components/PinInput';
import MnemonicDisplay from '../components/MnemonicDisplay';
import TOTPSetup from '../components/TOTPSetup';
import { is2FAEnabled } from '../core/totp';
import './Settings.css';

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

const MonitorIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

type Modal = 'none' | 'backup' | 'delete' | 'accounts' | 'totp';

export default function Settings() {
  const navigate = useNavigate();
  const [modal, setModal] = useState<Modal>('none');
  const [showPinForBackup, setShowPinForBackup] = useState(false);
  const [mnemonic, setMnemonic] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  
  // Force re-render when 2FA status changes
  const [, setForceUpdate] = useState(0);
  const twoFAEnabled = is2FAEnabled();
  const { lock, deriveNewAccount, accounts, currentAccount, switchAccount, deleteWalletData, updateAccountName } = useWallet();
  const { theme, setTheme } = useTheme();

  const [editingAccountIndex, setEditingAccountIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleStartEdit = (e: React.MouseEvent, index: number, currentName: string) => {
    e.stopPropagation();
    setEditingAccountIndex(index);
    setEditingName(currentName);
  };

  const handleSaveName = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (editingName.trim()) {
      updateAccountName(index, editingName.trim());
    }
    setEditingAccountIndex(null);
  };

  const handleBackupClick = () => {
    setShowPinForBackup(true);
    setModal('backup');
  };

  const handleTOTPClose = () => {
    setModal('none');
    setForceUpdate(n => n + 1); // Refresh 2FA status
  };

  const handlePinComplete = async (pin: string) => {
    try {
      const storedMnemonic = await walletStorage.getMnemonic(pin);
      if (storedMnemonic) {
        setMnemonic(storedMnemonic);
        setShowPinForBackup(false);
      }
    } catch {
      // Invalid PIN
    }
  };

  const handleDeleteWallet = async () => {
    if (deleteConfirm !== 'DELETE') return;
    
    setIsDeleting(true);
    try {
      await deleteWalletData();
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Failed to delete wallet:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddAccount = async () => {
    if (!newAccountName.trim()) return;
    
    await deriveNewAccount(newAccountName.trim());
    setNewAccountName('');
    setModal('none');
  };

  const handleLock = () => {
    lock();
    navigate('/unlock');
  };

  return (
    <div className="settings-screen">
      <header className="screen-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          <BackIcon />
        </button>
        <h2>Settings</h2>
        <div style={{ width: 40 }} />
      </header>

      <div className="settings-content fade-in">
        <div className="settings-section slide-in stagger-1">
          <h3>Account</h3>
          
          <div className="setting-item" onClick={() => setModal('accounts')}>
            <div className="setting-info">
              <span className="setting-label">Manage Accounts</span>
              <span className="setting-value">{accounts?.length || 1} account(s)</span>
            </div>
            <span className="setting-arrow"><ChevronRightIcon /></span>
          </div>
        </div>

        <div className="settings-section slide-in stagger-2">
          <h3>Preferences & Security</h3>
          
          <div className="settings-grid">
            <div className="setting-item theme-selector">
              <div className="setting-info">
                <span className="setting-label">Theme</span>
                <span className="setting-hint">Choose appearance</span>
              </div>
              <div className="theme-options">
                <button 
                  className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => setTheme('light')}
                  title="Light"
                >
                  <SunIcon />
                </button>
                <button 
                  className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setTheme('dark')}
                  title="Dark"
                >
                  <MoonIcon />
                </button>
                <button 
                  className={`theme-btn ${theme === 'system' ? 'active' : ''}`}
                  onClick={() => setTheme('system')}
                  title="System"
                >
                  <MonitorIcon />
                </button>
              </div>
            </div>

            <div className="setting-item" onClick={handleLock}>
              <div className="setting-info">
                <span className="setting-label">Lock Wallet</span>
                <span className="setting-hint">Require PIN access</span>
              </div>
              <span className="setting-arrow"><LockIcon /></span>
            </div>
          </div>
        </div>

        <div className="settings-section slide-in stagger-3">
          <h3>Security Details</h3>
          
          <div className="setting-item" onClick={() => navigate('/connected-apps')}>
            <div className="setting-info">
              <span className="setting-label">Connected Apps</span>
              <span className="setting-hint">Manage dApp connections</span>
            </div>
            <span className="setting-arrow"><ChevronRightIcon /></span>
          </div>
          
          <div className="setting-item" onClick={() => navigate('/walletlink')}>
            <div className="setting-info">
              <span className="setting-label">WalletLink</span>
              <span className="setting-hint">Connect to desktop dApps via QR</span>
            </div>
            <span className="setting-arrow"><ChevronRightIcon /></span>
          </div>
          
          <div className="setting-item" onClick={() => setModal('totp')}>
            <div className="setting-info">
              <span className="setting-label">Two-Factor Authentication</span>
              <span className="setting-hint">
                {twoFAEnabled ? 'Enabled - authenticator required at login' : 'Add extra security to your wallet'}
              </span>
            </div>
            <span className={`setting-badge ${twoFAEnabled ? 'enabled' : ''}`}>
              {twoFAEnabled ? <><CheckIcon /> On</> : 'Off'}
            </span>
          </div>
          
          <div className="setting-item" onClick={handleBackupClick}>
            <div className="setting-info">
              <span className="setting-label">Backup Recovery Phrase</span>
              <span className="setting-hint">View your 24-word phrase</span>
            </div>
            <span className="setting-arrow"><ChevronRightIcon /></span>
          </div>
          
          <div className="setting-item info">
            <div className="setting-info">
              <span className="setting-label">Auto-Lock</span>
              <span className="setting-hint">Locks after 5 min</span>
            </div>
            <span className="setting-value">5 min</span>
          </div>
        </div>

        <div className="settings-section slide-in stagger-4">
          <h3>About</h3>
          
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Version</span>
              <span className="setting-value">1.6.8</span>
            </div>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Network</span>
              <span className="setting-value">Sultan Mainnet</span>
            </div>
          </div>
          
          <div className="setting-item" onClick={() => window.open('https://sltn.io/privacy.html', '_blank')}>
            <div className="setting-info">
              <span className="setting-label">Privacy Policy</span>
              <span className="setting-hint">View our privacy practices</span>
            </div>
            <span className="setting-arrow"><ChevronRightIcon /></span>
          </div>
        </div>

        <div className="settings-section danger-section slide-in stagger-5">
          <h3>Danger Zone</h3>
          
          <div className="setting-item danger" onClick={() => setModal('delete')}>
            <div className="setting-info">
              <span className="setting-label">Delete Wallet</span>
              <span className="setting-hint">Remove wallet from this device</span>
            </div>
            <span className="setting-arrow">⚠️</span>
          </div>
        </div>
      </div>

      {/* Backup Modal */}
      {modal === 'backup' && (
        <div className="modal-overlay" onClick={() => setModal('none')}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Backup Recovery Phrase</h3>
            
            {showPinForBackup ? (
              <>
                <p className="text-muted mb-lg">Enter your PIN to view</p>
                <PinInput length={6} onComplete={handlePinComplete} />
              </>
            ) : (
              <>
                <div className="warning-box mb-md">
                  ⚠️ Never share your recovery phrase with anyone!
                </div>
                <MnemonicDisplay mnemonic={mnemonic} />
                <button 
                  className="btn btn-secondary mt-lg"
                  onClick={() => {
                    setMnemonic('');
                    setModal('none');
                  }}
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {modal === 'delete' && (
        <div className="modal-overlay" onClick={() => setModal('none')}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="text-error">Delete Wallet</h3>
            <p className="text-muted mb-md">
              This will permanently remove your wallet from this device. 
              Make sure you have backed up your recovery phrase.
            </p>
            <p className="mb-md">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              className="input mb-md"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE"
            />
            <div className="button-row">
              <button 
                className="btn btn-secondary"
                onClick={() => setModal('none')}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger"
                onClick={handleDeleteWallet}
                disabled={deleteConfirm !== 'DELETE' || isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Wallet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accounts Modal */}
      {modal === 'accounts' && (
        <div className="modal-overlay" onClick={() => setModal('none')}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Manage Accounts</h3>
            
            <div className="accounts-list">
              <div className="non-custodial-note mb-sm">
                <span className="note-icon">ℹ️</span>
                <p>Custom names are saved locally on this device. They will not sync to other devices due to the non-custodial nature of the wallet.</p>
              </div>
              {accounts?.map((account, index) => (
                <div 
                  key={account.address}
                  className={`account-item ${currentAccount?.address === account.address ? 'active' : ''}`}
                  onClick={() => {
                    switchAccount(account.index);
                    setModal('none');
                  }}
                >
                  <div className="account-info">
                    {editingAccountIndex === index ? (
                      <div className="edit-name-form" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          className="input input-sm"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          autoFocus
                          maxLength={32}
                        />
                        <button 
                          className="btn-save-name"
                          onClick={(e) => handleSaveName(e, index)}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="name-row">
                        <span className="account-name">{account.name}</span>
                        <button 
                          className="btn-edit-name" 
                          onClick={(e) => handleStartEdit(e, index, account.name)}
                          title="Edit name"
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      </div>
                    )}
                    <span className="account-address">
                      {account.address.slice(0, 16)}...
                    </span>
                  </div>
                  {currentAccount?.address === account.address && (
                    <span className="active-badge">Active</span>
                  )}
                </div>
              ))}
            </div>

            <div className="add-account-form mt-lg">
              <input
                type="text"
                className="input"
                value={newAccountName}
                onChange={e => setNewAccountName(e.target.value)}
                placeholder="New account name"
                maxLength={32}
              />
              <button 
                className="btn btn-primary mt-sm"
                onClick={handleAddAccount}
                disabled={!newAccountName.trim()}
              >
                + Add Account
              </button>
            </div>

            <button 
              className="btn btn-secondary mt-md"
              onClick={() => setModal('none')}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* TOTP Setup Modal */}
      {modal === 'totp' && (
        <div className="modal-overlay" onClick={handleTOTPClose}>
          <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
            <TOTPSetup 
              accountName={currentAccount?.address?.slice(0, 16) || 'Sultan Wallet'}
              onClose={handleTOTPClose}
            />
          </div>
        </div>
      )}
    </div>
  );
}
