import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

import type { MarketConfig, PoolMetrics } from '../types';

interface PoolOverviewCardProps {
  isLoading: boolean;
  pool: PoolMetrics | null;
  market: MarketConfig;
  formatAmount: (value: number, decimals?: number) => string;
  formatPercent: (value: number) => string;
}

export function PoolOverviewCard({ isLoading, pool, market, formatAmount, formatPercent }: PoolOverviewCardProps) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">Pool Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
                  {formatAmount(pool?.totalSupplied ?? 0, 2)} {getTokenSymbol(market.debtCurrency)}
                </p>
                <div className="my-2 h-px bg-zinc-300" />
                <p className="text-xs text-slate-500">
                  {formatAmount(pool?.totalShares ?? 0, 2)} total shares
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Total Borrowed</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatAmount(pool?.totalBorrowed ?? 0, 2)} {getTokenSymbol(market.debtCurrency)}
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
                <p className="mt-1 font-semibold text-emerald-600">{formatPercent(pool?.supplyApy ?? 0)}</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
