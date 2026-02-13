'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Copy,
  ExternalLink,
  Loader2,
  Percent,
  RefreshCw,
  Shield,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { TokenHolderBenefits } from './components/token-holder-benefits';

import {
  generateConditionFulfillment,
  getWalletFromSeed,
  submitCollateralEscrow,
  type TokenBalance,
  type WalletInfo,
} from '@/lib/client/xrpl';
import { loadWalletSeed } from '@/lib/client/wallet-storage';
import { getTokenCode, getTokenSymbol } from '@/lib/xrpl/currency-codes';
import { getTokenPropertyLink } from '@/lib/token-property-map';

interface Market {
  id: string;
  name: string;
  collateralCurrency: string;
  collateralIssuer: string;
  collateralEscrowEnabled: boolean;
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
  availableLiquidity: number;
}

interface LoanRepaymentOverview {
  loanId: string;
  minimumRepayment: number | null;
  fullRepayment: number | null;
  suggestedOverpayment: number | null;
  periodicPayment: number | null;
  paymentRemaining: number | null;
  nextPaymentDueDate: string | null;
  nextPaymentDueRippleEpoch: number | null;
  isPastDue: boolean;
}

interface BorrowerEvent {
  id: string;
  eventType: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  amount: number | null;
  currency: string | null;
  createdAt: string;
  errorMessage: string | null;
}

const DISPLAY_TOKENS = ['SAIL', 'NYRA', 'RLUSD'];
const REPAY_BUFFER_RATE = 0.002;
const REPAY_DECIMALS = 6;

function roundUpAmount(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.ceil(value * factor) / factor;
}

function withRepayBuffer(baseAmount: number): number {
  const buffered = baseAmount * (1 + REPAY_BUFFER_RATE);
  return roundUpAmount(buffered, REPAY_DECIMALS);
}

