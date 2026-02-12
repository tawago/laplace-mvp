based on plan: ~/.claude-work/plans/federated-wandering-perlis.md

# Laplace Technical Architecture

This document is a protocol-focused deep dive for XRPL technical evaluators and engineering reviewers.

## 1) Design Philosophy

- XRPL is used as a settlement and verification layer, not as a full business-logic execution environment.
- Business rules (risk checks, policy, idempotency, lifecycle controls) run in a deterministic service layer.
- On-chain transactions and off-chain state are linked by tx hash and event records for end-to-end auditability.

## 2) Component Architecture

```text
Clients (Borrower / Lender UI)
      |
      v
Next.js API routes (App Router)
      |
      v
Lending service orchestration
  - validation
  - idempotency
  - risk & liquidation logic
      |
      +------------------------------+
      |                              |
      v                              v
XRPL client + wallet ops         Neon Postgres (Drizzle)
  - tx verify/send               - users
  - trust line checks            - markets
                                 - positions / supply_positions
                                 - onchain_transactions
                                 - app_events
                                 - price_oracle
```

Key files:

- `src/lib/lending/service.ts`
- `src/lib/lending/events.ts`
- `src/lib/lending/calculations.ts`
- `src/lib/xrpl/tokens.ts`
- `src/lib/db/schema.ts`

## 3) XRPL Integration Patterns

### 3.1 Transaction primitives

- Uses XRPL `Payment` transactions for token movement and settlement evidence.
- Uses trust lines to gate issued-token receive paths.
- Uses tx-hash lookup (`command: tx`) for verification before mutating lending state.

### 3.2 Delivered amount handling

`verifyTransaction` in `src/lib/xrpl/tokens.ts` follows this priority:

1. `meta.delivered_amount` (if available)
2. `result.delivered_amount` fallback
3. transaction `Amount` fallback

This protects accounting accuracy in scenarios where delivered amount differs from nominal payment fields.

### 3.3 Capture modes for tx evidence

- Default mode: stores normalized/minimal fields in `raw_tx_json`.
- Optional full mode (`XRPL_STORE_FULL_TX_JSON=true`): stores full tx payload for forensic analysis.

Implementation: `src/lib/lending/service.ts:121`

## 4) Lending Mechanics

## 4.1 Position lifecycle

```text
OPEN/ACTIVE
  |
  | deposit collateral
  v
ACTIVE (collateral > 0, debt may be 0+)
  |\
  | \ borrow / repay / withdraw
  |  \
  |   +----------------------+
  |                          |
  v                          v
LIQUIDATED               CLOSED (future/manual close path)
```

DB status enum: `ACTIVE | LIQUIDATED | CLOSED` in `src/lib/db/schema.ts`.

## 4.2 Core formulas

Implemented in `src/lib/lending/calculations.ts` with `decimal.js` precision.

- `deltaInterest = principal * annualRate * (elapsedSeconds / 31_536_000)`
- `totalDebt = principal + interestAccrued`
- `ltv = debtUsd / collateralUsd`
- `healthFactor = liquidationLtv / currentLtv`
- Liquidation collateral seizure includes penalty factor.

Rounding and precision are explicitly controlled (token scale and index scale).

## 4.3 Operation pathways

- **Deposit/Repay/Supply**: inbound tx is verified first, then state updates are committed.
- **Borrow/Withdraw/Collect Yield/Withdraw Supply**: service validates constraints, sends outbound tx, then commits state.
- **Liquidation**: scans position health and marks positions as liquidated when thresholds are breached.

Primary orchestration: `src/lib/lending/service.ts`.

## 5) Operational Reliability

### 5.1 Idempotency

- API accepts optional `idempotencyKey` on state-changing operations.
- Atomic key acquisition uses `INSERT ... ON CONFLICT DO NOTHING` semantics.
- Existing keys are validated against operation identity (event type + user + market).

Implementation: `acquireIdempotencyKey` and `validateIdempotencyIdentity` in `src/lib/lending/events.ts`.

### 5.2 Replay protection

- Inbound tx-based flows reject already-processed hashes.
- `onchain_transactions.tx_hash` is unique.

References:

- `src/lib/lending/service.ts`
- `src/lib/db/schema.ts`

### 5.3 Event-sourced audit trail

