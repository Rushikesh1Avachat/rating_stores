import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { productRatings, products, ratings, stores, users } from "./schema.js";
import { authenticate, optionalAuthenticate, type AuthRequest, requireRole } from "./auth.js";
import { loginSchema, passwordSchema, personSchema, productPriceSchema, productRatingSubmissionSchema, productSchema, ratingSubmissionSchema, storeSchema } from "./validation.js";
import type { Role } from "./types.js";
import { z } from "zod";
import db, { pool } from "./db.js";

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json({ limit: "32kb" }));

app.get("/", (_req, res) => res.type("text/plain").send("Good Rating Store is Live on Backend"));

function fail(res: express.Response, status: number, error: string) {
  return res.status(status).json({ error });
}

function hasDatabaseErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === code) return true;
  return "cause" in error && hasDatabaseErrorCode(error.cause, code);
}

function parseSort(value: unknown, allowed: string[], fallback: string, orderValue?: unknown) {
  const raw = typeof value === "string" ? value : fallback;
  const [field, direction] = raw.split(":");
  return {
    field: allowed.includes(field) ? field : fallback.split(":")[0],
    direction: orderValue === "asc" || orderValue === "desc"
      ? orderValue
      : direction === "desc" ? "desc" : "asc",
  };
}

function listQuery(req: express.Request, fields: { name: any; email?: any; address?: any }) {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
  const address = typeof req.query.address === "string" ? req.query.address.trim() : "";
  const role = typeof req.query.role === "string" ? req.query.role : "";
  const predicates = [];
  if (name) predicates.push(ilike(fields.name, `%${name}%`));
  if (email && fields.email) predicates.push(ilike(fields.email, `%${email}%`));
  if (address && fields.address) predicates.push(ilike(fields.address, `%${address}%`));
  if (role && ["admin", "user", "owner"].includes(role)) predicates.push(eq(users.role, role as Role));
  return predicates.length ? and(...predicates) : undefined;
}

function pageQuery(req: express.Request) {
  const requestedPage = Number.parseInt(String(req.query.page ?? "1"), 10);
  const requestedPageSize = Number.parseInt(String(req.query.pageSize ?? "10"), 10);
  const pageSize = Number.isFinite(requestedPageSize) ? Math.min(Math.max(requestedPageSize, 1), 100) : 10;
  const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function issueToken(user: { id: number; role: Role }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET must be set.");
  return jwt.sign({ role: user.role }, secret, { subject: String(user.id), expiresIn: "12h" });
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/ready", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    return res.json({ status: "ready", database: "connected" });
  } catch (error) {
    console.error("Database readiness check failed:", error instanceof Error ? error.message : "Unknown error.");
    return res.status(503).json({ error: "Database unavailable." });
  }
});

