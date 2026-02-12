/**
 * Lending Service
 *
 * Main service layer coordinating lending operations.
 * Handles deposit, borrow, repay, withdraw, and liquidation.
 * All database operations are async (Drizzle + Neon).
 */

import Decimal from 'decimal.js';
import type { Client } from 'xrpl';
import { Wallet } from 'xrpl';
import { eq } from 'drizzle-orm';
import { getClient } from '../xrpl/client';
import {
  getBackendWallet,
  getBackendAddress,
  getLoanBrokerWallet,
} from '../xrpl/wallet';
import {
  verifyTransaction,
  sendToken,
  type SendTokenResult,
  type TransactionVerification,
} from '../xrpl/tokens';
import { getMarketById, getMarketPrices } from '../db/seed';
import { db, markets } from '../db';
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
  addCollateral,
  removeCollateral,
  liquidatePosition as markLiquidated,
  calculatePositionMetrics,
  getLiquidatablePositions,
  checkPositionLiquidatable,
  setPositionEscrowMetadata,
  clearPositionEscrowMetadata,
  setPositionLoanMetadata,
  clearPositionLoanMetadata,
} from './positions';
import {
  validateBorrow,
  calculateLiquidationCollateral,
  calculateTotalDebt,
} from './calculations';
import {
  addToTotalBorrowed,
  getAvailableLiquidity,
  getPoolMetrics,
  removeFromTotalBorrowed,
  updateGlobalYieldIndex,
} from './pool';
import {
  addSupply,
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
import {
  checkVaultSupport,
  createSupplyVault,
  getSupplyVaultInfo,
  getSupplierShareBalance,
} from '../xrpl/vault';
import {
  checkLoanProtocolSupport,
  createLoanBroker,
  buildLoanSetTransaction,
  buildLoanPayTransaction,
  extractLoanSetResult,
  verifyLoanPayTransaction,
  getLoanInfo,
  LoanProtocolError,
  type LoanSetResult,
} from '../xrpl/loan';
import {
  finishEscrow,
  getEscrowInfo,
  verifyEscrowMatchesExpected,
  verifyConditionFulfillment,
} from '../xrpl/escrow';

export interface LendingServiceError {
  code: string;
  message: string;
}

export interface BorrowPrepareResult {
  unsignedTx: Record<string, unknown>;
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

function extractVaultIdFromRawTx(rawTx: Record<string, unknown> | null | undefined): string | null {
  if (!rawTx) return null;

  const direct = rawTx.VaultID;
  if (typeof direct === 'string' && direct.length > 0) {
    return direct;
  }

  const alt = rawTx.VaultId;
  if (typeof alt === 'string' && alt.length > 0) {
    return alt;
  }

  return null;
}

function extractMptIssuanceIdFromRawAmount(rawTx: Record<string, unknown> | null | undefined): string | null {
  if (!rawTx) return null;
  const amount = rawTx.Amount;
  if (!amount || typeof amount !== 'object') return null;

  const record = amount as Record<string, unknown>;
  const direct = record.mpt_issuance_id;
  if (typeof direct === 'string' && direct.length > 0) return direct;

  const alt1 = record.MPTokenIssuanceID;
  if (typeof alt1 === 'string' && alt1.length > 0) return alt1;

  const alt2 = record.MPTokenIssuanceId;
  if (typeof alt2 === 'string' && alt2.length > 0) return alt2;

  return null;
}

function extractTransactionResult(
  rawMeta: Record<string, unknown> | null | undefined
): string | null {
  if (!rawMeta) return null;
  const value = rawMeta.TransactionResult;
  return typeof value === 'string' ? value : null;
}

function extractEscrowSequence(rawTx: Record<string, unknown> | null | undefined): number | null {
  if (!rawTx) return null;
  const value = rawTx.Sequence;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function extractEscrowCondition(rawTx: Record<string, unknown> | null | undefined): string | null {
  if (!rawTx) return null;
  const value = rawTx.Condition;
  return typeof value === 'string' && value.length > 0 ? value.toUpperCase() : null;
}

function extractEscrowCancelAfter(rawTx: Record<string, unknown> | null | undefined): Date | null {
  if (!rawTx) return null;
  const value = rawTx.CancelAfter;
  if (typeof value !== 'number') {
    return null;
  }
  return new Date((value + 946684800) * 1000);
}

async function ensureMarketSupplyVaultConfigured(market: MarketRecord): Promise<MarketRecord> {
  if (market.supply_vault_id && market.supply_mpt_issuance_id) {
    return market;
  }

  const client = await getClient();
  const support = await checkVaultSupport(client);
  if (!support.enabled) {
    throw new Error(support.reason || 'XRPL vault support is not enabled on this network');
  }

  const backendWallet = getBackendWallet();
  const created = await createSupplyVault(backendWallet, {
    currency: market.debt_currency,
    issuer: market.debt_issuer,
    scale: market.vault_scale,
  });

  const now = new Date();
  await db
    .update(markets)
    .set({
      supplyVaultId: created.vaultId,
      supplyMptIssuanceId: created.mptIssuanceId,
      updatedAt: now,
    })
    .where(eq(markets.id, market.id));

  const refreshed = await getMarketById(market.id);
  if (!refreshed) {
    throw new Error('Market not found after vault provisioning');
  }

  return refreshed;
}

function rippleEpochToDate(value: number | null): Date | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return new Date((value + 946684800) * 1000);
}

function parseNumericLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parsePositiveNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function findLoanFieldValue(input: unknown, keys: string[]): unknown {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = findLoanFieldValue(item, keys);
        if (nested !== undefined) return nested;
      }
      continue;
    }

    const nested = findLoanFieldValue(value, keys);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function readLoanNumericField(raw: Record<string, unknown>, keys: string[]): number | null {
  const value = findLoanFieldValue(raw, keys);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (value && typeof value === 'object') {
    const maybeAmountValue = (value as Record<string, unknown>).value;
    if (typeof maybeAmountValue === 'number' && Number.isFinite(maybeAmountValue)) {
      return maybeAmountValue;
    }
    if (typeof maybeAmountValue === 'string' && maybeAmountValue.trim().length > 0) {
      const parsed = Number(maybeAmountValue);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function getLoanMinimumRepayment(loanInfo: { outstandingDebt: string | null; raw: Record<string, unknown> }): number | null {
  const periodicPayment = readLoanNumericField(loanInfo.raw, [
    'PeriodicPayment',
    'periodicPayment',
    'periodic_payment',
  ]);
  const totalOutstanding = parsePositiveNumber(loanInfo.outstandingDebt);

  if (periodicPayment !== null && totalOutstanding !== null) {
    return Math.max(0, Math.min(periodicPayment, totalOutstanding));
  }

  if (periodicPayment !== null) {
    return Math.max(0, periodicPayment);
  }

  if (totalOutstanding !== null) {
    return Math.max(0, totalOutstanding);
  }

  return null;
}

type RepayKind = 'regular' | 'full' | 'overpayment' | 'late';

interface LoanRepaymentOverview {
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

function getRepayFlags(repayKind: RepayKind): number {
  if (repayKind === 'overpayment') return 0x00010000;
  if (repayKind === 'full') return 0x00020000;
  if (repayKind === 'late') return 0x00040000;
  return 0;
}

async function getBorrowerOutstandingDebtOnChain(
  market: MarketRecord,
  borrowerAddress: string
): Promise<number | null> {
  if (!market.loan_broker_id) {
    return null;
  }

  try {
    const client = await getClient();
    const objects: Array<Record<string, unknown>> = [];
    let marker: unknown = undefined;
    do {
      const accountObjects = await client.request({
        command: 'account_objects',
        account: borrowerAddress,
        ledger_index: 'validated',
        marker,
      });

      const page = Array.isArray(accountObjects.result.account_objects)
        ? (accountObjects.result.account_objects as unknown as Array<Record<string, unknown>>)
        : [];
      objects.push(...page);
      marker = accountObjects.result.marker;
    } while (marker !== undefined);

    let totalDebt = 0;
    for (const object of objects) {
      if (object.LedgerEntryType !== 'Loan') continue;
      if (object.LoanBrokerID !== market.loan_broker_id) continue;
      if (object.Borrower !== borrowerAddress) continue;

      const value =
        readLoanNumericField(object, ['TotalValueOutstanding', 'OutstandingDebt', 'PrincipalOutstanding']) ??
        0;
      totalDebt += value;
    }

    return totalDebt;
  } catch {
    return null;
  }
}

async function findBorrowerActiveLoanIdOnChain(
  market: MarketRecord,
  borrowerAddress: string
): Promise<string | null> {
  if (!market.loan_broker_id) {
    return null;
  }

  try {
    const client = await getClient();
    const objects: Array<Record<string, unknown>> = [];
    let marker: unknown = undefined;
    do {
      const accountObjects = await client.request({
        command: 'account_objects',
        account: borrowerAddress,
        ledger_index: 'validated',
        marker,
      });

      const page = Array.isArray(accountObjects.result.account_objects)
        ? (accountObjects.result.account_objects as unknown as Array<Record<string, unknown>>)
        : [];
      objects.push(...page);
      marker = accountObjects.result.marker;
    } while (marker !== undefined);

    let bestLoanId: string | null = null;
    let bestOutstandingDebt = -1;

    for (const object of objects) {
      if (object.LedgerEntryType !== 'Loan') continue;
      if (object.LoanBrokerID !== market.loan_broker_id) continue;
      if (object.Borrower !== borrowerAddress) continue;

      const loanId =
        typeof object.index === 'string'
          ? object.index
          : typeof object.LedgerIndex === 'string'
          ? object.LedgerIndex
          : null;
      if (!loanId) continue;

      const outstandingDebt =
        readLoanNumericField(object, ['TotalValueOutstanding', 'OutstandingDebt', 'PrincipalOutstanding']) ??
        0;

      if (outstandingDebt <= 0) {
        continue;
      }

      if (outstandingDebt > bestOutstandingDebt) {
        bestOutstandingDebt = outstandingDebt;
        bestLoanId = loanId;
      }
    }

    return bestLoanId;
  } catch {
    return null;
  }
}

interface BorrowContext {
  market: MarketRecord;
  position: Position;
  currentDebt: number;
}

async function loadBorrowContext(
  userAddress: string,
  marketId: string,
  amount: number
): Promise<{ context?: BorrowContext; error?: LendingServiceError }> {
  const marketRow = await getMarketById(marketId);
  if (!marketRow) {
    return { error: createError('MARKET_NOT_FOUND', 'Market not found or inactive') };
  }

  let market: MarketRecord;
  try {
    market = await ensureMarketLoanBrokerConfigured(marketRow);
  } catch (error) {
    return {
      error: createError(
        'LOAN_BROKER_NOT_CONFIGURED',
        error instanceof Error ? error.message : 'Loan broker is not configured'
      ),
    };
  }

  const prices = await getMarketPrices(marketId);
  if (!prices) {
    return { error: createError('PRICES_NOT_FOUND', 'Market prices not available') };
  }

  if (amount < market.min_borrow_amount) {
    return {
      error: createError('BELOW_MINIMUM', `Minimum borrow is ${market.min_borrow_amount} ${market.debt_currency}`),
    };
  }

  const position = await getPositionForUser(userAddress, marketId);
  if (!position) {
    return { error: createError('NO_POSITION', 'No active position found. Deposit collateral first.') };
  }

  const totalDebt = await getBorrowerOutstandingDebtOnChain(market, userAddress);
  const currentDebt = Math.max(0, totalDebt ?? 0);

  const canBorrow = validateBorrow(
    position.collateralAmount,
    prices.collateralPriceUsd,
    currentDebt,
    amount,
    prices.debtPriceUsd,
    market.max_ltv_ratio
  );

  if (!canBorrow) {
    return {
      error: createError('EXCEEDS_MAX_LTV', `Borrow would exceed maximum LTV of ${market.max_ltv_ratio * 100}%`),
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

  return {
    context: {
      market,
      position,
      currentDebt,
    },
  };
}

async function waitForLoanSetResult(client: Client, txHash: string, retries = 12): Promise<LoanSetResult> {
  let lastError: unknown;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await extractLoanSetResult(client, txHash);
    } catch (error) {
      lastError = error;
      if (error instanceof LoanProtocolError && error.code === 'TX_NOT_VALIDATED') {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('LoanSet validation timeout');
}

async function ensureMarketLoanBrokerConfigured(market: MarketRecord): Promise<MarketRecord> {
  if (market.loan_broker_id && market.loan_broker_address) {
    return market;
  }

  let workingMarket = market;
  if (!workingMarket.supply_vault_id) {
    workingMarket = await ensureMarketSupplyVaultConfigured(workingMarket);
  }

  if (!workingMarket.supply_vault_id) {
    throw new Error('Supply vault must be configured before creating a loan broker');
  }

  const client = await getClient();
  const support = await checkLoanProtocolSupport(client);
  if (!support.enabled) {
    throw new Error(support.reason || 'XRPL loan protocol support is not enabled on this network');
  }

  const loanBrokerWallet = getLoanBrokerWallet();
  const created = await createLoanBroker(loanBrokerWallet, {
    vaultId: workingMarket.supply_vault_id,
    feeBps: 0,
  });

  await db
    .update(markets)
    .set({
      loanBrokerId: created.brokerId,
      loanBrokerAddress: created.brokerAddress,
      updatedAt: new Date(),
    })
    .where(eq(markets.id, workingMarket.id));

  const refreshed = await getMarketById(workingMarket.id);
  if (!refreshed) {
    throw new Error('Market not found after loan broker provisioning');
  }

  return refreshed;
}

export async function prepareBorrow(
  userAddress: string,
  marketId: string,
  amount: number
): Promise<{ result?: BorrowPrepareResult; error?: LendingServiceError }> {
  const loaded = await loadBorrowContext(userAddress, marketId, amount);
  if (loaded.error || !loaded.context) {
    return { error: loaded.error || createError('INTERNAL_ERROR', 'Failed to load borrow context') };
  }

  const { market } = loaded.context;
  if (!market.loan_broker_id) {
    return { error: createError('LOAN_BROKER_NOT_CONFIGURED', 'Market loan broker id is not configured') };
  }

  const loanBrokerWallet = getLoanBrokerWallet();
  const client = await getClient();

  const txTemplate = buildLoanSetTransaction({
    account: userAddress,
    borrower: userAddress,
    loanBrokerId: market.loan_broker_id,
    principal: {
      currency: market.debt_currency,
      issuer: market.debt_issuer,
        value: amount.toString(),
      },
      collateral: {
        currency: market.collateral_currency,
        issuer: market.collateral_issuer,
        value: loaded.context.position.collateralAmount.toString(),
      },
    termMonths: 3,
    annualInterestBps: Math.round(market.base_interest_rate * 10000),
    additionalFields: {
      Counterparty: loanBrokerWallet.address,
      PaymentInterval: 60 * 60 * 24 * 30,
      GracePeriod: 60 * 60 * 24 * 7,
    },
  });

  const unsignedTx = await client.autofill(txTemplate as never);
  return { result: { unsignedTx: unsignedTx as unknown as Record<string, unknown> } };
}

export async function confirmBorrowWithSignedTx(
  userAddress: string,
  marketId: string,
  amount: number,
  signedTxJson: Record<string, unknown>,
  idempotencyKey?: string
): Promise<{ result?: BorrowResult; error?: LendingServiceError }> {
  const loaded = await loadBorrowContext(userAddress, marketId, amount);
  if (loaded.error || !loaded.context) {
    return { error: loaded.error || createError('INTERNAL_ERROR', 'Failed to load borrow context') };
  }

  const { market, position } = loaded.context;
  const loanBrokerWallet = getLoanBrokerWallet();

  if (!market.loan_broker_id) {
    return { error: createError('LOAN_BROKER_NOT_CONFIGURED', 'Market loan broker id is not configured') };
  }

  const account = signedTxJson.Account;
  if (typeof account !== 'string' || account !== userAddress) {
    return { error: createError('INVALID_SIGNED_TX', 'Signed transaction account mismatch') };
  }

  const txType = signedTxJson.TransactionType;
  if (txType !== 'LoanSet') {
    return { error: createError('INVALID_SIGNED_TX', 'Signed transaction must be LoanSet') };
  }

  const counterparty = signedTxJson.Counterparty;
  if (typeof counterparty !== 'string' || counterparty !== loanBrokerWallet.address) {
    return { error: createError('INVALID_SIGNED_TX', 'Signed transaction counterparty mismatch') };
  }

  const brokerId = signedTxJson.LoanBrokerID;
  if (typeof brokerId !== 'string' || brokerId !== market.loan_broker_id) {
    return { error: createError('INVALID_SIGNED_TX', 'Signed transaction loan broker id mismatch') };
  }

  const principalRequested = parseNumericLike(signedTxJson.PrincipalRequested);
  if (principalRequested === null || principalRequested !== amount) {
    return { error: createError('INVALID_SIGNED_TX', 'Signed transaction principal does not match requested amount') };
  }

  if (typeof signedTxJson.SigningPubKey !== 'string' || typeof signedTxJson.TxnSignature !== 'string') {
    return { error: createError('INVALID_SIGNED_TX', 'Signed transaction is missing borrower signature fields') };
  }

  const client = await getClient();

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
      const existingEvent = acquireResult.event;
      if (!validateIdempotencyIdentity(existingEvent, { eventType: LENDING_EVENTS.BORROW_INITIATED, userAddress, marketId })) {
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
      event = existingEvent;
      await updateEventStatus(event.id, 'PENDING');
    } else {
      event = acquireResult.event;
    }
  } else {
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

  try {
    const signResponse = (await client.request({
      command: 'sign',
      tx_json: signedTxJson as never,
      secret: loanBrokerWallet.seed,
      signature_target: 'CounterpartySignature',
    } as never)) as { result?: { tx_json?: Record<string, unknown> } };

    const fullySignedTx = signResponse.result?.tx_json as Record<string, unknown> | undefined;
    if (!fullySignedTx) {
      throw new Error('Missing fully signed LoanSet payload');
    }

    const submitResponse = (await client.submit(fullySignedTx as never)) as {
      result?: { tx_json?: { hash?: string } };
    };
    const txHash = submitResponse.result?.tx_json?.hash;
    if (typeof txHash !== 'string') {
      throw new Error('LoanSet submission did not return transaction hash');
    }

    const loanSet = await waitForLoanSetResult(client, txHash);
    const loanInfo = await getLoanInfo(client, loanSet.loanId);

    await upsertOnchainTransaction({
      txHash: loanSet.txHash,
      validated: true,
      txType: 'LoanSet',
      sourceAddress: userAddress,
      destinationAddress: loanBrokerWallet.address,
      currency: market.debt_currency,
      issuer: market.debt_issuer,
      amount,
      rawTxJson: loanSet.rawTx,
      rawMetaJson: loanSet.rawMeta || null,
    });

    await updateGlobalYieldIndex(marketId);
    await addToTotalBorrowed(marketId, amount);
    await setPositionLoanMetadata(position.id, {
      loanId: loanSet.loanId,
      loanHash: loanSet.txHash,
      loanTermMonths: 3,
      loanMaturityDate: rippleEpochToDate(loanInfo.maturityDate),
      loanOpenedAtLedgerIndex: loanSet.ledgerIndex,
    });

    const onChainPrincipal = parsePositiveNumber(loanInfo.principal) ?? parsePositiveNumber(loanInfo.outstandingDebt) ?? amount;
    const borrowResult: BorrowResult = {
      positionId: position.id,
      borrowedAmount: amount,
      newLoanPrincipal: onChainPrincipal,
      txHash: loanSet.txHash,
    };

    if (idempotencyKey) {
      await completeIdempotencyEvent(event.id, { result: borrowResult });
    } else {
      await updateEventStatus(event.id, 'COMPLETED');
    }

    await emitAppEvent({
      eventType: LENDING_EVENTS.BORROW_COMPLETED,
      module: 'LENDING',
      status: 'COMPLETED',
      userAddress,
      marketId,
      positionId: position.id,
      amount,
      currency: market.debt_currency,
      payload: { txHash: loanSet.txHash, loanId: loanSet.loanId },
    });

    return { result: borrowResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await updateEventStatus(event.id, 'FAILED', { code: 'INTERNAL_ERROR', message });
    return { error: createError('INTERNAL_ERROR', message) };
  }
}

export async function processBorrowWithBorrowerSeed(
  userAddress: string,
  marketId: string,
  amount: number,
  borrowerSeed: string,
  idempotencyKey?: string
): Promise<{ result?: BorrowResult; error?: LendingServiceError }> {
  const loaded = await loadBorrowContext(userAddress, marketId, amount);
  if (loaded.error || !loaded.context) {
    return { error: loaded.error || createError('INTERNAL_ERROR', 'Failed to load borrow context') };
  }

  const { market, position } = loaded.context;
  const loanBrokerWallet = getLoanBrokerWallet();

  if (!market.loan_broker_id) {
    return { error: createError('LOAN_BROKER_NOT_CONFIGURED', 'Market loan broker id is not configured') };
  }

  let borrowerWallet: Wallet;
  try {
    borrowerWallet = Wallet.fromSeed(borrowerSeed);
  } catch {
    return { error: createError('INVALID_BORROWER_SEED', 'Borrower seed is invalid') };
  }

  if (borrowerWallet.address !== userAddress) {
    return { error: createError('BORROWER_SEED_MISMATCH', 'Borrower seed does not match userAddress') };
  }

  const client = await getClient();

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
      const existingEvent = acquireResult.event;
      if (!validateIdempotencyIdentity(existingEvent, { eventType: LENDING_EVENTS.BORROW_INITIATED, userAddress, marketId })) {
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
      event = existingEvent;
      await updateEventStatus(event.id, 'PENDING');
    } else {
      event = acquireResult.event;
    }
  } else {
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

  try {
    const txTemplate = buildLoanSetTransaction({
      account: userAddress,
      borrower: userAddress,
      loanBrokerId: market.loan_broker_id,
      principal: {
        currency: market.debt_currency,
        issuer: market.debt_issuer,
        value: amount.toString(),
      },
      collateral: {
        currency: market.collateral_currency,
        issuer: market.collateral_issuer,
        value: position.collateralAmount.toString(),
      },
      termMonths: 3,
      annualInterestBps: Math.round(market.base_interest_rate * 10000),
      additionalFields: {
        Counterparty: loanBrokerWallet.address,
        PaymentInterval: 60 * 60 * 24 * 30,
        GracePeriod: 60 * 60 * 24 * 7,
      },
    });

    const unsignedTx = await client.autofill(txTemplate as never);

    const borrowerSigned = (await client.request({
      command: 'sign',
      tx_json: unsignedTx as never,
      secret: borrowerSeed,
    } as never)) as { result?: { tx_json?: Record<string, unknown> } };

    const borrowerSignedTx = borrowerSigned.result?.tx_json;
    if (!borrowerSignedTx) {
      throw new Error('Borrower signing failed');
    }

    const fullySigned = (await client.request({
      command: 'sign',
      tx_json: borrowerSignedTx as never,
      secret: loanBrokerWallet.seed,
      signature_target: 'CounterpartySignature',
    } as never)) as { result?: { tx_json?: Record<string, unknown> } };

    const fullySignedTx = fullySigned.result?.tx_json;
    if (!fullySignedTx) {
      throw new Error('Counterparty signing failed');
    }

    const submitResponse = (await client.submit(fullySignedTx as never)) as {
      result?: { tx_json?: { hash?: string } };
    };

    const txHash = submitResponse.result?.tx_json?.hash;
    if (typeof txHash !== 'string') {
      throw new Error('LoanSet submission did not return transaction hash');
    }

    const loanSet = await waitForLoanSetResult(client, txHash);
    const loanInfo = await getLoanInfo(client, loanSet.loanId);

    await upsertOnchainTransaction({
      txHash: loanSet.txHash,
      validated: true,
      txType: 'LoanSet',
      sourceAddress: userAddress,
      destinationAddress: loanBrokerWallet.address,
      currency: market.debt_currency,
      issuer: market.debt_issuer,
      amount,
      rawTxJson: loanSet.rawTx,
      rawMetaJson: loanSet.rawMeta || null,
    });

    await updateGlobalYieldIndex(marketId);
    await addToTotalBorrowed(marketId, amount);
    await setPositionLoanMetadata(position.id, {
      loanId: loanSet.loanId,
      loanHash: loanSet.txHash,
      loanTermMonths: 3,
      loanMaturityDate: rippleEpochToDate(loanInfo.maturityDate),
      loanOpenedAtLedgerIndex: loanSet.ledgerIndex,
    });

    const onChainPrincipal = parsePositiveNumber(loanInfo.principal) ?? parsePositiveNumber(loanInfo.outstandingDebt) ?? amount;
    const borrowResult: BorrowResult = {
      positionId: position.id,
      borrowedAmount: amount,
      newLoanPrincipal: onChainPrincipal,
      txHash: loanSet.txHash,
    };

    if (idempotencyKey) {
      await completeIdempotencyEvent(event.id, { result: borrowResult });
    } else {
      await updateEventStatus(event.id, 'COMPLETED');
    }

    await emitAppEvent({
      eventType: LENDING_EVENTS.BORROW_COMPLETED,
      module: 'LENDING',
      status: 'COMPLETED',
      userAddress,
      marketId,
      positionId: position.id,
      amount,
      currency: market.debt_currency,
      payload: { txHash: loanSet.txHash, loanId: loanSet.loanId },
    });

    return { result: borrowResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await updateEventStatus(event.id, 'FAILED', { code: 'INTERNAL_ERROR', message });
    return { error: createError('INTERNAL_ERROR', message) };
  }
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
    supplyVaultId: market.supply_vault_id,
    supplyMptIssuanceId: market.supply_mpt_issuance_id,
    loanBrokerId: market.loan_broker_id,
    loanBrokerAddress: market.loan_broker_address,
    vaultScale: market.vault_scale,
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
  idempotencyKey?: string,
  escrowCondition?: string,
  escrowFulfillment?: string,
  escrowPreimage?: string
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
    payload: { txHash, escrowCondition },
  });

  try {
    if (!escrowCondition || !escrowFulfillment || !escrowPreimage) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'MISSING_ESCROW_PARAMS',
        message: 'Escrow condition, fulfillment, and preimage are required',
      });
      return {
        error: createError(
          'MISSING_ESCROW_PARAMS',
          'Escrow condition, fulfillment, and preimage are required'
        ),
      };
    }

    const packageCheck = verifyConditionFulfillment(
      escrowCondition,
      escrowFulfillment,
      escrowPreimage
    );
    if (!packageCheck.valid) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'INVALID_ESCROW_PARAMS',
        message: packageCheck.reason || 'Invalid escrow condition package',
      });
      return {
        error: createError(
          'INVALID_ESCROW_PARAMS',
          packageCheck.reason || 'Invalid escrow condition package'
        ),
      };
    }

    const client = await getClient();
    const tx = await verifyTransaction(client, txHash);
    const txResult = extractTransactionResult(tx.rawMeta);

    // Validate transaction
    if (!tx.validated) {
      await updateEventStatus(event.id, 'FAILED', { code: 'TX_NOT_VALIDATED', message: 'Transaction not validated' });
      return { error: createError('TX_NOT_VALIDATED', 'Transaction not yet validated') };
    }

    if (txResult !== 'tesSUCCESS') {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'TX_FAILED',
        message: `EscrowCreate failed on-ledger (${txResult ?? 'unknown'})`,
      });
      return {
        error: createError('TX_FAILED', `EscrowCreate failed on-ledger (${txResult ?? 'unknown'})`),
      };
    }

    const backendAddress = getBackendAddress();
    if (tx.destination !== backendAddress) {
      await updateEventStatus(event.id, 'FAILED', { code: 'WRONG_DESTINATION', message: 'Wrong destination' });
      return { error: createError('WRONG_DESTINATION', `Transaction must be sent to ${backendAddress}`) };
    }

    if (tx.transactionType !== 'EscrowCreate') {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'NOT_ESCROW_CREATE',
        message: 'Transaction must be an EscrowCreate',
      });
      return {
        error: createError('NOT_ESCROW_CREATE', `Expected EscrowCreate, got ${tx.transactionType}`),
      };
    }

    const txEscrowCondition = extractEscrowCondition(tx.rawTx);
    if (!txEscrowCondition || txEscrowCondition !== escrowCondition.toUpperCase()) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'WRONG_ESCROW_CONDITION',
        message: 'Escrow condition mismatch',
      });
      return {
        error: createError('WRONG_ESCROW_CONDITION', 'Escrow condition mismatch'),
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

    const escrowSequence = extractEscrowSequence(tx.rawTx);
    if (escrowSequence === null) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'MISSING_ESCROW_SEQUENCE',
        message: 'EscrowCreate transaction sequence is missing',
      });
      return {
        error: createError('MISSING_ESCROW_SEQUENCE', 'EscrowCreate transaction sequence is missing'),
      };
    }

    const escrowObject = await getEscrowInfo(client, {
      owner: senderAddress,
      sequence: escrowSequence,
    });

    if (!escrowObject) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'ESCROW_NOT_FOUND',
        message: 'Escrow object not found on ledger',
      });
      return { error: createError('ESCROW_NOT_FOUND', 'Escrow object not found on ledger') };
    }

    const escrowMatch = verifyEscrowMatchesExpected(escrowObject, {
      owner: senderAddress,
      destination: backendAddress,
      sequence: escrowSequence,
      currency: market.collateral_currency,
      issuer: market.collateral_issuer,
      amount: tx.amount.value,
      condition: escrowCondition,
    });

    if (!escrowMatch.valid) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'ESCROW_MISMATCH',
        message: escrowMatch.reason || 'Escrow terms mismatch',
      });
      return { error: createError('ESCROW_MISMATCH', escrowMatch.reason || 'Escrow terms mismatch') };
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
      rawTxJson: {
        ...buildInboundRawTxJson(tx),
        operation: 'ESCROW_CREATE',
        escrowOwner: senderAddress,
        escrowSequence,
        escrowCondition: escrowCondition.toUpperCase(),
      },
      rawMetaJson: tx.rawMeta || null,
    });

    // Create or update position
    const existingPosition = await getPositionForUser(senderAddress, marketId);
    if (
      existingPosition &&
      (existingPosition.collateralAmount > 0 ||
        existingPosition.escrowSequence !== null ||
        existingPosition.escrowCondition !== null)
    ) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'COLLATERAL_ALREADY_LOCKED',
        message: 'Position already has active escrow-backed collateral',
      });
      return {
        error: createError(
          'COLLATERAL_ALREADY_LOCKED',
          'Position already has active escrow-backed collateral'
        ),
      };
    }

    const position = existingPosition ??
      (await getOrCreatePosition(senderAddress, marketId, market.base_interest_rate));
    const updatedPosition = await addCollateral(position.id, amount);
    await setPositionEscrowMetadata(position.id, {
      owner: senderAddress,
      sequence: escrowSequence,
      condition: escrowCondition.toUpperCase(),
      fulfillment: escrowFulfillment.toUpperCase(),
      preimage: escrowPreimage.toUpperCase(),
      cancelAfter: extractEscrowCancelAfter(tx.rawTx),
    });

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
      payload: { txHash, escrowSequence },
    });

    return {
      result: {
        positionId: updatedPosition.id,
        collateralAmount: amount,
        newCollateralTotal: updatedPosition.collateralAmount,
        escrowSequence,
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
  const marketRow = await getMarketById(marketId);
  if (!marketRow) {
    return { error: createError('MARKET_NOT_FOUND', 'Market not found or inactive') };
  }

  let market: MarketRecord;
  try {
    market = await ensureMarketLoanBrokerConfigured(marketRow);
  } catch (error) {
    return {
      error: createError(
        'LOAN_BROKER_NOT_CONFIGURED',
        error instanceof Error ? error.message : 'Loan broker is not configured'
      ),
    };
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

  const totalDebt = await getBorrowerOutstandingDebtOnChain(market, userAddress);
  const currentDebt = Math.max(0, totalDebt ?? 0);

  // Validate LTV
  const canBorrow = validateBorrow(
    position.collateralAmount,
    prices.collateralPriceUsd,
    currentDebt,
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
    if (!market.loan_broker_id) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'LOAN_BROKER_NOT_CONFIGURED',
        message: 'Market loan broker id is not configured',
      });
      return {
        error: createError('LOAN_BROKER_NOT_CONFIGURED', 'Market loan broker id is not configured'),
      };
    }

    // Submit LoanSet transaction from custodial backend wallet.
    const client = await getClient();
    const loanBrokerWallet = getLoanBrokerWallet();

    const loanSetTx = buildLoanSetTransaction({
      account: loanBrokerWallet.address,
      borrower: userAddress,
      loanBrokerId: market.loan_broker_id,
      principal: {
        currency: market.debt_currency,
        issuer: market.debt_issuer,
        value: amount.toString(),
      },
      collateral: {
        currency: market.collateral_currency,
        issuer: market.collateral_issuer,
        value: position.collateralAmount.toString(),
      },
      termMonths: 3,
      annualInterestBps: Math.round(market.base_interest_rate * 10000),
    });

    const loanSetSubmit = await client.submitAndWait(loanSetTx as never, {
      wallet: loanBrokerWallet,
    });

    const loanSetHash =
      typeof loanSetSubmit.result?.hash === 'string' ? loanSetSubmit.result.hash : null;
    if (!loanSetHash) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'TX_FAILED',
        message: 'LoanSet transaction hash missing from XRPL response',
      });
      return { error: createError('TX_FAILED', 'LoanSet transaction hash missing from XRPL response') };
    }

    const loanSet = await extractLoanSetResult(client, loanSetHash);
    const loanInfo = await getLoanInfo(client, loanSet.loanId);

    // Record on-chain transaction
    await upsertOnchainTransaction({
      txHash: loanSet.txHash,
      validated: true,
      txType: 'LoanSet',
      sourceAddress: loanBrokerWallet.address,
      destinationAddress: userAddress,
      currency: market.debt_currency,
      issuer: market.debt_issuer,
      amount,
      rawTxJson: loanSet.rawTx,
      rawMetaJson: loanSet.rawMeta || null,
    });

    // Update position
    await updateGlobalYieldIndex(marketId);
    await addToTotalBorrowed(marketId, amount);
    await setPositionLoanMetadata(position.id, {
      loanId: loanSet.loanId,
      loanHash: loanSet.txHash,
      loanTermMonths: 3,
      loanMaturityDate: rippleEpochToDate(loanInfo.maturityDate),
      loanOpenedAtLedgerIndex: loanSet.ledgerIndex,
    });

    const onChainPrincipal = parsePositiveNumber(loanInfo.principal) ?? parsePositiveNumber(loanInfo.outstandingDebt) ?? amount;
    const borrowResult: BorrowResult = {
      positionId: position.id,
      borrowedAmount: amount,
      newLoanPrincipal: onChainPrincipal,
      txHash: loanSet.txHash,
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
      payload: { txHash: loanSet.txHash, loanId: loanSet.loanId },
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
  userAddress: string,
  marketId: string,
  amount: number,
  borrowerSeed: string,
  repayKind: RepayKind = 'regular',
  idempotencyKey?: string
): Promise<{ result?: RepayResult; error?: LendingServiceError }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: createError('INVALID_AMOUNT', 'Repayment amount must be greater than 0') };
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
    userAddress,
    marketId,
    idempotencyKey,
    amount,
    currency: market.debt_currency,
    payload: {},
  });

  try {
    let borrowerWallet: Wallet;
    try {
      borrowerWallet = Wallet.fromSeed(borrowerSeed);
    } catch {
      await updateEventStatus(event.id, 'FAILED', { code: 'INVALID_BORROWER_SEED', message: 'Invalid borrower seed' });
      return { error: createError('INVALID_BORROWER_SEED', 'Borrower seed is invalid') };
    }

    if (borrowerWallet.address !== userAddress) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'BORROWER_SEED_MISMATCH',
        message: 'Borrower seed does not match userAddress',
      });
      return { error: createError('BORROWER_SEED_MISMATCH', 'Borrower seed does not match userAddress') };
    }

    const rawPosition = await getPositionForUser(userAddress, marketId);
    if (!rawPosition) {
      await updateEventStatus(event.id, 'FAILED', { code: 'NO_POSITION', message: 'No position' });
      return { error: createError('NO_POSITION', 'No active position found') };
    }

    const position = rawPosition;
    const loanId = await findBorrowerActiveLoanIdOnChain(market, userAddress);
    if (!loanId) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'LOAN_NOT_FOUND',
        message: 'No on-chain loan metadata found for this position',
      });
      return {
        error: createError('LOAN_NOT_FOUND', 'No on-chain loan metadata found for this position'),
      };
    }

    const client = await getClient();
    const loanInfoBeforePay = await getLoanInfo(client, loanId);
    const debtBeforePay = parsePositiveNumber(loanInfoBeforePay.outstandingDebt) ?? 0;
    if (debtBeforePay <= 0) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'NO_DEBT',
        message: 'No outstanding debt to repay',
      });
      return {
        error: createError('NO_DEBT', 'No outstanding debt to repay'),
      };
    }

    const fullRepayment = parsePositiveNumber(loanInfoBeforePay.outstandingDebt);
    const requestedAmount =
      repayKind === 'full' && fullRepayment !== null ? Math.min(amount, fullRepayment) : amount;
    const minimumRepayment = getLoanMinimumRepayment(loanInfoBeforePay);
    if (minimumRepayment !== null && requestedAmount + 1e-12 < minimumRepayment) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'INSUFFICIENT_PAYMENT',
        message: `Repayment is below required minimum (${minimumRepayment} ${market.debt_currency})`,
      });
      return {
        error: createError(
          'INSUFFICIENT_PAYMENT',
          `Repayment is below required minimum. Minimum due is ${minimumRepayment.toFixed(6)} ${market.debt_currency}`
        ),
      };
    }

    const loanPayTx = buildLoanPayTransaction({
      account: userAddress,
      loanId,
      amount: {
        currency: market.debt_currency,
        issuer: market.debt_issuer,
        value: requestedAmount.toString(),
      },
      additionalFields: getRepayFlags(repayKind) > 0 ? { Flags: getRepayFlags(repayKind) } : undefined,
    });

    const submit = await client.submitAndWait(loanPayTx as never, {
      wallet: borrowerWallet,
    });

    const submitResult = submit.result as unknown as Record<string, unknown>;
    const submitMeta =
      typeof submitResult.meta === 'object' && submitResult.meta !== null
        ? (submitResult.meta as Record<string, unknown>)
        : null;
    const submitTxResult = extractTransactionResult(submitMeta);
    if (submitTxResult !== 'tesSUCCESS') {
      if (submitTxResult === 'tecKILLED') {
        await updateEventStatus(event.id, 'FAILED', {
          code: 'LOAN_ALREADY_PAID',
          message: 'Loan is already fully repaid on-chain',
        });
        return {
          error: createError('LOAN_ALREADY_PAID', 'Loan is already fully repaid on-chain'),
        };
      }

      if (submitTxResult === 'tecINSUFFICIENT_PAYMENT') {
        const refreshedLoanInfo = await getLoanInfo(client, loanId);
        const refreshedMinimumRepayment = getLoanMinimumRepayment(refreshedLoanInfo);
        const minimumText =
          refreshedMinimumRepayment !== null
            ? ` Minimum due is ${refreshedMinimumRepayment.toFixed(6)} ${market.debt_currency}.`
            : '';
        await updateEventStatus(event.id, 'FAILED', {
          code: 'INSUFFICIENT_PAYMENT',
          message: `LoanPay amount below required minimum.${minimumText}`,
        });
        return {
          error: createError(
            'INSUFFICIENT_PAYMENT',
            `LoanPay amount is below required minimum.${minimumText}`.trim()
          ),
        };
      }

      await updateEventStatus(event.id, 'FAILED', {
        code: 'TX_FAILED',
        message: `LoanPay failed on-ledger (${submitTxResult ?? 'unknown'})`,
      });
      return {
        error: createError('TX_FAILED', `LoanPay failed on-ledger (${submitTxResult ?? 'unknown'})`),
      };
    }

    const txHash = typeof submitResult.hash === 'string' ? submitResult.hash : null;
    if (!txHash) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'TX_FAILED',
        message: 'LoanPay transaction hash missing from XRPL response',
      });
      return { error: createError('TX_FAILED', 'LoanPay transaction hash missing from XRPL response') };
    }

    if (await isTransactionProcessed(txHash)) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'TX_ALREADY_PROCESSED',
        message: 'This transaction has already been processed',
      });
      return { error: createError('TX_ALREADY_PROCESSED', 'This transaction has already been processed') };
    }

    const verified = await verifyLoanPayTransaction(client, txHash);
    if (verified.account !== userAddress) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'SENDER_MISMATCH',
        message: 'Transaction sender does not match',
      });
      return { error: createError('SENDER_MISMATCH', 'Transaction sender does not match') };
    }

    if (verified.loanId !== loanId) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'WRONG_LOAN_ID',
        message: 'LoanPay LoanID does not match active position loan',
      });
      return {
        error: createError('WRONG_LOAN_ID', 'LoanPay LoanID does not match active position loan'),
      };
    }

    if (!verified.amount) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'NO_AMOUNT',
        message: 'Could not determine LoanPay amount',
      });
      return { error: createError('NO_AMOUNT', 'Could not determine LoanPay amount') };
    }

    if (!isExpectedCurrency(verified.amount.currency, market.debt_currency)) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'WRONG_CURRENCY',
        message: `Expected ${market.debt_currency}`,
      });
      return {
        error: createError(
          'WRONG_CURRENCY',
          `Expected ${market.debt_currency}, got ${verified.amount.currency}`
        ),
      };
    }

    if (verified.amount.currency !== 'XRP' && verified.amount.issuer !== market.debt_issuer) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'WRONG_ISSUER',
        message: `Expected issuer ${market.debt_issuer}`,
      });
      return {
        error: createError(
          'WRONG_ISSUER',
          `Expected issuer ${market.debt_issuer}, got ${verified.amount.issuer}`
        ),
      };
    }

    const paidAmount = parseNumericLike(verified.amount.value);
    if (paidAmount === null || paidAmount <= 0) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'NO_AMOUNT',
        message: 'Invalid LoanPay amount in transaction',
      });
      return { error: createError('NO_AMOUNT', 'Invalid LoanPay amount in transaction') };
    }

    let debtAfterPay = 0;
    let principalAfterPay = 0;
    let interestAfterPay = 0;
    try {
      const loanInfoAfterPay = await getLoanInfo(client, loanId);
      debtAfterPay = parsePositiveNumber(loanInfoAfterPay.outstandingDebt) ?? 0;
      principalAfterPay = parsePositiveNumber(loanInfoAfterPay.principal) ?? debtAfterPay;
      interestAfterPay = parsePositiveNumber(loanInfoAfterPay.accruedInterest) ?? Math.max(0, debtAfterPay - principalAfterPay);
    } catch {
      debtAfterPay = 0;
      principalAfterPay = 0;
      interestAfterPay = 0;
    }

    const principalBeforePay = parsePositiveNumber(loanInfoBeforePay.principal) ?? debtBeforePay;
    const interestBeforePay = parsePositiveNumber(loanInfoBeforePay.accruedInterest) ?? Math.max(0, debtBeforePay - principalBeforePay);
    const principalPaid = Math.max(0, principalBeforePay - principalAfterPay);
    const interestPaid = Math.max(0, interestBeforePay - interestAfterPay);
    const debtDelta = Math.max(0, debtBeforePay - debtAfterPay);
    const excess = Math.max(0, paidAmount - debtDelta);

    // Record on-chain transaction
    const onchainTx = await upsertOnchainTransaction({
      txHash,
      validated: true,
      txType: 'LoanPay',
      sourceAddress: userAddress,
      destinationAddress: market.loan_broker_address || market.debt_issuer,
      currency: verified.amount.currency,
      issuer: verified.amount.issuer,
      amount: paidAmount,
      rawTxJson: verified.rawTx,
      rawMetaJson: verified.rawMeta || null,
    });

    let loanDeleteTxHash: string | undefined;
    if (debtAfterPay <= 0) {
      const deleteResponse = await client.submitAndWait(
        {
          TransactionType: 'LoanDelete',
          Account: userAddress,
          LoanID: loanId,
        } as never,
        { wallet: borrowerWallet }
      );

      const deleteResult = deleteResponse.result as unknown as Record<string, unknown>;
      const deleteMeta =
        typeof deleteResult.meta === 'object' && deleteResult.meta !== null
          ? (deleteResult.meta as Record<string, unknown>)
          : null;
      const deleteTxResult = extractTransactionResult(deleteMeta);
      if (deleteTxResult === 'tesSUCCESS' && typeof deleteResult.hash === 'string') {
        loanDeleteTxHash = deleteResult.hash;
        await upsertOnchainTransaction({
          txHash: deleteResult.hash,
          validated: true,
          txType: 'LoanDelete',
          sourceAddress: userAddress,
          destinationAddress: market.loan_broker_address || market.debt_issuer,
          currency: verified.amount.currency,
          issuer: verified.amount.issuer,
          amount: 0,
          rawTxJson: {
            TransactionType: 'LoanDelete',
            Account: userAddress,
            LoanID: loanId,
          },
          rawMetaJson: deleteMeta,
        });
      }

      await clearPositionLoanMetadata(position.id);
    }

    const remainingDebt = debtAfterPay;

    // Update event
    await updateEventStatus(event.id, 'COMPLETED');
    await emitAppEvent({
      eventType: LENDING_EVENTS.REPAY_CONFIRMED,
      module: 'LENDING',
      status: 'COMPLETED',
      userAddress,
      marketId,
      positionId: position.id,
      onchainTxId: onchainTx.id,
      amount: paidAmount,
      currency: market.debt_currency,
      payload: { txHash, loanId, loanDeleteTxHash, interestPaid, principalPaid, excess },
    });

    return {
      result: {
        positionId: position.id,
        amountRepaid: paidAmount,
        interestPaid,
        principalPaid,
        remainingDebt,
      },
    };
  } catch (err) {
    if (err instanceof LoanProtocolError) {
      await updateEventStatus(event.id, 'FAILED', { code: err.code, message: err.message });
      return { error: createError(err.code, err.message) };
    }
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

  const position = await getPositionForUser(userAddress, marketId);
  if (!position) {
    return { error: createError('NO_POSITION', 'No active position found') };
  }

  const loanId = await findBorrowerActiveLoanIdOnChain(market, userAddress);
  let totalDebt = 0;
  if (loanId) {
    try {
      const client = await getClient();
      const loanInfo = await getLoanInfo(client, loanId);
      totalDebt = parsePositiveNumber(loanInfo.outstandingDebt) ?? 0;
    } catch {
      totalDebt = await getBorrowerOutstandingDebtOnChain(market, userAddress) ?? 0;
    }
  }

  if (totalDebt > 0) {
    return {
      error: createError('DEBT_OUTSTANDING', 'Repay all debt before withdrawing escrowed collateral'),
    };
  }

  const updatedPosition = position;

  if (Math.abs(amount - updatedPosition.collateralAmount) > 0.00000001) {
    return {
      error: createError(
        'FULL_WITHDRAW_REQUIRED',
        `Escrow-backed collateral requires full withdrawal of ${updatedPosition.collateralAmount}`
      ),
    };
  }

  if (
    !updatedPosition.escrowOwner ||
    updatedPosition.escrowSequence === null ||
    !updatedPosition.escrowFulfillment ||
    !updatedPosition.escrowCondition
  ) {
    return {
      error: createError('ESCROW_NOT_CONFIGURED', 'Position escrow metadata is missing'),
    };
  }

  try {
    const client = await getClient();
    const backendWallet = getBackendWallet();
    const finishTx = await finishEscrow(backendWallet, {
      owner: updatedPosition.escrowOwner,
      sequence: updatedPosition.escrowSequence,
      fulfillment: updatedPosition.escrowFulfillment,
      condition: updatedPosition.escrowCondition,
    });

    await upsertOnchainTransaction({
      txHash: finishTx.txHash,
      validated: true,
      txType: 'EscrowFinish',
      sourceAddress: backendWallet.address,
      destinationAddress: getBackendAddress(),
      currency: market.collateral_currency,
      issuer: market.collateral_issuer,
      amount,
      rawTxJson: {
        operation: 'ESCROW_FINISH_WITHDRAW',
        owner: updatedPosition.escrowOwner,
        sequence: updatedPosition.escrowSequence,
      },
      rawMetaJson: null,
    });

    const payoutTx = await sendToken(
      client,
      backendWallet,
      userAddress,
      market.collateral_currency,
      amount.toString(),
      market.collateral_issuer
    );

    if (payoutTx.result !== 'tesSUCCESS') {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'COLLATERAL_PAYOUT_FAILED',
        message: `Failed to return collateral: ${payoutTx.result}`,
      });
      return {
        error: createError('COLLATERAL_PAYOUT_FAILED', `Failed to return collateral: ${payoutTx.result}`),
      };
    }

    await upsertOnchainTransaction({
      txHash: payoutTx.hash,
      validated: true,
      txType: payoutTx.transactionType ?? 'Payment',
      sourceAddress: backendWallet.address,
      destinationAddress: userAddress,
      currency: market.collateral_currency,
      issuer: market.collateral_issuer,
      amount,
      rawTxJson: buildOutboundRawTxJson({
        tx: payoutTx,
        sourceAddress: backendWallet.address,
        destinationAddress: userAddress,
        currency: market.collateral_currency,
        issuer: market.collateral_issuer,
        amount,
      }),
      rawMetaJson: payoutTx.rawMeta || null,
    });

    const finalPosition = await removeCollateral(updatedPosition.id, amount);
    await clearPositionEscrowMetadata(updatedPosition.id);

    const withdrawResult: WithdrawResult = {
      positionId: finalPosition.id,
      withdrawnAmount: amount,
      remainingCollateral: finalPosition.collateralAmount,
      txHash: payoutTx.hash,
      escrowFinishTxHash: finishTx.txHash,
    };

    if (idempotencyKey) {
      await completeIdempotencyEvent(event.id, { result: withdrawResult });
    } else {
      await updateEventStatus(event.id, 'COMPLETED');
    }

    await emitAppEvent({
      eventType: LENDING_EVENTS.WITHDRAW_COMPLETED,
      module: 'LENDING',
      status: 'COMPLETED',
      userAddress,
      marketId,
      positionId: position.id,
      amount,
      currency: market.collateral_currency,
      payload: { txHash: payoutTx.hash, escrowFinishTxHash: finishTx.txHash },
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
    if (position) {
      const chainDebt = await getBorrowerOutstandingDebtOnChain(market, userAddress);
      const candidate = {
        ...position,
        loanPrincipal: toAmount(Math.max(0, chainDebt ?? 0)),
        interestAccrued: 0,
      };
      if (
        checkPositionLiquidatable(
          candidate,
          market.liquidation_ltv_ratio,
          prices.collateralPriceUsd,
          prices.debtPriceUsd
        )
      ) {
        positions = [candidate];
      } else {
        positions = [];
      }
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
      const updatedPosition = position;

      if (
        !updatedPosition.escrowOwner ||
        updatedPosition.escrowSequence === null ||
        !updatedPosition.escrowFulfillment ||
        !updatedPosition.escrowCondition
      ) {
        throw new Error('Position escrow metadata is missing');
      }

      const backendWallet = getBackendWallet();
      const finishTx = await finishEscrow(backendWallet, {
        owner: updatedPosition.escrowOwner,
        sequence: updatedPosition.escrowSequence,
        fulfillment: updatedPosition.escrowFulfillment,
        condition: updatedPosition.escrowCondition,
      });

      await upsertOnchainTransaction({
        txHash: finishTx.txHash,
        validated: true,
        txType: 'EscrowFinish',
        sourceAddress: backendWallet.address,
        destinationAddress: getBackendAddress(),
        currency: market.collateral_currency,
        issuer: market.collateral_issuer,
        amount: updatedPosition.collateralAmount,
        rawTxJson: {
          operation: 'ESCROW_FINISH_LIQUIDATION',
          owner: updatedPosition.escrowOwner,
          sequence: updatedPosition.escrowSequence,
        },
        rawMetaJson: null,
      });

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
): Promise<{ position: Position; metrics: PositionMetrics; market: Market; loan: LoanRepaymentOverview | null } | null> {
  const [market, rawPosition] = await Promise.all([
    getMarketById(marketId),
    getPositionForUser(userAddress, marketId),
  ]);

  if (!market) {
    return null;
  }

  if (!rawPosition) {
    return null;
  }

  const position = rawPosition;

  const [prices, pool, resolvedLoanId] = await Promise.all([
    getMarketPrices(marketId),
    getPoolMetrics(marketId),
    findBorrowerActiveLoanIdOnChain(market, userAddress),
  ]);

  if (!prices) {
    return null;
  }

  const marketData = mapMarketRecordToDomain(market);
  if (!pool) {
    return null;
  }

  let debtAdjustedPosition = position;
  let loanRepaymentOverview: LoanRepaymentOverview | null = null;

  if (resolvedLoanId) {
    try {
      const client = await getClient();
      const loanInfo = await getLoanInfo(client, resolvedLoanId);
      const totalDebt = parsePositiveNumber(loanInfo.outstandingDebt);
      if (totalDebt !== null) {
        const principal = parsePositiveNumber(loanInfo.principal);
        const accruedInterest = parsePositiveNumber(loanInfo.accruedInterest);
        const principalValue = principal ?? totalDebt;
        const interestValue = accruedInterest ?? Math.max(0, totalDebt - principalValue);

        debtAdjustedPosition = {
          ...position,
          loanPrincipal: toAmount(principalValue),
          interestAccrued: toAmount(interestValue),
        };
      }

      const periodicPayment = readLoanNumericField(loanInfo.raw, [
        'PeriodicPayment',
        'periodicPayment',
        'periodic_payment',
      ]);
      const paymentRemaining = readLoanNumericField(loanInfo.raw, [
        'PaymentRemaining',
        'paymentRemaining',
        'payment_remaining',
        'RemainingPayments',
      ]);
      const nextPaymentDueRippleEpoch = readLoanNumericField(loanInfo.raw, [
        'NextPaymentDueDate',
        'nextPaymentDueDate',
        'next_payment_due_date',
        'NextDueDate',
      ]);
      const nextPaymentDue = rippleEpochToDate(nextPaymentDueRippleEpoch);
      const minimumRepayment = getLoanMinimumRepayment(loanInfo);
      const fullRepayment = parsePositiveNumber(loanInfo.outstandingDebt);
      const suggestedOverpayment =
        minimumRepayment !== null && fullRepayment !== null
          ? Math.min(fullRepayment, minimumRepayment * 1.5)
          : minimumRepayment;

      loanRepaymentOverview = {
        loanId: resolvedLoanId,
        minimumRepayment,
        fullRepayment,
        suggestedOverpayment,
        periodicPayment,
        paymentRemaining,
        nextPaymentDueDate: nextPaymentDue ? nextPaymentDue.toISOString() : null,
        nextPaymentDueRippleEpoch,
        isPastDue: nextPaymentDue ? nextPaymentDue.getTime() < Date.now() : false,
      };
    } catch {
      const borrowerDebt = await getBorrowerOutstandingDebtOnChain(market, userAddress);
      debtAdjustedPosition = {
        ...position,
        loanPrincipal: toAmount(Math.max(0, borrowerDebt ?? 0)),
        interestAccrued: 0,
      };

      if (borrowerDebt !== null && borrowerDebt <= 0) {
        await clearPositionLoanMetadata(position.id);
      }
    }
  } else {
    // On-chain first: derive borrower debt from on-chain Loan objects for this market.
    const borrowerDebt = await getBorrowerOutstandingDebtOnChain(market, userAddress);
    debtAdjustedPosition = {
      ...position,
      loanPrincipal: toAmount(Math.max(0, borrowerDebt ?? 0)),
      interestAccrued: 0,
    };

    if (borrowerDebt !== null && borrowerDebt <= 0 && (position.loanPrincipal > 0 || position.interestAccrued > 0 || position.loanId)) {
      await clearPositionLoanMetadata(position.id);
    }
  }

  const baseMetrics = calculatePositionMetrics(
    debtAdjustedPosition,
    marketData,
    prices.collateralPriceUsd,
    prices.debtPriceUsd
  );

  const metrics: PositionMetrics = {
    ...baseMetrics,
    maxBorrowableAmount: Math.min(baseMetrics.maxBorrowableAmount, pool.availableLiquidity),
    availableLiquidity: pool.availableLiquidity,
  };

  return { position: debtAdjustedPosition, metrics, market: marketData, loan: loanRepaymentOverview };
}

function buildSupplyPositionMetrics(position: SupplyPosition, pool: PoolMetrics): SupplyPositionMetrics {
  const accruedYield = 0;
  const withdrawableAmount = toAmount(position.supplyAmount);

  return {
    accruedYield,
    withdrawableAmount,
    availableLiquidity: pool.availableLiquidity,
    utilizationRate: pool.utilizationRate,
    supplyApr: pool.supplyApr,
    supplyApy: pool.supplyApy,
  };
}

function buildSupplyPositionMetricsWithBalances(
  principalAmount: number,
  grossPositionValue: number,
  withdrawableAmount: number,
  pool: PoolMetrics
): SupplyPositionMetrics {
  return {
    accruedYield: toAmount(Math.max(0, grossPositionValue - principalAmount)),
    withdrawableAmount: toAmount(withdrawableAmount),
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
  const marketRow = await getMarketById(marketId);
  if (!marketRow) {
    return { error: createError('MARKET_NOT_FOUND', 'Market not found or inactive') };
  }

  let market: MarketRecord;
  try {
    market = await ensureMarketSupplyVaultConfigured(marketRow);
  } catch (error) {
    return {
      error: createError(
        'VAULT_NOT_CONFIGURED',
        error instanceof Error ? error.message : 'Supply vault is not configured'
      ),
    };
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
    const txResult = extractTransactionResult(tx.rawMeta);

    if (!tx.validated) {
      await updateEventStatus(event.id, 'FAILED', { code: 'TX_NOT_VALIDATED', message: 'Transaction not validated' });
      return { error: createError('TX_NOT_VALIDATED', 'Transaction not yet validated') };
    }

    if (txResult !== 'tesSUCCESS') {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'TX_FAILED',
        message: `Vault deposit failed on-ledger (${txResult ?? 'unknown'})`,
      });
      return {
        error: createError('TX_FAILED', `Vault deposit failed on-ledger (${txResult ?? 'unknown'})`),
      };
    }

    if (tx.transactionType !== 'VaultDeposit') {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'NOT_VAULT_DEPOSIT',
        message: `Expected VaultDeposit, got ${tx.transactionType}`,
      });
      return {
        error: createError('NOT_VAULT_DEPOSIT', `Expected VaultDeposit, got ${tx.transactionType}`),
      };
    }

    const vaultId = extractVaultIdFromRawTx(tx.rawTx);
    if (!vaultId || vaultId !== market.supply_vault_id) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'WRONG_VAULT',
        message: `Transaction must target configured vault ${market.supply_vault_id}`,
      });
      return {
        error: createError(
          'WRONG_VAULT',
          `Transaction must target configured vault ${market.supply_vault_id}`
        ),
      };
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
      destinationAddress: market.supply_vault_id,
      currency: tx.amount.currency,
      issuer: tx.amount.issuer,
      amount,
      rawTxJson: {
        ...buildInboundRawTxJson(tx),
        operation: 'VAULT_DEPOSIT',
        vaultId: market.supply_vault_id,
      },
      rawMetaJson: tx.rawMeta || null,
    });

    const supplyPosition = await getOrCreateSupplyPosition(senderAddress, marketId, 1);
    const updatedSupplyPosition = await addSupply(supplyPosition.id, amount, 1);

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
        vaultId: market.supply_vault_id,
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
  _userAddress: string,
  _marketId: string,
  _idempotencyKey?: string
): Promise<{ result?: CollectYieldResult; error?: LendingServiceError }> {
  void _userAddress;
  void _marketId;
  void _idempotencyKey;

  return {
    error: createError(
      'UNSUPPORTED_OPERATION',
      'Yield is realized via vault share redemption. Use withdraw supply instead.'
    ),
  };
}

