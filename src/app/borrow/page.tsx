'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { BorrowerActivityCard } from './components/borrower-activity-card';
import { EstimateCalculatorCard } from './components/estimate-calculator-card';
import { MarketActionsCard } from './components/market-actions-card';
import { PositionBalanceCard } from './components/position-balance-card';
import { TokenHolderBenefits } from './components/token-holder-benefits';
import type {
  BorrowerEvent,
  LendingConfig,
  LoanRepaymentOverview,
  Market,
  Position,
  PositionMetrics,
  RepayKind,
} from './types';

import {
  generateConditionFulfillment,
  getWalletFromSeed,
  submitCollateralEscrow,
  type TokenBalance,
  type WalletInfo,
} from '@/lib/client/xrpl';
import { loadWalletSeed } from '@/lib/client/wallet-storage';
import { getTokenCode, getTokenSymbol } from '@/lib/xrpl/currency-codes';

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
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [positionHydrated, setPositionHydrated] = useState(false);
  const [loading, setLoading] = useState('');
  const [networkPendingCount, setNetworkPendingCount] = useState(0);
  const [collateralTrustlineReady, setCollateralTrustlineReady] = useState(false);
  const [debtTrustlineReady, setDebtTrustlineReady] = useState(false);

  const [depositAmount, setDepositAmount] = useState('100');
  const [borrowAmount, setBorrowAmount] = useState('50');
  const [repayAmount, setRepayAmount] = useState('0');
  const [repayKind, setRepayKind] = useState<RepayKind>('regular');
  const [withdrawAmount, setWithdrawAmount] = useState('10');

  const selectedMarket = useMemo(
    () => config?.markets.find((market) => market.id === selectedMarketId) ?? null,
    [config?.markets, selectedMarketId]
  );

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
    setBalancesLoading(true);
    try {
      const response = await withNetworkLoading(() => fetch(`/api/balances?address=${wallet.address}`));
      const payload = await response.json();
      if (payload.success) {
        setBalances(payload.balances);
      }
    } catch (error) {
      console.error('Failed to refresh balances', error);
    } finally {
      setBalancesLoading(false);
    }
  }, [wallet?.address, withNetworkLoading]);

  const refreshPosition = useCallback(async () => {
    if (!wallet?.address || !selectedMarketId) {
      setPosition(null);
      setMetrics(null);
      setEvents([]);
      setLoanRepayment(null);
      setPositionLoading(false);
      setPositionHydrated(true);
      return;
    }

    setPositionHydrated(false);
    setPositionLoading(true);
    try {
      const response = await withNetworkLoading(() =>
        fetch(`/api/lending/position?userAddress=${wallet.address}&marketId=${selectedMarketId}`)
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
      setPositionHydrated(true);
    }
  }, [selectedMarketId, wallet?.address, withNetworkLoading]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const response = await withNetworkLoading(() => fetch('/api/lending/config'));
        const payload = await response.json();
        if (!payload.success) {
          setConfigError(payload.error?.message ?? 'Failed to load lending config');
          return;
        }

        setConfig(payload.data);
        const markets = payload.data.markets as Market[];
        if (markets.length > 0) {
          const sailMarket = markets.find((market) => {
            const nameHasSail = market.name.toUpperCase().includes('SAIL');
            const collateralIsSail = getTokenSymbol(market.collateralCurrency).toUpperCase() === 'SAIL';
            const debtIsSail = getTokenSymbol(market.debtCurrency).toUpperCase() === 'SAIL';
            return nameHasSail || collateralIsSail || debtIsSail;
          });
          setSelectedMarketId((sailMarket ?? markets[0]).id);
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
  }, [withNetworkLoading]);

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

      const response = await withNetworkLoading(() =>
        fetch('/api/lending/deposit', {
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
        })
      );
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
    withNetworkLoading,
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
      const response = await withNetworkLoading(() =>
        fetch('/api/lending/borrow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: wallet.address,
            marketId: selectedMarket.id,
            amount,
            borrowerSeed: wallet.seed,
          }),
        })
      );
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error?.message ?? 'Borrow failed');
        return;
      }

      toast.success('Borrow successful');
      await Promise.all([refreshBalances(), refreshPosition()]);
    });
  }, [borrowAmount, metrics, refreshBalances, refreshPosition, selectedMarket, wallet, withAction, withNetworkLoading]);

  const handleRepay = useCallback(async () => {
    if (!wallet || !selectedMarket) return;
    if (!loanRepayment) {
      toast.error('No active on-chain loan to repay');
      return;
    }
    const amount = Number(repayAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    await withAction('repay', async () => {
      const response = await withNetworkLoading(() =>
        fetch('/api/lending/repay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: wallet.address,
            marketId: selectedMarket.id,
            amount,
            borrowerSeed: wallet.seed,
            repayKind,
          }),
        })
      );
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
    withNetworkLoading,
    withAction,
  ]);

  const applyRepayPreset = useCallback(
    (kind: RepayKind) => {
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
      const response = await withNetworkLoading(() =>
        fetch('/api/lending/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: wallet.address,
            marketId: selectedMarket.id,
            amount,
          }),
        })
      );
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error?.message ?? 'Withdraw failed');
        return;
      }

      toast.success('Withdrawal successful');
      await Promise.all([refreshBalances(), refreshPosition()]);
    });
  }, [refreshBalances, refreshPosition, selectedMarket, wallet, withdrawAmount, withAction, withNetworkLoading]);

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

  return (
    <div className="relative min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden">
        <div
          className={`h-full bg-slate-500 transition-opacity duration-150 ${showGlobalLoading ? 'animate-pulse opacity-100' : 'opacity-0'}`}
        />
      </div>

      <div className="border-b bg-white dark:bg-zinc-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Laplace On-Chain Credit for RWAs</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Collateralized borrowing flow with pre-funded wallet assumptions.</p>
          </div>
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
              <MarketActionsCard
                market={selectedMarket}
                walletConnected={Boolean(wallet)}
                loading={loading}
                collateralTrustlineReady={collateralTrustlineReady}
                debtTrustlineReady={debtTrustlineReady}
                metrics={metrics}
                loanRepayment={loanRepayment}
                repayBufferRate={REPAY_BUFFER_RATE}
                depositAmount={depositAmount}
                setDepositAmount={setDepositAmount}
                borrowAmount={borrowAmount}
                setBorrowAmount={setBorrowAmount}
                repayAmount={repayAmount}
                setRepayAmount={setRepayAmount}
                repayKind={repayKind}
                withdrawAmount={withdrawAmount}
                setWithdrawAmount={setWithdrawAmount}
                onDeposit={handleDeposit}
                onBorrow={handleBorrow}
                onRepay={handleRepay}
                onWithdraw={handleWithdraw}
                onApplyRepayPreset={applyRepayPreset}
              />

              <div className="grid gap-6 lg:grid-cols-2">
                <PositionBalanceCard
                  market={selectedMarket}
                  position={position}
                  metrics={metrics}
                  positionLoading={positionLoading || (!positionHydrated && Boolean(wallet?.address && selectedMarketId))}
                  balancesLoading={balancesLoading}
                  getBalance={getBalance}
                  onRefresh={() => {
                    void Promise.all([refreshBalances(), refreshPosition()]);
                  }}
                />

                <EstimateCalculatorCard
                  market={selectedMarket}
                  position={position}
                  loanRepayment={loanRepayment}
                  initialSimulatedBorrowAmount={borrowAmount}
                />
              </div>

              {wallet && (
                <BorrowerActivityCard
                  isLoading={positionLoading || (!positionHydrated && Boolean(wallet?.address && selectedMarketId))}
                  events={events}
                />
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
