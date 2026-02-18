import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl/client';
import { deriveVerificationLevel, getAccountCredentials } from '@/lib/xrpl/credentials/operations';

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'Missing required parameter: address' }, { status: 400 });
    }

    if (!address.startsWith('r') || address.length < 25) {
      return NextResponse.json({ error: 'Invalid XRPL address format' }, { status: 400 });
    }

    const client = await getClient();
    const credentials = await getAccountCredentials(client, address);
    const verificationLevel = deriveVerificationLevel(credentials);

    return NextResponse.json({
      success: true,
      address,
      credentials,
      verificationLevel,
    });
  } catch (error) {
    console.error('Credentials query error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
