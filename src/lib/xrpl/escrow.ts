import { createHash, randomBytes } from 'crypto';
import { Client, Wallet } from 'xrpl';

import { getClient } from './client';

type MaybeRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MaybeRecord {
  return typeof value === 'object' && value !== null;
}

function toHex(value: Uint8Array): string {
  return Buffer.from(value).toString('hex').toUpperCase();
}

function normalizeHex(value: string): string {
  return value.trim().toUpperCase();
}

function getResultCode(meta: unknown): string | null {
  if (!isRecord(meta)) return null;
  return typeof meta.TransactionResult === 'string' ? meta.TransactionResult : null;
}

function toRippleTime(date: Date): number {
  return Math.floor(date.getTime() / 1000) - 946684800;
}

function fromRippleTime(value: number): Date {
  return new Date((value + 946684800) * 1000);
}

export interface EscrowConditionPackage {
  condition: string;
  fulfillment: string;
  preimage: string;
}

export interface CreateCollateralEscrowArgs {
  destination: string;
  currency: string;
  issuer: string;
  amount: string;
  condition: string;
  cancelAfter: Date;
}

export interface CreateCollateralEscrowResult {
  escrowSequence: number;
  txHash: string;
}

export interface EscrowObject {
  owner: string;
  sequence: number;
  destination: string;
  amount: {
    currency: string;
    issuer: string;
    value: string;
  };
  condition: string | null;
  cancelAfter: Date | null;
}

export interface VerifyEscrowExpected {
  owner: string;
  destination: string;
  sequence: number;
  currency: string;
  issuer: string;
  amount: string;
  condition?: string;
}

export function generateConditionFulfillment(): EscrowConditionPackage {
  const preimageBytes = randomBytes(32);
  const preimage = toHex(preimageBytes);
  const digest = createHash('sha256').update(preimageBytes).digest('hex').toUpperCase();
  const condition = `A0258020${digest}810120`;
  const fulfillment = `A0228020${preimage}`;
  return { condition, fulfillment, preimage };
}

export function verifyConditionFulfillment(
  condition: string,
  fulfillment: string,
  preimage: string
): { valid: boolean; reason?: string } {
  const normalizedPreimage = normalizeHex(preimage);
  const normalizedCondition = normalizeHex(condition);
  const normalizedFulfillment = normalizeHex(fulfillment);

  if (!/^[0-9A-F]{64}$/.test(normalizedPreimage)) {
    return { valid: false, reason: 'Preimage must be 32-byte hex' };
  }

  const expectedDigest = createHash('sha256')
    .update(Buffer.from(normalizedPreimage, 'hex'))
    .digest('hex')
    .toUpperCase();
  const expectedCondition = `A0258020${expectedDigest}810120`;
  const expectedFulfillment = `A0228020${normalizedPreimage}`;

  if (normalizedCondition !== expectedCondition) {
    return { valid: false, reason: 'Condition does not match preimage digest' };
  }

  if (normalizedFulfillment !== expectedFulfillment) {
    return { valid: false, reason: 'Fulfillment does not match preimage' };
  }

  return { valid: true };
}

export async function createCollateralEscrow(
  wallet: Wallet,
  args: CreateCollateralEscrowArgs
): Promise<CreateCollateralEscrowResult> {
  const client = await getClient();
  const tx = await client.submitAndWait(
    {
      TransactionType: 'EscrowCreate',
      Account: wallet.address,
      Destination: args.destination,
      Amount: {
        currency: args.currency,
        issuer: args.issuer,
        value: args.amount,
      },
      Condition: normalizeHex(args.condition),
      CancelAfter: toRippleTime(args.cancelAfter),
    } as never,
    { wallet }
  );

  const result = tx.result as unknown as MaybeRecord;
  const meta = isRecord(result.meta) ? result.meta : null;
  const txResult = getResultCode(meta);

  if (txResult !== 'tesSUCCESS') {
    throw new Error(`EscrowCreate failed (${txResult ?? 'unknown'})`);
  }

  const sequence = (result.tx_json as { Sequence?: unknown } | undefined)?.Sequence;
  if (typeof sequence !== 'number') {
    throw new Error('EscrowCreate response missing transaction sequence');
  }

  if (typeof result.hash !== 'string') {
    throw new Error('EscrowCreate response missing transaction hash');
  }

  return {
    escrowSequence: sequence,
    txHash: result.hash,
  };
}

