import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, Package, Plus, Star, X } from "lucide-react";
import { Field } from "./FormControls";
import { errorMessage } from "../utils/format";
import { productService, ratingService } from "../services";
import { productPriceSchema, productRatingSubmissionSchema, productSchema } from "../utils/validation";
import { normalizeProducts, type Product } from "../utils/products";
import { EmptyState, ErrorState, LoadingState, ProductGrid, RatingModal, SearchBar } from "./ProductCatalog";

type Notify = (message: string, type?: "success" | "error") => void;

export function ProductPage({ mode, notify }: { mode: "admin" | "user"; notify: Notify }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [ratedProductCount, setRatedProductCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [priceProduct, setPriceProduct] = useState<Product | null>(null);
  const [ratingProductId, setRatingProductId] = useState<number | null>(null);
  const [selection, setSelection] = useState(0);
  const [review, setReview] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ sortBy: "name", order: "asc", page: String(page), pageSize: "9" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    setLoading(true);
    const catalogRequest = productService.list<Product>(params, controller.signal);
    const ratingCountRequest = mode === "user"
      ? productService.myRatingCount(controller.signal)
      : Promise.resolve({ count: 0 });
    setLoadError("");
    Promise.all([catalogRequest, ratingCountRequest])
      .then(([catalogPage, ratingCount]) => {
        if (controller.signal.aborted) return;
        const rows = catalogPage.products;
        if (!Array.isArray(rows) || !Number.isInteger(ratingCount.count)) {
          throw new Error("The server returned an invalid product catalog.");
        }
        const catalog = normalizeProducts(rows);
        setProducts(catalog);
        setRatedProductCount(ratingCount.count);
        setTotal(catalogPage.total);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(error, "Unable to load products."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedSearch, page, refresh, notify]);

  const selectedProduct = products.find((product) => product.id === ratingProductId);

  async function saveRating() {
    if (!ratingProductId || selection < 1) return;
    const productBeingRated = products.find((product) => product.id === ratingProductId);
    if (!productBeingRated) return;
    setRatingBusy(true);
    try {
      const rating = productRatingSubmissionSchema.parse({ productId: ratingProductId, rating: selection, review });
      const result = await ratingService.submitProduct(rating.productId, rating.rating, rating.review);
      setProducts((current) => current.map((product) => product.id === ratingProductId
        ? {
          ...product,
          userRating: result.rating.rating,
          userReview: rating.review || null,
          averageRating: result.averageRating,
          ratingCount: result.ratingCount,
        }
        : product));
      if (productBeingRated.userRating === null) {
        setRatedProductCount((count) => count + 1);
      }
      setRatingProductId(null);
      setSelection(0);
      notify("Your product rating has been saved.");
    } catch (error) {
      notify(errorMessage(error, "Could not save your product rating."), "error");
    } finally {
      setRatingBusy(false);
    }
  }

  async function removeRating() {
    if (!ratingProductId) return;
    setRatingBusy(true);
    try {
      await ratingService.deleteProduct(ratingProductId);
      setRatingProductId(null);
      setSelection(0);
      setReview("");
      setRefresh((value) => value + 1);
      notify("Your product rating has been removed.");
    } catch (error) {
      notify(errorMessage(error, "Could not remove your product rating."), "error");
    } finally {
      setRatingBusy(false);
    }
  }

  return (
    <div className={`content-wrap product-catalog-content ${mode === "user" ? "product-discover-page" : ""}`}>
      <div className="product-toolbar">
        <div className="product-heading-copy">
          <span className="section-kicker">{mode === "admin" ? "PRODUCT DIRECTORY" : "THE PRODUCT CATALOG"}</span>
          <h1>{mode === "admin" ? "Products" : "Discover products"}</h1>
          <p>{mode === "admin"
            ? "Manage products and add current prices for the discovery catalog."
            : "Explore products with real INR prices reported to Open Prices. Price and availability can vary by retailer."}</p>
        </div>
        <div className="product-toolbar-actions">
          <SearchBar value={search} onChange={(value) => { setPage(1); setSearch(value); }} />
          {mode === "admin" && <button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> Add product</button>}
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => setRefresh((value) => value + 1)} />
      ) : products.length ? (
        <ProductGrid
          products={products}
          mode={mode}
          onRate={(product) => {
            setRatingProductId(product.id);
            setSelection(product.userRating ?? 0);
            setReview(product.userReview ?? "");
          }}
          onEditPrice={mode === "admin" ? setPriceProduct : undefined}
        />
      ) : (
        <EmptyState
          search={search}
          mode={mode}
          onClear={() => setSearch("")}
          onCreate={() => setCreateOpen(true)}
        />
      )}
      {!loading && !loadError && total > 9 && (
        <div className="catalog-pagination">
          <button className="button button-quiet" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Page {page} of {Math.ceil(total / 9)}</span>
          <button className="button button-quiet" disabled={page >= Math.ceil(total / 9)} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      )}

      {mode === "user" && (
        <div className="product-rating-summary">
          <Star size={15} />
          <span><b>{ratedProductCount}</b> {ratedProductCount === 1 ? "product rated" : "products rated"} by you</span>
        </div>
      )}

      {createOpen && (
        <ProductCreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setRefresh((value) => value + 1);
            notify("Product saved to the catalog.");
          }}
          notify={notify}
        />
      )}
      {priceProduct && (
        <ProductPriceDialog
          product={priceProduct}
          onClose={() => setPriceProduct(null)}
          onSaved={(price) => {
            setProducts((current) => current.map((product) => product.id === priceProduct.id ? { ...product, price } : product));
            setPriceProduct(null);
            notify("Product price updated and available in Discover.");
          }}
          notify={notify}
        />
      )}
      {selectedProduct && (
        <RatingModal
          product={selectedProduct}
          selection={selection}
          busy={ratingBusy}
          review={review}
          onSelect={setSelection}
          onReview={setReview}
          onClose={() => setRatingProductId(null)}
          onSubmit={saveRating}
          onDelete={removeRating}
        />
      )}
    </div>
  );
}

