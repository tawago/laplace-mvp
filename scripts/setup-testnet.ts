/**
 * One-time testnet setup script
 *
 * This script:
 * 1. Creates and funds wallets (issuer, backend) from the testnet faucet
 * 2. Enables rippling on the issuer account
 * 3. Creates trust lines from backend to issuer for all protocol tokens
 * 4. Issues initial protocol tokens to the backend wallet
 * 5. Automatically updates .env.local with the new credentials
 *
 * NOTE: This script does NOT initialize the database.
 * Run `npm run setup:db` separately to seed the database.
 *
 * Run with: npx tsx scripts/setup-testnet.ts
 * Use --force to overwrite existing configuration
 */

import { Client, Wallet, AccountSetAsfFlags } from 'xrpl';
import * as fs from 'fs';
import * as path from 'path';
import { TOKEN_CODE_BY_SYMBOL } from '../src/lib/xrpl/currency-codes';

const TESTNET_URL = 'wss://s.altnet.rippletest.net:51233';
const TOKEN_SAIL_CODE = TOKEN_CODE_BY_SYMBOL.SAIL;
const TOKEN_NYRA_CODE = TOKEN_CODE_BY_SYMBOL.NYRA;
const TOKEN_RLUSD_CODE = TOKEN_CODE_BY_SYMBOL.RLUSD;
const TRUST_LIMIT = '1000000';
const INITIAL_SAIL_AMOUNT = '100000';
const INITIAL_NYRA_AMOUNT = '100000';
const INITIAL_RLUSD_AMOUNT = '100000';

const ENV_FILE_PATH = path.join(process.cwd(), '.env.local');

function checkExistingConfig(): boolean {
  if (!fs.existsSync(ENV_FILE_PATH)) {
    return false;
  }

  const content = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
  const hasIssuerSeed = /^ISSUER_WALLET_SEED=.+$/m.test(content);
  const hasBackendSeed = /^BACKEND_WALLET_SEED=.+$/m.test(content);

  return hasIssuerSeed && hasBackendSeed;
}

function updateEnvFile(values: Record<string, string>): void {
  let content = '';

  if (fs.existsSync(ENV_FILE_PATH)) {
    content = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
  }

  for (const [key, value] of Object.entries(values)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `${key}=${value}\n`;
    }
  }

  fs.writeFileSync(ENV_FILE_PATH, content);
}

async function enableRippling(client: Client, wallet: Wallet): Promise<void> {
  console.log('Enabling rippling on issuer account...');

  const tx = await client.submitAndWait({
    TransactionType: 'AccountSet',
    Account: wallet.address,
    SetFlag: AccountSetAsfFlags.asfDefaultRipple,
  }, { wallet });

  const result = tx.result.meta;
  if (typeof result === 'object' && result !== null && 'TransactionResult' in result) {
    if (result.TransactionResult === 'tesSUCCESS') {
      console.log('Rippling enabled');
    } else {
      throw new Error(`Failed to enable rippling: ${result.TransactionResult}`);
    }
  }
}

async function createTrustLine(
  client: Client,
  wallet: Wallet,
  issuer: string,
  currency: string,
  limit: string
): Promise<void> {
  console.log(`Creating trust line for ${currency}...`);

  const tx = await client.submitAndWait({
    TransactionType: 'TrustSet',
    Account: wallet.address,
    LimitAmount: {
      currency,
      issuer,
      value: limit,
    },
  }, { wallet });

  const result = tx.result.meta;
  if (typeof result === 'object' && result !== null && 'TransactionResult' in result) {
    if (result.TransactionResult === 'tesSUCCESS') {
      console.log(`Trust line created for ${currency}`);
    } else {
      throw new Error(`Failed to create trust line: ${result.TransactionResult}`);
    }
  }
}

async function sendToken(
  client: Client,
  wallet: Wallet,
  destination: string,
  currency: string,
  amount: string,
  issuer: string
): Promise<string> {
  console.log(`Sending ${amount} ${currency} to ${destination.slice(0, 10)}...`);

  const tx = await client.submitAndWait({
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: destination,
    Amount: {
      currency,
      issuer,
      value: amount,
    },
  }, { wallet });

  const result = tx.result.meta;
  const hash = tx.result.hash;

  if (typeof result === 'object' && result !== null && 'TransactionResult' in result) {
    if (result.TransactionResult === 'tesSUCCESS') {
      console.log(`Sent ${amount} ${currency} (tx: ${hash})`);
      return hash;
    } else {
      throw new Error(`Failed to send token: ${result.TransactionResult}`);
    }
  }

  return hash;
}

