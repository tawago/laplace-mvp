'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Copy,
  ExternalLink,
  Coins,
  TrendingUp,
  Shield,
  Percent,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  generateWallet,
  submitTrustLine,
  fundWalletFromFaucet,
  WalletInfo,
  TokenBalance,
} from '@/lib/client/xrpl';

interface Market {
  id: string;
  name: string;
  collateralCurrency: string;
  collateralIssuer: string;
  debtCurrency: string;
  debtIssuer: string;
  maxLtvRatio: number;
  liquidationLtvRatio: number;
  baseInterestRate: number;
  prices: {
    collateralPriceUsd: number;
    debtPriceUsd: number;
  } | null;
}

interface LendingConfig {
  markets: Market[];
  issuerAddress: string;
  backendAddress: string;
  testnetUrl: string;
  explorerUrl: string;
}

interface Position {
  id: string;
  status: string;
  collateralAmount: number;
  loanPrincipal: number;
  interestAccrued: number;
  interestRateAtOpen: number;
  openedAt: string;
}

interface PositionMetrics {
  totalDebt: number;
  collateralValueUsd: number;
  debtValueUsd: number;
  currentLtv: number;
  healthFactor: number;
  liquidatable: boolean;
  maxBorrowableAmount: number;
  maxWithdrawableAmount: number;
}

interface PositionEvent {
  id: string;
  eventType: string;
  status: string;
  amount: number | null;
  currency: string | null;
  createdAt: string;
  errorMessage: string | null;
}

type SetupStep = 'idle' | 'xrp' | 'collateral' | 'debt' | 'done' | 'error';

interface SetupStatus {
  step: SetupStep;
  xrp: 'pending' | 'loading' | 'done' | 'error';
  collateral: 'pending' | 'loading' | 'done' | 'error';
  debt: 'pending' | 'loading' | 'done' | 'error';
  error?: string;
}