app.post("/api/auth/register", async (req, res, next) => {
  const parsed = personSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid registration details.");
  try {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1);
    if (existing.length) return fail(res, 409, "An account with this email already exists.");
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const [user] = await db.insert(users).values({
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      address: parsed.data.address,
      passwordHash,
      role: "user",
    }).returning({ id: users.id, name: users.name, email: users.email, address: users.address, role: users.role });
    if (!user) throw new Error("Unable to create user.");
    return res.status(201).json({
      message: "User registered successfully",
      userId: String(user.id),
      token: issueToken(user),
      user,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid sign-in details.");
  try {
    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1);
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return fail(res, 401, "Email or password is incorrect.");
    const { passwordHash: _, ...safeUser } = user;
    return res.json({ token: issueToken(user), user: safeUser });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const [user] = await db.select({
      id: users.id, name: users.name, email: users.email, address: users.address, role: users.role,
    }).from(users).where(eq(users.id, req.auth!.userId)).limit(1);
    if (!user) return fail(res, 401, "Account no longer exists.");
    return res.json({ user });
  } catch (error) {
    next(error);
  }
});

async function changePassword(req: AuthRequest, res: express.Response, next: express.NextFunction, legacy: boolean) {
  const parsed = z.object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: passwordSchema,
  }).safeParse({
    currentPassword: legacy ? req.body?.currentPassword : req.body?.oldPassword,
    newPassword: req.body?.newPassword,
  });
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid password details.");
  try {
    const [user] = await db.select({ passwordHash: users.passwordHash })
      .from(users).where(eq(users.id, req.auth!.userId)).limit(1);
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return fail(res, 400, "Current password is incorrect.");
    }
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, req.auth!.userId));
    return res.json({ message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
}

app.patch("/api/auth/change-password", authenticate, (req: AuthRequest, res, next) => changePassword(req, res, next, false));
app.put("/api/auth/password", authenticate, (req: AuthRequest, res, next) => changePassword(req, res, next, true));

app.get(["/api/stores", "/api/stores/"], optionalAuthenticate, async (req: AuthRequest, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const where = search ? or(ilike(stores.name, `%${search}%`), ilike(stores.address, `%${search}%`)) : undefined;
    const { field, direction } = parseSort(req.query.sortBy, ["name", "email", "rating", "createdAt"], "name", req.query.order);
    const sortColumns = {
      name: stores.name,
      email: stores.email,
      rating: sql<number>`coalesce(avg(${ratings.rating}), 0)`,
      createdAt: stores.createdAt,
    };
    const { page, pageSize, offset } = pageQuery(req);
    const resultsQuery = db.select({
      id: stores.id,
      name: stores.name,
      email: stores.email,
      address: stores.address,
      description: stores.description,
      imageUrl: stores.imageUrl,
      externalSource: stores.externalSource,
      ownerId: stores.ownerId,
      averageRating: sql<number>`coalesce(round(avg(${ratings.rating})::numeric, 1), 0)::float`,
      overallRating: sql<number>`coalesce(round(avg(${ratings.rating})::numeric, 1), 0)::float`,
      ratingCount: sql<number>`count(${ratings.id})::int`,
      userRating: req.auth
        ? sql<number | null>`max(case when ${ratings.userId} = ${req.auth.userId} then ${ratings.rating} end)`
        : sql<null>`null`,
      userReview: req.auth
        ? sql<string | null>`max(case when ${ratings.userId} = ${req.auth.userId} then ${ratings.review} end)`
        : sql<null>`null`,
    }).from(stores).leftJoin(ratings, eq(ratings.storeId, stores.id)).where(where)
      .groupBy(stores.id)
      .orderBy(direction === "desc" ? desc(sortColumns[field as keyof typeof sortColumns]) : asc(sortColumns[field as keyof typeof sortColumns]));
    const results = await resultsQuery.limit(pageSize).offset(offset);
    const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(stores).where(where);
    return res.json({ stores: results, total: count?.total ?? 0, page, pageSize });
  } catch (error) {
    next(error);
  }
});

app.get("/api/stores/:storeId/products", optionalAuthenticate, async (req: AuthRequest, res, next) => {
  const storeId = Number(req.params.storeId);
  if (!Number.isInteger(storeId) || storeId < 1) return fail(res, 400, "Invalid store.");
  try {
    const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, storeId)).limit(1);
    if (!store) return fail(res, 404, "Store not found.");
    const { page, pageSize, offset } = pageQuery(req);
    const rows = await db.select({
      id: products.id,
      storeId: products.storeId,
      storeName: stores.name,
      name: products.name,
      price: products.price,
      description: products.description,
      category: products.category,
      brand: products.brand,
      quantity: products.quantity,
      imageUrl: products.imageUrl,
      specialFeature: products.specialFeature,
      externalSource: products.externalSource,
      averageRating: sql<number>`coalesce(round(avg(${productRatings.rating})::numeric, 1), 0)::float`,
      ratingCount: sql<number>`count(${productRatings.id})::int`,
      userRating: req.auth
        ? sql<number | null>`max(case when ${productRatings.userId} = ${req.auth.userId} then ${productRatings.rating} end)`
        : sql<null>`null`,
      userReview: req.auth
        ? sql<string | null>`max(case when ${productRatings.userId} = ${req.auth.userId} then ${productRatings.review} end)`
        : sql<null>`null`,
    }).from(products).leftJoin(stores, eq(products.storeId, stores.id))
      .leftJoin(productRatings, eq(productRatings.productId, products.id))
      .where(eq(products.storeId, storeId))
      .groupBy(products.id, stores.name)
      .orderBy(asc(products.name))
      .limit(pageSize).offset(offset);
    const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(products).where(eq(products.storeId, storeId));
    return res.json({ products: rows, total: count?.total ?? 0, page, pageSize });
  } catch (error) {
    next(error);
  }
});

