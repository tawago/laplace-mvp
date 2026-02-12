import Decimal from 'decimal.js';
import { Client, Wallet } from 'xrpl';

import { getClient } from './client';

const VAULT_AMENDMENT_HINTS = ['singleassetvault', 'vault'];

type MaybeRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MaybeRecord {
  return typeof value === 'object' && value !== null;
}

function getResultCode(meta: unknown): string | null {
  if (!isRecord(meta)) return null;
  return typeof meta.TransactionResult === 'string' ? meta.TransactionResult : null;
}

function toDecimalString(value: unknown): string {
  if (typeof value === 'string') return new Decimal(value).toString();
  if (typeof value === 'number') return new Decimal(value).toString();
  throw new Error(`Expected numeric value, received ${typeof value}`);
}

function findValueByKey(input: unknown, expectedKeys: string[]): unknown {
  if (!isRecord(input)) return undefined;

  for (const key of expectedKeys) {
    if (key in input) {
      return input[key];
    }
  }

  for (const value of Object.values(input)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = findValueByKey(item, expectedKeys);
        if (nested !== undefined) return nested;
      }
      continue;
    }

    const nested = findValueByKey(value, expectedKeys);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function extractStringValue(input: unknown, keys: string[], fallbackLabel: string): string {
  const value = findValueByKey(input, keys);
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Unable to parse ${fallbackLabel} from XRPL transaction result`);
  }

  return value;
}

function extractOptionalStringValue(input: unknown, keys: string[]): string | null {
  const value = findValueByKey(input, keys);
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  return value;
}

async function submitVaultTx(client: Client, wallet: Wallet, tx: Record<string, unknown>) {
  const response = await client.submitAndWait(tx as never, { wallet });
  const result = response.result as unknown as MaybeRecord;
  const meta = isRecord(result.meta) ? result.meta : null;
  const txResult = getResultCode(meta);

  if (txResult !== 'tesSUCCESS') {
    throw new Error(
      `Vault transaction failed (${txResult ?? 'unknown'}). hash=${String(result.hash ?? '')}`
    );
  }

  return result;
}

export interface VaultSupportResult {
  enabled: boolean;
  reason?: string;
}

export interface CreateSupplyVaultArgs {
  currency: string;
  issuer: string;
  scale?: number;
}

export interface CreateSupplyVaultResult {
  vaultId: string;
  mptIssuanceId: string;
  txHash: string;
}

export interface SupplyVaultAmountArgs {
  vaultId: string;
  amount: string;
}

export interface VaultTxResult {
  txHash: string;
}

export interface SupplyVaultInfo {
  assetsTotal: string;
  assetsAvailable: string;
  exchangeRate: string;
  mptIssuanceId: string | null;
}

export interface SupplierShareBalance {
  shares: string;
}

export async function checkVaultSupport(client: Client): Promise<VaultSupportResult> {
  const serverInfo = await client.request({ command: 'server_info' });
  const info = serverInfo.result?.info as MaybeRecord | undefined;
  const validatedLedger = isRecord(info?.validated_ledger) ? info?.validated_ledger : undefined;

  const amendmentsRaw = validatedLedger?.amendments;
  const amendments = Array.isArray(amendmentsRaw)
    ? amendmentsRaw.filter((item): item is string => typeof item === 'string')
    : [];

  const hasVaultAmendment = amendments.some((amendment) => {
    const normalized = amendment.toLowerCase();
    return VAULT_AMENDMENT_HINTS.some((hint) => normalized.includes(hint));
  });

  let hasVaultTxType = false;
  try {
    const definitions = await client.request({ command: 'server_definitions' });
    const transactionTypes = findValueByKey(definitions.result, ['TRANSACTION_TYPES', 'transaction_types']);
    if (isRecord(transactionTypes)) {
      hasVaultTxType = Object.keys(transactionTypes).some((key) => key.toLowerCase().includes('vault'));
    }
  } catch {
    hasVaultTxType = false;
  }

  if (hasVaultAmendment || hasVaultTxType) {
    return { enabled: true };
  }

  return {
    enabled: false,
    reason: 'Vault amendment or transaction type not detected on connected XRPL network',
  };
}

export async function createSupplyVault(
  wallet: Wallet,
  args: CreateSupplyVaultArgs
): Promise<CreateSupplyVaultResult> {
  const client = await getClient();
  const result = await submitVaultTx(client, wallet, {
    TransactionType: 'VaultCreate',
    Account: wallet.address,
    Asset: {
      currency: args.currency,
      issuer: args.issuer,
    },
  });

  const txHash = extractStringValue(result, ['hash'], 'transaction hash');
  const vaultId = extractStringValue(result, ['VaultID', 'VaultId', 'vault_id'], 'vaultId');
  const mptIssuanceId = extractStringValue(
    result,
    ['MPTokenIssuanceID', 'MPTokenIssuanceId', 'mpt_issuance_id'],
    'mptIssuanceId'
  );

  return { vaultId, mptIssuanceId, txHash };
}

export async function depositToSupplyVault(
  wallet: Wallet,
  args: SupplyVaultAmountArgs
): Promise<VaultTxResult> {
  const client = await getClient();
  const result = await submitVaultTx(client, wallet, {
    TransactionType: 'VaultDeposit',
    Account: wallet.address,
    VaultID: args.vaultId,
    Amount: toDecimalString(args.amount),
  });

  return {
    txHash: extractStringValue(result, ['hash'], 'transaction hash'),
  };
}

export async function withdrawFromSupplyVault(
  wallet: Wallet,
  args: SupplyVaultAmountArgs
): Promise<VaultTxResult> {
  const client = await getClient();
  const result = await submitVaultTx(client, wallet, {
    TransactionType: 'VaultWithdraw',
    Account: wallet.address,
    VaultID: args.vaultId,
    Amount: toDecimalString(args.amount),
  });

  return {
    txHash: extractStringValue(result, ['hash'], 'transaction hash'),
  };
}

export async function getSupplyVaultInfo(client: Client, vaultId: string): Promise<SupplyVaultInfo> {
  const response = (await client.request({
    command: 'ledger_entry',
    vault: vaultId,
  } as never)) as MaybeRecord;

  const entry = isRecord(response.result) ? response.result.node : undefined;
  if (!isRecord(entry)) {
    throw new Error(`Vault ${vaultId} not found`);
  }

  return {
    assetsTotal: toDecimalString(findValueByKey(entry, ['AssetsTotal', 'assets_total']) ?? '0'),
    assetsAvailable: toDecimalString(findValueByKey(entry, ['AssetsAvailable', 'assets_available']) ?? '0'),
    exchangeRate: toDecimalString(findValueByKey(entry, ['ExchangeRate', 'exchange_rate']) ?? '1'),
    mptIssuanceId: extractOptionalStringValue(entry, [
      'MPTokenIssuanceID',
      'MPTokenIssuanceId',
      'mpt_issuance_id',
    ]),
  };
}

export async function getSupplierShareBalance(
  client: Client,
  address: string,
  mptIssuanceId: string
): Promise<SupplierShareBalance> {
  const response = await client.request({
    command: 'account_objects',
    account: address,
  });

  const accountObjects = Array.isArray(response.result?.account_objects)
    ? response.result.account_objects
    : [];

  const matchingObject = accountObjects.find((entry) => {
    if (!isRecord(entry)) return false;
    const issuanceId = findValueByKey(entry, ['MPTokenIssuanceID', 'MPTokenIssuanceId', 'mpt_issuance_id']);
    return issuanceId === mptIssuanceId;
  });

  if (!matchingObject || !isRecord(matchingObject)) {
    return { shares: '0' };
  }

  const balance =
    findValueByKey(matchingObject, ['MPTAmount', 'MPTokenBalance', 'Balance', 'balance']) ?? '0';
  return {
    shares: toDecimalString(balance),
  };
}
