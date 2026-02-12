import { NextResponse } from 'next/server';
import { getAllActiveMarkets, getMarketPrices } from '@/lib/db/seed';
import { getIssuerAddress, getBackendAddress } from '@/lib/xrpl/wallet';
import { getXrplExplorerUrl, getXrplNetwork, getXrplWsUrl } from '@/lib/config/runtime';
import { getClient } from '@/lib/xrpl/client';
import { parseAccountRootFlags } from 'xrpl';

function isTrustLineLockingEnabled(flags: number): boolean {
  return Boolean(parseAccountRootFlags(flags).lsfAllowTrustLineLocking);
}

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
    const client = await getClient();

    const issuerEscrowSupportCache = new Map<string, boolean>();

    const getIssuerEscrowSupport = async (issuer: string): Promise<boolean> => {
      const cached = issuerEscrowSupportCache.get(issuer);
      if (typeof cached === 'boolean') {
        return cached;
      }

      try {
        const response = await client.request({
          command: 'account_info',
          account: issuer,
          ledger_index: 'validated',
        });

        const flags =
          typeof response.result?.account_data?.Flags === 'number'
            ? response.result.account_data.Flags
            : 0;
        const enabled = isTrustLineLockingEnabled(flags);
        issuerEscrowSupportCache.set(issuer, enabled);
        return enabled;
      } catch {
        issuerEscrowSupportCache.set(issuer, false);
        return false;
      }
    };

    const marketsWithPrices = await Promise.all(
      markets.map(async (market) => {
        const prices = await getMarketPrices(market.id);
        const collateralEscrowEnabled = await getIssuerEscrowSupport(market.collateral_issuer);
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
          collateralEscrowEnabled,
          minSupplyAmount: market.min_supply_amount,
          supplyVaultId: market.supply_vault_id,
          supplyMptIssuanceId: market.supply_mpt_issuance_id,
          loanBrokerId: market.loan_broker_id,
          loanBrokerAddress: market.loan_broker_address,
          vaultScale: market.vault_scale,
          reserveFactor: market.reserve_factor,
          totalSupplied: market.total_supplied,
          totalBorrowed: market.total_borrowed,
          globalYieldIndex: market.global_yield_index,
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
        network: getXrplNetwork(),
        testnetUrl: getXrplWsUrl(),
        explorerUrl: getXrplExplorerUrl(),
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
