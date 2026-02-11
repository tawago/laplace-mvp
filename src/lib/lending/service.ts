/**
 * Lending Service
 *
 * Main service layer coordinating lending operations.
 * Handles deposit, borrow, repay, withdraw, and liquidation.
 * All database operations are async (Drizzle + Neon).
 */

import Decimal from 'decimal.js';
import { getClient } from '../xrpl/client';
import { getBackendWallet, getIssuerAddress, getBackendAddress } from '../xrpl/wallet';
import {
  verifyTransaction,
  sendToken,
  type SendTokenResult,
  type TransactionVerification,
} from '../xrpl/tokens';
import { getMarketById, getMarketPrices } from '../db/seed';
import { upsertOnchainTransaction, isTransactionProcessed } from './onchain';
import {
  emitAppEvent,
  updateEventStatus,
  acquireIdempotencyKey,
  validateIdempotencyIdentity,
  completeIdempotencyEvent,
  type AppEventRow,
} from './events';
import {
  getOrCreatePosition,
  getPositionForUser,
  accrueInterest,
  addCollateral,
  removeCollateral,
  addLoanPrincipal,
  applyRepayment,
  liquidatePosition as markLiquidated,
  calculatePositionMetrics,
  getLiquidatablePositions,
  checkPositionLiquidatable,
} from './positions';
import {
  validateBorrow,
  validateWithdrawal,
  allocateRepayment,
  calculateLiquidationCollateral,
  calculateTotalDebt,
  calculateAccruedSupplyYield,
} from './calculations';
import {
  addToTotalBorrowed,
  getAvailableLiquidity,
  getPoolMetrics,
  removeFromTotalBorrowed,
  addToTotalSupplied,
  removeFromTotalSupplied,
  updateGlobalYieldIndex,
} from './pool';
import {
  addSupply,
  accrueSupplyYield,
  checkpointSupplyYield,
  getOrCreateSupplyPosition,
  getSupplyPositionForUser,
  removeSupply,
} from './supply';
import {
  LENDING_EVENTS,
  Market,
  Position,
  PositionMetrics,
  DepositResult,
  BorrowResult,
  RepayResult,
  WithdrawResult,
  LiquidationResult,
  SupplyResult,
  CollectYieldResult,
  WithdrawSupplyResult,
  SupplyPosition,
  SupplyPositionMetrics,
  PoolMetrics,
} from './types';
import { getTokenCode } from '../xrpl/currency-codes';

export interface LendingServiceError {
  code: string;
  message: string;
}

Decimal.set({ precision: 28, rounding: Decimal.ROUND_DOWN });

const TOKEN_SCALE = 8;

function createError(code: string, message: string): LendingServiceError {
  return { code, message };
}

function toAmount(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(TOKEN_SCALE, Decimal.ROUND_DOWN).toNumber();
}

function normalizeCurrencyCode(currency: string): string {
  return (getTokenCode(currency) || currency).toUpperCase();
}

function isExpectedCurrency(actual: string, expected: string): boolean {
  return normalizeCurrencyCode(actual) === normalizeCurrencyCode(expected);
}

function reconstructResult<T>(event: AppEventRow): T | null {
  try {
    const payload = typeof event.payload === 'string'
      ? JSON.parse(event.payload)
      : event.payload;
    return payload?.result ?? null;
  } catch {
    return null;
  }
}

const STORE_FULL_TX_JSON = process.env.XRPL_STORE_FULL_TX_JSON === 'true';

function buildInboundRawTxJson(tx: TransactionVerification): Record<string, unknown> {
  if (STORE_FULL_TX_JSON && tx.rawTx) {
    return tx.rawTx;
  }

  return {
    hash: tx.hash,
    transactionType: tx.transactionType,
    source: tx.source,
    destination: tx.destination,
    amount: tx.amount,
    validated: tx.validated,
    usedDeliveredAmount: tx.usedDeliveredAmount ?? null,
    captureMode: 'minimal',
  };
}

function buildOutboundRawTxJson(params: {
  tx: SendTokenResult;
  sourceAddress: string;
  destinationAddress: string;
  currency: string;
  issuer: string;
  amount: number;
}): Record<string, unknown> {
  const { tx, sourceAddress, destinationAddress, currency, issuer, amount } = params;

  if (STORE_FULL_TX_JSON && tx.rawTx) {
    return tx.rawTx;
  }

  return {
    hash: tx.hash,
    transactionType: tx.transactionType ?? 'Payment',
    source: sourceAddress,
    destination: destinationAddress,
    amount: {
      currency,
      issuer,
      value: amount.toString(),
    },
    validated: true,
    txResult: tx.result,
    captureMode: 'minimal',
  };
}

type MarketRecord = NonNullable<Awaited<ReturnType<typeof getMarketById>>>;

function mapMarketRecordToDomain(market: MarketRecord): Market {
  return {
    id: market.id,
    name: market.name,
    collateralCurrency: market.collateral_currency,
    collateralIssuer: market.collateral_issuer,
    debtCurrency: market.debt_currency,
    debtIssuer: market.debt_issuer,
    maxLtvRatio: market.max_ltv_ratio,
    liquidationLtvRatio: market.liquidation_ltv_ratio,
    baseInterestRate: market.base_interest_rate,
    liquidationPenalty: market.liquidation_penalty,
    minCollateralAmount: market.min_collateral_amount,
    minBorrowAmount: market.min_borrow_amount,
    minSupplyAmount: market.min_supply_amount,
    totalSupplied: market.total_supplied,
    totalBorrowed: market.total_borrowed,
    globalYieldIndex: market.global_yield_index,
    reserveFactor: market.reserve_factor,
    lastIndexUpdate: market.last_index_update,
  };
}

/**
 * Verify and process a deposit transaction
 */
