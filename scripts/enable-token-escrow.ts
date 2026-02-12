import 'dotenv/config';

import { Client, Wallet } from 'xrpl';

const ASF_ALLOW_TRUSTLINE_LOCKING = 17;

const DEVNET_WS_URL = 'wss://s.devnet.rippletest.net:51233';

async function main() {
  const wsUrl = process.env.NEXT_PUBLIC_XRPL_WS_URL || DEVNET_WS_URL;

  const issuerSeed = process.env.ISSUER_WALLET_SEED;
  if (!issuerSeed) {
    throw new Error('ISSUER_WALLET_SEED is not set in environment');
  }

  const issuerWallet = Wallet.fromSeed(issuerSeed);
  const client = new Client(wsUrl);

  try {
    console.log(`Connecting to devnet (${wsUrl})...`);
    await client.connect();

    const tx = await client.submitAndWait(
      {
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        SetFlag: ASF_ALLOW_TRUSTLINE_LOCKING,
      } as never,
      { wallet: issuerWallet }
    );

    const meta = tx.result.meta;
    const result =
      typeof meta === 'object' && meta !== null && 'TransactionResult' in meta
        ? ((meta as { TransactionResult?: string }).TransactionResult ?? 'unknown')
        : 'unknown';

    if (result !== 'tesSUCCESS' && result !== 'tecNO_PERMISSION') {
      throw new Error(`Failed to set asfAllowTrustLineLocking: ${result}`);
    }

    console.log('Issuer token escrow flag set (or already set).');
    console.log(`Transaction: ${tx.result.hash}`);
  } finally {
    await client.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
