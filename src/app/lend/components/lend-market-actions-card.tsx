import type { Dispatch, SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp } from 'lucide-react';

import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

import type { MarketConfig, PoolMetrics, SupplyPosition, SupplyPositionMetrics } from '../types';

interface LendMarketActionsCardProps {
  market: MarketConfig;
  pool: PoolMetrics | null;
  position: SupplyPosition | null;
  positionMetrics: SupplyPositionMetrics | null;
  isLoading: boolean;
  walletReady: boolean;
  walletReadyChecked: boolean;
  loadingAction: string;
  supplyAmount: string;
  setSupplyAmount: Dispatch<SetStateAction<string>>;
  withdrawAmount: string;
  setWithdrawAmount: Dispatch<SetStateAction<string>>;
  formatAmount: (value: number, decimals?: number) => string;
  formatPercent: (value: number) => string;
  onSupply: () => Promise<void>;
  onWithdrawSupply: () => Promise<void>;
  onWithdrawAll: () => Promise<void>;
}

export function LendMarketActionsCard({
  market,
  pool,
  position,
  positionMetrics,
  isLoading,
  walletReady,
  walletReadyChecked,
  loadingAction,
  supplyAmount,
  setSupplyAmount,
  withdrawAmount,
  setWithdrawAmount,
  formatAmount,
  formatPercent,
  onSupply,
  onWithdrawSupply,
  onWithdrawAll,
}: LendMarketActionsCardProps) {
  const debtSymbol = getTokenSymbol(market.debtCurrency);

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="min-h-60 px-6">
        <div className="flex flex-col lg:flex-row">
          <section className="min-w-0 flex-1 space-y-4 py-2 lg:basis-1/2">
            <h2 className="text-lg font-semibold text-slate-900">Pool Overview</h2>

            {isLoading ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Skeleton tone="light" className="h-20 rounded-xl" />
                  <Skeleton tone="light" className="h-20 rounded-xl" />
                  <Skeleton tone="light" className="h-20 rounded-xl" />
                </div>
                <div className="flex justify-between">
                  <Skeleton tone="light" className="h-4 w-10" />
                  <Skeleton tone="light" className="h-4 w-10" />
                </div>
                <Skeleton tone="light" className="h-2 w-full rounded" />
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton tone="light" className="h-12 w-full rounded" />
                  <Skeleton tone="light" className="h-12 w-full rounded" />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Total Supplied</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatAmount(pool?.totalSupplied ?? 0, 2)} {debtSymbol}
                    </p>
                    <div className="my-2 h-px bg-zinc-300" />
                    <p className="text-xs text-slate-500">{formatAmount(pool?.totalShares ?? 0, 2)} total shares</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Total Borrowed</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatAmount(pool?.totalBorrowed ?? 0, 2)} {debtSymbol}
                    </p>
                    <div className="my-2 h-px bg-zinc-300" />
                    <p className="text-xs text-slate-500">
                      {formatAmount(pool?.totalCollateralLocked ?? 0, 2)} {getTokenSymbol(market.collateralCurrency)} collateralized in escrow
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Utilization</span>
                    <span className="font-medium text-slate-900">{formatPercent(pool?.utilizationRate ?? 0)}</span>
                  </div>
                  <Progress
                    value={(pool?.utilizationRate ?? 0) * 100}
                    className="h-2 bg-slate-200 [&>[data-slot=progress-indicator]]:bg-slate-700"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Borrow APR</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatPercent(pool?.borrowApr ?? market.baseInterestRate ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Supply APY</p>
                    <p className="mt-1 font-semibold text-emerald-600">
                      {formatPercent(pool?.supplyApy ?? positionMetrics?.supplyApy ?? 0)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </section>

          <div className="my-6 h-px bg-slate-200 lg:my-0 lg:mx-8 lg:hidden" />
          <div className="mx-8 hidden w-px self-stretch bg-slate-200 lg:block" />

          <section className="min-w-0 flex-1 lg:basis-1/2">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Supply Actions</h2>

            <Tabs defaultValue="supply" className="w-full">
              <TabsList className="mb-6 !bg-slate-100">
                <TabsTrigger value="supply" className="!text-slate-600 data-[state=active]:!bg-white data-[state=active]:!text-slate-900">
                  Supply
                </TabsTrigger>
                <TabsTrigger value="withdraw" className="!text-slate-600 data-[state=active]:!bg-white data-[state=active]:!text-slate-900">
                  Withdraw
                </TabsTrigger>
              </TabsList>

              <TabsContent value="supply" className="space-y-4">
                <p className="text-sm text-slate-600">
                  Minimum supply is {market.minSupplyAmount} {debtSymbol}.
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
                    onClick={() => {
                      void onSupply();
                    }}
                    disabled={!walletReadyChecked || !walletReady || loadingAction === 'supply'}
                    className="bg-slate-900 text-white hover:bg-slate-800 sm:w-auto"
                  >
                    {loadingAction === 'supply' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <TrendingUp className="mr-2 h-4 w-4" />
                    )}
                    Supply to Pool
                  </Button>
                </div>
                {walletReadyChecked && !walletReady && (
                  <p className="text-xs text-amber-700">You do not have any {debtSymbol} token to lend.</p>
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
                      {formatAmount(positionMetrics?.withdrawableAmount ?? 0, 4)} {debtSymbol}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Pool Liquidity</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatAmount(positionMetrics?.availableLiquidity ?? pool?.availableLiquidity ?? 0, 4)} {debtSymbol}
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:w-40"
                  />
                  <Button
                    onClick={() => {
                      void onWithdrawSupply();
                    }}
                    disabled={!walletReadyChecked || !walletReady || loadingAction === 'withdraw-supply'}
                    variant="outline"
                    className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900"
                  >
                    {loadingAction === 'withdraw-supply' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Withdraw
                  </Button>
                  <Button
                    onClick={() => {
                      void onWithdrawAll();
                    }}
                    disabled={
                      !walletReadyChecked || !walletReady || !position || position.supplyAmount <= 0 || loadingAction === 'withdraw-all'
                    }
                    variant="outline"
                    className="border-rose-300 bg-white text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                  >
                    {loadingAction === 'withdraw-all' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Withdraw Full
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Full position withdraw redeems all vault shares and avoids asset precision mismatch.
                </p>
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
