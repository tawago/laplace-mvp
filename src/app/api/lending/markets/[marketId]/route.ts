import { NextResponse } from 'next/server';

import { getMarketById } from '@/lib/db/seed';
import { getPoolMetrics, updateGlobalYieldIndex } from '@/lib/lending';

interface RouteContext {
  params: Promise<{ marketId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { marketId } = await context.params;

    if (!marketId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_MARKET_ID', message: 'marketId is required' },
        },
        { status: 400 }
      );
    }

    const market = await getMarketById(marketId);
    if (!market) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MARKET_NOT_FOUND', message: 'Market not found' },
        },
        { status: 404 }
      );
    }

    await updateGlobalYieldIndex(marketId);
    const pool = await getPoolMetrics(marketId);

    if (!pool) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MARKET_NOT_FOUND', message: 'Market not found' },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        market: {
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
          vaultScale: market.vault_scale,
          reserveFactor: market.reserve_factor,
        },
        pool,
      },
    });
  } catch (error) {
    console.error('Market route error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}
