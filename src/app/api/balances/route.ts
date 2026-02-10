import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl/client';
import { getAccountBalances } from '@/lib/xrpl/tokens';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Missing required parameter: address' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!address.startsWith('r') || address.length < 25) {
      return NextResponse.json(
        { error: 'Invalid XRP address format' },
        { status: 400 }
      );
    }

    const client = await getClient();
    const balances = await getAccountBalances(client, address);

    return NextResponse.json({
      success: true,
      address,
      balances,
    });

  } catch (error) {
    console.error('Balances error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
