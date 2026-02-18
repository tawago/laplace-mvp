import { NextRequest, NextResponse } from 'next/server';
import { decode } from 'xrpl';
import { getClient } from '@/lib/xrpl/client';

type MaybeRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MaybeRecord {
  return typeof value === 'object' && value !== null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const signedTxBlob = body?.signedTxBlob;

    if (typeof signedTxBlob !== 'string' || !signedTxBlob.trim()) {
      return NextResponse.json({ error: 'Missing required field: signedTxBlob' }, { status: 400 });
    }

    let decoded: MaybeRecord;
    try {
      const parsed = decode(signedTxBlob);
      if (!isRecord(parsed)) {
        return NextResponse.json({ error: 'Invalid signed credential transaction' }, { status: 400 });
      }
      decoded = parsed;
    } catch {
      return NextResponse.json({ error: 'Unable to decode signedTxBlob' }, { status: 400 });
    }

    if (decoded.TransactionType !== 'CredentialAccept') {
      return NextResponse.json({ error: 'signedTxBlob must contain a CredentialAccept transaction' }, { status: 400 });
    }

    const client = await getClient();
    const response = await client.submitAndWait(signedTxBlob as never);

    const meta = isRecord(response.result.meta) ? response.result.meta : null;
    const result = typeof meta?.TransactionResult === 'string' ? meta.TransactionResult : 'unknown';

    if (result !== 'tesSUCCESS') {
      return NextResponse.json({ error: `CredentialAccept failed on-ledger: ${result}` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        txHash: response.result.hash,
        result,
      },
    });
  } catch (error) {
    console.error('Credential accept relay error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
