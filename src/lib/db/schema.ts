/**
 * Drizzle ORM Schema for Neon Postgres
 *
 * This is the single source of truth for the database schema.
 * Uses Postgres-native types: numeric, jsonb, timestamptz, boolean.
 */

import {
  pgTable,
  pgEnum,
  text,
  uuid,
  numeric,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
  unique,
} from 'drizzle-orm/pg-core';

// Enums
export const positionStatusEnum = pgEnum('position_status', ['ACTIVE', 'LIQUIDATED', 'CLOSED']);
export const supplyPositionStatusEnum = pgEnum('supply_position_status', ['ACTIVE', 'CLOSED']);
export const eventModuleEnum = pgEnum('event_module', ['SWAP', 'LENDING', 'FAUCET', 'TRUST', 'SYSTEM']);
export const eventStatusEnum = pgEnum('event_status', ['PENDING', 'COMPLETED', 'FAILED']);
export const assetSideEnum = pgEnum('asset_side', ['COLLATERAL', 'DEBT']);

// Users table
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    xrplAddress: text('xrpl_address').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxUsersXrplAddress: index('idx_users_xrpl_address').on(table.xrplAddress),
  })
);

// Markets table
export const markets = pgTable(
  'markets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    collateralCurrency: text('collateral_currency').notNull(),
    collateralIssuer: text('collateral_issuer').notNull(),
    debtCurrency: text('debt_currency').notNull(),
    debtIssuer: text('debt_issuer').notNull(),
    maxLtvRatio: numeric('max_ltv_ratio', { precision: 10, scale: 6 }).notNull(),
    liquidationLtvRatio: numeric('liquidation_ltv_ratio', { precision: 10, scale: 6 }).notNull(),
    baseInterestRate: numeric('base_interest_rate', { precision: 10, scale: 6 }).notNull(),
    liquidationPenalty: numeric('liquidation_penalty', { precision: 10, scale: 6 }).notNull(),
    minCollateralAmount: numeric('min_collateral_amount', { precision: 20, scale: 8 }).notNull(),
    minBorrowAmount: numeric('min_borrow_amount', { precision: 20, scale: 8 }).notNull(),
    minSupplyAmount: numeric('min_supply_amount', { precision: 20, scale: 8 }).notNull().default('5'),
    supplyVaultId: text('supply_vault_id'),
    supplyMptIssuanceId: text('supply_mpt_issuance_id'),
    loanBrokerId: text('loan_broker_id'),
    loanBrokerAddress: text('loan_broker_address'),
    vaultScale: integer('vault_scale').notNull().default(6),
    totalSupplied: numeric('total_supplied', { precision: 20, scale: 8 }).notNull().default('0'),
    totalBorrowed: numeric('total_borrowed', { precision: 20, scale: 8 }).notNull().default('0'),
    globalYieldIndex: numeric('global_yield_index', { precision: 20, scale: 18 }).notNull().default('1.0'),
    lastIndexUpdate: timestamp('last_index_update', { withTimezone: true }).notNull().defaultNow(),
    reserveFactor: numeric('reserve_factor', { precision: 10, scale: 6 }).notNull().default('0.1'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxMarketsName: index('idx_markets_name').on(table.name),
    idxMarketsIsActive: index('idx_markets_is_active').on(table.isActive),
  })
);

// Supply positions table
export const supplyPositions = pgTable(
  'supply_positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    marketId: uuid('market_id')
      .notNull()
      .references(() => markets.id),
    status: supplyPositionStatusEnum('status').notNull().default('ACTIVE'),
    supplyAmount: numeric('supply_amount', { precision: 20, scale: 8 }).notNull().default('0'),
    yieldIndex: numeric('yield_index', { precision: 20, scale: 18 }).notNull().default('1.0'),
    lastYieldUpdate: timestamp('last_yield_update', { withTimezone: true }).notNull().defaultNow(),
    suppliedAt: timestamp('supplied_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    supplyPositionsUserMarketUnique: unique('supply_positions_user_market_unique').on(
      table.userId,
      table.marketId
    ),
    idxSupplyPositionsMarketStatus: index('idx_supply_positions_market_status').on(
      table.marketId,
      table.status
    ),
    idxSupplyPositionsUserStatus: index('idx_supply_positions_user_status').on(table.userId, table.status),
  })
);

