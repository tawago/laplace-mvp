import Decimal from 'decimal.js';
import { and, eq } from 'drizzle-orm';

import { db, markets } from '../db';
import {
  calculateGlobalYieldIndex,
  calculateSupplyApr,
  calculateSupplyApy,
  calculateUtilizationRate,
} from './calculations';
import { PoolMetrics } from './types';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_DOWN });

const TOKEN_SCALE = 8;

type DbClient = typeof db;

interface MarketPoolState {
  id: string;
  totalSupplied: number;
  totalBorrowed: number;
  baseInterestRate: number;
  reserveFactor: number;
  globalYieldIndex: number;
  lastIndexUpdate: Date;
}

function toAmount(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(TOKEN_SCALE, Decimal.ROUND_DOWN).toNumber();
}

function parsePoolState(row: typeof markets.$inferSelect): MarketPoolState {
  return {
    id: row.id,
    totalSupplied: parseFloat(row.totalSupplied),
    totalBorrowed: parseFloat(row.totalBorrowed),
    baseInterestRate: parseFloat(row.baseInterestRate),
    reserveFactor: parseFloat(row.reserveFactor),
    globalYieldIndex: parseFloat(row.globalYieldIndex),
    lastIndexUpdate: row.lastIndexUpdate,
  };
}

async function getMarketPoolState(marketId: string, database: DbClient = db): Promise<MarketPoolState | null> {
  const market = await database.query.markets.findFirst({
    where: and(eq(markets.id, marketId), eq(markets.isActive, true)),
  });

  if (!market) {
    return null;
  }

  return parsePoolState(market);
}

function buildPoolMetrics(state: MarketPoolState): PoolMetrics {
  const availableLiquidity = toAmount(
    Decimal.max(0, new Decimal(state.totalSupplied).sub(new Decimal(state.totalBorrowed)))
  );
  const utilizationRate = calculateUtilizationRate(state.totalBorrowed, state.totalSupplied);
  const supplyApr = calculateSupplyApr(state.baseInterestRate, utilizationRate, state.reserveFactor);
  const supplyApy = calculateSupplyApy(supplyApr);

  return {
    marketId: state.id,
    totalSupplied: state.totalSupplied,
    totalBorrowed: state.totalBorrowed,
    availableLiquidity,
    utilizationRate,
    borrowApr: state.baseInterestRate,
    supplyApr,
    supplyApy,
    globalYieldIndex: state.globalYieldIndex,
    reserveFactor: state.reserveFactor,
    lastIndexUpdate: state.lastIndexUpdate,
  };
}

function validatePositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
}

export async function getPoolMetrics(marketId: string, database: DbClient = db): Promise<PoolMetrics | null> {
  const state = await getMarketPoolState(marketId, database);
  if (!state) {
    return null;
  }

  return buildPoolMetrics(state);
}

export async function getAvailableLiquidity(marketId: string, database: DbClient = db): Promise<number> {
  const metrics = await getPoolMetrics(marketId, database);
  if (!metrics) {
    throw new Error('Market not found');
  }

  return metrics.availableLiquidity;
}

export async function updateGlobalYieldIndex(
  marketId: string,
  database: DbClient = db
): Promise<{ globalYieldIndex: number; supplyApr: number; lastIndexUpdate: Date }> {
  const state = await getMarketPoolState(marketId, database);
  if (!state) {
    throw new Error('Market not found');
  }

  const utilizationRate = calculateUtilizationRate(state.totalBorrowed, state.totalSupplied);
  const supplyApr = calculateSupplyApr(state.baseInterestRate, utilizationRate, state.reserveFactor);
  const now = new Date();
  const nextGlobalYieldIndex = calculateGlobalYieldIndex(
    state.globalYieldIndex,
    supplyApr,
    state.lastIndexUpdate,
    now
  );

  await database
    .update(markets)
    .set({
      globalYieldIndex: nextGlobalYieldIndex.toString(),
      lastIndexUpdate: now,
      updatedAt: now,
    })
    .where(eq(markets.id, marketId));

  return {
    globalYieldIndex: nextGlobalYieldIndex,
    supplyApr,
    lastIndexUpdate: now,
  };
}

export async function addToTotalSupplied(
  marketId: string,
  amount: number,
  database: DbClient = db
): Promise<number> {
  validatePositiveAmount(amount);

  const state = await getMarketPoolState(marketId, database);
  if (!state) {
    throw new Error('Market not found');
  }

  const nextTotalSupplied = toAmount(new Decimal(state.totalSupplied).add(amount));
  await database
    .update(markets)
    .set({
      totalSupplied: nextTotalSupplied.toString(),
      updatedAt: new Date(),
    })
    .where(eq(markets.id, marketId));

  return nextTotalSupplied;
}

export async function removeFromTotalSupplied(
  marketId: string,
  amount: number,
  database: DbClient = db
): Promise<number> {
  validatePositiveAmount(amount);

  const state = await getMarketPoolState(marketId, database);
  if (!state) {
    throw new Error('Market not found');
  }

  const supplied = new Decimal(state.totalSupplied);
  const borrowed = new Decimal(state.totalBorrowed);
  const amountDec = new Decimal(amount);

  if (amountDec.gt(supplied)) {
    throw new Error('Insufficient total supplied balance');
  }

  const nextTotalSupplied = supplied.sub(amountDec);
  if (nextTotalSupplied.lt(borrowed)) {
    throw new Error('Withdrawal would violate market liquidity constraints');
  }

  const nextValue = toAmount(nextTotalSupplied);
  await database
    .update(markets)
    .set({
      totalSupplied: nextValue.toString(),
      updatedAt: new Date(),
    })
    .where(eq(markets.id, marketId));

  return nextValue;
}

export async function addToTotalBorrowed(
  marketId: string,
  amount: number,
  database: DbClient = db
): Promise<number> {
  validatePositiveAmount(amount);

  const state = await getMarketPoolState(marketId, database);
  if (!state) {
    throw new Error('Market not found');
  }

  const supplied = new Decimal(state.totalSupplied);
  const borrowed = new Decimal(state.totalBorrowed);
  const nextTotalBorrowed = borrowed.add(amount);

  if (nextTotalBorrowed.gt(supplied)) {
    throw new Error('Insufficient pool liquidity for borrow');
  }

  const nextValue = toAmount(nextTotalBorrowed);
  await database
    .update(markets)
    .set({
      totalBorrowed: nextValue.toString(),
      updatedAt: new Date(),
    })
    .where(eq(markets.id, marketId));

  return nextValue;
}

export async function removeFromTotalBorrowed(
  marketId: string,
  amount: number,
  database: DbClient = db
): Promise<number> {
  validatePositiveAmount(amount);

  const state = await getMarketPoolState(marketId, database);
  if (!state) {
    throw new Error('Market not found');
  }

  const borrowed = new Decimal(state.totalBorrowed);
  const amountDec = new Decimal(amount);

  if (amountDec.gt(borrowed)) {
    throw new Error('Repayment exceeds total borrowed');
  }

  const nextValue = toAmount(borrowed.sub(amountDec));
  await database
    .update(markets)
    .set({
      totalBorrowed: nextValue.toString(),
      updatedAt: new Date(),
    })
    .where(eq(markets.id, marketId));

  return nextValue;
}