- Every operation emits `PENDING`, then transitions to `COMPLETED` or `FAILED`.
- Event payload can retain operation results for idempotent replay responses.
- Audit stream is queryable by user, position, and module.

Implementation: `src/lib/lending/events.ts`.

## 6) Database Model

The schema is defined in `src/lib/db/schema.ts`.

### 6.1 Core tables

- `users`: XRPL address identity.
- `markets`: collateral/debt asset pair and risk parameters.
- `positions`: borrower collateral + debt state.
- `supply_positions`: lender principal + yield index state.
- `onchain_transactions`: normalized on-chain evidence.
- `app_events`: lifecycle/audit/idempotency ledger.
- `price_oracle`: collateral/debt pricing inputs for risk checks.

### 6.2 Important constraints

- Unique market position per user (`positions_user_market_unique`).
- Unique supply position per user+market (`supply_positions_user_market_unique`).
- Unique tx hash (`tx_hash`).
- Unique idempotency key (`idempotency_key`).

## 7) API Reference (Current MVP)

## 7.1 Borrower flow endpoints

- `GET /api/lending/config`
- `POST /api/lending/deposit`
- `POST /api/lending/borrow`
- `POST /api/lending/repay`
- `POST /api/lending/withdraw`
- `POST /api/lending/liquidate`
- `GET /api/lending/position?userAddress=...&marketId=...`
- `GET /api/lending/prices?marketId=...`
- `POST /api/lending/prices`

Route implementations:

- `src/app/api/lending/config/route.ts`
- `src/app/api/lending/deposit/route.ts`
- `src/app/api/lending/borrow/route.ts`
- `src/app/api/lending/repay/route.ts`
- `src/app/api/lending/withdraw/route.ts`
- `src/app/api/lending/liquidate/route.ts`
- `src/app/api/lending/position/route.ts`
- `src/app/api/lending/prices/route.ts`

## 7.2 Supplier flow endpoints

- `POST /api/lending/markets/:marketId/supply`
- `POST /api/lending/markets/:marketId/collect-yield`
- `POST /api/lending/markets/:marketId/withdraw-supply`
- `GET /api/lending/markets/:marketId/supply-positions/:lenderAddress`
- `GET /api/lending/lenders/:lenderAddress/supply-positions`

Route implementations:

- `src/app/api/lending/markets/[marketId]/supply/route.ts`
- `src/app/api/lending/markets/[marketId]/collect-yield/route.ts`
- `src/app/api/lending/markets/[marketId]/withdraw-supply/route.ts`
- `src/app/api/lending/markets/[marketId]/supply-positions/[lenderAddress]/route.ts`
- `src/app/api/lending/lenders/[lenderAddress]/supply-positions/route.ts`

### 7.3 Example requests

Deposit verification:

```bash
curl -X POST https://localhost:3001/api/lending/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "txHash": "<XRPL_TX_HASH>",
    "senderAddress": "r...",
    "marketId": "<MARKET_UUID>",
    "idempotencyKey": "deposit-20260211-001"
  }'
```

Borrow execution:

```bash
curl -X POST https://localhost:3001/api/lending/borrow \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "r...",
    "marketId": "<MARKET_UUID>",
    "amount": 100,
    "idempotencyKey": "borrow-20260211-001"
  }'
```

## 8) XRPL Roadmap Alignment

Current implementation is intentionally conservative and stable:

- Today: Payment + Trust Lines with robust verification.
- Near-term: alignment with native lending-related XRPL roadmap items.
- Future: migration path for MPT-based tokenization patterns and privacy enhancements.

Design intent: maintain modular service architecture so protocol-level upgrades can be adopted without rewriting governance and risk orchestration.

Suggested references:

- `https://xrpl.org/resources/known-amendments`
- `https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens`

## 9) Evidence to Attach Before Submission

Add concrete tx evidence in final review pass:

- Deposit tx hash + explorer URL
- Borrow tx hash + explorer URL
- Repay tx hash + explorer URL
- Withdraw or liquidation tx hash + explorer URL
- Optional supplier flow hashes (supply, collect-yield, withdraw-supply)

Template format:

```text
Operation: <name>
Tx Hash: <hash>
Explorer: https://devnet.xrpl.org/transactions/<hash>
Expected effect: <state transition>
```
