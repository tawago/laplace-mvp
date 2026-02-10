/**
 * Database Seed and Query Module
 *
 * Uses Drizzle ORM for all database operations.
 * Seeds the database with initial market data for the TST-RWD lending market.
 */

import { eq, and } from 'drizzle-orm';
import { db, users, markets, priceOracle } from './index';

/**
 * Seed the TST-RWD market if it doesn't exist
 */
export async function seedMarket(issuerAddress: string): Promise<string> {
  // Check if market already exists
  const existing = await db.query.markets.findFirst({
    where: eq(markets.name, 'TST-RWD'),
  });

  if (existing) {
    return existing.id;
  }

  // Neon HTTP driver does not support transactions, so seed in idempotent steps.
  const [insertedMarket] = await db
    .insert(markets)
    .values({
      name: 'TST-RWD',
      collateralCurrency: 'TST',
      collateralIssuer: issuerAddress,
      debtCurrency: 'RWD',
      debtIssuer: issuerAddress,
      maxLtvRatio: '0.75',
      liquidationLtvRatio: '0.85',
      baseInterestRate: '0.05',
      liquidationPenalty: '0.1',
      minCollateralAmount: '10',
      minBorrowAmount: '5',
      isActive: true,
    })
    .onConflictDoNothing({ target: markets.name })
    .returning();

  const market =
    insertedMarket ??
    (await db.query.markets.findFirst({
      where: eq(markets.name, 'TST-RWD'),
    }));

  if (!market) {
    throw new Error('Failed to create or load TST-RWD market');
  }

  await db
    .insert(priceOracle)
    .values([
      {
        marketId: market.id,
        assetSide: 'COLLATERAL',
        priceUsd: '1.0',
        source: 'MOCK',
      },
      {
        marketId: market.id,
        assetSide: 'DEBT',
        priceUsd: '1.0',
        source: 'MOCK',
      },
    ])
    .onConflictDoNothing({ target: [priceOracle.marketId, priceOracle.assetSide] });

  console.log(`Seeded market ${market.id} (TST-RWD) with initial prices`);
  return market.id;
}

/**
 * Get or create a user by XRPL address
 */
export async function getOrCreateUser(xrplAddress: string): Promise<string> {
  // Check if user exists
  const existing = await db.query.users.findFirst({
    where: eq(users.xrplAddress, xrplAddress),
  });

  if (existing) {
    return existing.id;
  }

  // Create new user
  const [newUser] = await db
    .insert(users)
    .values({ xrplAddress })
    .returning();

  return newUser.id;
}

/**
 * Get active market by name
 */
export async function getMarketByName(name: string) {
  const market = await db.query.markets.findFirst({
    where: and(eq(markets.name, name), eq(markets.isActive, true)),
  });

  if (!market) return null;

  return {
    id: market.id,
    name: market.name,
    collateral_currency: market.collateralCurrency,
    collateral_issuer: market.collateralIssuer,
    debt_currency: market.debtCurrency,
    debt_issuer: market.debtIssuer,
    max_ltv_ratio: parseFloat(market.maxLtvRatio),
    liquidation_ltv_ratio: parseFloat(market.liquidationLtvRatio),
    base_interest_rate: parseFloat(market.baseInterestRate),
    liquidation_penalty: parseFloat(market.liquidationPenalty),
    min_collateral_amount: parseFloat(market.minCollateralAmount),
    min_borrow_amount: parseFloat(market.minBorrowAmount),
  };
}

/**
 * Get market by ID
 */
export async function getMarketById(id: string) {
  const market = await db.query.markets.findFirst({
    where: and(eq(markets.id, id), eq(markets.isActive, true)),
  });

  if (!market) return null;

  return {
    id: market.id,
    name: market.name,
    collateral_currency: market.collateralCurrency,
    collateral_issuer: market.collateralIssuer,
    debt_currency: market.debtCurrency,
    debt_issuer: market.debtIssuer,
    max_ltv_ratio: parseFloat(market.maxLtvRatio),
    liquidation_ltv_ratio: parseFloat(market.liquidationLtvRatio),
    base_interest_rate: parseFloat(market.baseInterestRate),
    liquidation_penalty: parseFloat(market.liquidationPenalty),
    min_collateral_amount: parseFloat(market.minCollateralAmount),
    min_borrow_amount: parseFloat(market.minBorrowAmount),
  };
}

/**
 * Get all active markets
 */
export async function getAllActiveMarkets() {
  const results = await db.query.markets.findMany({
    where: eq(markets.isActive, true),
  });

  return results.map((market) => ({
    id: market.id,
    name: market.name,
    collateral_currency: market.collateralCurrency,
    collateral_issuer: market.collateralIssuer,
    debt_currency: market.debtCurrency,
    debt_issuer: market.debtIssuer,
    max_ltv_ratio: parseFloat(market.maxLtvRatio),
    liquidation_ltv_ratio: parseFloat(market.liquidationLtvRatio),
    base_interest_rate: parseFloat(market.baseInterestRate),
  }));
}

/**
 * Get prices for a market
 */
export async function getMarketPrices(marketId: string): Promise<{
  collateralPriceUsd: number;
  debtPriceUsd: number;
} | null> {
  const prices = await db.query.priceOracle.findMany({
    where: eq(priceOracle.marketId, marketId),
  });

  const collateral = prices.find((p) => p.assetSide === 'COLLATERAL');
  const debt = prices.find((p) => p.assetSide === 'DEBT');

  if (!collateral || !debt) {
    return null;
  }

  return {
    collateralPriceUsd: parseFloat(collateral.priceUsd),
    debtPriceUsd: parseFloat(debt.priceUsd),
  };
}

/**
 * Update price for a market asset
 */
export async function updatePrice(
  marketId: string,
  assetSide: 'COLLATERAL' | 'DEBT',
  priceUsd: number,
  source: string = 'MOCK'
): Promise<void> {
  await db
    .update(priceOracle)
    .set({
      priceUsd: priceUsd.toString(),
      source,
      updatedAt: new Date(),
    })
    .where(and(eq(priceOracle.marketId, marketId), eq(priceOracle.assetSide, assetSide)));
}
