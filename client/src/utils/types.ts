export type Role = "admin" | "user" | "owner";

export type User = {
  id: number;
  name: string;
  email: string;
  address: string;
  role: Role;
};

export type StoreRow = {
  id: number;
  name: string;
  email?: string | null;
  address: string;
  description?: string;
  imageUrl?: string | null;
  externalSource?: string | null;
  externalId?: string | null;
  ownerId?: number | null;
  averageRating: number;
  ratingCount: number;
  userRating?: number | null;
  userReview?: string | null;
};

export type RatingRow = {
  id: number;
  storeId: number;
  score: number;
  updatedAt: string;
  userName: string;
  userEmail: string;
};

export type Stats = { totalUsers: number; totalStores: number; totalRatings: number };
export type AuthResponse = { token: string; user: User };

export const roleNames: Record<Role, string> = {
  admin: "Administrator",
  user: "Normal user",
  owner: "Store owner",
};
