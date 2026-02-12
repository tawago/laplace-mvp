import { NextRequest, NextResponse } from 'next/server';
import { processLiquidation } from '@/lib/lending';
import { invalidateLendingReadCaches } from '@/lib/xrpl/cache';

/**
 * POST /api/lending/liquidate
 *
 * Liquidate unhealthy positions
 *
 * Body:
 * - marketId: Target market ID
 * - userAddress?: Specific user to liquidate (optional, liquidates all if not provided)
 * - limit?: Max positions to liquidate (default: 10)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { marketId, userAddress, limit = 10 } = body;

    // Validate required fields
    if (!marketId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_MARKET_ID', message: 'marketId is required' },
        },
        { status: 400 }
      );
    }

    // Validate address format if provided
    if (userAddress && (!userAddress.startsWith('r') || userAddress.length < 25)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid XRPL address format' },
        },
        { status: 400 }
      );
    }

    const { results, errors } = await processLiquidation(marketId, userAddress, limit);

    if (results.length > 0) {
      invalidateLendingReadCaches({ marketId, userAddress });
    }

    return NextResponse.json({
      success: true,
      data: {
        liquidated: results.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error('Liquidate error:', error);
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
