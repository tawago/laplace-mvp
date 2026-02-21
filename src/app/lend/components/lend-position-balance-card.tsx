import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

import type { MarketConfig, SupplyPosition, SupplyPositionMetrics } from '../types';

interface LendPositionBalanceCardProps {
  market: MarketConfig;
  position: SupplyPosition | null;
  positionMetrics: SupplyPositionMetrics | null;
  totalSupplied: number;
  walletBalance: number;
  shareBalance: string;
  isLoading: boolean;
  walletReady: boolean;
  walletReadyChecked: boolean;
  formatAmount: (value: number, decimals?: number) => string;
  normalizeShares: (rawShares: string, scale: number) => number;
}

export function LendPositionBalanceCard({
  market,
  position,
  positionMetrics,
  totalSupplied,
  walletBalance,
  shareBalance,
  isLoading,
  walletReady,
  walletReadyChecked,
  formatAmount,
  normalizeShares,
}: LendPositionBalanceCardProps) {
  const debtSymbol = getTokenSymbol(market.debtCurrency);
  const hasPosition = Boolean(position && positionMetrics);
  const normalizedShareBalance = normalizeShares(shareBalance, market.vaultScale);
  const poolSharePercent =
    position && poolAndFinite(position.supplyAmount) && totalSupplied > 0
      ? Math.min((position.supplyAmount / totalSupplied) * 100, 100)
      : 0;

  const renderBalanceCell = (value: string) => {
    if (!walletReadyChecked || isLoading) {
      return <Skeleton tone="light" className="h-5 w-28" />;
    }

    return <p className="font-semibold text-slate-900">{value}</p>;
  };

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">Position &amp; Balance</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {!walletReadyChecked || isLoading ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="grid grid-cols-2 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <p className="px-4 py-2">Position</p>
              <p className="border-l border-slate-200 px-4 py-2">Balance</p>
            </div>

            {Array.from({ length: 2 }).map((_, index) => (
              <div key={`lend-position-row-skeleton-${index}`} className="grid grid-cols-2 border-t border-slate-200 first:border-t-0">
                <div className="space-y-2 px-4 py-3">
                  <Skeleton tone="light" className="h-4 w-24" />
                </div>
                <div className="space-y-2 border-l border-slate-200 px-4 py-3">
                  <Skeleton tone="light" className="h-4 w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : !walletReady ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            You do not have any {debtSymbol} token to lend.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="grid grid-cols-2 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <p className="px-4 py-2">Position</p>
                <p className="border-l border-slate-200 px-4 py-2">Balance</p>
              </div>

              <div className="grid grid-cols-2 border-t border-slate-200 first:border-t-0">
                <div className="px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Principal</p>
                  <p className="mt-2 font-semibold text-slate-900">{formatAmount(position?.supplyAmount ?? 0, 2)} {debtSymbol}</p>
                </div>
                <div className="border-l border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Wallet Balance</p>
                  <div className="mt-2">{renderBalanceCell(`${formatAmount(walletBalance, 2)} ${debtSymbol}`)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 border-t border-slate-200">
                <div className="px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Accrued Yield</p>
                  <p className="mt-2 font-semibold text-slate-900">{formatAmount(positionMetrics?.accruedYield ?? 0, 2)} {debtSymbol}</p>
                </div>
                <div className="border-l border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Vault Shares</p>
                  <div className="mt-2">{renderBalanceCell(`${formatAmount(normalizedShareBalance, 2)} shares`)}</div>
                </div>
              </div>
            </div>

            {hasPosition ? (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                  <span>Estimated Position Share</span>
                  <span>{poolSharePercent.toFixed(2)}%</span>
                </div>
                <Progress value={poolSharePercent} className="h-1.5 bg-slate-200 [&>[data-slot=progress-indicator]]:bg-slate-700" />
              </div>
            ) : (
              <p className="text-slate-500">No active supply position yet.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function poolAndFinite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
