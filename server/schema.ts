import {
  pgTable,
  serial,
  varchar,
  text,
  numeric,
  timestamp,
  integer,
  pgEnum,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const roleEnum = pgEnum("user_role", ["admin", "user", "owner"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 60 }).notNull(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  address: varchar("address", { length: 400 }).notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  address: varchar("address", { length: 400 }).notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  ownerId: integer("owner_id").unique().references(() => users.id, { onDelete: "restrict" }),
  externalSource: varchar("external_source", { length: 40 }),
  externalId: varchar("external_id", { length: 160 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("stores_name_idx").on(table.name),
  index("stores_address_idx").on(table.address),
  uniqueIndex("stores_source_external_unique").on(table.externalSource, table.externalId),
]);

export const ratings = pgTable(
  "ratings",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    review: text("review"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ratings_user_store_unique").on(table.userId, table.storeId),
    index("ratings_store_id_idx").on(table.storeId),
    check("ratings_score_range", sql`${table.rating} BETWEEN 1 AND 5`),
  ],
);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id, { onDelete: "set null" }),
  name: varchar("name", { length: 120 }).notNull(),
  price: numeric("price", { precision: 12, scale: 2, mode: "number" }),
  description: text("description").notNull().default(""),
  category: varchar("category", { length: 200 }),
  brand: varchar("brand", { length: 200 }),
  quantity: varchar("quantity", { length: 120 }),
  imageUrl: text("image_url"),
  specialFeature: varchar("special_feature", { length: 500 }).notNull().default(""),
  externalSource: varchar("external_source", { length: 40 }),
  externalId: varchar("external_id", { length: 160 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("products_name_idx").on(table.name),
  index("products_store_id_idx").on(table.storeId),
  uniqueIndex("products_source_external_unique").on(table.externalSource, table.externalId),
  check("products_price_nonnegative", sql`${table.price} IS NULL OR ${table.price} >= 0`),
]);

export const productRatings = pgTable(
  "product_ratings",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    review: text("review"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_ratings_user_product_unique").on(table.userId, table.productId),
    index("product_ratings_product_id_idx").on(table.productId),
    check("product_ratings_score_range", sql`${table.rating} BETWEEN 1 AND 5`),
  ],
);
