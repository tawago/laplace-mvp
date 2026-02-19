'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import {
  fundWalletFromFaucet,
  generateWallet,
  getWalletFromSeed,
  submitTrustLinesParallelWithIncrementalSequence,
  type TokenBalance,
  type WalletInfo,
} from '@/lib/client/xrpl';
import {
  clearWalletConnection,
  clearWalletSeed,
  loadWalletSeed,
  saveWalletSeed,
} from '@/lib/client/wallet-storage';
import { getTokenCode } from '@/lib/xrpl/currency-codes';
import { useWallet } from '@/contexts/wallet-context';

interface LendingConfig {
  issuerAddress: string;
}

const TOKEN_LIST = ['SAIL', 'NYRA', 'RLUSD'] as const;
type TokenCode = (typeof TOKEN_LIST)[number];

export default function AdminPage() {
  const {
    disconnect,
    connectLocalWallet,
    trustLineStatusByToken,
    hasTrustLineByToken,
    refreshTrustLineStatuses,
  } = useWallet();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [config, setConfig] = useState<LendingConfig | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState<string>('');
  const [credentialSubject, setCredentialSubject] = useState('');
  const [credentialExpiration, setCredentialExpiration] = useState('');
  const [credentialTxHash, setCredentialTxHash] = useState<string | null>(null);
  const [trustlineEstablishing, setTrustlineEstablishing] = useState<Record<TokenCode, boolean>>({
    SAIL: false,
    NYRA: false,
    RLUSD: false,
  });

  const refreshBalances = useCallback(async (address: string) => {
    const response = await fetch(`/api/balances?address=${address}`);
    const payload = await response.json();
    if (payload.success) {
      setBalances(payload.balances);
    }
  }, []);

  const getBalance = useCallback(
    (symbol: TokenCode | 'XRP') => {
      if (symbol === 'XRP') {
        const xrp = balances.find((item) => item.currency === 'XRP');
        return xrp ? Number(xrp.value) : 0;
      }

      const code = getTokenCode(symbol);
      const issuer = config?.issuerAddress?.toUpperCase();
      const item = balances.find((entry) => {
        if (entry.currency.toUpperCase() !== code?.toUpperCase()) return false;
        if (!issuer) return true;
        return (entry.issuer ?? '').toUpperCase() === issuer;
      });
      return item ? Number(item.value) : 0;
    },
    [balances, config?.issuerAddress]
  );

  useEffect(() => {
    async function init() {
      try {
        const seed = loadWalletSeed();
        if (seed) {
          const restored = getWalletFromSeed(seed);
          setWallet(restored);
          await refreshBalances(restored.address);
        }

        const response = await fetch('/api/lending/config');
        const payload = await response.json();
        if (payload.success) {
          setConfig({ issuerAddress: payload.data.issuerAddress });
        }
      } catch (error) {
        console.error('Admin init error:', error);
      }
    }

    init();
  }, [refreshBalances]);

  useEffect(() => {
    if (wallet?.address) {
      setCredentialSubject(wallet.address);
    }
  }, [wallet?.address]);

  const copyAddress = useCallback(() => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet.address);
    toast.success('Wallet address copied');
  }, [wallet]);

  const handleGenerateWallet = useCallback(async () => {
    setLoading('generate');
    try {
      await disconnect();
      const nextWallet = generateWallet();
      saveWalletSeed(nextWallet.seed);
      setWallet(nextWallet);
      setTrustlineEstablishing({ SAIL: false, NYRA: false, RLUSD: false });

      const fundResult = await fundWalletFromFaucet(nextWallet.address);
      if (!fundResult.funded) {
        toast.error('Wallet generated but XRP faucet funding failed');
        return;
      }
      await refreshBalances(nextWallet.address);

      if (!config?.issuerAddress) {
        await refreshBalances(nextWallet.address);
        toast.error('Wallet generated and XRP funded, but issuer config is unavailable for trust lines.');
        return;
      }

      const failedTokens: TokenCode[] = [];
      const currencies = TOKEN_LIST.map((token) => getTokenCode(token) || token);
      setTrustlineEstablishing({ SAIL: true, NYRA: true, RLUSD: true });
      try {
        const trustlineResults = await submitTrustLinesParallelWithIncrementalSequence(
          nextWallet.seed,
          config.issuerAddress,
          currencies
        );

        for (const token of TOKEN_LIST) {
          const currencyCode = getTokenCode(token) || token;
          const matched = trustlineResults.find((result) => result.currency === currencyCode);
          if (!matched || matched.result !== 'tesSUCCESS') {
            failedTokens.push(token);
          }
        }
      } catch {
        failedTokens.push(...TOKEN_LIST);
      } finally {
        setTrustlineEstablishing({ SAIL: false, NYRA: false, RLUSD: false });
      }
      await connectLocalWallet();
      await refreshTrustLineStatuses();

      if (failedTokens.length > 0) {
        toast.error(
          `Wallet generated and funded. Trust line setup failed for: ${failedTokens.join(', ')}`
        );
      } else {
        toast.success('New wallet generated, funded with XRP, and trust lines established.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate wallet');
    } finally {
      setLoading('');
    }
  }, [config?.issuerAddress, connectLocalWallet, disconnect, refreshBalances, refreshTrustLineStatuses]);

  const handleClearLocalWallet = useCallback(async () => {
    setLoading('clear-local-wallet');

    try {
      clearWalletSeed();
      clearWalletConnection();
      await disconnect();

      setWallet(null);
      setBalances([]);
      setTrustlineEstablishing({ SAIL: false, NYRA: false, RLUSD: false });
      toast.success('Local wallet and wallet connection state cleared');
    } catch {
      setWallet(null);
      setBalances([]);
      setTrustlineEstablishing({ SAIL: false, NYRA: false, RLUSD: false });
      toast.error('Failed to fully disconnect active session, but local wallet metadata was cleared');
    } finally {
      setLoading('');
    }
  }, [disconnect]);

  const handleCreateCredential = useCallback(async () => {
    if (!credentialSubject) {
      toast.error('Subject address is required');
      return;
    }

    const expirationUnixRaw = credentialExpiration
      ? Math.floor(new Date(credentialExpiration).getTime() / 1000)
      : null;

    if (credentialExpiration && (expirationUnixRaw === null || !Number.isFinite(expirationUnixRaw) || expirationUnixRaw <= 0)) {
      toast.error('Invalid expiration date');
      return;
    }

    const expirationUnix = expirationUnixRaw ?? undefined;

    setLoading('issue-credential');
    setCredentialTxHash(null);
    try {
      const response = await fetch('/api/credentials/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectAddress: credentialSubject,
          credentialType: 'KYC_VERIFIED',
          ...(expirationUnix ? { expiration: expirationUnix } : {}),
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        toast.error(payload.error || 'Failed to create credential');
        return;
      }

      const txHash = payload.data?.txHash as string | undefined;
      setCredentialTxHash(txHash ?? null);
      toast.success('Credential created. Acceptance pending on subject wallet.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create credential');
    } finally {
      setLoading('');
    }
  }, [credentialExpiration, credentialSubject]);

  return (
    <div className="min-h-screen text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Admin Wallet Tools</h1>
          <p className="mt-2 text-sm text-slate-600">
            This page is for local XRPL setup (devnet). Wallet seed is persisted in localStorage.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Current Local Wallet
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {wallet ? (
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">Loaded</Badge>
                    <span className="font-mono">{wallet.address}</span>
                    <button onClick={copyAddress} aria-label="Copy wallet address" className="text-slate-500 hover:text-slate-700">
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">Regenerate a new wallet only if you want to replace the saved one.</p>
                </div>
              ) : (
                <p className="text-sm text-slate-600">No wallet in localStorage yet.</p>
              )}
            </div>

            <div className="sm:shrink-0">
              <Button
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={() => void handleClearLocalWallet()}
                disabled={loading === 'clear-local-wallet'}
              >
                {loading === 'clear-local-wallet' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Clear Local Wallet
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2 xl:col-span-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Token faucets are deprecated. You can now get RLUSD, SAIL, and NYRA from Wallet and Property purchase flows.
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generate New Wallet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">Creates a fresh wallet, saves seed in localStorage, auto-funds XRP, and establishes SAIL/NYRA/RLUSD trust lines.</p>
              <Button onClick={handleGenerateWallet} disabled={loading === 'generate'} className="w-full">
                {loading === 'generate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate + Fund
              </Button>
            </CardContent>
          </Card>

          {TOKEN_LIST.map((token) => (
            <Card key={token}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Faucet {token}
                  {trustlineEstablishing[token] || trustLineStatusByToken[token] === 'checking' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                  ) : (
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        hasTrustLineByToken[token] ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                      title={hasTrustLineByToken[token] ? `${token} trust line ready` : `${token} trust line missing`}
                    />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">
                  Deprecated. Use Wallet page for RLUSD and Property pages for SAIL/NYRA purchases.
                </p>
                <Button
                  disabled
                  className="w-full"
                  variant="outline"
                >
                  Request {token} (Deprecated)
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wallet Balances</CardTitle>
          </CardHeader>
          <CardContent>
            {!wallet ? (
              <p className="text-sm text-slate-600">Generate a wallet to view balances.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-slate-100 p-3">
                  <p className="text-xs text-slate-500">XRP</p>
                  <p className="text-lg font-semibold text-slate-900">{getBalance('XRP').toFixed(4)}</p>
                </div>
                {TOKEN_LIST.map((token) => (
                  <div key={token} className="rounded-lg bg-slate-100 p-3">
                    <p className="text-xs text-slate-500">{token}</p>
                    <p className="text-lg font-semibold text-slate-900">{getBalance(token).toFixed(4)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Issue Test Credential</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-600">Subject Address</label>
              <input
                type="text"
                value={credentialSubject}
                onChange={(event) => setCredentialSubject(event.target.value)}
                placeholder="r..."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-600">Expiration (optional)</label>
              <input
                type="datetime-local"
                value={credentialExpiration}
                onChange={(event) => setCredentialExpiration(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <Button onClick={() => void handleCreateCredential()} disabled={loading === 'issue-credential'}>
              {loading === 'issue-credential' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Credential
            </Button>

            {credentialTxHash ? (
              <p className="text-sm text-slate-600">
                Created credential tx: <span className="font-mono">{credentialTxHash}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
