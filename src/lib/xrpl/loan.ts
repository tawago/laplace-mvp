import { Client, Wallet } from 'xrpl';

import { cached, xrplCacheKeys } from './cache';
import { getClient } from './client';

type MaybeRecord = Record<string, unknown>;

const LOAN_AMENDMENT_HINTS = ['xls66', 'loan'];

export type LoanProtocolErrorCode =
  | 'NETWORK_UNSUPPORTED'
  | 'TX_NOT_VALIDATED'
  | 'TX_LOOKUP_FAILED'
  | 'TX_FAILED'
  | 'INVALID_TX_TYPE'
  | 'MISSING_RESULT_FIELD'
  | 'LEDGER_LOOKUP_FAILED';

export class LoanProtocolError extends Error {
  readonly code: LoanProtocolErrorCode;

  constructor(code: LoanProtocolErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'LoanProtocolError';
  }
}

export interface LoanProtocolSupport {
  enabled: boolean;
  reason?: string;
  txTypes: string[];
}

export interface CreateLoanBrokerArgs {
  vaultId: string;
  feeBps: number;
}

export interface CreateLoanBrokerResult {
  brokerId: string;
  brokerAddress: string;
  txHash: string;
}

export interface LoanBrokerInfo {
  brokerId: string;
  brokerAddress: string;
  feeBps: string | null;
  raw: MaybeRecord;
}

export interface IssuedAmountValue {
  currency: string;
  issuer: string;
  value: string;
}

export interface BuildLoanSetTransactionArgs {
  account: string;
  borrower: string;
  loanBrokerId: string;
  principal: IssuedAmountValue;
  collateral: IssuedAmountValue;
  termMonths: number;
  annualInterestBps: number;
  additionalFields?: Record<string, unknown>;
}

export interface BrokerSignedLoanSet {
  txBlob: string;
  txJson: MaybeRecord;
  hash: string;
}

export interface LoanSetResult {
  txHash: string;
  ledgerIndex: number | null;
  validated: boolean;
  loanId: string;
  txResult: string;
  rawTx: MaybeRecord;
  rawMeta: MaybeRecord | null;
}

export interface BuildLoanPayTransactionArgs {
  account: string;
  loanId: string;
  amount: IssuedAmountValue;
  additionalFields?: Record<string, unknown>;
}

export interface LoanPayVerification {
  txHash: string;
  validated: boolean;
  txResult: string;
  account: string;
  loanId: string;
  amount: IssuedAmountValue | null;
  rawTx: MaybeRecord;
  rawMeta: MaybeRecord | null;
}

export interface LoanInfo {
  loanId: string;
  borrower: string | null;
  lender: string | null;
  principal: string | null;
  outstandingDebt: string | null;
  accruedInterest: string | null;
  maturityDate: number | null;
  status: string | null;
  raw: MaybeRecord;
}

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

function readStringField(input: unknown, keys: string[], field: string): string {
  const value = findValueByKey(input, keys);
  if (typeof value !== 'string' || value.length === 0) {
    throw new LoanProtocolError('MISSING_RESULT_FIELD', `Missing ${field} in XRPL response`);
  }

  return value;
}

