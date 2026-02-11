import { NextResponse } from 'next/server';

import { getSupplyPositionWithMetrics } from '@/lib/lending';

interface RouteContext {
  params: Promise<{ marketId: string; lenderAddress: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { marketId, lenderAddress } = await context.params;

    if (!marketId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_MARKET_ID', message: 'marketId is required' },
        },
        { status: 400 }
      );
    }

    if (!lenderAddress) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_LENDER_ADDRESS', message: 'lenderAddress is required' },
        },
        { status: 400 }
      );
    }

    if (!lenderAddress.startsWith('r') || lenderAddress.length < 25) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid XRPL address format' },
        },
        { status: 400 }
      );
    }

    const result = await getSupplyPositionWithMetrics(lenderAddress, marketId);
    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'SUPPLY_POSITION_NOT_FOUND', message: 'Supply position not found' },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        position: {
          id: result.position.id,
          status: result.position.status,
          supplyAmount: result.position.supplyAmount,
          yieldIndex: result.position.yieldIndex,
          suppliedAt: result.position.suppliedAt.toISOString(),
          lastYieldUpdate: result.position.lastYieldUpdate.toISOString(),
          closedAt: result.position.closedAt ? result.position.closedAt.toISOString() : null,
        },
        metrics: result.metrics,
        pool: result.pool,
        market: {
          id: result.market.id,
          name: result.market.name,
          debtCurrency: result.market.debtCurrency,
          debtIssuer: result.market.debtIssuer,
          minSupplyAmount: result.market.minSupplyAmount,
          reserveFactor: result.market.reserveFactor,
          baseInterestRate: result.market.baseInterestRate,
        },
      },
    });
  } catch (error) {
    console.error('Supply position route error:', error);
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
