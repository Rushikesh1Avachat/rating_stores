export type Product = {
  id: number;
  storeId?: number | null;
  storeName?: string | null;
  name: string;
  price: number | null;
  description: string;
  category?: string | null;
  brand?: string | null;
  quantity?: string | null;
  imageUrl?: string | null;
  externalSource?: string | null;
  externalId?: string | null;
  specialFeature: string;
  averageRating: number;
  ratingCount: number;
  userRating: number | null;
  userReview?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeProducts(value: unknown): Product[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): Product[] => {
    if (!isRecord(item)) return [];
    const id = finiteNumber(item.id);
    if (id === null || !Number.isInteger(id) || id < 1) return [];

    const averageRating = finiteNumber(item.averageRating);
    const ratingCount = finiteNumber(item.ratingCount);
    const userRating = finiteNumber(item.userRating);
    const price = finiteNumber(item.price);

    return [{
      id,
      storeId: finiteNumber(item.storeId),
      storeName: typeof item.storeName === "string" ? item.storeName : null,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Unnamed product",
      price: price !== null && price >= 0 ? price : null,
      description: typeof item.description === "string" ? item.description.trim() : "",
      category: typeof item.category === "string" ? item.category.trim() : null,
      brand: typeof item.brand === "string" ? item.brand.trim() : null,
      quantity: typeof item.quantity === "string" ? item.quantity.trim() : null,
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
      externalSource: typeof item.externalSource === "string" ? item.externalSource : null,
      externalId: typeof item.externalId === "string" ? item.externalId : null,
      specialFeature: typeof item.specialFeature === "string" ? item.specialFeature.trim() : "",
      averageRating: averageRating !== null && averageRating >= 0 && averageRating <= 5 ? averageRating : 0,
      ratingCount: ratingCount !== null && ratingCount >= 0 ? Math.floor(ratingCount) : 0,
      userRating: userRating !== null && Number.isInteger(userRating) && userRating >= 1 && userRating <= 5
        ? userRating
        : null,
      userReview: typeof item.userReview === "string" ? item.userReview : null,
    }];
  });
}

export function formatProductPrice(price: number | null) {
  return price === null
    ? "Price unavailable"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(price);
}
