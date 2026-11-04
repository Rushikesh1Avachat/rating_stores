import { useEffect, useState } from "react";
import { BadgeCheck, ChevronRight, Package, Plus, Search, Sparkles, Star, X } from "lucide-react";
import { StarPicker } from "./FormControls";
import { formatProductPrice, type Product } from "../utils/products";

type CatalogMode = "admin" | "user";

export function SearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="search-wrap product-search">
      <Search size={16} aria-hidden="true" />
      <input
        aria-label="Search products by name or description"
        placeholder="Search products..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button className="clear-search" type="button" aria-label="Clear product search" onClick={() => onChange("")}>
          <X size={15} />
        </button>
      )}
    </label>
  );
}

export function StarRating({ averageRating, ratingCount }: { averageRating: number; ratingCount: number }) {
  return (
    <span
      className="product-rating"
      aria-label={ratingCount ? `${averageRating.toFixed(1)} out of 5 stars, ${ratingCount} ratings` : "No ratings yet"}
    >
      <Star size={14} fill={ratingCount ? "currentColor" : "none"} aria-hidden="true" />
      {ratingCount ? averageRating.toFixed(1) : "—"}
      <small>({ratingCount})</small>
    </span>
  );
}

export function ProductCard({ product, mode, onRate, onEditPrice }: {
  product: Product;
  mode: CatalogMode;
  onRate: (product: Product) => void;
  onEditPrice?: (product: Product) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className="product-card">
      <div className="product-card-top">
        <span className="product-icon product-image" aria-hidden="true">
          {product.imageUrl && !imageFailed
            ? <img src={product.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
            : <Package size={20} />}
        </span>
        <span className="product-price">{formatProductPrice(product.price)}</span>
        {mode === "admin" && onEditPrice && (
          <button type="button" className="button button-quiet product-price-edit" onClick={() => onEditPrice(product)}>
            {product.price === null ? "Set price" : "Edit price"}
          </button>
        )}
      </div>
      <h3>{product.name}</h3>
      {product.brand && <p className="product-brand">{product.brand}</p>}
      {product.category && <p className="product-category">{product.category}</p>}
      <p className="product-description">{product.description || product.quantity || "No description provided."}</p>
      {product.externalSource === "openfoodfacts" && product.externalId && (
        <a className="product-attribution" href={`https://world.openfoodfacts.org/product/${encodeURIComponent(product.externalId)}`} target="_blank" rel="noreferrer">
          Product data: Open Food Facts
        </a>
      )}
      {product.externalSource === "openprices" && product.externalId && (
        <div className="product-attribution">
          Price data: <a href="https://prices.openfoodfacts.org/" target="_blank" rel="noreferrer">Open Prices</a>
          {" · "}
          <a href={`https://world.openfoodfacts.org/product/${encodeURIComponent(product.externalId)}`} target="_blank" rel="noreferrer">Product details</a>
        </div>
      )}
      {product.externalSource === "admin" && (
        <div className="product-attribution">
          Price provided by administrator
          {product.externalId && (
            <>
              {" · "}
              <a href={`https://world.openfoodfacts.org/product/${encodeURIComponent(product.externalId)}`} target="_blank" rel="noreferrer">Product details</a>
            </>
          )}
        </div>
      )}
      {product.specialFeature && <div className="product-feature">
        <Sparkles size={15} aria-hidden="true" />
        <span><b>Special feature</b>{product.specialFeature || "No special feature listed."}</span>
      </div>}
      <div className="product-card-footer">
        <StarRating averageRating={product.averageRating} ratingCount={product.ratingCount} />
        {mode === "user" ? (
          <button
            type="button"
            className={`rate-action ${product.userRating ? "rated" : ""}`}
            onClick={() => onRate(product)}
            aria-label={product.userRating
              ? `Update your ${product.userRating}-star rating for ${product.name}`
              : `Rate ${product.name}`}
          >
            {product.userRating
              ? <><Star size={14} fill="currentColor" aria-hidden="true" /> Your rating: {product.userRating}</>
              : <><Plus size={15} aria-hidden="true" /> Rate product</>}
          </button>
        ) : (
          <span className="product-review-count">
            <BadgeCheck size={14} aria-hidden="true" /> {product.ratingCount} {product.ratingCount === 1 ? "rating" : "ratings"}
          </span>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({ products, mode, onRate, onEditPrice }: {
  products: Product[];
  mode: CatalogMode;
  onRate: (product: Product) => void;
  onEditPrice?: (product: Product) => void;
}) {
  return (
    <div className="product-grid">
      {products.map((product) => <ProductCard key={product.id} product={product} mode={mode} onRate={onRate} onEditPrice={onEditPrice} />)}
    </div>
  );
}

export function EmptyState({ search, mode, onClear, onCreate }: {
  search: string;
  mode: CatalogMode;
  onClear: () => void;
  onCreate: () => void;
}) {
  const title = search ? "No products found" : mode === "admin" ? "Your catalog is ready" : "No products yet";
  const copy = search
    ? "Try a different product name or search term."
    : mode === "admin"
      ? "Add a product to get the catalog started."
      : "Check back when the administrator adds products to the catalog.";

  return (
    <section className="panel product-empty">
      <div className="empty-state">
        <div className="empty-icon"><Package /></div>
        <h3>{title}</h3>
        <p>{copy}</p>
        {search
          ? <button className="button button-quiet" onClick={onClear}>Clear search</button>
          : mode === "admin" && <button className="button button-primary" onClick={onCreate}><Plus size={16} /> Add a product</button>}
      </div>
    </section>
  );
}

export function LoadingState() {
  return (
    <div className="product-grid" role="status" aria-label="Loading products">
      {[1, 2, 3].map((item) => <div className="product-skeleton" key={item} aria-hidden="true" />)}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="panel product-empty product-load-error" role="alert">
      <div className="empty-state">
        <div className="empty-icon"><Package /></div>
        <h3>Products couldn’t be loaded</h3>
        <p>{message}</p>
        <button className="button button-primary" onClick={onRetry}>Try again</button>
      </div>
    </section>
  );
}

export function RatingModal({ product, selection, busy, review, onSelect, onReview, onClose, onSubmit, onDelete }: {
  product: Product;
  selection: number;
  busy: boolean;
  review: string;
  onSelect: (rating: number) => void;
  onReview: (review: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="modal-card rating-modal" role="dialog" aria-modal="true" aria-labelledby="product-rating-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close rating dialog" disabled={busy}>
          <X size={19} />
        </button>
        <div className="modal-symbol rating-symbol"><Star size={22} fill="currentColor" /></div>
        <span className="section-kicker">SHARE YOUR EXPERIENCE</span>
        <h2 id="product-rating-title">{product.userRating ? "Update your rating" : "Rate this product"}</h2>
        <p>How would you rate <b>{product.name}</b>?</p>
        <StarPicker value={selection} onChange={onSelect} large />
        <div className="rating-label" aria-live="polite">
          {["", "Not for me", "It was okay", "Pretty good", "Really good", "Absolutely love it!"][selection]}
        </div>
        <label className="rating-review-field">
          <span>Review <small>optional</small></span>
          <textarea value={review} maxLength={5000} rows={3} onChange={(event) => onReview(event.target.value)} placeholder="Share a little more about your experience" />
        </label>
        <div className="rating-modal-actions">
          {product.userRating && <button className="button button-quiet" type="button" disabled={busy} onClick={onDelete}>Remove rating</button>}
          <button className="button button-primary modal-submit" type="button" disabled={!selection || busy} onClick={onSubmit}>
            {busy ? "Saving…" : product.userRating ? "Update rating" : "Save rating"}<ChevronRight size={17} />
          </button>
        </div>
      </section>
    </div>
  );
}
