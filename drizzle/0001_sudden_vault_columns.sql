ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "supply_vault_id" text;
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "supply_mpt_issuance_id" text;
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "vault_scale" integer DEFAULT 6 NOT NULL;
