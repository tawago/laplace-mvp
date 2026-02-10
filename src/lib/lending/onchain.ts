/**
 * On-chain Transaction Helper
 *
 * Provides idempotent upsert for XRPL transactions using Drizzle ORM.
 * Used for replay protection and reconciliation.
 */

import { eq } from 'drizzle-orm';
import { db, onchainTransactions, OnchainTransaction } from '../db';

export interface TransactionData {
  txHash: string;
  ledgerIndex?: number | null;
  validated: boolean;
  txResult?: string | null;
  txType: string;
  sourceAddress?: string | null;
  destinationAddress?: string | null;
  currency?: string | null;
  issuer?: string | null;
  amount?: number | null;
  rawTxJson: Record<string, unknown>;
  rawMetaJson?: Record<string, unknown> | null;
}

// Legacy row format for compatibility
export interface OnchainTransactionRow {
  id: string;
  tx_hash: string;
  ledger_index: number | null;
  validated: number;
  tx_result: string | null;
  tx_type: string;
  source_address: string | null;
  destination_address: string | null;
  currency: string | null;
  issuer: string | null;
  amount: number | null;
  observed_at: string;
  raw_tx_json: string;
  raw_meta_json: string | null;
}

function toRow(tx: OnchainTransaction): OnchainTransactionRow {
  return {
    id: tx.id,
    tx_hash: tx.txHash,
    ledger_index: tx.ledgerIndex,
    validated: tx.validated ? 1 : 0,
    tx_result: tx.txResult,
    tx_type: tx.txType,
    source_address: tx.sourceAddress,
    destination_address: tx.destinationAddress,
    currency: tx.currency,
    issuer: tx.issuer,
    amount: tx.amount ? parseFloat(tx.amount) : null,
    observed_at: tx.observedAt.toISOString(),
    raw_tx_json: JSON.stringify(tx.rawTxJson),
    raw_meta_json: tx.rawMetaJson ? JSON.stringify(tx.rawMetaJson) : null,
  };
}

/**
 * Upsert an on-chain transaction record
 *
 * Uses tx_hash uniqueness for idempotency.
 * Returns the existing record if tx_hash already exists.
 */
export async function upsertOnchainTransaction(data: TransactionData): Promise<OnchainTransactionRow> {
  // Check if transaction already exists
  const existing = await db.query.onchainTransactions.findFirst({
    where: eq(onchainTransactions.txHash, data.txHash),
  });

  if (existing) {
    // Update if we now have more information (e.g., validated status changed)
    if (!existing.validated && data.validated) {
      const [updated] = await db
        .update(onchainTransactions)
        .set({
          validated: data.validated,
          ledgerIndex: data.ledgerIndex ?? existing.ledgerIndex,
          txResult: data.txResult ?? existing.txResult,
          rawMetaJson: data.rawMetaJson ?? existing.rawMetaJson,
          observedAt: new Date(),
        })
        .where(eq(onchainTransactions.txHash, data.txHash))
        .returning();

      return toRow(updated);
    }

    return toRow(existing);
  }

  // Create new record
  const [newTx] = await db
    .insert(onchainTransactions)
    .values({
      txHash: data.txHash,
      ledgerIndex: data.ledgerIndex ?? null,
      validated: data.validated,
      txResult: data.txResult ?? null,
      txType: data.txType,
      sourceAddress: data.sourceAddress ?? null,
      destinationAddress: data.destinationAddress ?? null,
      currency: data.currency ?? null,
      issuer: data.issuer ?? null,
      amount: data.amount?.toString() ?? null,
      rawTxJson: data.rawTxJson,
      rawMetaJson: data.rawMetaJson ?? null,
    })
    .returning();

  return toRow(newTx);
}

/**
 * Get transaction by hash
 */
export async function getTransactionByHash(txHash: string): Promise<OnchainTransactionRow | null> {
  const tx = await db.query.onchainTransactions.findFirst({
    where: eq(onchainTransactions.txHash, txHash),
  });

  return tx ? toRow(tx) : null;
}

/**
 * Check if a transaction hash has already been processed
 * Used for replay protection
 */
export async function isTransactionProcessed(txHash: string): Promise<boolean> {
  const tx = await db.query.onchainTransactions.findFirst({
    where: eq(onchainTransactions.txHash, txHash),
    columns: { id: true },
  });
  return !!tx;
}

/**
 * Get transactions for an address (as destination)
 */
export async function getTransactionsForAddress(
  address: string,
  limit: number = 50
): Promise<OnchainTransactionRow[]> {
  const results = await db.query.onchainTransactions.findMany({
    where: eq(onchainTransactions.destinationAddress, address),
    orderBy: (tx, { desc }) => [desc(tx.observedAt)],
    limit,
  });

  return results.map(toRow);
}
