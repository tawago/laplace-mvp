import { Client, Wallet, dropsToXrp } from 'xrpl';

export interface TokenAmount {
  currency: string;
  value: string;
  issuer: string;
}

export interface TransactionVerification {
  validated: boolean;
  destination: string;
  source: string;
  amount: TokenAmount | null;
  hash: string;
  transactionType: string;
  usedDeliveredAmount?: boolean;
  rawMeta?: Record<string, unknown> | null;
  rawTx?: Record<string, unknown> | null;
}

export interface SendTokenResult {
  hash: string;
  result: string;
  transactionType?: string;
  rawTx?: Record<string, unknown> | null;
  rawMeta?: Record<string, unknown> | null;
}

type XrplAmount = string | { currency: string; issuer: string; value: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseXrplAmount(raw: unknown): XrplAmount | undefined {
  if (typeof raw === 'string') {
    return raw;
  }

  if (
    isRecord(raw) &&
    typeof raw.currency === 'string' &&
    typeof raw.issuer === 'string' &&
    typeof raw.value === 'string'
  ) {
    return {
      currency: raw.currency,
      issuer: raw.issuer,
      value: raw.value,
    };
  }

  return undefined;
}

function toTokenAmount(raw: XrplAmount | undefined): TokenAmount | null {
  if (!raw) {
    return null;
  }

  if (typeof raw === 'string') {
    return {
      currency: 'XRP',
      value: String(dropsToXrp(raw)),
      issuer: '',
    };
  }

  return {
    currency: raw.currency,
    value: raw.value,
    issuer: raw.issuer,
  };
}

/**
 * Send tokens from one wallet to a destination
 */
export async function sendToken(
  client: Client,
  wallet: Wallet,
  destination: string,
  currency: string,
  amount: string,
  issuer: string
): Promise<SendTokenResult> {
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

  const txResult = tx.result as unknown as Record<string, unknown>;
  const meta = isRecord(txResult.meta) ? txResult.meta : null;
  const rawTx = isRecord(txResult.tx_json) ? txResult.tx_json : txResult;
  const transactionType = typeof rawTx.TransactionType === 'string' ? rawTx.TransactionType : undefined;
  let result = 'unknown';

  if (meta && typeof meta.TransactionResult === 'string') {
    result = meta.TransactionResult as string;
  }

  if (typeof txResult.hash !== 'string') {
    throw new Error('XRPL response missing transaction hash');
  }

  const hash = txResult.hash;

  return {
    hash,
    result,
    transactionType,
    rawTx,
    rawMeta: meta,
  };
}

/**
 * Verify a transaction and extract its details
 */
export async function verifyTransaction(
  client: Client,
  txHash: string
): Promise<TransactionVerification> {
  const tx = await client.request({
    command: 'tx',
    transaction: txHash,
  });

  const result = tx.result as unknown as Record<string, unknown>;
  const validated = result.validated === true;
  const txJson = isRecord(result.tx_json) ? result.tx_json : result;
  const transactionType = typeof txJson.TransactionType === 'string' ? txJson.TransactionType : '';
  const rawMeta = isRecord(result.meta) ? result.meta : null;

  const metaDeliveredRaw = rawMeta?.delivered_amount;
  const deliveredFromMeta =
    metaDeliveredRaw === 'unavailable' ? undefined : parseXrplAmount(metaDeliveredRaw);
  const resultDeliveredRaw = result.delivered_amount;
  const deliveredFromResult =
    resultDeliveredRaw === 'unavailable' ? undefined : parseXrplAmount(resultDeliveredRaw);
  const deliveredAmount = deliveredFromMeta ?? deliveredFromResult;

  let amount: TokenAmount | null = null;
  let usedDeliveredAmount: boolean | undefined;

  if (transactionType === 'Payment') {
    if (deliveredAmount) {
      amount = toTokenAmount(deliveredAmount);
      usedDeliveredAmount = true;
    } else {
      amount = toTokenAmount(parseXrplAmount(txJson.Amount));
      usedDeliveredAmount = false;
    }
  }

  const destination = typeof txJson.Destination === 'string' ? txJson.Destination : '';
  const source = typeof txJson.Account === 'string' ? txJson.Account : '';
  const hash = typeof result.hash === 'string' ? result.hash : txHash;

  return {
    validated,
    destination,
    source,
    amount,
    hash,
    transactionType,
    usedDeliveredAmount,
    rawMeta,
    rawTx: txJson,
  };
}

/**
 * Get account balances including trust line tokens
 */
export async function getAccountBalances(
  client: Client,
  address: string
): Promise<{ currency: string; value: string; issuer?: string }[]> {
  const balances: { currency: string; value: string; issuer?: string }[] = [];

  try {
    const accountInfo = await client.request({
      command: 'account_info',
      account: address,
    });

    const xrpBalance = String(dropsToXrp(accountInfo.result.account_data.Balance));
    balances.push({
      currency: 'XRP',
      value: xrpBalance,
    });

    const trustLines = await client.request({
      command: 'account_lines',
      account: address,
    });

    for (const line of trustLines.result.lines) {
      balances.push({
        currency: line.currency,
        value: line.balance,
        issuer: line.account,
      });
    }
  } catch (error: unknown) {
    // Account not found is expected for unfunded wallets
    const isAccountNotFound = error instanceof Error &&
      (error.message.includes('Account not found') || error.message.includes('actNotFound'));
    if (!isAccountNotFound) {
      console.error('Error fetching balances:', error);
    }
  }

  return balances;
}

/**
 * Check if a trust line exists for a specific currency
 */
export async function hasTrustLine(
  client: Client,
  address: string,
  issuer: string,
  currency: string
): Promise<boolean> {
  try {
    const trustLines = await client.request({
      command: 'account_lines',
      account: address,
      peer: issuer,
    });

    return trustLines.result.lines.some(line => line.currency === currency);
  } catch {
    return false;
  }
}
