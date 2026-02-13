'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, ExternalLink, Loader2, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { InstitutionalUnderwriting } from './components/institutional-underwriting';

import {
  checkTrustLine,
  getVaultShareBalance,
  getWalletFromSeed,
  submitVaultDeposit,
  submitVaultWithdrawAllByShares,
  submitVaultWithdraw,
  type TokenBalance,
  type WalletInfo,
} from '@/lib/client/xrpl';
import { loadWalletSeed } from '@/lib/client/wallet-storage';
import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

interface MarketConfig {
  id: string;
  name: string;
  collateralCurrency: string;
  debtCurrency: string;
  debtIssuer: string;
  supplyVaultId: string | null;
  supplyMptIssuanceId: string | null;
  vaultScale: number;
  baseInterestRate: number;
  minSupplyAmount: number;
  reserveFactor: number;
}

interface LendingConfig {
  markets: MarketConfig[];
  issuerAddress: string;
  backendAddress: string;
  explorerUrl: string;
}

interface PoolMetrics {
  marketId: string;
  totalSupplied: number;
  totalBorrowed: number;
  availableLiquidity: number;
  utilizationRate: number;
  borrowApr: number;
  supplyApr: number;
  supplyApy: number;
  globalYieldIndex: number;
}

interface SupplyPosition {
  id: string;
  status: 'ACTIVE' | 'CLOSED';
  supplyAmount: number;
  suppliedAt: string;
}

interface SupplyPositionMetrics {
  accruedYield: number;
  withdrawableAmount: number;
  availableLiquidity: number;
  utilizationRate: number;
  supplyApr: number;
  supplyApy: number;
}

interface SupplierEvent {
  id: string;
  eventType: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  amount: number | null;
  currency: string | null;
  createdAt: string;
  errorMessage: string | null;
}

function formatAmount(value: number, decimals = 2): string {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: decimals }) : '0';
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function normalizeShares(rawShares: string, scale: number): number {
  const parsed = Number(rawShares);
  if (!Number.isFinite(parsed)) return 0;
  const divisor = Math.pow(10, Math.max(0, scale));
  if (!Number.isFinite(divisor) || divisor <= 0) return parsed;
  return parsed / divisor;
}

