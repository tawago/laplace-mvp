'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthGuard } from '@/components/auth-guard';
import { OnrampDialog } from '@/components/onramp-dialog';
import { OfframpDialog } from '@/components/offramp-dialog';
import {
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownLeft,
  Eye,
  EyeOff,
  Copy,
  Coins,
  TrendingUp,
  Clock,
  Shield,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';

interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'purchase' | 'dividend';
  amount: number;
  currency: string;
  status: 'completed' | 'pending' | 'failed';
  description: string;
  date: Date;
  txHash?: string;
}

export default function WalletPage() {
  const { user } = useAuth();
  const [showOnramp, setShowOnramp] = useState(false);
  const [showOfframp, setShowOfframp] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [balance, setBalance] = useState(2547.83);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    // Mock transaction history
    const mockTransactions: Transaction[] = [
      {
        id: '1',
        type: 'dividend',
        amount: 100,
        currency: 'USDC',
        status: 'completed',
        description: 'Q3 2024 Dividend - THE SAIL Hotel',
        date: new Date('2024-09-30'),
        txHash: '0x1234...5678',
      },
      {
        id: '2',
        type: 'purchase',
        amount: -5000,
        currency: 'USDC',
        status: 'completed',
        description: 'Token Purchase - Studio Deluxe (50 tokens)',
        date: new Date('2024-01-15'),
        txHash: '0xabcd...efgh',
      },
      {
        id: '3',
        type: 'deposit',
        amount: 10000,
        currency: 'USDC',
        status: 'completed',
        description: 'Bank Transfer Deposit',
        date: new Date('2024-01-10'),
        txHash: '0x9876...5432',
      },
      {
        id: '4',
        type: 'dividend',
        amount: 100,
        currency: 'USDC',
        status: 'completed',
        description: 'Q2 2024 Dividend - THE SAIL Hotel',
        date: new Date('2024-06-30'),
        txHash: '0xfedc...ba98',
      },
      {
        id: '5',
        type: 'withdrawal',
        amount: -2500,
        currency: 'USDC',
        status: 'pending',
        description: 'Bank Transfer Withdrawal',
        date: new Date('2024-11-25'),
        txHash: '0x5555...6666',
      },
    ];

    setTransactions(mockTransactions);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsRefreshing(false);
    toast.success('Balance updated');
  };

  const copyAddress = () => {
    if (user) {
      navigator.clipboard.writeText(user.wallet.address);
      toast.success('Wallet address copied!');
    }
  };

  const copyTxHash = (txHash: string) => {
    navigator.clipboard.writeText(txHash);
    toast.success('Transaction hash copied!');
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownLeft className="h-4 w-4 text-emerald-600" />;
      case 'withdrawal':
        return <ArrowUpRight className="h-4 w-4 text-red-600" />;
      case 'purchase':
        return <Coins className="h-4 w-4 text-blue-600" />;
      case 'dividend':
        return <TrendingUp className="h-4 w-4 text-purple-600" />;
      default:
        return <Coins className="h-4 w-4 text-zinc-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-100 text-emerald-800">Completed</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleOnrampSuccess = (amount: number) => {
    setBalance(prev => prev + amount);
    const newTransaction: Transaction = {
      id: Date.now().toString(),
      type: 'deposit',
      amount: amount,
      currency: 'USDC',
      status: 'completed',
      description: 'Deposit via Onramp',
      date: new Date(),
      txHash: `0x${Math.random().toString(16).substr(2, 8)}...${Math.random().toString(16).substr(2, 4)}`,
    };
    setTransactions(prev => [newTransaction, ...prev]);
  };

  const handleOfframpSuccess = (amount: number) => {
    setBalance(prev => prev - amount);
    const newTransaction: Transaction = {
      id: Date.now().toString(),
      type: 'withdrawal',
      amount: -amount,
      currency: 'USDC',
      status: 'pending',
      description: 'Withdrawal via Offramp',
      date: new Date(),
      txHash: `0x${Math.random().toString(16).substr(2, 8)}...${Math.random().toString(16).substr(2, 4)}`,
    };
    setTransactions(prev => [newTransaction, ...prev]);
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        {/* Header */}
        <div className="border-b bg-white dark:bg-zinc-950">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">My Wallet</h1>
                <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                  Manage your USDC balance and transactions
                </p>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          {/* Balance Cards */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Main Balance */}
            <Card className="sm:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Total Balance
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowBalance(!showBalance)}
                  >
                    {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">
                    {showBalance ? `${balance.toFixed(2)}` : '•••••••'}
                  </span>
                  <span className="text-lg text-zinc-600 dark:text-zinc-400">USDC</span>
                </div>
                {showBalance && (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    ≈ ${(balance * 1.002).toFixed(2)} USD
                  </p>
                )}
                
                <div className="mt-6 flex gap-3">
                  <Button onClick={() => setShowOnramp(true)} className="flex-1">
                    <Plus className="mr-2 h-4 w-4" />
                    Deposit
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowOfframp(true)}
                    className="flex-1"
                  >
                    <Minus className="mr-2 h-4 w-4" />
                    Withdraw
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Wallet Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Wallet Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
                    <Shield className="h-5 w-5 text-emerald-600" />
                    <div className="flex-1">
                      <p className="text-xs text-zinc-500">Smart Account</p>
                      <p className="font-mono text-sm">
                        {user ? formatAddress(user.wallet.address) : ''}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={copyAddress}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Coins className="h-3 w-3" />
                    <span>Ethereum (ERC-20)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="all" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="deposits">Deposits</TabsTrigger>
                  <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
                  <TabsTrigger value="dividends">Dividends</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="space-y-3">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800">
                          {getTransactionIcon(tx.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{tx.description}</p>
                            {getStatusBadge(tx.status)}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-zinc-500">
                            <span>{tx.date.toLocaleDateString()}</span>
                            {tx.txHash && (
                              <button
                                onClick={() => copyTxHash(tx.txHash!)}
                                className="flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300"
                              >
                                <span className="font-mono">{tx.txHash}</span>
                                <Copy className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${
                          tx.amount > 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)} {tx.currency}
                        </p>
                        {tx.status === 'pending' && (
                          <div className="flex items-center gap-1 text-xs text-zinc-500">
                            <Clock className="h-3 w-3" />
                            <span>Processing</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="deposits">
                  {transactions.filter(tx => tx.type === 'deposit').map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/20">
                          <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-medium">{tx.description}</p>
                          <p className="text-xs text-zinc-500">{tx.date.toLocaleDateString()}</p>
                        </div>
                      </div>
                      <p className="font-semibold text-emerald-600">
                        +{tx.amount.toFixed(2)} {tx.currency}
                      </p>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="withdrawals">
                  {transactions.filter(tx => tx.type === 'withdrawal').map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/20">
                          <ArrowUpRight className="h-4 w-4 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium">{tx.description}</p>
                          <p className="text-xs text-zinc-500">{tx.date.toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-red-600">
                          {tx.amount.toFixed(2)} {tx.currency}
                        </p>
                        {getStatusBadge(tx.status)}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="dividends">
                  {transactions.filter(tx => tx.type === 'dividend').map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/20">
                          <TrendingUp className="h-4 w-4 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-medium">{tx.description}</p>
                          <p className="text-xs text-zinc-500">{tx.date.toLocaleDateString()}</p>
                        </div>
                      </div>
                      <p className="font-semibold text-purple-600">
                        +{tx.amount.toFixed(2)} {tx.currency}
                      </p>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Dialogs */}
        <OnrampDialog 
          open={showOnramp} 
          onOpenChange={setShowOnramp}
          onSuccess={handleOnrampSuccess}
        />
        <OfframpDialog 
          open={showOfframp} 
          onOpenChange={setShowOfframp}
          availableBalance={balance}
          onSuccess={handleOfframpSuccess}
        />
      </div>
    </AuthGuard>
  );
}