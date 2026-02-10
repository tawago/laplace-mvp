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
}

export interface SendTokenResult {
  hash: string;
  result: string;
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

  const result = tx.result;
  const validated = result.validated === true;

  // Transaction data is in tx_json
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txResult = result as any;
  const txJson = txResult.tx_json || txResult;

  // For token payments, DeliverMax is an object with currency, issuer, value
  // For XRP payments, DeliverMax is a string (drops)
  let amount: TokenAmount | null = null;
  const rawAmount = txJson.DeliverMax || txJson.Amount;

  if (rawAmount) {
    if (typeof rawAmount === 'string') {
      amount = {
        currency: 'XRP',
        value: String(dropsToXrp(rawAmount)),
        issuer: '',
      };
    } else if (typeof rawAmount === 'object') {
      amount = {
        currency: rawAmount.currency,
        value: rawAmount.value,
        issuer: rawAmount.issuer,
      };
    }
  }

  return {
    validated,
    destination: txJson.Destination || '',
    source: txJson.Account || '',
    amount,
    hash: txResult.hash || txHash,
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
