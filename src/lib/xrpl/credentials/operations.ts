import type { Client, Wallet } from 'xrpl';
import { CREDENTIAL_TYPES, type Credential, type VerificationLevel } from '@/lib/xrpl/credentials/types';

const RIPPLE_EPOCH_OFFSET = 946684800;
const CREDENTIAL_ACCEPTED_FLAG = 0x00010000;

type MaybeRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MaybeRecord {
  return typeof value === 'object' && value !== null;
}

function getCurrentRippleTime(): number {
  return Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_OFFSET;
}

function readBooleanField(entry: MaybeRecord, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return undefined;
}

function readStringField(entry: MaybeRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

function readNumberField(entry: MaybeRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === 'number') {
      return value;
    }
  }
  return undefined;
}

function parseAccepted(entry: MaybeRecord): boolean {
  const directAccepted = readBooleanField(entry, ['Accepted', 'accepted']);
  if (typeof directAccepted === 'boolean') {
    return directAccepted;
  }

  const flags = entry.Flags;
  if (typeof flags === 'number') {
    return (flags & CREDENTIAL_ACCEPTED_FLAG) !== 0;
  }

  if (isRecord(flags) && typeof flags.lsfAccepted === 'boolean') {
    return flags.lsfAccepted;
  }

  return false;
}

function normalizeCredential(entry: MaybeRecord): Credential | null {
  const ledgerEntryType = readStringField(entry, ['LedgerEntryType', 'ledger_entry_type']);
  if (ledgerEntryType !== 'Credential') {
    return null;
  }

  const issuer = readStringField(entry, ['Issuer', 'issuer']);
  const subject = readStringField(entry, ['Subject', 'subject']);
  const credentialTypeHex = readStringField(entry, ['CredentialType', 'credential_type']);

  if (!issuer || !subject || !credentialTypeHex) {
    return null;
  }

  const expiration = readNumberField(entry, ['Expiration', 'expiration']);
  const expired = typeof expiration === 'number' ? expiration <= getCurrentRippleTime() : false;
  const uri = readStringField(entry, ['URI', 'uri']);

  return {
    issuer,
    subject,
    credentialTypeHex: credentialTypeHex.toUpperCase(),
    accepted: parseAccepted(entry),
    expired,
    expiration,
    uri,
  };
}

export async function getAccountCredentials(client: Client, address: string): Promise<Credential[]> {
  try {
    const response = await client.request({
      command: 'account_objects',
      account: address,
      ledger_index: 'validated',
    });

    const accountObjects = Array.isArray(response.result.account_objects) ? response.result.account_objects : [];

    return accountObjects
      .map((item) => (isRecord(item) ? normalizeCredential(item) : null))
      .filter((item): item is Credential => item !== null);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('actNotFound') || message.includes('Account not found')) {
      return [];
    }
    throw error;
  }
}

function unixToRippleTime(unixSeconds: number): number {
  return Math.floor(unixSeconds) - RIPPLE_EPOCH_OFFSET;
}

export function rippleToUnixTime(rippleSeconds: number): number {
  return rippleSeconds + RIPPLE_EPOCH_OFFSET;
}

export async function createCredential(
  client: Client,
  issuerWallet: Wallet,
  subject: string,
  credentialTypeHex: string,
  expirationUnixSeconds?: number
): Promise<{ hash: string; result: string }> {
  const tx = {
    TransactionType: 'CredentialCreate',
    Account: issuerWallet.address,
    Subject: subject,
    CredentialType: credentialTypeHex.toUpperCase(),
    ...(typeof expirationUnixSeconds === 'number'
      ? { Expiration: unixToRippleTime(expirationUnixSeconds) }
      : {}),
  } as const;

  const submitted = await client.submitAndWait(tx as never, { wallet: issuerWallet });
  const meta = submitted.result.meta;
  const metaRecord = isRecord(meta) ? meta : null;
  const transactionResult = metaRecord?.TransactionResult;
  const result = typeof transactionResult === 'string' ? transactionResult : 'unknown';

  return {
    hash: submitted.result.hash,
    result,
  };
}

export function buildCredentialAcceptTx(subject: string, issuer: string, credentialTypeHex: string): Record<string, unknown> {
  return {
    TransactionType: 'CredentialAccept',
    Account: subject,
    Issuer: issuer,
    CredentialType: credentialTypeHex.toUpperCase(),
  };
}

export function deriveVerificationLevel(credentials: Credential[]): VerificationLevel {
  const hasVerifiedCredential = credentials.some(
    (credential) =>
      credential.credentialTypeHex === CREDENTIAL_TYPES.KYC_VERIFIED && credential.accepted && !credential.expired
  );

  return hasVerifiedCredential ? 'verified' : 'none';
}
