import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/xrpl/client';
import { CREDENTIAL_TYPES, type CredentialTypeName } from '@/lib/xrpl/credentials/types';
import { createCredential } from '@/lib/xrpl/credentials/operations';
import { getCredentialIssuerWallet } from '@/lib/xrpl/wallet';

function isValidCredentialTypeName(value: unknown): value is CredentialTypeName {
  return typeof value === 'string' && value in CREDENTIAL_TYPES;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subjectAddress, credentialType, expiration } = body;

    if (typeof subjectAddress !== 'string' || !subjectAddress) {
      return NextResponse.json({ error: 'Missing required field: subjectAddress' }, { status: 400 });
    }

    if (!subjectAddress.startsWith('r') || subjectAddress.length < 25) {
      return NextResponse.json({ error: 'Invalid XRPL address format' }, { status: 400 });
    }

    if (!isValidCredentialTypeName(credentialType)) {
      return NextResponse.json(
        { error: `Unsupported credentialType. Use one of: ${Object.keys(CREDENTIAL_TYPES).join(', ')}` },
        { status: 400 }
      );
    }

    if (expiration !== undefined && (typeof expiration !== 'number' || !Number.isFinite(expiration))) {
      return NextResponse.json({ error: 'expiration must be a unix timestamp in seconds' }, { status: 400 });
    }

    const client = await getClient();
    const issuerWallet = getCredentialIssuerWallet();
    const credentialTypeHex = CREDENTIAL_TYPES[credentialType];

    const submission = await createCredential(
      client,
      issuerWallet,
      subjectAddress,
      credentialTypeHex,
      typeof expiration === 'number' ? expiration : undefined
    );

    if (submission.result !== 'tesSUCCESS') {
      return NextResponse.json(
        { error: `CredentialCreate failed on-ledger: ${submission.result}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        txHash: submission.hash,
        result: submission.result,
        issuer: issuerWallet.address,
        subject: subjectAddress,
        credentialType,
        credentialTypeHex,
        pendingAcceptance: true,
      },
    });
  } catch (error) {
    console.error('Credential create error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
