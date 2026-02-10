import { NextRequest, NextResponse } from 'next/server';
import { processDeposit } from '@/lib/lending';

/**
 * POST /api/lending/deposit
 *
 * Verify a deposit transaction and add collateral to position
 *
 * Body:
 * - txHash: XRPL transaction hash
 * - senderAddress: User's XRPL address
 * - marketId: Target market ID
 * - idempotencyKey?: Optional idempotency key
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { txHash, senderAddress, marketId, idempotencyKey } = body;

    // Validate required fields
    if (!txHash) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_TX_HASH', message: 'txHash is required' },
        },
        { status: 400 }
      );
    }

    if (!senderAddress) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_SENDER_ADDRESS', message: 'senderAddress is required' },
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

    // Validate address format
    if (!senderAddress.startsWith('r') || senderAddress.length < 25) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid XRPL address format' },
        },
        { status: 400 }
      );
    }

    const { result, error } = await processDeposit(
      txHash,
      senderAddress,
      marketId,
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
    console.error('Deposit error:', error);
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
