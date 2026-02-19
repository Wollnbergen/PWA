import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useWallet } from './hooks/useWallet';
import { getPendingApprovals, isExtensionContext } from './core/extension-bridge';

// Screens
import Welcome from './screens/Welcome';
import CreateWallet from './screens/CreateWallet';
import ImportWallet from './screens/ImportWallet';
import Unlock from './screens/Unlock';
import Dashboard from './screens/Dashboard';
import Send from './screens/Send';
import Receive from './screens/Receive';
import Stake from './screens/Stake';
import BecomeValidator from './screens/BecomeValidator';
import Settings from './screens/Settings';
import Activity from './screens/Activity';
import Governance from './screens/Governance';
import NFTs from './screens/NFTs';
import { ApprovalScreen } from './screens/ApprovalScreen';
import { ConnectedAppsScreen } from './screens/ConnectedAppsScreen';
import { WalletLinkScreen } from './components/WalletLinkScreen';
import { DeepLinkConnect } from './components/DeepLinkConnect';
import BackgroundAnimation from './components/BackgroundAnimation';

function App() {
  const { isInitialized, isLocked, isLoading } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const [checkedApprovals, setCheckedApprovals] = useState(false);

  // Store pending deep link for after unlock
  useEffect(() => {
    // If we're on /connect with session param and wallet needs unlock, save it
    if (location.pathname === '/connect' && location.search) {
      sessionStorage.setItem('sultan_pending_connect', location.pathname + location.search);
    }
  }, [location]);

  // Check for pending approvals when unlocked
  useEffect(() => {
    async function checkPendingApprovals() {
      if (!isInitialized || isLocked || !isExtensionContext() || checkedApprovals) {
        return;
      }
      
      try {
        const pending = await getPendingApprovals();
        if (pending.length > 0 && location.pathname !== '/approve') {
          navigate('/approve');
        }
      } catch (e) {
        console.error('Failed to check pending approvals:', e);
      } finally {
        setCheckedApprovals(true);
      }
    }
    
    checkPendingApprovals();
  }, [isInitialized, isLocked, navigate, location.pathname, checkedApprovals]);

  if (isLoading) {
    return (
      <div className="container" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        minHeight: '100vh'
      }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route 
        path="/" 
        element={
          !isInitialized ? <Welcome /> :
          isLocked ? <Navigate to="/unlock" replace /> :
          <Navigate to="/dashboard" replace />
        } 
      />
      <Route path="/create" element={<CreateWallet />} />
      <Route path="/import" element={<ImportWallet />} />
      <Route path="/unlock" element={<Unlock />} />
      
      {/* Protected routes */}
      <Route 
        path="/dashboard" 
        element={isInitialized && !isLocked ? <Dashboard /> : <Navigate to="/" replace />} 
      />
      <Route 
        path="/send" 
        element={isInitialized && !isLocked ? <Send /> : <Navigate to="/" replace />} 
      />
      <Route 
        path="/receive" 
        element={isInitialized && !isLocked ? <Receive /> : <Navigate to="/" replace />} 
      />
      <Route 
        path="/stake" 
        element={isInitialized && !isLocked ? <Stake /> : <Navigate to="/" replace />} 
      />
      <Route 
        path="/become-validator" 
        element={isInitialized && !isLocked ? <BecomeValidator /> : <Navigate to="/" replace />} 
      />
      <Route 
        path="/settings" 
        element={isInitialized && !isLocked ? <Settings /> : <Navigate to="/" replace />} 
      />
      <Route 
        path="/activity" 
        element={isInitialized && !isLocked ? <Activity /> : <Navigate to="/" replace />} 
      />
      <Route 
        path="/governance" 
        element={isInitialized && !isLocked ? <Governance /> : <Navigate to="/" replace />} 
      />
      <Route 
        path="/nfts" 
        element={isInitialized && !isLocked ? <NFTs /> : <Navigate to="/" replace />} 
      />
      <Route 
        path="/approve" 
        element={
          !isInitialized ? <Navigate to="/" replace /> :
          isLocked ? <Navigate to="/unlock" replace /> :
          <div className="app-container">
            <ApprovalScreen />
          </div>
        } 
      />
      <Route 
        path="/connected-apps" 
        element={isInitialized && !isLocked ? (
          <div className="app-container">
            <ConnectedAppsScreen />
          </div>
        ) : <Navigate to="/" replace />} 
      />
      <Route 
        path="/walletlink" 
        element={isInitialized && !isLocked ? (
          <div className="app-container">
            <BackgroundAnimation />
            <WalletLinkScreen />
          </div>
        ) : <Navigate to="/" replace />} 
      />
      <Route 
        path="/connect" 
        element={
          !isInitialized ? <Navigate to="/" replace /> :
          isLocked ? <Navigate to="/unlock" replace /> :
          <div className="app-container">
            <DeepLinkConnect />
          </div>
        } 
      />
      
      <Route 
        path="/test-approval" 
        element={
          <div className="app-container">
            <ApprovalScreen />
          </div>
        } 
      />
      <Route 
        path="/test-connect" 
        element={
          <div className="app-container">
            <DeepLinkConnect />
          </div>
        } 
      />
      
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