export async function processDeposit(
  txHash: string,
  senderAddress: string,
  marketId: string,
  idempotencyKey?: string
): Promise<{ result?: DepositResult; error?: LendingServiceError }> {
  // Check for replay
  if (await isTransactionProcessed(txHash)) {
    return { error: createError('TX_ALREADY_PROCESSED', 'This transaction has already been processed') };
  }

  // Get market
  const market = await getMarketById(marketId);
  if (!market) {
    return { error: createError('MARKET_NOT_FOUND', 'Market not found or inactive') };
  }

  // Emit pending event
  const event = await emitAppEvent({
    eventType: LENDING_EVENTS.DEPOSIT_INITIATED,
    module: 'LENDING',
    status: 'PENDING',
    userAddress: senderAddress,
    marketId,
    idempotencyKey,
    payload: { txHash },
  });

  try {
    const client = await getClient();
    const tx = await verifyTransaction(client, txHash);

    // Validate transaction
    if (!tx.validated) {
      await updateEventStatus(event.id, 'FAILED', { code: 'TX_NOT_VALIDATED', message: 'Transaction not validated' });
      return { error: createError('TX_NOT_VALIDATED', 'Transaction not yet validated') };
    }

    const backendAddress = getBackendAddress();
    if (tx.destination !== backendAddress) {
      await updateEventStatus(event.id, 'FAILED', { code: 'WRONG_DESTINATION', message: 'Wrong destination' });
      return { error: createError('WRONG_DESTINATION', `Transaction must be sent to ${backendAddress}`) };
    }

    if (tx.transactionType !== 'Payment') {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'NOT_PAYMENT',
        message: 'Transaction must be a Payment',
      });
      return {
        error: createError('NOT_PAYMENT', `Expected Payment, got ${tx.transactionType}`),
      };
    }

    if (!tx.amount) {
      await updateEventStatus(event.id, 'FAILED', { code: 'NO_AMOUNT', message: 'Could not determine amount' });
      return { error: createError('NO_AMOUNT', 'Could not determine transaction amount') };
    }

    if (!isExpectedCurrency(tx.amount.currency, market.collateral_currency)) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'WRONG_CURRENCY',
        message: `Expected ${market.collateral_currency}`,
      });
      return {
        error: createError(
          'WRONG_CURRENCY',
          `Expected ${market.collateral_currency}, got ${tx.amount.currency}`
        ),
      };
    }

    if (tx.amount.currency !== 'XRP' && tx.amount.issuer !== market.collateral_issuer) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'WRONG_ISSUER',
        message: `Expected issuer ${market.collateral_issuer}`,
      });
      return {
        error: createError(
          'WRONG_ISSUER',
          `Expected issuer ${market.collateral_issuer}, got ${tx.amount.issuer}`
        ),
      };
    }

    if (tx.source !== senderAddress) {
      await updateEventStatus(event.id, 'FAILED', { code: 'SENDER_MISMATCH', message: 'Sender mismatch' });
      return { error: createError('SENDER_MISMATCH', 'Transaction sender does not match') };
    }

    const amount = parseFloat(tx.amount.value);
    if (amount < market.min_collateral_amount) {
      await updateEventStatus(event.id, 'FAILED', { code: 'BELOW_MINIMUM', message: 'Below minimum' });
      return {
        error: createError(
          'BELOW_MINIMUM',
          `Minimum deposit is ${market.min_collateral_amount} ${market.collateral_currency}`
        ),
      };
    }

    // Record on-chain transaction
    const onchainTx = await upsertOnchainTransaction({
      txHash,
      validated: tx.validated,
      txType: tx.transactionType,
      sourceAddress: tx.source,
      destinationAddress: tx.destination,
      currency: tx.amount.currency,
      issuer: tx.amount.issuer,
      amount,
      rawTxJson: buildInboundRawTxJson(tx),
      rawMetaJson: tx.rawMeta || null,
    });

    // Create or update position
    const position = await getOrCreatePosition(senderAddress, marketId, market.base_interest_rate);
    const updatedPosition = await addCollateral(position.id, amount);

    // Update event
    await updateEventStatus(event.id, 'COMPLETED');
    await emitAppEvent({
      eventType: LENDING_EVENTS.DEPOSIT_CONFIRMED,
      module: 'LENDING',
      status: 'COMPLETED',
      userAddress: senderAddress,
      marketId,
      positionId: updatedPosition.id,
      onchainTxId: onchainTx.id,
      amount,
      currency: market.collateral_currency,
    });

    return {
      result: {
        positionId: updatedPosition.id,
        collateralAmount: amount,
        newCollateralTotal: updatedPosition.collateralAmount,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await updateEventStatus(event.id, 'FAILED', { code: 'INTERNAL_ERROR', message });
    return { error: createError('INTERNAL_ERROR', message) };
  }
}

/**
 * Process a borrow request
 */
