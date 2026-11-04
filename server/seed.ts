import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import db, { pool } from "./db.js";
import { users } from "./schema.js";
import { personSchema } from "./validation.js";

async function seed() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD before creating the first administrator.");
  }

  const parsed = personSchema.safeParse({
    name: process.env.ADMIN_NAME ?? "Goodmark Platform Administrator",
    email,
    address: "Goodmark platform administration",
    password,
  });
  if (!parsed.success) throw new Error(`Invalid admin seed configuration: ${parsed.error.issues[0]?.message}`);

  const normalizedEmail = parsed.data.email.toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing) {
    console.log(`Administrator ${normalizedEmail} already exists; no changes made.`);
    return;
  }

  await db.insert(users).values({
    name: parsed.data.name,
    email: normalizedEmail,
    address: parsed.data.address,
    passwordHash: await bcrypt.hash(parsed.data.password, 12),
    role: "admin",
  });
  console.log(`Administrator ${normalizedEmail} created.`);
}

seed()
  .catch((error: unknown) => {
    console.error("Database seed failed:", error instanceof Error ? error.message : "Unknown error.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
