import "dotenv/config";
import db, { pool } from "./db.js";
import { products, stores } from "./schema.js";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { parseNominatimStores, parseOpenFoodFactsProducts, parseOpenPricesProducts, parseOverpassStores } from "./public-data.js";

const sourceLimit = Math.min(Math.max(Number.parseInt(process.env.PUBLIC_DATA_MAX_RECORDS ?? "50", 10) || 50, 1), 100);
const country = process.env.PUBLIC_DATA_COUNTRY ?? "india";
const city = process.env.PUBLIC_DATA_CITY ?? "Pune";
const overpassUrl = process.env.OVERPASS_API_URL ?? "https://overpass-api.de/api/interpreter";
const nominatimUrl = process.env.NOMINATIM_API_URL ?? "https://nominatim.openstreetmap.org/search";
const productApiUrl = process.env.OPEN_FOOD_FACTS_API_URL ?? "https://world.openfoodfacts.org/api/v2/search";
const pricesApiUrl = process.env.OPEN_PRICES_API_URL ?? "https://prices.openfoodfacts.org/api/v1/prices";

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Public catalog request failed with HTTP ${response.status}.`);
  return response.json() as Promise<unknown>;
}

function overpassQuery(cityName: string) {
  const escapedCity = cityName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `[out:json][timeout:50];area["name"="${escapedCity}"]["boundary"="administrative"]->.city;(node["shop"]["name"](area.city);way["shop"]["name"](area.city);relation["shop"]["name"](area.city);node["amenity"~"^(restaurant|cafe|fast_food|bank|pharmacy|doctors|dentist|marketplace)$"]["name"](area.city);way["amenity"~"^(restaurant|cafe|fast_food|bank|pharmacy|doctors|dentist|marketplace)$"]["name"](area.city););out center tags;`;
}

async function importStores() {
  if (process.env.IMPORT_STORES === "false") return 0;
  let records: string | any[] = [];
  let overpassError: string | undefined;
  try {
    const payload = await fetchJson(overpassUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "GoodmarkStoreRating/1.0",
      },
      body: new URLSearchParams({ data: overpassQuery(city) }),
    });
    records = parseOverpassStores(payload, sourceLimit);
  } catch (error) {
    overpassError = error instanceof Error ? error.message : "Unknown OpenStreetMap Overpass error.";
    console.warn(`Overpass store lookup failed: ${overpassError}; trying Nominatim.`);
  }
  if (!records.length) {
    const url = new URL(nominatimUrl);
    url.searchParams.set("q", `restaurants in ${city}, Maharashtra, India`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("extratags", "1");
    url.searchParams.set("limit", String(Math.min(sourceLimit, 50)));
    try {
      const payload = await fetchJson(url.toString(), {
        headers: { "user-agent": "GoodmarkStoreRating/1.0", accept: "application/json" },
      });
      records = parseNominatimStores(payload, Math.min(sourceLimit, 50));
    } catch (error) {
      const nominatimError = error instanceof Error ? error.message : "Unknown Nominatim error.";
      throw new Error(overpassError
        ? `Overpass failed (${overpassError}); Nominatim fallback failed (${nominatimError}).`
        : `Nominatim store lookup failed: ${nominatimError}`);
    }
  }
  if (!records.length) {
    console.warn(`OpenStreetMap returned no named restaurants for ${city}; no store rows were changed.`);
    return 0;
  }
  await db.transaction(async (tx) => {
    for (const store of records) {
      await tx.insert(stores).values({
        ...store,
        ownerId: null,
        externalSource: "openstreetmap",
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [stores.externalSource, stores.externalId],
        set: {
          name: store.name,
          email: store.email,
          address: store.address,
          description: store.description,
          imageUrl: store.imageUrl,
          updatedAt: new Date(),
        },
      });
    }
  });
  return records.length;
}

async function importOpenFoodFactsProducts() {
  if (process.env.IMPORT_PRODUCTS === "false" || process.env.IMPORT_OPEN_FOOD_FACTS === "false") return 0;
  const url = new URL(productApiUrl);
  url.searchParams.set("countries_tags_en", country);
  url.searchParams.set("fields", "code,product_name,brands,categories,quantity,image_front_url");
  url.searchParams.set("page_size", String(sourceLimit));
  url.searchParams.set("page", "1");
  const payload = await fetchJson(url.toString(), {
    headers: { "user-agent": "GoodmarkStoreRating/1.0" },
  });
  const records = parseOpenFoodFactsProducts(payload, sourceLimit);
  if (records.length) {
    const existing = await db.select({ externalId: products.externalId, externalSource: products.externalSource })
      .from(products)
      .where(inArray(products.externalId, records.map((product) => product.externalId)));
    const managedCodes = new Set(existing
      .filter((product) => product.externalSource !== "openfoodfacts")
      .map((product) => product.externalId));
    const recordsToUpsert = records.filter((product) => !managedCodes.has(product.externalId));
    await db.transaction(async (tx) => {
      for (const product of recordsToUpsert) {
        await tx.insert(products).values({
          ...product,
          storeId: null,
          price: null,
          specialFeature: "",
          externalSource: "openfoodfacts",
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [products.externalSource, products.externalId],
          set: {
            name: product.name,
            description: product.description,
            category: product.category,
            brand: product.brand,
            quantity: product.quantity,
            imageUrl: product.imageUrl,
            updatedAt: new Date(),
          },
        });
      }
    });
  } else {
    console.warn(`Open Food Facts returned no named products for ${country}; no product rows were changed.`);
  }

  return records.length;
}

async function importOpenPricesProducts() {
  if (process.env.IMPORT_PRODUCTS === "false" || process.env.IMPORT_PRICES === "false") return 0;
  const priceUrl = new URL(pricesApiUrl);
  priceUrl.searchParams.set("currency", "INR");
  priceUrl.searchParams.set("size", "100");
  priceUrl.searchParams.set("page", "1");
  const firstPricePage = await fetchJson(priceUrl.toString(), {
    headers: { "user-agent": "GoodmarkStoreRating/1.0" },
  });
  if (typeof firstPricePage !== "object" || firstPricePage === null || !("pages" in firstPricePage)) {
    throw new Error("Open Prices returned invalid pagination metadata.");
  }
  const pageCount = Number((firstPricePage as { pages?: unknown }).pages);
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 100) {
    throw new Error("Open Prices returned an unsupported page count.");
  }
  const pricePages: unknown[] = [firstPricePage];
  for (let page = 2; page <= pageCount; page++) {
    priceUrl.searchParams.set("page", String(page));
    pricePages.push(await fetchJson(priceUrl.toString(), {
      headers: { "user-agent": "GoodmarkStoreRating/1.0" },
    }));
  }
  const pricedRecords = parseOpenPricesProducts({
    items: pricePages.flatMap((page) => {
      if (typeof page !== "object" || page === null || !("items" in page) || !Array.isArray(page.items)) {
        throw new Error("Open Prices returned an invalid price page.");
      }
      return page.items;
    }),
  }, sourceLimit);
  let pricedProductCount = 0;
  if (pricedRecords.length) {
    await db.transaction(async (tx) => {
      for (const product of pricedRecords) {
        const [existingProduct] = await tx.select({
          id: products.id,
          price: products.price,
          externalSource: products.externalSource,
        }).from(products).where(eq(products.externalId, product.externalId)).limit(1);
        if (existingProduct) {
          if (existingProduct.externalSource === "admin") continue;
          if (existingProduct.externalSource === "openfoodfacts" && existingProduct.price !== null) continue;
          const [updated] = await tx.update(products).set({
            price: product.price,
            externalSource: "openprices",
            updatedAt: new Date(),
          }).where(existingProduct.externalSource === "openprices"
            ? eq(products.id, existingProduct.id)
            : and(eq(products.id, existingProduct.id), isNull(products.price)))
            .returning({ id: products.id });
          if (updated) pricedProductCount++;
          continue;
        }
        const [inserted] = await tx.insert(products).values({
          ...product,
          storeId: null,
          specialFeature: "",
          externalSource: "openprices",
          updatedAt: new Date(),
        }).onConflictDoNothing({
          target: [products.externalSource, products.externalId],
        }).returning({ id: products.id });
        if (inserted) pricedProductCount++;
      }
    });
  } else {
    console.warn("Open Prices returned no valid INR product prices; no price records were changed.");
  }

  return pricedProductCount;
}

try {
  const results: {
    stores?: number;
    products?: number;
    pricedProducts?: number;
    storeError?: string;
    openFoodFactsError?: string;
    pricesError?: string;
  } = {};
  try {
    results.stores = await importStores();
  } catch (error) {
    results.storeError = error instanceof Error ? error.message : "Unknown OpenStreetMap import error.";
    console.error(`Store import failed: ${results.storeError}`);
  }
  try {
    results.products = await importOpenFoodFactsProducts();
  } catch (error) {
    results.openFoodFactsError = error instanceof Error ? error.message : "Unknown Open Food Facts import error.";
    console.error(`Open Food Facts import failed: ${results.openFoodFactsError}`);
  }
  try {
    results.pricedProducts = await importOpenPricesProducts();
  } catch (error) {
    results.pricesError = error instanceof Error ? error.message : "Unknown Open Prices import error.";
    console.error(`Open Prices import failed: ${results.pricesError}`);
  }

  console.log(JSON.stringify(results));
  if (results.stores === undefined && results.products === undefined && results.pricedProducts === undefined) {
    throw new Error("No public catalog source could be imported. Configure an available API or disable its import.");
  }
  if (results.storeError || results.openFoodFactsError || results.pricesError) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Public data import failed:", error instanceof Error ? error.message : "Unknown error.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
