import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { Wallet } from 'xrpl';
import { db, onchainTransactions, purchaseOrders } from '@/lib/db';
import { getClient } from '@/lib/xrpl/client';
import { getIssuerAddress, getIssuerWallet } from '@/lib/xrpl/wallet';
import { hasTrustLine, sendToken } from '@/lib/xrpl/tokens';
import { TOKEN_CODE_BY_SYMBOL } from '@/lib/xrpl/currency-codes';

const RWA_SYMBOL_BY_HOTEL_ID: Record<string, 'SAIL' | 'NYRA'> = {
  'the-sail': 'SAIL',
  nyra: 'NYRA',
};

type PurchaseStatus =
  | 'CREATED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CONFIRMED'
  | 'TOKEN_PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

type PaymentMethod = 'wallet' | 'card' | 'wire';

function parsePositiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function isLikelyXrplAddress(address: unknown): address is string {
  return typeof address === 'string' && address.startsWith('r') && address.length >= 25;
}

function parsePaymentMethod(value: unknown): PaymentMethod {
  if (value === 'card' || value === 'wire') return value;
  return 'wallet';
}

function toErrorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    { status }
  );
}

async function updateOrderStatus(
  orderId: string,
  status: PurchaseStatus,
  extra?: {
    paymentTxHash?: string | null;
    tokenTxHash?: string | null;
    errorCode?: string;
    errorMessage?: string;
    completedAt?: Date;
  }
): Promise<void> {
  await db
    .update(purchaseOrders)
    .set({
      status,
      paymentTxHash: extra?.paymentTxHash ?? null,
      tokenTxHash: extra?.tokenTxHash ?? null,
      errorCode: extra?.errorCode ?? null,
      errorMessage: extra?.errorMessage ?? null,
      completedAt: extra?.completedAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(purchaseOrders.id, orderId));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userAddress = body?.userAddress;
    const walletSeed = body?.walletSeed;
    const paymentMethod = parsePaymentMethod(body?.paymentMethod);
    const hotelId = typeof body?.hotelId === 'string' ? body.hotelId : '';
    const unitId = typeof body?.unitId === 'string' ? body.unitId : '';
    const tokenAmount = parsePositiveNumber(body?.tokenAmount);
    const pricePerTokenUsd = parsePositiveNumber(body?.pricePerToken);
    const totalPaymentAmount = parsePositiveNumber(body?.totalPrice);
    const idempotencyKey =
      typeof body?.idempotencyKey === 'string' && body.idempotencyKey.trim().length > 0
        ? body.idempotencyKey.trim()
        : randomUUID();

    if (!isLikelyXrplAddress(userAddress)) {
      return toErrorResponse('INVALID_USER_ADDRESS', 'Invalid or missing userAddress', 400);
    }
    if (!hotelId || !unitId) {
      return toErrorResponse('INVALID_PURCHASE_TARGET', 'hotelId and unitId are required', 400);
    }
    if (tokenAmount === null || pricePerTokenUsd === null || totalPaymentAmount === null) {
      return toErrorResponse(
        'INVALID_PURCHASE_AMOUNT',
        'tokenAmount, pricePerToken, and totalPrice must be positive numbers',
        400
      );
    }

    const impliedTotal = tokenAmount * pricePerTokenUsd;
    if (Math.abs(impliedTotal - totalPaymentAmount) > 0.0001) {
      return toErrorResponse(
        'PRICE_MISMATCH',
        `totalPrice must match tokenAmount * pricePerToken (${impliedTotal.toFixed(4)})`,
        400
      );
    }

    const rwaSymbol = RWA_SYMBOL_BY_HOTEL_ID[hotelId];
    if (!rwaSymbol) {
      return toErrorResponse('UNSUPPORTED_HOTEL', `Unsupported hotelId: ${hotelId}`, 400);
    }

    const issuerAddress = getIssuerAddress();
    const issuerWallet = getIssuerWallet();
    const paymentCurrency = paymentMethod === 'wallet' ? TOKEN_CODE_BY_SYMBOL.RLUSD : paymentMethod.toUpperCase();
    const paymentIssuer = paymentMethod === 'wallet' ? issuerAddress : 'OFFCHAIN';
    const rwaCurrency = TOKEN_CODE_BY_SYMBOL[rwaSymbol];

    let userWallet: Wallet | null = null;
    if (paymentMethod === 'wallet') {
      if (typeof walletSeed !== 'string' || walletSeed.length < 10) {
        return toErrorResponse('INVALID_WALLET_SEED', 'Invalid or missing walletSeed', 400);
      }
      userWallet = Wallet.fromSeed(walletSeed);
      if (userWallet.address !== userAddress) {
        return toErrorResponse('ADDRESS_SEED_MISMATCH', 'walletSeed does not match userAddress', 400);
      }
    }

    const [insertedOrder] = await db
      .insert(purchaseOrders)
      .values({
        idempotencyKey,
        status: paymentMethod === 'wallet' ? 'PAYMENT_PENDING' : 'PAYMENT_CONFIRMED',
        userAddress,
        hotelId,
        unitId,
        rwaSymbol,
        rwaCurrency,
        rwaIssuer: issuerAddress,
        paymentCurrency,
        paymentIssuer,
        tokenAmount: tokenAmount.toString(),
        pricePerTokenUsd: pricePerTokenUsd.toString(),
        totalPaymentAmount: totalPaymentAmount.toString(),
      })
      .onConflictDoNothing({ target: purchaseOrders.idempotencyKey })
      .returning();

    const order =
      insertedOrder ??
      (await db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.idempotencyKey, idempotencyKey),
      }));

    if (!order) {
      return toErrorResponse('ORDER_CREATION_FAILED', 'Failed to create or fetch purchase order', 500);
    }

    if (!insertedOrder) {
      if (order.status === 'COMPLETED') {
        return NextResponse.json({
          success: true,
          data: {
            orderId: order.id,
            idempotencyKey: order.idempotencyKey,
            status: order.status,
            paymentTxHash: order.paymentTxHash,
            tokenTxHash: order.tokenTxHash,
          },
        });
      }

      if (order.status === 'FAILED') {
        return toErrorResponse(
          order.errorCode ?? 'ORDER_FAILED',
          order.errorMessage ?? 'Order previously failed',
          409
        );
      }

      return toErrorResponse('ORDER_IN_PROGRESS', 'Order with this idempotency key is in progress', 409);
    }

    const client = await getClient();

    const hasRwaTrustline = await hasTrustLine(client, userAddress, issuerAddress, rwaCurrency);
    if (!hasRwaTrustline) {
      await updateOrderStatus(order.id, 'FAILED', {
        errorCode: 'MISSING_RWA_TRUSTLINE',
        errorMessage: `${rwaSymbol} trust line is required before purchase`,
      });
      return toErrorResponse(
        'MISSING_RWA_TRUSTLINE',
        `${rwaSymbol} trust line is required before purchase`,
        400
      );
    }

    let paymentTxHash: string | null = null;
    if (paymentMethod === 'wallet') {
      const hasPaymentTrustline = await hasTrustLine(client, userAddress, issuerAddress, TOKEN_CODE_BY_SYMBOL.RLUSD);
      if (!hasPaymentTrustline) {
        await updateOrderStatus(order.id, 'FAILED', {
          errorCode: 'MISSING_PAYMENT_TRUSTLINE',
          errorMessage: 'RLUSD trust line is required before purchase',
        });
        return toErrorResponse(
          'MISSING_PAYMENT_TRUSTLINE',
          'RLUSD trust line is required before purchase',
          400
        );
      }

      const paymentTx = await sendToken(
        client,
        userWallet as Wallet,
        issuerAddress,
        TOKEN_CODE_BY_SYMBOL.RLUSD,
        totalPaymentAmount.toString(),
        issuerAddress
      );

      if (paymentTx.result !== 'tesSUCCESS') {
        await updateOrderStatus(order.id, 'FAILED', {
          errorCode: 'PAYMENT_TX_FAILED',
          errorMessage: `Payment leg failed: ${paymentTx.result}`,
        });
        return toErrorResponse('PAYMENT_TX_FAILED', `Payment leg failed: ${paymentTx.result}`, 502);
      }

      paymentTxHash = paymentTx.hash;
      await db
        .insert(onchainTransactions)
        .values({
          txHash: paymentTx.hash,
          validated: true,
          txResult: paymentTx.result,
          txType: paymentTx.transactionType ?? 'Payment',
          sourceAddress: userAddress,
          destinationAddress: issuerAddress,
          currency: TOKEN_CODE_BY_SYMBOL.RLUSD,
          issuer: issuerAddress,
          amount: totalPaymentAmount.toString(),
          rawTxJson: paymentTx.rawTx ?? {},
          rawMetaJson: paymentTx.rawMeta ?? null,
        })
        .onConflictDoNothing({ target: onchainTransactions.txHash });
    }

    await updateOrderStatus(order.id, 'TOKEN_PENDING', { paymentTxHash });

    const tokenTx = await sendToken(
      client,
      issuerWallet,
      userAddress,
      rwaCurrency,
      tokenAmount.toString(),
      issuerAddress
    );

    if (tokenTx.result !== 'tesSUCCESS') {
      await updateOrderStatus(order.id, 'FAILED', {
        paymentTxHash,
        errorCode: 'TOKEN_TX_FAILED',
        errorMessage: `Token leg failed: ${tokenTx.result}`,
      });
      return toErrorResponse('TOKEN_TX_FAILED', `Token leg failed: ${tokenTx.result}`, 502);
    }

    await db
      .insert(onchainTransactions)
      .values({
        txHash: tokenTx.hash,
        validated: true,
        txResult: tokenTx.result,
        txType: tokenTx.transactionType ?? 'Payment',
        sourceAddress: issuerAddress,
        destinationAddress: userAddress,
        currency: rwaCurrency,
        issuer: issuerAddress,
        amount: tokenAmount.toString(),
        rawTxJson: tokenTx.rawTx ?? {},
        rawMetaJson: tokenTx.rawMeta ?? null,
      })
      .onConflictDoNothing({ target: onchainTransactions.txHash });

    await updateOrderStatus(order.id, 'COMPLETED', {
      paymentTxHash,
      tokenTxHash: tokenTx.hash,
      completedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        idempotencyKey,
        status: 'COMPLETED',
        paymentMethod,
        paymentTxHash,
        tokenTxHash: tokenTx.hash,
        rwaSymbol,
        rwaAmount: tokenAmount,
      },
    });
  } catch (error) {
    console.error('Purchase error:', error);
    return toErrorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Failed to process purchase',
      500
    );
  }
}
