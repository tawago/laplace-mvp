import Decimal from 'decimal.js';
import { and, eq, sql } from 'drizzle-orm';

import { db, markets, positions } from '../db';
import { getClient } from '../xrpl/client';
import { getMptIssuanceInfo, getSupplyVaultInfo } from '../xrpl/vault';
import {
  calculateGlobalYieldIndex,
  calculateSupplyApr,
  calculateSupplyApy,
  calculateUtilizationRate,
} from './calculations';
import { PoolMetrics } from './types';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_DOWN });

const TOKEN_SCALE = 8;
const ONCHAIN_RETRY_ATTEMPTS = 3;
const ONCHAIN_RETRY_DELAY_MS = 400;

type DbClient = typeof db;

interface MarketPoolState {
  id: string;
  totalSupplied: number;
  totalBorrowed: number;
  totalCollateralLocked: number;
  totalShares: number | null;
  vaultAvailableAssets: number | null;
  loanBrokerAddress: string | null;
  loanBrokerId: string | null;
  baseInterestRate: number;
  reserveFactor: number;
  globalYieldIndex: number;
  lastIndexUpdate: Date;
  supplyVaultId: string | null;
  supplyMptIssuanceId: string | null;
  vaultScale: number;
}

function toAmount(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(TOKEN_SCALE, Decimal.ROUND_DOWN).toNumber();
}

function parsePoolState(row: typeof markets.$inferSelect): MarketPoolState {
  return {
    id: row.id,
    totalSupplied: parseFloat(row.totalSupplied),
    totalBorrowed: parseFloat(row.totalBorrowed),
    totalCollateralLocked: 0,
    totalShares: null,
    vaultAvailableAssets: null,
    loanBrokerAddress: row.loanBrokerAddress,
    loanBrokerId: row.loanBrokerId,
    baseInterestRate: parseFloat(row.baseInterestRate),
    reserveFactor: parseFloat(row.reserveFactor),
    globalYieldIndex: parseFloat(row.globalYieldIndex),
    lastIndexUpdate: row.lastIndexUpdate,
    supplyVaultId: row.supplyVaultId,
    supplyMptIssuanceId: row.supplyMptIssuanceId,
    vaultScale: row.vaultScale,
  };
}

function parsePositiveAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function extractLoanAmountField(loanObject: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (!(key in loanObject)) continue;
    const raw = loanObject[key];
    const direct = parsePositiveAmount(raw);
    if (direct !== null) {
      return direct;
    }
    if (raw && typeof raw === 'object') {
      const nestedValue = parsePositiveAmount((raw as Record<string, unknown>).value);
      if (nestedValue !== null) {
        return nestedValue;
      }
    }
  }

  return null;
}

function extractLoanOutstanding(loanObject: Record<string, unknown>): number {
  const principal = extractLoanAmountField(loanObject, ['PrincipalOutstanding', 'Principal']);
  const accruedInterest = extractLoanAmountField(loanObject, ['AccruedInterest', 'Interest']);

  if (principal !== null) {
    return principal + Math.max(0, accruedInterest ?? 0);
  }

  const outstanding =
    extractLoanAmountField(loanObject, ['OutstandingDebt', 'Debt', 'TotalValueOutstanding']) ?? 0;

  return outstanding;
}

