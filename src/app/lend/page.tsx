'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { InstitutionalUnderwriting } from './components/institutional-underwriting';
import { PoolOverviewCard } from './components/pool-overview-card';
import { SupplyActionsCard } from './components/supply-actions-card';
import { SupplyPositionCard } from './components/supply-position-card';
import { SupplierActivityCard } from './components/supplier-activity-card';
import type {
  LendingConfig,
  MarketConfig,
  PoolMetrics,
  SupplierEvent,
  SupplyPosition,
  SupplyPositionMetrics,
} from './types';

import {
  checkTrustLine,
  getVaultShareBalance,
  getWalletFromSeed,
  submitVaultDeposit,
  submitVaultWithdrawAllByShares,
  submitVaultWithdraw,
  type WalletInfo,
} from '@/lib/client/xrpl';
import { loadWalletSeed } from '@/lib/client/wallet-storage';
import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

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
  const [walletReadyChecked, setWalletReadyChecked] = useState(false);
  const [pool, setPool] = useState<PoolMetrics | null>(null);
  const [position, setPosition] = useState<SupplyPosition | null>(null);
  const [positionMetrics, setPositionMetrics] = useState<SupplyPositionMetrics | null>(null);
  const [shareBalance, setShareBalance] = useState('0');
  const [events, setEvents] = useState<SupplierEvent[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [positionLoading, setPositionLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [poolHydrated, setPoolHydrated] = useState(false);
  const [positionHydrated, setPositionHydrated] = useState(false);
  const [eventsHydrated, setEventsHydrated] = useState(false);
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

  const refreshPool = useCallback(async () => {
    if (!selectedMarketId) {
      setPoolHydrated(true);
      return;
    }
    setPoolLoading(true);
    setPoolHydrated(false);
    try {
      const response = await withNetworkLoading(() => fetch(`/api/lending/markets/${selectedMarketId}`));
      const payload = await response.json();
      if (payload.success) {
        setPool(payload.data.pool);
      }
    } finally {
      setPoolLoading(false);
      setPoolHydrated(true);
    }
  }, [selectedMarketId, withNetworkLoading]);

  const refreshPosition = useCallback(async () => {
    if (!selectedMarketId || !wallet?.address) {
      setPosition(null);
      setPositionMetrics(null);
      setShareBalance('0');
      setPositionLoading(false);
      setPositionHydrated(true);
      return;
    }

    setPositionLoading(true);
    setPositionHydrated(false);
    try {
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
    } finally {
      setPositionLoading(false);
      setPositionHydrated(true);
    }
  }, [selectedMarket?.supplyMptIssuanceId, selectedMarketId, wallet?.address, withNetworkLoading]);

  const refreshEvents = useCallback(async () => {
    if (!wallet?.address || !selectedMarketId) {
      setEvents([]);
      setEventsLoading(false);
      setEventsHydrated(true);
      return;
    }

    setEventsLoading(true);
    setEventsHydrated(false);
    try {
      const response = await withNetworkLoading(() =>
        fetch(`/api/lending/lenders/${wallet.address}/supply-positions?marketId=${selectedMarketId}`)
      );
      const payload = await response.json();
      if (payload.success) {
        setEvents(payload.data.events ?? []);
      }
    } finally {
      setEventsLoading(false);
      setEventsHydrated(true);
    }
  }, [selectedMarketId, wallet?.address, withNetworkLoading]);

  const refreshDashboard = useCallback(async () => {
    await Promise.all([refreshPool(), refreshPosition(), refreshEvents()]);
  }, [refreshEvents, refreshPool, refreshPosition]);

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
    async function checkWalletReadiness() {
      if (!wallet || !selectedMarket || !config?.issuerAddress) {
        setWalletReady(false);
        setWalletReadyChecked(false);
        return;
      }

      setWalletReadyChecked(false);
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
      } finally {
        setWalletReadyChecked(true);
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
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
            {selectedMarket ? (
              <>
                <div className="grid gap-6 md:grid-cols-2">
                  <PoolOverviewCard
                    isLoading={poolLoading || (!poolHydrated && Boolean(selectedMarketId))}
                    pool={pool}
                    market={selectedMarket}
                    formatAmount={formatAmount}
                    formatPercent={formatPercent}
                  />
                  <SupplyPositionCard
                    isLoading={
                      positionLoading || (!positionHydrated && walletReady && Boolean(wallet?.address && selectedMarketId))
                    }
                    walletReady={walletReady}
                    walletReadyChecked={walletReadyChecked}
                    market={selectedMarket}
                    position={position}
                    positionMetrics={positionMetrics}
                    shareBalance={shareBalance}
                    formatAmount={formatAmount}
                    normalizeShares={normalizeShares}
                  />
                </div>

                <SupplyActionsCard
                  market={selectedMarket}
                  walletReady={walletReady}
                  walletReadyChecked={walletReadyChecked}
                  loadingAction={loadingAction}
                  supplyAmount={supplyAmount}
                  setSupplyAmount={setSupplyAmount}
                  withdrawAmount={withdrawAmount}
                  setWithdrawAmount={setWithdrawAmount}
                  position={position}
                  pool={pool}
                  positionMetrics={positionMetrics}
                  formatAmount={formatAmount}
                  onSupply={handleSupply}
                  onWithdrawSupply={handleWithdrawSupply}
                  onWithdrawAll={handleWithdrawAll}
                />

                <SupplierActivityCard
                  isLoading={eventsLoading || (!eventsHydrated && walletReady && Boolean(wallet?.address && selectedMarketId))}
                  events={events}
                />
              </>
            ) : null}
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
