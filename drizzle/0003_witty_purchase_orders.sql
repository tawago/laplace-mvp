DO $$ BEGIN
 CREATE TYPE "public"."purchase_order_status" AS ENUM('CREATED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'TOKEN_PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "purchase_order_status" DEFAULT 'CREATED' NOT NULL,
	"user_address" text NOT NULL,
	"hotel_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"rwa_symbol" text NOT NULL,
	"rwa_currency" text NOT NULL,
	"rwa_issuer" text NOT NULL,
	"payment_currency" text NOT NULL,
	"payment_issuer" text NOT NULL,
	"token_amount" numeric(20, 8) NOT NULL,
	"price_per_token_usd" numeric(20, 8) NOT NULL,
	"total_payment_amount" numeric(20, 8) NOT NULL,
	"payment_tx_hash" text,
	"token_tx_hash" text,
	"error_code" text,
	"error_message" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_user_created" ON "purchase_orders" ("user_address","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_status_created" ON "purchase_orders" ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_hotel_unit" ON "purchase_orders" ("hotel_id","unit_id");