function readOptionalStringField(input: unknown, keys: string[]): string | null {
  const value = findValueByKey(input, keys);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOptionalAmountValueField(input: unknown, keys: string[]): string | null {
  const value = findValueByKey(input, keys);
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (isRecord(value)) {
    const amountValue = value.value;
    if (typeof amountValue === 'string' && amountValue.length > 0) {
      return amountValue;
    }
    if (typeof amountValue === 'number' && Number.isFinite(amountValue)) {
      return String(amountValue);
    }
  }

  return null;
}

function readOptionalNumberField(input: unknown, keys: string[]): number | null {
  const value = findValueByKey(input, keys);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readTxResult(meta: unknown): string {
  if (!isRecord(meta) || typeof meta.TransactionResult !== 'string') {
    throw new LoanProtocolError('MISSING_RESULT_FIELD', 'TransactionResult missing in XRPL metadata');
  }

  return meta.TransactionResult;
}

function extractLoanIdFromMeta(meta: unknown): string | null {
  if (!isRecord(meta)) return null;
  const affectedNodes = meta.AffectedNodes;
  if (!Array.isArray(affectedNodes)) return null;

  for (const node of affectedNodes) {
    if (!isRecord(node)) continue;
    const createdNode = isRecord(node.CreatedNode) ? node.CreatedNode : null;
    const modifiedNode = isRecord(node.ModifiedNode) ? node.ModifiedNode : null;
    const deletedNode = isRecord(node.DeletedNode) ? node.DeletedNode : null;
    const candidate = createdNode || modifiedNode || deletedNode;
    if (!candidate) continue;

    if (candidate.LedgerEntryType !== 'Loan') continue;
    if (typeof candidate.LedgerIndex === 'string' && candidate.LedgerIndex.length > 0) {
      return candidate.LedgerIndex;
    }
  }

  return null;
}

function normalizeIssuedAmount(raw: unknown): IssuedAmountValue | null {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.currency !== 'string' ||
    typeof raw.issuer !== 'string' ||
    (typeof raw.value !== 'string' && typeof raw.value !== 'number')
  ) {
    return null;
  }

  return {
    currency: raw.currency,
    issuer: raw.issuer,
    value: String(raw.value),
  };
}

export async function checkLoanProtocolSupport(client: Client): Promise<LoanProtocolSupport> {
  return cached({
    key: xrplCacheKeys.loanSupport(),
    ttlMs: 60_000,
    tags: ['loan-support'],
    loader: async () => {
      const serverInfo = await client.request({ command: 'server_info' });
      const info = isRecord(serverInfo.result?.info) ? serverInfo.result.info : null;
      const amendmentsRaw = findValueByKey(info, ['amendments', 'Amendments']);
      const amendments = Array.isArray(amendmentsRaw)
        ? amendmentsRaw.filter((item): item is string => typeof item === 'string')
        : [];

      const hasLoanAmendment = amendments.some((amendment) => {
        const normalized = amendment.toLowerCase();
        return LOAN_AMENDMENT_HINTS.some((hint) => normalized.includes(hint));
      });

      const definitions = await client.request({ command: 'server_definitions' });
      const txTypeObject = findValueByKey(definitions.result, ['TRANSACTION_TYPES', 'transaction_types']);
      const txTypes = isRecord(txTypeObject) ? Object.keys(txTypeObject).sort() : [];
      const hasLoanTx = txTypes.some((txType) => txType.toLowerCase().includes('loan'));

      if (hasLoanAmendment || hasLoanTx) {
        return { enabled: true, txTypes };
      }

      return {
        enabled: false,
        txTypes,
        reason: 'Loan amendment or loan transaction types not detected on connected XRPL network',
      };
    },
  });
}

export async function createLoanBroker(
  wallet: Wallet,
  { vaultId, feeBps }: CreateLoanBrokerArgs
): Promise<CreateLoanBrokerResult> {
  const client = await getClient();
  const response = await client.submitAndWait(
    {
      TransactionType: 'LoanBrokerSet',
      Account: wallet.address,
      VaultID: vaultId,
      ManagementFeeRate: feeBps,
    } as never,
    { wallet }
  );

  const result = response.result as unknown;
  const meta = isRecord((result as MaybeRecord).meta) ? (result as MaybeRecord).meta : null;
  const txResult = readTxResult(meta);
  if (txResult !== 'tesSUCCESS') {
    throw new LoanProtocolError('TX_FAILED', `Loan broker creation failed (${txResult})`);
  }

  return {
    brokerId: readStringField(result, ['LoanBrokerID', 'LoanBrokerId', 'loan_broker_id'], 'loan broker id'),
    brokerAddress: readStringField(result, ['Account', 'Broker', 'LoanBroker'], 'loan broker address'),
    txHash: readStringField(result, ['hash'], 'transaction hash'),
  };
}

export async function getLoanBrokerInfo(client: Client, brokerId: string): Promise<LoanBrokerInfo> {
  try {
    const response = (await client.request({
      command: 'ledger_entry',
      loan_broker: brokerId,
    } as never)) as { result?: unknown };

    const node = isRecord((response.result as MaybeRecord | undefined)?.node)
      ? ((response.result as MaybeRecord).node as MaybeRecord)
      : null;
    if (!node) {
      throw new LoanProtocolError('LEDGER_LOOKUP_FAILED', `Loan broker ${brokerId} not found`);
    }

    return {
      brokerId: readStringField(node, ['LoanBrokerID', 'LoanBrokerId', 'loan_broker_id'], 'loan broker id'),
      brokerAddress: readStringField(node, ['Account', 'Broker', 'LoanBroker'], 'loan broker address'),
      feeBps: readOptionalStringField(node, ['Fee', 'FeeBps', 'fee_bps']),
      raw: node,
    };
  } catch (error) {
    if (error instanceof LoanProtocolError) {
      throw error;
    }

    throw new LoanProtocolError('LEDGER_LOOKUP_FAILED', 'Failed to fetch loan broker info');
  }
}

export function buildLoanSetTransaction(args: BuildLoanSetTransactionArgs): Record<string, unknown> {
  return {
    TransactionType: 'LoanSet',
    Account: args.account,
    LoanBrokerID: args.loanBrokerId,
    PrincipalRequested: args.principal.value,
    InterestRate: args.annualInterestBps,
    PaymentTotal: args.termMonths,
    ...(args.additionalFields ?? {}),
  };
}

export function brokerSignLoanSet(wallet: Wallet, unsignedTx: Record<string, unknown>): BrokerSignedLoanSet {
  const signed = wallet.sign(unsignedTx as never);
  return {
    txBlob: signed.tx_blob,
    txJson: unsignedTx,
    hash: signed.hash,
  };
}

export async function extractLoanSetResult(client: Client, txHash: string): Promise<LoanSetResult> {
  let response: { result?: unknown };
  try {
    response = await client.request({
      command: 'tx',
      transaction: txHash,
    });
  } catch {
    throw new LoanProtocolError('TX_LOOKUP_FAILED', `Failed to fetch tx ${txHash}`);
  }

  const result = isRecord(response.result) ? response.result : null;
  if (!result) {
    throw new LoanProtocolError('TX_LOOKUP_FAILED', `Transaction ${txHash} is unavailable`);
  }

  if (result.validated !== true) {
    throw new LoanProtocolError('TX_NOT_VALIDATED', `Transaction ${txHash} is not validated yet`);
  }

  const rawTx = isRecord(result.tx_json) ? result.tx_json : result;
  const txType = typeof rawTx.TransactionType === 'string' ? rawTx.TransactionType : '';
  if (txType !== 'LoanSet') {
    throw new LoanProtocolError('INVALID_TX_TYPE', `Expected LoanSet, got ${txType || 'unknown'}`);
  }

  const rawMeta = isRecord(result.meta) ? result.meta : null;
  const txResult = readTxResult(rawMeta);
  if (txResult !== 'tesSUCCESS') {
    throw new LoanProtocolError('TX_FAILED', `LoanSet failed on-ledger (${txResult})`);
  }

  const loanIdFromResult = readOptionalStringField(result, ['LoanID', 'LoanId', 'loan_id']);
  const loanIdFromMeta = extractLoanIdFromMeta(rawMeta);
  const loanId = loanIdFromResult || loanIdFromMeta;
  if (!loanId) {
    throw new LoanProtocolError('MISSING_RESULT_FIELD', 'Missing loan id in XRPL response');
  }

  return {
    txHash: typeof result.hash === 'string' ? result.hash : txHash,
    ledgerIndex: typeof result.ledger_index === 'number' ? result.ledger_index : null,
    validated: true,
    loanId,
    txResult,
    rawTx,
    rawMeta,
  };
}

export function buildLoanPayTransaction(args: BuildLoanPayTransactionArgs): Record<string, unknown> {
  return {
    TransactionType: 'LoanPay',
    Account: args.account,
    LoanID: args.loanId,
    Amount: {
      currency: args.amount.currency,
      issuer: args.amount.issuer,
      value: args.amount.value,
    },
    ...(args.additionalFields ?? {}),
  };
}

export async function verifyLoanPayTransaction(client: Client, txHash: string): Promise<LoanPayVerification> {
  let response: { result?: unknown };
  try {
    response = await client.request({ command: 'tx', transaction: txHash });
  } catch {
    throw new LoanProtocolError('TX_LOOKUP_FAILED', `Failed to fetch tx ${txHash}`);
  }

  const result = isRecord(response.result) ? response.result : null;
  if (!result) {
    throw new LoanProtocolError('TX_LOOKUP_FAILED', `Transaction ${txHash} is unavailable`);
  }

  if (result.validated !== true) {
    throw new LoanProtocolError('TX_NOT_VALIDATED', `Transaction ${txHash} is not validated yet`);
  }

  const rawTx = isRecord(result.tx_json) ? result.tx_json : result;
  const txType = typeof rawTx.TransactionType === 'string' ? rawTx.TransactionType : '';
  if (txType !== 'LoanPay') {
    throw new LoanProtocolError('INVALID_TX_TYPE', `Expected LoanPay, got ${txType || 'unknown'}`);
  }

  const rawMeta = isRecord(result.meta) ? result.meta : null;
  const txResult = readTxResult(rawMeta);
  if (txResult !== 'tesSUCCESS') {
    throw new LoanProtocolError('TX_FAILED', `LoanPay failed on-ledger (${txResult})`);
  }

  const account = readStringField(rawTx, ['Account'], 'account');
  const loanId = readStringField(rawTx, ['LoanID', 'LoanId', 'loan_id'], 'loan id');

  return {
    txHash: typeof result.hash === 'string' ? result.hash : txHash,
    validated: true,
    txResult,
    account,
    loanId,
    amount: normalizeIssuedAmount(rawTx.Amount),
    rawTx,
    rawMeta,
  };
}

export async function getLoanInfo(client: Client, loanId: string): Promise<LoanInfo> {
  return cached({
    key: xrplCacheKeys.loanInfo(loanId),
    ttlMs: 5_000,
    staleTtlMs: 10_000,
    tags: ['loan-info', `loan-info:${loanId}`],
    loader: async () => {
      try {
        const response = (await client.request({
          command: 'ledger_entry',
          loan: loanId,
        } as never)) as { result?: unknown };

        const node = isRecord((response.result as MaybeRecord | undefined)?.node)
          ? ((response.result as MaybeRecord).node as MaybeRecord)
          : null;
        if (!node) {
          throw new LoanProtocolError('LEDGER_LOOKUP_FAILED', `Loan ${loanId} not found`);
        }

        return {
          loanId: readOptionalStringField(node, ['LoanID', 'LoanId', 'loan_id']) || loanId,
          borrower: readOptionalStringField(node, ['Borrower', 'Account']),
          lender: readOptionalStringField(node, ['Lender']),
          principal: readOptionalAmountValueField(node, [
            'Principal',
            'principal',
            'PrincipalAmount',
            'PrincipalOutstanding',
          ]),
          outstandingDebt: readOptionalAmountValueField(node, [
            'OutstandingDebt',
            'outstanding_debt',
            'Debt',
            'TotalValueOutstanding',
          ]),
          accruedInterest: readOptionalAmountValueField(node, ['AccruedInterest', 'accrued_interest', 'Interest']),
          maturityDate: readOptionalNumberField(node, ['MaturityDate', 'maturity_date', 'Maturity']),
          status: readOptionalStringField(node, ['Status', 'status']),
          raw: node,
        };
      } catch (error) {
        if (error instanceof LoanProtocolError) {
          throw error;
        }

        throw new LoanProtocolError('LEDGER_LOOKUP_FAILED', `Failed to fetch loan ${loanId}`);
      }
    },
  });
}

export async function markLoanDefaulted(wallet: Wallet, loanId: string): Promise<{ txHash: string }> {
  const client = await getClient();
  const response = await client.submitAndWait(
    {
      TransactionType: 'LoanManage',
      Account: wallet.address,
      LoanID: loanId,
      Flags: 65536,
    } as never,
    { wallet }
  );

  const result = response.result as unknown;
  const meta = isRecord((result as MaybeRecord).meta) ? (result as MaybeRecord).meta : null;
  const txResult = readTxResult(meta);
  if (txResult !== 'tesSUCCESS') {
    throw new LoanProtocolError('TX_FAILED', `LoanManage failed on-ledger (${txResult})`);
  }

  return {
    txHash: readStringField(result, ['hash'], 'transaction hash'),
  };
}
