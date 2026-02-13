'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Shield } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type CollateralState = 'FREE' | 'PLEDGED' | 'FROZEN';

interface InstitutionalMockData {
  asset: {
    name: string;
    jurisdiction: string;
    spvName: string;
    bankruptcyRemote: boolean;
    securityRank: string;
    detailUrl: string;
  };
  valuation: {
    appraisedValue: number;
    loanAmount: number;
    maxLtv: number;
  };
  cashFlow: {
    netAnnualRentalIncome: number;
    annualDebtService: number;
  };
  onChain: {
    collateralState: CollateralState;
    lastVerified: string;
    txHash: string;
    escrowActive: boolean;
    multiSigRequirement: string;
  };
  enforcement: {
    defaultTrigger: string;
    curePeriod: number;
    liquidationJurisdiction: string;
    estimatedRecoveryTime: string;
    estimatedRecoveryRate: string;
  };
  market: {
    averageYield: string;
    expectedCapitalAppreciation: string;
    comparableSalesRange: string;
  };
}

const INSTITUTIONAL_MOCK_DATA: Record<string, InstitutionalMockData> = {
  SAIL: {
    asset: {
      name: 'THE SAIL Hotel Tower',
      jurisdiction: 'Malaysia',
      spvName: 'Laplace SPV-01',
      bankruptcyRemote: true,
      securityRank: '1st Pledge',
      detailUrl: '/hotel/the-sail',
    },
    valuation: {
      appraisedValue: 1_000_000,
      loanAmount: 350_000,
      maxLtv: 0.5,
    },
    cashFlow: {
      netAnnualRentalIncome: 80_000,
      annualDebtService: 15_750,
    },
    onChain: {
      collateralState: 'PLEDGED',
      lastVerified: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      txHash: 'A1B2C3D4E5F6789012345678901234567890ABCDEF1234567890ABCDEF123456',
      escrowActive: true,
      multiSigRequirement: '2-of-3',
    },
    enforcement: {
      defaultTrigger: '30-day payment delay',
      curePeriod: 30,
      liquidationJurisdiction: 'Malaysia',
      estimatedRecoveryTime: '6-9 months',
      estimatedRecoveryRate: '85-95%',
    },
    market: {
      averageYield: '5-8%',
      expectedCapitalAppreciation: '10-30%',
      comparableSalesRange: '$950K-$1.1M',
    },
  },
  NYRA: {
    asset: {
      name: 'NYRA Oceanview Hotel',
      jurisdiction: 'Malaysia',
      spvName: 'Laplace SPV-02',
      bankruptcyRemote: true,
      securityRank: '1st Pledge',
      detailUrl: '/hotel/nyra',
    },
    valuation: {
      appraisedValue: 1_500_000,
      loanAmount: 480_000,
      maxLtv: 0.5,
    },
    cashFlow: {
      netAnnualRentalIncome: 120_000,
      annualDebtService: 21_600,
    },
    onChain: {
      collateralState: 'PLEDGED',
      lastVerified: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      txHash: 'B2C3D4E5F6789012345678901234567890ABCDEF1234567890ABCDEF1234567',
      escrowActive: true,
      multiSigRequirement: '2-of-3',
    },
    enforcement: {
      defaultTrigger: '30-day payment delay',
      curePeriod: 30,
      liquidationJurisdiction: 'Malaysia',
      estimatedRecoveryTime: '6-9 months',
      estimatedRecoveryRate: '85-95%',
    },
    market: {
      averageYield: '8%',
      expectedCapitalAppreciation: '15-35%',
      comparableSalesRange: '$1.4M-$1.6M',
    },
  },
};

interface InstitutionalUnderwritingProps {
  selectedMarketName?: string;
  selectedMarketId?: string;
  collateralCurrency?: string;
  explorerUrl?: string;
}

interface EscrowRow {
  escrowOwner: string;
  collateralAmount: number;
  collateralCurrency: string;
  txHash: string | null;
}

