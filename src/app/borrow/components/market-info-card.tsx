import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

import type { Market } from '../types';

interface MarketInfoCardProps {
  market: Market;
}

export function MarketInfoCard({ market }: MarketInfoCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Market</CardTitle>
          <Badge variant="outline">{(market.baseInterestRate * 100).toFixed(2)}% APR</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-zinc-500">Collateral</p>
          <p className="font-semibold">{getTokenSymbol(market.collateralCurrency)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Debt</p>
          <p className="font-semibold">{getTokenSymbol(market.debtCurrency)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Max LTV</p>
          <p className="font-semibold">{(market.maxLtvRatio * 100).toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-zinc-500">Liquidation LTV</p>
          <p className="font-semibold">{(market.liquidationLtvRatio * 100).toFixed(0)}%</p>
        </div>
      </CardContent>
    </Card>
  );
}
