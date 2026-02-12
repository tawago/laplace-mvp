import { NextRequest, NextResponse } from 'next/server';
import { confirmBorrowWithSignedTx, prepareBorrow, processBorrowWithBorrowerSeed } from '@/lib/lending';
import { invalidateLendingReadCaches } from '@/lib/xrpl/cache';

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
    const { userAddress, marketId, amount, idempotencyKey, signedTxJson, borrowerSeed } = body;

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

    if (signedTxJson !== undefined && (typeof signedTxJson !== 'object' || signedTxJson === null)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_SIGNED_TX', message: 'signedTxJson must be an object when provided' },
        },
        { status: 400 }
      );
    }

    if (borrowerSeed !== undefined && typeof borrowerSeed !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_BORROWER_SEED', message: 'borrowerSeed must be a string when provided' },
        },
        { status: 400 }
      );
    }

    const response = borrowerSeed
      ? await processBorrowWithBorrowerSeed(userAddress, marketId, amount, borrowerSeed, idempotencyKey)
      : signedTxJson
      ? await confirmBorrowWithSignedTx(
          userAddress,
          marketId,
          amount,
          signedTxJson as Record<string, unknown>,
          idempotencyKey
        )
      : await prepareBorrow(userAddress, marketId, amount);

    const { result, error } = response;

    if (error) {
      let status = 400;
      if (error.code === 'INTERNAL_ERROR') status = 500;
      if (error.code === 'OPERATION_IN_PROGRESS') status = 409;
      return NextResponse.json({ success: false, error }, { status });
    }

    if (borrowerSeed || signedTxJson) {
      invalidateLendingReadCaches({ marketId, userAddress });
    }

    return NextResponse.json({ success: true, data: result });
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
