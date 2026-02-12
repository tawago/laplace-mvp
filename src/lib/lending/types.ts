/**
 * Lending Service Type Definitions
 */

export type PositionStatus = 'ACTIVE' | 'LIQUIDATED' | 'CLOSED';
export type SupplyPositionStatus = 'ACTIVE' | 'CLOSED';

export type EventModule = 'SWAP' | 'LENDING' | 'FAUCET' | 'TRUST' | 'SYSTEM';

export type EventStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface Market {
  id: string;
  name: string;
  collateralCurrency: string;
  collateralIssuer: string;
  debtCurrency: string;
  debtIssuer: string;
  maxLtvRatio: number;
  liquidationLtvRatio: number;
  baseInterestRate: number;
  liquidationPenalty: number;
  minCollateralAmount: number;
  minBorrowAmount: number;
  minSupplyAmount?: number;
  supplyVaultId?: string | null;
  supplyMptIssuanceId?: string | null;
  loanBrokerId?: string | null;
  loanBrokerAddress?: string | null;
  vaultScale?: number;
  totalSupplied?: number;
  totalBorrowed?: number;
  globalYieldIndex?: number;
  reserveFactor?: number;
  lastIndexUpdate?: Date;
}

export interface Position {
  id: string;
  userId: string;
  marketId: string;
  status: PositionStatus;
  collateralAmount: number;
  loanPrincipal: number;
  interestAccrued: number;
  lastInterestUpdate: Date;
  interestRateAtOpen: number;
  openedAt: Date;
  closedAt: Date | null;
  liquidatedAt: Date | null;
  escrowOwner: string | null;
  escrowSequence: number | null;
  escrowCondition: string | null;
  escrowFulfillment: string | null;
  escrowPreimage: string | null;
  escrowCancelAfter: Date | null;
  loanId: string | null;
  loanHash: string | null;
  loanTermMonths: number;
  loanMaturityDate: Date | null;
  loanOpenedAtLedgerIndex: number | null;
}

export interface SupplyPosition {
  id: string;
  userId: string;
  marketId: string;
  status: SupplyPositionStatus;
  supplyAmount: number;
  yieldIndex: number;
  lastYieldUpdate: Date;
  suppliedAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  availableLiquidity?: number;
}

export interface PoolMetrics {
  marketId: string;
  totalSupplied: number;
  totalBorrowed: number;
  availableLiquidity: number;
  utilizationRate: number;
  borrowApr: number;
  supplyApr: number;
  supplyApy: number;
  globalYieldIndex: number;
  reserveFactor: number;
  lastIndexUpdate: Date;
}

export interface SupplyPositionMetrics {
  accruedYield: number;
  withdrawableAmount: number;
  availableLiquidity: number;
  utilizationRate: number;
  supplyApr: number;
  supplyApy: number;
}

export interface OnchainTransaction {
  id: string;
  txHash: string;
  ledgerIndex: number | null;
  validated: boolean;
  txResult: string | null;
  txType: string;
  sourceAddress: string | null;
  destinationAddress: string | null;
  currency: string | null;
  issuer: string | null;
  amount: number | null;
  observedAt: Date;
  rawTxJson: Record<string, unknown>;
  rawMetaJson: Record<string, unknown> | null;
}

