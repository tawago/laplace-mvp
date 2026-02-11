'use client';
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, ExternalLink, Loader2, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import {
  checkTrustLine,
  getWalletFromSeed,
  sendTokenToBackend,
  type TokenBalance,
  type WalletInfo,
} from '@/lib/client/xrpl';
import { loadWalletSeed } from '@/lib/client/wallet-storage';
import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

interface MarketConfig {
  id: string;
  name: string;
  debtCurrency: string;
  debtIssuer: string;
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

export default function LenderPage() {
  const [config, setConfig] = useState<LendingConfig | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletReady, setWalletReady] = useState(false);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [pool, setPool] = useState<PoolMetrics | null>(null);
  const [position, setPosition] = useState<SupplyPosition | null>(null);
  const [positionMetrics, setPositionMetrics] = useState<SupplyPositionMetrics | null>(null);
  const [events, setEvents] = useState<SupplierEvent[]>([]);
  const [loadingAction, setLoadingAction] = useState<string>('');
  const [pageLoading, setPageLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [supplyAmount, setSupplyAmount] = useState('25');
  const [withdrawAmount, setWithdrawAmount] = useState('10');

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
    const response = await fetch(`/api/balances?address=${wallet.address}`);
    const payload = await response.json();
    if (payload.success) {
      setBalances(payload.balances);
    }
  }, [wallet?.address]);

  const refreshPool = useCallback(async () => {
    if (!selectedMarketId) return;
    const response = await fetch(`/api/lending/markets/${selectedMarketId}`);
    const payload = await response.json();
    if (payload.success) {
      setPool(payload.data.pool);
    }
  }, [selectedMarketId]);

  const refreshPosition = useCallback(async () => {
    if (!selectedMarketId || !wallet?.address) {
      setPosition(null);
      setPositionMetrics(null);
      return;
    }

    const response = await fetch(
      `/api/lending/markets/${selectedMarketId}/supply-positions/${wallet.address}`
    );
    const payload = await response.json();

    if (response.status === 404 || payload.error?.code === 'SUPPLY_POSITION_NOT_FOUND') {
      setPosition(null);
      setPositionMetrics(null);
      return;
    }

    if (payload.success) {
      setPosition(payload.data.position);
      setPositionMetrics(payload.data.metrics);
    }
  }, [selectedMarketId, wallet?.address]);

  const refreshEvents = useCallback(async () => {
    if (!wallet?.address || !selectedMarketId) {
      setEvents([]);
      return;
    }

    const response = await fetch(
      `/api/lending/lenders/${wallet.address}/supply-positions?marketId=${selectedMarketId}`
    );
    const payload = await response.json();
    if (payload.success) {
      setEvents(payload.data.events ?? []);
    }
  }, [selectedMarketId, wallet?.address]);

  const refreshDashboard = useCallback(async () => {
    await Promise.all([refreshPool(), refreshPosition(), refreshEvents(), refreshBalances()]);
  }, [refreshBalances, refreshEvents, refreshPool, refreshPosition]);

  useEffect(() => {
    async function loadConfig() {
      setPageLoading(true);
      try {
        const response = await fetch('/api/lending/config');
        const payload = await response.json();
        if (!payload.success) {
          setErrorMessage(payload.error?.message ?? 'Failed to load lending config');
          return;
        }

        setConfig(payload.data);
        const firstMarket = payload.data.markets[0];
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
  }, []);

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
        const trusted = await checkTrustLine(
          wallet.address,
          config.issuerAddress,
          selectedMarket.debtCurrency
        );
        setWalletReady(trusted);
      } catch {
        setWalletReady(false);
      }
    }

    checkWalletReadiness();
  }, [config?.issuerAddress, selectedMarket, wallet]);

  useEffect(() => {
    if (!walletReady || !wallet?.address || !selectedMarketId) return;
    refreshDashboard();
  }, [refreshDashboard, selectedMarketId, wallet?.address, walletReady]);

  const handleSupply = useCallback(async () => {
    if (!wallet || !walletReady || !config || !selectedMarket) return;

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
      const sendResult = await sendTokenToBackend(
        wallet.seed,
        config.backendAddress,
        selectedMarket.debtCurrency,
        amount.toString(),
        selectedMarket.debtIssuer
      );

      if (sendResult.result !== 'tesSUCCESS') {
        toast.error(`XRPL transfer failed: ${sendResult.result}`);
        return;
      }

      const response = await fetch(`/api/lending/markets/${selectedMarket.id}/supply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderAddress: wallet.address,
          txHash: sendResult.hash,
        }),
      });

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
    config,
    refreshDashboard,
    selectedMarket,
    supplyAmount,
    wallet,
    walletReady,
  ]);

  const handleCollectYield = useCallback(async () => {
    if (!wallet || !walletReady || !selectedMarket) return;
    setLoadingAction('collect-yield');

    try {
      const response = await fetch(`/api/lending/markets/${selectedMarket.id}/collect-yield`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: wallet.address }),
      });
      const payload = await response.json();

      if (!payload.success) {
        toast.error(payload.error?.message ?? 'Collect yield failed');
        return;
      }

      const txSummary = payload.data.txHash ? ` (${payload.data.txHash.slice(0, 10)}...)` : '';
      toast.success(`Collected ${payload.data.collectedAmount} ${getTokenSymbol(selectedMarket.debtCurrency)}${txSummary}`);
      await refreshDashboard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Collect yield failed');
    } finally {
      setLoadingAction('');
    }
  }, [refreshDashboard, selectedMarket, wallet, walletReady]);

  const handleWithdrawSupply = useCallback(async () => {
    if (!wallet || !walletReady || !selectedMarket) return;

    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Withdraw amount must be positive');
      return;
    }

    setLoadingAction('withdraw-supply');
    try {
      const response = await fetch(`/api/lending/markets/${selectedMarket.id}/withdraw-supply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: wallet.address, amount }),
      });
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
  }, [refreshDashboard, selectedMarket, wallet, walletReady, withdrawAmount]);

  const canCollectYield = (positionMetrics?.accruedYield ?? 0) > 0;

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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Lender Dashboard</h1>
              <p className="mt-1 text-sm text-slate-600">
                Supply {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : 'debt asset'} liquidity and manage yield on XRPL testnet.
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
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Principal</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {formatAmount(position.supplyAmount, 4)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Accrued Yield</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-600">
                        {formatAmount(positionMetrics.accruedYield, 4)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Withdrawable</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {formatAmount(positionMetrics.withdrawableAmount, 4)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Pool Liquidity</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {formatAmount(positionMetrics.availableLiquidity, 4)} {selectedMarket ? getTokenSymbol(selectedMarket.debtCurrency) : ''}
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
                <TabsTrigger value="collect" className="data-[state=active]:!bg-white data-[state=active]:!text-slate-900 !text-slate-600">Collect Yield</TabsTrigger>
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

              <TabsContent value="collect" className="space-y-4">
                <p className="text-sm text-slate-600">
                  Claim only accrued yield to your lender wallet.
                </p>
                <Button
                  onClick={handleCollectYield}
                  disabled={!walletReady || !canCollectYield || loadingAction === 'collect-yield'}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {loadingAction === 'collect-yield' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Collect Yield
                </Button>
                {!canCollectYield && (
                  <p className="text-xs text-slate-500">Yield collection is enabled once accrued yield is greater than zero.</p>
                )}
              </TabsContent>

              <TabsContent value="withdraw" className="space-y-4">
                <p className="text-sm text-slate-600">
                  Withdraw supplied principal while respecting pool liquidity constraints.
                </p>
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
                    className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                  >
                    {loadingAction === 'withdraw-supply' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Withdraw Supply
                  </Button>
                </div>
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