// Positions table
export const positions = pgTable(
  'positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    marketId: uuid('market_id')
      .notNull()
      .references(() => markets.id),
    status: positionStatusEnum('status').notNull().default('ACTIVE'),
    collateralAmount: numeric('collateral_amount', { precision: 20, scale: 8 }).notNull().default('0'),
    loanPrincipal: numeric('loan_principal', { precision: 20, scale: 8 }).notNull().default('0'),
    interestAccrued: numeric('interest_accrued', { precision: 20, scale: 8 }).notNull().default('0'),
    lastInterestUpdate: timestamp('last_interest_update', { withTimezone: true }).notNull().defaultNow(),
    interestRateAtOpen: numeric('interest_rate_at_open', { precision: 10, scale: 6 }).notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    liquidatedAt: timestamp('liquidated_at', { withTimezone: true }),
    escrowOwner: text('escrow_owner'),
    escrowSequence: integer('escrow_sequence'),
    escrowCondition: text('escrow_condition'),
    escrowFulfillment: text('escrow_fulfillment'),
    escrowPreimage: text('escrow_preimage'),
    escrowCancelAfter: timestamp('escrow_cancel_after', { withTimezone: true }),
    loanId: text('loan_id'),
    loanHash: text('loan_hash'),
    loanTermMonths: integer('loan_term_months').notNull().default(3),
    loanMaturityDate: timestamp('loan_maturity_date', { withTimezone: true }),
    loanOpenedAtLedgerIndex: integer('loan_opened_at_ledger_index'),
  },
  (table) => ({
    positionsUserMarketUnique: unique('positions_user_market_unique').on(table.userId, table.marketId),
    idxPositionsUserMarket: index('idx_positions_user_market').on(table.userId, table.marketId),
    idxPositionsStatus: index('idx_positions_status').on(table.status),
    idxPositionsMarketStatus: index('idx_positions_market_status').on(table.marketId, table.status),
  })
);

// On-chain transactions table
export const onchainTransactions = pgTable(
  'onchain_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    txHash: text('tx_hash').notNull().unique(),
    ledgerIndex: integer('ledger_index'),
    validated: boolean('validated').notNull(),
    txResult: text('tx_result'),
    txType: text('tx_type').notNull(),
    sourceAddress: text('source_address'),
    destinationAddress: text('destination_address'),
    currency: text('currency'),
    issuer: text('issuer'),
    amount: numeric('amount', { precision: 20, scale: 8 }),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
    rawTxJson: jsonb('raw_tx_json').notNull(),
    rawMetaJson: jsonb('raw_meta_json'),
  },
  (table) => ({
    idxOnchainTxHash: index('idx_onchain_tx_hash').on(table.txHash),
    idxOnchainTxDestObserved: index('idx_onchain_tx_dest_observed').on(
      table.destinationAddress,
      table.observedAt
    ),
  })
);

// App events table
export const appEvents = pgTable(
  'app_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    module: eventModuleEnum('module').notNull(),
    status: eventStatusEnum('status').notNull(),
    userId: uuid('user_id').references(() => users.id),
    userAddress: text('user_address'),
    marketId: uuid('market_id').references(() => markets.id),
    positionId: uuid('position_id').references(() => positions.id),
    onchainTxId: uuid('onchain_tx_id').references(() => onchainTransactions.id),
    idempotencyKey: text('idempotency_key').unique(),
    amount: numeric('amount', { precision: 20, scale: 8 }),
    currency: text('currency'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxAppEventsModuleCreated: index('idx_app_events_module_created').on(table.module, table.createdAt),
    idxAppEventsUserAddressCreated: index('idx_app_events_user_address_created').on(
      table.userAddress,
      table.createdAt
    ),
    idxAppEventsPositionCreated: index('idx_app_events_position_created').on(
      table.positionId,
      table.createdAt
    ),
    idxAppEventsIdempotency: index('idx_app_events_idempotency').on(table.idempotencyKey),
  })
);

// Price oracle table
export const priceOracle = pgTable(
  'price_oracle',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    marketId: uuid('market_id')
      .notNull()
      .references(() => markets.id),
    assetSide: assetSideEnum('asset_side').notNull(),
    priceUsd: numeric('price_usd', { precision: 20, scale: 8 }).notNull(),
    source: text('source').notNull().default('MOCK'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    priceOracleMarketSideUnique: unique('price_oracle_market_side_unique').on(
      table.marketId,
      table.assetSide
    ),
    idxPriceOracleMarketSide: index('idx_price_oracle_market_side').on(table.marketId, table.assetSide),
  })
);

// Type exports for use in application code
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Market = typeof markets.$inferSelect;
export type NewMarket = typeof markets.$inferInsert;

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;

export type SupplyPosition = typeof supplyPositions.$inferSelect;
export type NewSupplyPosition = typeof supplyPositions.$inferInsert;

export type OnchainTransaction = typeof onchainTransactions.$inferSelect;
export type NewOnchainTransaction = typeof onchainTransactions.$inferInsert;

export type AppEvent = typeof appEvents.$inferSelect;
export type NewAppEvent = typeof appEvents.$inferInsert;

export type PriceOracleRow = typeof priceOracle.$inferSelect;
export type NewPriceOracleRow = typeof priceOracle.$inferInsert;