function truncateMiddle(value: string, left = 8, right = 6): string {
  if (value.length <= left + right + 3) {
    return value;
  }

  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

export function InstitutionalUnderwriting({
  selectedMarketName,
  selectedMarketId,
  collateralCurrency,
  explorerUrl,
}: InstitutionalUnderwritingProps) {
  const [escrows, setEscrows] = useState<EscrowRow[]>([]);
  const [escrowsLoading, setEscrowsLoading] = useState(false);
  const [escrowsError, setEscrowsError] = useState('');

  const currentMockData = useMemo(() => {
    if (!selectedMarketName) return INSTITUTIONAL_MOCK_DATA.SAIL;
    const marketKey = selectedMarketName.split('-')[0] as keyof typeof INSTITUTIONAL_MOCK_DATA;
    return INSTITUTIONAL_MOCK_DATA[marketKey] ?? INSTITUTIONAL_MOCK_DATA.SAIL;
  }, [selectedMarketName]);

  const underwritingDerived = useMemo(() => {
    const currentLtv = currentMockData.valuation.loanAmount / currentMockData.valuation.appraisedValue;
    const collateralBuffer = currentMockData.valuation.maxLtv - currentLtv;
    const dscr = currentMockData.cashFlow.netAnnualRentalIncome / currentMockData.cashFlow.annualDebtService;

    return {
      currentLtv,
      collateralBuffer,
      dscr,
    };
  }, [currentMockData]);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }),
    []
  );

  const onChainBadgeClassName =
    currentMockData.onChain.collateralState === 'PLEDGED'
      ? 'bg-emerald-600 text-white'
      : currentMockData.onChain.collateralState === 'FROZEN'
        ? 'bg-amber-600 text-white'
        : 'bg-slate-500 text-white';

  const underwritingLtvPercent = Math.max(0, Math.min(100, underwritingDerived.currentLtv * 100));
  const underwritingMaxLtvPercent = Math.max(0, Math.min(100, currentMockData.valuation.maxLtv * 100));
  const explorerBaseUrl = explorerUrl?.trim() || null;
  const collateralAmountFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      }),
    []
  );

  useEffect(() => {
    const abortController = new AbortController();

    async function loadEscrows() {
      setEscrowsLoading(true);
      setEscrowsError('');

      try {
        const params = new URLSearchParams();
        if (selectedMarketId) {
          params.set('marketId', selectedMarketId);
        }

        const query = params.toString();
        const response = await fetch(query ? `/api/lending/escrows?${query}` : '/api/lending/escrows', {
          signal: abortController.signal,
        });
        const payload = await response.json();

        if (!response.ok || !payload.success) {
          throw new Error(payload.error?.message ?? 'Failed to load active escrows');
        }

        const rows = Array.isArray(payload.data?.escrows) ? payload.data.escrows : [];
        setEscrows(rows.slice(0, 10));
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setEscrows([]);
        setEscrowsError(error instanceof Error ? error.message : 'Failed to load active escrows');
      } finally {
        if (!abortController.signal.aborted) {
          setEscrowsLoading(false);
        }
      }
    }

    loadEscrows();

    return () => {
      abortController.abort();
    };
  }, [selectedMarketId]);

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="rounded-lg bg-slate-100 p-2">
          <Shield className="h-4 w-4 text-slate-700" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Institutional Credit Underwriting</h2>
          <p className="mt-1 text-sm text-slate-600">Due diligence information for institutional investors</p>
        </div>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Credit Underwriting Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-900">Asset &amp; Legal Structure</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Asset Name</p>
                <Link href={currentMockData.asset.detailUrl} className="mt-1 block text-sm font-semibold text-blue-700 hover:underline">
                  {currentMockData.asset.name}
                </Link>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Jurisdiction</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currentMockData.asset.jurisdiction}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">SPV Name</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currentMockData.asset.spvName}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Bankruptcy-Remote</p>
                <Badge className={`mt-2 ${currentMockData.asset.bankruptcyRemote ? 'bg-emerald-600 text-white' : 'bg-rose-500 text-white'}`}>
                  {currentMockData.asset.bankruptcyRemote ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Security Rank</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currentMockData.asset.securityRank}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-900">Valuation &amp; LTV</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Appraised Value</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currencyFormatter.format(currentMockData.valuation.appraisedValue)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Loan Amount</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currencyFormatter.format(currentMockData.valuation.loanAmount)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Current LTV</p>
                <p className="mt-1 text-lg font-semibold text-emerald-600">{(underwritingDerived.currentLtv * 100).toFixed(0)}%</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Max LTV</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{(currentMockData.valuation.maxLtv * 100).toFixed(0)}%</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Collateral Buffer</p>
                <p className="mt-1 text-lg font-semibold text-emerald-600">{(underwritingDerived.collateralBuffer * 100).toFixed(0)}%</p>
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
                <span>Current LTV</span>
                <span>Max LTV: {underwritingMaxLtvPercent.toFixed(0)}%</span>
              </div>
              <div className="relative h-2 rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${underwritingLtvPercent}%` }} />
                <div
                  className="pointer-events-none absolute -top-1 h-4 w-0.5 bg-slate-500"
                  style={{ left: `${underwritingMaxLtvPercent}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-900">Cash Flow &amp; DSCR</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Net Annual Rental Income</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {currencyFormatter.format(currentMockData.cashFlow.netAnnualRentalIncome)}/yr
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Annual Debt Service</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {currencyFormatter.format(currentMockData.cashFlow.annualDebtService)}/yr
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">DSCR</p>
                <p className="mt-1 text-lg font-semibold text-emerald-600">{underwritingDerived.dscr.toFixed(2)}x</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base text-slate-900">On-Chain Collateral Verification</CardTitle>
          <Badge className="bg-emerald-600 text-white">On-chain Verified</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/70 p-3">
              <p className="text-xs text-slate-500">Collateral State</p>
              <Badge className={`mt-2 ${onChainBadgeClassName}`}>{currentMockData.onChain.collateralState}</Badge>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="text-xs text-slate-500">Last Verified</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{new Date(currentMockData.onChain.lastVerified).toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="text-xs text-slate-500">Multi-Sig Requirement</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{currentMockData.onChain.multiSigRequirement}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-emerald-100 bg-white/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Active Escrows</p>

            {escrowsLoading ? (
              <div className="mt-3 space-y-2">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="h-9 animate-pulse rounded-md bg-slate-100" />
                ))}
              </div>
            ) : escrowsError ? (
              <p className="mt-3 text-sm text-rose-700">Could not load escrows: {escrowsError}</p>
            ) : escrows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No active escrows.</p>
            ) : (
              <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Wallet</th>
                      <th className="px-3 py-2 font-medium">Collateral</th>
                      <th className="px-3 py-2 font-medium">EscrowCreate Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {escrows.map((escrow, index) => {
                      const tokenSymbol = escrow.collateralCurrency || collateralCurrency || 'N/A';

                      return (
                        <tr key={`${escrow.escrowOwner}-${index}`} className="border-t border-slate-100 bg-white">
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">{truncateMiddle(escrow.escrowOwner, 10, 8)}</td>
                          <td className="px-3 py-2 text-slate-800">
                            {collateralAmountFormatter.format(escrow.collateralAmount)} {tokenSymbol}
                          </td>
                          <td className="px-3 py-2">
                            {escrow.txHash && explorerBaseUrl ? (
                              <a
                                href={`${explorerBaseUrl}/transactions/${escrow.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                              >
                                {truncateMiddle(escrow.txHash, 10, 8)}
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : escrow.txHash ? (
                              <span className="font-mono text-xs text-slate-600">{truncateMiddle(escrow.txHash, 10, 8)}</span>
                            ) : (
                              <span className="text-slate-500">Not available</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Risk &amp; Recovery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-900">Default &amp; Enforcement</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Default Trigger</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{currentMockData.enforcement.defaultTrigger}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Cure Period</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currentMockData.enforcement.curePeriod} days</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Liquidation Jurisdiction</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currentMockData.enforcement.liquidationJurisdiction}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Estimated Recovery Time</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currentMockData.enforcement.estimatedRecoveryTime}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Estimated Recovery Rate</p>
                <p className="mt-1 text-lg font-semibold text-emerald-600">{currentMockData.enforcement.estimatedRecoveryRate}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-900">Market Reference</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Average Yield</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currentMockData.market.averageYield}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Expected Capital Appreciation</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currentMockData.market.expectedCapitalAppreciation}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Comparable Sales Range</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currentMockData.market.comparableSalesRange}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
