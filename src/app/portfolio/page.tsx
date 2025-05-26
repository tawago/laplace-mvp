'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  Wallet, 
  DollarSign, 
  Building2,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Copy
} from 'lucide-react';
import { TokenPurchase } from '@/types/hotel';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<TokenPurchase[]>([]);
  const { user } = useAuth();
  
  useEffect(() => {
    // Mock portfolio data - in real app, this would come from blockchain/API
    const mockPurchases: TokenPurchase[] = [
      {
        id: '1',
        hotelId: 'the-sail',
        hotelName: 'THE SAIL Hotel Tower',
        unitId: 'sail-a',
        unitType: 'Studio Deluxe',
        tokenAmount: 500,
        pricePerToken: 3.40,
        totalPrice: 1700,
        purchaseDate: new Date('2024-01-15'),
        estimatedROI: 8,
        status: 'confirmed'
      },
      {
        id: '2',
        hotelId: 'nyra',
        hotelName: 'NYRA Oceanview Hotel',
        unitId: 'nyra-b',
        unitType: 'Premium Suite',
        tokenAmount: 1000,
        pricePerToken: 1.93,
        totalPrice: 1930,
        purchaseDate: new Date('2024-02-20'),
        estimatedROI: 8,
        status: 'confirmed'
      }
    ];
    
    setPortfolio(mockPurchases);
  }, []);

  const totalInvested = portfolio.reduce((sum, p) => sum + p.totalPrice, 0);
  const totalTokens = portfolio.reduce((sum, p) => sum + p.tokenAmount, 0);
  const estimatedAnnualReturn = portfolio.reduce((sum, p) => sum + (p.totalPrice * p.estimatedROI / 100), 0);
  const currentValue = totalInvested * 1.05; // Mock 5% appreciation

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
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Total Invested</p>
                  <p className="mt-1 text-2xl font-bold">${totalInvested.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/20">
                  <DollarSign className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Current Value</p>
                  <p className="mt-1 text-2xl font-bold">${currentValue.toLocaleString()}</p>
                  <p className="mt-1 flex items-center text-xs text-emerald-600">
                    <ArrowUpRight className="mr-1 h-3 w-3" />
                    +5.0%
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-100 p-3 dark:bg-emerald-900/20">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Est. Annual Return</p>
                  <p className="mt-1 text-2xl font-bold">${estimatedAnnualReturn.toFixed(0)}</p>
                  <p className="mt-1 text-xs text-zinc-500">8% p.a.</p>
                </div>
                <div className="rounded-lg bg-purple-100 p-3 dark:bg-purple-900/20">
                  <Calendar className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Total Tokens</p>
                  <p className="mt-1 text-2xl font-bold">{totalTokens.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-zinc-500">2 properties</p>
                </div>
                <div className="rounded-lg bg-orange-100 p-3 dark:bg-orange-900/20">
                  <Wallet className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
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
                    <th className="pb-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {portfolio.map((purchase) => {
                    const currentValue = purchase.totalPrice * 1.05; // Mock appreciation
                    const gain = currentValue - purchase.totalPrice;
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
                            <p className="font-medium">${currentValue.toFixed(0)}</p>
                            <p className={`flex items-center text-xs ${gain > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {gain > 0 ? <ArrowUpRight className="mr-1 h-3 w-3" /> : <ArrowDownRight className="mr-1 h-3 w-3" />}
                              {gain > 0 ? '+' : ''}{gainPercentage.toFixed(1)}%
                            </p>
                          </div>
                        </td>
                        <td className="py-4">
                          <Badge variant="secondary" className="capitalize">
                            {purchase.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {portfolio.length === 0 && (
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
  );
}