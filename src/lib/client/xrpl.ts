import { Client, Wallet } from 'xrpl';
import { getTokenCode } from '@/lib/xrpl/currency-codes';

const TESTNET_URL = process.env.NEXT_PUBLIC_TESTNET_URL || 'wss://s.altnet.rippletest.net:51233';

export interface WalletInfo {
  address: string;
  seed: string;
}

export interface TokenBalance {
  currency: string;
  value: string;
  issuer?: string;
}

let clientInstance: Client | null = null;

/**
 * Get or create a client instance for browser use
 */
async function getClientBrowser(): Promise<Client> {
  if (!clientInstance) {
    clientInstance = new Client(TESTNET_URL);
  }

  if (!clientInstance.isConnected()) {
    await clientInstance.connect();
  }

  return clientInstance;
}

/**
 * Generate a new wallet
 */
export function generateWallet(): WalletInfo {
  const wallet = Wallet.generate();
  return {
    address: wallet.address,
    seed: wallet.seed!,
  };
}

/**
 * Rebuild wallet info from an existing seed
 */
export function getWalletFromSeed(seed: string): WalletInfo {
  const wallet = Wallet.fromSeed(seed);
  return {
    address: wallet.address,
    seed,
  };
}

/**
 * Fund a wallet from the testnet faucet
 */
export async function fundWalletFromFaucet(address: string): Promise<{ funded: boolean; balance: string }> {
  try {
    const response = await fetch('https://faucet.altnet.rippletest.net/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: address }),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        funded: true,
        balance: data.amount?.toString() || '1000',
      };
    }

    return { funded: false, balance: '0' };
  } catch {
    return { funded: false, balance: '0' };
  }
}

/**
 * Sign and submit a trust line transaction
 */
export async function submitTrustLine(
  seed: string,
  issuer: string,
  currency: string,
  limit: string = '1000000'
): Promise<{ hash: string; result: string }> {
  const client = await getClientBrowser();
  const wallet = Wallet.fromSeed(seed);
  const normalizedCurrency = getTokenCode(currency) || currency;

  const tx = await client.submitAndWait({
    TransactionType: 'TrustSet',
    Account: wallet.address,
    LimitAmount: {
      currency: normalizedCurrency,
      issuer,
      value: limit,
    },
  }, { wallet });

  const meta = tx.result.meta;
  let result = 'unknown';

  if (typeof meta === 'object' && meta !== null && 'TransactionResult' in meta) {
    result = meta.TransactionResult as string;
  }

  return {
    hash: tx.result.hash,
    result,
  };
}

/**
 * Send tokens to backend for swap
 */
export async function sendTokenToBackend(
  seed: string,
  backendAddress: string,
  currency: string,
  amount: string,
  issuer: string
): Promise<{ hash: string; result: string }> {
  const client = await getClientBrowser();
  const wallet = Wallet.fromSeed(seed);
  const normalizedCurrency = getTokenCode(currency) || currency;

  const tx = await client.submitAndWait({
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: backendAddress,
    Amount: {
      currency: normalizedCurrency,
      issuer,
      value: amount,
    },
  }, { wallet });

  const meta = tx.result.meta;
  let result = 'unknown';

  if (typeof meta === 'object' && meta !== null && 'TransactionResult' in meta) {
    result = meta.TransactionResult as string;
  }

  return {
    hash: tx.result.hash,
    result,
  };
}

/**
 * Get balances for an address (uses API route)
 */
export async function getBalances(address: string): Promise<TokenBalance[]> {
  const response = await fetch(`/api/balances?address=${address}`);
  const data = await response.json();

  if (data.success) {
    return data.balances;
  }

  return [];
}

/**
 * Check if account has a specific trust line
 */
export async function checkTrustLine(
  address: string,
  issuer: string,
  currency: string
): Promise<boolean> {
  const client = await getClientBrowser();
  const normalizedCurrency = getTokenCode(currency) || currency;

  try {
    const result = await client.request({
      command: 'account_lines',
      account: address,
      peer: issuer,
    });

    return result.result.lines.some(line => line.currency.toUpperCase() === normalizedCurrency.toUpperCase());
  } catch {
    return false;
  }
}
