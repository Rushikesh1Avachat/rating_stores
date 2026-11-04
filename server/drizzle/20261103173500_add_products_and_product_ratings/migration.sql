CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"description" text NOT NULL,
	"special_feature" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_nonnegative" CHECK ("price" >= 0)
);--> statement-breakpoint
CREATE TABLE "product_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_ratings_score_range" CHECK ("rating" BETWEEN 1 AND 5),
	CONSTRAINT "product_ratings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
	CONSTRAINT "product_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE UNIQUE INDEX "product_ratings_user_product_unique" ON "product_ratings" ("user_id","product_id");--> statement-breakpoint
CREATE INDEX "product_ratings_product_id_idx" ON "product_ratings" ("product_id");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" ("name");
