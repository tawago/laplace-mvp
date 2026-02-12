# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linting
pnpm lint

# XRPL + DB setup
pnpm setup:testnet
pnpm setup:db
pnpm setup:all

# Drizzle
pnpm db:generate
pnpm db:push
pnpm db:studio
```

## Project Overview

This project is now a hybrid app that combines:

1. The original **Sheng Tai International** hotel tokenization mock UI.
2. An **XRPL testnet lending PoC** for JFIIP application

It includes a real backend/service layer for lending flows (via Next.js API routes), plus Neon Postgres state management through Drizzle.

## Architecture

### Tech Stack
- **Next.js 15.3.2** with App Router
- **TypeScript** with strict mode
- **Tailwind CSS v4** with CSS variables
- **shadcn/ui** components (new-york style)
- **Lucide React** for icons
- **XRPL testnet** integration (`xrpl` package)
- **Neon Postgres + Drizzle ORM** for persistence

### Key Routes
- `/` - Landing page with hotel investment positioning
- `/discover` - Hotel catalog
- `/hotel/[id]` - Hotel detail pages
- `/portfolio` and `/wallet` - Mock portfolio/wallet experiences
- `/lending` - XRPL lending UI (wallet setup, faucet, lending actions)
- `/about`, `/bookings`, `/profile` - Supporting product pages

### API Surface
- `/api/balances`
- `/api/faucet`
- `/api/lending/config`
- `/api/lending/position`
- `/api/lending/deposit`
- `/api/lending/borrow`
- `/api/lending/repay`
- `/api/lending/withdraw`
- `/api/lending/liquidate`
- `/api/lending/prices`

### Data and Service Layers
- Hotel catalog data remains mock/static for UI flows.
- Lending state is persisted in DB tables: `users`, `markets`, `positions`, `onchain_transactions`, `app_events`, `price_oracle`.
- Core lending service lives in `src/lib/lending/service.ts`.
- XRPL helpers live in `src/lib/xrpl/*` (server) and `src/lib/client/xrpl.ts` (client).
- DB schema source of truth: `src/lib/db/schema.ts`.
- Use Neon CLI for investigation

### Important Notes
- Do not remove legacy hotel pages/components unless explicitly requested; they are still used.
- Lending flows execute real XRPL testnet transactions and depend on env configuration.
- `pnpm dev` runs with HTTPS on port `3001`.
- `.env.local` is required for wallet seeds/addresses and `DATABASE_URL`.
- Keep changes compatible with the current hybrid state (mock UI + functional lending backend).
