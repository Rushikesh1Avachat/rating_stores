import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq, inArray, like, sql } from "drizzle-orm";
import db, { pool } from "./db.js";
import { ratings, stores, users } from "./schema.js";
import { personSchema, storeSchema } from "./validation.js";

// Optional demonstration data. Idempotent: running it twice creates nothing new.
// Every account below uses the same password so the reviewer can explore each role.
const DEMO_PASSWORD = "DemoPass#1";

const owners = [
  { name: "Anjali Vasudevan Krishnan", email: "owner.anjali@goodmark.demo", address: "14 Lane 7, Kalyani Nagar, Pune 411006" },
  { name: "Rohan Pratap Deshpande", email: "owner.rohan@goodmark.demo", address: "22 Bhandarkar Road, Pune 411004" },
  { name: "Kavita Suresh Bhagwat", email: "owner.kavita@goodmark.demo", address: "9 Breman Chowk, Aundh, Pune 411007" },
];

const shoppers = [
  { name: "Meera Chandrashekhar Iyer", email: "user.meera@goodmark.demo", address: "31 Prabhat Road, Pune 411004" },
  { name: "Aditya Vishwanath Kulkarni", email: "user.aditya@goodmark.demo", address: "56 Karve Nagar, Pune 411052" },
  { name: "Nikhil Ananthrao Joshi", email: "user.nikhil@goodmark.demo", address: "8 Viman Nagar, Pune 411014" },
];

const catalog = [
  {
    name: "Kalyani Nagar Filter Coffee House",
    email: "hello@filtercoffee.goodmark.demo",
    address: "Lane 7, Kalyani Nagar, Pune 411006",
    description: "Single-origin South Indian filter coffee, brewed the slow way since 1994.",
    ownerEmail: "owner.anjali@goodmark.demo",
  },
  {
    name: "Deccan Gymkhana Book Nook",
    email: "hello@booknook.goodmark.demo",
    address: "Off FC Road, Deccan Gymkhana, Pune 411004",
    description: "A second-hand bookshop with a reading room and a very opinionated cat.",
    ownerEmail: "owner.rohan@goodmark.demo",
  },
  {
    name: "Aundh Organic Grocers",
    email: "hello@organicgrocers.goodmark.demo",
    address: "Breman Chowk, Aundh, Pune 411007",
    description: "Farm-to-shelf produce, pulses, and cold-pressed oils from around Maharashtra.",
    ownerEmail: "owner.kavita@goodmark.demo",
  },
];

const opinions = [
  { storeEmail: "hello@filtercoffee.goodmark.demo", userEmail: "user.meera@goodmark.demo", rating: 5, review: "The degree coffee is exactly right and the staff remember your order." },
  { storeEmail: "hello@filtercoffee.goodmark.demo", userEmail: "user.aditya@goodmark.demo", rating: 4, review: "Great brew, though the morning queue gets long after nine." },
  { storeEmail: "hello@booknook.goodmark.demo", userEmail: "user.meera@goodmark.demo", rating: 4, review: "Found a first edition in the back shelf. Quiet and welcoming." },
  { storeEmail: "hello@booknook.goodmark.demo", userEmail: "user.nikhil@goodmark.demo", rating: 5, review: "The owner will argue about Marathi poetry for an hour, in the best way." },
  { storeEmail: "hello@organicgrocers.goodmark.demo", userEmail: "user.aditya@goodmark.demo", rating: 5, review: "Freshest greens in Aundh and the prices are honest." },
  { storeEmail: "hello@organicgrocers.goodmark.demo", userEmail: "user.nikhil@goodmark.demo", rating: 4, review: "Small shop, so a few things sell out by evening." },
];

async function findUserId(email: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return row?.id ?? null;
}