app.get(["/api/products", "/api/products/"], optionalAuthenticate, async (req: AuthRequest, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const searchFilter = search
      ? or(
        ilike(products.name, `%${search}%`),
        ilike(products.description, `%${search}%`),
        ilike(products.specialFeature, `%${search}%`),
        ilike(products.category, `%${search}%`),
        ilike(products.brand, `%${search}%`),
      )
      : undefined;
    const where = and(
      searchFilter,
      req.auth?.role === "user" ? isNotNull(products.price) : undefined,
    );
    const { field, direction } = parseSort(req.query.sortBy, ["name", "price", "rating", "createdAt"], "name", req.query.order);
    const sortColumns = {
      name: products.name,
      price: products.price,
      rating: sql<number>`coalesce(avg(${productRatings.rating}), 0)`,
      createdAt: products.createdAt,
    };
    const { page, pageSize, offset } = pageQuery(req);
    const rowsQuery = db.select({
      id: products.id,
      storeId: products.storeId,
      storeName: stores.name,
      name: products.name,
      price: products.price,
      description: products.description,
      category: products.category,
      brand: products.brand,
      quantity: products.quantity,
      imageUrl: products.imageUrl,
      specialFeature: products.specialFeature,
      externalSource: products.externalSource,
      createdAt: products.createdAt,
      averageRating: sql<number>`coalesce(round(avg(${productRatings.rating})::numeric, 1), 0)::float`,
      ratingCount: sql<number>`count(${productRatings.id})::int`,
      userRating: req.auth
        ? sql<number | null>`max(case when ${productRatings.userId} = ${req.auth.userId} then ${productRatings.rating} end)`
        : sql<null>`null`,
      userReview: req.auth
        ? sql<string | null>`max(case when ${productRatings.userId} = ${req.auth.userId} then ${productRatings.review} end)`
        : sql<null>`null`,
    }).from(products).leftJoin(stores, eq(products.storeId, stores.id)).leftJoin(productRatings, eq(productRatings.productId, products.id))
      .where(where)
      .groupBy(products.id, stores.name)
      .orderBy(direction === "desc" ? desc(sortColumns[field as keyof typeof sortColumns]) : asc(sortColumns[field as keyof typeof sortColumns]));
    const rows = await rowsQuery.limit(pageSize).offset(offset);
    const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(products).where(where);
    return res.json({ products: rows, total: count?.total ?? 0, page, pageSize });
  } catch (error) {
    next(error);
  }
});

app.get("/api/products/my-ratings", authenticate, requireRole("user"), async (req: AuthRequest, res, next) => {
  try {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(productRatings).where(eq(productRatings.userId, req.auth!.userId));
    return res.json({ count: result?.count ?? 0 });
  } catch (error) {
    next(error);
  }
});

async function submitRating(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  const isLegacyRoute = req.method === "PUT";
  const parsed = ratingSubmissionSchema.safeParse({
    storeId: isLegacyRoute ? req.params.storeId : req.body?.storeId,
    rating: isLegacyRoute ? req.body?.score : req.body?.rating,
    review: req.body?.review,
  });
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid rating.");
  const { storeId, rating } = parsed.data;
  try {
    const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, storeId)).limit(1);
    if (!store) return fail(res, 404, "Store not found.");
    const [savedRating] = await db.insert(ratings).values({
      storeId,
      userId: req.auth!.userId,
      rating,
      review: parsed.data.review || null,
    })
      .onConflictDoUpdate({
        target: [ratings.userId, ratings.storeId],
        set: { rating, review: parsed.data.review || null, updatedAt: new Date() },
      }).returning({
        id: ratings.id,
        storeId: ratings.storeId,
        userId: ratings.userId,
        rating: ratings.rating,
        review: ratings.review,
        createdAt: ratings.createdAt,
        updatedAt: ratings.updatedAt,
      });
    return res.json({ rating: savedRating });
  } catch (error) {
    next(error);
  }
}

