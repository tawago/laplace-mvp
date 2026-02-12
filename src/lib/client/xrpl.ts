import { Client, Wallet, decode } from 'xrpl';
import Decimal from 'decimal.js';
import { getTokenCode } from '@/lib/xrpl/currency-codes';

type XrplNetwork = 'testnet' | 'devnet';

const NETWORK = (process.env.NEXT_PUBLIC_XRPL_NETWORK === 'devnet' ? 'devnet' : 'testnet') as XrplNetwork;

const XRPL_NETWORK_CONFIG: Record<XrplNetwork, { wsUrl: string; faucetUrl: string }> = {
  testnet: {
    wsUrl: 'wss://s.altnet.rippletest.net:51233',
    faucetUrl: 'https://faucet.altnet.rippletest.net/accounts',
  },
  devnet: {
    wsUrl: 'wss://s.devnet.rippletest.net:51233',
    faucetUrl: 'https://faucet.devnet.rippletest.net/accounts',
  },
};

const XRPL_URL = process.env.NEXT_PUBLIC_TESTNET_URL || XRPL_NETWORK_CONFIG[NETWORK].wsUrl;
const XRPL_FAUCET_URL =
  process.env.NEXT_PUBLIC_XRPL_FAUCET_URL || XRPL_NETWORK_CONFIG[NETWORK].faucetUrl;

export interface WalletInfo {
  address: string;
  seed: string;
}

export function signTransactionJson(seed: string, txJson: Record<string, unknown>): Record<string, unknown> {
  const wallet = Wallet.fromSeed(seed);
  const signed = wallet.sign(txJson as never);
  return decode(signed.tx_blob) as Record<string, unknown>;
}

export interface TokenBalance {
  currency: string;
  value: string;
  issuer?: string;
}

export interface VaultSubmitResult {
  hash: string;
  result: string;
  submittedAmount: string;
}

export interface EscrowConditionPackage {
  condition: string;
  fulfillment: string;
  preimage: string;
}

export interface EscrowCreateSubmitResult {
  hash: string;
  result: string;
  escrowSequence: number;
  cancelAfter: number;
}