export default function LendingPage() {
  const [config, setConfig] = useState<LendingConfig | null>(null);
  const [configError, setConfigError] = useState<string>('');
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [metrics, setMetrics] = useState<PositionMetrics | null>(null);
  const [events, setEvents] = useState<PositionEvent[]>([]);
  const [walletReady, setWalletReady] = useState(false);
  const [loading, setLoading] = useState<string>('');
  const [setupStatus, setSetupStatus] = useState<SetupStatus>({
    step: 'idle',
    xrp: 'pending',
    collateral: 'pending',
    debt: 'pending',
  });

  // Form states
  const [depositAmount, setDepositAmount] = useState('100');
  const [borrowAmount, setBorrowAmount] = useState('50');
  const [repayAmount, setRepayAmount] = useState('10');
  const [withdrawAmount, setWithdrawAmount] = useState('10');

  // Fetch config on mount
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/lending/config');
        const data = await res.json();
        if (data.success) {
          setConfig(data.data);
          if (data.data.markets.length > 0) {
            setSelectedMarket(data.data.markets[0]);
          }
        } else {
          setConfigError(data.error?.message || 'Failed to load configuration');
        }
      } catch {
        setConfigError('Failed to connect to server');
      }
    }
    fetchConfig();
  }, []);

  // Fetch balances
  const refreshBalances = useCallback(async () => {
    if (!wallet) return;
    try {
      const res = await fetch(`/api/balances?address=${wallet.address}`);
      const data = await res.json();
      if (data.success) {
        setBalances(data.balances);
      }
    } catch (err) {
      console.error('Error fetching balances:', err);
    }
  }, [wallet]);

  // Fetch position
  const refreshPosition = useCallback(async () => {
    if (!wallet || !selectedMarket) return;
    try {
      const res = await fetch(
        `/api/lending/position?userAddress=${wallet.address}&marketId=${selectedMarket.id}`
      );
      const data = await res.json();
      if (data.success) {
        setPosition(data.data.position);
        const rawMetrics = data.data.metrics;
        setMetrics(
          rawMetrics
            ? {
                ...rawMetrics,
                healthFactor:
                  typeof rawMetrics.healthFactor === 'number' && Number.isFinite(rawMetrics.healthFactor)
                    ? rawMetrics.healthFactor
                    : Number.POSITIVE_INFINITY,
              }
            : null
        );
        setEvents(data.data.events || []);
      }
    } catch (err) {
      console.error('Error fetching position:', err);
    }
  }, [wallet, selectedMarket]);

  // Refresh data when wallet/market changes
  useEffect(() => {
    if (wallet && walletReady) {
      refreshBalances();
      if (selectedMarket) {
        refreshPosition();
      }
    }
  }, [wallet, walletReady, selectedMarket, refreshBalances, refreshPosition]);

  const handleGenerateWallet = () => {
    const newWallet = generateWallet();
    setWallet(newWallet);
    setBalances([]);
    setPosition(null);
    setMetrics(null);
    setEvents([]);
    setWalletReady(false);
    setSetupStatus({
      step: 'idle',
      xrp: 'pending',
      collateral: 'pending',
      debt: 'pending',
    });
    toast.success('New wallet generated');
  };

  const handleSetupWallet = async () => {
    if (!wallet || !config || !selectedMarket) return;

    setSetupStatus({ step: 'xrp', xrp: 'loading', collateral: 'pending', debt: 'pending' });

    try {
      // Step 1: Fund with XRP
      const fundResult = await fundWalletFromFaucet(wallet.address);
      if (!fundResult.funded) {
        setSetupStatus({
          step: 'error',
          xrp: 'error',
          collateral: 'pending',
          debt: 'pending',
          error: 'Failed to get XRP from faucet',
        });
        toast.error('Failed to get XRP from faucet');
        return;
      }
      setSetupStatus({ step: 'collateral', xrp: 'done', collateral: 'loading', debt: 'pending' });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 2: Setup collateral trust line
      const collateralResult = await submitTrustLine(
        wallet.seed,
        config.issuerAddress,
        selectedMarket.collateralCurrency
      );
      if (collateralResult.result !== 'tesSUCCESS') {
        setSetupStatus({
          step: 'error',
          xrp: 'done',
          collateral: 'error',
          debt: 'pending',
          error: `Collateral trust line failed: ${collateralResult.result}`,
        });
        toast.error('Collateral trust line failed');
        return;
      }
      setSetupStatus({ step: 'debt', xrp: 'done', collateral: 'done', debt: 'loading' });

      // Step 3: Setup debt trust line
      const debtResult = await submitTrustLine(
        wallet.seed,
        config.issuerAddress,
        selectedMarket.debtCurrency
      );
      if (debtResult.result !== 'tesSUCCESS') {
        setSetupStatus({
          step: 'error',
          xrp: 'done',
          collateral: 'done',
          debt: 'error',
          error: `Debt trust line failed: ${debtResult.result}`,
        });
        toast.error('Debt trust line failed');
        return;
      }

      setSetupStatus({ step: 'done', xrp: 'done', collateral: 'done', debt: 'done' });
      setWalletReady(true);
      await refreshBalances();
      toast.success('Wallet setup complete');
    } catch (err) {
      setSetupStatus((prev) => ({
        ...prev,
        step: 'error',
        error: err instanceof Error ? err.message : 'Setup failed',
      }));
      toast.error('Wallet setup failed');
    }
  };

  // Request tokens from faucet
  const handleRequestTokens = async () => {
    if (!wallet || !config) return;
    setLoading('faucet');
    try {
      const res = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: wallet.address }),
      });
      const data = await res.json();
      if (data.success) {
        await refreshBalances();
        toast.success(`Received 100 ${selectedMarket?.collateralCurrency}`);
      } else {
        toast.error(data.error || 'Faucet request failed');
      }
    } catch {
      toast.error('Faucet request failed');
    } finally {
      setLoading('');
    }
  };

  // Send tokens to backend and call deposit
  const handleDeposit = async () => {
    if (!wallet || !config || !selectedMarket) return;
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return;

    setLoading('deposit');
    try {
      const { sendTokenToBackend } = await import('@/lib/client/xrpl');

      const sendResult = await sendTokenToBackend(
        wallet.seed,
        config.backendAddress,
        selectedMarket.collateralCurrency,
        depositAmount,
        config.issuerAddress
      );

      if (sendResult.result !== 'tesSUCCESS') {
        toast.error(`Failed to send tokens: ${sendResult.result}`);
        return;
      }

      const res = await fetch('/api/lending/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: sendResult.hash,
          senderAddress: wallet.address,
          marketId: selectedMarket.id,
        }),
      });

      const data = await res.json();
      if (data.success) {
        await refreshBalances();
        await refreshPosition();
        toast.success('Deposit successful');
      } else {
        toast.error(data.error?.message || 'Deposit failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setLoading('');
    }
  };

  // Borrow tokens
  const handleBorrow = async () => {
    if (!wallet || !selectedMarket) return;
    const amount = parseFloat(borrowAmount);
    if (isNaN(amount) || amount <= 0) return;

    setLoading('borrow');
    try {
      const res = await fetch('/api/lending/borrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: wallet.address,
          marketId: selectedMarket.id,
          amount,
        }),
      });

      const data = await res.json();
      if (data.success) {
        await refreshBalances();
        await refreshPosition();
        toast.success('Borrow successful');
      } else {
        toast.error(data.error?.message || 'Borrow failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Borrow failed');
    } finally {
      setLoading('');
    }
  };

  // Repay tokens
  const handleRepay = async () => {
    if (!wallet || !config || !selectedMarket) return;
    const amount = parseFloat(repayAmount);
    if (isNaN(amount) || amount <= 0) return;

    setLoading('repay');
    try {
      const { sendTokenToBackend } = await import('@/lib/client/xrpl');

      const sendResult = await sendTokenToBackend(
        wallet.seed,
        config.backendAddress,
        selectedMarket.debtCurrency,
        repayAmount,
        config.issuerAddress
      );

      if (sendResult.result !== 'tesSUCCESS') {
        toast.error(`Failed to send tokens: ${sendResult.result}`);
        return;
      }

      const res = await fetch('/api/lending/repay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: sendResult.hash,
          senderAddress: wallet.address,
          marketId: selectedMarket.id,
        }),
      });

      const data = await res.json();
      if (data.success) {
        await refreshBalances();
        await refreshPosition();
        toast.success('Repayment successful');
      } else {
        toast.error(data.error?.message || 'Repay failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Repay failed');
    } finally {
      setLoading('');
    }
  };

  // Withdraw collateral
  const handleWithdraw = async () => {
    if (!wallet || !selectedMarket) return;
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) return;

    setLoading('withdraw');
    try {
      const res = await fetch('/api/lending/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: wallet.address,
          marketId: selectedMarket.id,
          amount,
        }),
      });

      const data = await res.json();
      if (data.success) {
        await refreshBalances();
        await refreshPosition();
        toast.success('Withdrawal successful');
      } else {
        toast.error(data.error?.message || 'Withdraw failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Withdraw failed');
    } finally {
      setLoading('');
    }
  };

  const getBalance = (currency: string): string => {
    const bal = balances.find((b) => b.currency === currency);
    return bal ? bal.value : '0';
  };

  const copyAddress = () => {
    if (wallet) {
      navigator.clipboard.writeText(wallet.address);
      toast.success('Address copied');
    }
  };

  const getHealthFactorColor = (hf: number) => {
    if (!Number.isFinite(hf)) return 'text-emerald-600';
    if (hf < 1.1) return 'text-red-600';
    if (hf < 1.5) return 'text-yellow-600';
    return 'text-emerald-600';
  };

  const getHealthProgress = (hf: number) => {
    if (!Number.isFinite(hf)) return 100;
    return Math.min(100, (hf / 2) * 100);
  };

  const StatusIcon = ({ status }: { status: 'pending' | 'loading' | 'done' | 'error' }) => {
    if (status === 'loading') return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    if (status === 'done') return <CheckCircle className="h-5 w-5 text-emerald-500" />;
    if (status === 'error') return <AlertTriangle className="h-5 w-5 text-red-500" />;
    return <div className="h-5 w-5 rounded-full border-2 border-zinc-300" />;
  };

  if (configError) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <h1 className="mb-8 text-3xl font-bold">XRP Lending</h1>
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <CardHeader>
              <CardTitle className="text-red-800 dark:text-red-200">Configuration Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-red-700 dark:text-red-300">{configError}</p>
              <div className="space-y-2 text-sm text-red-600 dark:text-red-400">
                <p>To fix this, run the setup scripts:</p>
                <code className="block rounded bg-red-100 px-2 py-1 dark:bg-red-900/50">
                  npm run setup:testnet
                </code>
                <code className="block rounded bg-red-100 px-2 py-1 dark:bg-red-900/50">
                  npm run setup:db
                </code>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Page Header */}
      <div className="border-b bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">XRP Lending</h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Deposit collateral and borrow against it on XRPL testnet
              </p>
            </div>
            {wallet && walletReady && (
              <Card className="w-full sm:w-auto">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500">
                      <Wallet className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-zinc-500">XRPL Wallet</p>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm">{wallet.address.slice(0, 8)}...{wallet.address.slice(-4)}</p>
                        <button onClick={copyAddress} className="text-zinc-400 hover:text-zinc-600">
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Market Info */}
        {selectedMarket && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Market: {selectedMarket.name}
                </CardTitle>
                <Badge variant="outline">{selectedMarket.baseInterestRate * 100}% APR</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-sm text-zinc-500">Max LTV</p>
                  <p className="text-lg font-semibold">{selectedMarket.maxLtvRatio * 100}%</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Liquidation LTV</p>
                  <p className="text-lg font-semibold">{selectedMarket.liquidationLtvRatio * 100}%</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Collateral Price</p>
                  <p className="text-lg font-semibold">${selectedMarket.prices?.collateralPriceUsd ?? 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Debt Price</p>
                  <p className="text-lg font-semibold">${selectedMarket.prices?.debtPriceUsd ?? 'N/A'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Position Overview */}
        {wallet && walletReady && position && metrics && selectedMarket && (
          <Card className="mb-6 bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Shield className="h-5 w-5" />
                Your Position
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-wide text-white/70">Collateral</p>
                  <p className="text-xl font-bold">
                    {position.collateralAmount.toFixed(2)} {selectedMarket.collateralCurrency}
                  </p>
                  <p className="text-sm text-white/60">${metrics.collateralValueUsd.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-wide text-white/70">Total Debt</p>
                  <p className="text-xl font-bold">
                    {metrics.totalDebt.toFixed(2)} {selectedMarket.debtCurrency}
                  </p>
                  <p className="text-sm text-white/60">${metrics.debtValueUsd.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-wide text-white/70">Current LTV</p>
                  <p className="text-xl font-bold">{(metrics.currentLtv * 100).toFixed(1)}%</p>
                  <p className="text-sm text-white/60">Max: {selectedMarket.maxLtvRatio * 100}%</p>
                </div>
                <div className="rounded-lg bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-wide text-white/70">Health Factor</p>
                  <p className={`text-xl font-bold ${Number.isFinite(metrics.healthFactor) ? '' : 'text-emerald-300'}`}>
                    {Number.isFinite(metrics.healthFactor) ? metrics.healthFactor.toFixed(2) : '...'}
                  </p>
                  <Progress value={getHealthProgress(metrics.healthFactor)} className="mt-2 h-1.5 bg-white/20" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Wallet Setup Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Wallet Setup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!wallet ? (
                <Button onClick={handleGenerateWallet} className="w-full">
                  Generate New Wallet
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800">
                    <p className="text-sm text-zinc-500">Address</p>
                    <p className="break-all font-mono text-sm">{wallet.address}</p>
                  </div>
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      Wallet Seed (save this!)
                    </p>
                    <p className="mt-1 break-all font-mono text-sm text-yellow-700 dark:text-yellow-300">
                      {wallet.seed}
                    </p>
                  </div>
                </div>
              )}

              {wallet && !walletReady && (
                <div className="space-y-4">
                  {setupStatus.step === 'idle' ? (
                    <Button onClick={handleSetupWallet} className="w-full" variant="default">
                      Setup Wallet
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                        <StatusIcon status={setupStatus.xrp} />
                        <span>{setupStatus.xrp === 'loading' ? 'Getting XRP...' : setupStatus.xrp === 'done' ? 'XRP funded' : 'Get XRP'}</span>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                        <StatusIcon status={setupStatus.collateral} />
                        <span>{setupStatus.collateral === 'loading' ? 'Setting up TST trust line...' : setupStatus.collateral === 'done' ? 'TST trust line ready' : 'TST trust line'}</span>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                        <StatusIcon status={setupStatus.debt} />
                        <span>{setupStatus.debt === 'loading' ? 'Setting up RWD trust line...' : setupStatus.debt === 'done' ? 'RWD trust line ready' : 'RWD trust line'}</span>
                      </div>
                      {setupStatus.error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                          <p className="text-sm text-red-700 dark:text-red-300">{setupStatus.error}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Balances Card */}
          {wallet && walletReady && selectedMarket && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5" />
                    Your Balances
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={refreshBalances}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                    <p className="text-xs uppercase text-zinc-500">XRP</p>
                    <p className="text-xl font-bold">{parseFloat(getBalance('XRP')).toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                    <p className="text-xs uppercase text-zinc-500">{selectedMarket.collateralCurrency}</p>
                    <p className="text-xl font-bold">{parseFloat(getBalance(selectedMarket.collateralCurrency)).toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                    <p className="text-xs uppercase text-zinc-500">{selectedMarket.debtCurrency}</p>
                    <p className="text-xl font-bold">{parseFloat(getBalance(selectedMarket.debtCurrency)).toFixed(2)}</p>
                  </div>
                </div>
                <Button
                  onClick={handleRequestTokens}
                  disabled={loading === 'faucet'}
                  variant="outline"
                  className="w-full"
                >
                  {loading === 'faucet' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Coins className="mr-2 h-4 w-4" />
                  )}
                  Get 100 {selectedMarket.collateralCurrency} from Faucet
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Lending Actions */}
        {wallet && walletReady && selectedMarket && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" />
                Lending Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="deposit" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="deposit">
                    <ArrowDownLeft className="mr-2 h-4 w-4" />
                    Deposit
                  </TabsTrigger>
                  <TabsTrigger value="borrow">
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Borrow
                  </TabsTrigger>
                  <TabsTrigger value="repay">
                    <ArrowDownLeft className="mr-2 h-4 w-4" />
                    Repay
                  </TabsTrigger>
                  <TabsTrigger value="withdraw">
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Withdraw
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="deposit" className="space-y-4">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Deposit {selectedMarket.collateralCurrency} as collateral
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-32 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                    />
                    <span className="text-zinc-600 dark:text-zinc-400">{selectedMarket.collateralCurrency}</span>
                    <Button onClick={handleDeposit} disabled={loading === 'deposit'}>
                      {loading === 'deposit' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Deposit
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="borrow" className="space-y-4">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Borrow {selectedMarket.debtCurrency} against your collateral
                    {metrics && (
                      <span className="ml-2 text-xs">
                        (Max: {metrics.maxBorrowableAmount.toFixed(2)} {selectedMarket.debtCurrency})
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={borrowAmount}
                      onChange={(e) => setBorrowAmount(e.target.value)}
                      className="w-32 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                    />
                    <span className="text-zinc-600 dark:text-zinc-400">{selectedMarket.debtCurrency}</span>
                    <Button onClick={handleBorrow} disabled={loading === 'borrow' || !position}>
                      {loading === 'borrow' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Borrow
                    </Button>
                  </div>
                  {!position && (
                    <p className="text-sm text-yellow-600">Deposit collateral first to borrow</p>
                  )}
                </TabsContent>

                <TabsContent value="repay" className="space-y-4">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Repay your {selectedMarket.debtCurrency} debt
                    {metrics && metrics.totalDebt > 0 && (
                      <span className="ml-2 text-xs">
                        (Total debt: {metrics.totalDebt.toFixed(2)} {selectedMarket.debtCurrency})
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={repayAmount}
                      onChange={(e) => setRepayAmount(e.target.value)}
                      className="w-32 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                    />
                    <span className="text-zinc-600 dark:text-zinc-400">{selectedMarket.debtCurrency}</span>
                    <Button onClick={handleRepay} disabled={loading === 'repay' || !position || (metrics?.totalDebt ?? 0) === 0}>
                      {loading === 'repay' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Repay
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="withdraw" className="space-y-4">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Withdraw {selectedMarket.collateralCurrency} collateral
                    {metrics && (
                      <span className="ml-2 text-xs">
                        (Max: {metrics.maxWithdrawableAmount.toFixed(2)} {selectedMarket.collateralCurrency})
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-32 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                    />
                    <span className="text-zinc-600 dark:text-zinc-400">{selectedMarket.collateralCurrency}</span>
                    <Button onClick={handleWithdraw} disabled={loading === 'withdraw' || !position || (position?.collateralAmount ?? 0) === 0}>
                      {loading === 'withdraw' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Withdraw
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Activity History */}
        {wallet && walletReady && events.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {events.slice(0, 10).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          event.status === 'COMPLETED'
                            ? 'default'
                            : event.status === 'FAILED'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {event.status}
                      </Badge>
                      <span className="text-sm">
                        {event.eventType.replace('LENDING_', '').replace(/_/g, ' ')}
                      </span>
                      {event.amount && event.currency && (
                        <span className="text-sm text-zinc-500">
                          {event.amount} {event.currency}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-500">
                      {new Date(event.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        {config && (
          <div className="mt-8 text-center">
            <a
              href={`${config.explorerUrl}/accounts/${wallet?.address || config.backendAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              View on Explorer
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
