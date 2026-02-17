'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearWalletConnection,
  loadWalletConnection,
  loadWalletSeed,
  saveWalletConnection,
} from '@/lib/client/wallet-storage';
import { getBalances, getWalletFromSeed, type TokenBalance } from '@/lib/client/xrpl';
import { TOKEN_CODE_BY_SYMBOL } from '@/lib/xrpl/currency-codes';

export type ConnectionType = 'disconnected' | 'local';

interface WalletContextType {
  connectionType: ConnectionType;
  address: string | null;
  balances: TokenBalance[];
  rlusdBalance: number;
  isConnecting: boolean;
  isRefreshing: boolean;
  error: string | null;
  isLocalWalletAvailable: boolean;
  connectLocalWallet: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalances: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

function parseRlusdBalance(balances: TokenBalance[], issuerAddress: string | null): number {
  const rlusdCode = TOKEN_CODE_BY_SYMBOL.RLUSD.toUpperCase();
  const issuer = issuerAddress?.toUpperCase();

  const line = balances.find((entry) => {
    if (entry.currency.toUpperCase() !== rlusdCode) return false;
    if (!issuer) return true;
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

  const refreshBalancesForAddress = useCallback(
    async (nextAddress: string) => {
      setIsRefreshing(true);
      setError(null);

      try {
        const nextBalances = await getBalances(nextAddress);
        setBalances(nextBalances);
        setRlusdBalance(parseRlusdBalance(nextBalances, issuerAddress));
      } catch {
        setError('Failed to refresh wallet balances. Please try again.');
        setBalances([]);
        setRlusdBalance(0);
      } finally {
        setIsRefreshing(false);
      }
    },
    [issuerAddress]
  );

  const resetDisconnectedState = useCallback(() => {
    setConnectionType('disconnected');
    setAddress(null);
    setBalances([]);
    setRlusdBalance(0);
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

  const refreshBalances = useCallback(async () => {
    if (!address) return;
    await refreshBalancesForAddress(address);
  }, [address, refreshBalancesForAddress]);

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
      return;
    }
    setRlusdBalance(parseRlusdBalance(balances, issuerAddress));
  }, [address, balances, issuerAddress]);

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
      isLocalWalletAvailable,
      connectLocalWallet,
      disconnect,
      refreshBalances,
    }),
    [
      address,
      balances,
      connectLocalWallet,
      connectionType,
      disconnect,
      error,
      isConnecting,
      isLocalWalletAvailable,
      isRefreshing,
      refreshBalances,
      rlusdBalance,
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
