/**
 * React hook for WalletLink - Mobile PWA Connection
 * 
 * Use this hook in the PWA wallet to handle incoming dApp connections
 * via QR code scanning.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  WalletLinkClient, 
  SignRequest, 
  WalletLinkEvent,
  isMobileDevice,
  hasCamera 
} from '../core/wallet-link';

export interface UseWalletLinkReturn {
  // State
  isConnected: boolean;
  isConnecting: boolean;
  sessionOrigin: string | null;
  pendingRequests: SignRequest[];
  error: string | null;
  
  // Camera capabilities
  isMobile: boolean;
  canScanQR: boolean;
  
  // Actions
  connectFromQR: (qrData: string) => Promise<boolean>;
  approveRequest: (requestId: string, response: any) => Promise<void>;
  rejectRequest: (requestId: string, reason?: string) => void;
  sendConnectionApproval: (address: string, publicKey: string) => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
}

export function useWalletLink(): UseWalletLinkReturn {
  const clientRef = useRef<WalletLinkClient | null>(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sessionOrigin, setSessionOrigin] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<SignRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [canScanQR, setCanScanQR] = useState(false);

  // Check device capabilities
  useEffect(() => {
    setIsMobile(isMobileDevice());
    hasCamera().then(setCanScanQR);
  }, []);

  // Initialize client
  useEffect(() => {
    const isDev = import.meta.env.DEV;
    clientRef.current = new WalletLinkClient(isDev);

    const handleEvent = (event: WalletLinkEvent) => {
      switch (event.type) {
        case 'connected':
          setIsConnected(true);
          setIsConnecting(false);
          break;
          
        case 'disconnected':
          setIsConnected(false);
          setSessionOrigin(null);
          setPendingRequests([]);
          break;
          
        case 'request':
          if (event.data) {
            setPendingRequests(prev => [...prev, event.data]);
            // Update origin from first request
            if (event.data.origin) {
              setSessionOrigin(event.data.origin);
            }
          }
          break;
          
        case 'error':
          setError(event.data?.message || 'Connection error');
          setIsConnecting(false);
          break;
      }
    };

    clientRef.current.on(handleEvent);

    return () => {
      clientRef.current?.off(handleEvent);
      clientRef.current?.disconnect();
    };
  }, []);

  const connectFromQR = useCallback(async (qrData: string): Promise<boolean> => {
    if (!clientRef.current) return false;
    
    setError(null);
    setIsConnecting(true);
    
    try {
      const success = await clientRef.current.connectFromQR(qrData);
      if (!success) {
        setError('Failed to connect. Invalid QR code.');
      }
      return success;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
      setIsConnecting(false);
      return false;
    }
  }, []);

  const approveRequest = useCallback(async (requestId: string, response: any): Promise<void> => {
    if (!clientRef.current) {
      throw new Error('WalletLink not initialized');
    }
    
    await clientRef.current.approveRequest(requestId, response);
    setPendingRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  const rejectRequest = useCallback((requestId: string, reason?: string): void => {
    if (!clientRef.current) return;
    
    clientRef.current.rejectRequest(requestId, reason);
    setPendingRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  const disconnect = useCallback((): void => {
    clientRef.current?.disconnect();
    setIsConnected(false);
    setSessionOrigin(null);
    setPendingRequests([]);
  }, []);

  const sendConnectionApproval = useCallback(async (address: string, publicKey: string): Promise<void> => {
    if (!clientRef.current) {
      throw new Error('WalletLink not initialized');
    }
    
    await clientRef.current.sendConnectionApproval(address, publicKey);
    setIsConnected(true);
  }, []);

  const clearError = useCallback((): void => {
    setError(null);
  }, []);;

  return {
    isConnected,
    isConnecting,
    sessionOrigin,
    pendingRequests,
    error,
    isMobile,
    canScanQR,
    connectFromQR,
    approveRequest,
    rejectRequest,
    sendConnectionApproval,
    disconnect,
    clearError,
  };
}
