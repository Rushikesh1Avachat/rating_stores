import { z } from "zod";
import { request } from "./utils/api";
import {
  adminUserSchema,
  loginSchema,
  productSchema,
  productPriceSchema,
  registrationSchema,
  storeSchema,
} from "./utils/validation";
import type { Product } from "./utils/products";
import type { AuthResponse, Stats, StoreRow, User } from "./utils/types";

type LoginInput = z.infer<typeof loginSchema>;
type RegistrationInput = z.infer<typeof registrationSchema>;
type AdminUserInput = z.infer<typeof adminUserSchema>;
type StoreInput = z.infer<typeof storeSchema>;
type ProductInput = z.infer<typeof productSchema>;
type ProductPriceInput = z.infer<typeof productPriceSchema>;

export type AdminUser = User & { assignedStoreRatingAverage?: number | null };
export type AdminStore = StoreRow & { email?: string | null; createdAt?: string };
export type DirectoryPage<T> = { total: number; page: number; pageSize: number; } & T;
export type CatalogPage<T> = { total: number; page: number; pageSize: number; } & T;
export type OwnerDashboard = {
  store: { id: number; name: string; address: string; averageRating: number; totalRatings: number } | null;
  ratings: { id: number; rating: number; createdAt: string; userName: string; userEmail: string }[];
};

function queryString(params: URLSearchParams) {
  const search = params.toString();
  return search ? `?${search}` : "";
}

export const authService = {
  me: (signal?: AbortSignal) => request<{ user: User }>("/auth/me", { signal }),
  authenticate: (credentials: LoginInput | RegistrationInput, mode: "login" | "signup") =>
    request<AuthResponse>(mode === "login" ? "/auth/login" : "/auth/register", {
      method: "POST",
      body: JSON.stringify(credentials),
    }),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ message: string }>("/auth/change-password", {
      method: "PATCH",
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
};

export const storeService = {
  list: (params: URLSearchParams, signal?: AbortSignal) =>
    request<CatalogPage<{ stores: StoreRow[] }>>(`/stores${queryString(params)}`, { signal }),
  products: <T = Product>(storeId: number, params: URLSearchParams, signal?: AbortSignal) =>
    request<CatalogPage<{ products: T[] }>>(`/stores/${storeId}/products${queryString(params)}`, { signal }),
};

export const ratingService = {
  submitStore: (storeId: number, rating: number, review?: string) =>
    request<{ rating: { id: number; storeId: number; userId: number; rating: number } }>("/ratings", {
      method: "POST",
      body: JSON.stringify({ storeId, rating, review }),
    }),
  submitProduct: (productId: number, rating: number, review?: string) =>
    request<{
      rating: { rating: number };
      averageRating: number;
      ratingCount: number;
    }>(`/products/${productId}/ratings`, {
      method: "POST",
      body: JSON.stringify({ rating, review }),
    }),
  deleteStore: (storeId: number) =>
    request<void>(`/stores/${storeId}/rating`, { method: "DELETE" }),
  deleteProduct: (productId: number) =>
    request<void>(`/products/${productId}/ratings`, { method: "DELETE" }),
};

export const adminService = {
  metrics: (signal?: AbortSignal) => request<Stats>("/admin/metrics", { signal }),
  users: (params: URLSearchParams, signal?: AbortSignal) =>
    request<DirectoryPage<{ users: AdminUser[] }>>(`/admin/users${queryString(params)}`, { signal }),
  stores: (params: URLSearchParams, signal?: AbortSignal) =>
    request<DirectoryPage<{ stores: AdminStore[] }>>(`/admin/stores${queryString(params)}`, { signal }),
  availableStoreOwners: (storeId?: number) => request<{ users: User[] }>(
    storeId ? `/admin/store-owners?storeId=${storeId}` : "/admin/store-owners",
  ),
  assignStoreOwner: (storeId: number, ownerId: number | null) =>
    request<{ store: AdminStore }>(`/admin/stores/${storeId}/owner`, {
      method: "PATCH",
      body: JSON.stringify({ ownerId }),
    }),
  createDirectoryRecord: (data: AdminUserInput | StoreInput) => "ownerId" in data
    ? request<{ store: AdminStore }>("/admin/stores", { method: "POST", body: JSON.stringify(data) })
    : request<{ user: User }>("/admin/users", { method: "POST", body: JSON.stringify(data) }),
};

export const ownerService = {
  dashboard: (signal?: AbortSignal) => request<OwnerDashboard>("/owner/dashboard", { signal }),
};

export const productService = {
  list: <T = Product>(params: URLSearchParams, signal?: AbortSignal) =>
    request<CatalogPage<{ products: T[] }>>(`/products${queryString(params)}`, { signal }),
  myRatingCount: (signal?: AbortSignal) => request<{ count: number }>("/products/my-ratings", { signal }),
  create: (data: ProductInput) =>
    request<{ product: Product }>("/admin/products", { method: "POST", body: JSON.stringify(data) }),
  updatePrice: (productId: number, data: ProductPriceInput) =>
    request<{ product: { id: number; price: number } }>(`/admin/products/${productId}/price`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export type { LoginInput, RegistrationInput, AdminUserInput, StoreInput, ProductInput };