export default function LendingPage() {
  const [config, setConfig] = useState<LendingConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [metrics, setMetrics] = useState<PositionMetrics | null>(null);
  const [events, setEvents] = useState<BorrowerEvent[]>([]);
  const [loanRepayment, setLoanRepayment] = useState<LoanRepaymentOverview | null>(null);
  const [positionLoading, setPositionLoading] = useState(false);
  const [loading, setLoading] = useState('');
  const [collateralTrustlineReady, setCollateralTrustlineReady] = useState(false);
  const [debtTrustlineReady, setDebtTrustlineReady] = useState(false);

  const [depositAmount, setDepositAmount] = useState('100');
  const [borrowAmount, setBorrowAmount] = useState('50');
  const [repayAmount, setRepayAmount] = useState('10');
  const [repayKind, setRepayKind] = useState<'regular' | 'full' | 'overpayment' | 'late'>('regular');
  const [withdrawAmount, setWithdrawAmount] = useState('10');

  const selectedMarket = useMemo(
    () => config?.markets.find((market) => market.id === selectedMarketId) ?? null,
    [config?.markets, selectedMarketId]
  );

  const sailProperty = getTokenPropertyLink('SAIL');
  const nyraProperty = getTokenPropertyLink('NYRA');

  const getBalance = useCallback(
    (symbol: string, issuer?: string): number => {
      const code = getTokenCode(symbol);
      const targetIssuer = issuer?.toUpperCase();
      const item = balances.find((balance) => {
        const currency = balance.currency.toUpperCase();
        const currencyMatch = currency === symbol.toUpperCase() || (code ? currency === code : false);
        if (!currencyMatch) return false;
        if (!targetIssuer) return true;
        return (balance.issuer ?? '').toUpperCase() === targetIssuer;
      });
      return item ? Number(item.value) : 0;
    },
    [balances]
  );

  const refreshBalances = useCallback(async () => {
    if (!wallet?.address) return;
    try {
      const response = await fetch(`/api/balances?address=${wallet.address}`);
      const payload = await response.json();
      if (payload.success) {
        setBalances(payload.balances);
      }
    } catch (error) {
      console.error('Failed to refresh balances', error);
    }
  }, [wallet?.address]);

  const refreshPosition = useCallback(async () => {
    if (!wallet?.address || !selectedMarketId) {
      setPosition(null);
      setMetrics(null);
      setEvents([]);
      setLoanRepayment(null);
      setPositionLoading(false);
      return;
    }

    setPositionLoading(true);
    try {
      const response = await fetch(
        `/api/lending/position?userAddress=${wallet.address}&marketId=${selectedMarketId}`
      );
      const payload = await response.json();
      if (!payload.success) return;
      setPosition(payload.data.position);
      setMetrics(payload.data.metrics);
      setLoanRepayment(payload.data.loan ?? null);
      setEvents(payload.data.events ?? []);
    } catch (error) {
      console.error('Failed to refresh position', error);
    } finally {
      setPositionLoading(false);
    }
  }, [selectedMarketId, wallet?.address]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const response = await fetch('/api/lending/config');
        const payload = await response.json();
        if (!payload.success) {
          setConfigError(payload.error?.message ?? 'Failed to load lending config');
          return;
        }

        setConfig(payload.data);
        if (payload.data.markets.length > 0) {
          setSelectedMarketId(payload.data.markets[0].id);
        }

        const seed = loadWalletSeed();
        if (seed) {
          setWallet(getWalletFromSeed(seed));
        }
      } catch {
        setConfigError('Failed to connect to server');
      }
    }

    bootstrap();
  }, []);

  useEffect(() => {
    if (!wallet?.address) return;
    refreshBalances();
    if (selectedMarketId) {
      refreshPosition();
    }
  }, [refreshBalances, refreshPosition, selectedMarketId, wallet?.address]);

  useEffect(() => {
    if (!wallet?.address || !selectedMarket) {
      setCollateralTrustlineReady(false);
      setDebtTrustlineReady(false);
      return;
    }

    const hasTrustLine = (issuer: string, currency: string): boolean => {
      const normalizedCurrency = (getTokenCode(currency) || currency).toUpperCase();
      const normalizedIssuer = issuer.toUpperCase();

      return balances.some((balance) => {
        if ((balance.issuer ?? '').toUpperCase() !== normalizedIssuer) return false;
        return balance.currency.toUpperCase() === normalizedCurrency;
      });
    };

    setCollateralTrustlineReady(hasTrustLine(selectedMarket.collateralIssuer, selectedMarket.collateralCurrency));
    setDebtTrustlineReady(hasTrustLine(selectedMarket.debtIssuer, selectedMarket.debtCurrency));
  }, [balances, selectedMarket, wallet?.address]);

  const withAction = useCallback(async (action: string, fn: () => Promise<void>) => {
    setLoading(action);
    try {
      await fn();
    } finally {
      setLoading('');
    }
  }, []);

  const handleDeposit = useCallback(async () => {
    if (!wallet || !config || !selectedMarket) return;
    if (!selectedMarket.collateralEscrowEnabled) {
      toast.error('Collateral issuer has not enabled trust line token escrow for this market');
      return;
    }
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    await withAction('deposit', async () => {
      const escrowPackage = await generateConditionFulfillment();
      const sendResult = await submitCollateralEscrow(
        wallet.seed,
        config.backendAddress,
        selectedMarket.collateralCurrency,
        amount.toString(),
        selectedMarket.collateralIssuer,
        escrowPackage.condition,
        Math.floor(Date.now() / 1000) + 60 * 60 * 24
      );

      if (sendResult.result !== 'tesSUCCESS') {
        if (sendResult.result === 'tecNO_PERMISSION') {
          toast.error(
            'Escrow is not enabled for this issued token. Run setup:escrow to enable issuer trust line locking.'
          );
        } else {
          toast.error(`Failed to create collateral escrow: ${sendResult.result}`);
        }
        return;
      }

      const response = await fetch('/api/lending/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: sendResult.hash,
          senderAddress: wallet.address,
          marketId: selectedMarket.id,
          escrowCondition: escrowPackage.condition,
          escrowFulfillment: escrowPackage.fulfillment,
          escrowPreimage: escrowPackage.preimage,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error?.message ?? 'Deposit failed');
        return;
      }

      toast.success('Collateral escrow locked');
      await Promise.all([refreshBalances(), refreshPosition()]);
    });
  }, [
    config,
    depositAmount,
    refreshBalances,
    refreshPosition,
    selectedMarket,
    wallet,
    withAction,
  ]);

  const handleBorrow = useCallback(async () => {
    if (!wallet || !selectedMarket) return;
    const amount = Number(borrowAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (metrics && amount > metrics.maxBorrowableAmount) {
      toast.error(
        `Borrow amount exceeds available limit (${metrics.maxBorrowableAmount.toFixed(4)} ${getTokenSymbol(selectedMarket.debtCurrency)})`
      );
      return;
    }

    await withAction('borrow', async () => {
      const response = await fetch('/api/lending/borrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: wallet.address,
          marketId: selectedMarket.id,
          amount,
          borrowerSeed: wallet.seed,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error?.message ?? 'Borrow failed');
        return;
      }

      toast.success('Borrow successful');
      await Promise.all([refreshBalances(), refreshPosition()]);
    });
  }, [borrowAmount, metrics, refreshBalances, refreshPosition, selectedMarket, wallet, withAction]);

  const handleRepay = useCallback(async () => {
    if (!wallet || !selectedMarket) return;
    if (!loanRepayment) {
      toast.error('No active on-chain loan to repay');
      return;
    }
    const amount = Number(repayAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    await withAction('repay', async () => {
      const response = await fetch('/api/lending/repay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: wallet.address,
          marketId: selectedMarket.id,
          amount,
          borrowerSeed: wallet.seed,
          repayKind,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error?.message ?? 'Repay failed');
        return;
      }

      toast.success('Repayment successful');
      await Promise.all([refreshBalances(), refreshPosition()]);
    });
  }, [
    refreshBalances,
    loanRepayment,
    refreshPosition,
    repayAmount,
    repayKind,
    selectedMarket,
    wallet,
    withAction,
  ]);

  const applyRepayPreset = useCallback(
    (kind: 'regular' | 'full' | 'overpayment' | 'late') => {
      setRepayKind(kind);
      const baseAmount =
        kind === 'full'
          ? loanRepayment?.fullRepayment ?? loanRepayment?.minimumRepayment
          : kind === 'overpayment'
          ? loanRepayment?.suggestedOverpayment
          : loanRepayment?.minimumRepayment;
      if (typeof baseAmount === 'number' && Number.isFinite(baseAmount) && baseAmount > 0) {
        const bufferedAmount = kind === 'full' ? roundUpAmount(baseAmount, REPAY_DECIMALS) : withRepayBuffer(baseAmount);
        setRepayAmount(bufferedAmount.toFixed(REPAY_DECIMALS));
      }
    },
    [loanRepayment]
  );

  const handleWithdraw = useCallback(async () => {
    if (!wallet || !selectedMarket) return;
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    await withAction('withdraw', async () => {
      const response = await fetch('/api/lending/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: wallet.address,
          marketId: selectedMarket.id,
          amount,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error?.message ?? 'Withdraw failed');
        return;
      }

      toast.success('Withdrawal successful');
      await Promise.all([refreshBalances(), refreshPosition()]);
    });
  }, [refreshBalances, refreshPosition, selectedMarket, wallet, withdrawAmount, withAction]);

  if (configError) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <CardHeader>
              <CardTitle className="text-red-700 dark:text-red-200">Configuration Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-700 dark:text-red-300">{configError}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const copyAddress = () => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet.address);
    toast.success('Address copied');
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <div className="border-b bg-white dark:bg-zinc-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Laplace On-Chain Credit for RWAs</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Collateralized borrowing flow with pre-funded wallet assumptions.</p>
          </div>
          <div className="w-full flex gap-4 sm:w-auto">
            <div className="flex items-center justify-end gap-2">
              <select
                value={selectedMarketId}
                onChange={(event) => setSelectedMarketId(event.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              >
                {config.markets.map((market) => (
                  <option key={market.id} value={market.id}>
                    {market.name}
                  </option>
                ))}
              </select>
            </div>

            {wallet ? (
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
            ) : (
              <div className="rounded-xl border bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Hold no token yet? Invest and get
                  {' '}
                  {sailProperty ? <Link href={sailProperty.propertyPath} className="underline">SAIL</Link> : 'SAIL'}
                  {' '}
                  or
                  {' '}
                  {nyraProperty ? <Link href={nyraProperty.propertyPath} className="underline">NYRA</Link> : 'NYRA'}
                  {' '}
                  from property pages.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        {selectedMarket && (
          <Tabs defaultValue="market-action" className="space-y-6">
            <TabsList>
              <TabsTrigger value="market-action">Market Action</TabsTrigger>
              <TabsTrigger value="general-info">General Info</TabsTrigger>
            </TabsList>

            <TabsContent value="market-action" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>Market</CardTitle>
                    <Badge variant="outline">{((selectedMarket?.baseInterestRate ?? 0) * 100).toFixed(2)}% APR</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-zinc-500">Collateral</p>
                    <p className="font-semibold">{getTokenSymbol(selectedMarket.collateralCurrency)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Debt</p>
                    <p className="font-semibold">{getTokenSymbol(selectedMarket.debtCurrency)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Max LTV</p>
                    <p className="font-semibold">{(selectedMarket.maxLtvRatio * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Liquidation LTV</p>
                    <p className="font-semibold">{(selectedMarket.liquidationLtvRatio * 100).toFixed(0)}%</p>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Your Position
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {positionLoading ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="h-[74px] animate-pulse rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
                          <div className="h-[74px] animate-pulse rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
                        </div>
                        <div className="space-y-2">
                          <div className="h-3 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                          <div className="h-1.5 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                        </div>
                      </div>
                    ) : !position || !metrics ? (
                      <p className="text-zinc-600 dark:text-zinc-400">No active position yet.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                            <p className="text-xs uppercase tracking-wide text-zinc-500">Collateral</p>
                            <p className="font-semibold">{position.collateralAmount.toFixed(2)} {selectedMarket ? getTokenSymbol(selectedMarket.collateralCurrency) : ''}</p>
                          </div>
                          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                            <p className="text-xs uppercase tracking-wide text-zinc-500">Total Debt</p>
                            <p className="font-semibold">{metrics.totalDebt.toFixed(2)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}</p>
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-zinc-600">
                            <span>Current LTV</span>
                            <span>{(metrics.currentLtv * 100).toFixed(2)}%</span>
                          </div>
                          <Progress value={Math.min((metrics.currentLtv / (selectedMarket?.liquidationLtvRatio ?? 1)) * 100, 100)} className="h-1.5 bg-zinc-200 dark:bg-zinc-800" />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5" />Balances</CardTitle>
                      <Button variant="ghost" size="sm" onClick={refreshBalances}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      {DISPLAY_TOKENS.map((token) => (
                        <div key={token} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                          <p className="text-xs uppercase text-zinc-500">{token}</p>
                          <p className="font-semibold">{getBalance(token, config?.issuerAddress).toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {wallet && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Percent className="h-5 w-5" />
                        Borrower Actions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Tabs defaultValue="deposit">
                        <TabsList className="mb-4">
                          <TabsTrigger value="deposit">Deposit</TabsTrigger>
                          <TabsTrigger value="borrow">Borrow</TabsTrigger>
                          <TabsTrigger value="repay">Repay</TabsTrigger>
                          <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
                        </TabsList>

                        <TabsContent value="deposit" className="space-y-3">
                          {!selectedMarket.collateralEscrowEnabled && (
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                              Deposit disabled: issuer has not enabled trust line token escrow.
                            </p>
                          )}
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              value={depositAmount}
                              onChange={(event) => setDepositAmount(event.target.value)}
                              className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                            />
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">{getTokenSymbol(selectedMarket.collateralCurrency)}</span>
                            <Button
                              onClick={handleDeposit}
                              disabled={
                                loading === 'deposit' ||
                                !collateralTrustlineReady ||
                                !selectedMarket.collateralEscrowEnabled
                              }
                            >
                              {loading === 'deposit' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDownLeft className="mr-2 h-4 w-4" />}
                              Deposit
                            </Button>
                          </div>
                        </TabsContent>

                        <TabsContent value="borrow" className="space-y-3">
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Vault-backed pool liquidity: {(metrics?.availableLiquidity ?? 0).toFixed(4)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}
                          </p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Max borrowable now: {(metrics?.maxBorrowableAmount ?? 0).toFixed(4)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}
                          </p>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              value={borrowAmount}
                              onChange={(event) => setBorrowAmount(event.target.value)}
                              className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                            />
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">{getTokenSymbol(selectedMarket.debtCurrency)}</span>
                            <Button
                              onClick={handleBorrow}
                              disabled={
                                loading === 'borrow' ||
                                !debtTrustlineReady ||
                                (metrics ? Number(borrowAmount) > metrics.maxBorrowableAmount : false)
                              }
                            >
                              {loading === 'borrow' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpRight className="mr-2 h-4 w-4" />}
                              Borrow
                            </Button>
                          </div>
                        </TabsContent>

                        <TabsContent value="repay" className="space-y-3">
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
                            {loanRepayment ? (
                              <>
                                <p className="text-zinc-700 dark:text-zinc-300">
                                  Minimum payment:{' '}
                                  <span className="font-semibold">
                                    {(loanRepayment.minimumRepayment ?? 0).toFixed(6)} {getTokenSymbol(selectedMarket.debtCurrency)}
                                  </span>
                                </p>
                                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                                  Next due:{' '}
                                  {loanRepayment.nextPaymentDueDate
                                    ? new Date(loanRepayment.nextPaymentDueDate).toLocaleString()
                                    : 'N/A'}
                                  {loanRepayment.isPastDue ? ' (late)' : ''}
                                </p>
                                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                                  Payments remaining: {loanRepayment.paymentRemaining ?? 'N/A'}
                                </p>
                              </>
                            ) : (
                              <p className="text-zinc-700 dark:text-zinc-300">
                                No active on-chain loan found for this market.
                              </p>
                            )}
                            <p className="mt-1 text-zinc-500 dark:text-zinc-500">
                              Regular, Late, and Overpay presets include a {Math.round(REPAY_BUFFER_RATE * 1000) / 10}% buffer. Full Early uses exact payoff.
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Button
                              type="button"
                              size="sm"
                              variant={repayKind === 'regular' ? 'default' : 'outline'}
                              onClick={() => applyRepayPreset('regular')}
                              disabled={!loanRepayment}
                            >
                              Regular
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={repayKind === 'full' ? 'default' : 'outline'}
                              onClick={() => applyRepayPreset('full')}
                              disabled={!loanRepayment}
                            >
                              Full Early
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={repayKind === 'overpayment' ? 'default' : 'outline'}
                              onClick={() => applyRepayPreset('overpayment')}
                              disabled={!loanRepayment}
                            >
                              Overpay
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={repayKind === 'late' ? 'default' : 'outline'}
                              onClick={() => applyRepayPreset('late')}
                              disabled={!loanRepayment}
                            >
                              Late
                            </Button>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              value={repayAmount}
                              onChange={(event) => setRepayAmount(event.target.value)}
                              className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                            />
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">{getTokenSymbol(selectedMarket.debtCurrency)}</span>
                            <Button
                              onClick={handleRepay}
                              disabled={loading === 'repay' || !debtTrustlineReady || !loanRepayment}
                            >
                              {loading === 'repay' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDownLeft className="mr-2 h-4 w-4" />}
                              Repay
                            </Button>
                          </div>
                        </TabsContent>

                        <TabsContent value="withdraw" className="space-y-3">
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              value={withdrawAmount}
                              onChange={(event) => setWithdrawAmount(event.target.value)}
                              className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                            />
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">{getTokenSymbol(selectedMarket.collateralCurrency)}</span>
                            <Button onClick={handleWithdraw} disabled={loading === 'withdraw' || !collateralTrustlineReady} variant="outline">
                              {loading === 'withdraw' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpRight className="mr-2 h-4 w-4" />}
                              Withdraw
                            </Button>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Borrower Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {positionLoading ? (
                        <div className="space-y-2">
                          {Array.from({ length: 3 }).map((_, index) => (
                            <div
                              key={`event-skeleton-${index}`}
                              className="h-[66px] animate-pulse rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"
                            />
                          ))}
                        </div>
                      ) : events.length === 0 ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">No borrower activity yet for this market.</p>
                      ) : (
                        <div className="space-y-2">
                          {events.slice(0, 8).map((event) => (
                            <div
                              key={event.id}
                              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant={
                                      event.status === 'COMPLETED'
                                        ? 'default'
                                        : event.status === 'FAILED'
                                        ? 'destructive'
                                        : 'secondary'
                                    }
                                    className={
                                      event.status === 'COMPLETED'
                                        ? 'bg-emerald-600 text-white'
                                        : event.status === 'FAILED'
                                        ? 'bg-rose-500 text-white'
                                        : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100'
                                    }
                                  >
                                    {event.status}
                                  </Badge>
                                  <span className="truncate text-sm text-zinc-900 dark:text-zinc-100">
                                    {event.eventType.replace('LENDING_', '').replace(/_/g, ' ')}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  {event.amount ? `${event.amount} ${event.currency ?? ''}` : 'No amount'}
                                </p>
                              </div>
                              <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                                {new Date(event.createdAt).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            <TabsContent value="general-info">
              <TokenHolderBenefits
                selectedMarketName={selectedMarket.name}
                explorerUrl={config?.explorerUrl}
                walletBalance={getBalance(selectedMarket.collateralCurrency, config?.issuerAddress)}
                collateralDeposited={position?.collateralAmount ?? 0}
              />
            </TabsContent>
          </Tabs>
        )}

        {config.explorerUrl && wallet?.address && (
          <div className="text-center">
            <a
              href={`${config.explorerUrl}/accounts/${wallet.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              View wallet on Explorer
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
