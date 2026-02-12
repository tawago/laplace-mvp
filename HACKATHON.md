# Laplace: Credit Infrastructure for Real-World Assets

Laplace builds the credit layer for RWA by turning real estate assets into reusable collateral on the XRP Ledger.

## The Problem: The Collateral Certainty Gap

- Cross-border real estate RWA has demand, but collateral usability remains limited after purchase.
- Lenders need deterministic answers to three questions before extending credit:
  1. Is this collateral already pledged?
  2. Can we prove state transitions over time?
  3. Can compliance and risk teams independently audit decisions?
- Existing workflows are fragmented across legal documents, local custodians, and disconnected systems.

## The Solution: On-Chain Collateral State Registry + Off-Chain Governance

Laplace separates concerns:

- **Off-chain governance layer** handles legal, policy, and institutional controls.
- **XRPL layer** records settlement and collateral-related state transitions with immutable timestamps.
- **Service layer** enforces LTV, liquidation, idempotency, and operational checks.

### System View

```text
Borrower Wallet / Lender Wallet
      |                  |
      | XRPL Payment     | XRPL Payment
      v                  v
  +-----------------------------+
  |         XRP Ledger          |
  | (Payment + Trust Lines)     |
  +-----------------------------+
              |
              | tx hash verification + settlement status
              v
  +-----------------------------+
  |       Laplace API Layer     |
  | /deposit /borrow /repay ... |
  +-----------------------------+
              |
              | risk checks + state machine + idempotency
              v
  +-----------------------------+
  |   Lending Service + DB      |
  | positions/events/onchain_tx |
  +-----------------------------+
```

## Why XRP Ledger

- Fast finality and low transaction costs for frequent collateral and loan state updates.
- Native issued-token model and trust lines for RWA/debt token flows.
- Public, timestamped transaction records for independent auditability.
- Production-oriented payment semantics, including delivered amount verification.

Reference implementation points:

- Transaction verification pattern: `src/lib/xrpl/tokens.ts`
- Core lending orchestration: `src/lib/lending/service.ts`
- Financial calculations: `src/lib/lending/calculations.ts`

## Live Demo (Devnet Evidence)

Replace placeholders below with your final devnet hashes and explorer links.

| Step | What happened | Tx hash | Explorer |
|---|---|---|---|
| 1 | Borrower deposits collateral | `TODO_DEPOSIT_HASH` | `https://devnet.xrpl.org/transactions/TODO_DEPOSIT_HASH` |
| 2 | Protocol confirms and records position | `TODO_DEPOSIT_HASH` | `https://devnet.xrpl.org/transactions/TODO_DEPOSIT_HASH` |
| 3 | Borrow executes and debt tokens are sent | `TODO_BORROW_HASH` | `https://devnet.xrpl.org/transactions/TODO_BORROW_HASH` |
| 4 | Repayment transaction is verified | `TODO_REPAY_HASH` | `https://devnet.xrpl.org/transactions/TODO_REPAY_HASH` |
| 5 | Collateral withdrawal (or liquidation test) | `TODO_WITHDRAW_OR_LIQ_HASH` | `https://devnet.xrpl.org/transactions/TODO_WITHDRAW_OR_LIQ_HASH` |

## Technical Architecture

### Lending Operations

- Deposit/Repay/Supply: user submits XRPL `Payment` first, then API verifies tx hash and applies state update.
- Borrow/Withdraw/Collect Yield/Withdraw Supply: service executes checks and sends outbound `Payment` from backend wallet.
- Liquidation: service scans unhealthy positions and applies deterministic liquidation rules.

Core handlers:

- `src/app/api/lending/deposit/route.ts`
- `src/app/api/lending/borrow/route.ts`
- `src/app/api/lending/repay/route.ts`
- `src/app/api/lending/withdraw/route.ts`
- `src/app/api/lending/liquidate/route.ts`

### State and Auditability

- Position state persists in `positions` and `supply_positions`.
- On-chain evidence persists in `onchain_transactions`.
- Application lifecycle and idempotency state persist in `app_events`.

Schema source of truth:

- `src/lib/db/schema.ts`

## Regulatory and Operating Model (MVP Framing)

- **Japan side:** Distribution through Type II Financial Instruments Business licensed partner framework.
- **UAE side:** Custody/liquidation under licensed operating partners (VARA-aligned model).
- **Laplace role:** Infrastructure and state coordination layer, not direct retail solicitation.

This framing is aligned for institutional pilots and committee review (risk/compliance/operations).

## Traction Snapshot

- USD 500M+ real estate pipeline (project-provided figure).
- Distribution partnership with approximately 50K users (project-provided figure).
- MVP demonstrates collateralized credit lifecycle on XRPL devnet with verifiable transactions.

## Getting Started

### Requirements

- Node.js + pnpm
- Neon Postgres database
- XRPL devnet wallet seeds/addresses

### Environment Variables

Set in `.env.local`:

```env
DATABASE_URL=...
BACKEND_WALLET_SEED=...
ISSUER_WALLET_SEED=...
BACKEND_ADDRESS=...
ISSUER_ADDRESS=...
NEXT_PUBLIC_XRPL_WS_URL=wss://s.devnet.rippletest.net:51233
NEXT_PUBLIC_XRPL_EXPLORER_URL=https://devnet.xrpl.org
XRPL_STORE_FULL_TX_JSON=false
```

### Run

```bash
pnpm install
pnpm setup:all
pnpm dev
```

Default local URL: `https://localhost:3001`

### Useful API Endpoints

- `GET /api/lending/config`
- `POST /api/lending/deposit`
- `POST /api/lending/borrow`
- `POST /api/lending/repay`
- `POST /api/lending/withdraw`
- `POST /api/lending/liquidate`
- `GET /api/lending/position?userAddress=...&marketId=...`

## Project Positioning

Laplace is not a peer-to-peer lending app. It is credit infrastructure focused on collateral certainty for institutions dealing with cross-border RWA.
