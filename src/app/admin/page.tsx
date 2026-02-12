'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import {
  checkTrustLine,
  fundWalletFromFaucet,
  generateWallet,
  getWalletFromSeed,
  submitTrustLine,
  type TokenBalance,
  type WalletInfo,
} from '@/lib/client/xrpl';
import { loadWalletSeed, saveWalletSeed } from '@/lib/client/wallet-storage';
import { getTokenCode } from '@/lib/xrpl/currency-codes';

interface LendingConfig {
  issuerAddress: string;
}

const TOKEN_LIST = ['SAIL', 'NYRA', 'RLUSD'] as const;
type TokenCode = (typeof TOKEN_LIST)[number];

export default function AdminPage() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [config, setConfig] = useState<LendingConfig | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState<string>('');
  const [trustlineStatus, setTrustlineStatus] = useState<Record<TokenCode, boolean>>({
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

  const refreshTrustlineStatus = useCallback(async () => {
    if (!wallet?.address || !config?.issuerAddress) {
      setTrustlineStatus({ SAIL: false, NYRA: false, RLUSD: false });
      return;
    }

    const checks = await Promise.all(
      TOKEN_LIST.map(async (token) => {
        const currencyCode = getTokenCode(token);
        if (!currencyCode) return [token, false] as const;
        const ok = await checkTrustLine(wallet.address, config.issuerAddress, currencyCode);
        return [token, ok] as const;
      })
    );

    setTrustlineStatus(Object.fromEntries(checks) as Record<TokenCode, boolean>);
  }, [config?.issuerAddress, wallet?.address]);

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
    refreshTrustlineStatus();
  }, [refreshTrustlineStatus]);

  const copyAddress = useCallback(() => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet.address);
    toast.success('Wallet address copied');
  }, [wallet]);

  const handleGenerateWallet = useCallback(async () => {
    setLoading('generate');
    try {
      const nextWallet = generateWallet();
      saveWalletSeed(nextWallet.seed);
      setWallet(nextWallet);

      const fundResult = await fundWalletFromFaucet(nextWallet.address);
      if (!fundResult.funded) {
        toast.error('Wallet generated but XRP faucet funding failed');
        return;
      }

      await refreshBalances(nextWallet.address);
      toast.success('New wallet generated, saved, and funded with XRP');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate wallet');
    } finally {
      setLoading('');
    }
  }, [refreshBalances]);

  const handleTokenFaucet = useCallback(
    async (token: TokenCode) => {
      if (!wallet) {
        toast.error('Generate a wallet first');
        return;
      }

      if (!config?.issuerAddress) {
        toast.error('Issuer config unavailable');
        return;
      }

      const loadingKey = `faucet-${token}`;
      setLoading(loadingKey);

      try {
        const currencyCode = getTokenCode(token);
        if (!currencyCode) {
          toast.error(`Unsupported token ${token}`);
          return;
        }

        const trustLine = await submitTrustLine(wallet.seed, config.issuerAddress, currencyCode);
        if (trustLine.result !== 'tesSUCCESS') {
          toast.error(`Trust line setup failed for ${token}: ${trustLine.result}`);
          return;
        }

        const response = await fetch('/api/faucet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userAddress: wallet.address, token }),
        });
        const payload = await response.json();

        if (!payload.success) {
          toast.error(payload.error || `Faucet failed for ${token}`);
          return;
        }

        await refreshBalances(wallet.address);
        await refreshTrustlineStatus();
        toast.success(`Received ${payload.amount} ${payload.token}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Faucet failed for ${token}`);
      } finally {
        setLoading('');
      }
    },
    [config?.issuerAddress, refreshBalances, refreshTrustlineStatus, wallet]
  );

  return (
    <div className="min-h-screen text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Admin Wallet Tools</h1>
          <p className="mt-2 text-sm text-slate-600">
            This page is for local XRPL setup (testnet/devnet). Wallet seed is persisted in localStorage.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Current Local Wallet
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generate New Wallet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">Creates a fresh wallet, saves seed in localStorage, and auto-funds XRP.</p>
              <Button onClick={handleGenerateWallet} disabled={loading === 'generate'} className="w-full">
                {loading === 'generate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate + Fund XRP
              </Button>
            </CardContent>
          </Card>

          {TOKEN_LIST.map((token) => (
            <Card key={token}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Faucet {token}
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      trustlineStatus[token] ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                    title={trustlineStatus[token] ? `${token} trust line ready` : `${token} trust line missing`}
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">
                  Creates trust line and sends {token === 'RLUSD' ? '10' : '100'} {token}.
                </p>
                <Button
                  onClick={() => handleTokenFaucet(token)}
                  disabled={loading === `faucet-${token}` || !wallet}
                  className="w-full"
                  variant="outline"
                >
                  {loading === `faucet-${token}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Request {token}
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
      </div>
    </div>
  );
}
