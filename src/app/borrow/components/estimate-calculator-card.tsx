'use client';

import { useEffect, useMemo, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { getTokenSymbol } from '@/lib/xrpl/currency-codes';

import type { LoanRepaymentOverview, Market, Position } from '../types';
import { AmortizationChart } from './charts/amortization-chart';
import { PaymentBreakdownChart } from './charts/payment-breakdown-chart';
import { buildAmortizationSchedule } from './utils/amortization';

const DEFAULT_SIMULATOR_TERM_MONTHS = 24;
const MIN_SIMULATOR_TERM_MONTHS = 1;
const MAX_SIMULATOR_TERM_MONTHS = 12 * 30;

interface EstimateCalculatorCardProps {
  market: Market;
  position: Position | null;
  loanRepayment: LoanRepaymentOverview | null;
  initialSimulatedBorrowAmount?: string;
}

export function EstimateCalculatorCard({
  market,
  position,
  loanRepayment,
  initialSimulatedBorrowAmount = '50',
}: EstimateCalculatorCardProps) {
  const [simulatedBorrowAmount, setSimulatedBorrowAmount] = useState(initialSimulatedBorrowAmount);
  const [simulatedTermMonths, setSimulatedTermMonths] = useState(DEFAULT_SIMULATOR_TERM_MONTHS);
  const debtSymbol = getTokenSymbol(market.debtCurrency);

  const hasActiveLoan = Boolean(
    position &&
      position.loanPrincipal > 0 &&
      loanRepayment &&
      typeof loanRepayment.paymentRemaining === 'number' &&
      loanRepayment.paymentRemaining > 0
  );

  useEffect(() => {
    if (hasActiveLoan) return;
    setSimulatedBorrowAmount(initialSimulatedBorrowAmount);
    setSimulatedTermMonths(DEFAULT_SIMULATOR_TERM_MONTHS);
  }, [hasActiveLoan, initialSimulatedBorrowAmount, market.id]);

  const schedule = useMemo(() => {
    const simulatorPrincipal = Number(simulatedBorrowAmount);

    if (hasActiveLoan) {
      return buildAmortizationSchedule({
        principal: position?.loanPrincipal ?? 0,
        apr: position?.interestRateAtOpen ?? market.baseInterestRate,
        periods: loanRepayment?.paymentRemaining ?? 1,
        periodicPayment: loanRepayment?.periodicPayment,
      });
    }

    if (!Number.isFinite(simulatorPrincipal) || simulatorPrincipal <= 0) {
      return buildAmortizationSchedule({
        principal: 0,
        apr: market.baseInterestRate,
        periods: simulatedTermMonths,
      });
    }

    return buildAmortizationSchedule({
      principal: simulatorPrincipal,
      apr: market.baseInterestRate,
      periods: simulatedTermMonths,
    });
  }, [
    hasActiveLoan,
    loanRepayment?.paymentRemaining,
    loanRepayment?.periodicPayment,
    market.baseInterestRate,
    position,
    simulatedBorrowAmount,
    simulatedTermMonths,
  ]);

  const principal = hasActiveLoan ? position?.loanPrincipal ?? 0 : Number(simulatedBorrowAmount) || 0;
  const isFallbackState = principal <= 0 || schedule.data.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasActiveLoan ? 'Estimated Repayment' : 'Estimate Calculator'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasActiveLoan && (
          <>
          <div className="flex justify-between">
            <div>
              <label htmlFor="simulated-borrow" className="text-xs uppercase tracking-wide text-zinc-500">
                Simulated Borrow Amount
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="simulated-borrow"
                  type="number"
                  value={simulatedBorrowAmount}
                  onChange={(event) => setSimulatedBorrowAmount(event.target.value)}
                  className="w-44 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{debtSymbol}</span>
              </div>
            </div>
            <div>
              <label htmlFor="simulated-term" className="text-xs uppercase tracking-wide text-zinc-500">
                Simulated Loan Period (Months)
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="simulated-term"
                  type="number"
                  min={MIN_SIMULATOR_TERM_MONTHS}
                  max={MAX_SIMULATOR_TERM_MONTHS}
                  value={simulatedTermMonths}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    if (!Number.isFinite(nextValue)) {
                      setSimulatedTermMonths(DEFAULT_SIMULATOR_TERM_MONTHS);
                      return;
                    }
                    const clamped = Math.min(MAX_SIMULATOR_TERM_MONTHS, Math.max(MIN_SIMULATOR_TERM_MONTHS, Math.floor(nextValue)));
                    setSimulatedTermMonths(clamped);
                  }}
                  className="w-44 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">months</span>
              </div>
            </div>

          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Simulator uses {(market.baseInterestRate * 100).toFixed(2)}% APR over {simulatedTermMonths} months.
          </p>
          </>
        )}

        <Tabs defaultValue="breakdown" className="space-y-4">
          <TabsList>
            <TabsTrigger value="breakdown">Payment Breakdown</TabsTrigger>
            <TabsTrigger value="amortization">Amortization</TabsTrigger>
          </TabsList>

          <TabsContent value="breakdown" className="space-y-4">
            {isFallbackState ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Enter a borrow amount to see estimate details.</p>
            ) : (
              <>
                <PaymentBreakdownChart principal={principal} totalInterest={schedule.totalInterest} debtCurrency={debtSymbol} />
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Principal</p>
                    <p className="mt-1 font-semibold">{principal.toFixed(4)} {debtSymbol}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Total Interest</p>
                    <p className="mt-1 font-semibold">{schedule.totalInterest.toFixed(4)} {debtSymbol}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Total Repayment</p>
                    <p className="mt-1 font-semibold">{schedule.totalRepayment.toFixed(4)} {debtSymbol}</p>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="amortization">
            {isFallbackState ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Enter a borrow amount to render the schedule.</p>
            ) : (
              <AmortizationChart
                data={schedule.data}
                debtCurrency={debtSymbol}
              />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
