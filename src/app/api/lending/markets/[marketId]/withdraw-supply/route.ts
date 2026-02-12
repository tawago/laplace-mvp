import { NextRequest, NextResponse } from 'next/server';

import { processWithdrawSupply } from '@/lib/lending';

interface RouteContext {
  params: Promise<{ marketId: string }>;
}

const TX_HASH_REGEX = /^[A-F0-9]{64}$/i;

function parseAmount(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return Number(value);
  }

  return NaN;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { marketId } = await context.params;
    const body = await request.json();
    const { userAddress, amount, txHash, idempotencyKey } = body;

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

    const parsedAmount = parseAmount(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_AMOUNT', message: 'amount must be a positive number' },
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

    const { result, error } = await processWithdrawSupply(
      userAddress,
      marketId,
      parsedAmount,
      txHash,
      idempotencyKey
    );

    if (error) {
      let status = 400;
      if (error.code === 'MARKET_NOT_FOUND') status = 404;
      if (error.code === 'NO_SUPPLY_POSITION') status = 404;
      if (error.code === 'VAULT_NOT_CONFIGURED') status = 422;
      if (error.code === 'OPERATION_IN_PROGRESS') status = 409;
      if (error.code === 'IDEMPOTENCY_MISMATCH') status = 409;
      if (error.code === 'TX_FAILED') status = 422;
      if (error.code === 'NOT_VAULT_WITHDRAW') status = 422;
      if (error.code === 'WRONG_VAULT') status = 422;
      if (error.code === 'INSUFFICIENT_POOL_LIQUIDITY') status = 422;
      if (error.code === 'WITHDRAW_SUPPLY_FAILED') status = 500;

      return NextResponse.json({ success: false, error }, { status });
    }

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Withdraw supply result missing' },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        marketId: result.marketId,
        supplyPositionId: result.supplyPositionId,
        withdrawnAmount: result.withdrawnAmount.toFixed(8),
        remainingSupply: result.remainingSupply.toFixed(8),
        txHash: result.txHash,
      },
    });
  } catch (error) {
    console.error('Withdraw supply route error:', error);
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