export default function LenderPage() {
  const [config, setConfig] = useState<LendingConfig | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletReady, setWalletReady] = useState(false);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [pool, setPool] = useState<PoolMetrics | null>(null);
  const [position, setPosition] = useState<SupplyPosition | null>(null);
  const [positionMetrics, setPositionMetrics] = useState<SupplyPositionMetrics | null>(null);
  const [shareBalance, setShareBalance] = useState('0');
  const [events, setEvents] = useState<SupplierEvent[]>([]);
  const [loadingAction, setLoadingAction] = useState<string>('');
  const [pageLoading, setPageLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [networkPendingCount, setNetworkPendingCount] = useState(0);

  const [supplyAmount, setSupplyAmount] = useState('25');
  const [withdrawAmount, setWithdrawAmount] = useState('10');
  const showGlobalLoading = networkPendingCount > 0;

  const beginNetworkRequest = useCallback(() => {
    setNetworkPendingCount((count) => count + 1);
  }, []);

  const endNetworkRequest = useCallback(() => {
    setNetworkPendingCount((count) => Math.max(0, count - 1));
  }, []);

  const withNetworkLoading = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      beginNetworkRequest();
      try {
        return await fn();
      } finally {
        endNetworkRequest();
      }
    },
    [beginNetworkRequest, endNetworkRequest]
  );

  const selectedMarket = useMemo(
    () => config?.markets.find((market) => market.id === selectedMarketId) ?? null,
    [config?.markets, selectedMarketId]
  );

  const getBalance = useCallback(
    (currency: string, issuer?: string) => {
      const targetCurrency = currency.toUpperCase();
      const targetIssuer = issuer?.toUpperCase();
      const balance = balances.find((item) => {
        if (item.currency.toUpperCase() !== targetCurrency) return false;
        if (!targetIssuer) return true;
        return (item.issuer ?? '').toUpperCase() === targetIssuer;
      });
      return balance ? Number(balance.value) : 0;
    },
    [balances]
  );

  const copyAddress = useCallback(() => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet.address);
    toast.success('Wallet address copied');
  }, [wallet]);

  const refreshBalances = useCallback(async () => {
    if (!wallet?.address) return;
    const response = await withNetworkLoading(() => fetch(`/api/balances?address=${wallet.address}`));
    const payload = await response.json();
    if (payload.success) {
      setBalances(payload.balances);
    }
  }, [wallet?.address, withNetworkLoading]);

  const refreshPool = useCallback(async () => {
    if (!selectedMarketId) return;
    const response = await withNetworkLoading(() => fetch(`/api/lending/markets/${selectedMarketId}`));
    const payload = await response.json();
    if (payload.success) {
      setPool(payload.data.pool);
    }
  }, [selectedMarketId, withNetworkLoading]);

  const refreshPosition = useCallback(async () => {
    if (!selectedMarketId || !wallet?.address) {
      setPosition(null);
      setPositionMetrics(null);
      setShareBalance('0');
      return;
    }

    const response = await withNetworkLoading(() =>
      fetch(`/api/lending/markets/${selectedMarketId}/supply-positions/${wallet.address}`)
    );
    const payload = await response.json();

    if (response.status === 404 || payload.error?.code === 'SUPPLY_POSITION_NOT_FOUND') {
      setPosition(null);
      setPositionMetrics(null);
      setShareBalance('0');
      return;
    }

    if (payload.success) {
      setPosition(payload.data.position);
      setPositionMetrics(payload.data.metrics);

      const marketFromResponse = payload.data.market as { supplyMptIssuanceId?: string | null } | undefined;
      const issuanceId =
        (typeof marketFromResponse?.supplyMptIssuanceId === 'string' && marketFromResponse.supplyMptIssuanceId) ||
        selectedMarket?.supplyMptIssuanceId ||
        null;

      if (issuanceId) {
        try {
          const shares = await getVaultShareBalance(wallet.address, issuanceId);
          setShareBalance(shares);
        } catch {
          setShareBalance('0');
        }
      } else {
        setShareBalance('0');
      }
    }
  }, [selectedMarket?.supplyMptIssuanceId, selectedMarketId, wallet?.address, withNetworkLoading]);

  const refreshEvents = useCallback(async () => {
    if (!wallet?.address || !selectedMarketId) {
      setEvents([]);
      return;
    }

    const response = await withNetworkLoading(() =>
      fetch(`/api/lending/lenders/${wallet.address}/supply-positions?marketId=${selectedMarketId}`)
    );
    const payload = await response.json();
    if (payload.success) {
      setEvents(payload.data.events ?? []);
    }
  }, [selectedMarketId, wallet?.address, withNetworkLoading]);

  const refreshDashboard = useCallback(async () => {
    await Promise.all([refreshPool(), refreshPosition(), refreshEvents(), refreshBalances()]);
  }, [refreshBalances, refreshEvents, refreshPool, refreshPosition]);

  useEffect(() => {
    async function loadConfig() {
      setPageLoading(true);
      try {
        const response = await withNetworkLoading(() => fetch('/api/lending/config'));
        const payload = await response.json();
        if (!payload.success) {
          setErrorMessage(payload.error?.message ?? 'Failed to load lending config');
          return;
        }

        setConfig(payload.data);
        const markets = payload.data.markets as MarketConfig[];
        const sailMarket = markets.find((market) => {
          const nameHasSail = market.name.toUpperCase().includes('SAIL');
          const debtIsSail = getTokenSymbol(market.debtCurrency).toUpperCase() === 'SAIL';
          return nameHasSail || debtIsSail;
        });
        const firstMarket = sailMarket ?? markets[0];
        if (firstMarket) {
          setSelectedMarketId(firstMarket.id);
        }

        const storedSeed = loadWalletSeed();
        if (storedSeed) {
          setWallet(getWalletFromSeed(storedSeed));
        }
      } catch {
        setErrorMessage('Failed to connect to lending API');
      } finally {
        setPageLoading(false);
      }
    }

    loadConfig();
  }, [withNetworkLoading]);

  useEffect(() => {
    if (!selectedMarketId) return;
    refreshPool();
  }, [selectedMarketId, refreshPool]);

  useEffect(() => {
    if (!wallet?.address) return;
    refreshBalances();
  }, [refreshBalances, wallet?.address]);

  useEffect(() => {
    async function checkWalletReadiness() {
      if (!wallet || !selectedMarket || !config?.issuerAddress) {
        setWalletReady(false);
        return;
      }

      try {
        const trusted = await withNetworkLoading(() =>
          checkTrustLine(
            wallet.address,
            config.issuerAddress,
            selectedMarket.debtCurrency
          )
        );
        setWalletReady(trusted);
      } catch {
        setWalletReady(false);
      }
    }

    checkWalletReadiness();
  }, [config?.issuerAddress, selectedMarket, wallet, withNetworkLoading]);

  useEffect(() => {
    if (!walletReady || !wallet?.address || !selectedMarketId) return;
    refreshDashboard();
  }, [refreshDashboard, selectedMarketId, wallet?.address, walletReady]);

  const handleSupply = useCallback(async () => {
    if (!wallet || !walletReady || !selectedMarket) return;

    if (!selectedMarket.supplyVaultId) {
      toast.error('Supply vault is not configured for this market yet');
      return;
    }

    const amount = Number(supplyAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Supply amount must be positive');
      return;
    }
    if (amount < selectedMarket.minSupplyAmount) {
      toast.error(`Minimum supply is ${selectedMarket.minSupplyAmount} ${getTokenSymbol(selectedMarket.debtCurrency)}`);
      return;
    }

    setLoadingAction('supply');
    try {
      const sendResult = await submitVaultDeposit(
        wallet.seed,
        selectedMarket.supplyVaultId,
        selectedMarket.debtCurrency,
        amount.toString(),
        selectedMarket.debtIssuer,
        selectedMarket.vaultScale
      );

      if (sendResult.result !== 'tesSUCCESS') {
        if (sendResult.result === 'tecPRECISION_LOSS') {
          toast.error('Amount precision is too high for this vault. Try fewer decimal places.');
          return;
        }
        toast.error(`Vault deposit failed: ${sendResult.result}`);
        return;
      }

      const response = await withNetworkLoading(() =>
        fetch(`/api/lending/markets/${selectedMarket.id}/supply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderAddress: wallet.address,
            txHash: sendResult.hash,
          }),
        })
      );

      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error?.message ?? 'Supply registration failed');
        return;
      }

      toast.success(`Supplied ${payload.data.suppliedAmount} ${getTokenSymbol(selectedMarket.debtCurrency)}`);
      await refreshDashboard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Supply failed');
    } finally {
      setLoadingAction('');
    }
  }, [
    refreshDashboard,
    selectedMarket,
    supplyAmount,
    wallet,
    walletReady,
    withNetworkLoading,
  ]);

  const handleWithdrawSupply = useCallback(async () => {
    if (!wallet || !walletReady || !selectedMarket) return;

    if (!selectedMarket.supplyVaultId) {
      toast.error('Supply vault is not configured for this market yet');
      return;
    }

    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Withdraw amount must be positive');
      return;
    }

    setLoadingAction('withdraw-supply');
    try {
      const sendResult = await submitVaultWithdraw(
        wallet.seed,
        selectedMarket.supplyVaultId,
        selectedMarket.debtCurrency,
        amount.toString(),
        selectedMarket.debtIssuer,
        selectedMarket.vaultScale
      );

      if (sendResult.result !== 'tesSUCCESS') {
        if (sendResult.result === 'tecPRECISION_LOSS') {
          toast.error('Vault could not represent this withdrawal exactly. Try a slightly smaller amount.');
          return;
        }
        toast.error(`Vault withdraw failed: ${sendResult.result}`);
        return;
      }

      const response = await withNetworkLoading(() =>
        fetch(`/api/lending/markets/${selectedMarket.id}/withdraw-supply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: wallet.address,
            amount: sendResult.submittedAmount,
            txHash: sendResult.hash,
          }),
        })
      );
      const payload = await response.json();

      if (!payload.success) {
        toast.error(payload.error?.message ?? 'Withdraw failed');
        return;
      }

      toast.success(`Withdrawn ${payload.data.withdrawnAmount} ${getTokenSymbol(selectedMarket.debtCurrency)}`);
      await refreshDashboard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Withdraw failed');
    } finally {
      setLoadingAction('');
    }
  }, [refreshDashboard, selectedMarket, wallet, walletReady, withdrawAmount, withNetworkLoading]);

  const handleWithdrawAll = useCallback(async () => {
    if (!wallet || !walletReady || !selectedMarket) return;
    if (!selectedMarket.supplyVaultId || !selectedMarket.supplyMptIssuanceId) {
      toast.error('Supply vault share config is missing for this market');
      return;
    }
    if (!position || position.supplyAmount <= 0) {
      toast.error('No active supplied position to withdraw');
      return;
    }

    setLoadingAction('withdraw-all');
    try {
      const shareBalance = await getVaultShareBalance(wallet.address, selectedMarket.supplyMptIssuanceId);
      const sendResult = await submitVaultWithdrawAllByShares(
        wallet.seed,
        selectedMarket.supplyVaultId,
        selectedMarket.supplyMptIssuanceId,
        shareBalance
      );

      if (sendResult.result !== 'tesSUCCESS') {
        toast.error(`Full vault withdraw failed: ${sendResult.result}`);
        return;
      }

      const response = await withNetworkLoading(() =>
        fetch(`/api/lending/markets/${selectedMarket.id}/withdraw-supply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: wallet.address,
            amount: position.supplyAmount,
            txHash: sendResult.hash,
          }),
        })
      );
      const payload = await response.json();

      if (!payload.success) {
        toast.error(payload.error?.message ?? 'Full withdraw failed');
        return;
      }

      toast.success(`Withdrawn full position (${payload.data.withdrawnAmount} ${getTokenSymbol(selectedMarket.debtCurrency)})`);
      await refreshDashboard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Full withdraw failed');
    } finally {
      setLoadingAction('');
    }
  }, [position, refreshDashboard, selectedMarket, wallet, walletReady, withNetworkLoading]);

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="h-28 animate-pulse rounded-2xl bg-white shadow-sm" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="h-44 animate-pulse rounded-2xl bg-white shadow-sm" />
            <div className="h-44 animate-pulse rounded-2xl bg-white shadow-sm" />
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Card className="border-rose-200 bg-rose-50">
            <CardHeader>
              <CardTitle className="text-rose-700">Lender dashboard unavailable</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-rose-700">{errorMessage}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden">
        <div
          className={`h-full bg-slate-500 transition-opacity duration-150 ${showGlobalLoading ? 'animate-pulse opacity-100' : 'opacity-0'}`}
        />
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Lender Dashboard</h1>
              <p className="mt-1 text-sm text-slate-600">
                Supply {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : 'debt asset'} liquidity through XRPL vaults.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={selectedMarketId}
                onChange={(event) => setSelectedMarketId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:w-72"
              >
                {config?.markets.map((market) => (
                  <option key={market.id} value={market.id}>
                    {market.name} ({getTokenSymbol(market.debtCurrency)})
                  </option>
                ))}
              </select>

              {wallet ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-slate-500" />
                    <span className="font-mono text-slate-900">
                      {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
                    </span>
                    <button onClick={copyAddress} className="text-slate-500 hover:text-slate-700" aria-label="Copy wallet address">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant={walletReady ? 'default' : 'secondary'} className={walletReady ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}>
                      {walletReady ? 'Ready' : 'Trust line missing'}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : 'Asset'} balance: {formatAmount(getBalance(selectedMarket?.debtCurrency ?? '', selectedMarket?.debtIssuer), 4)}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <Tabs defaultValue="market-action" className="space-y-6">
          <TabsList className="bg-slate-100">
            <TabsTrigger
              value="market-action"
              className="!text-slate-600 data-[state=active]:!bg-white data-[state=active]:!text-slate-900"
            >
              Market Action
            </TabsTrigger>
            <TabsTrigger
              value="general-info"
              className="!text-slate-600 data-[state=active]:!bg-white data-[state=active]:!text-slate-900"
            >
              General Info
            </TabsTrigger>
          </TabsList>

          <TabsContent value="market-action" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base text-slate-900">Pool Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Total Supplied</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {formatAmount(pool?.totalSupplied ?? 0, 4)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Total Borrowed</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {formatAmount(pool?.totalBorrowed ?? 0, 4)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Utilization</span>
                      <span className="font-medium text-slate-900">{formatPercent(pool?.utilizationRate ?? 0)}</span>
                    </div>
                    <Progress value={(pool?.utilizationRate ?? 0) * 100} className="h-2 bg-slate-200 [&>[data-slot=progress-indicator]]:bg-slate-700" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Borrow APR</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatPercent(pool?.borrowApr ?? selectedMarket?.baseInterestRate ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Supply APY</p>
                      <p className="mt-1 font-semibold text-emerald-600">{formatPercent(pool?.supplyApy ?? 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base text-slate-900">Your Supply Position</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!walletReady ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      You do not have any RLUSD token to lend.
                    </div>
                  ) : !position || !positionMetrics ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      No active supply position yet. Use the Supply tab to open one.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Principal</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {formatAmount(position.supplyAmount, 4)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Earnings</p>
                          <p className="mt-1 text-lg font-semibold text-emerald-600">
                            {formatAmount(positionMetrics.accruedYield, 4)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Share</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {formatAmount(normalizeShares(shareBalance, selectedMarket?.vaultScale ?? 6), 4)} shares
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-slate-900">Supply Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="supply" className="w-full">
                  <TabsList className="mb-6 !bg-slate-100">
                    <TabsTrigger value="supply" className="data-[state=active]:!bg-white data-[state=active]:!text-slate-900 !text-slate-600">Supply</TabsTrigger>
                    <TabsTrigger value="withdraw" className="data-[state=active]:!bg-white data-[state=active]:!text-slate-900 !text-slate-600">Withdraw</TabsTrigger>
                  </TabsList>

                  <TabsContent value="supply" className="space-y-4">
                    <p className="text-sm text-slate-600">
                      Minimum supply is {selectedMarket?.minSupplyAmount ?? 0} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}.
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={supplyAmount}
                        onChange={(event) => setSupplyAmount(event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:w-64"
                      />
                      <Button
                        onClick={handleSupply}
                        disabled={!walletReady || loadingAction === 'supply'}
                        className="sm:w-auto bg-slate-900 text-white hover:bg-slate-800"
                      >
                        {loadingAction === 'supply' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
                        Supply to Pool
                      </Button>
                    </div>
                    {!walletReady && (
                      <p className="text-xs text-amber-700">You do not have any RLUSD token to lend.</p>
                    )}
                  </TabsContent>

                  <TabsContent value="withdraw" className="space-y-4">
                    <p className="text-sm text-slate-600">
                      Withdraw from your vault-backed supply while respecting pool liquidity constraints.
                    </p>
                    <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">Withdrawable</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatAmount(positionMetrics?.withdrawableAmount ?? 0, 4)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Pool Liquidity</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatAmount(positionMetrics?.availableLiquidity ?? pool?.availableLiquidity ?? 0, 4)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={withdrawAmount}
                        onChange={(event) => setWithdrawAmount(event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:w-64"
                      />
                      <Button
                        onClick={handleWithdrawSupply}
                        disabled={!walletReady || loadingAction === 'withdraw-supply'}
                        variant="outline"
                        className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900"
                      >
                        {loadingAction === 'withdraw-supply' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Withdraw Supply
                      </Button>
                      <Button
                        onClick={handleWithdrawAll}
                        disabled={!walletReady || !position || position.supplyAmount <= 0 || loadingAction === 'withdraw-all'}
                        variant="outline"
                        className="border-rose-300 bg-white text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                      >
                        {loadingAction === 'withdraw-all' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Withdraw Full Position
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500">
                      Full position withdraw redeems all vault shares and avoids asset precision mismatch.
                    </p>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-slate-900">Supplier Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="text-sm text-slate-500">No supplier activity yet for this market.</p>
                ) : (
                  <div className="space-y-2">
                    {events.slice(0, 8).map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3"
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
                                  : 'bg-slate-200 text-slate-700'
                              }
                            >
                              {event.status}
                            </Badge>
                            <span className="truncate text-sm text-slate-900">
                              {event.eventType.replace('LENDING_', '').replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {event.amount ? `${event.amount} ${event.currency ?? ''}` : 'No amount'}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-slate-500">
                          {new Date(event.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="general-info">
            <InstitutionalUnderwriting
              selectedMarketName={selectedMarket?.name}
              selectedMarketId={selectedMarket?.id}
              collateralCurrency={selectedMarket?.collateralCurrency}
              explorerUrl={config?.explorerUrl}
            />
          </TabsContent>
        </Tabs>

        {config?.explorerUrl && wallet?.address && (
          <div className="pb-6 text-center">
            <a
              href={`${config.explorerUrl}/accounts/${wallet.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
            >
              View wallet on XRPL explorer
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