async function ensureAccount(input: { name: string; email: string; address: string }, role: "user" | "owner") {
  const parsed = personSchema.safeParse({ ...input, password: DEMO_PASSWORD });
  if (!parsed.success) throw new Error(`Invalid demo account ${input.email}: ${parsed.error.issues[0]?.message}`);

  const existingId = await findUserId(parsed.data.email.toLowerCase());
  if (existingId) return existingId;

  const [created] = await db.insert(users).values({
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    address: parsed.data.address,
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
    role,
  }).returning({ id: users.id });
  if (!created) throw new Error(`Unable to create demo account ${input.email}.`);
  return created.id;
}

async function ensureStore(input: (typeof catalog)[number], ownerId: number) {
  const parsed = storeSchema.safeParse({
    name: input.name,
    email: input.email,
    address: input.address,
    ownerId,
  });
  if (!parsed.success) throw new Error(`Invalid demo store ${input.name}: ${parsed.error.issues[0]?.message}`);

  const [existing] = await db.select({ id: stores.id }).from(stores).where(eq(stores.email, input.email)).limit(1);
  if (existing) return existing.id;

  const [created] = await db.insert(stores).values({
    name: input.name,
    email: input.email,
    address: input.address,
    description: input.description,
    ownerId,
  }).returning({ id: stores.id });
  if (!created) throw new Error(`Unable to create demo store ${input.name}.`);
  return created.id;
}

async function removeVerificationArtifacts() {
  // Accounts created by tools/api-smoke.mjs live on @goodmark.test and are not part of the demo.
  const testStores = await db.delete(stores).where(like(stores.email, "%@goodmark.test")).returning({ id: stores.id });
  const testUserRows = await db.select({ id: users.id }).from(users).where(like(users.email, "%@goodmark.test"));
  if (testUserRows.length) {
    await db.delete(users).where(inArray(users.id, testUserRows.map((row) => row.id)));
  }
  if (testStores.length || testUserRows.length) {
    console.log(`Removed ${testStores.length} verification store(s) and ${testUserRows.length} verification account(s).`);
  }
}

async function seedDemo() {
  await removeVerificationArtifacts();

  const ownerIds = new Map<string, number>();
  for (const owner of owners) {
    ownerIds.set(owner.email, await ensureAccount(owner, "owner"));
  }
  const shopperIds = new Map<string, number>();
  for (const shopper of shoppers) {
    shopperIds.set(shopper.email, await ensureAccount(shopper, "user"));
  }

  const storeIds = new Map<string, number>();
  for (const store of catalog) {
    const ownerId = ownerIds.get(store.ownerEmail);
    if (!ownerId) throw new Error(`Missing owner ${store.ownerEmail}.`);
    storeIds.set(store.email, await ensureStore(store, ownerId));
  }

  let insertedRatings = 0;
  for (const opinion of opinions) {
    const storeId = storeIds.get(opinion.storeEmail);
    const userId = shopperIds.get(opinion.userEmail);
    if (!storeId || !userId) throw new Error(`Missing rating target ${opinion.storeEmail}.`);
    const [saved] = await db.insert(ratings)
      .values({ storeId, userId, rating: opinion.rating, review: opinion.review })
      .onConflictDoNothing({ target: [ratings.userId, ratings.storeId] })
      .returning({ id: ratings.id });
    if (saved) insertedRatings += 1;
  }

  const [{ stores: storeCount }] = await db.select({ stores: sql<number>`count(*)::int` }).from(stores);
  const [{ ratings: ratingCount }] = await db.select({ ratings: sql<number>`count(*)::int` }).from(ratings);
  console.log(`Demo data ready: ${catalog.length} stores, ${owners.length + shoppers.length} demo accounts, ${ratingCount} ratings (${insertedRatings} added now).`);
  console.log(`Total in database: ${storeCount} stores, ${ratingCount} ratings. Sign in with any demo email and password ${DEMO_PASSWORD}.`);
}

seedDemo()
  .catch((error: unknown) => {
    console.error("Demo seed failed:", error instanceof Error ? error.message : "Unknown error.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