export async function processBorrow(
  userAddress: string,
  marketId: string,
  amount: number,
  idempotencyKey?: string
): Promise<{ result?: BorrowResult; error?: LendingServiceError }> {
  const market = await getMarketById(marketId);
  if (!market) {
    return { error: createError('MARKET_NOT_FOUND', 'Market not found or inactive') };
  }

  // === IDEMPOTENCY: Atomic acquisition ===
  let event: AppEventRow;

  if (idempotencyKey) {
    const acquireResult = await acquireIdempotencyKey({
      eventType: LENDING_EVENTS.BORROW_INITIATED,
      module: 'LENDING',
      status: 'PENDING',
      userAddress,
      marketId,
      idempotencyKey,
      amount,
      currency: market.debt_currency,
      payload: {},
    });

    if (!acquireResult.acquired) {
      // Key already exists - check status
      const existingEvent = acquireResult.event;

      // Validate operation identity
      if (!validateIdempotencyIdentity(existingEvent, {
        eventType: LENDING_EVENTS.BORROW_INITIATED,
        userAddress,
        marketId,
      })) {
        return { error: createError('IDEMPOTENCY_MISMATCH', 'Idempotency key used for different operation') };
      }

      if (acquireResult.status === 'COMPLETED') {
        const storedResult = reconstructResult<BorrowResult>(existingEvent);
        if (storedResult) return { result: storedResult };
        return { error: createError('ALREADY_COMPLETED', 'Operation completed but result unavailable') };
      }

      if (acquireResult.status === 'PENDING') {
        return { error: createError('OPERATION_IN_PROGRESS', 'Operation already in progress') };
      }

      // FAILED - allow retry by using this event
      event = existingEvent;
      // Reset status to PENDING for retry
      await updateEventStatus(event.id, 'PENDING');
    } else {
      event = acquireResult.event;
    }
  } else {
    // No idempotency key - create event normally
    event = await emitAppEvent({
      eventType: LENDING_EVENTS.BORROW_INITIATED,
      module: 'LENDING',
      status: 'PENDING',
      userAddress,
      marketId,
      amount,
      currency: market.debt_currency,
    });
  }
  // === END IDEMPOTENCY ===

  const prices = await getMarketPrices(marketId);
  if (!prices) {
    return { error: createError('PRICES_NOT_FOUND', 'Market prices not available') };
  }

  if (amount < market.min_borrow_amount) {
    return {
      error: createError(
        'BELOW_MINIMUM',
        `Minimum borrow is ${market.min_borrow_amount} ${market.debt_currency}`
      ),
    };
  }

  // Get position
  const position = await getPositionForUser(userAddress, marketId);
  if (!position) {
    return { error: createError('NO_POSITION', 'No active position found. Deposit collateral first.') };
  }

  // Accrue interest
  const updatedPosition = await accrueInterest(position);
  const totalDebt = calculateTotalDebt(updatedPosition.loanPrincipal, updatedPosition.interestAccrued);

  // Validate LTV
  const canBorrow = validateBorrow(
    updatedPosition.collateralAmount,
    prices.collateralPriceUsd,
    totalDebt,
    amount,
    prices.debtPriceUsd,
    market.max_ltv_ratio
  );

  if (!canBorrow) {
    return {
      error: createError(
        'EXCEEDS_MAX_LTV',
        `Borrow would exceed maximum LTV of ${market.max_ltv_ratio * 100}%`
      ),
    };
  }

  const availableLiquidity = await getAvailableLiquidity(marketId);
  if (amount > availableLiquidity) {
    return {
      error: createError(
        'INSUFFICIENT_POOL_LIQUIDITY',
        `Borrow amount exceeds pool liquidity (${availableLiquidity} ${market.debt_currency})`
      ),
    };
  }

  try {
    // Send debt tokens to user
    const client = await getClient();
    const backendWallet = getBackendWallet();
    const issuerAddress = getIssuerAddress();

    const tx = await sendToken(
      client,
      backendWallet,
      userAddress,
      market.debt_currency,
      amount.toString(),
      issuerAddress
    );

    if (tx.result !== 'tesSUCCESS') {
      await updateEventStatus(event.id, 'FAILED', { code: 'TX_FAILED', message: tx.result });
      return { error: createError('TX_FAILED', `Failed to send tokens: ${tx.result}`) };
    }

    // Record on-chain transaction
    await upsertOnchainTransaction({
      txHash: tx.hash,
      validated: true,
      txType: tx.transactionType ?? 'Payment',
      sourceAddress: backendWallet.address,
      destinationAddress: userAddress,
      currency: market.debt_currency,
      issuer: issuerAddress,
      amount,
      rawTxJson: buildOutboundRawTxJson({
        tx,
        sourceAddress: backendWallet.address,
        destinationAddress: userAddress,
        currency: market.debt_currency,
        issuer: issuerAddress,
        amount,
      }),
      rawMetaJson: tx.rawMeta || null,
    });

    // Update position
    await updateGlobalYieldIndex(marketId);
    await addToTotalBorrowed(marketId, amount);
    const finalPosition = await addLoanPrincipal(position.id, amount);

    const borrowResult: BorrowResult = {
      positionId: finalPosition.id,
      borrowedAmount: amount,
      newLoanPrincipal: finalPosition.loanPrincipal,
      txHash: tx.hash,
    };

    // Complete idempotency event with result
    if (idempotencyKey) {
      await completeIdempotencyEvent(event.id, { result: borrowResult });
    } else {
      await updateEventStatus(event.id, 'COMPLETED');
    }

    // Emit separate audit event (no idempotency key)
    await emitAppEvent({
      eventType: LENDING_EVENTS.BORROW_COMPLETED,
      module: 'LENDING',
      status: 'COMPLETED',
      userAddress,
      marketId,
      positionId: position.id,
      amount,
      currency: market.debt_currency,
      payload: { txHash: tx.hash },
    });

    return { result: borrowResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await updateEventStatus(event.id, 'FAILED', { code: 'INTERNAL_ERROR', message });
    return { error: createError('INTERNAL_ERROR', message) };
  }
}

/**
 * Verify and process a repayment transaction
 */
export async function processRepay(
  txHash: string,
  senderAddress: string,
  marketId: string,
  idempotencyKey?: string
): Promise<{ result?: RepayResult; error?: LendingServiceError }> {
  // Check for replay
  if (await isTransactionProcessed(txHash)) {
    return { error: createError('TX_ALREADY_PROCESSED', 'This transaction has already been processed') };
  }

  const market = await getMarketById(marketId);
  if (!market) {
    return { error: createError('MARKET_NOT_FOUND', 'Market not found or inactive') };
  }

  // Emit pending event
  const event = await emitAppEvent({
    eventType: LENDING_EVENTS.REPAY_INITIATED,
    module: 'LENDING',
    status: 'PENDING',
    userAddress: senderAddress,
    marketId,
    idempotencyKey,
    payload: { txHash },
  });

  try {
    const client = await getClient();
    const tx = await verifyTransaction(client, txHash);

    if (!tx.validated) {
      await updateEventStatus(event.id, 'FAILED', { code: 'TX_NOT_VALIDATED', message: 'Not validated' });
      return { error: createError('TX_NOT_VALIDATED', 'Transaction not yet validated') };
    }

    const backendAddress = getBackendAddress();
    if (tx.destination !== backendAddress) {
      await updateEventStatus(event.id, 'FAILED', { code: 'WRONG_DESTINATION', message: 'Wrong destination' });
      return { error: createError('WRONG_DESTINATION', `Transaction must be sent to ${backendAddress}`) };
    }

    if (tx.transactionType !== 'Payment') {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'NOT_PAYMENT',
        message: 'Transaction must be a Payment',
      });
      return {
        error: createError('NOT_PAYMENT', `Expected Payment, got ${tx.transactionType}`),
      };
    }

    if (!tx.amount) {
      await updateEventStatus(event.id, 'FAILED', { code: 'NO_AMOUNT', message: 'No amount' });
      return { error: createError('NO_AMOUNT', 'Could not determine transaction amount') };
    }

    if (!isExpectedCurrency(tx.amount.currency, market.debt_currency)) {
      await updateEventStatus(event.id, 'FAILED', { code: 'WRONG_CURRENCY', message: 'Wrong currency' });
      return {
        error: createError(
          'WRONG_CURRENCY',
          `Expected ${market.debt_currency}, got ${tx.amount.currency}`
        ),
      };
    }

    if (tx.amount.currency !== 'XRP' && tx.amount.issuer !== market.debt_issuer) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'WRONG_ISSUER',
        message: `Expected issuer ${market.debt_issuer}`,
      });
      return {
        error: createError(
          'WRONG_ISSUER',
          `Expected issuer ${market.debt_issuer}, got ${tx.amount.issuer}`
        ),
      };
    }

    if (tx.source !== senderAddress) {
      await updateEventStatus(event.id, 'FAILED', { code: 'SENDER_MISMATCH', message: 'Sender mismatch' });
      return { error: createError('SENDER_MISMATCH', 'Transaction sender does not match') };
    }

    // Get position
    const position = await getPositionForUser(senderAddress, marketId);
    if (!position) {
      await updateEventStatus(event.id, 'FAILED', { code: 'NO_POSITION', message: 'No position' });
      return { error: createError('NO_POSITION', 'No active position found') };
    }

    // Accrue interest first
    const updatedPosition = await accrueInterest(position);

    const amount = parseFloat(tx.amount.value);
    const { interestPaid, principalPaid, excess } = allocateRepayment(
      amount,
      updatedPosition.interestAccrued,
      updatedPosition.loanPrincipal
    );

    // Record on-chain transaction
    const onchainTx = await upsertOnchainTransaction({
      txHash,
      validated: tx.validated,
      txType: tx.transactionType,
      sourceAddress: tx.source,
      destinationAddress: tx.destination,
      currency: tx.amount.currency,
      issuer: tx.amount.issuer,
      amount,
      rawTxJson: buildInboundRawTxJson(tx),
      rawMetaJson: tx.rawMeta || null,
    });

    // Apply repayment
    await updateGlobalYieldIndex(marketId);
    if (principalPaid > 0) {
      await removeFromTotalBorrowed(marketId, principalPaid);
    }
    const finalPosition = await applyRepayment(position.id, interestPaid, principalPaid);
    const remainingDebt = calculateTotalDebt(finalPosition.loanPrincipal, finalPosition.interestAccrued);

    // Update event
    await updateEventStatus(event.id, 'COMPLETED');
    await emitAppEvent({
      eventType: LENDING_EVENTS.REPAY_CONFIRMED,
      module: 'LENDING',
      status: 'COMPLETED',
      userAddress: senderAddress,
      marketId,
      positionId: position.id,
      onchainTxId: onchainTx.id,
      amount,
      currency: market.debt_currency,
      payload: { interestPaid, principalPaid, excess },
    });

    return {
      result: {
        positionId: finalPosition.id,
        amountRepaid: amount,
        interestPaid,
        principalPaid,
        remainingDebt,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await updateEventStatus(event.id, 'FAILED', { code: 'INTERNAL_ERROR', message });
    return { error: createError('INTERNAL_ERROR', message) };
  }
}

