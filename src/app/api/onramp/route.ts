import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl/client';
import { getIssuerAddress, getIssuerWallet } from '@/lib/xrpl/wallet';
import { hasTrustLine, sendToken } from '@/lib/xrpl/tokens';
import { TOKEN_CODE_BY_SYMBOL } from '@/lib/xrpl/currency-codes';

function parseAmount(rawAmount: unknown): number | null {
  const amount = typeof rawAmount === 'string' ? Number(rawAmount) : Number.NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return amount;
}

function isLikelyXrplAddress(address: unknown): address is string {
  return typeof address === 'string' && address.startsWith('r') && address.length >= 25;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userAddress = body?.userAddress;
    const amount = parseAmount(body?.amount);

    if (!isLikelyXrplAddress(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing userAddress' },
        { status: 400 }
      );
    }

    if (amount === null) {
      return NextResponse.json(
        { success: false, error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    const client = await getClient();
    const issuerWallet = getIssuerWallet();
    const issuerAddress = getIssuerAddress();
    const currency = TOKEN_CODE_BY_SYMBOL.RLUSD;

    const trustLineExists = await hasTrustLine(client, userAddress, issuerAddress, currency);
    if (!trustLineExists) {
      return NextResponse.json(
        { success: false, error: 'Missing RLUSD trust line. Create trust line before topping up.' },
        { status: 400 }
      );
    }

    const tx = await sendToken(
      client,
      issuerWallet,
      userAddress,
      currency,
      amount.toString(),
      issuerAddress
    );

    if (tx.result !== 'tesSUCCESS') {
      return NextResponse.json(
        { success: false, error: `Onramp transfer failed: ${tx.result}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      amount,
    });
  } catch (error) {
    console.error('Onramp error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
