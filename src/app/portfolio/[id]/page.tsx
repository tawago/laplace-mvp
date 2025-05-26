'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { 
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Clock,
  FileText,
  Download,
  ChevronRight,
  Percent,
  Coins
} from 'lucide-react';
import { TokenPurchase } from '@/types/hotel';
import { hotels } from '@/data/hotels';
import { useAuth } from '@/contexts/auth-context';
import { AuthGuard } from '@/components/auth-guard';

interface Transaction {
  id: string;
  type: 'dividend' | 'purchase' | 'sale';
  amount: number;
  date: Date;
  description: string;
}

export default function PortfolioDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [purchase, setPurchase] = useState<TokenPurchase | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    // Mock data - in real app, fetch from API
    const mockPurchase: TokenPurchase = {
      id: params.id as string,
      hotelId: 'the-sail',
      hotelName: 'THE SAIL Hotel Tower',
      unitId: 'sail-a',
      unitType: 'Studio Deluxe',
      tokenAmount: 50,
      pricePerToken: 100,
      totalPrice: 5000,
      purchaseDate: new Date('2024-01-15'),
      estimatedROI: 8,
      status: 'confirmed'
    };

    setPurchase(mockPurchase);

    // Mock transaction history
    const mockTransactions: Transaction[] = [
      {
        id: '1',
        type: 'purchase',
        amount: -5000,
        date: new Date('2024-01-15'),
        description: 'Initial token purchase'
      },
      {
        id: '2',
        type: 'dividend',
        amount: 100,
        date: new Date('2024-03-31'),
        description: 'Q1 2024 Dividend Payment'
      },
      {
        id: '3',
        type: 'dividend',
        amount: 100,
        date: new Date('2024-06-30'),
        description: 'Q2 2024 Dividend Payment'
      },
      {
        id: '4',
        type: 'dividend',
        amount: 100,
        date: new Date('2024-09-30'),
        description: 'Q3 2024 Dividend Payment'
      }
    ];

    setTransactions(mockTransactions);
  }, [params.id]);

  if (!purchase || !user) {
    return null;
  }

  const hotel = hotels.find(h => h.id === purchase.hotelId);
  const unit = hotel?.units.find(u => u.id === purchase.unitId);
  
  const currentValue = purchase.totalPrice * 1.05; // Mock 5% appreciation
  const totalDividends = transactions
    .filter(t => t.type === 'dividend')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalReturn = currentValue - purchase.totalPrice + totalDividends;
  const totalReturnPercentage = (totalReturn / purchase.totalPrice) * 100;
  const annualizedReturn = totalReturnPercentage / ((new Date().getTime() - purchase.purchaseDate.getTime()) / (365 * 24 * 60 * 60 * 1000));

  // Generate chart data
  const chartData = [];
  const startDate = new Date(purchase.purchaseDate);
  const monthsSincePurchase = Math.floor((new Date().getTime() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
  
  for (let i = 0; i <= monthsSincePurchase; i++) {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + i);
    
    // Calculate value with appreciation
    const monthlyAppreciation = 0.004; // ~5% annually
    const appreciatedValue = purchase.totalPrice * Math.pow(1 + monthlyAppreciation, i);
    
    // Add dividends every 3 months
    const dividendsPaid = Math.floor(i / 3) * (purchase.totalPrice * purchase.estimatedROI / 100 / 4);
    
    chartData.push({
      month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      value: Math.round(appreciatedValue),
      totalReturn: Math.round(appreciatedValue - purchase.totalPrice + dividendsPaid),
      dividends: Math.round(dividendsPaid),
    });
  }

  const chartConfig = {
    value: {
      label: "Portfolio Value",
      color: "hsl(var(--chart-1))",
    },
    totalReturn: {
      label: "Total Return",
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="border-b bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Investment Details</h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {purchase.hotelName} - {purchase.unitType}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Overview Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Current Value</p>
                  <p className="mt-1 text-2xl font-bold">${currentValue.toFixed(2)}</p>
                  <p className="mt-1 flex items-center text-xs text-emerald-600">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    +{((currentValue - purchase.totalPrice) / purchase.totalPrice * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-100 p-3 dark:bg-emerald-900/20">
                  <DollarSign className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Total Return</p>
                  <p className="mt-1 text-2xl font-bold">${totalReturn.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-zinc-500">{totalReturnPercentage.toFixed(1)}% total</p>
                </div>
                <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/20">
                  <Percent className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Dividends Earned</p>
                  <p className="mt-1 text-2xl font-bold">${totalDividends.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-zinc-500">{transactions.filter(t => t.type === 'dividend').length} payments</p>
                </div>
                <div className="rounded-lg bg-purple-100 p-3 dark:bg-purple-900/20">
                  <Coins className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Annualized Return</p>
                  <p className="mt-1 text-2xl font-bold">{annualizedReturn.toFixed(1)}%</p>
                  <p className="mt-1 text-xs text-zinc-500">per year</p>
                </div>
                <div className="rounded-lg bg-orange-100 p-3 dark:bg-orange-900/20">
                  <TrendingUp className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Investment Details */}
            <Card>
              <CardHeader>
                <CardTitle>Investment Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-zinc-500">Property</p>
                      <p className="font-medium">{purchase.hotelName}</p>
                      <Link href={`/hotel/${purchase.hotelId}`}>
                        <Button variant="link" className="h-auto p-0 text-blue-600">
                          View Property Details <ChevronRight className="ml-1 h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                    
                    <div>
                      <p className="text-sm text-zinc-500">Unit Type</p>
                      <p className="font-medium">{purchase.unitType}</p>
                      {unit && (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {unit.size} {unit.sizeUnit} • {unit.view}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-sm text-zinc-500">Purchase Date</p>
                      <p className="font-medium">
                        {purchase.purchaseDate.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-zinc-500">Token Details</p>
                      <p className="font-medium">{purchase.tokenAmount.toLocaleString()} tokens</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        @ ${purchase.pricePerToken} per token
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-zinc-500">Investment Amount</p>
                      <p className="font-medium">${purchase.totalPrice.toLocaleString()}</p>
                    </div>

                    <div>
                      <p className="text-sm text-zinc-500">Status</p>
                      <Badge variant="secondary" className="capitalize">
                        <Clock className="mr-1 h-3 w-3" />
                        {purchase.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* ROI Projection */}
                <div className="border-t pt-6">
                  <h3 className="mb-4 font-semibold">Return Projection</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Annual Return Rate</span>
                      <span className="font-medium">{purchase.estimatedROI}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Expected Annual Income</span>
                      <span className="font-medium">${(purchase.totalPrice * purchase.estimatedROI / 100).toFixed(2)}</span>
                    </div>
                    {hotel && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">Buyback Option</span>
                        <span className="font-medium">{hotel.buybackPercentage}% in Year {hotel.buybackYear}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Performance Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <AreaChart
                    data={chartData}
                    margin={{
                      left: 12,
                      right: 12,
                    }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(value) => value.slice(0, 3)}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent />}
                    />
                    <defs>
                      <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="var(--color-value)"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-value)"
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                      <linearGradient id="fillTotalReturn" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="var(--color-totalReturn)"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-totalReturn)"
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                    </defs>
                    <Area
                      dataKey="totalReturn"
                      type="monotone"
                      fill="url(#fillTotalReturn)"
                      fillOpacity={0.4}
                      stroke="var(--color-totalReturn)"
                      stackId="a"
                    />
                    <Area
                      dataKey="value"
                      type="monotone"
                      fill="url(#fillValue)"
                      fillOpacity={0.4}
                      stroke="var(--color-value)"
                      stackId="a"
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {transactions.map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-lg p-2 ${
                          transaction.type === 'dividend' 
                            ? 'bg-emerald-100 dark:bg-emerald-900/20' 
                            : 'bg-blue-100 dark:bg-blue-900/20'
                        }`}>
                          {transaction.type === 'dividend' ? (
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <DollarSign className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{transaction.description}</p>
                          <p className="text-sm text-zinc-500">
                            {transaction.date.toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>
                      <p className={`font-semibold ${
                        transaction.amount > 0 ? 'text-emerald-600' : 'text-zinc-900 dark:text-white'
                      }`}>
                        {transaction.amount > 0 ? '+' : ''}${Math.abs(transaction.amount).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Investment Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { name: 'Token Purchase Agreement', date: purchase.purchaseDate },
                    { name: 'Investment Certificate', date: purchase.purchaseDate },
                    { name: 'Q3 2024 Dividend Statement', date: new Date('2024-09-30') },
                    { name: 'Q2 2024 Dividend Statement', date: new Date('2024-06-30') },
                    { name: 'Q1 2024 Dividend Statement', date: new Date('2024-03-31') },
                  ].map((doc, index) => (
                    <div key={index} className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-zinc-500" />
                        <div>
                          <p className="font-medium">{doc.name}</p>
                          <p className="text-sm text-zinc-500">
                            {doc.date.toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
    </AuthGuard>
  );
}