/**
 * Process a withdrawal request
 */
export async function processWithdraw(
  userAddress: string,
  marketId: string,
  amount: number,
  idempotencyKey?: string
): Promise<{ result?: WithdrawResult; error?: LendingServiceError }> {
  const market = await getMarketById(marketId);
  if (!market) {
    return { error: createError('MARKET_NOT_FOUND', 'Market not found or inactive') };
  }

  // === IDEMPOTENCY: Atomic acquisition ===
  let event: AppEventRow;

  if (idempotencyKey) {
    const acquireResult = await acquireIdempotencyKey({
      eventType: LENDING_EVENTS.WITHDRAW_INITIATED,
      module: 'LENDING',
      status: 'PENDING',
      userAddress,
      marketId,
      idempotencyKey,
      amount,
      currency: market.collateral_currency,
      payload: {},
    });

    if (!acquireResult.acquired) {
      // Key already exists - check status
      const existingEvent = acquireResult.event;

      // Validate operation identity
      if (!validateIdempotencyIdentity(existingEvent, {
        eventType: LENDING_EVENTS.WITHDRAW_INITIATED,
        userAddress,
        marketId,
      })) {
        return { error: createError('IDEMPOTENCY_MISMATCH', 'Idempotency key used for different operation') };
      }

      if (acquireResult.status === 'COMPLETED') {
        const storedResult = reconstructResult<WithdrawResult>(existingEvent);
        if (storedResult) return { result: storedResult };
        return { error: createError('ALREADY_COMPLETED', 'Operation completed but result unavailable') };
      }

      if (acquireResult.status === 'PENDING') {
        return { error: createError('OPERATION_IN_PROGRESS', 'Operation already in progress') };
      }

      // FAILED - allow retry by using this event
      event = existingEvent;
      // Reset status to PENDING for retry
      await updateEventStatus(event.id, 'PENDING');
    } else {
      event = acquireResult.event;
    }
  } else {
    // No idempotency key - create event normally
    event = await emitAppEvent({
      eventType: LENDING_EVENTS.WITHDRAW_INITIATED,
      module: 'LENDING',
      status: 'PENDING',
      userAddress,
      marketId,
      amount,
      currency: market.collateral_currency,
    });
  }
  // === END IDEMPOTENCY ===

  const prices = await getMarketPrices(marketId);
  if (!prices) {
    return { error: createError('PRICES_NOT_FOUND', 'Market prices not available') };
  }

  // Get position
  const position = await getPositionForUser(userAddress, marketId);
  if (!position) {
    return { error: createError('NO_POSITION', 'No active position found') };
  }

  if (amount > position.collateralAmount) {
    return { error: createError('INSUFFICIENT_COLLATERAL', 'Insufficient collateral balance') };
  }

  // Accrue interest
  const updatedPosition = await accrueInterest(position);
  const totalDebt = calculateTotalDebt(updatedPosition.loanPrincipal, updatedPosition.interestAccrued);

  // Validate LTV after withdrawal
  const canWithdraw = validateWithdrawal(
    updatedPosition.collateralAmount,
    amount,
    prices.collateralPriceUsd,
    totalDebt,
    prices.debtPriceUsd,
    market.max_ltv_ratio
  );

  if (!canWithdraw) {
    return {
      error: createError(
        'EXCEEDS_MAX_LTV',
        `Withdrawal would exceed maximum LTV of ${market.max_ltv_ratio * 100}%`
      ),
    };
  }

  try {
    // Send collateral back to user
    const client = await getClient();
    const backendWallet = getBackendWallet();
    const issuerAddress = getIssuerAddress();

    const tx = await sendToken(
      client,
      backendWallet,
      userAddress,
      market.collateral_currency,
      amount.toString(),
      issuerAddress
    );

    if (tx.result !== 'tesSUCCESS') {
      await updateEventStatus(event.id, 'FAILED', { code: 'TX_FAILED', message: tx.result });
      return { error: createError('TX_FAILED', `Failed to send tokens: ${tx.result}`) };
    }

    // Record on-chain transaction
    await upsertOnchainTransaction({
      txHash: tx.hash,
      validated: true,
      txType: tx.transactionType ?? 'Payment',
      sourceAddress: backendWallet.address,
      destinationAddress: userAddress,
      currency: market.collateral_currency,
      issuer: issuerAddress,
      amount,
      rawTxJson: buildOutboundRawTxJson({
        tx,
        sourceAddress: backendWallet.address,
        destinationAddress: userAddress,
        currency: market.collateral_currency,
        issuer: issuerAddress,
        amount,
      }),
      rawMetaJson: tx.rawMeta || null,
    });

    // Update position
    const finalPosition = await removeCollateral(position.id, amount);

    const withdrawResult: WithdrawResult = {
      positionId: finalPosition.id,
      withdrawnAmount: amount,
      remainingCollateral: finalPosition.collateralAmount,
      txHash: tx.hash,
    };

    // Complete idempotency event with result
    if (idempotencyKey) {
      await completeIdempotencyEvent(event.id, { result: withdrawResult });
    } else {
      await updateEventStatus(event.id, 'COMPLETED');
    }

    // Emit separate audit event (no idempotency key)
    await emitAppEvent({
      eventType: LENDING_EVENTS.WITHDRAW_COMPLETED,
      module: 'LENDING',
      status: 'COMPLETED',
      userAddress,
      marketId,
      positionId: position.id,
      amount,
      currency: market.collateral_currency,
      payload: { txHash: tx.hash },
    });

    return { result: withdrawResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await updateEventStatus(event.id, 'FAILED', { code: 'INTERNAL_ERROR', message });
    return { error: createError('INTERNAL_ERROR', message) };
  }
}

/**
 * Process liquidation of unhealthy positions
 */
export async function processLiquidation(
  marketId: string,
  userAddress?: string,
  limit: number = 10
): Promise<{ results: LiquidationResult[]; errors: LendingServiceError[] }> {
  const market = await getMarketById(marketId);
  if (!market) {
    return { results: [], errors: [createError('MARKET_NOT_FOUND', 'Market not found')] };
  }

  const prices = await getMarketPrices(marketId);
  if (!prices) {
    return { results: [], errors: [createError('PRICES_NOT_FOUND', 'Prices not available')] };
  }

  const results: LiquidationResult[] = [];
  const errors: LendingServiceError[] = [];

  // Get liquidatable positions
  let positions: Position[];
  if (userAddress) {
    const position = await getPositionForUser(userAddress, marketId);
    if (
      position &&
      checkPositionLiquidatable(
        position,
        market.liquidation_ltv_ratio,
        prices.collateralPriceUsd,
        prices.debtPriceUsd
      )
    ) {
      positions = [position];
    } else {
      positions = [];
    }
  } else {
    positions = await getLiquidatablePositions(
      marketId,
      market.liquidation_ltv_ratio,
      prices.collateralPriceUsd,
      prices.debtPriceUsd,
      limit
    );
  }

  for (const position of positions) {
    // Emit event
    const event = await emitAppEvent({
      eventType: LENDING_EVENTS.LIQUIDATION_TRIGGERED,
      module: 'LENDING',
      status: 'PENDING',
      positionId: position.id,
      marketId,
    });

    try {
      // Accrue interest
      const updatedPosition = await accrueInterest(position);
      const totalDebt = calculateTotalDebt(updatedPosition.loanPrincipal, updatedPosition.interestAccrued);

      // Calculate collateral to seize
      const collateralToSeize = calculateLiquidationCollateral(
        totalDebt,
        prices.debtPriceUsd,
        prices.collateralPriceUsd,
        market.liquidation_penalty
      );

      const actualSeized = Math.min(collateralToSeize, updatedPosition.collateralAmount);
      const penalty = actualSeized * market.liquidation_penalty;

      // Mark position as liquidated
      if (updatedPosition.loanPrincipal > 0) {
        await updateGlobalYieldIndex(marketId);
        await removeFromTotalBorrowed(marketId, updatedPosition.loanPrincipal);
      }
      await markLiquidated(position.id);

      // Update event
      await updateEventStatus(event.id, 'COMPLETED');
      await emitAppEvent({
        eventType: LENDING_EVENTS.LIQUIDATION_COMPLETED,
        module: 'LENDING',
        status: 'COMPLETED',
        positionId: position.id,
        marketId,
        payload: { collateralSeized: actualSeized, debtRepaid: totalDebt, penalty },
      });

      results.push({
        positionId: position.id,
        collateralSeized: actualSeized,
        debtRepaid: totalDebt,
        penalty,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await updateEventStatus(event.id, 'FAILED', { code: 'LIQUIDATION_FAILED', message });
      errors.push(createError('LIQUIDATION_FAILED', `Position ${position.id}: ${message}`));
    }
  }

  return { results, errors };
}

/**
 * Get position with metrics
 */
export async function getPositionWithMetrics(
  userAddress: string,
  marketId: string
): Promise<{ position: Position; metrics: PositionMetrics; market: Market } | null> {
  const market = await getMarketById(marketId);
  if (!market) {
    return null;
  }

  const position = await getPositionForUser(userAddress, marketId);
  if (!position) {
    return null;
  }

  const prices = await getMarketPrices(marketId);
  if (!prices) {
    return null;
  }

  const marketData = mapMarketRecordToDomain(market);

  const metrics = calculatePositionMetrics(
    position,
    marketData,
    prices.collateralPriceUsd,
    prices.debtPriceUsd
  );

  return { position, metrics, market: marketData };
}

function buildSupplyPositionMetrics(position: SupplyPosition, pool: PoolMetrics): SupplyPositionMetrics {
  const accruedYield = toAmount(accrueSupplyYield(position, pool.globalYieldIndex));
  const withdrawableAmount = toAmount(new Decimal(position.supplyAmount).add(accruedYield));

  return {
    accruedYield,
    withdrawableAmount,
    availableLiquidity: pool.availableLiquidity,
    utilizationRate: pool.utilizationRate,
    supplyApr: pool.supplyApr,
    supplyApy: pool.supplyApy,
  };
}

/**
 * Verify and process a supplier liquidity transaction.
 */
export async function processSupply(
  txHash: string,
  senderAddress: string,
  marketId: string,
  idempotencyKey?: string
): Promise<{ result?: SupplyResult; error?: LendingServiceError }> {
  const market = await getMarketById(marketId);
  if (!market) {
    return { error: createError('MARKET_NOT_FOUND', 'Market not found or inactive') };
  }

  let event: AppEventRow;

  if (idempotencyKey) {
    const acquireResult = await acquireIdempotencyKey({
      eventType: LENDING_EVENTS.SUPPLY_INITIATED,
      module: 'LENDING',
      status: 'PENDING',
      userAddress: senderAddress,
      marketId,
      idempotencyKey,
      currency: market.debt_currency,
      payload: { txHash },
    });

    if (!acquireResult.acquired) {
      const existingEvent = acquireResult.event;

      if (!validateIdempotencyIdentity(existingEvent, {
        eventType: LENDING_EVENTS.SUPPLY_INITIATED,
        userAddress: senderAddress,
        marketId,
      })) {
        return { error: createError('IDEMPOTENCY_MISMATCH', 'Idempotency key used for different operation') };
      }

      if (acquireResult.status === 'COMPLETED') {
        const storedResult = reconstructResult<SupplyResult>(existingEvent);
        if (storedResult) {
          return { result: storedResult };
        }

        return { error: createError('ALREADY_COMPLETED', 'Operation completed but result unavailable') };
      }

      if (acquireResult.status === 'PENDING') {
        return { error: createError('OPERATION_IN_PROGRESS', 'Operation already in progress') };
      }

      event = existingEvent;
      await updateEventStatus(event.id, 'PENDING');
    } else {
      event = acquireResult.event;
    }
  } else {
    event = await emitAppEvent({
      eventType: LENDING_EVENTS.SUPPLY_INITIATED,
      module: 'LENDING',
      status: 'PENDING',
      userAddress: senderAddress,
      marketId,
      currency: market.debt_currency,
      payload: { txHash },
    });
  }

  if (await isTransactionProcessed(txHash)) {
    await updateEventStatus(event.id, 'FAILED', {
      code: 'TX_ALREADY_PROCESSED',
      message: 'This transaction has already been processed',
    });
    return { error: createError('TX_ALREADY_PROCESSED', 'This transaction has already been processed') };
  }

  try {
    const client = await getClient();
    const tx = await verifyTransaction(client, txHash);

    if (!tx.validated) {
      await updateEventStatus(event.id, 'FAILED', { code: 'TX_NOT_VALIDATED', message: 'Transaction not validated' });
      return { error: createError('TX_NOT_VALIDATED', 'Transaction not yet validated') };
    }

    if (tx.transactionType !== 'Payment') {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'NOT_PAYMENT',
        message: `Expected Payment, got ${tx.transactionType}`,
      });
      return { error: createError('NOT_PAYMENT', `Expected Payment, got ${tx.transactionType}`) };
    }

    const backendAddress = getBackendAddress();
    if (tx.destination !== backendAddress) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'WRONG_DESTINATION',
        message: `Transaction must be sent to ${backendAddress}`,
      });
      return { error: createError('WRONG_DESTINATION', `Transaction must be sent to ${backendAddress}`) };
    }

    if (!tx.amount) {
      await updateEventStatus(event.id, 'FAILED', { code: 'NO_AMOUNT', message: 'Could not determine amount' });
      return { error: createError('NO_AMOUNT', 'Could not determine transaction amount') };
    }

    if (!isExpectedCurrency(tx.amount.currency, market.debt_currency)) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'WRONG_CURRENCY',
        message: `Expected ${market.debt_currency}, got ${tx.amount.currency}`,
      });
      return {
        error: createError('WRONG_CURRENCY', `Expected ${market.debt_currency}, got ${tx.amount.currency}`),
      };
    }

    if (tx.amount.currency !== 'XRP' && tx.amount.issuer !== market.debt_issuer) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'WRONG_ISSUER',
        message: `Expected issuer ${market.debt_issuer}, got ${tx.amount.issuer}`,
      });
      return {
        error: createError('WRONG_ISSUER', `Expected issuer ${market.debt_issuer}, got ${tx.amount.issuer}`),
      };
    }

    if (tx.source !== senderAddress) {
      await updateEventStatus(event.id, 'FAILED', { code: 'SENDER_MISMATCH', message: 'Sender mismatch' });
      return { error: createError('SENDER_MISMATCH', 'Transaction sender does not match') };
    }

    const amount = parseFloat(tx.amount.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'INVALID_AMOUNT',
        message: 'Supply amount must be positive',
      });
      return { error: createError('INVALID_AMOUNT', 'Supply amount must be positive') };
    }

    if (amount < market.min_supply_amount) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'BELOW_MINIMUM',
        message: `Minimum supply is ${market.min_supply_amount} ${market.debt_currency}`,
      });
      return {
        error: createError(
          'BELOW_MINIMUM',
          `Minimum supply is ${market.min_supply_amount} ${market.debt_currency}`
        ),
      };
    }

    const onchainTx = await upsertOnchainTransaction({
      txHash,
      validated: tx.validated,
      txType: tx.transactionType,
      sourceAddress: tx.source,
      destinationAddress: tx.destination,
      currency: tx.amount.currency,
      issuer: tx.amount.issuer,
      amount,
      rawTxJson: {
        ...buildInboundRawTxJson(tx),
        operation: 'SUPPLY',
      },
      rawMetaJson: tx.rawMeta || null,
    });

    const { globalYieldIndex } = await updateGlobalYieldIndex(marketId);
    const supplyPosition = await getOrCreateSupplyPosition(
      senderAddress,
      marketId,
      globalYieldIndex
    );
    const updatedSupplyPosition = await addSupply(supplyPosition.id, amount, globalYieldIndex);
    await addToTotalSupplied(marketId, amount);

    const supplyResult: SupplyResult = {
      marketId,
      supplyPositionId: updatedSupplyPosition.id,
      suppliedAmount: amount,
    };

    if (idempotencyKey) {
      await completeIdempotencyEvent(event.id, { result: supplyResult });
    } else {
      await updateEventStatus(event.id, 'COMPLETED');
    }

    await emitAppEvent({
      eventType: LENDING_EVENTS.SUPPLY_CONFIRMED,
      module: 'LENDING',
      status: 'COMPLETED',
      userAddress: senderAddress,
      marketId,
      onchainTxId: onchainTx.id,
      amount,
      currency: market.debt_currency,
      payload: {
        txHash,
        supplyPositionId: updatedSupplyPosition.id,
      },
    });

    return { result: supplyResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await updateEventStatus(event.id, 'FAILED', { code: 'SUPPLY_FAILED', message });
    return { error: createError('SUPPLY_FAILED', message) };
  }
}

