import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(16, "Password must be at most 16 characters.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[^A-Za-z0-9\s]/, "Password must include a special character.");

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z.string().min(1, "Password is required."),
});

export const registrationSchema = z.object({
  name: z.string().trim().min(20, "Name must be at least 20 characters.").max(60),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  address: z.string().trim().min(1, "Address is required.").max(400),
  password: passwordSchema,
});

export const adminUserSchema = registrationSchema.extend({
  role: z.enum(["admin", "user", "owner"]),
});

export const storeSchema = z.object({
  name: z.string().trim().min(1, "Store name is required.").max(100),
  email: z.union([z.string().trim().email("Enter a valid store contact email.").max(255), z.literal("")]).optional(),
  address: z.string().trim().min(1, "Store address is required.").max(400),
  ownerId: z.coerce.number().int().positive("Select a store owner."),
});

export const storeOwnerAssignmentSchema = z.object({
  ownerId: z.number().int().positive().nullable(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: passwordSchema,
});

export const ratingSubmissionSchema = z.object({
  storeId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().max(5000).optional(),
});

export const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required.").max(120),
  price: z.coerce.number().finite().min(0, "Price cannot be negative.").max(9_999_999_999.99, "Price is too large."),
  description: z.string().trim().min(1, "Product description is required.").max(2000),
  specialFeature: z.string().trim().min(1, "A special feature is required.").max(500),
});

export const productPriceSchema = z.object({
  price: z.coerce.number().finite().min(0, "Price cannot be negative.").max(9_999_999_999.99, "Price is too large."),
});

export const productRatingSubmissionSchema = z.object({
  productId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().max(5000).optional(),
});
