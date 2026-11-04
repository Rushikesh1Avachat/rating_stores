DROP INDEX "stores_owner_id_idx";--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "name" SET DATA TYPE varchar(100) USING "name"::varchar(100);--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "email" SET DATA TYPE varchar(255) USING "email"::varchar(255);--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_email_key" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_id_key" UNIQUE("owner_id");--> statement-breakpoint
ALTER TABLE "stores" DROP CONSTRAINT "stores_owner_id_users_id_fkey", ADD CONSTRAINT "stores_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT;