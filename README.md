            # Goodmark

A full-stack store-rating application with a Vite/React frontend, Express API, PostgreSQL, and Drizzle ORM. Users share one sign-in system; permissions and dashboards are based on their account role.

The frontend is contained in `client/` (Vite entry point, React source, and client styling configuration); the API and database code remain in `server/`.

## Client routes

- Public: `/login` and `/register`.
- Administrator (role-guarded): `/admin/dashboard` (also `/admin/metrics`), `/admin/users`, `/admin/stores`, and `/admin/products`.
- Store owner (role-guarded): `/owner/dashboard` (also `/owner/stats`).
- Normal user (role-guarded): `/stores`, `/products`, `/profile`, and `/profile/password`.

The client uses a shared auth context to restore the current signed-in user and role from the authenticated API session. Protected routes redirect signed-out visitors to `/login` and redirect users without the required role to their own workspace.

Store listings and ratings are loaded from PostgreSQL through the Express API; an empty catalog is shown as empty rather than being populated with client-side examples. The React client is organized into `assets/`, `components/`, `context/`, `hooks/`, `pages/`, `services.ts`, and `utils/`.

## Requirements

- Node.js 20+
- PostgreSQL 14+

## Setup

Install dependencies from both `server/` and `client/` directories with `npm install`. Run database commands and configure `.env` from `server/`.

1. Install dependencies with `npm install` in both `server/` and `client/`.
2. Create a PostgreSQL database (for example, `goodmark`).
3. Copy `server/.env.example` to `server/.env`; set `DATABASE_URL`, a private random `JWT_SECRET`, and unique `ADMIN_EMAIL` / `ADMIN_PASSWORD` values. The configured administrator password must meet the 8–16 character policy.
4. Back up the target PostgreSQL database before a schema change. For example, from PowerShell in `server/`: `pg_dump --format=custom --file=goodmark-backup.dump "$env:DATABASE_URL"`.
5. From `server/`, run `npm run db:migrate`. This applies Drizzle migrations transactionally. For an existing database with incomplete migration history, it verifies the historical schema and checksums before reconciling the migration ledger; it stops rather than guessing if the schema differs. Do not use `db:push` for normal deployments.
6. To create the first administrator only, set unique `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` values in `server/.env`, then run `npm run db:seed`. This idempotent command creates no sample users, stores, ratings, or products, and never overwrites an existing administrator.
7. Optionally import public catalog records with `npm run db:import:public` from `server/`. The defaults import up to 50 named Pune businesses from OpenStreetMap (Nominatim is used if Overpass is unavailable), products from Open Food Facts for India, and products with reported INR prices from Open Prices. Prices are matched by barcode, deduplicated to the latest report, and stored in PostgreSQL; no prices are invented. The normal-user product discovery API returns only products with a stored price, while administrators can still see the full product catalog. A failed source causes a nonzero exit even if another source succeeds.
8. Optionally load demonstration data with `npm run db:seed:demo` from `server/`. It is idempotent and adds three Pune stores with assigned owners, three normal users, and six ratings so every dashboard has something to show. It also removes rows left behind by the API verification script (`*@goodmark.test`).
9. Start the API in one terminal from `server/` with `npm run dev`.
10. Start the frontend in another terminal from `client/` with `npm run dev`. The app is at `http://localhost:5173`.

## Deployment

Deploy the frontend and API as separate services. For Vercel, set the project's **Root Directory** to `client`, use `npm run build` as the build command, and set **Output Directory** to `dist`. Vite writes the production files to `client/dist`.

Deploy `server/` to a Node.js host that runs the Express process, and configure its database and authentication environment variables there. Set `FRONTEND_URL` on the API host to the exact frontend origin, or a comma-separated list of exact origins (for example, `https://rating-stores.example,https://rating-stores-preview.example`). In the Vercel project, set `VITE_API_BASE_URL` to the deployed API base URL including `/api` (for example, `https://your-api-host.example/api`) and redeploy. Without this setting, the frontend uses `/api`, which is intended for local development through Vite's proxy.

The catalog import is optional. Public records are stored in PostgreSQL, not fetched as the permanent runtime data source. OpenStreetMap and Open Food Facts data are available under the Open Database License (ODbL); source attribution is shown in the catalog.

### Demo access and data provenance

After running `npm run db:seed:demo`, use `user.meera@goodmark.demo` to try the normal-user workspace or `owner.anjali@goodmark.demo` to try the store-owner workspace. The demo password for both is `DemoPass#1`. The administrator account is the one configured with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

The demo seed's three curated stores and six ratings are fixtures for exploring the workflows; they are not public-source records or verified community feedback. To populate the directory with real business listings, run `npm run db:import:public`. That import does not create ratings—ratings come from signed-in users submitting feedback.

## Roles

- **Administrator:** dashboard totals, searchable/sortable store and user directories, create accounts for all roles, register stores with a uniquely assigned owner, add products, and set prices for products in the rating catalog.
- **Normal user:** public registration, browse/search stores by name or address, submit/update/delete a 1–5 store rating, browse/search products with a real reported INR price, and submit/update/delete a 1–5 product rating.
- **Store owner:** dashboard with average ratings, rating totals, and the users who rated their linked stores.

All roles can update their password by confirming the current password and providing a new one, and can sign out. Passwords require 8–16 characters, at least one uppercase letter, and at least one special character. Account names are 20–60 characters; addresses may contain up to 400 characters. Administrator-created stores are assigned distinct owner accounts; public imported records may have no contact email or owner. Administrators can assign a store-owner account to an imported listing from the Stores directory; an owner can only be assigned to one store. Deleting an assigned owner is restricted.

## API

