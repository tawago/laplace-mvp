/**
 * Lending Service
 *
 * Main service layer coordinating lending operations.
 * Handles deposit, borrow, repay, withdraw, and liquidation.
 * All database operations are async (Drizzle + Neon).
 */

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
import { emitAppEvent, updateEventStatus } from './events';
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
} from './calculations';
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
} from './types';

export interface LendingServiceError {
  code: string;
  message: string;
}

function createError(code: string, message: string): LendingServiceError {
  return { code, message };
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

    if (tx.amount.currency !== market.collateral_currency) {
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

  // Emit pending event
  const event = await emitAppEvent({
    eventType: LENDING_EVENTS.BORROW_INITIATED,
    module: 'LENDING',
    status: 'PENDING',
    userAddress,
    marketId,
    positionId: position.id,
    amount,
    currency: market.debt_currency,
    idempotencyKey,
  });

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
    const finalPosition = await addLoanPrincipal(position.id, amount);

    // Update event
    await updateEventStatus(event.id, 'COMPLETED');
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

    return {
      result: {
        positionId: finalPosition.id,
        borrowedAmount: amount,
        newLoanPrincipal: finalPosition.loanPrincipal,
        txHash: tx.hash,
      },
    };
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

    if (tx.amount.currency !== market.debt_currency) {
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

  // Emit pending event
  const event = await emitAppEvent({
    eventType: LENDING_EVENTS.WITHDRAW_INITIATED,
    module: 'LENDING',
    status: 'PENDING',
    userAddress,
    marketId,
    positionId: position.id,
    amount,
    currency: market.collateral_currency,
    idempotencyKey,
  });

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

    // Update event
    await updateEventStatus(event.id, 'COMPLETED');
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

    return {
      result: {
        positionId: finalPosition.id,
        withdrawnAmount: amount,
        remainingCollateral: finalPosition.collateralAmount,
        txHash: tx.hash,
      },
    };
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

  const marketData: Market = {
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
  };

  const metrics = calculatePositionMetrics(
    position,
    marketData,
    prices.collateralPriceUsd,
    prices.debtPriceUsd
  );

  return { position, metrics, market: marketData };
}