export const ProductsView = ProductPage;

function ProductPriceDialog({ product, onClose, onSaved, notify }: {
  product: Product;
  onClose: () => void;
  onSaved: (price: number) => void;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const parsed = productPriceSchema.safeParse(data);
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Enter a valid product price.", "error");
      return;
    }
    setBusy(true);
    try {
      const { product: updatedProduct } = await productService.updatePrice(product.id, parsed.data);
      onSaved(updatedProduct.price);
    } catch (error) {
      notify(errorMessage(error, "Unable to update product price."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="modal-card product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-price-title">
        <button className="modal-close" onClick={onClose} aria-label="Close" disabled={busy}><X size={19} /></button>
        <div className="modal-symbol"><Package size={21} /></div>
        <span className="section-kicker">PRODUCT CATALOG</span>
        <h2 id="product-price-title">Set product price</h2>
        <p className="modal-description">{product.name}. Enter the current price to show it on Discover.</p>
        <form className="modal-form" onSubmit={submit}>
          <Field label="Price (INR)">
            <input name="price" type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" required defaultValue={product.price ?? ""} placeholder="0.00" />
          </Field>
          <div className="modal-actions">
            <button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save price"}<ChevronRight size={16} /></button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ProductCreateDialog({ onClose, onCreated, notify }: { onClose: () => void; onCreated: () => void; notify: Notify }) {
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const parsed = productSchema.safeParse(data);
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Check the entered product details.", "error");
      return;
    }
    setBusy(true);
    try {
      await productService.create(parsed.data);
      onCreated();
    } catch (error) {
      notify(errorMessage(error, "Unable to save product."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="modal-card product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-create-title">
        <button className="modal-close" onClick={onClose} aria-label="Close" disabled={busy}><X size={19} /></button>
        <div className="modal-symbol"><Package size={21} /></div>
        <span className="section-kicker">GROW THE CATALOG</span>
        <h2 id="product-create-title">Add a product</h2>
        <p className="modal-description">Share product details so customers can discover and rate it.</p>
        <form className="modal-form" onSubmit={submit}>
          <Field label="Product name"><input name="name" required maxLength={120} placeholder="e.g. Daily Roast Coffee" /></Field>
          <Field label="Price"><input name="price" type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" required placeholder="0.00" /></Field>
          <Field label="Description"><textarea name="description" maxLength={2000} rows={3} placeholder="Describe the product" /></Field>
          <Field label="Category"><input name="category" maxLength={200} placeholder="Product category" /></Field>
          <Field label="Brand"><input name="brand" maxLength={200} placeholder="Brand (optional)" /></Field>
          <Field label="Image URL"><input name="imageUrl" type="url" placeholder="https://…" /></Field>
          <Field label="Special feature"><input name="specialFeature" maxLength={500} placeholder="What makes it stand out?" /></Field>
          <div className="modal-actions">
            <button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save product"}<ChevronRight size={16} /></button>
          </div>
        </form>
      </section>
    </div>
  );
}
