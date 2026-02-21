import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, purchaseOrders } from '@/lib/db';
import { getAllActiveMarkets, getMarketPrices } from '@/lib/db/seed';
import { hotels } from '@/data/hotels';

function isLikelyXrplAddress(address: string): boolean {
  return address.startsWith('r') && address.length >= 25;
}

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get('address')?.trim() ?? '';

    if (!address || !isLikelyXrplAddress(address)) {
      return NextResponse.json(
        { success: false, error: 'Valid XRPL address is required' },
        { status: 400 }
      );
    }

    const orders = await db.query.purchaseOrders.findMany({
      where: and(eq(purchaseOrders.userAddress, address), eq(purchaseOrders.status, 'COMPLETED')),
      orderBy: [desc(purchaseOrders.createdAt)],
    });

    const marketPriceEntries = await Promise.all(
      (await getAllActiveMarkets()).map(async (market) => ({
        name: market.name,
        prices: await getMarketPrices(market.id),
      }))
    );

    const currentPriceByHotelId: Record<string, number> = {};
    for (const market of marketPriceEntries) {
      if (!market.prices) continue;
      if (market.name.toUpperCase().includes('SAIL')) {
        currentPriceByHotelId['the-sail'] = market.prices.collateralPriceUsd;
      }
      if (market.name.toUpperCase().includes('NYRA')) {
        currentPriceByHotelId.nyra = market.prices.collateralPriceUsd;
      }
    }

    const holdings = orders.map((order) => {
      const hotel = hotels.find((entry) => entry.id === order.hotelId);
      const unit = hotel?.units.find((entry) => entry.id === order.unitId);

      const tokenAmount = Number(order.tokenAmount);
      const pricePerToken = Number(order.pricePerTokenUsd);
      const totalPrice = Number(order.totalPaymentAmount);
      const currentTokenPrice =
        currentPriceByHotelId[order.hotelId] ?? hotel?.tokenPrice ?? pricePerToken;

      return {
        id: order.id,
        hotelId: order.hotelId,
        hotelName: hotel?.name ?? order.hotelId,
        unitId: order.unitId,
        unitType: unit?.name ?? order.unitId,
        tokenAmount,
        pricePerToken,
        totalPrice,
        currentValue: tokenAmount * currentTokenPrice,
        purchaseDate: order.completedAt ?? order.createdAt,
        estimatedROI: hotel?.roiPercentage ?? 0,
        status: 'confirmed' as const,
      };
    });

    return NextResponse.json({
      success: true,
      data: holdings,
    });
  } catch (error) {
    console.error('Portfolio fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