export async function getEscrowInfo(
  client: Client,
  args: { owner: string; sequence: number }
): Promise<EscrowObject | null> {
  try {
    const response = (await client.request({
      command: 'ledger_entry',
      escrow: {
        owner: args.owner,
        seq: args.sequence,
      },
    } as never)) as unknown as { result?: { node?: unknown } };

    const node = response.result?.node;
    if (!isRecord(node)) {
      return null;
    }

    const amountRaw = node.Amount;
    if (!isRecord(amountRaw)) {
      return null;
    }

    const currency = typeof amountRaw.currency === 'string' ? amountRaw.currency : '';
    const issuer = typeof amountRaw.issuer === 'string' ? amountRaw.issuer : '';
    const value = typeof amountRaw.value === 'string' ? amountRaw.value : '';

    if (!currency || !issuer || !value) {
      return null;
    }

    const owner = typeof node.Account === 'string' ? node.Account : '';
    const destination = typeof node.Destination === 'string' ? node.Destination : '';
    const sequence = typeof node.OfferSequence === 'number' ? node.OfferSequence : args.sequence;
    const condition = typeof node.Condition === 'string' ? normalizeHex(node.Condition) : null;
    const cancelAfterValue = typeof node.CancelAfter === 'number' ? node.CancelAfter : null;

    if (!owner || !destination) {
      return null;
    }

    return {
      owner,
      sequence,
      destination,
      amount: {
        currency,
        issuer,
        value,
      },
      condition,
      cancelAfter: cancelAfterValue === null ? null : fromRippleTime(cancelAfterValue),
    };
  } catch {
    return null;
  }
}

export function verifyEscrowMatchesExpected(
  escrow: EscrowObject,
  expected: VerifyEscrowExpected
): { valid: boolean; reason?: string } {
  if (escrow.owner !== expected.owner) {
    return { valid: false, reason: 'Escrow owner mismatch' };
  }

  if (escrow.destination !== expected.destination) {
    return { valid: false, reason: 'Escrow destination mismatch' };
  }

  if (escrow.sequence !== expected.sequence) {
    return { valid: false, reason: 'Escrow sequence mismatch' };
  }

  if (escrow.amount.currency.toUpperCase() !== expected.currency.toUpperCase()) {
    return { valid: false, reason: 'Escrow currency mismatch' };
  }

  if (escrow.amount.issuer !== expected.issuer) {
    return { valid: false, reason: 'Escrow issuer mismatch' };
  }

  if (Number(escrow.amount.value) !== Number(expected.amount)) {
    return { valid: false, reason: 'Escrow amount mismatch' };
  }

  if (expected.condition) {
    const normalizedExpected = normalizeHex(expected.condition);
    if (!escrow.condition || escrow.condition !== normalizedExpected) {
      return { valid: false, reason: 'Escrow condition mismatch' };
    }
  }

  return { valid: true };
}

export async function finishEscrow(
  wallet: Wallet,
  args: { owner: string; sequence: number; fulfillment: string; condition?: string }
): Promise<{ txHash: string }> {
  const client = await getClient();
  const txPayload: Record<string, unknown> = {
    TransactionType: 'EscrowFinish',
    Account: wallet.address,
    Owner: args.owner,
    OfferSequence: args.sequence,
    Fulfillment: normalizeHex(args.fulfillment),
  };

  if (args.condition) {
    txPayload.Condition = normalizeHex(args.condition);
  }

  const tx = await client.submitAndWait(
    txPayload as never,
    { wallet }
  );

  const result = tx.result as unknown as MaybeRecord;
  const meta = isRecord(result.meta) ? result.meta : null;
  const txResult = getResultCode(meta);

  if (txResult !== 'tesSUCCESS') {
    throw new Error(`EscrowFinish failed (${txResult ?? 'unknown'})`);
  }

  if (typeof result.hash !== 'string') {
    throw new Error('EscrowFinish response missing transaction hash');
  }

  return { txHash: result.hash };
}

export async function cancelEscrow(
  wallet: Wallet,
  args: { owner: string; sequence: number }
): Promise<{ txHash: string }> {
  const client = await getClient();
  const tx = await client.submitAndWait(
    {
      TransactionType: 'EscrowCancel',
      Account: wallet.address,
      Owner: args.owner,
      OfferSequence: args.sequence,
    } as never,
    { wallet }
  );

  const result = tx.result as unknown as MaybeRecord;
  const meta = isRecord(result.meta) ? result.meta : null;
  const txResult = getResultCode(meta);

  if (txResult !== 'tesSUCCESS') {
    throw new Error(`EscrowCancel failed (${txResult ?? 'unknown'})`);
  }

  if (typeof result.hash !== 'string') {
    throw new Error('EscrowCancel response missing transaction hash');
  }

  return { txHash: result.hash };
}
