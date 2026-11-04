import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

config({ path: fileURLToPath(new URL("./.env", import.meta.url)) });

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) throw new Error("DATABASE_URL must be set.");

export const pool = new Pool({ connectionString });
pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});
//@ts-ignore
const db = drizzle({ client: pool, schema });

export default db;
