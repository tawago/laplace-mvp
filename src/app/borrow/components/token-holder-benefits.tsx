'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  };
  benefits: {
    rentalDistribution: boolean;
    propertyAppreciation: boolean;
    votingRights: boolean;
    priorityAccess: boolean;
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
      distributionFrequency: 'Quarterly',
      lastDistributionDate: '2025-12-15',
      nextDistributionDate: '2026-03-15',
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
      distributionFrequency: 'Quarterly',
      lastDistributionDate: '2025-12-20',
      nextDistributionDate: '2026-03-20',
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
  const estimatedQuarterlyEarnings = estimatedAnnualEarnings / 4;

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
                {new Date(currentMockData.tokenEconomics.lastDistributionDate).toLocaleDateString()}
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
                {new Date(currentMockData.tokenEconomics.nextDistributionDate).toLocaleDateString()}
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
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Estimated Quarterly Earnings</p>
              <p className="mt-1 text-lg font-semibold text-emerald-600">{earningsFormatter.format(estimatedQuarterlyEarnings)}</p>
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
