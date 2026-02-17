import type { Dispatch, SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp } from 'lucide-react';

import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

import type { MarketConfig, PoolMetrics, SupplyPosition, SupplyPositionMetrics } from '../types';

interface SupplyActionsCardProps {
  market: MarketConfig;
  walletReady: boolean;
  walletReadyChecked: boolean;
  loadingAction: string;
  supplyAmount: string;
  setSupplyAmount: Dispatch<SetStateAction<string>>;
  withdrawAmount: string;
  setWithdrawAmount: Dispatch<SetStateAction<string>>;
  position: SupplyPosition | null;
  pool: PoolMetrics | null;
  positionMetrics: SupplyPositionMetrics | null;
  formatAmount: (value: number, decimals?: number) => string;
  onSupply: () => Promise<void>;
  onWithdrawSupply: () => Promise<void>;
  onWithdrawAll: () => Promise<void>;
}

export function SupplyActionsCard({
  market,
  walletReady,
  walletReadyChecked,
  loadingAction,
  supplyAmount,
  setSupplyAmount,
  withdrawAmount,
  setWithdrawAmount,
  position,
  pool,
  positionMetrics,
  formatAmount,
  onSupply,
  onWithdrawSupply,
  onWithdrawAll,
}: SupplyActionsCardProps) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">Supply Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="supply" className="w-full">
          <TabsList className="mb-6 !bg-slate-100">
            <TabsTrigger value="supply" className="!text-slate-600 data-[state=active]:!bg-white data-[state=active]:!text-slate-900">
              Supply
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="!text-slate-600 data-[state=active]:!bg-white data-[state=active]:!text-slate-900">
              Withdraw
            </TabsTrigger>
          </TabsList>

          <TabsContent value="supply" className="space-y-4">
            <p className="text-sm text-slate-600">
              Minimum supply is {market.minSupplyAmount} {getTokenSymbol(market.debtCurrency)}.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="number"
                min="0"
                step="0.0001"
                value={supplyAmount}
                onChange={(event) => setSupplyAmount(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:w-64"
              />
              <Button
                onClick={() => {
                  void onSupply();
                }}
                disabled={!walletReadyChecked || !walletReady || loadingAction === 'supply'}
                className="bg-slate-900 text-white hover:bg-slate-800 sm:w-auto"
              >
                {loadingAction === 'supply' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TrendingUp className="mr-2 h-4 w-4" />
                )}
                Supply to Pool
              </Button>
            </div>
            {walletReadyChecked && !walletReady && (
              <p className="text-xs text-amber-700">You do not have any RLUSD token to lend.</p>
            )}
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-4">
            <p className="text-sm text-slate-600">
              Withdraw from your vault-backed supply while respecting pool liquidity constraints.
            </p>
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">Withdrawable</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {formatAmount(positionMetrics?.withdrawableAmount ?? 0, 4)} {getTokenSymbol(market.debtCurrency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Pool Liquidity</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {formatAmount(positionMetrics?.availableLiquidity ?? pool?.availableLiquidity ?? 0, 4)} {getTokenSymbol(market.debtCurrency)}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="number"
                min="0"
                step="0.0001"
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:w-64"
              />
              <Button
                onClick={() => {
                  void onWithdrawSupply();
                }}
                disabled={!walletReadyChecked || !walletReady || loadingAction === 'withdraw-supply'}
                variant="outline"
                className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900"
              >
                {loadingAction === 'withdraw-supply' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Withdraw Supply
              </Button>
              <Button
                onClick={() => {
                  void onWithdrawAll();
                }}
                disabled={
                  !walletReadyChecked || !walletReady || !position || position.supplyAmount <= 0 || loadingAction === 'withdraw-all'
                }
                variant="outline"
                className="border-rose-300 bg-white text-rose-700 hover:bg-rose-50 hover:text-rose-700"
              >
                {loadingAction === 'withdraw-all' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Withdraw Full Position
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Full position withdraw redeems all vault shares and avoids asset precision mismatch.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
