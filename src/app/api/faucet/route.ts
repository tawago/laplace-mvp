import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl/client';
import { getIssuerWallet, getIssuerAddress } from '@/lib/xrpl/wallet';
import { sendToken, hasTrustLine } from '@/lib/xrpl/tokens';
import { TOKEN_CODE_BY_SYMBOL } from '@/lib/xrpl/currency-codes';

const TOKENS = {
  SAIL: {
    code: TOKEN_CODE_BY_SYMBOL.SAIL,
    amount: '100',
  },
  NYRA: {
    code: TOKEN_CODE_BY_SYMBOL.NYRA,
    amount: '100',
  },
  RLUSD: {
    code: TOKEN_CODE_BY_SYMBOL.RLUSD,
    amount: '1000',
  },
} as const;

type FaucetToken = keyof typeof TOKENS;

export async function POST(request: NextRequest) {
  try {
    const { userAddress, token } = await request.json();

    // 1. Validate inputs
    if (!userAddress) {
      return NextResponse.json(
        { error: 'Missing required field: userAddress' },
        { status: 400 }
      );
    }

    const normalizedToken = typeof token === 'string' ? token.toUpperCase() : 'SAIL';
    if (!(normalizedToken in TOKENS)) {
      return NextResponse.json(
        { error: 'Unsupported token. Use SAIL, NYRA, or RLUSD.' },
        { status: 400 }
      );
    }

    const faucetToken = TOKENS[normalizedToken as FaucetToken];

    // Validate address format (basic check)
    if (!userAddress.startsWith('r') || userAddress.length < 25) {
      return NextResponse.json(
        { error: 'Invalid XRP address format' },
        { status: 400 }
      );
    }

    // 2. Connect to XRPL
    const client = await getClient();
    const issuerWallet = getIssuerWallet();
    const issuerAddress = getIssuerAddress();

    // 3. Check if user has trust line for token
    const hasTrust = await hasTrustLine(client, userAddress, issuerAddress, faucetToken.code);
    if (!hasTrust) {
      return NextResponse.json(
        { error: `User must first create a trust line for ${normalizedToken}` },
        { status: 400 }
      );
    }

    // 4. Send tokens to user
    const tx = await sendToken(
      client,
      issuerWallet,
      userAddress,
      faucetToken.code,
      faucetToken.amount,
      issuerAddress
    );

    if (tx.result !== 'tesSUCCESS') {
      return NextResponse.json(
        { error: `Failed to send ${faucetToken.code}: ${tx.result}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      amount: faucetToken.amount,
      token: normalizedToken,
    });

  } catch (error) {
    console.error('Faucet error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
