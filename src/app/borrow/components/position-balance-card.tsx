import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw } from 'lucide-react';

import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

import type { Market, Position, PositionMetrics } from '../types';

interface PositionBalanceCardProps {
  market: Market;
  position: Position | null;
  metrics: PositionMetrics | null;
  positionLoading: boolean;
  balancesLoading: boolean;
  getBalance: (symbol: string, issuer?: string) => number;
  onRefresh: () => void;
}

export function PositionBalanceCard({
  market,
  position,
  metrics,
  positionLoading,
  balancesLoading,
  getBalance,
  onRefresh,
}: PositionBalanceCardProps) {
  const collateralSymbol = getTokenSymbol(market.collateralCurrency);
  const debtSymbol = getTokenSymbol(market.debtCurrency);

  const hasPosition = Boolean(position && metrics);
  const collateralPositionAmount = hasPosition ? (position?.collateralAmount ?? 0).toFixed(2) : '0.00';
  const debtPositionAmount = hasPosition ? (metrics?.totalDebt ?? 0).toFixed(2) : '0.00';

  return (
    <Card className="border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Position &amp; Balance</CardTitle>
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        <div className="overflow-hidden rounded-lg border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <div className="grid grid-cols-2 border-b border-zinc-300 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700">
            <p className="px-4 py-2">Position</p>
            <p className="border-l border-zinc-300 px-4 py-2 dark:border-zinc-700">Balance</p>
          </div>

          <div className="grid grid-cols-2">
            <div className="space-y-3 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Collateral</p>
              {positionLoading ? <Skeleton className="h-5 w-24" /> : <p className="font-semibold">{collateralPositionAmount} {collateralSymbol}</p>}
            </div>

            <div className="space-y-3 border-l border-zinc-300 px-4 py-3 dark:border-zinc-700">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Wallet</p>
              {balancesLoading ? (
                <Skeleton className="h-5 w-24" />
              ) : (
                <p className="font-semibold">{getBalance(market.collateralCurrency, market.collateralIssuer).toFixed(2)} {collateralSymbol}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-zinc-300 dark:border-zinc-700">
            <div className="space-y-3 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Loan</p>
              {positionLoading ? <Skeleton className="h-5 w-24" /> : <p className="font-semibold">{debtPositionAmount} {debtSymbol}</p>}
            </div>

            <div className="space-y-3 border-l border-zinc-300 px-4 py-3 dark:border-zinc-700">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Wallet</p>
              {balancesLoading ? (
                <Skeleton className="h-5 w-24" />
              ) : (
                <p className="font-semibold">{getBalance(market.debtCurrency, market.debtIssuer).toFixed(2)} {debtSymbol}</p>
              )}
            </div>
          </div>
        </div>

        {positionLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-1.5 w-full" />
          </div>
        ) : hasPosition && metrics ? (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <span>Current LTV</span>
              <span>{(metrics.currentLtv * 100).toFixed(2)}%</span>
            </div>
            <Progress
              value={Math.min((metrics.currentLtv / market.liquidationLtvRatio) * 100, 100)}
              className="h-1.5 bg-zinc-200 dark:bg-zinc-800"
            />
          </div>
        ) : (
          <p className="text-zinc-600 dark:text-zinc-400">No active position yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