The Express API listens on `http://localhost:3000` by default. Vite proxies `/api` requests to it in development. Authentication uses a signed bearer token with a 12-hour lifetime. `GET /api/health` is available for a basic liveness check and `GET /api/ready` checks PostgreSQL connectivity.

- `POST /api/auth/register` accepts `{ name, email, password, address }` and creates a normal-user account. `POST /api/auth/login` accepts `{ email, password }`; `GET /api/auth/me` returns the authenticated profile.
- `PATCH /api/auth/change-password` accepts `{ oldPassword, newPassword }` for any signed-in role.
- `GET /api/admin/dashboard` (also `/api/admin/metrics`) returns database-derived user, store, and rating totals and is administrator-only.
- `GET /api/stores` returns paginated PostgreSQL results with `overallRating`, `ratingCount`, and (when authenticated) the current user's rating/review. It accepts case-insensitive `search`, `sortBy`, `order`, `page`, and `pageSize`.
- `GET /api/stores/:storeId/products` returns products associated with a store with rating aggregates and pagination.
- `POST /api/ratings` requires a normal-user token and accepts `{ "storeId": 1, "rating": 5, "review": "Optional text" }`. `PUT /api/stores/:storeId/rating` updates the signed-in user's rating; `DELETE /api/stores/:storeId/rating` deletes only that user's rating. The database enforces one rating per user and store.
- `GET /api/products` returns paginated PostgreSQL products with rating averages/counts and the current user's rating when signed in. Normal users receive only products with a stored price; administrators retain access to the full catalog. It accepts `search`, `sortBy` (`name`, `price`, `rating`, or `createdAt`), `order`, `page`, and `pageSize`.
- `POST /api/admin/products` requires an administrator token and accepts product catalog fields. `PATCH /api/admin/products/:productId/price` lets administrators set a non-negative INR price; the price is then displayed on the user discovery page. Public prices are imported from Open Prices and attributed on product cards; prices can vary by retailer and report date.
- `GET /api/products/:productId/ratings` returns the rating aggregate and, when authenticated, the current user's rating. `POST` and `PUT /api/products/:productId/ratings` submit/update the signed-in user's rating; `DELETE` removes only their own rating. `POST /api/product-ratings` remains as a compatibility route. The database enforces one rating per user and product.
- `POST /api/admin/stores` requires an administrator token and `{ "name", "email", "address", "ownerId" }`. Each store email and assigned owner must be unique.
- `PATCH /api/admin/stores/:storeId/owner` requires an administrator token and `{ "ownerId": 123 }` (or `null` to unassign); it supports assigning owners to previously imported stores.
- `GET /api/owner/dashboard` returns the assigned store's rating summary and individual ratings to its owner.
- `GET /api/admin/users` accepts `search`, `role`, `sortBy`, `order`, `page`, and `pageSize`; it never returns password hashes and includes each store owner's assigned-store average.
- `GET /api/admin/stores` accepts `search`, field filters, `sortBy`, `order`, `page`, and `pageSize`. Without pagination parameters, both admin directory endpoints return arrays; when `page` or `pageSize` is supplied, they return rows with `total`, `page`, and `pageSize`.

From `client/`, `npm run build` writes the production frontend to the repository-root `dist/`. From `server/`, `npm run build` type-checks the TypeScript projects and `npm test` runs the validation and public-data parsing regression tests. Keep the database connection string, administrator password, and signing secret server-side.

## Assignment checklist

- [x] PostgreSQL-backed users, stores, products, store ratings, and product ratings with foreign keys, rating-range checks, indexes, and unique user/item constraints.
- [x] Shared sign-in, bcrypt password hashing, signed expiring tokens, server-side role guards, and role-specific workspaces.
- [x] Admin metrics and searchable, sortable, paginated user/store directories; owner-only store performance and rating details.
- [x] Database-aggregated rating averages/counts and rating create/update/delete operations; no client-side mock catalogs or locally authoritative ratings.
- [x] Idempotent public store/product imports with stable external IDs; no invented customer identities, prices, or ratings.
- [x] Zod validation on both client and API for account, store, password, product, and rating submissions.
- [x] Debounced, case-insensitive server searches; loading, empty, error, and success states in the client.
- [x] Responsive React/Vite client and Express API, environment-variable configuration, setup instructions, and API reference.
- [x] Production builds and validation tests pass; PostgreSQL connectivity is checked by `/api/ready`.

The codebase uses Drizzle ORM with PostgreSQL (the provided architecture guide names Prisma as its recommended ORM). Database constraints and behavior are enforced in the PostgreSQL schema regardless of ORM.
## Demonstration accounts

`npm run db:seed:demo` creates these accounts; every one uses the password `DemoPass#1`.

| Role | Email |
| --- | --- |
| Store owner | `owner.anjali@goodmark.demo`, `owner.rohan@goodmark.demo`, `owner.kavita@goodmark.demo` |
| Normal user | `user.meera@goodmark.demo`, `user.aditya@goodmark.demo`, `user.nikhil@goodmark.demo` |

The administrator account is the one defined by `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env`. Application logic never references the demo rows, so they are safe to delete.

## Verifying the build

With both servers running, run `node tools/api-smoke.mjs` from the repository root. It exercises the whole API against real PostgreSQL data: signing in as each role, checking the role guards, creating accounts and a store, filtering both directories, submitting, updating and removing a 1–5 rating, rejecting out-of-range ratings and duplicate emails, and confirming the owner dashboard reflects the submitted ratings. It prints one line per check and exits nonzero on failure. It reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `server/.env`, and leaves only `*@goodmark.test` rows behind, which `npm run db:seed:demo` removes.
