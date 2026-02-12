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
  calculateUtilizationRate,
  calculateSupplyApr,
  calculateSupplyApy,
  calculateGlobalYieldIndex,
  calculateAccruedSupplyYield,
  deriveYieldIndexFromAccrued,
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

// Pool accounting
export {
  getPoolMetrics,
  getAvailableLiquidity,
  updateGlobalYieldIndex,
  addToTotalSupplied,
  removeFromTotalSupplied,
  addToTotalBorrowed,
  removeFromTotalBorrowed,
} from './pool';

// Supply position management
export {
  getSupplyPositionById,
  getOrCreateSupplyPosition,
  getSupplyPositionForUser,
  accrueSupplyYield,
  checkpointSupplyYield,
  addSupply,
  removeSupply,
  closeSupplyPosition,
} from './supply';

// Main service
export {
  processDeposit,
  prepareBorrow,
  confirmBorrowWithSignedTx,
  processBorrow,
  processRepay,
  processWithdraw,
  processLiquidation,
  getPositionWithMetrics,
  processSupply,
  processCollectYield,
  processWithdrawSupply,
  getSupplyPositionWithMetrics,
} from './service';
