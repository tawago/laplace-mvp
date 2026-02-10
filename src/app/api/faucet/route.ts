import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl/client';
import { getIssuerWallet, getIssuerAddress } from '@/lib/xrpl/wallet';
import { sendToken, hasTrustLine } from '@/lib/xrpl/tokens';

const TOKEN_A_CODE = process.env.TOKEN_A_CODE || 'TST';
const FAUCET_AMOUNT = '100'; // Give 100 TST tokens

export async function POST(request: NextRequest) {
  try {
    const { userAddress } = await request.json();

    // 1. Validate inputs
    if (!userAddress) {
      return NextResponse.json(
        { error: 'Missing required field: userAddress' },
        { status: 400 }
      );
    }

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

    // 3. Check if user has trust line for TST
    const hasTrust = await hasTrustLine(client, userAddress, issuerAddress, TOKEN_A_CODE);
    if (!hasTrust) {
      return NextResponse.json(
        { error: `User must first create a trust line for ${TOKEN_A_CODE}` },
        { status: 400 }
      );
    }

    // 4. Send TST tokens to user
    const tx = await sendToken(
      client,
      issuerWallet,
      userAddress,
      TOKEN_A_CODE,
      FAUCET_AMOUNT,
      issuerAddress
    );

    if (tx.result !== 'tesSUCCESS') {
      return NextResponse.json(
        { error: `Failed to send ${TOKEN_A_CODE}: ${tx.result}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      amount: FAUCET_AMOUNT,
      token: TOKEN_A_CODE,
    });

  } catch (error) {
    console.error('Faucet error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
