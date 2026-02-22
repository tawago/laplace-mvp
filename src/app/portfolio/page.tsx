'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  Wallet, 
  DollarSign, 
  Building2,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Shield,
  Copy,
  Landmark
} from 'lucide-react';
import { TokenPurchase } from '@/types/hotel';
import { useAuth } from '@/contexts/auth-context';
import { useWallet } from '@/contexts/wallet-context';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { PortfolioOverviewCard } from '@/components/portfolio-overview-card';

interface PortfolioHolding extends TokenPurchase {
  currentValue: number;
}

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<PortfolioHolding[]>([]);
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(true);
  const { user } = useAuth();
  const { address } = useWallet();
  
  useEffect(() => {
    const activeAddress = address ?? user?.wallet.address;
    if (!activeAddress) {
      setPortfolio([]);
      setIsPortfolioLoading(false);
      return;
    }

    const loadPortfolio = async () => {
      setIsPortfolioLoading(true);
      try {
        const response = await fetch(`/api/portfolio?address=${activeAddress}`);
        const payload = await response.json();

        if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
          throw new Error(payload?.error ?? 'Failed to load portfolio');
        }

        const next = payload.data.map((entry: PortfolioHolding & { purchaseDate: string }) => ({
          ...entry,
          purchaseDate: new Date(entry.purchaseDate),
        }));
        setPortfolio(next);
      } catch {
        setPortfolio([]);
      } finally {
        setIsPortfolioLoading(false);
      }
    };

    void loadPortfolio();
  }, [address, user?.wallet.address]);

  const totalInvested = portfolio.reduce((sum, p) => sum + p.totalPrice, 0);
  const totalTokens = portfolio.reduce((sum, p) => sum + p.tokenAmount, 0);
  const estimatedAnnualReturn = portfolio.reduce((sum, p) => sum + (p.totalPrice * p.estimatedROI / 100), 0);
  const currentValue = portfolio.reduce((sum, holding) => sum + holding.currentValue, 0);
  const totalGain = currentValue - totalInvested;
  const totalGainPercentage = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  const copyAddress = () => {
    if (user) {
      navigator.clipboard.writeText(user.wallet.address);
      toast.success('Wallet address copied!');
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Page Header */}
      <div className="border-b bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">My Portfolio</h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Track your tokenized hotel investments
              </p>
            </div>
            
            {user && (
              <Card className="w-full sm:w-auto">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-500">
                      <Shield className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-zinc-500">Smart Account</p>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm">{formatAddress(user.wallet.address)}</p>
                        <button
                          onClick={copyAddress}
                          className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Portfolio Overview Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PortfolioOverviewCard
            label="Total Invested"
            value={`$${totalInvested.toLocaleString()}`}
            icon={DollarSign}
            iconTone="blue"
            isLoading={isPortfolioLoading}
          />

          <PortfolioOverviewCard
            label="Current Value"
            value={`$${currentValue.toLocaleString()}`}
            icon={TrendingUp}
            iconTone="green"
            isLoading={isPortfolioLoading}
            meta={
              <p
                className={`mt-1 flex items-center text-xs ${
                  totalGain > 0 ? 'text-emerald-600' : totalGain < 0 ? 'text-red-600' : 'text-zinc-500'
                }`}
              >
                {totalGain > 0 ? (
                  <ArrowUpRight className="mr-1 h-3 w-3" />
                ) : totalGain < 0 ? (
                  <ArrowDownRight className="mr-1 h-3 w-3" />
                ) : (
                  <ArrowRight className="mr-1 h-3 w-3" />
                )}
                {totalGain > 0 ? '+' : ''}
                {totalGainPercentage.toFixed(1)}%
              </p>
            }
          />

          <PortfolioOverviewCard
            label="Est. Annual Return"
            value={`$${estimatedAnnualReturn.toFixed(0)}`}
            icon={Calendar}
            iconTone="purple"
            isLoading={isPortfolioLoading}
            meta={<p className="mt-1 text-xs text-zinc-500">8% p.a.</p>}
          />

          <PortfolioOverviewCard
            label="Total Tokens"
            value={totalTokens.toLocaleString()}
            icon={Wallet}
            iconTone="orange"
            isLoading={isPortfolioLoading}
            meta={<p className="mt-1 text-xs text-zinc-500">{portfolio.length} properties</p>}
          />
        </div>

        {/* Holdings Table */}
        <Card>
          <CardHeader>
            <CardTitle>My Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b text-sm">
                  <tr>
                    <th className="pb-3 text-left font-medium">Property</th>
                    <th className="pb-3 text-left font-medium">Unit Type</th>
                    <th className="pb-3 text-left font-medium">Tokens</th>
                    <th className="pb-3 text-left font-medium">Investment</th>
                    <th className="pb-3 text-left font-medium">Current Value</th>
                    <th className="pb-3 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isPortfolioLoading && (
                    Array.from({ length: 3 }).map((_, index) => (
                      <tr key={`skeleton-${index}`} className="text-sm">
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-10 w-10 rounded-lg" />
                            <div>
                              <Skeleton className="h-4 w-40" />
                              <Skeleton className="mt-2 h-3 w-28" />
                            </div>
                          </div>
                        </td>
                        <td className="py-4"><Skeleton className="h-4 w-24" /></td>
                        <td className="py-4"><Skeleton className="h-4 w-16" /></td>
                        <td className="py-4"><Skeleton className="h-4 w-20" /></td>
                        <td className="py-4"><Skeleton className="h-4 w-24" /></td>
                        <td className="py-4"><Skeleton className="h-8 w-20" /></td>
                      </tr>
                    ))
                  )}
                  {portfolio.map((purchase) => {
                    const gain = purchase.currentValue - purchase.totalPrice;
                    const gainPercentage = (gain / purchase.totalPrice) * 100;
                    
                    return (
                      <tr key={purchase.id} className="text-sm">
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                              <Building2 className="h-5 w-5 text-zinc-600" />
                            </div>
                            <div>
                              <p className="font-medium">{purchase.hotelName}</p>
                              <p className="text-xs text-zinc-500">
                                Purchased {purchase.purchaseDate.toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4">{purchase.unitType}</td>
                        <td className="py-4">{purchase.tokenAmount.toLocaleString()}</td>
                        <td className="py-4">${purchase.totalPrice.toLocaleString()}</td>
                        <td className="py-4">
                          <div>
                            <p className="font-medium">${purchase.currentValue.toFixed(0)}</p>
                            <p
                              className={`flex items-center text-xs ${
                                gain > 0 ? 'text-emerald-600' : gain < 0 ? 'text-red-600' : 'text-zinc-500'
                              }`}
                            >
                              {gain > 0 ? (
                                <ArrowUpRight className="mr-1 h-3 w-3" />
                              ) : gain < 0 ? (
                                <ArrowDownRight className="mr-1 h-3 w-3" />
                              ) : (
                                <ArrowRight className="mr-1 h-3 w-3" />
                              )}
                              {gain > 0 ? '+' : ''}{gainPercentage.toFixed(1)}%
                            </p>
                          </div>
                        </td>
                        <td className="py-4">
                          <Link href={`/borrow?hotelId=${purchase.hotelId}&unitId=${purchase.unitId}`}>
                            <Button variant="ghost" size="sm">
                              <Landmark className="mr-1 h-4 w-4" />
                              Get Loan
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!isPortfolioLoading && portfolio.length === 0 && (
              <div className="py-12 text-center">
                <Building2 className="mx-auto h-12 w-12 text-zinc-400" />
                <h3 className="mt-4 text-lg font-medium">No investments yet</h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Start building your portfolio by investing in tokenized properties
                </p>
                <Button className="mt-4" asChild>
                  <a href="/discover">Browse Properties</a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </AuthGuard>
  );
}
