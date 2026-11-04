ALTER TABLE "stores" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "ratings_store_id_idx" ON "ratings" ("store_id");--> statement-breakpoint
CREATE INDEX "stores_name_idx" ON "stores" ("name");--> statement-breakpoint
CREATE INDEX "stores_address_idx" ON "stores" ("address");--> statement-breakpoint
CREATE INDEX "stores_owner_id_idx" ON "stores" ("owner_id");