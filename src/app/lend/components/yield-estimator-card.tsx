'use client';

import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';

import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

import type { MarketConfig, PoolMetrics, SupplyPosition, SupplyPositionMetrics } from '../types';

const yieldProjectionChartConfig = {
  principalBase: {
    label: 'Principal',
    color: '#3b82f6',
  },
  yieldAccrued: {
    label: 'Accumulated Yield',
    color: '#bfdbfe',
  },
} satisfies ChartConfig;

interface YieldEstimatorCardProps {
  market: MarketConfig;
  pool: PoolMetrics | null;
  position: SupplyPosition | null;
  positionMetrics: SupplyPositionMetrics | null;
  isLoading: boolean;
  formatAmount: (value: number, decimals?: number) => string;
  formatPercent: (value: number) => string;
}

function projectTotal(principal: number, annualRate: number, month: number): number {
  return principal * Math.pow(1 + annualRate, month / 12);
}

export function YieldEstimatorCard({
  market,
  pool,
  position,
  positionMetrics,
  isLoading,
  formatAmount,
  formatPercent,
}: YieldEstimatorCardProps) {
  const debtSymbol = getTokenSymbol(market.debtCurrency);
  const [supplyAmount, setSupplyAmount] = useState('1000');
  const [durationMonths, setDurationMonths] = useState<number>(24);
  const borrowApy = pool?.borrowApr ?? market.baseInterestRate ?? positionMetrics?.supplyApy ?? 0;
  const hasActivePosition = Boolean(position && position.supplyAmount > 0);
  const typedPrincipal = Number(supplyAmount);
  const effectivePrincipal = hasActivePosition
    ? (position?.supplyAmount ?? 0)
    : (Number.isFinite(typedPrincipal) && typedPrincipal > 0 ? typedPrincipal : 0);

  const projection = useMemo(() => {
    if (!Number.isFinite(effectivePrincipal) || effectivePrincipal <= 0) {
      return {
        principal: 0,
        estimatedYield: 0,
        totalProjectedValue: 0,
      };
    }

    const totalProjectedValue = projectTotal(effectivePrincipal, borrowApy, durationMonths);
    const estimatedYield = Math.max(totalProjectedValue - effectivePrincipal, 0);

    return {
      principal: effectivePrincipal,
      estimatedYield,
      totalProjectedValue,
    };
  }, [borrowApy, durationMonths, effectivePrincipal]);

  const projectionSeries = useMemo(() => {
    if (projection.principal <= 0) return [];

    return Array.from({ length: durationMonths }, (_, index) => {
      const month = index + 1;
      const borrowProjectedTotal = projectTotal(projection.principal, borrowApy, month);

      return {
        monthLabel: `M${month}`,
        principalBase: projection.principal,
        yieldAccrued: Math.max(borrowProjectedTotal - projection.principal, 0),
      };
    });
  }, [borrowApy, durationMonths, projection.principal]);

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">
          {hasActivePosition ? 'Projected Yield' : 'Yield Estimator'}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton tone="light" className="h-10 w-full rounded-lg" />
            <Skeleton tone="light" className="h-10 w-full rounded-lg" />
            <Skeleton tone="light" className="h-[220px] w-full rounded-xl" />
            <Skeleton tone="light" className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {!hasActivePosition ? (
                <div className="space-y-2">
                  <label htmlFor="yield-estimator-amount" className="text-xs uppercase tracking-wide text-slate-500">
                    Supply Amount
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="yield-estimator-amount"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={supplyAmount}
                      onChange={(event) => setSupplyAmount(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                    <span className="text-sm text-slate-600">{debtSymbol}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Active Position Principal</p>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
                    {formatAmount(position?.supplyAmount ?? 0, 2)} {debtSymbol}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="yield-estimator-duration" className="text-xs uppercase tracking-wide text-slate-500">
                  Duration (Months)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="yield-estimator-duration"
                    type="number"
                    min={1}
                    max={360}
                    step={1}
                    value={durationMonths}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      if (!Number.isFinite(parsed)) {
                        setDurationMonths(1);
                        return;
                      }
                      const clamped = Math.min(360, Math.max(1, Math.floor(parsed)));
                      setDurationMonths(clamped);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  <span className="text-sm text-slate-600">months</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              {hasActivePosition ? 'Projected earnings use your active supplied principal. ' : ''}
              Projection uses current borrow APY of {formatPercent(borrowApy)}.
            </p>

            {projectionSeries.length > 0 ? (
              <ChartContainer config={yieldProjectionChartConfig} className="h-[220px] w-full rounded-xl border border-slate-200 bg-white px-2 py-3">
                <ComposedChart data={projectionSeries} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(value: number) => value.toFixed(0)} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          const numericValue = Number(value);
                          return (
                            <div className="flex w-full items-center justify-between gap-3">
                              <span>{name}</span>
                              <span className="font-mono tabular-nums">
                                {Number.isFinite(numericValue) ? numericValue.toFixed(4) : '0.0000'} {debtSymbol}
                              </span>
                            </div>
                          );
                        }}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent className="text-slate-700" />} />

                  <Bar dataKey="principalBase" stackId="value" fill="var(--color-principalBase)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="yieldAccrued" stackId="value" fill="var(--color-yieldAccrued)" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ChartContainer>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                {hasActivePosition ? 'No active projection data available yet.' : 'Enter a supply amount to render projected growth.'}
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Principal</span>
                <span className="font-semibold text-slate-900">
                  {formatAmount(projection.principal, 2)} {debtSymbol}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-600">Estimated Yield</span>
                <span className="font-semibold text-emerald-600">
                  {formatAmount(projection.estimatedYield, 2)} {debtSymbol}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-600">Total Projected Value</span>
                <span className="font-semibold text-slate-900">
                  {formatAmount(projection.totalProjectedValue, 2)} {debtSymbol}
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
