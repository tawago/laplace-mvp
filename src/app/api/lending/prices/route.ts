import { NextRequest, NextResponse } from 'next/server';
import { getMarketPrices, updatePrice, getMarketById } from '@/lib/db/seed';

/**
 * GET /api/lending/prices?marketId=...
 *
 * Returns current market prices
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get('marketId');

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

    const prices = await getMarketPrices(marketId);
    if (!prices) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'PRICES_NOT_FOUND', message: 'Prices not available' },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        marketId,
        collateralCurrency: market.collateral_currency,
        debtCurrency: market.debt_currency,
        collateralPriceUsd: prices.collateralPriceUsd,
        debtPriceUsd: prices.debtPriceUsd,
      },
    });
  } catch (error) {
    console.error('Prices error:', error);
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

/**
 * POST /api/lending/prices
 *
 * Update market prices (for mock price updates)
 * In production, this would be restricted to admin/oracle
 */
export async function POST(request: NextRequest) {
  try {
    const { marketId, collateralPriceUsd, debtPriceUsd } = await request.json();

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

    if (typeof collateralPriceUsd === 'number' && collateralPriceUsd >= 0) {
      await updatePrice(marketId, 'COLLATERAL', collateralPriceUsd, 'MANUAL');
    }

    if (typeof debtPriceUsd === 'number' && debtPriceUsd >= 0) {
      await updatePrice(marketId, 'DEBT', debtPriceUsd, 'MANUAL');
    }

    const prices = await getMarketPrices(marketId);

    return NextResponse.json({
      success: true,
      data: {
        marketId,
        collateralPriceUsd: prices?.collateralPriceUsd,
        debtPriceUsd: prices?.debtPriceUsd,
      },
    });
  } catch (error) {
    console.error('Update prices error:', error);
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
