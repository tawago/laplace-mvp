/**
 * Position Management Service
 *
 * Handles lending position CRUD operations with interest accrual using Drizzle ORM.
 */

import { eq, and } from 'drizzle-orm';
import { db, users, positions, Position as DbPosition } from '../db';
import { getOrCreateUser } from '../db/seed';
import { PositionStatus, Position, PositionMetrics, Market } from './types';
import {
  calculateInterestAccrued,
  calculateTotalDebt,
  calculateLtv,
  calculateHealthFactor,
  calculateMaxBorrowable,
  calculateMaxWithdrawable,
  isLiquidatable,
} from './calculations';

// Legacy row type for compatibility
export interface PositionRow {
  id: string;
  user_id: string;
  market_id: string;
  status: 'ACTIVE' | 'LIQUIDATED' | 'CLOSED';
  collateral_amount: number;
  loan_principal: number;
  interest_accrued: number;
  last_interest_update: string;
  interest_rate_at_open: number;
  opened_at: string;
  closed_at: string | null;
  liquidated_at: string | null;
}

/**
 * Convert database position to Position object
 */
function dbToPosition(row: DbPosition): Position {
  return {
    id: row.id,
    userId: row.userId,
    marketId: row.marketId,
    status: row.status as PositionStatus,
    collateralAmount: parseFloat(row.collateralAmount),
    loanPrincipal: parseFloat(row.loanPrincipal),
    interestAccrued: parseFloat(row.interestAccrued),
    lastInterestUpdate: row.lastInterestUpdate,
    interestRateAtOpen: parseFloat(row.interestRateAtOpen),
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    liquidatedAt: row.liquidatedAt,
  };
}

/**
 * Get or create a position for a user in a market
 */
export async function getOrCreatePosition(
  userAddress: string,
  marketId: string,
  interestRate: number
): Promise<Position> {
  const userId = await getOrCreateUser(userAddress);

  // Check for existing position
  const existing = await db.query.positions.findFirst({
    where: and(eq(positions.userId, userId), eq(positions.marketId, marketId), eq(positions.status, 'ACTIVE')),
  });

  if (existing) {
    return dbToPosition(existing);
  }

  // Create new position
  const [newPosition] = await db
    .insert(positions)
    .values({
      userId,
      marketId,
      status: 'ACTIVE',
      collateralAmount: '0',
      loanPrincipal: '0',
      interestAccrued: '0',
      interestRateAtOpen: interestRate.toString(),
    })
    .returning();

  return dbToPosition(newPosition);
}

/**
 * Get position by ID
 */
export async function getPositionById(positionId: string): Promise<Position | null> {
  const position = await db.query.positions.findFirst({
    where: eq(positions.id, positionId),
  });

  return position ? dbToPosition(position) : null;
}

/**
 * Get position for user in a market
 */
export async function getPositionForUser(userAddress: string, marketId: string): Promise<Position | null> {
  // Get user ID
  const user = await db.query.users.findFirst({
    where: eq(users.xrplAddress, userAddress),
    columns: { id: true },
  });

  if (!user) {
    return null;
  }

  const position = await db.query.positions.findFirst({
    where: and(eq(positions.userId, user.id), eq(positions.marketId, marketId), eq(positions.status, 'ACTIVE')),
  });

  return position ? dbToPosition(position) : null;
}

/**
 * Accrue interest on a position and update the database
 */
export async function accrueInterest(position: Position): Promise<Position> {
  const now = new Date();

  if (position.loanPrincipal <= 0) {
    return position;
  }

  const newInterest = calculateInterestAccrued(
    position.loanPrincipal,
    position.interestRateAtOpen,
    position.lastInterestUpdate,
    now
  );

  if (newInterest <= 0) {
    return position;
  }

  const updatedInterest = position.interestAccrued + newInterest;

  await db
    .update(positions)
    .set({
      interestAccrued: updatedInterest.toString(),
      lastInterestUpdate: now,
    })
    .where(eq(positions.id, position.id));

  return {
    ...position,
    interestAccrued: updatedInterest,
    lastInterestUpdate: now,
  };
}

/**
 * Add collateral to a position
 */
export async function addCollateral(positionId: string, amount: number): Promise<Position> {
  // First accrue interest
  let position = await getPositionById(positionId);
  if (!position) {
    throw new Error('Position not found');
  }

  position = await accrueInterest(position);

  const newCollateral = position.collateralAmount + amount;

  await db
    .update(positions)
    .set({
      collateralAmount: newCollateral.toString(),
      lastInterestUpdate: new Date(),
    })
    .where(eq(positions.id, positionId));

  return {
    ...position,
    collateralAmount: newCollateral,
  };
}

/**
 * Remove collateral from a position
 */
export async function removeCollateral(positionId: string, amount: number): Promise<Position> {
  let position = await getPositionById(positionId);
  if (!position) {
    throw new Error('Position not found');
  }

  position = await accrueInterest(position);

  if (amount > position.collateralAmount) {
    throw new Error('Insufficient collateral');
  }

  const newCollateral = position.collateralAmount - amount;

  await db
    .update(positions)
    .set({
      collateralAmount: newCollateral.toString(),
      lastInterestUpdate: new Date(),
    })
    .where(eq(positions.id, positionId));

  return {
    ...position,
    collateralAmount: newCollateral,
  };
}

/**
 * Add to loan principal (borrow)
 */
