import { NextRequest, NextResponse } from 'next/server';
import { processRepay } from '@/lib/lending';

/**
 * POST /api/lending/repay
 *
 * Verify a repayment transaction and reduce debt
 *
 * Body:
 * - userAddress: User's XRPL address
 * - marketId: Target market ID
 * - amount: Repayment amount in debt token
 * - borrowerSeed: User wallet seed (devnet demo flow)
 * - repayKind?: One of regular|full|overpayment|late
 * - idempotencyKey?: Optional idempotency key
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, marketId, amount, borrowerSeed, repayKind, idempotencyKey } = body;

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

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_AMOUNT', message: 'amount must be a number greater than 0' },
        },
        { status: 400 }
      );
    }

    if (!borrowerSeed || typeof borrowerSeed !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_BORROWER_SEED', message: 'borrowerSeed is required' },
        },
        { status: 400 }
      );
    }

    const normalizedRepayKind =
      repayKind === 'full' || repayKind === 'overpayment' || repayKind === 'late' ? repayKind : 'regular';

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

    const { result, error } = await processRepay(
      userAddress,
      marketId,
      amount,
      borrowerSeed,
      normalizedRepayKind,
      idempotencyKey
    );

    if (error) {
      const status = error.code === 'INTERNAL_ERROR' ? 500 : 400;
      return NextResponse.json({ success: false, error }, { status });
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Repay error:', error);
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
