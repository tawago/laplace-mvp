import { eq, notInArray, sql } from 'drizzle-orm';

import { TOKEN_CODE_BY_SYMBOL } from '@/lib/xrpl/currency-codes';

import { db, markets, priceOracle } from '../index';

export async function seedMarket(issuerAddress: string): Promise<string> {
  const defaults = [
    {
      name: 'SAIL-RLUSD',
      collateralCurrency: TOKEN_CODE_BY_SYMBOL.SAIL,
      debtCurrency: TOKEN_CODE_BY_SYMBOL.RLUSD,
      collateralPriceUsd: '100.0',
    },
    {
      name: 'NYRA-RLUSD',
      collateralCurrency: TOKEN_CODE_BY_SYMBOL.NYRA,
      debtCurrency: TOKEN_CODE_BY_SYMBOL.RLUSD,
      collateralPriceUsd: '100.0',
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
        maxLtvRatio: '0.50',
        liquidationLtvRatio: '0.85',
        baseInterestRate: '0.04',
        liquidationPenalty: '0.1',
        minCollateralAmount: '10',
        minBorrowAmount: '5',
        minSupplyAmount: '5',
        supplyVaultId: null,
        supplyMptIssuanceId: null,
        loanBrokerId: null,
        loanBrokerAddress: null,
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
          maxLtvRatio: '0.50',
          liquidationLtvRatio: '0.85',
          baseInterestRate: '0.04',
          liquidationPenalty: '0.1',
          minCollateralAmount: '10',
          minBorrowAmount: '5',
          minSupplyAmount: '5',
          supplyVaultId: null,
          supplyMptIssuanceId: null,
          loanBrokerId: null,
          loanBrokerAddress: null,
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
          priceUsd: config.collateralPriceUsd,
          source: 'MOCK',
        },
        {
          marketId: market.id,
          assetSide: 'DEBT',
          priceUsd: '1.0',
          source: 'MOCK',
        },
      ])
      .onConflictDoUpdate({
        target: [priceOracle.marketId, priceOracle.assetSide],
        set: {
          priceUsd: sql`excluded.price_usd`,
          source: 'MOCK',
          updatedAt: new Date(),
        },
      });

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
