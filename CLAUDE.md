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
```

## Project Overview

This is a **HotelToken** mock mobile web app - a frontend-only Next.js application showcasing hotel room tokenization for two Malaysian hotels: THE SAIL and NYRA. The app simulates token purchase flows without any backend, wallet integration, or blockchain functionality.

## Architecture

### Tech Stack
- **Next.js 15.3.2** with App Router
- **TypeScript** with strict mode
- **Tailwind CSS v4** with CSS variables
- **shadcn/ui** components (new-york style)
- **Lucide React** for icons

### Key Routes
- `/` - Landing page with hero and hotel highlights
- `/discover` - Hotel catalog with filters
- `/hotel/[id]` - Individual hotel pages (the-sail, nyra)
- `/portfolio` - Mock wallet/portfolio view
- `/about` - Company information

### Data Structure
Hotels and units are defined in mock JSON format with:
- Hotel info: id, name, location, ROI, buyback terms
- Unit types: type designation (A, B, C, etc.), size, price, token count

### Component Architecture
Uses shadcn/ui components including:
- `HotelCard` - Hotel listing cards
- `StatBar` - Key metrics display
- `UnitSheet` - Token purchase interface
- `CheckoutDialog` - Purchase confirmation
- `TokenTable` - Portfolio display

### Important Notes
- All data is mock/static - no real transactions
- No authentication or user management
- State is client-side only (no persistence)
- Images referenced should be placed in `/public/images/`