app.post("/api/ratings", authenticate, requireRole("user"), submitRating);
app.put("/api/stores/:storeId/rating", authenticate, requireRole("user"), submitRating);

app.delete("/api/stores/:storeId/rating", authenticate, requireRole("user"), async (req: AuthRequest, res, next) => {
  const storeId = Number(req.params.storeId);
  if (!Number.isInteger(storeId) || storeId < 1) return fail(res, 400, "Invalid store.");
  try {
    const deleted = await db.delete(ratings).where(and(eq(ratings.storeId, storeId), eq(ratings.userId, req.auth!.userId)))
      .returning({ id: ratings.id });
    if (!deleted.length) return fail(res, 404, "Your rating was not found.");
    return res.status(204).end();
  } catch (error) {
    next(error);
  }
});

async function saveProductRating(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  const isPathRoute = req.params.productId !== undefined;
  const parsed = productRatingSubmissionSchema.safeParse({
    productId: isPathRoute ? req.params.productId : req.body?.productId,
    rating: req.body?.rating,
    review: req.body?.review,
  });
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid product rating.");
  const { productId, rating, review } = parsed.data;
  try {
    const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return fail(res, 404, "Product not found.");
    const [savedRating] = await db.insert(productRatings).values({
      productId,
      userId: req.auth!.userId,
      rating,
      review: review || null,
    }).onConflictDoUpdate({
      target: [productRatings.userId, productRatings.productId],
      set: { rating, review: review || null, updatedAt: new Date() },
    }).returning({
      id: productRatings.id,
      productId: productRatings.productId,
      userId: productRatings.userId,
      rating: productRatings.rating,
      review: productRatings.review,
      createdAt: productRatings.createdAt,
      updatedAt: productRatings.updatedAt,
    });
    const [summary] = await db.select({
    averageRating: sql<number>`coalesce(round(avg(${productRatings.rating})::numeric, 1), 0)::float`,
    ratingCount: sql<number>`count(*)::int`,
    }).from(productRatings).where(eq(productRatings.productId, productId));
    if (!savedRating || !summary) throw new Error("Unable to load the updated product rating summary.");
    return res.json({ rating: savedRating, ...summary });
  } catch (error) {
    next(error);
  }
}

app.get("/api/products/:productId/ratings", optionalAuthenticate, async (req: AuthRequest, res, next) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId < 1) return fail(res, 400, "Invalid product.");
  try {
    const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return fail(res, 404, "Product not found.");
    const [summary] = await db.select({
      averageRating: sql<number>`coalesce(round(avg(${productRatings.rating})::numeric, 1), 0)::float`,
      ratingCount: sql<number>`count(*)::int`,
      userRating: req.auth
        ? sql<number | null>`max(case when ${productRatings.userId} = ${req.auth.userId} then ${productRatings.rating} end)`
        : sql<null>`null`,
    }).from(productRatings).where(eq(productRatings.productId, productId));
    const reviews = await db.select({
      rating: productRatings.rating,
      review: productRatings.review,
      createdAt: productRatings.createdAt,
    }).from(productRatings).where(eq(productRatings.productId, productId))
      .orderBy(desc(productRatings.createdAt)).limit(100);
    return res.json({ ...summary, reviews });
  } catch (error) {
    next(error);
  }
});

app.post("/api/products/:productId/ratings", authenticate, requireRole("user"), saveProductRating);
app.put("/api/products/:productId/ratings", authenticate, requireRole("user"), saveProductRating);
app.post("/api/product-ratings", authenticate, requireRole("user"), saveProductRating);