/**
 * Withdraw supplied principal from the lending pool.
 */
export async function processWithdrawSupply(
  userAddress: string,
  marketId: string,
  amount: number,
  txHash: string,
  idempotencyKey?: string
): Promise<{ result?: WithdrawSupplyResult; error?: LendingServiceError }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: createError('INVALID_AMOUNT', 'Amount must be a positive number') };
  }

  const marketRow = await getMarketById(marketId);
  if (!marketRow) {
    return { error: createError('MARKET_NOT_FOUND', 'Market not found or inactive') };
  }

  let market: MarketRecord;
  try {
    market = await ensureMarketSupplyVaultConfigured(marketRow);
  } catch (error) {
    return {
      error: createError(
        'VAULT_NOT_CONFIGURED',
        error instanceof Error ? error.message : 'Supply vault is not configured'
      ),
    };
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
    const txResult = extractTransactionResult(tx.rawMeta);

    if (!tx.validated) {
      await updateEventStatus(event.id, 'FAILED', { code: 'TX_NOT_VALIDATED', message: 'Transaction not validated' });
      return { error: createError('TX_NOT_VALIDATED', 'Transaction not yet validated') };
    }

    if (txResult !== 'tesSUCCESS') {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'TX_FAILED',
        message: `Vault withdraw failed on-ledger (${txResult ?? 'unknown'})`,
      });
      return {
        error: createError('TX_FAILED', `Vault withdraw failed on-ledger (${txResult ?? 'unknown'})`),
      };
    }

    if (tx.transactionType !== 'VaultWithdraw') {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'NOT_VAULT_WITHDRAW',
        message: `Expected VaultWithdraw, got ${tx.transactionType}`,
      });
      return {
        error: createError('NOT_VAULT_WITHDRAW', `Expected VaultWithdraw, got ${tx.transactionType}`),
      };
    }

    const vaultId = extractVaultIdFromRawTx(tx.rawTx);
    if (!vaultId || vaultId !== market.supply_vault_id) {
      await updateEventStatus(event.id, 'FAILED', {
        code: 'WRONG_VAULT',
        message: `Transaction must target configured vault ${market.supply_vault_id}`,
      });
      return {
        error: createError(
          'WRONG_VAULT',
          `Transaction must target configured vault ${market.supply_vault_id}`
        ),
      };
    }

    if (tx.source !== userAddress) {
      await updateEventStatus(event.id, 'FAILED', { code: 'SENDER_MISMATCH', message: 'Sender mismatch' });
      return { error: createError('SENDER_MISMATCH', 'Transaction sender does not match') };
    }

    const mptIssuanceId = extractMptIssuanceIdFromRawAmount(tx.rawTx);
    const shareRedeemMode = Boolean(mptIssuanceId);

    if (shareRedeemMode) {
      if (!market.supply_mpt_issuance_id) {
        await updateEventStatus(event.id, 'FAILED', {
          code: 'MPT_NOT_CONFIGURED',
          message: 'Market does not have a configured supply MPT issuance',
        });
        return {
          error: createError('MPT_NOT_CONFIGURED', 'Market does not have a configured supply MPT issuance'),
        };
      }

      if (mptIssuanceId !== market.supply_mpt_issuance_id) {
        await updateEventStatus(event.id, 'FAILED', {
          code: 'WRONG_MPT_ISSUANCE',
          message: `Expected MPT issuance ${market.supply_mpt_issuance_id}, got ${mptIssuanceId}`,
        });
        return {
          error: createError(
            'WRONG_MPT_ISSUANCE',
            `Expected MPT issuance ${market.supply_mpt_issuance_id}, got ${mptIssuanceId}`
          ),
        };
      }
    } else {
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

      const txAmount = toAmount(tx.amount.value);
      if (Math.abs(txAmount - amount) > 0.00000001) {
        await updateEventStatus(event.id, 'FAILED', {
          code: 'AMOUNT_MISMATCH',
          message: `Requested amount ${amount} does not match transaction amount ${txAmount}`,
        });
        return {
          error: createError(
            'AMOUNT_MISMATCH',
            `Requested amount ${amount} does not match transaction amount ${txAmount}`
          ),
        };
      }
    }

    const effectiveWithdrawAmount = shareRedeemMode ? amount : toAmount(tx.amount?.value ?? amount);

    const onchainTx = await upsertOnchainTransaction({
      txHash,
      validated: tx.validated,
      txType: tx.transactionType,
      sourceAddress: tx.source,
      destinationAddress: market.supply_vault_id,
      currency: tx.amount?.currency || market.debt_currency,
      issuer: tx.amount?.issuer || market.debt_issuer,
      amount: effectiveWithdrawAmount,
      rawTxJson: {
        ...buildInboundRawTxJson(tx),
        operation: 'VAULT_WITHDRAW',
        vaultId: market.supply_vault_id,
        withdrawMode: shareRedeemMode ? 'SHARES' : 'ASSETS',
      },
      rawMetaJson: tx.rawMeta || null,
    });

    const trackedPosition = await getSupplyPositionForUser(userAddress, marketId);
    let supplyPositionId = trackedPosition?.id ?? `onchain:${marketId}:${userAddress}`;
    let remainingSupply = 0;

    if (market.supply_mpt_issuance_id) {
      const shareScale = Math.max(0, market.vault_scale ?? 6);
      const remainingShares = await getSupplierShareBalance(
        client,
        userAddress,
        market.supply_mpt_issuance_id
      );
      remainingSupply = toAmount(
        new Decimal(remainingShares.shares).div(new Decimal(10).pow(shareScale))
      );
    }

    if (trackedPosition) {
      const delta = Math.min(effectiveWithdrawAmount, trackedPosition.supplyAmount);
      if (delta > 0) {
        const updatedPosition = await removeSupply(trackedPosition.id, delta, 1);
        supplyPositionId = updatedPosition.id;
        if (!market.supply_mpt_issuance_id) {
          remainingSupply = updatedPosition.supplyAmount;
        }
      }
    }

    const withdrawResult: WithdrawSupplyResult = {
      marketId,
      supplyPositionId,
      withdrawnAmount: effectiveWithdrawAmount,
      remainingSupply,
      txHash,
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
      amount: effectiveWithdrawAmount,
      currency: market.debt_currency,
      payload: { txHash, supplyPositionId, vaultId: market.supply_vault_id },
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

  const pool = await getPoolMetrics(marketId);
  if (!pool) {
    return null;
  }

  if (market.supply_mpt_issuance_id) {
    const client = await getClient();
    const trackedPosition = await getSupplyPositionForUser(userAddress, marketId);
    const vaultInfo = market.supply_vault_id
      ? await getSupplyVaultInfo(client, market.supply_vault_id)
      : null;
    const shareBalance = await getSupplierShareBalance(
      client,
      userAddress,
      market.supply_mpt_issuance_id
    );
    const shareScale = Math.max(0, market.vault_scale ?? 6);
    const onchainSupplyAmount = toAmount(
      new Decimal(shareBalance.shares).div(new Decimal(10).pow(shareScale))
    );
    const exchangeRate = vaultInfo ? new Decimal(vaultInfo.exchangeRate) : new Decimal(1);
    const grossPositionValue = toAmount(new Decimal(onchainSupplyAmount).mul(exchangeRate));

    const principalAmount = trackedPosition?.supplyAmount ?? onchainSupplyAmount;

    if (onchainSupplyAmount <= 0 && principalAmount <= 0 && grossPositionValue <= 0) {
      return null;
    }

    const withdrawableAmount = Math.min(grossPositionValue, pool.availableLiquidity);

    const now = new Date();
    const onchainPosition: SupplyPosition = {
      id: `onchain:${marketId}:${userAddress}`,
      userId: userAddress,
      marketId,
      status: 'ACTIVE',
      supplyAmount: toAmount(principalAmount),
      yieldIndex: 1,
      lastYieldUpdate: now,
      suppliedAt: now,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const metrics = buildSupplyPositionMetricsWithBalances(
      onchainPosition.supplyAmount,
      grossPositionValue,
      withdrawableAmount,
      pool
    );

    return {
      position: onchainPosition,
      metrics,
      pool,
      market: mapMarketRecordToDomain(market),
    };
  }

  const position = await getSupplyPositionForUser(userAddress, marketId);
  if (!position) {
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