export async function addLoanPrincipal(positionId: string, amount: number): Promise<Position> {
  let position = await getPositionById(positionId);
  if (!position) {
    throw new Error('Position not found');
  }

  position = await accrueInterest(position);

  const newPrincipal = position.loanPrincipal + amount;

  await db
    .update(positions)
    .set({
      loanPrincipal: newPrincipal.toString(),
      lastInterestUpdate: new Date(),
    })
    .where(eq(positions.id, positionId));

  return {
    ...position,
    loanPrincipal: newPrincipal,
  };
}

/**
 * Apply repayment to position (interest first, then principal)
 */
export async function applyRepayment(
  positionId: string,
  interestPaid: number,
  principalPaid: number
): Promise<Position> {
  let position = await getPositionById(positionId);
  if (!position) {
    throw new Error('Position not found');
  }

  position = await accrueInterest(position);

  const newInterest = Math.max(0, position.interestAccrued - interestPaid);
  const newPrincipal = Math.max(0, position.loanPrincipal - principalPaid);

  await db
    .update(positions)
    .set({
      interestAccrued: newInterest.toString(),
      loanPrincipal: newPrincipal.toString(),
      lastInterestUpdate: new Date(),
    })
    .where(eq(positions.id, positionId));

  return {
    ...position,
    interestAccrued: newInterest,
    loanPrincipal: newPrincipal,
  };
}

/**
 * Close a position (when fully repaid and no collateral)
 */
export async function closePosition(positionId: string): Promise<Position> {
  const position = await getPositionById(positionId);
  if (!position) {
    throw new Error('Position not found');
  }

  if (position.loanPrincipal > 0 || position.interestAccrued > 0) {
    throw new Error('Cannot close position with outstanding debt');
  }

  if (position.collateralAmount > 0) {
    throw new Error('Cannot close position with remaining collateral');
  }

  const now = new Date();

  await db
    .update(positions)
    .set({
      status: 'CLOSED',
      closedAt: now,
    })
    .where(eq(positions.id, positionId));

  return {
    ...position,
    status: 'CLOSED',
    closedAt: now,
  };
}

/**
 * Mark position as liquidated
 */
export async function liquidatePosition(positionId: string): Promise<Position> {
  const now = new Date();

  await db
    .update(positions)
    .set({
      status: 'LIQUIDATED',
      liquidatedAt: now,
      collateralAmount: '0',
      loanPrincipal: '0',
      interestAccrued: '0',
    })
    .where(eq(positions.id, positionId));

  const position = await getPositionById(positionId);
  if (!position) {
    throw new Error('Position not found after liquidation');
  }

  return position;
}

/**
 * Calculate position metrics
 */
export function calculatePositionMetrics(
  position: Position,
  market: Market,
  collateralPriceUsd: number,
  debtPriceUsd: number
): PositionMetrics {
  // Accrue interest for accurate metrics
  const newInterest = calculateInterestAccrued(
    position.loanPrincipal,
    position.interestRateAtOpen,
    position.lastInterestUpdate,
    new Date()
  );

  const totalInterest = position.interestAccrued + newInterest;
  const totalDebt = calculateTotalDebt(position.loanPrincipal, totalInterest);
  const collateralValueUsd = position.collateralAmount * collateralPriceUsd;
  const debtValueUsd = totalDebt * debtPriceUsd;
  const currentLtv = calculateLtv(position.collateralAmount, collateralPriceUsd, totalDebt, debtPriceUsd);
  const healthFactor = calculateHealthFactor(currentLtv, market.liquidationLtvRatio);
  const liquidatable = isLiquidatable(currentLtv, market.liquidationLtvRatio);
  const maxBorrowableAmount = calculateMaxBorrowable(
    position.collateralAmount,
    collateralPriceUsd,
    totalDebt,
    debtPriceUsd,
    market.maxLtvRatio
  );
  const maxWithdrawableAmount = calculateMaxWithdrawable(
    position.collateralAmount,
    collateralPriceUsd,
    totalDebt,
    debtPriceUsd,
    market.maxLtvRatio
  );

  return {
    totalDebt,
    collateralValueUsd,
    debtValueUsd,
    currentLtv,
    healthFactor,
    liquidatable,
    maxBorrowableAmount,
    maxWithdrawableAmount,
  };
}

/**
 * Get all liquidatable positions for a market
 */
export async function getLiquidatablePositions(
  marketId: string,
  liquidationLtvRatio: number,
  collateralPriceUsd: number,
  debtPriceUsd: number,
  limit: number = 100
): Promise<Position[]> {
  const rows = await db.query.positions.findMany({
    where: and(eq(positions.marketId, marketId), eq(positions.status, 'ACTIVE')),
    limit,
  });

  const liquidatable: Position[] = [];

  for (const row of rows) {
    const position = dbToPosition(row);

    if (position.loanPrincipal <= 0) {
      continue;
    }

    // Accrue interest
    const newInterest = calculateInterestAccrued(
      position.loanPrincipal,
      position.interestRateAtOpen,
      position.lastInterestUpdate,
      new Date()
    );

    const totalDebt = calculateTotalDebt(position.loanPrincipal, position.interestAccrued + newInterest);
    const currentLtv = calculateLtv(position.collateralAmount, collateralPriceUsd, totalDebt, debtPriceUsd);

    if (isLiquidatable(currentLtv, liquidationLtvRatio)) {
      liquidatable.push(position);
    }
  }

  return liquidatable;
}
