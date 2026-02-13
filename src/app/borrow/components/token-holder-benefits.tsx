'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ExternalLink, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

interface TokenHolderMockData {
  property: {
    name: string;
    detailUrl: string;
  };
  tokenEconomics: {
    tokenSymbol: string;
    totalSupply: number;
    netAnnualRentalIncome: number;
    yieldPerToken: number;
    distributionFrequency: string;
    lastDistributionDate: string;
    nextDistributionDate: string;
    distributionStartDate: string;
  };
  benefits: {
    rentalDistribution: boolean;
    propertyAppreciation: boolean;
    votingRights: boolean;
    priorityAccess: boolean;
  };
}

interface DistributionHistoryPoint {
  week: string;
  amount: number;
  date: string;
}

function buildDistributionProjection(estimatedAnnualEarnings: number, distributionStartDate: string, weeks = 35) {
  const weeklyEarnings = estimatedAnnualEarnings / 52;
  const startDate = new Date(distributionStartDate);
  const seedSource = `${estimatedAnnualEarnings.toFixed(4)}-${distributionStartDate}-${weeks}`;
  const baseSeed = Array.from(seedSource).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0) >>> 0;

  const randomAt = (index: number) => {
    let seed = (baseSeed + index * 0x9e3779b9) >>> 0;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 10_000) / 10_000;
  };

  const rawWeights = Array.from({ length: weeks }, (_, i) => {
    const seasonal = 1 + 0.08 * Math.sin(i * 0.7) + 0.04 * Math.cos(i * 0.31);
    const randomJitter = 0.96 + randomAt(i) * 0.18;
    return seasonal * randomJitter;
  });
  const meanWeight = rawWeights.reduce((sum, weight) => sum + weight, 0) / weeks;

  const distributionHistory: DistributionHistoryPoint[] = rawWeights.map((weight, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i * 7);

    const normalizedWeight = weight / meanWeight;
    const amount = Math.round(weeklyEarnings * normalizedWeight * 100) / 100;

    return {
      week: `W${i + 1}`,
      amount,
      date: date.toISOString().split('T')[0],
    };
  });

  const totalDistributed = distributionHistory.reduce((sum, week) => sum + week.amount, 0);
  const averageWeeklyDistribution = distributionHistory.length ? totalDistributed / distributionHistory.length : 0;

  return {
    weeklyEarnings,
    distributionHistory,
    averageWeeklyDistribution,
    totalDistributed,
  };
}

const TOKEN_HOLDER_MOCK_DATA: Record<string, TokenHolderMockData> = {
  SAIL: {
    property: {
      name: 'THE SAIL Hotel Tower',
      detailUrl: '/hotel/the-sail',
    },
    tokenEconomics: {
      tokenSymbol: 'SAIL',
      totalSupply: 10_000,
      netAnnualRentalIncome: 80_000,
      yieldPerToken: 8,
      distributionFrequency: 'Weekly',
      lastDistributionDate: '2026-02-09',
      nextDistributionDate: '2026-02-16',
      distributionStartDate: '2025-06-01',
    },
    benefits: {
      rentalDistribution: true,
      propertyAppreciation: true,
      votingRights: true,
      priorityAccess: true,
    },
  },
  NYRA: {
    property: {
      name: 'NYRA Oceanview Hotel',
      detailUrl: '/hotel/nyra',
    },
    tokenEconomics: {
      tokenSymbol: 'NYRA',
      totalSupply: 15_000,
      netAnnualRentalIncome: 120_000,
      yieldPerToken: 8,
      distributionFrequency: 'Weekly',
      lastDistributionDate: '2026-02-09',
      nextDistributionDate: '2026-02-16',
      distributionStartDate: '2025-06-01',
    },
    benefits: {
      rentalDistribution: true,
      propertyAppreciation: true,
      votingRights: true,
      priorityAccess: true,
    },
  },
};

interface TokenHolderBenefitsProps {
  selectedMarketName?: string;
  explorerUrl?: string;
  walletBalance: number;
  collateralDeposited: number;
}

