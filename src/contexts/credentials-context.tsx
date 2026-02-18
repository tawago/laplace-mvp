'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadWalletSeed } from '@/lib/client/wallet-storage';
import { buildCredentialAcceptAutofilledTx, signTransactionBlob } from '@/lib/client/xrpl';
import { useWallet } from '@/contexts/wallet-context';
import type { Credential, VerificationLevel } from '@/lib/xrpl/credentials/types';

interface CredentialsContextType {
  credentials: Credential[];
  verificationLevel: VerificationLevel;
  isVerified: boolean;
  isLoading: boolean;
  error?: string;
  refreshCredentials: () => Promise<void>;
  acceptCredential: (issuer: string, credentialTypeHex: string) => Promise<void>;
}

const CredentialsContext = createContext<CredentialsContextType | undefined>(undefined);

export function CredentialsProvider({ children }: { children: React.ReactNode }) {
  const { address, connectionType } = useWallet();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [verificationLevel, setVerificationLevel] = useState<VerificationLevel>('none');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const refreshCredentials = useCallback(async () => {
    if (!address) {
      setCredentials([]);
      setVerificationLevel('none');
      setError(undefined);
      return;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/credentials?address=${encodeURIComponent(address)}`);
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setCredentials([]);
        setVerificationLevel('none');
        setError(payload.error || 'Failed to load credentials');
        return;
      }

      setCredentials(Array.isArray(payload.credentials) ? payload.credentials : []);
      setVerificationLevel(payload.verificationLevel === 'verified' ? 'verified' : 'none');
    } catch {
      setCredentials([]);
      setVerificationLevel('none');
      setError('Failed to load credentials');
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  const acceptCredential = useCallback(
    async (issuer: string, credentialTypeHex: string) => {
      if (!address || connectionType === 'disconnected') {
        throw new Error('Connect a wallet before accepting credentials');
      }

      const seed = loadWalletSeed();
      if (!seed) {
        throw new Error('No local wallet seed found. Generate wallet from Admin first.');
      }

      const txJson = await buildCredentialAcceptAutofilledTx(address, issuer, credentialTypeHex);
      const signedTxBlob = signTransactionBlob(seed, txJson);

      const response = await fetch('/api/credentials/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTxBlob }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Credential acceptance failed');
      }

      await refreshCredentials();
    },
    [address, connectionType, refreshCredentials]
  );

  useEffect(() => {
    void refreshCredentials();
  }, [refreshCredentials]);

  const value = useMemo<CredentialsContextType>(
    () => ({
      credentials,
      verificationLevel,
      isVerified: verificationLevel === 'verified',
      isLoading,
      error,
      refreshCredentials,
      acceptCredential,
    }),
    [acceptCredential, credentials, error, isLoading, refreshCredentials, verificationLevel]
  );

  return <CredentialsContext.Provider value={value}>{children}</CredentialsContext.Provider>;
}

export function useCredentials(): CredentialsContextType {
  const context = useContext(CredentialsContext);
  if (!context) {
    throw new Error('useCredentials must be used within a CredentialsProvider');
  }
  return context;
}
