import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { db, markets, supplyPositions, users } from '@/lib/db';
import { getEventsForUser } from '@/lib/lending';

interface RouteContext {
  params: Promise<{ lenderAddress: string }>;
}

const SUPPLIER_EVENT_PREFIXES = [
  'LENDING_SUPPLY_',
  'LENDING_COLLECT_YIELD_',
  'LENDING_WITHDRAW_SUPPLY_',
];

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { lenderAddress } = await context.params;
    const { searchParams } = new URL(request.url);
    const marketIdFilter = searchParams.get('marketId');

    if (!lenderAddress) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_LENDER_ADDRESS', message: 'lenderAddress is required' },
        },
        { status: 400 }
      );
    }

    if (!lenderAddress.startsWith('r') || lenderAddress.length < 25) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid XRPL address format' },
        },
        { status: 400 }
      );
    }

    const user = await db.query.users.findFirst({
      where: eq(users.xrplAddress, lenderAddress),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({
        success: true,
        data: {
          lenderAddress,
          positions: [],
          events: [],
        },
      });
    }

    const whereClause = marketIdFilter
      ? and(eq(supplyPositions.userId, user.id), eq(supplyPositions.marketId, marketIdFilter))
      : eq(supplyPositions.userId, user.id);

    const positionRows = await db.query.supplyPositions.findMany({
      where: whereClause,
      orderBy: [desc(supplyPositions.updatedAt)],
    });

    const marketIds = Array.from(new Set(positionRows.map((row) => row.marketId)));
    const marketRows =
      marketIds.length > 0
        ? await db.query.markets.findMany({
            where: inArray(markets.id, marketIds),
          })
        : [];

    const marketById = new Map(marketRows.map((row) => [row.id, row]));

    const events = (await getEventsForUser(lenderAddress, 100))
      .filter((event) =>
        SUPPLIER_EVENT_PREFIXES.some((prefix) => event.event_type.startsWith(prefix))
      )
      .filter((event) => (marketIdFilter ? event.market_id === marketIdFilter : true))
      .map((event) => ({
        id: event.id,
        eventType: event.event_type,
        status: event.status,
        amount: event.amount,
        currency: event.currency,
        marketId: event.market_id,
        createdAt: event.created_at,
        errorCode: event.error_code,
        errorMessage: event.error_message,
      }));

    return NextResponse.json({
      success: true,
      data: {
        lenderAddress,
        positions: positionRows.map((row) => {
          const market = marketById.get(row.marketId);
          return {
            id: row.id,
            status: row.status,
            marketId: row.marketId,
            marketName: market?.name ?? null,
            debtCurrency: market?.debtCurrency ?? null,
            supplyAmount: parseFloat(row.supplyAmount),
            yieldIndex: parseFloat(row.yieldIndex),
            suppliedAt: row.suppliedAt.toISOString(),
            lastYieldUpdate: row.lastYieldUpdate.toISOString(),
            closedAt: row.closedAt ? row.closedAt.toISOString() : null,
          };
        }),
        events,
      },
    });
  } catch (error) {
    console.error('Lender supply positions route error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}