export interface AppEvent {
  id: string;
  eventType: string;
  module: EventModule;
  status: EventStatus;
  userAddress: string | null;
  marketId: string | null;
  positionId: string | null;
  onchainTxId: string | null;
  idempotencyKey: string | null;
  amount: number | null;
  currency: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Event types for app event logging
export const LENDING_EVENTS = {
  DEPOSIT_INITIATED: 'LENDING_DEPOSIT_INITIATED',
  DEPOSIT_CONFIRMED: 'LENDING_DEPOSIT_CONFIRMED',
  DEPOSIT_FAILED: 'LENDING_DEPOSIT_FAILED',
  BORROW_INITIATED: 'LENDING_BORROW_INITIATED',
  BORROW_COMPLETED: 'LENDING_BORROW_COMPLETED',
  BORROW_FAILED: 'LENDING_BORROW_FAILED',
  REPAY_INITIATED: 'LENDING_REPAY_INITIATED',
  REPAY_CONFIRMED: 'LENDING_REPAY_CONFIRMED',
  REPAY_FAILED: 'LENDING_REPAY_FAILED',
  WITHDRAW_INITIATED: 'LENDING_WITHDRAW_INITIATED',
  WITHDRAW_COMPLETED: 'LENDING_WITHDRAW_COMPLETED',
  WITHDRAW_FAILED: 'LENDING_WITHDRAW_FAILED',
  LIQUIDATION_TRIGGERED: 'LENDING_LIQUIDATION_TRIGGERED',
  LIQUIDATION_COMPLETED: 'LENDING_LIQUIDATION_COMPLETED',
  LIQUIDATION_FAILED: 'LENDING_LIQUIDATION_FAILED',
  INTEREST_ACCRUED: 'LENDING_INTEREST_ACCRUED',
  SUPPLY_INITIATED: 'LENDING_SUPPLY_INITIATED',
  SUPPLY_CONFIRMED: 'LENDING_SUPPLY_CONFIRMED',
  SUPPLY_FAILED: 'LENDING_SUPPLY_FAILED',
  COLLECT_YIELD_INITIATED: 'LENDING_COLLECT_YIELD_INITIATED',
  COLLECT_YIELD_COMPLETED: 'LENDING_COLLECT_YIELD_COMPLETED',
  COLLECT_YIELD_FAILED: 'LENDING_COLLECT_YIELD_FAILED',
  WITHDRAW_SUPPLY_INITIATED: 'LENDING_WITHDRAW_SUPPLY_INITIATED',
  WITHDRAW_SUPPLY_COMPLETED: 'LENDING_WITHDRAW_SUPPLY_COMPLETED',
  WITHDRAW_SUPPLY_FAILED: 'LENDING_WITHDRAW_SUPPLY_FAILED',
} as const;

export const SWAP_EVENTS = {
  SWAP_REQUESTED: 'SWAP_REQUESTED',
  SWAP_COMPLETED: 'SWAP_COMPLETED',
  SWAP_FAILED: 'SWAP_FAILED',
} as const;

export const FAUCET_EVENTS = {
  FAUCET_REQUESTED: 'FAUCET_REQUESTED',
  FAUCET_SENT: 'FAUCET_SENT',
  FAUCET_FAILED: 'FAUCET_FAILED',
} as const;

export const TRUST_EVENTS = {
  TRUSTLINE_CREATED: 'TRUSTLINE_CREATED',
  TRUSTLINE_FAILED: 'TRUSTLINE_FAILED',
} as const;

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Lending operation result types
export interface DepositResult {
  positionId: string;
  collateralAmount: number;
  newCollateralTotal: number;
  escrowSequence?: number;
}

export interface BorrowResult {
  positionId: string;
  borrowedAmount: number;
  newLoanPrincipal: number;
  txHash: string;
}

export interface RepayResult {
  positionId: string;
  amountRepaid: number;
  interestPaid: number;
  principalPaid: number;
  remainingDebt: number;
  collateralReleasedTxHash?: string;
}

export interface WithdrawResult {
  positionId: string;
  withdrawnAmount: number;
  remainingCollateral: number;
  txHash: string;
  escrowFinishTxHash?: string;
}

export interface LiquidationResult {
  positionId: string;
  collateralSeized: number;
  debtRepaid: number;
  penalty: number;
}

export interface SupplyResult {
  marketId: string;
  supplyPositionId: string;
  suppliedAmount: number;
}

export interface CollectYieldResult {
  marketId: string;
  supplyPositionId: string;
  collectedAmount: number;
  txHash: string | null;
}

export interface WithdrawSupplyResult {
  marketId: string;
  supplyPositionId: string;
  withdrawnAmount: number;
  remainingSupply: number;
  txHash: string;
}
