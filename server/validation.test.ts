import assert from "node:assert/strict";
import test from "node:test";
import { loginSchema, personSchema, productPriceSchema, productRatingSubmissionSchema, productSchema, ratingSubmissionSchema, storeSchema } from "./validation.js";

test("person validation enforces name length, address length, email, and password rules", () => {
  const validPerson = {
    name: "Alexandra Community Member",
    email: "alexandra@example.com",
    address: "Portland",
    password: "ValidPass!2026",
  };
  assert.equal(personSchema.safeParse(validPerson).success, true);
  assert.equal(personSchema.safeParse({ ...validPerson, name: "Too short" }).success, false);
  assert.equal(personSchema.safeParse({ ...validPerson, email: "not-an-email" }).success, false);
  assert.equal(personSchema.safeParse({ ...validPerson, address: "a".repeat(401) }).success, false);
  assert.equal(personSchema.safeParse({ ...validPerson, password: "lowercase!1" }).success, false);
  assert.equal(personSchema.safeParse({ ...validPerson, password: "Uppercase " }).success, false);
});

test("login validation requires a valid email and a non-empty password", () => {
  assert.equal(loginSchema.safeParse({ email: "person@example.com", password: "pass" }).success, true);
  assert.equal(loginSchema.safeParse({ email: "not-an-email", password: "pass" }).success, false);
  assert.equal(loginSchema.safeParse({ email: "person@example.com", password: "" }).success, false);
});

test("store validation requires a valid contact, address, and owner id", () => {
  const validStore = {
    name: "Neighborhood Market",
    email: "market@example.com",
    address: "14 Main Street",
    ownerId: "12",
  };
  const parsed = storeSchema.safeParse(validStore);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.ownerId, 12);
  assert.equal(storeSchema.safeParse({ ...validStore, ownerId: "0" }).success, false);
  assert.equal(storeSchema.safeParse({ ...validStore, address: "" }).success, false);
});

test("store ratings accept only integer scores from one through five", () => {
  for (const rating of [1, 2, 3, 4, 5]) {
    assert.equal(ratingSubmissionSchema.safeParse({ storeId: 1, rating }).success, true);
  }
  for (const rating of [0, 6, 2.5]) {
    assert.equal(ratingSubmissionSchema.safeParse({ storeId: 1, rating }).success, false);
  }
});

test("product validation rejects negative prices and accepts catalog fields without sourced descriptions", () => {
  const validProduct = {
    name: "Daily Roast Coffee",
    price: "14.99",
    description: "Medium-roast coffee for an everyday cup.",
    specialFeature: "Small-batch roasted.",
  };
  const parsed = productSchema.safeParse(validProduct);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.price, 14.99);
  assert.equal(productSchema.safeParse({ ...validProduct, price: "-1" }).success, false);
  assert.equal(productSchema.safeParse({ ...validProduct, description: " " }).success, true);
  assert.equal(productSchema.safeParse({ ...validProduct, imageUrl: "" }).success, true);
  assert.equal(productSchema.safeParse({ ...validProduct, imageUrl: "https://images.example/item.jpg" }).success, true);
  assert.equal(productSchema.safeParse({ ...validProduct, imageUrl: "not-a-url" }).success, false);
});

test("product price updates accept non-negative currency values only", () => {
  const parsed = productPriceSchema.safeParse({ price: "14.99" });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.price, 14.99);
  assert.equal(productPriceSchema.safeParse({ price: "0" }).success, true);
  assert.equal(productPriceSchema.safeParse({ price: "-1" }).success, false);
  assert.equal(productPriceSchema.safeParse({ price: "not-a-price" }).success, false);
});

test("product ratings accept only integer scores from one through five", () => {
  for (const rating of [1, 2, 3, 4, 5]) {
    assert.equal(productRatingSubmissionSchema.safeParse({ productId: 1, rating }).success, true);
  }
  for (const rating of [0, 6, 2.5]) {
    assert.equal(productRatingSubmissionSchema.safeParse({ productId: 1, rating }).success, false);
  }
  assert.equal(productRatingSubmissionSchema.safeParse({ productId: 0, rating: 5 }).success, false);
  assert.equal(productRatingSubmissionSchema.safeParse({ productId: 1, rating: 5, review: "A useful review." }).success, true);
  assert.equal(productRatingSubmissionSchema.safeParse({ productId: 1, rating: 5, review: "x".repeat(5001) }).success, false);
});
