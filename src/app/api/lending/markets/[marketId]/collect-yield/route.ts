import { NextRequest, NextResponse } from 'next/server';

import { processCollectYield } from '@/lib/lending';

interface RouteContext {
  params: Promise<{ marketId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { marketId } = await context.params;
    const body = await request.json();
    const { userAddress, idempotencyKey } = body;

    if (!marketId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_MARKET_ID', message: 'marketId is required' },
        },
        { status: 400 }
      );
    }

    if (!userAddress || typeof userAddress !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_USER_ADDRESS', message: 'userAddress is required' },
        },
        { status: 400 }
      );
    }

    if (!userAddress.startsWith('r') || userAddress.length < 25) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid XRPL address format' },
        },
        { status: 400 }
      );
    }

    const { result, error } = await processCollectYield(userAddress, marketId, idempotencyKey);

    if (error) {
      let status = 400;
      if (error.code === 'MARKET_NOT_FOUND') status = 404;
      if (error.code === 'NO_SUPPLY_POSITION') status = 404;
      if (error.code === 'UNSUPPORTED_OPERATION') status = 410;
      if (error.code === 'OPERATION_IN_PROGRESS') status = 409;
      if (error.code === 'IDEMPOTENCY_MISMATCH') status = 409;
      if (error.code === 'COLLECT_YIELD_FAILED') status = 500;

      return NextResponse.json({ success: false, error }, { status });
    }

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Collect yield result missing' },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        marketId: result.marketId,
        supplyPositionId: result.supplyPositionId,
        collectedAmount: result.collectedAmount.toFixed(8),
        txHash: result.txHash,
      },
    });
  } catch (error) {
    console.error('Collect yield route error:', error);
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