async function withOnChainRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= ONCHAIN_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < ONCHAIN_RETRY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, ONCHAIN_RETRY_DELAY_MS));
      }
    }
  }

  throw new Error(
    `${label} failed after ${ONCHAIN_RETRY_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function hydrateLoanPoolState(state: MarketPoolState): Promise<MarketPoolState> {
  if (!state.loanBrokerId) {
    return state;
  }

  return withOnChainRetry(async () => {
    const client = await getClient();
    let brokerAccountAddress = state.loanBrokerAddress;

    // Resolve pseudo-account from LoanBroker ledger entry.
    // Some historical rows stored the owner account instead of the broker pseudo-account.
    try {
      const brokerEntry = (await client.request({
        command: 'ledger_entry',
        loan_broker: state.loanBrokerId,
      } as never)) as { result?: { node?: unknown } };

      const node = (brokerEntry.result as { node?: unknown } | undefined)?.node;
      if (node && typeof node === 'object' && node !== null) {
        const accountField = (node as Record<string, unknown>).Account;
        if (typeof accountField === 'string' && accountField.length > 0) {
          brokerAccountAddress = accountField;
        }
      }
    } catch {
      // Fallback to configured address when loan broker lookup fails.
    }

    if (!brokerAccountAddress) {
      return state;
    }

    const accountObjects = await client.request({
      command: 'account_objects',
      account: brokerAccountAddress,
      ledger_index: 'validated',
    });

    const objects = Array.isArray(accountObjects.result.account_objects)
      ? (accountObjects.result.account_objects as unknown as Array<Record<string, unknown>>)
      : [];

    let totalBorrowed = 0;
    for (const object of objects) {
      if (object.LedgerEntryType !== 'Loan') continue;
      if (object.LoanBrokerID !== state.loanBrokerId) continue;
      totalBorrowed += extractLoanOutstanding(object);
    }

    return {
      ...state,
      totalBorrowed: toAmount(totalBorrowed),
    };
  }, `Failed to load loan state for market ${state.id}`);
}

async function hydrateVaultPoolState(state: MarketPoolState): Promise<MarketPoolState> {
  if (!state.supplyVaultId) {
    return state;
  }
  const supplyVaultId = state.supplyVaultId;

  return withOnChainRetry(async () => {
    const client = await getClient();
    const vaultInfo = await getSupplyVaultInfo(client, supplyVaultId);

    return {
      ...state,
      totalSupplied: toAmount(vaultInfo.assetsTotal),
      vaultAvailableAssets: toAmount(vaultInfo.assetsAvailable),
    };
  }, `Failed to load vault state for market ${state.id}`);
}

async function hydrateSharePoolState(state: MarketPoolState): Promise<MarketPoolState> {
  const issuanceId = state.supplyMptIssuanceId;
  if (!issuanceId) {
    return state;
  }

  return withOnChainRetry(async () => {
    const client = await getClient();
    const issuance = await getMptIssuanceInfo(client, issuanceId);

    if (!issuance) {
      return state;
    }

    const scale = Math.max(0, issuance.assetScale ?? state.vaultScale ?? 6);
    const totalShares = toAmount(new Decimal(issuance.outstandingAmount).div(new Decimal(10).pow(scale)));

    return {
      ...state,
      totalShares,
    };
  }, `Failed to load share state for market ${state.id}`);
}

async function hydrateCollateralPoolState(
  state: MarketPoolState,
  database: DbClient = db
): Promise<MarketPoolState> {
  const [result] = await database
    .select({
      total: sql<string>`coalesce(sum(${positions.collateralAmount}), 0)`,
    })
    .from(positions)
    .where(and(eq(positions.marketId, state.id), eq(positions.status, 'ACTIVE')));

  return {
    ...state,
    totalCollateralLocked: toAmount(result?.total ?? '0'),
  };
}

async function getMarketPoolState(marketId: string, database: DbClient = db): Promise<MarketPoolState | null> {
  const market = await database.query.markets.findFirst({
    where: and(eq(markets.id, marketId), eq(markets.isActive, true)),
  });

  if (!market) {
    return null;
  }

  const baseState = parsePoolState(market);
  const [vaultState, loanState, shareState, collateralState] = await Promise.all([
    hydrateVaultPoolState(baseState),
    hydrateLoanPoolState(baseState),
    hydrateSharePoolState(baseState),
    hydrateCollateralPoolState(baseState, database),
  ]);

  return {
    ...baseState,
    totalSupplied:
      vaultState.vaultAvailableAssets === null
        ? vaultState.totalSupplied
        : toAmount(new Decimal(vaultState.vaultAvailableAssets).add(loanState.totalBorrowed)),
    vaultAvailableAssets: vaultState.vaultAvailableAssets,
    totalBorrowed: loanState.totalBorrowed,
    totalShares: shareState.totalShares,
    totalCollateralLocked: collateralState.totalCollateralLocked,
  };
}

function buildPoolMetrics(state: MarketPoolState): PoolMetrics {
  const dbModeAvailableLiquidity = toAmount(
    Decimal.max(0, new Decimal(state.totalSupplied).sub(new Decimal(state.totalBorrowed)))
  );
  const availableLiquidity = state.vaultAvailableAssets === null
    ? dbModeAvailableLiquidity
    : Math.min(dbModeAvailableLiquidity, state.vaultAvailableAssets);
  const utilizationRate = calculateUtilizationRate(state.totalBorrowed, state.totalSupplied);
  const supplyApr = calculateSupplyApr(state.baseInterestRate, utilizationRate, state.reserveFactor);
  const supplyApy = calculateSupplyApy(supplyApr);

  return {
    marketId: state.id,
    totalSupplied: state.totalSupplied,
    totalBorrowed: state.totalBorrowed,
    totalCollateralLocked: state.totalCollateralLocked,
    totalShares: state.totalShares ?? undefined,
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
