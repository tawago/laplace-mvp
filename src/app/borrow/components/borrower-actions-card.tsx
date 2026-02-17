import type { Dispatch, SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowDownLeft, ArrowUpRight, Loader2, Percent } from 'lucide-react';

import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

import type { LoanRepaymentOverview, Market, PositionMetrics, RepayKind } from '../types';

interface BorrowerActionsCardProps {
  market: Market;
  loading: string;
  collateralTrustlineReady: boolean;
  debtTrustlineReady: boolean;
  metrics: PositionMetrics | null;
  loanRepayment: LoanRepaymentOverview | null;
  repayBufferRate: number;
  depositAmount: string;
  setDepositAmount: Dispatch<SetStateAction<string>>;
  borrowAmount: string;
  setBorrowAmount: Dispatch<SetStateAction<string>>;
  repayAmount: string;
  setRepayAmount: Dispatch<SetStateAction<string>>;
  repayKind: RepayKind;
  withdrawAmount: string;
  setWithdrawAmount: Dispatch<SetStateAction<string>>;
  onDeposit: () => Promise<void>;
  onBorrow: () => Promise<void>;
  onRepay: () => Promise<void>;
  onWithdraw: () => Promise<void>;
  onApplyRepayPreset: (kind: RepayKind) => void;
}

export function BorrowerActionsCard({
  market,
  loading,
  collateralTrustlineReady,
  debtTrustlineReady,
  metrics,
  loanRepayment,
  repayBufferRate,
  depositAmount,
  setDepositAmount,
  borrowAmount,
  setBorrowAmount,
  repayAmount,
  setRepayAmount,
  repayKind,
  withdrawAmount,
  setWithdrawAmount,
  onDeposit,
  onBorrow,
  onRepay,
  onWithdraw,
  onApplyRepayPreset,
}: BorrowerActionsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="h-5 w-5" />
          Borrower Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="deposit">
          <TabsList className="mb-4">
            <TabsTrigger value="deposit">Deposit</TabsTrigger>
            <TabsTrigger value="borrow">Borrow</TabsTrigger>
            <TabsTrigger value="repay">Repay</TabsTrigger>
            <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
          </TabsList>

          <TabsContent value="deposit" className="space-y-3">
            {!market.collateralEscrowEnabled && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Deposit disabled: issuer has not enabled trust line token escrow.
              </p>
            )}
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={depositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
                className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{getTokenSymbol(market.collateralCurrency)}</span>
              <Button
                onClick={() => {
                  void onDeposit();
                }}
                disabled={loading === 'deposit' || !collateralTrustlineReady || !market.collateralEscrowEnabled}
              >
                {loading === 'deposit' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowDownLeft className="mr-2 h-4 w-4" />
                )}
                Deposit
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="borrow" className="space-y-3">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Vault-backed pool liquidity: {(metrics?.availableLiquidity ?? 0).toFixed(4)} {getTokenSymbol(market.debtCurrency)}
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Max borrowable now: {(metrics?.maxBorrowableAmount ?? 0).toFixed(4)} {getTokenSymbol(market.debtCurrency)}
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={borrowAmount}
                onChange={(event) => setBorrowAmount(event.target.value)}
                className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{getTokenSymbol(market.debtCurrency)}</span>
              <Button
                onClick={() => {
                  void onBorrow();
                }}
                disabled={
                  loading === 'borrow' ||
                  !debtTrustlineReady ||
                  (metrics ? Number(borrowAmount) > metrics.maxBorrowableAmount : false)
                }
              >
                {loading === 'borrow' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                )}
                Borrow
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="repay" className="space-y-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
              {loanRepayment ? (
                <>
                  <p className="text-zinc-700 dark:text-zinc-300">
                    Minimum payment:{' '}
                    <span className="font-semibold">
                      {(loanRepayment.minimumRepayment ?? 0).toFixed(6)} {getTokenSymbol(market.debtCurrency)}
                    </span>
                  </p>
                  <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                    Next due:{' '}
                    {loanRepayment.nextPaymentDueDate ? new Date(loanRepayment.nextPaymentDueDate).toLocaleString() : 'N/A'}
                    {loanRepayment.isPastDue ? ' (late)' : ''}
                  </p>
                  <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                    Payments remaining: {loanRepayment.paymentRemaining ?? 'N/A'}
                  </p>
                </>
              ) : (
                <p className="text-zinc-700 dark:text-zinc-300">No active on-chain loan found for this market.</p>
              )}
              <p className="mt-1 text-zinc-500 dark:text-zinc-500">
                Regular, Late, and Overpay presets include a {Math.round(repayBufferRate * 1000) / 10}% buffer. Full Early uses exact payoff.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button
                type="button"
                size="sm"
                variant={repayKind === 'regular' ? 'default' : 'outline'}
                onClick={() => onApplyRepayPreset('regular')}
                disabled={!loanRepayment}
              >
                Regular
              </Button>
              <Button
                type="button"
                size="sm"
                variant={repayKind === 'full' ? 'default' : 'outline'}
                onClick={() => onApplyRepayPreset('full')}
                disabled={!loanRepayment}
              >
                Full Early
              </Button>
              <Button
                type="button"
                size="sm"
                variant={repayKind === 'overpayment' ? 'default' : 'outline'}
                onClick={() => onApplyRepayPreset('overpayment')}
                disabled={!loanRepayment}
              >
                Overpay
              </Button>
              <Button
                type="button"
                size="sm"
                variant={repayKind === 'late' ? 'default' : 'outline'}
                onClick={() => onApplyRepayPreset('late')}
                disabled={!loanRepayment}
              >
                Late
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={repayAmount}
                onChange={(event) => setRepayAmount(event.target.value)}
                className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{getTokenSymbol(market.debtCurrency)}</span>
              <Button
                onClick={() => {
                  void onRepay();
                }}
                disabled={loading === 'repay' || !debtTrustlineReady || !loanRepayment}
              >
                {loading === 'repay' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowDownLeft className="mr-2 h-4 w-4" />
                )}
                Repay
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{getTokenSymbol(market.collateralCurrency)}</span>
              <Button
                onClick={() => {
                  void onWithdraw();
                }}
                disabled={loading === 'withdraw' || !collateralTrustlineReady}
                variant="outline"
              >
                {loading === 'withdraw' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                )}
                Withdraw
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
