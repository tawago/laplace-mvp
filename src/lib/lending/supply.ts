import Decimal from 'decimal.js';
import { and, eq } from 'drizzle-orm';

import { db, supplyPositions, users, SupplyPosition as DbSupplyPosition } from '../db';
import { getOrCreateUser } from '../db/seed';
import { calculateAccruedSupplyYield, deriveYieldIndexFromAccrued } from './calculations';
import { SupplyPosition } from './types';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_DOWN });

const TOKEN_SCALE = 8;
const INDEX_SCALE = 18;

type DbClient = typeof db;

function toTokenAmount(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(TOKEN_SCALE, Decimal.ROUND_DOWN).toNumber();
}

function toIndexValue(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(INDEX_SCALE, Decimal.ROUND_DOWN).toNumber();
}

function validatePositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
}

function dbToSupplyPosition(row: DbSupplyPosition): SupplyPosition {
  return {
    id: row.id,
    userId: row.userId,
    marketId: row.marketId,
    status: row.status,
    supplyAmount: parseFloat(row.supplyAmount),
    yieldIndex: parseFloat(row.yieldIndex),
    lastYieldUpdate: row.lastYieldUpdate,
    suppliedAt: row.suppliedAt,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getSupplyPositionById(
  positionId: string,
  database: DbClient = db
): Promise<SupplyPosition | null> {
  const row = await database.query.supplyPositions.findFirst({
    where: eq(supplyPositions.id, positionId),
  });

  return row ? dbToSupplyPosition(row) : null;
}

export async function getOrCreateSupplyPosition(
  userAddress: string,
  marketId: string,
  currentGlobalYieldIndex: number,
  database: DbClient = db
): Promise<SupplyPosition> {
  const userId = await getOrCreateUser(userAddress);

  const existing = await database.query.supplyPositions.findFirst({
    where: and(eq(supplyPositions.userId, userId), eq(supplyPositions.marketId, marketId)),
  });

  if (existing) {
    if (existing.status === 'CLOSED') {
      const now = new Date();
      const [reopened] = await database
        .update(supplyPositions)
        .set({
          status: 'ACTIVE',
          closedAt: null,
          yieldIndex: toIndexValue(currentGlobalYieldIndex).toString(),
          lastYieldUpdate: now,
          updatedAt: now,
        })
        .where(eq(supplyPositions.id, existing.id))
        .returning();

      return dbToSupplyPosition(reopened);
    }

    return dbToSupplyPosition(existing);
  }

  const [created] = await database
    .insert(supplyPositions)
    .values({
      userId,
      marketId,
      status: 'ACTIVE',
      supplyAmount: '0',
      yieldIndex: toIndexValue(currentGlobalYieldIndex).toString(),
    })
    .returning();

  return dbToSupplyPosition(created);
}

export async function getSupplyPositionForUser(
  userAddress: string,
  marketId: string,
  database: DbClient = db
): Promise<SupplyPosition | null> {
  const user = await database.query.users.findFirst({
    where: eq(users.xrplAddress, userAddress),
    columns: { id: true },
  });

  if (!user) {
    return null;
  }

  const position = await database.query.supplyPositions.findFirst({
    where: and(
      eq(supplyPositions.userId, user.id),
      eq(supplyPositions.marketId, marketId),
      eq(supplyPositions.status, 'ACTIVE')
    ),
  });

  return position ? dbToSupplyPosition(position) : null;
}

export function accrueSupplyYield(position: SupplyPosition, globalYieldIndex: number): number {
  return calculateAccruedSupplyYield(position.supplyAmount, globalYieldIndex, position.yieldIndex);
}

export async function checkpointSupplyYield(
  positionId: string,
  globalYieldIndex: number,
  database: DbClient = db
): Promise<SupplyPosition> {
  const now = new Date();

  const [updated] = await database
    .update(supplyPositions)
    .set({
      yieldIndex: toIndexValue(globalYieldIndex).toString(),
      lastYieldUpdate: now,
      updatedAt: now,
    })
    .where(eq(supplyPositions.id, positionId))
    .returning();

  if (!updated) {
    throw new Error('Supply position not found');
  }

  return dbToSupplyPosition(updated);
}

export async function addSupply(
  positionId: string,
  amount: number,
  globalYieldIndex: number,
  database: DbClient = db
): Promise<SupplyPosition> {
  validatePositiveAmount(amount);

  const position = await getSupplyPositionById(positionId, database);
  if (!position) {
    throw new Error('Supply position not found');
  }

  const currentAccruedYield = calculateAccruedSupplyYield(
    position.supplyAmount,
    globalYieldIndex,
    position.yieldIndex
  );
  const nextSupplyAmount = toTokenAmount(new Decimal(position.supplyAmount).add(amount));
  const nextYieldIndex = deriveYieldIndexFromAccrued(
    globalYieldIndex,
    nextSupplyAmount,
    currentAccruedYield
  );
  const now = new Date();

  const [updated] = await database
    .update(supplyPositions)
    .set({
      status: 'ACTIVE',
      supplyAmount: nextSupplyAmount.toString(),
      yieldIndex: toIndexValue(nextYieldIndex).toString(),
      lastYieldUpdate: now,
      updatedAt: now,
    })
    .where(eq(supplyPositions.id, positionId))
    .returning();

  if (!updated) {
    throw new Error('Failed to update supply position');
  }

  return dbToSupplyPosition(updated);
}

export async function removeSupply(
  positionId: string,
  amount: number,
  globalYieldIndex: number,
  database: DbClient = db
): Promise<SupplyPosition> {
  validatePositiveAmount(amount);

  const position = await getSupplyPositionById(positionId, database);
  if (!position) {
    throw new Error('Supply position not found');
  }

  if (position.status !== 'ACTIVE') {
    throw new Error('Supply position is not active');
  }

  const amountDec = new Decimal(amount);
  const currentSupplyDec = new Decimal(position.supplyAmount);

  if (amountDec.gt(currentSupplyDec)) {
    throw new Error('Insufficient supplied balance');
  }

  const currentAccruedYield = calculateAccruedSupplyYield(
    position.supplyAmount,
    globalYieldIndex,
    position.yieldIndex
  );
  const nextSupplyDec = currentSupplyDec.sub(amountDec);
  const now = new Date();

  if (nextSupplyDec.isZero()) {
    if (new Decimal(currentAccruedYield).gt(0)) {
      throw new Error('Collect accrued yield before withdrawing full principal');
    }

    const [closed] = await database
      .update(supplyPositions)
      .set({
        status: 'CLOSED',
        supplyAmount: '0',
        yieldIndex: toIndexValue(globalYieldIndex).toString(),
        lastYieldUpdate: now,
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(supplyPositions.id, positionId))
      .returning();

    if (!closed) {
      throw new Error('Failed to close supply position');
    }

    return dbToSupplyPosition(closed);
  }

  const nextSupplyAmount = toTokenAmount(nextSupplyDec);
  const nextYieldIndex = deriveYieldIndexFromAccrued(
    globalYieldIndex,
    nextSupplyAmount,
    currentAccruedYield
  );

  const [updated] = await database
    .update(supplyPositions)
    .set({
      supplyAmount: nextSupplyAmount.toString(),
      yieldIndex: toIndexValue(nextYieldIndex).toString(),
      lastYieldUpdate: now,
      updatedAt: now,
    })
    .where(eq(supplyPositions.id, positionId))
    .returning();

  if (!updated) {
    throw new Error('Failed to reduce supply position');
  }

  return dbToSupplyPosition(updated);
}

export async function closeSupplyPosition(
  positionId: string,
  database: DbClient = db
): Promise<SupplyPosition> {
  const position = await getSupplyPositionById(positionId, database);
  if (!position) {
    throw new Error('Supply position not found');
  }

  if (position.supplyAmount > 0) {
    throw new Error('Cannot close position with remaining supplied balance');
  }

  const now = new Date();
  const [closed] = await database
    .update(supplyPositions)
    .set({
      status: 'CLOSED',
      closedAt: now,
      updatedAt: now,
    })
    .where(eq(supplyPositions.id, positionId))
    .returning();

  if (!closed) {
    throw new Error('Failed to close supply position');
  }

  return dbToSupplyPosition(closed);
}
