import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Coins, RefreshCw } from 'lucide-react';

interface BalancesCardProps {
  tokens: string[];
  issuerAddress?: string;
  isLoading: boolean;
  getBalance: (symbol: string, issuer?: string) => number;
  onRefresh: () => void;
}

export function BalancesCard({ tokens, issuerAddress, isLoading, getBalance, onRefresh }: BalancesCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Balances
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {tokens.map((token) => (
            <div key={token} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
              <p className="text-xs uppercase text-zinc-500">{token}</p>
              {isLoading ? <Skeleton className="mt-2 h-5 w-16" /> : <p className="font-semibold">{getBalance(token, issuerAddress).toFixed(2)}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
