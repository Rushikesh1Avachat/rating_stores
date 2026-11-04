import assert from "node:assert/strict";
import test from "node:test";
import { parseNominatimStores, parseOpenFoodFactsProducts, parseOpenPricesProducts, parseOverpassStores, usableImageUrl } from "./public-data.js";

test("OpenStreetMap import keeps named local businesses and stable source IDs", () => {
  const stores = parseOverpassStores({
    elements: [
      { type: "node", id: 21, tags: { name: "Local Pharmacy", shop: "chemist", "addr:street": "MG Road", "addr:city": "Pune", email: "hello@pharmacy.test" } },
      { type: "way", id: 22, tags: { shop: "bakery" } },
      { type: "node", id: 21, tags: { name: "Duplicate listing", shop: "chemist" } },
    ],
  }, 10);
  assert.equal(stores.length, 1);
  assert.equal(stores[0]?.externalId, "node/21");
  assert.equal(stores[0]?.address, "MG Road, Pune");
  assert.equal(stores[0]?.email, "hello@pharmacy.test");
});

test("Nominatim import keeps named Pune businesses with stable OpenStreetMap IDs", () => {
  const stores = parseNominatimStores([
    {
      osm_type: "node",
      osm_id: 123,
      name: "Pune Cafe",
      category: "amenity",
      type: "cafe",
      address: { road: "Main Road", city: "Pune", state: "Maharashtra", country: "India" },
      extratags: { email: "hello@cafe.example", image: "https://images.example/cafe.jpg" },
    },
    { osm_type: "way", osm_id: 456, name: "", category: "amenity", type: "restaurant" },
    { osm_type: "node", osm_id: 789, name: "Unrelated place", category: "tourism", type: "hotel" },
  ], 50);

  assert.deepEqual(stores, [{
    name: "Pune Cafe",
    email: "hello@cafe.example",
    address: "Main Road, Pune, Maharashtra, India",
    description: "",
    imageUrl: "https://images.example/cafe.jpg",
    externalId: "node/123",
  }]);
});

test("Open Food Facts import skips unnamed products and does not invent a price", () => {
  const products = parseOpenFoodFactsProducts({
    products: [
      { code: "8901000000001", product_name: "Packaged Food", brands: "Local Brand", categories: "Food, Snacks", quantity: "100 g", image_front_url: "https://images.openfoodfacts.org/item.jpg" },
      { code: "8901000000002", product_name: "" },
    ],
  }, 10);
  assert.equal(products.length, 1);
  assert.equal(products[0]?.externalId, "8901000000001");
  assert.equal(products[0]?.category, "Food, Snacks");
  assert.equal(products[0]?.imageUrl, "https://images.openfoodfacts.org/item.jpg");
  assert.equal("price" in (products[0] ?? {}), false);
});

test("Open Prices import keeps the newest verified INR price for each named product", () => {
  const products = parseOpenPricesProducts({
    items: [
      { product_code: "8901234567890", product_name: "Test Snack", price: 25, currency: "INR", date: "2025-01-02", product: { brands: "Test Brand", image_url: "https://images.example/snack.jpg" } },
      { product_code: "8901234567890", product_name: "Test Snack", price: 30, currency: "INR", date: "2025-03-04", product: { brands: "Test Brand" } },
      { product_code: "8901234567891", product_name: "Foreign price", price: 2, currency: "USD", date: "2025-03-04" },
      { product_code: "8901234567892", product_name: "Invalid price", price: -1, currency: "INR", date: "2025-03-04" },
    ],
  }, 10);
  assert.equal(products.length, 1);
  assert.equal(products[0]?.externalId, "8901234567890");
  assert.equal(products[0]?.price, 30);
  assert.equal(products[0]?.brand, "Test Brand");
  assert.equal(products[0]?.imageUrl, null);
});

test("catalog image URLs must use HTTPS", () => {
  assert.equal(usableImageUrl("https://images.example.org/item.png"), "https://images.example.org/item.png");
  assert.equal(usableImageUrl("http://images.example.org/item.png"), null);
  assert.equal(usableImageUrl("javascript:alert(1)"), null);
});