/**
 * Collect accrued supplier yield and transfer to lender wallet.
 */
export async function processCollectYield(
  userAddress: string,
  marketId: string,
  idempotencyKey?: string
): Promise<{ result?: CollectYieldResult; error?: LendingServiceError }> {
  const market = await getMarketById(marketId);
  if (!market) {
    return { error: createError('MARKET_NOT_FOUND', 'Market not found or inactive') };
  }

  let event: AppEventRow;

  if (idempotencyKey) {
    const acquireResult = await acquireIdempotencyKey({
      eventType: LENDING_EVENTS.COLLECT_YIELD_INITIATED,
      module: 'LENDING',
      status: 'PENDING',
      userAddress,
      marketId,
      idempotencyKey,
      currency: market.debt_currency,
      payload: {},
    });

    if (!acquireResult.acquired) {
      const existingEvent = acquireResult.event;

      if (!validateIdempotencyIdentity(existingEvent, {
        eventType: LENDING_EVENTS.COLLECT_YIELD_INITIATED,
        userAddress,
        marketId,
      })) {
        return { error: createError('IDEMPOTENCY_MISMATCH', 'Idempotency key used for different operation') };
      }

      if (acquireResult.status === 'COMPLETED') {
        const storedResult = reconstructResult<CollectYieldResult>(existingEvent);
        if (storedResult) {
          return { result: storedResult };
        }

        return { error: createError('ALREADY_COMPLETED', 'Operation completed but result unavailable') };
      }

      if (acquireResult.status === 'PENDING') {
        return { error: createError('OPERATION_IN_PROGRESS', 'Operation already in progress') };
      }

      event = existingEvent;
      await updateEventStatus(event.id, 'PENDING');
    } else {
      event = acquireResult.event;
    }
  } else {
    event = await emitAppEvent({
      eventType: LENDING_EVENTS.COLLECT_YIELD_INITIATED,
      module: 'LENDING',
      status: 'PENDING',
      userAddress,
      marketId,
      currency: market.debt_currency,
    });
  }

  const position = await getSupplyPositionForUser(userAddress, marketId);
  if (!position) {
    await updateEventStatus(event.id, 'FAILED', { code: 'NO_SUPPLY_POSITION', message: 'No active supply position found' });
    return { error: createError('NO_SUPPLY_POSITION', 'No active supply position found') };
  }

  try {
    const { globalYieldIndex } = await updateGlobalYieldIndex(marketId);
    const refreshedPosition = await getSupplyPositionForUser(userAddress, marketId);

    if (!refreshedPosition) {
      await updateEventStatus(event.id, 'FAILED', { code: 'NO_SUPPLY_POSITION', message: 'No active supply position found' });
      return { error: createError('NO_SUPPLY_POSITION', 'No active supply position found') };
    }

    const accruedYield = toAmount(calculateAccruedSupplyYield(
      refreshedPosition.supplyAmount,
      globalYieldIndex,
      refreshedPosition.yieldIndex
    ));

    if (accruedYield <= 0) {
      const zeroResult: CollectYieldResult = {
        marketId,
        supplyPositionId: refreshedPosition.id,
        collectedAmount: 0,
        txHash: null,
      };

      await checkpointSupplyYield(refreshedPosition.id, globalYieldIndex);

      if (idempotencyKey) {
        await completeIdempotencyEvent(event.id, { result: zeroResult });
      } else {
        await updateEventStatus(event.id, 'COMPLETED');
      }

      await emitAppEvent({
        eventType: LENDING_EVENTS.COLLECT_YIELD_COMPLETED,
        module: 'LENDING',
        status: 'COMPLETED',
        userAddress,
        marketId,
        amount: 0,
        currency: market.debt_currency,
        payload: { txHash: null, supplyPositionId: refreshedPosition.id },
      });

      return { result: zeroResult };
    }

    const client = await getClient();
    const backendWallet = getBackendWallet();
    const tx = await sendToken(
      client,
      backendWallet,
      userAddress,
      market.debt_currency,
      accruedYield.toString(),
      market.debt_issuer
    );

    if (tx.result !== 'tesSUCCESS') {
      await updateEventStatus(event.id, 'FAILED', { code: 'TX_FAILED', message: tx.result });
      return { error: createError('TX_FAILED', `Failed to send tokens: ${tx.result}`) };
    }

    const onchainTx = await upsertOnchainTransaction({
      txHash: tx.hash,
      validated: true,
      txType: tx.transactionType ?? 'Payment',
      sourceAddress: backendWallet.address,
      destinationAddress: userAddress,
      currency: market.debt_currency,
      issuer: market.debt_issuer,
      amount: accruedYield,
      rawTxJson: {
        ...buildOutboundRawTxJson({
          tx,
          sourceAddress: backendWallet.address,
          destinationAddress: userAddress,
          currency: market.debt_currency,
          issuer: market.debt_issuer,
          amount: accruedYield,
        }),
        operation: 'COLLECT_YIELD',
      },
      rawMetaJson: tx.rawMeta || null,
    });

    await checkpointSupplyYield(refreshedPosition.id, globalYieldIndex);

    const collectResult: CollectYieldResult = {
      marketId,
      supplyPositionId: refreshedPosition.id,
      collectedAmount: accruedYield,
      txHash: tx.hash,
    };

    if (idempotencyKey) {
      await completeIdempotencyEvent(event.id, { result: collectResult });
    } else {
      await updateEventStatus(event.id, 'COMPLETED');
    }

    await emitAppEvent({
      eventType: LENDING_EVENTS.COLLECT_YIELD_COMPLETED,
      module: 'LENDING',
      status: 'COMPLETED',
      userAddress,
      marketId,
      onchainTxId: onchainTx.id,
      amount: accruedYield,
      currency: market.debt_currency,
      payload: { txHash: tx.hash, supplyPositionId: refreshedPosition.id },
    });

    return { result: collectResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await updateEventStatus(event.id, 'FAILED', { code: 'COLLECT_YIELD_FAILED', message });
    return { error: createError('COLLECT_YIELD_FAILED', message) };
  }
}

/**
 * Withdraw supplied principal from the lending pool.
 */
export async function processWithdrawSupply(
  userAddress: string,
  marketId: string,
  amount: number,
  idempotencyKey?: string
): Promise<{ result?: WithdrawSupplyResult; error?: LendingServiceError }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: createError('INVALID_AMOUNT', 'Amount must be a positive number') };
  }

  const market = await getMarketById(marketId);
  if (!market) {
    return { error: createError('MARKET_NOT_FOUND', 'Market not found or inactive') };
  }

  let event: AppEventRow;

  if (idempotencyKey) {
    const acquireResult = await acquireIdempotencyKey({
      eventType: LENDING_EVENTS.WITHDRAW_SUPPLY_INITIATED,
      module: 'LENDING',
      status: 'PENDING',
      userAddress,
      marketId,
      idempotencyKey,
      amount,
      currency: market.debt_currency,
      payload: {},
    });

    if (!acquireResult.acquired) {
      const existingEvent = acquireResult.event;

      if (!validateIdempotencyIdentity(existingEvent, {
        eventType: LENDING_EVENTS.WITHDRAW_SUPPLY_INITIATED,
        userAddress,
        marketId,
      })) {
        return { error: createError('IDEMPOTENCY_MISMATCH', 'Idempotency key used for different operation') };
      }

      if (acquireResult.status === 'COMPLETED') {
        const storedResult = reconstructResult<WithdrawSupplyResult>(existingEvent);
        if (storedResult) {
          return { result: storedResult };
        }

        return { error: createError('ALREADY_COMPLETED', 'Operation completed but result unavailable') };
      }

      if (acquireResult.status === 'PENDING') {
        return { error: createError('OPERATION_IN_PROGRESS', 'Operation already in progress') };
      }

      event = existingEvent;
      await updateEventStatus(event.id, 'PENDING');
    } else {
      event = acquireResult.event;
    }
  } else {
    event = await emitAppEvent({
      eventType: LENDING_EVENTS.WITHDRAW_SUPPLY_INITIATED,
      module: 'LENDING',
      status: 'PENDING',
      userAddress,
      marketId,
      amount,
      currency: market.debt_currency,
    });
  }

  const position = await getSupplyPositionForUser(userAddress, marketId);
  if (!position) {
    await updateEventStatus(event.id, 'FAILED', { code: 'NO_SUPPLY_POSITION', message: 'No active supply position found' });
    return { error: createError('NO_SUPPLY_POSITION', 'No active supply position found') };
  }

  try {
    const { globalYieldIndex } = await updateGlobalYieldIndex(marketId);
    const refreshedPosition = await getSupplyPositionForUser(userAddress, marketId);
    if (!refreshedPosition) {
      await updateEventStatus(event.id, 'FAILED', { code: 'NO_SUPPLY_POSITION', message: 'No active supply position found' });
      return { error: createError('NO_SUPPLY_POSITION', 'No active supply position found') };
    }

    const accruedYield = toAmount(calculateAccruedSupplyYield(
      refreshedPosition.supplyAmount,
      globalYieldIndex,
      refreshedPosition.yieldIndex
    ));

    if (amount > refreshedPosition.supplyAmount) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'EXCEEDS_SUPPLIED_PRINCIPAL',
        message: 'Withdraw amount exceeds supplied principal',
      });
      return { error: createError('EXCEEDS_SUPPLIED_PRINCIPAL', 'Withdraw amount exceeds supplied principal') };
    }

    if (amount === refreshedPosition.supplyAmount && accruedYield > 0) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'COLLECT_YIELD_FIRST',
        message: 'Collect accrued yield before withdrawing full principal',
      });
      return {
        error: createError(
          'COLLECT_YIELD_FIRST',
          'Collect accrued yield before withdrawing full principal'
        ),
      };
    }

    const availableLiquidity = await getAvailableLiquidity(marketId);
    if (amount > availableLiquidity) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'INSUFFICIENT_POOL_LIQUIDITY',
        message: 'Insufficient pool liquidity',
      });
      return { error: createError('INSUFFICIENT_POOL_LIQUIDITY', 'Insufficient pool liquidity') };
    }

    const client = await getClient();
    const backendWallet = getBackendWallet();
    const tx = await sendToken(
      client,
      backendWallet,
      userAddress,
      market.debt_currency,
      amount.toString(),
      market.debt_issuer
    );

    if (tx.result !== 'tesSUCCESS') {
      await updateEventStatus(event.id, 'FAILED', { code: 'TX_FAILED', message: tx.result });
      return { error: createError('TX_FAILED', `Failed to send tokens: ${tx.result}`) };
    }

    const onchainTx = await upsertOnchainTransaction({
      txHash: tx.hash,
      validated: true,
      txType: tx.transactionType ?? 'Payment',
      sourceAddress: backendWallet.address,
      destinationAddress: userAddress,
      currency: market.debt_currency,
      issuer: market.debt_issuer,
      amount,
      rawTxJson: {
        ...buildOutboundRawTxJson({
          tx,
          sourceAddress: backendWallet.address,
          destinationAddress: userAddress,
          currency: market.debt_currency,
          issuer: market.debt_issuer,
          amount,
        }),
        operation: 'WITHDRAW_SUPPLY',
      },
      rawMetaJson: tx.rawMeta || null,
    });

    const updatedPosition = await removeSupply(refreshedPosition.id, amount, globalYieldIndex);
    await removeFromTotalSupplied(marketId, amount);

    const withdrawResult: WithdrawSupplyResult = {
      marketId,
      supplyPositionId: updatedPosition.id,
      withdrawnAmount: amount,
      remainingSupply: updatedPosition.supplyAmount,
      txHash: tx.hash,
    };

    if (idempotencyKey) {
      await completeIdempotencyEvent(event.id, { result: withdrawResult });
    } else {
      await updateEventStatus(event.id, 'COMPLETED');
    }

    await emitAppEvent({
      eventType: LENDING_EVENTS.WITHDRAW_SUPPLY_COMPLETED,
      module: 'LENDING',
      status: 'COMPLETED',
      userAddress,
      marketId,
      onchainTxId: onchainTx.id,
      amount,
      currency: market.debt_currency,
      payload: { txHash: tx.hash, supplyPositionId: updatedPosition.id },
    });

    return { result: withdrawResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await updateEventStatus(event.id, 'FAILED', { code: 'WITHDRAW_SUPPLY_FAILED', message });
    return { error: createError('WITHDRAW_SUPPLY_FAILED', message) };
  }
}

/**
 * Return a supplier position with derived pool and yield metrics.
 */
export async function getSupplyPositionWithMetrics(
  userAddress: string,
  marketId: string
): Promise<{
  position: SupplyPosition;
  metrics: SupplyPositionMetrics;
  pool: PoolMetrics;
  market: Market;
} | null> {
  const market = await getMarketById(marketId);
  if (!market) {
    return null;
  }

  await updateGlobalYieldIndex(marketId);

  const position = await getSupplyPositionForUser(userAddress, marketId);
  if (!position) {
    return null;
  }

  const pool = await getPoolMetrics(marketId);
  if (!pool) {
    return null;
  }

  const metrics = buildSupplyPositionMetrics(position, pool);

  return {
    position,
    metrics,
    pool,
    market: mapMarketRecordToDomain(market),
  };
}
