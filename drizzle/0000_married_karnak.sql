DO $$ BEGIN
 CREATE TYPE "public"."asset_side" AS ENUM('COLLATERAL', 'DEBT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."event_module" AS ENUM('SWAP', 'LENDING', 'FAUCET', 'TRUST', 'SYSTEM');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."event_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."position_status" AS ENUM('ACTIVE', 'LIQUIDATED', 'CLOSED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."supply_position_status" AS ENUM('ACTIVE', 'CLOSED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"module" "event_module" NOT NULL,
	"status" "event_status" NOT NULL,
	"user_id" uuid,
	"user_address" text,
	"market_id" uuid,
	"position_id" uuid,
	"onchain_tx_id" uuid,
	"idempotency_key" text,
	"amount" numeric(20, 8),
	"currency" text,
	"error_code" text,
	"error_message" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"collateral_currency" text NOT NULL,
	"collateral_issuer" text NOT NULL,
	"debt_currency" text NOT NULL,
	"debt_issuer" text NOT NULL,
	"max_ltv_ratio" numeric(10, 6) NOT NULL,
	"liquidation_ltv_ratio" numeric(10, 6) NOT NULL,
	"base_interest_rate" numeric(10, 6) NOT NULL,
	"liquidation_penalty" numeric(10, 6) NOT NULL,
	"min_collateral_amount" numeric(20, 8) NOT NULL,
	"min_borrow_amount" numeric(20, 8) NOT NULL,
	"min_supply_amount" numeric(20, 8) DEFAULT '5' NOT NULL,
	"total_supplied" numeric(20, 8) DEFAULT '0' NOT NULL,
	"total_borrowed" numeric(20, 8) DEFAULT '0' NOT NULL,
	"global_yield_index" numeric(20, 18) DEFAULT '1.0' NOT NULL,
	"last_index_update" timestamp with time zone DEFAULT now() NOT NULL,
	"reserve_factor" numeric(10, 6) DEFAULT '0.1' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "markets_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onchain_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tx_hash" text NOT NULL,
	"ledger_index" integer,
	"validated" boolean NOT NULL,
	"tx_result" text,
	"tx_type" text NOT NULL,
	"source_address" text,
	"destination_address" text,
	"currency" text,
	"issuer" text,
	"amount" numeric(20, 8),
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_tx_json" jsonb NOT NULL,
	"raw_meta_json" jsonb,
	CONSTRAINT "onchain_transactions_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"status" "position_status" DEFAULT 'ACTIVE' NOT NULL,
	"collateral_amount" numeric(20, 8) DEFAULT '0' NOT NULL,
	"loan_principal" numeric(20, 8) DEFAULT '0' NOT NULL,
	"interest_accrued" numeric(20, 8) DEFAULT '0' NOT NULL,
	"last_interest_update" timestamp with time zone DEFAULT now() NOT NULL,
	"interest_rate_at_open" numeric(10, 6) NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"liquidated_at" timestamp with time zone,
	CONSTRAINT "positions_user_market_unique" UNIQUE("user_id","market_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_oracle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"asset_side" "asset_side" NOT NULL,
	"price_usd" numeric(20, 8) NOT NULL,
	"source" text DEFAULT 'MOCK' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_oracle_market_side_unique" UNIQUE("market_id","asset_side")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supply_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"status" "supply_position_status" DEFAULT 'ACTIVE' NOT NULL,
	"supply_amount" numeric(20, 8) DEFAULT '0' NOT NULL,
	"yield_index" numeric(20, 18) DEFAULT '1.0' NOT NULL,
	"last_yield_update" timestamp with time zone DEFAULT now() NOT NULL,
	"supplied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supply_positions_user_market_unique" UNIQUE("user_id","market_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"xrpl_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_xrpl_address_unique" UNIQUE("xrpl_address")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_events" ADD CONSTRAINT "app_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_events" ADD CONSTRAINT "app_events_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_events" ADD CONSTRAINT "app_events_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_events" ADD CONSTRAINT "app_events_onchain_tx_id_onchain_transactions_id_fk" FOREIGN KEY ("onchain_tx_id") REFERENCES "public"."onchain_transactions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_oracle" ADD CONSTRAINT "price_oracle_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supply_positions" ADD CONSTRAINT "supply_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supply_positions" ADD CONSTRAINT "supply_positions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_events_module_created" ON "app_events" ("module","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_events_user_address_created" ON "app_events" ("user_address","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_events_position_created" ON "app_events" ("position_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_events_idempotency" ON "app_events" ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_markets_name" ON "markets" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_markets_is_active" ON "markets" ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_onchain_tx_hash" ON "onchain_transactions" ("tx_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_onchain_tx_dest_observed" ON "onchain_transactions" ("destination_address","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_positions_user_market" ON "positions" ("user_id","market_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_positions_status" ON "positions" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_positions_market_status" ON "positions" ("market_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_price_oracle_market_side" ON "price_oracle" ("market_id","asset_side");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supply_positions_market_status" ON "supply_positions" ("market_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supply_positions_user_status" ON "supply_positions" ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_xrpl_address" ON "users" ("xrpl_address");