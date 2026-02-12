ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "escrow_owner" text;
--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "escrow_sequence" integer;
--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "escrow_condition" text;
--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "escrow_fulfillment" text;
--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "escrow_preimage" text;
--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "escrow_cancel_after" timestamp with time zone;
