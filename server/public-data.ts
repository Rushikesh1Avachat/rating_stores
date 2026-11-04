export type ImportedStore = {
  name: string;
  email: string | null;
  address: string;
  description: string;
  imageUrl: string | null;
  externalId: string;
};

export type ImportedProduct = {
  name: string;
  description: string;
  category: string | null;
  brand: string | null;
  quantity: string | null;
  imageUrl: string | null;
  externalId: string;
};

export type ImportedPricedProduct = ImportedProduct & {
  price: number;
};

type OverpassElement = {
  id: number;
  type: string;
  tags?: Record<string, string>;
};

type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  categories?: string;
  quantity?: string;
  image_front_url?: string;
};

type OpenPricesPrice = {
  product_code?: string;
  product_name?: string | null;
  price?: number | string;
  currency?: string;
  date?: string;
  product?: {
    code?: string;
    product_name?: string | null;
    brands?: string | null;
    categories_tags?: string[];
    product_quantity?: string | null;
    product_quantity_unit?: string | null;
    quantity?: string | null;
    image_url?: string | null;
  } | null;
};

type NominatimPlace = {
  osm_id?: number;
  osm_type?: string;
  name?: string;
  category?: string;
  type?: string;
  address?: Record<string, unknown>;
  extratags?: Record<string, unknown> | null;
};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

export function usableImageUrl(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseOverpassStores(payload: unknown, limit: number): ImportedStore[] {
  if (typeof payload !== "object" || payload === null || !("elements" in payload)) {
    throw new Error("OpenStreetMap returned an invalid store catalog.");
  }
  const elements = (payload as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) throw new Error("OpenStreetMap returned an invalid store catalog.");

  const imported: ImportedStore[] = [];
  const seen = new Set<string>();
  for (const candidate of elements as OverpassElement[]) {
    if (!candidate || !Number.isInteger(candidate.id) || typeof candidate.type !== "string") continue;
    const tags = candidate.tags;
    const name = text(tags?.name);
    if (!name) continue;

    const externalId = `${candidate.type}/${candidate.id}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    const formattedAddress = [
      tags?.["addr:housenumber"],
      tags?.["addr:street"],
      tags?.["addr:suburb"],
      tags?.["addr:city"],
      tags?.["addr:postcode"],
    ].map(text).filter((part): part is string => part !== null).join(", ");
    const address = text(tags?.["addr:full"]) ?? (formattedAddress || "Pune, Maharashtra, India");

    const email = text(tags?.["contact:email"] ?? tags?.email);
    imported.push({
      name: name.slice(0, 100),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
      address: address.slice(0, 400),
      description: text(tags?.description) ?? "",
      imageUrl: usableImageUrl(tags?.image),
      externalId,
    });
    if (imported.length >= limit) break;
  }
  return imported;
}

export function parseNominatimStores(payload: unknown, limit: number): ImportedStore[] {
  if (!Array.isArray(payload)) throw new Error("Nominatim returned an invalid store catalog.");

  const imported: ImportedStore[] = [];
  const seen = new Set<string>();
  for (const candidate of payload as NominatimPlace[]) {
    if (!candidate || !Number.isInteger(candidate.osm_id) || !candidate.osm_type) continue;
    if (candidate.category !== "amenity" && candidate.category !== "shop") continue;
    const name = text(candidate.name);
    if (!name) continue;

    const externalId = `${candidate.osm_type}/${candidate.osm_id}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    const address = candidate.address ?? {};
    const formattedAddress = [
      address.house_number,
      address.road,
      address.residential,
      address.neighbourhood,
      address.suburb,
      address.city ?? address.town ?? address.village,
      address.state,
      address.postcode,
      address.country,
    ].map(text).filter((part): part is string => part !== null);
    const email = text(candidate.extratags?.email);

    imported.push({
      name: name.slice(0, 100),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
      address: (formattedAddress.join(", ") || "Pune, Maharashtra, India").slice(0, 400),
      description: text(candidate.extratags?.description) ?? "",
      imageUrl: usableImageUrl(candidate.extratags?.image),
      externalId,
    });
    if (imported.length >= limit) break;
  }
  return imported;
}

export function parseOpenFoodFactsProducts(payload: unknown, limit: number): ImportedProduct[] {
  if (typeof payload !== "object" || payload === null || !("products" in payload)) {
    throw new Error("Open Food Facts returned an invalid product catalog.");
  }
  const products = (payload as { products?: unknown }).products;
  if (!Array.isArray(products)) throw new Error("Open Food Facts returned an invalid product catalog.");

  const imported: ImportedProduct[] = [];
  const seen = new Set<string>();
  for (const candidate of products as OpenFoodFactsProduct[]) {
    const externalId = text(candidate?.code);
    const name = text(candidate?.product_name);
    if (!externalId || !name || seen.has(externalId)) continue;
    seen.add(externalId);
    imported.push({
      name: name.slice(0, 120),
      description: "",
      category: text(candidate.categories)?.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 3).join(", ").slice(0, 200) ?? null,
      brand: text(candidate.brands)?.slice(0, 200) ?? null,
      quantity: text(candidate.quantity)?.slice(0, 120) ?? null,
      imageUrl: usableImageUrl(candidate.image_front_url),
      externalId,
    });
    if (imported.length >= limit) break;
  }
  return imported;
}

export function parseOpenPricesProducts(payload: unknown, limit: number): ImportedPricedProduct[] {
  if (typeof payload !== "object" || payload === null || !("items" in payload)) {
    throw new Error("Open Prices returned an invalid price catalog.");
  }
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) throw new Error("Open Prices returned an invalid price catalog.");

  const latestByCode = new Map<string, ImportedPricedProduct & { observedDate: string }>();
  for (const candidate of items as OpenPricesPrice[]) {
    const externalId = text(candidate?.product_code) ?? text(candidate?.product?.code);
    const name = text(candidate?.product_name) ?? text(candidate?.product?.product_name);
    const price = typeof candidate?.price === "number" || typeof candidate?.price === "string"
      ? Number(candidate.price)
      : Number.NaN;
    const observedDate = text(candidate?.date);
    if (
      !externalId ||
      !/^\d{8,14}$/.test(externalId) ||
      !name ||
      candidate?.currency !== "INR" ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !observedDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(observedDate)
    ) continue;

    const prior = latestByCode.get(externalId);
    if (prior && prior.observedDate >= observedDate) continue;

    const product = candidate.product;
    const quantity = text(product?.quantity) ?? [
      text(product?.product_quantity),
      text(product?.product_quantity_unit),
    ].filter((part): part is string => part !== null).join(" ");
    latestByCode.set(externalId, {
      name: name.slice(0, 120),
      price,
      description: "",
      category: product?.categories_tags?.map(text).filter((part): part is string => part !== null).slice(0, 3).join(", ").slice(0, 200) || null,
      brand: text(product?.brands)?.slice(0, 200) ?? null,
      quantity: quantity?.slice(0, 120) ?? null,
      imageUrl: usableImageUrl(product?.image_url),
      externalId,
      observedDate,
    });
  }

  return [...latestByCode.values()]
    .sort((left, right) => right.observedDate.localeCompare(left.observedDate) || left.externalId.localeCompare(right.externalId))
    .slice(0, limit)
    .map(({ observedDate: _observedDate, ...product }) => product);
}
