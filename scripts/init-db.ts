/**
 * Database Initialization Script
 *
 * This script initializes the Neon Postgres database with market data.
 * Uses Drizzle ORM for idempotent market and price oracle upserts.
 *
 * Prerequisites:
 * - DATABASE_URL must be set in .env.local (Neon connection string)
 * - ISSUER_ADDRESS must be set (from setup-testnet.ts)
 *
 * Run with: npx tsx scripts/init-db.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local BEFORE importing db
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Validate required env vars before importing db module
if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL not found in environment.');
  console.log('');
  console.log('Please configure your Neon database connection string in .env.local:');
  console.log('DATABASE_URL=postgres://user:pass@host/database?sslmode=require');
  console.log('');
  console.log('Get your connection string from: https://console.neon.tech/');
  process.exit(1);
}

if (!process.env.ISSUER_ADDRESS) {
  console.error('Error: ISSUER_ADDRESS not found in environment.');
  console.log('Please run setup-testnet.ts first to create wallets.');
  process.exit(1);
}

async function main() {
  const { seedMarket, getMarketByName, getMarketPrices } = await import('../src/lib/db/seed');

  console.log('='.repeat(60));
  console.log('Database Initialization (Neon + Drizzle)');
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

    console.log('='.repeat(60));
    console.log('Database initialization complete!');
    console.log('='.repeat(60));
    console.log();
    console.log('You can now start the dev server:');
    console.log('  npm run dev');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

main();