async function main() {
  const forceFlag = process.argv.includes('--force');

  console.log('='.repeat(60));
  console.log('XRPL Lending Tokens - Testnet Setup');
  console.log('='.repeat(60));
  console.log();

  // Check for existing configuration
  if (checkExistingConfig() && !forceFlag) {
    console.log('Existing wallet configuration found in .env.local');
    console.log('');
    console.log('Running this script again will create NEW wallets and');
    console.log('overwrite your existing configuration.');
    console.log('');
    console.log('If you want to proceed, run with --force flag:');
    console.log('  npx tsx scripts/setup-testnet.ts --force');
    console.log('');
    process.exit(0);
  }

  const client = new Client(TESTNET_URL);

  try {
    console.log('Connecting to testnet...');
    await client.connect();
    console.log('Connected to', TESTNET_URL);
    console.log();

    // 1. Create and fund wallets
    console.log('Creating wallets...');
    console.log('(This may take a moment as we request funds from the faucet)');
    console.log();

    const issuerFund = await client.fundWallet();
    const issuerWallet = issuerFund.wallet;
    console.log(`Issuer wallet created: ${issuerWallet.address}`);

    const backendFund = await client.fundWallet();
    const backendWallet = backendFund.wallet;
    console.log(`Backend wallet created: ${backendWallet.address}`);
    console.log();

    // 2. Enable rippling on issuer
    await enableRippling(client, issuerWallet);
    console.log();

    // 3. Create trust lines on backend wallet
    console.log('Setting up trust lines on backend wallet...');
    await createTrustLine(client, backendWallet, issuerWallet.address, TOKEN_SAIL_CODE, TRUST_LIMIT);
    await createTrustLine(client, backendWallet, issuerWallet.address, TOKEN_NYRA_CODE, TRUST_LIMIT);
    await createTrustLine(client, backendWallet, issuerWallet.address, TOKEN_RLUSD_CODE, TRUST_LIMIT);
    console.log();

    // 4. Issue initial protocol tokens to backend
    console.log('Issuing initial tokens to backend...');
    await sendToken(
      client,
      issuerWallet,
      backendWallet.address,
      TOKEN_SAIL_CODE,
      INITIAL_SAIL_AMOUNT,
      issuerWallet.address
    );
    await sendToken(
      client,
      issuerWallet,
      backendWallet.address,
      TOKEN_NYRA_CODE,
      INITIAL_NYRA_AMOUNT,
      issuerWallet.address
    );
    await sendToken(
      client,
      issuerWallet,
      backendWallet.address,
      TOKEN_RLUSD_CODE,
      INITIAL_RLUSD_AMOUNT,
      issuerWallet.address
    );
    console.log();

    // 5. Update .env.local
    console.log('Updating .env.local...');
    updateEnvFile({
      ISSUER_WALLET_SEED: issuerWallet.seed!,
      BACKEND_WALLET_SEED: backendWallet.seed!,
      ISSUER_ADDRESS: issuerWallet.address,
      BACKEND_ADDRESS: backendWallet.address,
      TOKEN_SAIL_CODE,
      TOKEN_NYRA_CODE,
      TOKEN_RLUSD_CODE,
      NEXT_PUBLIC_TESTNET_URL: TESTNET_URL,
      NEXT_PUBLIC_TESTNET_EXPLORER: 'https://testnet.xrpl.org',
    });
    console.log('.env.local updated');
    console.log();

    // 6. Output summary
    console.log('='.repeat(60));
    console.log('TESTNET SETUP COMPLETE!');
    console.log('='.repeat(60));
    console.log();
    console.log('Wallet Addresses:');
    console.log(`  Issuer:  ${issuerWallet.address}`);
    console.log(`  Backend: ${backendWallet.address}`);
    console.log();
    console.log(`View on explorer: https://testnet.xrpl.org/accounts/${backendWallet.address}`);
    console.log();
    console.log('Next steps:');
    console.log('  1. Configure DATABASE_URL in .env.local (Neon connection string)');
    console.log('  2. Run: npm run setup:db');
    console.log('  3. Run: npm run dev');

  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  } finally {
    await client.disconnect();
    console.log();
    console.log('Disconnected from testnet.');
  }
}

main();
