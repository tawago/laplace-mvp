'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearWalletConnection,
  loadWalletConnection,
  loadWalletSeed,
  saveWalletConnection,
} from '@/lib/client/wallet-storage';
import { checkTrustLine, getBalances, getWalletFromSeed, type TokenBalance } from '@/lib/client/xrpl';
import { TOKEN_CODE_BY_SYMBOL, normalizeCurrencyCode } from '@/lib/xrpl/currency-codes';

export type ConnectionType = 'disconnected' | 'local';

interface WalletContextType {
  connectionType: ConnectionType;
  address: string | null;
  balances: TokenBalance[];
  rlusdBalance: number;
  isConnecting: boolean;
  isRefreshing: boolean;
  trustLineStatus: 'idle' | 'checking' | 'ready' | 'missing' | 'error';
  hasRlusdTrustLine: boolean;
  error: string | null;
  isLocalWalletAvailable: boolean;
  connectLocalWallet: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalances: () => Promise<WalletRefreshSnapshot | null>;
  refreshTrustLineStatus: () => Promise<boolean>;
}

interface WalletRefreshSnapshot {
  balances: TokenBalance[];
  rlusdBalance: number;
  hasRlusdTrustLine: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

function parseRlusdBalance(balances: TokenBalance[], issuerAddress: string | null): number {
  const rlusdCode = TOKEN_CODE_BY_SYMBOL.RLUSD.toUpperCase();
  const issuer = issuerAddress?.trim().toUpperCase();

  if (!issuer) return 0;

  const line = balances.find((entry) => {
    const normalizedCurrency = normalizeCurrencyCode(entry.currency);
    if (normalizedCurrency !== rlusdCode) return false;
    return (entry.issuer ?? '').toUpperCase() === issuer;
  });

  if (!line) return 0;

  const value = Number(line.value);
  return Number.isFinite(value) ? value : 0;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [connectionType, setConnectionType] = useState<ConnectionType>('disconnected');
  const [address, setAddress] = useState<string | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [rlusdBalance, setRlusdBalance] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [trustLineStatus, setTrustLineStatus] = useState<'idle' | 'checking' | 'ready' | 'missing' | 'error'>('idle');
  const [hasRlusdTrustLine, setHasRlusdTrustLine] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocalWalletAvailable, setIsLocalWalletAvailable] = useState(false);
  const [issuerAddress, setIssuerAddress] = useState<string | null>(null);

  const updateLocalWalletAvailability = useCallback(() => {
    setIsLocalWalletAvailable(Boolean(loadWalletSeed()));
  }, []);

  const refreshIssuerAddress = useCallback(async () => {
    try {
      const response = await fetch('/api/lending/config');
      const payload = await response.json();
      if (payload.success && payload.data?.issuerAddress) {
        setIssuerAddress(payload.data.issuerAddress);
      }
    } catch {
      // Keep issuer null and fall back to symbol/code-only matching.
    }
  }, []);

  const refreshTrustLineForAddress = useCallback(
    async (nextAddress: string): Promise<boolean> => {
      if (!issuerAddress) {
        setTrustLineStatus('idle');
        setHasRlusdTrustLine(false);
        return false;
      }

      setTrustLineStatus('checking');
      try {
        const hasTrust = await checkTrustLine(nextAddress, issuerAddress, TOKEN_CODE_BY_SYMBOL.RLUSD);
        setHasRlusdTrustLine(hasTrust);
        setTrustLineStatus(hasTrust ? 'ready' : 'missing');
        return hasTrust;
      } catch {
        setHasRlusdTrustLine(false);
        setTrustLineStatus('error');
        return false;
      }
    },
    [issuerAddress]
  );

  const refreshBalancesForAddress = useCallback(
    async (nextAddress: string): Promise<WalletRefreshSnapshot | null> => {
      setIsRefreshing(true);
      setError(null);

      try {
        const [nextBalances, trustlineReady] = await Promise.all([
          getBalances(nextAddress),
          refreshTrustLineForAddress(nextAddress),
        ]);
        const nextRlusdBalance = parseRlusdBalance(nextBalances, issuerAddress);
        setBalances(nextBalances);
        setRlusdBalance(nextRlusdBalance);

        return {
          balances: nextBalances,
          rlusdBalance: nextRlusdBalance,
          hasRlusdTrustLine: trustlineReady,
        };
      } catch {
        setError('Failed to refresh wallet balances. Please try again.');
        setBalances([]);
        setRlusdBalance(0);
        setHasRlusdTrustLine(false);
        setTrustLineStatus('error');
        return null;
      } finally {
        setIsRefreshing(false);
      }
    },
    [issuerAddress, refreshTrustLineForAddress]
  );

