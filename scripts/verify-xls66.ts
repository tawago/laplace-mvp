import { Client, Wallet } from 'xrpl';

import { checkLoanProtocolSupport } from '../src/lib/xrpl/loan';

const DEVNET_WS_URL = 'wss://s.devnet.rippletest.net:51233';

type MaybeRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MaybeRecord {
  return typeof value === 'object' && value !== null;
}

function findValueByKey(input: unknown, keys: string[]): unknown {
  if (!isRecord(input)) return undefined;

  for (const key of keys) {
    if (key in input) {
      return input[key];
    }
  }

  for (const value of Object.values(input)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = findValueByKey(item, keys);
        if (nested !== undefined) return nested;
      }
      continue;
    }

    const nested = findValueByKey(value, keys);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function getLoanTxSchemas(definitionsResult: unknown): Array<{ txType: string; fields: string[] }> {
  const txFormats = findValueByKey(definitionsResult, ['TRANSACTION_FORMATS', 'transaction_formats']);
  if (!isRecord(txFormats)) {
    return [];
  }

  const rows: Array<{ txType: string; fields: string[] }> = [];

  for (const [txType, rawSchema] of Object.entries(txFormats)) {
    if (!txType.toLowerCase().includes('loan')) continue;

    const fieldNames: string[] = [];
    if (isRecord(rawSchema)) {
      for (const key of Object.keys(rawSchema)) {
        fieldNames.push(key);
      }
    }

    rows.push({ txType, fields: fieldNames.sort() });
  }

  return rows.sort((a, b) => a.txType.localeCompare(b.txType));
}

async function main(): Promise<void> {
  const wsUrl = process.argv[2] || DEVNET_WS_URL;
  const client = new Client(wsUrl);

  console.log('='.repeat(60));
  console.log('XLS-66 Protocol Verification');
  console.log('='.repeat(60));
  console.log(`Network: ${wsUrl}`);

  try {
    await client.connect();
    console.log('Connected');

    const support = await checkLoanProtocolSupport(client);
    if (!support.enabled) {
      console.error('XLS-66 loan support not detected');
      if (support.reason) {
        console.error(`Reason: ${support.reason}`);
      }
      process.exitCode = 1;
      return;
    }

    const loanTxTypes = support.txTypes.filter((txType) => txType.toLowerCase().includes('loan'));
    console.log('Detected loan transaction types:');
    for (const txType of loanTxTypes) {
      console.log(`- ${txType}`);
    }

    const definitions = await client.request({ command: 'server_definitions' });
    const loanSchemas = getLoanTxSchemas(definitions.result);
    console.log('Loan transaction field schemas:');
    for (const row of loanSchemas) {
      console.log(`- ${row.txType}: ${row.fields.join(', ')}`);
    }

    const testWallet = Wallet.generate();
    const sdkSamples: Array<{ txType: string; tx: Record<string, unknown> }> = [
      {
        txType: 'LoanBrokerSet',
        tx: {
          TransactionType: 'LoanBrokerSet',
          Account: testWallet.address,
          Fee: '12',
          Sequence: 1,
          LastLedgerSequence: 99999999,
          VaultID: '0'.repeat(64),
          ManagementFeeRate: 0,
        },
      },
      {
        txType: 'LoanSet',
        tx: {
          TransactionType: 'LoanSet',
          Account: testWallet.address,
          Fee: '12',
          Sequence: 1,
          LastLedgerSequence: 99999999,
          LoanBrokerID: '0'.repeat(64),
          PrincipalRequested: '1',
        },
      },
      {
        txType: 'LoanPay',
        tx: {
          TransactionType: 'LoanPay',
          Account: testWallet.address,
          Fee: '12',
          Sequence: 1,
          LastLedgerSequence: 99999999,
          LoanID: '0'.repeat(64),
          Amount: {
            currency: 'USD',
            issuer: testWallet.address,
            value: '1',
          },
        },
      },
      {
        txType: 'LoanManage',
        tx: {
          TransactionType: 'LoanManage',
          Account: testWallet.address,
          Fee: '12',
          Sequence: 1,
          LastLedgerSequence: 99999999,
          LoanID: '0'.repeat(64),
          Flags: 65536,
        },
      },
    ];

    console.log('xrpl.js local tx codec check:');
    for (const sample of sdkSamples) {
      try {
        testWallet.sign(sample.tx as never);
        console.log(`- ${sample.txType}: supported`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`- ${sample.txType}: not supported (${message})`);
      }
    }

    console.log('XLS-66 verification passed');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Verification failed:', message);
    process.exitCode = 1;
  } finally {
    if (client.isConnected()) {
      await client.disconnect();
    }
    console.log('Disconnected');
  }
}

void main();
