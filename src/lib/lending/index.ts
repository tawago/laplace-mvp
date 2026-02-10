/**
 * Lending Module Exports
 */

// Types
export * from './types';

// Calculations
export {
  calculateInterestAccrued,
  calculateTotalDebt,
  calculateLtv,
  calculateHealthFactor,
  calculateMaxBorrowable,
  calculateMaxWithdrawable,
  calculateLiquidationCollateral,
  allocateRepayment,
  isLiquidatable,
  validateBorrow,
  validateWithdrawal,
} from './calculations';

// On-chain transaction helpers
export {
  upsertOnchainTransaction,
  getTransactionByHash,
  isTransactionProcessed,
  getTransactionsForAddress,
} from './onchain';

// Event helpers
export {
  emitAppEvent,
  updateEventStatus,
  getEventsForUser,
  getEventsForPosition,
  getEventsByModule,
  getEventByIdempotencyKey,
} from './events';

// Position management
export {
  getOrCreatePosition,
  getPositionById,
  getPositionForUser,
  accrueInterest,
  addCollateral,
  removeCollateral,
  addLoanPrincipal,
  applyRepayment,
  closePosition,
  liquidatePosition,
  calculatePositionMetrics,
  getLiquidatablePositions,
} from './positions';

// Main service
export {
  processDeposit,
  processBorrow,
  processRepay,
  processWithdraw,
  processLiquidation,
  getPositionWithMetrics,
} from './service';
