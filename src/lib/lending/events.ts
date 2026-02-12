/**
 * App Event Emitter
 *
 * Unified audit trail for all app interactions using Drizzle ORM.
 * Used for debugging, analytics, and compliance.
 */

import { eq, desc } from 'drizzle-orm';
import { db, appEvents, AppEvent } from '../db';
import { EventModule, EventStatus } from './types';

// Legacy row format for compatibility
export interface AppEventRow {
  id: string;
  event_type: string;
  module: EventModule;
  status: EventStatus;
  user_address: string | null;
  market_id: string | null;
  position_id: string | null;
  onchain_tx_id: string | null;
  idempotency_key: string | null;
  amount: number | null;
  currency: string | null;
  error_code: string | null;
  error_message: string | null;
  payload: string;
  created_at: string;
  updated_at: string;
}

function toRow(event: AppEvent): AppEventRow {
  return {
    id: event.id,
    event_type: event.eventType,
    module: event.module as EventModule,
    status: event.status as EventStatus,
    user_address: event.userAddress,
    market_id: event.marketId,
    position_id: event.positionId,
    onchain_tx_id: event.onchainTxId,
    idempotency_key: event.idempotencyKey,
    amount: event.amount ? parseFloat(event.amount) : null,
    currency: event.currency,
    error_code: event.errorCode,
    error_message: event.errorMessage,
    payload: JSON.stringify(event.payload ?? {}),
    created_at: event.createdAt.toISOString(),
    updated_at: event.updatedAt.toISOString(),
  };
}

export interface EmitEventParams {
  eventType: string;
  module: EventModule;
  status: EventStatus;
  userAddress?: string | null;
  marketId?: string | null;
  positionId?: string | null;
  onchainTxId?: string | null;
  idempotencyKey?: string | null;
  amount?: number | null;
  currency?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Emit an app event
 *
 * If idempotencyKey is provided and an event with that key exists,
 * returns the existing event without creating a new one.
 */
export async function emitAppEvent(params: EmitEventParams): Promise<AppEventRow> {
  // Check for idempotency
  if (params.idempotencyKey) {
    const existing = await db.query.appEvents.findFirst({
      where: eq(appEvents.idempotencyKey, params.idempotencyKey),
    });

    if (existing) {
      return toRow(existing);
    }
  }

  const [newEvent] = await db
    .insert(appEvents)
    .values({
      eventType: params.eventType,
      module: params.module,
      status: params.status,
      userAddress: params.userAddress ?? null,
      marketId: params.marketId ?? null,
      positionId: params.positionId ?? null,
      onchainTxId: params.onchainTxId ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
      amount: params.amount?.toString() ?? null,
      currency: params.currency ?? null,
      errorCode: params.errorCode ?? null,
      errorMessage: params.errorMessage ?? null,
      payload: params.payload ?? {},
    })
    .returning();

  return toRow(newEvent);
}

/**
 * Update an event's status
 */
export async function updateEventStatus(
  eventId: string,
  status: EventStatus,
  error?: { code: string; message: string }
): Promise<void> {
  await db
    .update(appEvents)
    .set({
      status,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null,
      updatedAt: new Date(),
    })
    .where(eq(appEvents.id, eventId));
}

/**
 * Get events for a user address
 */
export async function getEventsForUser(userAddress: string, limit: number = 50): Promise<AppEventRow[]> {
  const results = await db.query.appEvents.findMany({
    where: eq(appEvents.userAddress, userAddress),
    orderBy: [desc(appEvents.createdAt)],
    limit,
  });

  return results.map(toRow);
}

/**
 * Get events for a position
 */
export async function getEventsForPosition(positionId: string, limit: number = 50): Promise<AppEventRow[]> {
  const results = await db.query.appEvents.findMany({
    where: eq(appEvents.positionId, positionId),
    orderBy: [desc(appEvents.createdAt)],
    limit,
  });

  return results.map(toRow);
}

/**
 * Get events by module
 */
export async function getEventsByModule(
  module: EventModule,
  limit: number = 100,
  offset: number = 0
): Promise<AppEventRow[]> {
  const results = await db.query.appEvents.findMany({
    where: eq(appEvents.module, module),
    orderBy: [desc(appEvents.createdAt)],
    limit,
    offset,
  });

  return results.map(toRow);
}

/**
 * Get event by idempotency key
 */
export async function getEventByIdempotencyKey(key: string): Promise<AppEventRow | null> {
  const event = await db.query.appEvents.findFirst({
    where: eq(appEvents.idempotencyKey, key),
  });

  return event ? toRow(event) : null;
}

// ============================================================
// Atomic Idempotency Helpers
// ============================================================

export interface IdempotencyAcquireResult {
  acquired: boolean;
  event: AppEventRow;
  status: 'NEW' | 'PENDING' | 'COMPLETED' | 'FAILED';
}

export interface IdempotencyIdentity {
  eventType: string;
  userAddress: string;
  marketId: string;
}

/**
 * Atomically acquire an idempotency key or return existing event.
 * Uses INSERT ON CONFLICT to prevent races.
 */
export async function acquireIdempotencyKey(
  params: EmitEventParams & { idempotencyKey: string }
): Promise<IdempotencyAcquireResult> {
  // Atomic insert with conflict handling
  const [inserted] = await db
    .insert(appEvents)
    .values({
      eventType: params.eventType,
      module: params.module,
      status: params.status,
      userAddress: params.userAddress ?? null,
      marketId: params.marketId ?? null,
      positionId: params.positionId ?? null,
      onchainTxId: params.onchainTxId ?? null,
      idempotencyKey: params.idempotencyKey,
      amount: params.amount?.toString() ?? null,
      currency: params.currency ?? null,
      errorCode: params.errorCode ?? null,
      errorMessage: params.errorMessage ?? null,
      payload: params.payload ?? {},
    })
    .onConflictDoNothing({ target: appEvents.idempotencyKey })
    .returning();

  if (inserted) {
    // Successfully acquired the key
    return {
      acquired: true,
      event: toRow(inserted),
      status: 'NEW',
    };
  }

  // Key already exists - fetch existing event
  const existing = await db.query.appEvents.findFirst({
    where: eq(appEvents.idempotencyKey, params.idempotencyKey),
  });

  if (!existing) {
    // Should not happen, but handle gracefully
    throw new Error('Idempotency conflict but no existing event found');
  }

  return {
    acquired: false,
    event: toRow(existing),
    status: existing.status as 'PENDING' | 'COMPLETED' | 'FAILED',
  };
}

/**
 * Validate that an existing idempotency event matches the current operation.
 */
export function validateIdempotencyIdentity(
  event: AppEventRow,
  expected: IdempotencyIdentity
): boolean {
  return (
    event.event_type === expected.eventType &&
    event.user_address === expected.userAddress &&
    event.market_id === expected.marketId
  );
}

/**
 * Complete an idempotency event with result payload.
 */
export async function completeIdempotencyEvent(
  eventId: string,
  result: Record<string, unknown>
): Promise<void> {
  await db
    .update(appEvents)
    .set({
      status: 'COMPLETED',
      payload: result,
      updatedAt: new Date(),
    })
    .where(eq(appEvents.id, eventId));
}
