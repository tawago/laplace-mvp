import { NextRequest, NextResponse } from 'next/server';
import { processBorrow } from '@/lib/lending';

/**
 * POST /api/lending/borrow
 *
 * Borrow debt tokens against collateral
 *
 * Body:
 * - userAddress: User's XRPL address
 * - marketId: Target market ID
 * - amount: Amount to borrow
 * - idempotencyKey?: Optional idempotency key
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, marketId, amount, idempotencyKey } = body;

    // Validate required fields
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

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_AMOUNT', message: 'amount must be a positive number' },
        },
        { status: 400 }
      );
    }

    // Validate address format
    if (!userAddress.startsWith('r') || userAddress.length < 25) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid XRPL address format' },
        },
        { status: 400 }
      );
    }

    const { result, error } = await processBorrow(userAddress, marketId, amount, idempotencyKey);

    if (error) {
      const status = error.code === 'INTERNAL_ERROR' ? 500 : 400;
      return NextResponse.json({ success: false, error }, { status });
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Borrow error:', error);
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
