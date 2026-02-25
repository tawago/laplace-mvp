import { and, eq } from 'drizzle-orm';

import { db, priceOracle } from '@/lib/db';

export async function getMarketPrices(marketId: string): Promise<{
  collateralPriceUsd: number;
  debtPriceUsd: number;
} | null> {
  const prices = await db.query.priceOracle.findMany({
    where: eq(priceOracle.marketId, marketId),
  });

  const collateral = prices.find((price) => price.assetSide === 'COLLATERAL');
  const debt = prices.find((price) => price.assetSide === 'DEBT');

  if (!collateral || !debt) {
    return null;
  }

  return {
    collateralPriceUsd: parseFloat(collateral.priceUsd),
    debtPriceUsd: parseFloat(debt.priceUsd),
  };
}

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
