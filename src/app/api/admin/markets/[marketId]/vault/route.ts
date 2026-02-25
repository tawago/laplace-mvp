import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db, markets } from '@/lib/db';
import { setMarketLoanBrokerConfig, setMarketSupplyVaultConfig } from '@/lib/lending/data/markets';
import { createLoanBroker } from '@/lib/xrpl/loan';
import { getClient } from '@/lib/xrpl/client';
import { createSupplyVault, getSupplyVaultInfo } from '@/lib/xrpl/vault';
import { getBackendWallet } from '@/lib/xrpl/wallet';

interface RouteContext {
  params: Promise<{ marketId: string }>;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function mapMarketConfig(market: typeof markets.$inferSelect) {
  return {
    marketId: market.id,
    supplyVaultId: market.supplyVaultId,
    supplyMptIssuanceId: market.supplyMptIssuanceId,
    loanBrokerId: market.loanBrokerId,
    loanBrokerAddress: market.loanBrokerAddress,
    vaultScale: market.vaultScale,
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { marketId } = await context.params;
    if (!marketId) {
      return NextResponse.json({ ok: false, error: 'marketId is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const createBroker = parseBoolean(body?.createLoanBroker, false);

    const market = await db.query.markets.findFirst({ where: eq(markets.id, marketId) });
    if (!market) {
      return NextResponse.json({ ok: false, error: 'Market not found' }, { status: 404 });
    }

    if (!market.debtCurrency || !market.debtIssuer) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Market debt token config is incomplete (debtCurrency/debtIssuer required)',
        },
        { status: 400 }
      );
    }

    const wallet = getBackendWallet();
    const createdVault = await createSupplyVault(wallet, {
      currency: market.debtCurrency,
      issuer: market.debtIssuer,
    });

    await setMarketSupplyVaultConfig(marketId, {
      vaultId: createdVault.vaultId,
      mptIssuanceId: createdVault.mptIssuanceId,
      vaultScale: market.vaultScale,
    });

    if (createBroker) {
      const broker = await createLoanBroker(wallet, {
        vaultId: createdVault.vaultId,
        feeBps: 0,
      });

      await setMarketLoanBrokerConfig(marketId, {
        loanBrokerId: broker.brokerId,
        loanBrokerAddress: broker.brokerAddress,
      });
    }

    const updated = await db.query.markets.findFirst({ where: eq(markets.id, marketId) });
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Market not found after update' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      market: mapMarketConfig(updated),
    });
  } catch (error) {
    console.error('Admin create vault error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { marketId } = await context.params;
    if (!marketId) {
      return NextResponse.json({ ok: false, error: 'marketId is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const supplyVaultId = typeof body?.supplyVaultId === 'string' ? body.supplyVaultId.trim() : '';
    const supplyMptIssuanceId =
      typeof body?.supplyMptIssuanceId === 'string' ? body.supplyMptIssuanceId.trim() : '';
    const vaultScaleRaw = body?.vaultScale;

    if (!supplyVaultId || !supplyMptIssuanceId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'supplyVaultId and supplyMptIssuanceId are required',
        },
        { status: 400 }
      );
    }

    let vaultScale: number | null = null;
    if (vaultScaleRaw !== undefined) {
      if (
        typeof vaultScaleRaw !== 'number' ||
        !Number.isInteger(vaultScaleRaw) ||
        vaultScaleRaw <= 0
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: 'vaultScale must be a positive integer when provided',
          },
          { status: 400 }
        );
      }
      vaultScale = vaultScaleRaw;
    }

    const market = await db.query.markets.findFirst({ where: eq(markets.id, marketId) });
    if (!market) {
      return NextResponse.json({ ok: false, error: 'Market not found' }, { status: 404 });
    }

    try {
      const client = await getClient();
      await getSupplyVaultInfo(client, supplyVaultId);
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? `Vault verification failed: ${error.message}`
              : 'Vault verification failed',
        },
        { status: 400 }
      );
    }

    await setMarketSupplyVaultConfig(marketId, {
      vaultId: supplyVaultId,
      mptIssuanceId: supplyMptIssuanceId,
      vaultScale: vaultScale ?? market.vaultScale,
    });

    const updated = await db.query.markets.findFirst({ where: eq(markets.id, marketId) });
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Market not found after update' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      market: mapMarketConfig(updated),
    });
  } catch (error) {
    console.error('Admin swap vault error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
