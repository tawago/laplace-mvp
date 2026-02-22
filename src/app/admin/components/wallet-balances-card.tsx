import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WalletBalancesCardProps {
  walletConnected: boolean;
  tokenList: readonly string[];
  getBalance: (symbol: string) => number;
}

export function WalletBalancesCard({ walletConnected, tokenList, getBalance }: WalletBalancesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wallet Balances</CardTitle>
      </CardHeader>
      <CardContent>
        {!walletConnected ? (
          <p className="text-sm text-slate-600">Generate a wallet to view balances.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-slate-100 p-3">
              <p className="text-xs text-slate-500">XRP</p>
              <p className="text-lg font-semibold text-slate-900">{getBalance('XRP').toFixed(4)}</p>
            </div>
            {tokenList.map((token) => (
              <div key={token} className="rounded-lg bg-slate-100 p-3">
                <p className="text-xs text-slate-500">{token}</p>
                <p className="text-lg font-semibold text-slate-900">{getBalance(token).toFixed(4)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
