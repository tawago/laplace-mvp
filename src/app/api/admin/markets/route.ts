import { NextResponse } from 'next/server';

import { getAllMarkets } from '@/lib/db/seed';
import { getClient } from '@/lib/xrpl/client';
import { getSupplyVaultInfo } from '@/lib/xrpl/vault';

export async function GET() {
  try {
    const allMarkets = await getAllMarkets();

    let clientError: string | null = null;
    let client = null;
    try {
      client = await getClient();
    } catch (error) {
      clientError = error instanceof Error ? error.message : 'Failed to connect to XRPL client';
    }

    const markets = await Promise.all(
      allMarkets.map(async (market) => {
        if (!market.supplyVaultId) {
          return {
            ...market,
            vaultInfo: null,
            vaultError: null,
          };
        }

        if (!client) {
          return {
            ...market,
            vaultInfo: null,
            vaultError: clientError ?? 'XRPL client unavailable',
          };
        }

        try {
          const vaultInfo = await getSupplyVaultInfo(client, market.supplyVaultId);
          return {
            ...market,
            vaultInfo: {
              assetsTotal: vaultInfo.assetsTotal,
              assetsAvailable: vaultInfo.assetsAvailable,
            },
            vaultError: null,
          };
        } catch (error) {
          return {
            ...market,
            vaultInfo: null,
            vaultError: error instanceof Error ? error.message : 'Failed to fetch vault info',
          };
        }
      })
    );

    return NextResponse.json({ ok: true, markets });
  } catch (error) {
    console.error('Admin markets GET error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
