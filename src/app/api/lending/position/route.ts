import { NextRequest, NextResponse } from 'next/server';
import { getPositionWithMetrics, getEventsForPosition } from '@/lib/lending';

/**
 * GET /api/lending/position?userAddress=...&marketId=...
 *
 * Returns user's position with metrics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');
    const marketId = searchParams.get('marketId');

    if (!userAddress) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_USER_ADDRESS', message: 'userAddress is required' },
        },
        { status: 400 }
      );
    }

    if (!marketId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_MARKET_ID', message: 'marketId is required' },
        },
        { status: 400 }
      );
    }

    const result = await getPositionWithMetrics(userAddress, marketId);

    if (!result) {
      return NextResponse.json({
        success: true,
        data: {
          position: null,
          metrics: null,
          market: null,
          events: [],
        },
      });
    }

    const { position, metrics, market } = result;

    // Get recent events for this position
    const rawEvents = await getEventsForPosition(position.id, 20);
    const events = rawEvents.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      status: e.status,
      amount: e.amount,
      currency: e.currency,
      createdAt: e.created_at,
      errorMessage: e.error_message,
    }));

    return NextResponse.json({
      success: true,
      data: {
        position: {
          id: position.id,
          status: position.status,
          collateralAmount: position.collateralAmount,
          loanPrincipal: position.loanPrincipal,
          interestAccrued: position.interestAccrued,
          interestRateAtOpen: position.interestRateAtOpen,
          openedAt: position.openedAt.toISOString(),
        },
        metrics: {
          totalDebt: metrics.totalDebt,
          collateralValueUsd: metrics.collateralValueUsd,
          debtValueUsd: metrics.debtValueUsd,
          currentLtv: metrics.currentLtv,
          healthFactor: metrics.healthFactor,
          liquidatable: metrics.liquidatable,
          maxBorrowableAmount: metrics.maxBorrowableAmount,
          maxWithdrawableAmount: metrics.maxWithdrawableAmount,
          availableLiquidity: metrics.availableLiquidity ?? 0,
        },
        market: {
          id: market.id,
          name: market.name,
          collateralCurrency: market.collateralCurrency,
          debtCurrency: market.debtCurrency,
          maxLtvRatio: market.maxLtvRatio,
          liquidationLtvRatio: market.liquidationLtvRatio,
          baseInterestRate: market.baseInterestRate,
        },
        events,
      },
    });
  } catch (error) {
    console.error('Position error:', error);
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
