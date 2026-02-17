import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield } from 'lucide-react';

import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

import type { Market, Position, PositionMetrics } from '../types';

interface PositionCardProps {
  isLoading: boolean;
  market: Market;
  position: Position | null;
  metrics: PositionMetrics | null;
}

export function PositionCard({ isLoading, market, position, metrics }: PositionCardProps) {
  return (
    <Card className="border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Your Position
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-[64px] rounded-lg" />
              <Skeleton className="h-[64px] rounded-lg" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          </div>
        ) : !position || !metrics ? (
          <p className="text-zinc-600 dark:text-zinc-400">No active position yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Collateral</p>
                <p className="font-semibold">
                  {position.collateralAmount.toFixed(2)} {getTokenSymbol(market.collateralCurrency)}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Total Debt</p>
                <p className="font-semibold">
                  {metrics.totalDebt.toFixed(2)} {getTokenSymbol(market.debtCurrency)}
                </p>
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-600">
                <span>Current LTV</span>
                <span>{(metrics.currentLtv * 100).toFixed(2)}%</span>
              </div>
              <Progress
                value={Math.min((metrics.currentLtv / market.liquidationLtvRatio) * 100, 100)}
                className="h-1.5 bg-zinc-200 dark:bg-zinc-800"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
