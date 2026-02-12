import { NextRequest, NextResponse } from 'next/server';

import { processSupply } from '@/lib/lending';

interface RouteContext {
  params: Promise<{ marketId: string }>;
}

const TX_HASH_REGEX = /^[A-F0-9]{64}$/i;

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { marketId } = await context.params;
    const body = await request.json();
    const { senderAddress, txHash, idempotencyKey } = body;

    if (!marketId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_MARKET_ID', message: 'marketId is required' },
        },
        { status: 400 }
      );
    }

    if (!txHash || typeof txHash !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_TX_HASH', message: 'txHash is required' },
        },
        { status: 400 }
      );
    }

    if (!TX_HASH_REGEX.test(txHash)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_TX_HASH', message: 'txHash must be a 64-character hex string' },
        },
        { status: 400 }
      );
    }

    if (!senderAddress || typeof senderAddress !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_SENDER_ADDRESS', message: 'senderAddress is required' },
        },
        { status: 400 }
      );
    }

    if (!senderAddress.startsWith('r') || senderAddress.length < 25) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid XRPL address format' },
        },
        { status: 400 }
      );
    }

    const { result, error } = await processSupply(txHash, senderAddress, marketId, idempotencyKey);

    if (error) {
      let status = 400;
      if (error.code === 'MARKET_NOT_FOUND') status = 404;
      if (error.code === 'VAULT_NOT_CONFIGURED') status = 422;
      if (error.code === 'OPERATION_IN_PROGRESS') status = 409;
      if (error.code === 'IDEMPOTENCY_MISMATCH') status = 409;
      if (error.code === 'TX_ALREADY_PROCESSED') status = 409;
      if (error.code === 'TX_FAILED') status = 422;
      if (error.code === 'NOT_VAULT_DEPOSIT') status = 422;
      if (error.code === 'WRONG_VAULT') status = 422;
      if (error.code === 'SUPPLY_FAILED') status = 500;

      return NextResponse.json({ success: false, error }, { status });
    }

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Supply result missing' },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        marketId: result.marketId,
        supplyPositionId: result.supplyPositionId,
        suppliedAmount: result.suppliedAmount.toFixed(8),
      },
    });
  } catch (error) {
    console.error('Supply route error:', error);
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
