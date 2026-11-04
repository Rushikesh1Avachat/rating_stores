ALTER TABLE "product_ratings" ADD COLUMN "review" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "store_id" integer;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "description" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" varchar(200);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" varchar(200);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "quantity" varchar(120);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "special_feature" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "external_source" varchar(40);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "external_id" varchar(160);--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_price_nonnegative";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_nonnegative" CHECK ("price" IS NULL OR "price" >= 0);--> statement-breakpoint
ALTER TABLE "stores" DROP CONSTRAINT "stores_email_key";--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "review" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "external_source" varchar(40);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "external_id" varchar(160);--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "products_store_id_idx" ON "products" ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_source_external_unique" ON "products" ("external_source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_source_external_unique" ON "stores" ("external_source","external_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL;
