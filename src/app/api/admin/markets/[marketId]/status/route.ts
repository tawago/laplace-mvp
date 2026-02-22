import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db, markets } from '@/lib/db';
import { setMarketActiveStatus } from '@/lib/db/seed';

interface RouteContext {
  params: Promise<{ marketId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { marketId } = await context.params;
    if (!marketId) {
      return NextResponse.json({ ok: false, error: 'marketId is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (typeof body?.isActive !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'isActive must be a boolean' }, { status: 400 });
    }

    const market = await db.query.markets.findFirst({ where: eq(markets.id, marketId) });
    if (!market) {
      return NextResponse.json({ ok: false, error: 'Market not found' }, { status: 404 });
    }

    await setMarketActiveStatus(marketId, body.isActive);

    return NextResponse.json({
      ok: true,
      marketId,
      isActive: body.isActive,
    });
  } catch (error) {
    console.error('Admin market status PATCH error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
