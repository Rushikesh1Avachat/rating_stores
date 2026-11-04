CREATE TYPE "user_role" AS ENUM('admin', 'user', 'owner');--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" serial PRIMARY KEY,
	"store_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_score_range" CHECK ("score" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY,
	"name" varchar(120) NOT NULL,
	"email" varchar(254) NOT NULL,
	"address" varchar(400) NOT NULL,
	"owner_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"name" varchar(60) NOT NULL,
	"email" varchar(254) NOT NULL UNIQUE,
	"address" varchar(400) DEFAULT '' NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user'::"user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_user_store_unique" ON "ratings" ("user_id","store_id");--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_store_id_stores_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL;