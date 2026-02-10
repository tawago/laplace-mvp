import { NextResponse } from 'next/server';
import { getAllActiveMarkets, getMarketPrices } from '@/lib/db/seed';
import { getIssuerAddress, getBackendAddress } from '@/lib/xrpl/wallet';

/**
 * GET /api/lending/config
 *
 * Returns active market configurations
 */
export async function GET() {
  try {
    const markets = await getAllActiveMarkets();
    const issuerAddress = getIssuerAddress();
    const backendAddress = getBackendAddress();

    const marketsWithPrices = await Promise.all(
      markets.map(async (market) => {
        const prices = await getMarketPrices(market.id);
        return {
          id: market.id,
          name: market.name,
          collateralCurrency: market.collateral_currency,
          collateralIssuer: market.collateral_issuer,
          debtCurrency: market.debt_currency,
          debtIssuer: market.debt_issuer,
          maxLtvRatio: market.max_ltv_ratio,
          liquidationLtvRatio: market.liquidation_ltv_ratio,
          baseInterestRate: market.base_interest_rate,
          prices: prices
            ? {
                collateralPriceUsd: prices.collateralPriceUsd,
                debtPriceUsd: prices.debtPriceUsd,
              }
            : null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        markets: marketsWithPrices,
        issuerAddress,
        backendAddress,
        testnetUrl:
          process.env.NEXT_PUBLIC_TESTNET_URL || 'wss://s.altnet.rippletest.net:51233',
        explorerUrl: process.env.NEXT_PUBLIC_TESTNET_EXPLORER || 'https://testnet.xrpl.org',
      },
    });
  } catch (error) {
    console.error('Lending config error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: error instanceof Error ? error.message : 'Failed to load configuration',
        },
      },
      { status: 500 }
    );
  }
}