app.delete("/api/products/:productId/ratings", authenticate, requireRole("user"), async (req: AuthRequest, res, next) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId < 1) return fail(res, 400, "Invalid product.");
  try {
    const deleted = await db.delete(productRatings)
      .where(and(eq(productRatings.productId, productId), eq(productRatings.userId, req.auth!.userId)))
      .returning({ id: productRatings.id });
    if (!deleted.length) return fail(res, 404, "Your product rating was not found.");
    return res.status(204).end();
  } catch (error) {
    next(error);
  }
});

async function adminMetrics() {
  const [[userCount], [storeCount], [ratingCount]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    db.select({ count: sql<number>`count(*)::int` }).from(stores),
    db.select({ count: sql<number>`count(*)::int` }).from(ratings),
  ]);
  return {
    totalUsers: userCount?.count ?? 0,
    totalStores: storeCount?.count ?? 0,
    totalRatings: ratingCount?.count ?? 0,
  };
}

app.get("/api/admin/metrics", authenticate, requireRole("admin"), async (_req, res, next) => {
  try {
    return res.json(await adminMetrics());
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/dashboard", authenticate, requireRole("admin"), async (_req, res, next) => {
  try {
    return res.json(await adminMetrics());
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/stats", authenticate, requireRole("admin"), async (_req, res, next) => {
  try {
    const { totalUsers, totalStores, totalRatings } = await adminMetrics();
    return res.json({ users: totalUsers, stores: totalStores, ratings: totalRatings });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users", authenticate, requireRole("admin"), async (req, res, next) => {
  try {
    const { field, direction } = parseSort(req.query.sort ?? req.query.sortBy, ["name", "email", "address", "role", "createdAt"], "name:asc", req.query.order);
    const sortColumns = { name: users.name, email: users.email, address: users.address, role: users.role, createdAt: users.createdAt };
    const where = listQuery(req, { name: users.name, email: users.email, address: users.address });
    const { page, pageSize, offset } = pageQuery(req);
    const hasPagination = req.query.page !== undefined || req.query.pageSize !== undefined;
    const rowsQuery = db.select({
      id: users.id, name: users.name, email: users.email, address: users.address, role: users.role,
      assignedStoreRatingAverage: sql<number | null>`case when ${users.role} = 'owner' then (
        select round(avg(${ratings.rating})::numeric, 1)::float from ${stores} inner join ${ratings} on ${ratings.storeId} = ${stores.id}
        where ${stores.ownerId} = ${users.id}
      ) else null end`,
    }).from(users).where(where)
      .orderBy(direction === "desc" ? desc(sortColumns[field as keyof typeof sortColumns]) : asc(sortColumns[field as keyof typeof sortColumns]));
    const rows = hasPagination ? await rowsQuery.limit(pageSize).offset(offset) : await rowsQuery;
    if (!hasPagination) return res.json(rows);
    const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(users).where(where);
    return res.json({ users: rows, total: count?.total ?? 0, page, pageSize });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/stores", authenticate, requireRole("admin"), async (req, res, next) => {
  try {
    const { field, direction } = parseSort(req.query.sort ?? req.query.sortBy, ["name", "email", "address", "rating", "createdAt"], "name:asc", req.query.order);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const columnFilters = listQuery(req, { name: stores.name, email: stores.email, address: stores.address });
    const textFilter = search
      ? or(ilike(stores.name, `%${search}%`), ilike(stores.email, `%${search}%`), ilike(stores.address, `%${search}%`))
      : undefined;
    const where = columnFilters && textFilter ? and(columnFilters, textFilter) : columnFilters ?? textFilter;
    const { page, pageSize, offset } = pageQuery(req);
    const sortColumns = {
      name: stores.name,
      email: stores.email,
      address: stores.address,
      rating: sql<number>`coalesce(avg(${ratings.rating}), 0)`,
      createdAt: stores.createdAt,
    };
    const hasPagination = req.query.page !== undefined || req.query.pageSize !== undefined;
    const rowsQuery = db.select({
      id: stores.id, name: stores.name, email: stores.email, address: stores.address, ownerId: stores.ownerId,
      createdAt: stores.createdAt,
      averageRating: sql<number>`coalesce(round(avg(${ratings.rating})::numeric, 1), 0)::float`,
      overallRating: sql<number>`coalesce(round(avg(${ratings.rating})::numeric, 1), 0)::float`,
      ratingCount: sql<number>`count(${ratings.id})::int`,
    }).from(stores).leftJoin(ratings, eq(ratings.storeId, stores.id))
      .where(where)
      .groupBy(stores.id)
      .orderBy(direction === "desc" ? desc(sortColumns[field as keyof typeof sortColumns]) : asc(sortColumns[field as keyof typeof sortColumns]));
    const rows = hasPagination ? await rowsQuery.limit(pageSize).offset(offset) : await rowsQuery;
    if (!hasPagination) return res.json(rows);
    const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(stores).where(where);
    return res.json({ stores: rows, total: count?.total ?? 0, page, pageSize });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users", authenticate, requireRole("admin"), async (req, res, next) => {
  const parsed = personSchema.extend({ role: z.enum(["admin", "user", "owner"]) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid user details.");
  try {
    const email = parsed.data.email.toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) return fail(res, 409, "An account with this email already exists.");
    const [user] = await db.insert(users).values({
      name: parsed.data.name, email, address: parsed.data.address,
      passwordHash: await bcrypt.hash(parsed.data.password, 12), role: parsed.data.role,
    }).returning({
      id: users.id,
      name: users.name,
      email: users.email,
      address: users.address,
      role: users.role,
      createdAt: users.createdAt,
    });
    if (!user) throw new Error("Unable to create user.");
    return res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/stores", authenticate, requireRole("admin"), async (req, res, next) => {
  const parsed = storeSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid store details.");
  try {
    const [owner] = await db.select({ id: users.id }).from(users)
      .leftJoin(stores, eq(stores.ownerId, users.id))
      .where(and(eq(users.id, parsed.data.ownerId), eq(users.role, "owner"), isNull(stores.id)))
      .limit(1);
    if (!owner) return fail(res, 400, "Select an unassigned user with the Store Owner role.");
    const [store] = await db.insert(stores).values({
      name: parsed.data.name,
      email: parsed.data.email?.toLowerCase() || null,
      address: parsed.data.address,
      ownerId: parsed.data.ownerId,
    }).returning({
      id: stores.id,
      name: stores.name,
      email: stores.email,
      address: stores.address,
      description: stores.description,
      imageUrl: stores.imageUrl,
      ownerId: stores.ownerId,
      createdAt: stores.createdAt,
    });
    if (!store) throw new Error("Unable to create store.");
    return res.status(201).json({ store });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/stores/:storeId/owner", authenticate, requireRole("admin"), async (req, res, next) => {
  const storeId = Number(req.params.storeId);
  if (!Number.isSafeInteger(storeId) || storeId < 1) return fail(res, 400, "Invalid store.");
  const parsed = z.object({ ownerId: z.number().int().positive().nullable() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? "Select a valid store owner.");

  try {
    const [existingStore] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, storeId)).limit(1);
    if (!existingStore) return fail(res, 404, "Store not found.");

    if (parsed.data.ownerId !== null) {
      const [availableOwner] = await db.select({ id: users.id }).from(users)
        .leftJoin(stores, eq(stores.ownerId, users.id))
        .where(and(
          eq(users.id, parsed.data.ownerId),
          eq(users.role, "owner"),
          or(isNull(stores.id), eq(stores.id, storeId)),
        ))
        .limit(1);
      if (!availableOwner) return fail(res, 400, "Select a Store Owner who is not assigned to another store.");
    }

    const [store] = await db.update(stores)
      .set({ ownerId: parsed.data.ownerId, updatedAt: new Date() })
      .where(eq(stores.id, storeId))
      .returning({
        id: stores.id,
        name: stores.name,
        email: stores.email,
        address: stores.address,
        ownerId: stores.ownerId,
        createdAt: stores.createdAt,
      });
    if (!store) throw new Error("Unable to update the store owner.");
    return res.json({ store });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/products", authenticate, requireRole("admin"), async (req, res, next) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid product details.");
  try {
    const [product] = await db.insert(products).values({
      name: parsed.data.name,
      price: parsed.data.price,
      description: parsed.data.description,
      category: parsed.data.category ?? null,
      brand: parsed.data.brand ?? null,
      quantity: parsed.data.quantity ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      specialFeature: parsed.data.specialFeature,
      storeId: parsed.data.storeId ?? null,
      externalSource: "admin",
    }).returning({
      id: products.id,
      storeId: products.storeId,
      name: products.name,
      price: products.price,
      description: products.description,
      category: products.category,
      brand: products.brand,
      quantity: products.quantity,
      imageUrl: products.imageUrl,
      specialFeature: products.specialFeature,
      createdAt: products.createdAt,
    });
    if (!product) throw new Error("Unable to create product.");
    return res.status(201).json({ product });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/products/:productId/price", authenticate, requireRole("admin"), async (req, res, next) => {
  const productId = Number(req.params.productId);
  if (!Number.isSafeInteger(productId) || productId < 1) return fail(res, 400, "Invalid product.");
  const parsed = productPriceSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid product price.");
  try {
    const [product] = await db.update(products)
      .set({ price: parsed.data.price, externalSource: "admin", updatedAt: new Date() })
      .where(eq(products.id, productId))
      .returning({ id: products.id, price: products.price });
    if (!product) return fail(res, 404, "Product not found.");
    return res.json({ product });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/store-owners", authenticate, requireRole("admin"), async (req, res, next) => {
  try {
    const requestedStoreId = req.query.storeId === undefined ? null : Number(req.query.storeId);
    if (requestedStoreId !== null && (!Number.isSafeInteger(requestedStoreId) || requestedStoreId < 1)) {
      return fail(res, 400, "Invalid store.");
    }
    if (requestedStoreId !== null) {
      const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, requestedStoreId)).limit(1);
      if (!store) return fail(res, 404, "Store not found.");
    }
    const availableOwners = await db.select({
      id: users.id, name: users.name, email: users.email, address: users.address, role: users.role,
    }).from(users).leftJoin(stores, eq(stores.ownerId, users.id))
      .where(and(
        eq(users.role, "owner"),
        requestedStoreId === null
          ? isNull(stores.id)
          : or(isNull(stores.id), eq(stores.id, requestedStoreId)),
      ))
      .orderBy(asc(users.name));
    return res.json({ users: availableOwners });
  } catch (error) {
    next(error);
  }
});

app.get("/api/owner/dashboard", authenticate, requireRole("owner"), async (req: AuthRequest, res, next) => {
  try {
    const [ownedStore] = await db.select({
      id: stores.id,
      name: stores.name,
      address: stores.address,
      averageRating: sql<number>`coalesce(round(avg(${ratings.rating})::numeric, 1), 0)::float`,
      totalRatings: sql<number>`count(${ratings.id})::int`,
    }).from(stores).leftJoin(ratings, eq(ratings.storeId, stores.id))
      .where(eq(stores.ownerId, req.auth!.userId)).groupBy(stores.id).limit(1);
    const ratedBy = ownedStore ? await db.select({
      id: ratings.id,
      userName: users.name,
      userEmail: users.email,
      rating: ratings.rating,
      createdAt: ratings.createdAt,
    }).from(ratings).innerJoin(users, eq(ratings.userId, users.id))
      .where(eq(ratings.storeId, ownedStore.id)).orderBy(desc(ratings.createdAt)) : [];
    return res.json({ store: ownedStore ?? null, ratings: ratedBy });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("API request failed:", error);
  if (hasDatabaseErrorCode(error, "23505")) return fail(res, 409, "That record already exists.");
  if (hasDatabaseErrorCode(error, "23503")) return fail(res, 400, "The selected related record is not available.");
  return fail(res, 500, "Something went wrong. Please try again.");
});

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, "127.0.0.1", () => console.log(`Goodmark API listening on http://localhost:${port}`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(async () => {
    await pool.end();
    process.exit(0);
  }));
}