  const resetDisconnectedState = useCallback(() => {
    setConnectionType('disconnected');
    setAddress(null);
    setBalances([]);
    setRlusdBalance(0);
    setHasRlusdTrustLine(false);
    setTrustLineStatus('idle');
    setError(null);
  }, []);

  const disconnect = useCallback(async () => {
    clearWalletConnection();
    resetDisconnectedState();
    updateLocalWalletAvailability();
  }, [resetDisconnectedState, updateLocalWalletAvailability]);

  const connectLocalWallet = useCallback(async () => {
    if (isConnecting) return;

    const seed = loadWalletSeed();
    if (!seed) {
      setError('No local dev wallet found. Generate one from the Admin page first.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const localWallet = getWalletFromSeed(seed);
      setConnectionType('local');
      setAddress(localWallet.address);
      saveWalletConnection('local');
      await refreshBalancesForAddress(localWallet.address);
    } catch {
      clearWalletConnection();
      setError('Failed to connect local wallet.');
      resetDisconnectedState();
    } finally {
      setIsConnecting(false);
      updateLocalWalletAvailability();
    }
  }, [isConnecting, refreshBalancesForAddress, resetDisconnectedState, updateLocalWalletAvailability]);

  const refreshBalances = useCallback(async (): Promise<WalletRefreshSnapshot | null> => {
    if (!address) return null;
    return refreshBalancesForAddress(address);
  }, [address, refreshBalancesForAddress]);

  const refreshTrustLineStatus = useCallback(async (): Promise<boolean> => {
    if (!address) {
      setTrustLineStatus('idle');
      setHasRlusdTrustLine(false);
      return false;
    }

    return refreshTrustLineForAddress(address);
  }, [address, refreshTrustLineForAddress]);

  useEffect(() => {
    updateLocalWalletAvailability();
    void refreshIssuerAddress();

    const onStorageChanged = () => {
      updateLocalWalletAvailability();
    };

    window.addEventListener('storage', onStorageChanged);
    window.addEventListener('xrpl-wallet-storage-changed', onStorageChanged);

    return () => {
      window.removeEventListener('storage', onStorageChanged);
      window.removeEventListener('xrpl-wallet-storage-changed', onStorageChanged);
    };
  }, [refreshIssuerAddress, updateLocalWalletAvailability]);

  useEffect(() => {
    if (!address) {
      setRlusdBalance(0);
      setHasRlusdTrustLine(false);
      setTrustLineStatus('idle');
      return;
    }
    setRlusdBalance(parseRlusdBalance(balances, issuerAddress));
  }, [address, balances, issuerAddress]);

  useEffect(() => {
    if (!address) return;
    void refreshTrustLineForAddress(address);
  }, [address, issuerAddress, refreshTrustLineForAddress]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const savedConnection = loadWalletConnection();
      const seed = loadWalletSeed();
      setIsLocalWalletAvailable(Boolean(seed));

      if (!savedConnection) return;

      try {
        if (savedConnection === 'local') {
          if (!seed) {
            clearWalletConnection();
            return;
          }

          const localWallet = getWalletFromSeed(seed);
          if (cancelled) return;

          setConnectionType('local');
          setAddress(localWallet.address);
          await refreshBalancesForAddress(localWallet.address);
          return;
        }
      } catch {
        clearWalletConnection();
        if (!cancelled) {
          resetDisconnectedState();
          setError('Failed to restore wallet session. Please reconnect your wallet.');
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [refreshBalancesForAddress, resetDisconnectedState]);

  const value = useMemo<WalletContextType>(
    () => ({
      connectionType,
      address,
      balances,
      rlusdBalance,
      isConnecting,
      isRefreshing,
      error,
      trustLineStatus,
      hasRlusdTrustLine,
      isLocalWalletAvailable,
      connectLocalWallet,
      disconnect,
      refreshBalances,
      refreshTrustLineStatus,
    }),
    [
      address,
      balances,
      connectLocalWallet,
      connectionType,
      disconnect,
      error,
      hasRlusdTrustLine,
      isConnecting,
      isLocalWalletAvailable,
      isRefreshing,
      refreshBalances,
      refreshTrustLineStatus,
      rlusdBalance,
      trustLineStatus,
    ]
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
