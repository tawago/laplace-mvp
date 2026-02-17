export interface Market {
  id: string;
  name: string;
  collateralCurrency: string;
  collateralIssuer: string;
  collateralEscrowEnabled: boolean;
  debtCurrency: string;
  debtIssuer: string;
  maxLtvRatio: number;
  liquidationLtvRatio: number;
  baseInterestRate: number;
  prices: {
    collateralPriceUsd: number;
    debtPriceUsd: number;
  } | null;
}

export interface LendingConfig {
  markets: Market[];
  issuerAddress: string;
  backendAddress: string;
  explorerUrl: string;
}

export interface Position {
  id: string;
  status: string;
  collateralAmount: number;
  loanPrincipal: number;
  interestAccrued: number;
  interestRateAtOpen: number;
  openedAt: string;
}

export interface PositionMetrics {
  totalDebt: number;
  collateralValueUsd: number;
  debtValueUsd: number;
  currentLtv: number;
  healthFactor: number;
  liquidatable: boolean;
  maxBorrowableAmount: number;
  maxWithdrawableAmount: number;
  availableLiquidity: number;
}

export interface LoanRepaymentOverview {
  loanId: string;
  minimumRepayment: number | null;
  fullRepayment: number | null;
  suggestedOverpayment: number | null;
  periodicPayment: number | null;
  paymentRemaining: number | null;
  nextPaymentDueDate: string | null;
  nextPaymentDueRippleEpoch: number | null;
  isPastDue: boolean;
}

export interface BorrowerEvent {
  id: string;
  eventType: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  amount: number | null;
  currency: string | null;
  createdAt: string;
  errorMessage: string | null;
}

export type RepayKind = 'regular' | 'full' | 'overpayment' | 'late';