export function TokenHolderBenefits({ selectedMarketName, explorerUrl, walletBalance, collateralDeposited }: TokenHolderBenefitsProps) {
  const currentMockData = useMemo(() => {
    if (!selectedMarketName) return TOKEN_HOLDER_MOCK_DATA.SAIL;
    const marketKey = selectedMarketName.split('-')[0] as keyof typeof TOKEN_HOLDER_MOCK_DATA;
    return TOKEN_HOLDER_MOCK_DATA[marketKey] ?? TOKEN_HOLDER_MOCK_DATA.SAIL;
  }, [selectedMarketName]);

  const totalTokenHoldings = walletBalance + collateralDeposited;
  const estimatedAnnualEarnings = currentMockData.tokenEconomics.yieldPerToken * totalTokenHoldings;
  const { weeklyEarnings, distributionHistory, averageWeeklyDistribution, totalDistributed } = useMemo(
    () => buildDistributionProjection(estimatedAnnualEarnings, currentMockData.tokenEconomics.distributionStartDate, 35),
    [estimatedAnnualEarnings, currentMockData.tokenEconomics.distributionStartDate]
  );

  const distributionChartConfig = {
    distribution: {
      label: 'Distribution',
      color: '#10b981',
    },
  } satisfies ChartConfig;

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }),
    []
  );

  const earningsFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800">
          <Sparkles className="h-4 w-4 text-zinc-700 dark:text-zinc-200" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Your Token Holder Benefits</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">How your collateral tokens can generate value while you borrow</p>
        </div>
      </div>

      <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
        <CardHeader>
          <CardTitle className="text-base text-zinc-900 dark:text-zinc-100">Property Earnings Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Property</p>
              <Link href={currentMockData.property.detailUrl} className="mt-1 block text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">
                {currentMockData.property.name}
              </Link>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Net Annual Rental Income</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {currencyFormatter.format(currentMockData.tokenEconomics.netAnnualRentalIncome)}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Token Supply</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {currentMockData.tokenEconomics.totalSupply.toLocaleString()} {currentMockData.tokenEconomics.tokenSymbol}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Yield per Token</p>
              <p className="mt-1 text-lg font-semibold text-emerald-600">
                {currencyFormatter.format(currentMockData.tokenEconomics.yieldPerToken)}/yr
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Distribution</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{currentMockData.tokenEconomics.distributionFrequency}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Last Distribution Date</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {dateFormatter.format(new Date(currentMockData.tokenEconomics.lastDistributionDate))}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Next Distribution Date</p>
                {explorerUrl ? (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline dark:text-blue-400"
                  >
                    Explorer
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {dateFormatter.format(new Date(currentMockData.tokenEconomics.nextDistributionDate))}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Distribution Started</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {dateFormatter.format(new Date(currentMockData.tokenEconomics.distributionStartDate))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-sm dark:border-emerald-900/50 dark:from-emerald-950/50 dark:to-zinc-900/70">
        <CardHeader>
          <CardTitle className="text-base text-zinc-900 dark:text-zinc-100">Your Earnings Estimate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-white/70 p-3 dark:bg-zinc-900/70">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Holdings</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">(wallet balance + collateral)</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {totalTokenHoldings.toLocaleString(undefined, { maximumFractionDigits: 4 })} {currentMockData.tokenEconomics.tokenSymbol}
              </p>
            </div>
            <div className="rounded-xl bg-white/70 p-3 dark:bg-zinc-900/70">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Yield per Token</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {currencyFormatter.format(currentMockData.tokenEconomics.yieldPerToken)}/yr
              </p>
            </div>
            <div className="rounded-xl bg-white/70 p-3 dark:bg-zinc-900/70">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Estimated Annual Earnings</p>
              <p className="mt-1 text-lg font-semibold text-emerald-600">{earningsFormatter.format(estimatedAnnualEarnings)}</p>
            </div>
            <div className="rounded-xl bg-white/70 p-3 dark:bg-zinc-900/70">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Estimated Weekly Earnings</p>
              <p className="mt-1 text-lg font-semibold text-emerald-600">{earningsFormatter.format(weeklyEarnings)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
        <CardHeader>
          <CardTitle className="text-base text-zinc-900 dark:text-zinc-100">Distribution History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChartContainer config={distributionChartConfig} className="h-[200px] w-full">
            <BarChart data={distributionHistory}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="week" tickLine={false} axisLine={false} interval={4} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
              <ChartTooltip
                content={<ChartTooltipContent />}
                labelFormatter={(label, payload) => {
                  const date = payload?.[0]?.payload?.date;
                  return date ? `${label} (${dateFormatter.format(new Date(date))})` : label;
                }}
                formatter={(value: number) => [earningsFormatter.format(value), 'Distribution']}
              />
              <Bar dataKey="amount" fill="var(--color-distribution)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ChartContainer>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Average Weekly Distribution</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{earningsFormatter.format(averageWeeklyDistribution)}</p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Distributed (35 weeks)</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{earningsFormatter.format(totalDistributed)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
        <CardHeader>
          <CardTitle className="text-base text-zinc-900 dark:text-zinc-100">Token Holder Rights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Rental Distribution</p>
              <Badge className={`mt-2 ${currentMockData.benefits.rentalDistribution ? 'bg-emerald-600 text-white' : 'bg-rose-500 text-white'}`}>
                {currentMockData.benefits.rentalDistribution ? 'Eligible' : 'Not available'}
              </Badge>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Property Appreciation</p>
              <Badge className={`mt-2 ${currentMockData.benefits.propertyAppreciation ? 'bg-emerald-600 text-white' : 'bg-rose-500 text-white'}`}>
                {currentMockData.benefits.propertyAppreciation ? 'Eligible' : 'Not available'}
              </Badge>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Voting Rights</p>
              <Badge className={`mt-2 ${currentMockData.benefits.votingRights ? 'bg-emerald-600 text-white' : 'bg-rose-500 text-white'}`}>
                {currentMockData.benefits.votingRights ? 'Eligible' : 'Not available'}
              </Badge>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Priority Access</p>
              <Badge className={`mt-2 ${currentMockData.benefits.priorityAccess ? 'bg-emerald-600 text-white' : 'bg-rose-500 text-white'}`}>
                {currentMockData.benefits.priorityAccess ? 'Eligible' : 'Not available'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
