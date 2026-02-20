import type { AmortizationDataPoint } from '../../types';

const EPSILON = 1e-6;

interface BuildAmortizationScheduleParams {
  principal: number;
  apr: number;
  periods: number;
  periodicPayment?: number | null;
}

export interface AmortizationSchedule {
  data: AmortizationDataPoint[];
  periodicPayment: number;
  totalInterest: number;
  totalRepayment: number;
}

export function buildAmortizationSchedule({
  principal,
  apr,
  periods,
  periodicPayment,
}: BuildAmortizationScheduleParams): AmortizationSchedule {
  const safePrincipal = Number.isFinite(principal) && principal > 0 ? principal : 0;
  const safeApr = Number.isFinite(apr) && apr > 0 ? apr : 0;
  const safePeriods = Number.isFinite(periods) ? Math.max(1, Math.floor(periods)) : 1;
  const monthlyRate = safeApr / 12;

  const computedPayment = computePayment(safePrincipal, monthlyRate, safePeriods);
  const paymentPerPeriod =
    typeof periodicPayment === 'number' && Number.isFinite(periodicPayment) && periodicPayment > 0
      ? periodicPayment
      : computedPayment;

  let remainingBalance = safePrincipal;
  let cumulativePrincipal = 0;
  let cumulativeInterest = 0;

  const data: AmortizationDataPoint[] = [];

  for (let period = 1; period <= safePeriods; period += 1) {
    const interestPaid = remainingBalance * monthlyRate;
    let principalPaid = Math.max(paymentPerPeriod - interestPaid, 0);

    if (period === safePeriods || principalPaid >= remainingBalance) {
      principalPaid = remainingBalance;
    }

    remainingBalance = Math.max(remainingBalance - principalPaid, 0);
    cumulativePrincipal += principalPaid;
    cumulativeInterest += interestPaid;

    data.push({
      period,
      monthLabel: `M${period}`,
      principalPaid,
      interestPaid,
      cumulativePrincipal,
      cumulativeInterest,
      remainingBalance: remainingBalance < EPSILON ? 0 : remainingBalance,
    });
  }

  if (data.length > 0) {
    const lastItem = data[data.length - 1];
    lastItem.remainingBalance = 0;
  }

  return {
    data,
    periodicPayment: paymentPerPeriod,
    totalInterest: cumulativeInterest,
    totalRepayment: cumulativePrincipal + cumulativeInterest,
  };
}

function computePayment(principal: number, monthlyRate: number, periods: number): number {
  if (principal <= 0) return 0;
  if (monthlyRate <= 0) return principal / periods;

  const growthFactor = (1 + monthlyRate) ** periods;
  return (principal * monthlyRate * growthFactor) / (growthFactor - 1);
}