function normalizeVaultAmount(amount: string, scale = 6): string {
  const decimal = new Decimal(amount);
  if (!decimal.isFinite() || decimal.lte(0)) {
    throw new Error('Amount must be a positive number');
  }

  const rounded = decimal.toDecimalPlaces(scale, Decimal.ROUND_DOWN);
  const fixed = rounded.toFixed(scale);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function extractResultCode(meta: unknown): string {
  if (typeof meta === 'object' && meta !== null && 'TransactionResult' in meta) {
    const value = (meta as { TransactionResult?: unknown }).TransactionResult;
    if (typeof value === 'string') {
      return value;
    }
  }

  return 'unknown';
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function unixToRippleTime(unixSeconds: number): number {
  return unixSeconds - 946684800;
}

export async function generateConditionFulfillment(): Promise<EscrowConditionPackage> {
  const preimageBytes = crypto.getRandomValues(new Uint8Array(32));
  const digestBuffer = await crypto.subtle.digest('SHA-256', preimageBytes);
  const digest = toHex(new Uint8Array(digestBuffer));
  const preimage = toHex(preimageBytes);

  return {
    condition: `A0258020${digest}810120`,
    fulfillment: `A0228020${preimage}`,
    preimage,
  };
}

let clientInstance: Client | null = null;

/**
 * Get or create a client instance for browser use
 */
async function getClientBrowser(): Promise<Client> {
  if (!clientInstance) {
    clientInstance = new Client(XRPL_URL);
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
    const response = await fetch(XRPL_FAUCET_URL, {
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
  const result = extractResultCode(meta);

  return {
    hash: tx.result.hash,
    result,
  };
}

export async function submitCollateralEscrow(
  seed: string,
  destination: string,
  currency: string,
  amount: string,
  issuer: string,
  condition: string,
  cancelAfterUnixSeconds: number
): Promise<EscrowCreateSubmitResult> {
  const client = await getClientBrowser();
  const wallet = Wallet.fromSeed(seed);
  const normalizedCurrency = getTokenCode(currency) || currency;
  const cancelAfter = unixToRippleTime(cancelAfterUnixSeconds);

  const tx = await client.submitAndWait(
    {
      TransactionType: 'EscrowCreate',
      Account: wallet.address,
      Destination: destination,
      Amount: {
        currency: normalizedCurrency,
        issuer,
        value: amount,
      },
      Condition: condition.toUpperCase(),
      CancelAfter: cancelAfter,
    } as never,
    { wallet }
  );

  const resultCode = extractResultCode(tx.result.meta);
  const escrowSequence = (tx.result.tx_json as { Sequence?: number }).Sequence;
  if (typeof escrowSequence !== 'number') {
    throw new Error('EscrowCreate response missing transaction sequence');
  }

  return {
    hash: tx.result.hash,
    result: resultCode,
    escrowSequence,
    cancelAfter,
  };
}

export async function submitVaultDeposit(
  seed: string,
  vaultId: string,
  currency: string,
  amount: string,
  issuer: string,
  scale = 6
): Promise<VaultSubmitResult> {
  const client = await getClientBrowser();
  const wallet = Wallet.fromSeed(seed);
  const normalizedCurrency = getTokenCode(currency) || currency;

  const normalizedAmount = normalizeVaultAmount(amount, scale);

  const tx = await client.submitAndWait(
    {
      TransactionType: 'VaultDeposit',
      Account: wallet.address,
      VaultID: vaultId,
      Amount: {
        currency: normalizedCurrency,
        issuer,
        value: normalizedAmount,
      },
    } as never,
    { wallet }
  );

  return {
    hash: tx.result.hash,
    result: extractResultCode(tx.result.meta),
    submittedAmount: normalizedAmount,
  };
}

export async function submitVaultWithdraw(
  seed: string,
  vaultId: string,
  currency: string,
  amount: string,
  issuer: string,
  scale = 6
): Promise<VaultSubmitResult> {
  const client = await getClientBrowser();
  const wallet = Wallet.fromSeed(seed);
  const normalizedCurrency = getTokenCode(currency) || currency;

  const normalizedAmount = normalizeVaultAmount(amount, scale);
  const tx = await client.submitAndWait(
    {
      TransactionType: 'VaultWithdraw',
      Account: wallet.address,
      VaultID: vaultId,
      Amount: {
        currency: normalizedCurrency,
        issuer,
        value: normalizedAmount,
      },
    } as never,
    { wallet }
  );

  return {
    hash: tx.result.hash,
    result: extractResultCode(tx.result.meta),
    submittedAmount: normalizedAmount,
  };
}

export async function getVaultShareBalance(
  address: string,
  mptIssuanceId: string
): Promise<string> {
  const client = await getClientBrowser();
  const response = await client.request({ command: 'account_objects', account: address });
  const accountObjects = Array.isArray(response.result.account_objects)
    ? response.result.account_objects
    : [];

  const normalizedTarget = mptIssuanceId.toUpperCase();
  const match = accountObjects.find((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as unknown as Record<string, unknown>;
    const issuance =
      (typeof record.MPTokenIssuanceID === 'string' && record.MPTokenIssuanceID) ||
      (typeof record.MPTokenIssuanceId === 'string' && record.MPTokenIssuanceId) ||
      (typeof record.mpt_issuance_id === 'string' && record.mpt_issuance_id) ||
      '';
    return issuance.toUpperCase() === normalizedTarget;
  }) as unknown as Record<string, unknown> | undefined;

  if (!match) return '0';

  const balance =
    (typeof match.MPTAmount === 'string' && match.MPTAmount) ||
    (typeof match.MPTokenBalance === 'string' && match.MPTokenBalance) ||
    (typeof match.Balance === 'string' && match.Balance) ||
    (typeof match.balance === 'string' && match.balance) ||
    '0';

  return new Decimal(balance).toString();
}

export async function submitVaultWithdrawAllByShares(
  seed: string,
  vaultId: string,
  mptIssuanceId: string,
  shareAmount: string
): Promise<VaultSubmitResult> {
  const client = await getClientBrowser();
  const wallet = Wallet.fromSeed(seed);
  const normalizedShares = normalizeVaultAmount(shareAmount, 16);

  const tx = await client.submitAndWait(
    {
      TransactionType: 'VaultWithdraw',
      Account: wallet.address,
      VaultID: vaultId,
      Amount: {
        mpt_issuance_id: mptIssuanceId,
        value: normalizedShares,
      },
    } as never,
    { wallet }
  );

  return {
    hash: tx.result.hash,
    result: extractResultCode(tx.result.meta),
    submittedAmount: normalizedShares,
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
