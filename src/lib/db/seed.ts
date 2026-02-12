/**
 * Database Seed and Query Module
 *
 * Uses Drizzle ORM for all database operations.
 * Seeds the database with initial market data for the collateral and loan markets.
 */

import { eq, and, notInArray } from 'drizzle-orm';
import { db, users, markets, priceOracle } from './index';
import { TOKEN_CODE_BY_SYMBOL } from '@/lib/xrpl/currency-codes';

/**
 * Seed default protocol markets if they don't exist
 */
export async function seedMarket(issuerAddress: string): Promise<string> {
  const defaults = [
    {
      name: 'SAIL-RLUSD',
      collateralCurrency: TOKEN_CODE_BY_SYMBOL.SAIL,
      debtCurrency: TOKEN_CODE_BY_SYMBOL.RLUSD,
    },
    {
      name: 'NYRA-RLUSD',
      collateralCurrency: TOKEN_CODE_BY_SYMBOL.NYRA,
      debtCurrency: TOKEN_CODE_BY_SYMBOL.RLUSD,
    },
  ];

  const marketIds: string[] = [];

  for (const config of defaults) {
    const [insertedMarket] = await db
      .insert(markets)
      .values({
        name: config.name,
        collateralCurrency: config.collateralCurrency,
        collateralIssuer: issuerAddress,
        debtCurrency: config.debtCurrency,
        debtIssuer: issuerAddress,
        maxLtvRatio: '0.75',
        liquidationLtvRatio: '0.85',
        baseInterestRate: '0.05',
        liquidationPenalty: '0.1',
        minCollateralAmount: '10',
        minBorrowAmount: '5',
        minSupplyAmount: '5',
        supplyVaultId: null,
        supplyMptIssuanceId: null,
        vaultScale: 6,
        totalSupplied: '0',
        totalBorrowed: '0',
        globalYieldIndex: '1.0',
        reserveFactor: '0.1',
        isActive: true,
      })
      .onConflictDoUpdate({
        target: markets.name,
        set: {
          collateralCurrency: config.collateralCurrency,
          collateralIssuer: issuerAddress,
          debtCurrency: config.debtCurrency,
          debtIssuer: issuerAddress,
          maxLtvRatio: '0.75',
          liquidationLtvRatio: '0.85',
          baseInterestRate: '0.05',
          liquidationPenalty: '0.1',
          minCollateralAmount: '10',
          minBorrowAmount: '5',
          minSupplyAmount: '5',
          supplyVaultId: null,
          supplyMptIssuanceId: null,
          vaultScale: 6,
          totalSupplied: '0',
          totalBorrowed: '0',
          globalYieldIndex: '1.0',
          reserveFactor: '0.1',
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    const market =
      insertedMarket ??
      (await db.query.markets.findFirst({
        where: eq(markets.name, config.name),
      }));

    if (!market) {
      throw new Error(`Failed to create or load ${config.name} market`);
    }

    marketIds.push(market.id);

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

    console.log(`Seeded market ${market.id} (${config.name}) with initial prices`);
  }

  await db
    .update(markets)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(notInArray(markets.name, defaults.map((item) => item.name)));

  return marketIds[0];
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
    min_supply_amount: parseFloat(market.minSupplyAmount),
    supply_vault_id: market.supplyVaultId,
    supply_mpt_issuance_id: market.supplyMptIssuanceId,
    vault_scale: market.vaultScale,
    total_supplied: parseFloat(market.totalSupplied),
    total_borrowed: parseFloat(market.totalBorrowed),
    global_yield_index: parseFloat(market.globalYieldIndex),
    last_index_update: market.lastIndexUpdate,
    reserve_factor: parseFloat(market.reserveFactor),
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
    min_supply_amount: parseFloat(market.minSupplyAmount),
    supply_vault_id: market.supplyVaultId,
    supply_mpt_issuance_id: market.supplyMptIssuanceId,
    vault_scale: market.vaultScale,
    total_supplied: parseFloat(market.totalSupplied),
    total_borrowed: parseFloat(market.totalBorrowed),
    global_yield_index: parseFloat(market.globalYieldIndex),
    last_index_update: market.lastIndexUpdate,
    reserve_factor: parseFloat(market.reserveFactor),
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
    min_supply_amount: parseFloat(market.minSupplyAmount),
    supply_vault_id: market.supplyVaultId,
    supply_mpt_issuance_id: market.supplyMptIssuanceId,
    vault_scale: market.vaultScale,
    total_supplied: parseFloat(market.totalSupplied),
    total_borrowed: parseFloat(market.totalBorrowed),
    global_yield_index: parseFloat(market.globalYieldIndex),
    reserve_factor: parseFloat(market.reserveFactor),
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

export async function setMarketSupplyVaultConfig(
  marketId: string,
  config: { vaultId: string; mptIssuanceId: string; vaultScale: number }
): Promise<void> {
  await db
    .update(markets)
    .set({
      supplyVaultId: config.vaultId,
      supplyMptIssuanceId: config.mptIssuanceId,
      vaultScale: config.vaultScale,
      updatedAt: new Date(),
    })
    .where(eq(markets.id, marketId));
}
