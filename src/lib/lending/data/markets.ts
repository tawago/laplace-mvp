import { and, eq } from 'drizzle-orm';

import { db, markets } from '@/lib/db';

type MarketRow = typeof markets.$inferSelect;

function mapMarketRecord(market: MarketRow) {
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
    loan_broker_id: market.loanBrokerId,
    loan_broker_address: market.loanBrokerAddress,
    vault_scale: market.vaultScale,
    total_supplied: parseFloat(market.totalSupplied),
    total_borrowed: parseFloat(market.totalBorrowed),
    global_yield_index: parseFloat(market.globalYieldIndex),
    last_index_update: market.lastIndexUpdate,
    reserve_factor: parseFloat(market.reserveFactor),
  };
}

export async function getMarketByName(name: string) {
  const market = await db.query.markets.findFirst({
    where: and(eq(markets.name, name), eq(markets.isActive, true)),
  });

  if (!market) {
    return null;
  }

  return mapMarketRecord(market);
}

export async function getMarketById(id: string) {
  const market = await db.query.markets.findFirst({
    where: and(eq(markets.id, id), eq(markets.isActive, true)),
  });

  if (!market) {
    return null;
  }

  return mapMarketRecord(market);
}

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
    loan_broker_id: market.loanBrokerId,
    loan_broker_address: market.loanBrokerAddress,
    vault_scale: market.vaultScale,
    total_supplied: parseFloat(market.totalSupplied),
    total_borrowed: parseFloat(market.totalBorrowed),
    global_yield_index: parseFloat(market.globalYieldIndex),
    reserve_factor: parseFloat(market.reserveFactor),
  }));
}

export async function getAllMarkets() {
  const results = await db.query.markets.findMany();

  return results.map((market) => ({
    id: market.id,
    name: market.name,
    isActive: market.isActive,
    collateralCurrency: market.collateralCurrency,
    collateralIssuer: market.collateralIssuer,
    debtCurrency: market.debtCurrency,
    debtIssuer: market.debtIssuer,
    supplyVaultId: market.supplyVaultId,
    supplyMptIssuanceId: market.supplyMptIssuanceId,
    loanBrokerId: market.loanBrokerId,
    loanBrokerAddress: market.loanBrokerAddress,
    vaultScale: market.vaultScale,
    totalSupplied: parseFloat(market.totalSupplied),
    totalBorrowed: parseFloat(market.totalBorrowed),
  }));
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

export async function setMarketLoanBrokerConfig(
  marketId: string,
  config: { loanBrokerId: string; loanBrokerAddress: string }
): Promise<void> {
  await db
    .update(markets)
    .set({
      loanBrokerId: config.loanBrokerId,
      loanBrokerAddress: config.loanBrokerAddress,
      updatedAt: new Date(),
    })
    .where(eq(markets.id, marketId));
}

export async function setMarketActiveStatus(marketId: string, isActive: boolean): Promise<void> {
  await db
    .update(markets)
    .set({
      isActive,
      updatedAt: new Date(),
    })
    .where(eq(markets.id, marketId));
}
