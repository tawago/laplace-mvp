import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

import type { MarketConfig, SupplyPosition, SupplyPositionMetrics } from '../types';

interface SupplyPositionCardProps {
  isLoading: boolean;
  walletReady: boolean;
  walletReadyChecked: boolean;
  market: MarketConfig;
  position: SupplyPosition | null;
  positionMetrics: SupplyPositionMetrics | null;
  shareBalance: string;
  formatAmount: (value: number, decimals?: number) => string;
  normalizeShares: (rawShares: string, scale: number) => number;
}

export function SupplyPositionCard({
  isLoading,
  walletReady,
  walletReadyChecked,
  market,
  position,
  positionMetrics,
  shareBalance,
  formatAmount,
  normalizeShares,
}: SupplyPositionCardProps) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">Your Supply Position</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!walletReadyChecked || isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            <Skeleton tone="light" className="h-20 rounded-xl" />
            <Skeleton tone="light" className="h-20 rounded-xl" />
            <Skeleton tone="light" className="h-20 rounded-xl" />
          </div>
        ) : !walletReady ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            You do not have any RLUSD token to lend.
          </div>
        ) : !position || !positionMetrics ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No active supply position yet. Use the Supply tab to open one.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Principal</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {formatAmount(position.supplyAmount, 4)} {getTokenSymbol(market.debtCurrency)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Earnings</p>
              <p className="mt-1 text-lg font-semibold text-emerald-600">
                {formatAmount(positionMetrics.accruedYield, 4)} {getTokenSymbol(market.debtCurrency)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Share</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {formatAmount(normalizeShares(shareBalance, market.vaultScale), 4)} shares
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
