/**
 * Database Initialization Script
 *
 * This script initializes the Neon Postgres database with market data.
 * Uses Drizzle ORM for idempotent market and price oracle upserts.
 *
 * Prerequisites:
 * - DATABASE_URL must be set in .env.local
 * - ISSUER_ADDRESS must be set (from setup-devnet.ts)
 *
 * Run with: npx tsx scripts/init-db.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

const selectedNetwork = 'devnet';

// Load environment variables from .env.local BEFORE importing db
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

if (!process.env.NEXT_PUBLIC_XRPL_NETWORK) {
  process.env.NEXT_PUBLIC_XRPL_NETWORK = 'devnet';
}

// Validate required env vars before importing db module
if (!process.env.DATABASE_URL) {
  console.error(`Error: DATABASE_URL not found for ${selectedNetwork}.`);
  console.log('');
  console.log('Please configure DATABASE_URL in your env file:');
  console.log('DATABASE_URL=postgres://user:pass@host/database?sslmode=require');
  console.log('');
  console.log('Get your connection string from: https://console.neon.tech/');
  process.exit(1);
}

if (!process.env.ISSUER_ADDRESS) {
  console.error('Error: ISSUER_ADDRESS not found in environment.');
  console.log('Please run setup-devnet.ts first to create wallets.');
  process.exit(1);
}

if (!process.env.BACKEND_WALLET_SEED) {
  console.error('Error: BACKEND_WALLET_SEED not found in environment.');
  console.log('Please run setup-devnet.ts first to create wallets.');
  process.exit(1);
}

async function main() {
  const {
    seedMarket,
    getMarketByName,
    getMarketPrices,
    getAllActiveMarkets,
    setMarketSupplyVaultConfig,
    setMarketLoanBrokerConfig,
  } = await import('../src/lib/db/seed');
  const { getBackendWallet, getLoanBrokerWallet } = await import('../src/lib/xrpl/wallet');
  const { getClient, disconnectClient } = await import('../src/lib/xrpl/client');
  const { checkVaultSupport, createSupplyVault } = await import('../src/lib/xrpl/vault');
  const { checkLoanProtocolSupport, createLoanBroker } = await import('../src/lib/xrpl/loan');

  console.log('='.repeat(60));
  console.log(`Database Initialization (Neon + Drizzle / ${selectedNetwork})`);
  console.log('='.repeat(60));
  console.log();

  const issuerAddress = process.env.ISSUER_ADDRESS!;

  try {
    console.log('Seeding market data...');
    const marketId = await seedMarket(issuerAddress);
    console.log(`Market ID: ${marketId}`);
    console.log();

    // Verify seeded markets
    for (const name of ['SAIL-RLUSD', 'NYRA-RLUSD']) {
      const market = await getMarketByName(name);
      if (!market) {
        throw new Error(`Market ${name} was not created successfully`);
      }

      console.log('Market Configuration:');
      console.log(`  Name: ${market.name}`);
      console.log(`  Collateral: ${market.collateral_currency}`);
      console.log(`  Debt: ${market.debt_currency}`);
      console.log(`  Max LTV: ${market.max_ltv_ratio * 100}%`);
      console.log(`  Liquidation LTV: ${market.liquidation_ltv_ratio * 100}%`);
      console.log(`  Interest Rate: ${market.base_interest_rate * 100}% annual`);
      console.log(`  Liquidation Penalty: ${market.liquidation_penalty * 100}%`);

      const prices = await getMarketPrices(market.id);
      if (prices) {
        console.log('Price Oracle:');
        console.log(`  COLLATERAL: $${prices.collateralPriceUsd}`);
        console.log(`  DEBT: $${prices.debtPriceUsd}`);
      }

      console.log();
    }

    console.log('Provisioning supply vaults...');
    const client = await getClient();
    const support = await checkVaultSupport(client);
    if (!support.enabled) {
      throw new Error(support.reason || 'Vault support is not enabled on connected XRPL network');
    }

    const backendWallet = getBackendWallet();
    const activeMarkets = await getAllActiveMarkets();
    for (const market of activeMarkets) {
      if (market.supply_vault_id && market.supply_mpt_issuance_id) {
        console.log(`- ${market.name}: existing vault ${market.supply_vault_id}`);
        continue;
      }

      const createdVault = await createSupplyVault(backendWallet, {
        currency: market.debt_currency,
        issuer: market.debt_issuer,
        scale: market.vault_scale ?? 6,
      });

      await setMarketSupplyVaultConfig(market.id, {
        vaultId: createdVault.vaultId,
        mptIssuanceId: createdVault.mptIssuanceId,
        vaultScale: market.vault_scale ?? 6,
      });

      console.log(`- ${market.name}: created vault ${createdVault.vaultId}`);
    }
    console.log();

    console.log('Provisioning loan brokers...');
    const loanSupport = await checkLoanProtocolSupport(client);
    if (!loanSupport.enabled) {
      throw new Error(loanSupport.reason || 'Loan protocol support is not enabled on connected XRPL network');
    }

    const loanBrokerWallet = getLoanBrokerWallet();
    const marketsWithVaults = await getAllActiveMarkets();
    for (const market of marketsWithVaults) {
      if (market.loan_broker_id && market.loan_broker_address) {
        console.log(`- ${market.name}: existing loan broker ${market.loan_broker_id}`);
        continue;
      }

      if (!market.supply_vault_id) {
        throw new Error(`Market ${market.name} is missing supply vault configuration`);
      }

      const createdBroker = await createLoanBroker(loanBrokerWallet, {
        vaultId: market.supply_vault_id,
        feeBps: 0,
      });

      await setMarketLoanBrokerConfig(market.id, {
        loanBrokerId: createdBroker.brokerId,
        loanBrokerAddress: createdBroker.brokerAddress,
      });

      console.log(`- ${market.name}: created loan broker ${createdBroker.brokerId}`);
    }
    console.log();

    console.log('='.repeat(60));
    console.log('Database initialization complete!');
    console.log('='.repeat(60));
    console.log();
    console.log('You can now start the dev server:');
    console.log('  npm run dev');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  } finally {
    await disconnectClient();
  }

  process.exit(0);
}

main();
