import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import db, { pool } from "./db.js";

const migrationsFolder = fileURLToPath(new URL("./drizzle", import.meta.url));
const expectedHistory = [
  "20261102162605_illegal_leo",
  "20261103113009_add_schema_timestamps_and_indexes",
  "20261103114648_align_store_rating_contracts",
  "20261103114938_rename_rating_score_column",
  "20261103173500_add_products_and_product_ratings",
];
const migrationFiles = readMigrationFiles({ migrationsFolder });

function assertEqualValues(label: string, actual: Set<string>, expected: string[]) {
  const missing = expected.filter((value) => !actual.has(value));
  if (missing.length) {
    throw new Error(`Database migration preflight failed; missing ${label}: ${missing.join(", ")}.`);
  }
}

async function verifyPreMigrationSchema(client: PoolClient) {
  const tables = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name = any($1::text[])`,
    [["users", "stores", "ratings", "products", "product_ratings"]],
  );
  assertEqualValues("tables", new Set(tables.rows.map((row) => row.table_name)), [
    "users", "stores", "ratings", "products", "product_ratings",
  ]);

  const columns = await client.query<{ table_name: string; column_name: string; is_nullable: string }>(
    `select table_name, column_name, is_nullable from information_schema.columns
     where table_schema = 'public'
       and table_name = any($1::text[])`,
    [["users", "stores", "ratings", "products", "product_ratings"]],
  );
  const columnRows = new Map(columns.rows.map((row) => [
    `${row.table_name}.${row.column_name}`,
    row.is_nullable,
  ]));
  const requiredColumns = [
    "users.id", "users.name", "users.email", "users.address", "users.password_hash", "users.role", "users.created_at", "users.updated_at",
    "stores.id", "stores.name", "stores.email", "stores.address", "stores.owner_id", "stores.created_at", "stores.updated_at",
    "ratings.id", "ratings.store_id", "ratings.user_id", "ratings.rating", "ratings.created_at", "ratings.updated_at",
    "products.id", "products.name", "products.price", "products.description", "products.special_feature", "products.created_at", "products.updated_at",
    "product_ratings.id", "product_ratings.product_id", "product_ratings.user_id", "product_ratings.rating", "product_ratings.created_at", "product_ratings.updated_at",
  ];
  assertEqualValues("columns", new Set(columnRows.keys()), requiredColumns);
  for (const column of ["stores.email", "stores.owner_id", "products.price"]) {
    if (columnRows.get(column) !== "NO") {
      throw new Error(`Database migration preflight failed; ${column} is not in the expected pre-migration state.`);
    }
  }

  const indexes = await client.query<{ indexname: string }>(
    `select indexname from pg_indexes
     where schemaname = 'public'
       and tablename = any($1::text[])`,
    [["users", "stores", "ratings", "products", "product_ratings"]],
  );
  assertEqualValues("indexes", new Set(indexes.rows.map((row) => row.indexname)), [
    "users_email_key", "stores_name_idx", "stores_address_idx", "stores_email_key", "stores_owner_id_key",
    "ratings_user_store_unique", "ratings_store_id_idx", "products_name_idx",
    "product_ratings_user_product_unique", "product_ratings_product_id_idx",
  ]);

  const constraints = await client.query<{ conname: string }>(
    `select conname from pg_constraint
     where connamespace = 'public'::regnamespace
       and conrelid::regclass::text = any($1::text[])`,
    [["stores", "ratings", "products", "product_ratings", "users"]],
  );
  assertEqualValues("constraints", new Set(constraints.rows.map((row) => row.conname)), [
    "stores_email_key", "stores_owner_id_key", "stores_owner_id_users_id_fkey",
    "ratings_score_range", "ratings_store_id_stores_id_fkey", "ratings_user_id_users_id_fkey",
    "products_price_nonnegative", "product_ratings_score_range",
    "product_ratings_product_id_products_id_fk", "product_ratings_user_id_users_id_fk",
  ]);

  const forbiddenColumns = [
    "stores.description", "stores.image_url", "stores.external_source", "stores.external_id",
    "ratings.review", "products.store_id", "products.category", "products.brand", "products.quantity",
    "products.image_url", "products.external_source", "products.external_id", "product_ratings.review",
  ];
  const unexpected = forbiddenColumns.filter((column) => columnRows.has(column));
  if (unexpected.length) {
    throw new Error(`Database migration preflight found partially applied catalog columns: ${unexpected.join(", ")}.`);
  }
}

async function verifyPostMigrationSchema(client: PoolClient) {
  const columns = await client.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public'
       and table_name = any($1::text[])`,
    [["stores", "ratings", "products", "product_ratings"]],
  );
  assertEqualValues("catalog columns", new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`)), [
    "stores.description", "stores.image_url", "stores.external_source", "stores.external_id",
    "ratings.review", "products.store_id", "products.category", "products.brand", "products.quantity",
    "products.image_url", "products.external_source", "products.external_id", "product_ratings.review",
  ]);
  const indexes = await client.query<{ indexname: string }>(
    `select indexname from pg_indexes
     where schemaname = 'public'
       and indexname = any($1::text[])`,
    [["products_store_id_idx", "products_source_external_unique", "stores_source_external_unique"]],
  );
  assertEqualValues("catalog indexes", new Set(indexes.rows.map((row) => row.indexname)), [
    "products_store_id_idx", "products_source_external_unique", "stores_source_external_unique",
  ]);
  const foreignKey = await client.query<{ conname: string }>(
    `select conname from pg_constraint
     where connamespace = 'public'::regnamespace
       and conname = 'products_store_id_stores_id_fkey'
       and pg_get_constraintdef(oid) like '%ON DELETE SET NULL'`,
  );
  if (!foreignKey.rowCount) {
    throw new Error("Post-migration verification failed; product-to-store deletion behavior is missing.");
  }
}

async function main() {
  const client = await pool.connect();
  let locked = false;
  let transactionOpen = false;
  try {
    await client.query("select pg_advisory_lock(782630194)");
    locked = true;

    const appTables = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name = any($1::text[])`,
      [["users", "stores", "ratings", "products", "product_ratings"]],
    );
    const ledgerTable = await client.query<{ exists: boolean }>(
      `select to_regclass('drizzle.__drizzle_migrations') is not null as exists`,
    );
    if (!appTables.rowCount) {
      if (ledgerTable.rows[0]?.exists) {
        const historyCount = await client.query<{ count: string }>(
          "select count(*)::text as count from drizzle.__drizzle_migrations",
        );
        if (historyCount.rows[0]?.count !== "0") {
          throw new Error("Migration history exists without application tables; refusing to modify an unknown database.");
        }
      }
      await migrate(db, { migrationsFolder });
      await verifyPostMigrationSchema(client);
      console.log("Database migrations completed successfully on an empty database.");
      return;
    }

    if (ledgerTable.rows[0]?.exists) {
      const latestFile = migrationFiles.at(-1);
      const allRecords = await client.query<{ hash: string; created_at: string; name: string | null }>(
        `select hash, created_at::text, name from drizzle.__drizzle_migrations order by created_at`,
      );
      if (latestFile && allRecords.rows.at(-1)?.name === latestFile.name) {
        if (allRecords.rowCount !== migrationFiles.length) {
          throw new Error("Database migration history is incomplete despite the latest migration being recorded.");
        }
        for (const [index, migration] of migrationFiles.entries()) {
          const record = allRecords.rows[index];
          if (record?.name !== migration.name
            || record.hash !== migration.hash
            || record.created_at !== String(migration.folderMillis)) {
            throw new Error(`Database migration history does not match ${migration.name}.`);
          }
        }
        await verifyPostMigrationSchema(client);
        console.log("Database schema is already up to date.");
        return;
      }
    }

    await client.query("begin");
    transactionOpen = true;

    await verifyPreMigrationSchema(client);
    if (!ledgerTable.rows[0]?.exists) {
      throw new Error("Migration history table is missing; refusing to reconcile an unknown database.");
    }

    const history = await client.query<{ id: number; hash: string; created_at: string; name: string | null }>(
      `select id, hash, created_at::text, name
       from drizzle.__drizzle_migrations
       order by created_at`,
    );
    const allMigrationNames = new Set(migrationFiles.map((migration) => migration.name));
    const expectedMigrations = migrationFiles.filter((migration) => expectedHistory.includes(migration.name));
    if (expectedMigrations.length !== expectedHistory.length
      || expectedHistory.some((name) => !allMigrationNames.has(name))) {
      throw new Error("Local migration history is incomplete; refusing to modify database migration records.");
    }

    const byName = new Map(expectedMigrations.map((migration) => [migration.name, migration]));
    const byTimestamp = new Map(expectedMigrations.map((migration) => [String(migration.folderMillis), migration]));
    const recorded = new Set<string>();
    for (const row of history.rows) {
      const migration = (row.name && byName.get(row.name)) ?? byTimestamp.get(String(row.created_at));
      if (!migration || migration.hash !== row.hash || String(migration.folderMillis) !== String(row.created_at)) {
        throw new Error("Database migration history does not match the known migration files; refusing to alter it.");
      }
      if (recorded.has(migration.name)) {
        throw new Error(`Duplicate database migration record found for ${migration.name}.`);
      }
      if (row.name && row.name !== migration.name) {
        throw new Error(`Database migration name mismatch for timestamp ${row.created_at}.`);
      }
      recorded.add(migration.name);
      if (!row.name) {
        await client.query(
          "update drizzle.__drizzle_migrations set name = $1 where id = $2",
          [migration.name, row.id],
        );
      }
    }

    for (const migration of expectedMigrations) {
      if (!recorded.has(migration.name)) {
        await client.query(
          `insert into drizzle.__drizzle_migrations (hash, created_at, name)
           values ($1, $2, $3)`,
          [migration.hash, migration.folderMillis, migration.name],
        );
      }
    }

    const beforeCounts = await client.query(
      `select (select count(*) from users) as users,
              (select count(*) from stores) as stores,
              (select count(*) from ratings) as ratings,
              (select count(*) from products) as products,
              (select count(*) from product_ratings) as product_ratings`,
    );
    await client.query("commit");
    transactionOpen = false;

    await migrate(db, { migrationsFolder });
    await verifyPostMigrationSchema(client);

    const afterCounts = await client.query(
      `select (select count(*) from users) as users,
              (select count(*) from stores) as stores,
              (select count(*) from ratings) as ratings,
              (select count(*) from products) as products,
              (select count(*) from product_ratings) as product_ratings`,
    );
    if (JSON.stringify(beforeCounts.rows[0]) !== JSON.stringify(afterCounts.rows[0])) {
      throw new Error("Schema migration changed user, store, or rating record counts.");
    }
    console.log("Database migration completed. Existing user, store, product, and rating counts are unchanged.");
  } catch (error) {
    if (transactionOpen) {
      await client.query("rollback");
      transactionOpen = false;
    }
    throw error;
  } finally {
    if (locked) await client.query("select pg_advisory_unlock(782630194)");
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Database migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
