import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpDown, BadgeCheck, Building2, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, ClipboardList, Eye, EyeOff, LayoutDashboard, LogOut,
  MapPin, Menu, Package, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
  Star, Store, Users, X,
} from "lucide-react";
import hotToast, { Toaster } from "react-hot-toast";
import { BrandMark } from "../components/BrandMark";
import { Field, StarPicker } from "../components/FormControls";
import { useAuth } from "../hooks/useAuth";
import { errorMessage } from "../utils/format";
import { formatProductPrice } from "../utils/products";
import { adminUserSchema, loginSchema, passwordChangeSchema, registrationSchema, storeOwnerAssignmentSchema, storeSchema, ratingSubmissionSchema } from "../utils/validation";
import { roleNames, type Role, type Stats, type StoreRow, type User } from "../utils/types";
import {
  adminService,
  authService,
  ownerService,
  productService,
  ratingService,
  storeService,
} from "../services";
import type { AdminUser } from "../services";
import { ProductsView } from "../components/ProductsView";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";

type StoreListing = StoreRow & { createdAt?: string };
type ProductRatingRow = {
  id: number;
  externalId?: string | null;
  externalSource?: string | null;
  name: string;
  price: number | null;
  description: string;
  category?: string | null;
  brand?: string | null;
  quantity?: string | null;
  imageUrl?: string | null;
  specialFeature: string;
  averageRating: number;
  ratingCount: number;
  userRating: number | null;
};
type RatingRow = {
  id: number; rating: number; createdAt: string; userName: string; userEmail: string;
};
type OwnerStore = { id: number; name: string; address: string; averageRating: number; totalRatings: number };
type Notify = (message: string, type?: "success" | "error") => void;

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debouncedValue;
}

function App() {
  const { token, user, loading: authLoading, authenticate, signOut } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const notify = useCallback((message: string, type: "success" | "error" = "success") => {
    if (type === "error") hotToast.error(message);
    else hotToast.success(message);
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>, mode: "login" | "signup") {
    event.preventDefault();
    setAuthError("");
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form.entries());
    const parsed = (mode === "login" ? loginSchema : registrationSchema).safeParse(data);
    if (!parsed.success) {
      setAuthError(parsed.error.issues[0]?.message ?? "Check the entered details.");
      return;
    }
    setAuthBusy(true);
    try {
      const currentUser = await authenticate(parsed.data, mode);
      navigate(roleHome(currentUser.role), { replace: true });
    } catch (error) {
      setAuthError(errorMessage(error, "Unable to sign in."));
    } finally {
      setAuthBusy(false);
    }
  }

  if (authLoading) return <div className="loading-screen"><span className="loader" />Loading your workspace</div>;
  const authPage = (mode: "login" | "signup") => user && token
    ? <Navigate to={roleHome(user.role)} replace />
    : <AuthPage
      mode={mode}
      onSubmit={(event) => submitAuth(event, mode)}
      error={authError}
      showPassword={showPassword}
      setShowPassword={setShowPassword}
      busy={authBusy}
    />;

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to={user && token ? roleHome(user.role) : "/login"} replace />} />
        <Route path="/login" element={authPage("login")} />
        <Route path="/register" element={authPage("signup")} />
        <Route element={<ProtectedWorkspace role="admin" notify={notify} onSignOut={() => { signOut(); navigate("/login", { replace: true }); }} />}>
          <Route path="/admin" element={<Navigate to="/admin/metrics" replace />} />
          <Route path="/admin/metrics" element={<AdminPage active="Overview" notify={notify} />} />
          <Route path="/admin/dashboard" element={<AdminPage active="Overview" notify={notify} />} />
          <Route path="/admin/users" element={<AdminPage active="People" notify={notify} />} />
          <Route path="/admin/stores" element={<AdminPage active="Stores" notify={notify} />} />
          <Route path="/admin/products" element={<ProductsView mode="admin" notify={notify} />} />
        </Route>
        <Route element={<ProtectedWorkspace role="owner" notify={notify} onSignOut={() => { signOut(); navigate("/login", { replace: true }); }} />}>
          <Route path="/owner" element={<Navigate to="/owner/stats" replace />} />
          <Route path="/owner/stats" element={<OwnerView notify={notify} />} />
          <Route path="/owner/dashboard" element={<OwnerView notify={notify} />} />
        </Route>
        <Route element={<ProtectedWorkspace role="user" notify={notify} onSignOut={() => { signOut(); navigate("/login", { replace: true }); }} />}>
          <Route path="/stores" element={<CustomerPage active="Discover" notify={notify} />} />
          <Route path="/products" element={<ProductsView mode="user" notify={notify} />} />
          <Route path="/profile" element={<CustomerPage active="Profile" notify={notify} />} />
          <Route path="/profile/password" element={<CustomerPage active="Profile" notify={notify} />} />
          <Route path="/my-ratings" element={<Navigate to="/profile" replace />} />
        </Route>
        <Route path="*" element={<Navigate to={user && token ? roleHome(user.role) : "/login"} replace />} />
      </Routes>
      <Toaster position="top-right" toastOptions={{
        duration: 3500,
        style: { border: "1px solid #e9ede8", borderRadius: "10px", color: "#35443a", fontSize: "13px" },
        success: { iconTheme: { primary: "#52745a", secondary: "#fff" } },
      }} />
    </>
  );
}

function AuthPage({ mode, onSubmit, error, showPassword, setShowPassword, busy }: {
  mode: "login" | "signup";
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; error: string;
  showPassword: boolean; setShowPassword: (value: boolean) => void; busy: boolean;
}) {
  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="auth-brand"><BrandMark /> goodmark</div>
        <div className="auth-story">
          <div className="eyebrow"><span className="eyebrow-dot" /> A LITTLE MORE TRUST, EVERY DAY</div>
          <h1>Good places<br />deserve <em>good marks.</em></h1>
          <p>Find your next favorite neighborhood spot, or help someone else find theirs.</p>
          <div className="story-card">
            <div className="story-card-top"><div className="avatar avatar-peach"><Star size={17} fill="currentColor" /></div><div><strong>Made for neighbors</strong><span>Discover local businesses</span></div><div className="story-stars"><Sparkles size={18} /></div></div>
            <p>Honest ratings help people find places they’ll love and help local businesses grow.</p>
            <div className="story-place"><span className="place-pin"><MapPin size={14} /></span><span><b>Good things, close to home</b><small>Find your neighborhood favorites</small></span></div>
          </div>
          <div className="social-proof"><span className="place-pin"><Users size={15} /></span><span><b>Made for local love.</b> Share what makes a place special.</span></div>
        </div>
        <div className="auth-visual-foot"><span>© {new Date().getFullYear()} Goodmark</span><span>Real people. Real places. Honest ratings.</span></div>
        <div className="decor decor-one" /><div className="decor decor-two" />
      </section>
      <section className="auth-panel">
        <div className="auth-mobile-brand"><BrandMark /> goodmark</div>
        <div className="auth-form-wrap">
          <div className="welcome-icon"><Sparkles size={20} /></div>
          <span className="section-kicker">{mode === "login" ? "WELCOME BACK" : "JOIN THE NEIGHBORHOOD"}</span>
          <h2>{mode === "login" ? "Sign in to Goodmark" : "Create your account"}</h2>
          <p className="auth-subtitle">{mode === "login" ? "Your next favorite place is just around the corner." : "A good community starts with sharing what you love."}</p>
          <form onSubmit={onSubmit} className="auth-form">
            {mode === "signup" && <>
              <Field label="Full name"><input name="name" required minLength={20} maxLength={60} placeholder="Your full name (20–60 characters)" autoComplete="name" /></Field>
              <Field label="Address"><input name="address" required maxLength={400} placeholder="Street, city, and ZIP" autoComplete="street-address" /></Field>
            </>}
            <Field label="Email address"><input name="email" type="email" required maxLength={254} placeholder="you@example.com" autoComplete="email" /></Field>
            <Field label="Password"><div className="password-input"><input name="password" type={showPassword ? "text" : "password"} required minLength={8} maxLength={16} pattern={mode === "signup" ? "^(?=.*[A-Z])(?=.*[^A-Za-z0-9\\s]).{8,16}$" : undefined} title="Use 8–16 characters, including an uppercase letter and a special character." placeholder={mode === "login" ? "Enter your password" : "8–16 characters, one uppercase & symbol"} autoComplete={mode === "login" ? "current-password" : "new-password"} /><button type="button" className="show-password" aria-label="Toggle password visibility" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></Field>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button type="submit" className="button button-primary auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}<ChevronRight size={17} /></button>
          </form>
          <div className="auth-switch">{mode === "login" ? "New to Goodmark?" : "Already have an account?"}<Link to={mode === "login" ? "/register" : "/login"}>{mode === "login" ? "Create an account" : "Sign in"}</Link></div>
          {mode === "login" && <div className="auth-note"><ShieldCheck size={15} /> Your neighborhood is better when everyone feels safe.</div>}
        </div>
        <div className="auth-panel-foot"><a href="#privacy">Privacy</a><a href="#terms">Terms</a><a href="#help">Need help?</a></div>
      </section>
    </main>
  );
}

function roleHome(role: Role) {
  if (role === "admin") return "/admin/metrics";
  if (role === "owner") return "/owner/stats";
  return "/stores";
}

function rolePagePath(role: Role, page: string) {
  if (role === "admin") {
    if (page === "Stores") return "/admin/stores";
    if (page === "People") return "/admin/users";
    if (page === "Products") return "/admin/products";
    return "/admin/metrics";
  }
  if (role === "owner") return "/owner/stats";
  if (page === "Products") return "/products";
  if (page === "Profile" || page === "My ratings") return "/profile";
  return "/stores";
}

function ProtectedWorkspace({ role, onSignOut, notify }: {
  role: Role; onSignOut: () => void; notify: Notify;
}) {
  const { token, user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading-screen"><span className="loader" />Loading your workspace</div>;
  if (!user || !token) return <Navigate to="/login" replace state={{ from: location }} />;
  if (user.role !== role) return <Navigate to={roleHome(user.role)} replace />;
  return <Dashboard user={user} onSignOut={onSignOut} notify={notify}><Outlet /></Dashboard>;
}

function AdminPage({ active, notify }: { active: string; notify: Notify }) {
  const navigate = useNavigate();
  return <AdminView active={active} notify={notify} onNavigate={(page) => navigate(rolePagePath("admin", page))} />;
}

function CustomerPage({ active, notify }: { active: "Discover" | "Profile"; notify: Notify }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!user) return null;
  return <CustomerView active={active} notify={notify} user={user} onNavigate={(page) => navigate(rolePagePath("user", page))} />;
}

function Dashboard({ user, onSignOut, notify, children }: {
  user: User;
  onSignOut: () => void; notify: Notify; children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  useEffect(() => {
    if (location.pathname === "/profile/password") setPasswordOpen(true);
  }, [location.pathname]);
  const active = location.pathname === "/admin/users" ? "People"
    : location.pathname === "/admin/stores" ? "Stores"
      : location.pathname === "/admin/products" || location.pathname === "/products" ? "Products"
        : location.pathname === "/owner/stats" || location.pathname === "/owner/dashboard" ? "Overview"
          : location.pathname === "/profile" || location.pathname === "/profile/password" ? "Profile"
            : user.role === "user" ? "Discover" : "Overview";
  const nav = user.role === "admin"
    ? [{ label: "Overview", icon: LayoutDashboard }, { label: "Stores", icon: Store }, { label: "Products", icon: Package }, { label: "People", icon: Users }]
    : user.role === "owner"
      ? [{ label: "Overview", icon: LayoutDashboard }]
      : [{ label: "Discover", icon: Search }, { label: "Products", icon: Package }, { label: "Profile", icon: Users }];
  const title = user.role === "admin" ? "Admin workspace" : user.role === "owner" ? "Your store space" : "Your neighborhood";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand"><BrandMark /><span>goodmark</span><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-switch"><span className="workspace-icon"><Building2 size={16} /></span><span><b>{title}</b><small>{roleNames[user.role]}</small></span><ChevronDown size={15} /></div>
        <div className="nav-caption">MENU</div>
        <nav className="side-nav">
          {nav.map(({ label, icon: Icon }) => <button key={label} onClick={() => { navigate(rolePagePath(user.role, label)); setMenuOpen(false); }} className={`nav-item ${active === label ? "nav-active" : ""}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={16} /></div><b>A little kindness goes a long way.</b><p>Your honest rating helps a local business grow.</p></div>
          <button className="nav-item" onClick={() => setPasswordOpen(true)}><Settings2 size={18} /><span>Account settings</span></button>
          <div className="user-profile">
            <div className="avatar avatar-green">{initials(user.name)}</div>
            <div className="profile-text"><strong>{user.name}</strong><span>{roleNames[user.role]}</span></div>
            <button aria-label="Sign out" className="signout-button" onClick={onSignOut}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      {menuOpen && <button className="mobile-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <div className="main-shell">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button><div className="breadcrumb"><span>Goodmark</span><ChevronRight size={14} /><b>{active}</b></div><div className="topbar-right"><span className="topbar-date">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</span><button className="icon-button help-button" aria-label="Help" onClick={() => notify("For account support, contact your platform administrator.")}><CircleHelp size={18} /></button><span className="topbar-divider" /><div className="avatar avatar-green top-avatar">{initials(user.name)}</div></div></header>
        <main className="page-content">{children}</main>
      </div>
      {passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} notify={notify} />}
    </div>
  );
}

function AdminView({ active, notify, onNavigate }: { active: string; notify: Notify; onNavigate: (value: string) => void }) {
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalStores: 0, totalRatings: 0 });
  const [storeRows, setStoreRows] = useState<StoreListing[]>([]);
  const [people, setPeople] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"store" | "user" | null>(null);
  const [assignmentStore, setAssignmentStore] = useState<StoreListing | null>(null);
  const [filters, setFilters] = useState({ name: "", email: "", address: "" });
  const debouncedFilters = useDebouncedValue(filters);
  const [role, setRole] = useState("");
  const [sort, setSort] = useState("name:asc");
  const [storeSort, setStoreSort] = useState("name:asc");
  const [page, setPage] = useState(1);
  const [storeTotal, setStoreTotal] = useState(0);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const storeParams = new URLSearchParams({
      sort: active === "Stores" ? storeSort : "createdAt:desc",
      page: active === "Stores" ? String(page) : "1",
      pageSize: active === "Stores" ? "10" : "5",
    });
    const peopleParams = new URLSearchParams({
      sort: active === "People" ? sort : "createdAt:desc",
      page: active === "People" ? String(page) : "1",
      pageSize: active === "People" ? "10" : "4",
    });
    if (active === "Stores") {
      Object.entries(debouncedFilters).forEach(([field, value]) => {
        if (value.trim()) storeParams.set(field, value.trim());
      });
    }
    if (active === "People") {
      Object.entries(debouncedFilters).forEach(([field, value]) => {
        if (value.trim()) peopleParams.set(field, value.trim());
      });
      if (role) peopleParams.set("role", role);
    }
    Promise.all([
      adminService.metrics(controller.signal),
      adminService.stores(storeParams, controller.signal),
      adminService.users(peopleParams, controller.signal),
    ]).then(([counts, storeData, peopleData]) => {
      if (controller.signal.aborted) return;
      setStats(counts);
      setStoreRows(storeData.stores);
      setPeople(peopleData.users);
      setStoreTotal(storeData.total);
      setPeopleTotal(peopleData.total);
    }).catch((error) => {
      if (!controller.signal.aborted) notify(errorMessage(error, "Unable to load administrator data."), "error");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [active, debouncedFilters, role, sort, storeSort, page, refresh, notify]);

  useEffect(() => {
    setPage(1);
  }, [active, debouncedFilters, role, sort, storeSort]);

  const isPeople = active === "People";
  if (active === "Overview") return (
    <div className="content-wrap">
      <PageHeading eyebrow="PLATFORM OVERVIEW" title="Good morning, Admin" subtitle="Here's a little snapshot of your neighborhood today."><button className="button button-primary" onClick={() => setModal("store")}><Plus size={17} /> Add a store</button></PageHeading>
      <div className="stats-grid">
        <StatCard label="Total users" value={stats.totalUsers} icon={<Users size={19} />} tone="green" delta="Community members" />
        <StatCard label="Registered stores" value={stats.totalStores} icon={<Store size={19} />} tone="peach" delta="Local businesses" />
        <StatCard label="Ratings submitted" value={stats.totalRatings} icon={<Star size={19} />} tone="yellow" delta="Community reviews" />
      </div>
      <section className="panel recent-panel"><div className="panel-heading"><div><span className="section-kicker">YOUR DIRECTORY</span><h3>Recently added stores</h3></div><button className="text-button" onClick={() => onNavigate("Stores")}>View all <ChevronRight size={15} /></button></div>
        {loading ? <TableSkeleton /> : storeRows.length ? <StoreTable rows={storeRows} /> : <EmptyState icon={<Store />} title="Your directory is ready" copy="Add your first local store to get the good word out." action={<button className="button button-primary" onClick={() => setModal("store")}><Plus size={16} /> Add a store</button>} />}
      </section>
      <div className="bottom-grid"><section className="panel mini-panel"><div className="panel-heading"><div><span className="section-kicker">COMMUNITY</span><h3>Recently joined</h3></div><Users size={18} className="muted-icon" /></div>{people.slice(0, 4).map((person) => <div className="person-row" key={person.id}><div className="avatar avatar-lavender">{initials(person.name)}</div><span><b>{person.name}</b><small>{roleNames[person.role]}</small></span><BadgeCheck size={17} className="verified-icon" /></div>)}</section><section className="community-callout"><span className="callout-deco">✳</span><span className="section-kicker">GROWING TOGETHER</span><h3>Good things start<br />in your neighborhood.</h3><p>Every new store makes Goodmark a little more useful for everyone.</p><div className="callout-stat"><span className="place-pin"><Users size={15} /></span><span><b>{stats.totalUsers} people</b> making their mark</span></div></section></div>
      {modal && <CreateDialog type={modal} onClose={() => setModal(null)} onCreated={() => { setModal(null); setRefresh((n) => n + 1); notify(modal === "store" ? "Store added to your directory." : "New account created."); }} notify={notify} />}
    </div>
  );

  return (
    <div className={`content-wrap ${isPeople ? "" : "stores-admin-page"}`}>
      <PageHeading eyebrow={isPeople ? "YOUR COMMUNITY" : "THE STORE DIRECTORY"} title={isPeople ? "People" : "Stores"} subtitle={isPeople ? "Get to know who's making Goodmark what it is." : "Manage your listed stores and see how neighbors rate them."}>
        <button className="button button-primary" onClick={() => setModal(isPeople ? "user" : "store")}><Plus size={17} /> Add {isPeople ? "a person" : "a store"}</button>
      </PageHeading>
      <section className="panel directory-panel">
        <div className="directory-toolbar">
          <div className="directory-filters">
            {(["name", "email", "address"] as const).map((field) => (
              <label className="search-wrap" key={field}>
                <Search size={16} />
                <input
                  aria-label={`Filter by ${field}`}
                  placeholder={`Filter by ${field}`}
                  value={filters[field]}
                  onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, [field]: event.target.value })); }}
                />
              </label>
            ))}
          </div>
          <div className="toolbar-right">
            {isPeople && <select aria-label="Filter by role" className="filter-select" value={role} onChange={(event) => { setPage(1); setRole(event.target.value); }}><option value="">All roles</option><option value="admin">Administrator</option><option value="user">Normal user</option><option value="owner">Store owner</option></select>}
            {isPeople
              ? <button className="filter-button" onClick={() => { setPage(1); setSort((old) => `${old.split(":")[0]}:${old.endsWith("asc") ? "desc" : "asc"}`); }}><SlidersHorizontal size={16} /> Sort {sort.endsWith("desc") ? "descending" : "ascending"}</button>
              : <select aria-label="Sort stores" className="filter-select" value={storeSort} onChange={(event) => { setPage(1); setStoreSort(event.target.value); }}>
                <option value="name:asc">Name A–Z</option><option value="name:desc">Name Z–A</option>
                <option value="email:asc">Email A–Z</option><option value="email:desc">Email Z–A</option>
                <option value="address:asc">Address A–Z</option><option value="address:desc">Address Z–A</option>
                <option value="rating:desc">Highest rated</option><option value="rating:asc">Lowest rated</option>
                <option value="createdAt:desc">Recently added</option><option value="createdAt:asc">Oldest added</option>
              </select>}
            {!isPeople && <button className="filter-button" onClick={() => { setPage(1); setFilters({ name: "", email: "", address: "" }); setStoreSort("name:asc"); }} disabled={!Object.values(filters).some(Boolean) && storeSort === "name:asc"}>Clear filters</button>}
          </div>
        </div>
        <div className="table-meta"><span>{isPeople ? peopleTotal : storeTotal} {isPeople ? "people" : "stores"} found</span><span>{Object.values(filters).filter(Boolean).length || (isPeople && role) ? `${Object.values(filters).filter(Boolean).length + (role ? 1 : 0)} active filters` : "All directory entries"}</span></div>
        {loading ? <TableSkeleton /> : isPeople ? <PeopleTable rows={people} onSort={(field) => {
          setPage(1);
          setSort((current) => `${field}:${current.startsWith(`${field}:`) && current.endsWith("asc") ? "desc" : "asc"}`);
        }} /> : <StoreTable rows={storeRows} onSort={(field) => {
          setPage(1);
          const [currentField, currentDirection] = storeSort.split(":");
          setStoreSort(`${field}:${currentField === field && currentDirection === "asc" ? "desc" : "asc"}`);
        }} onAssignOwner={setAssignmentStore} />}
        {!loading && (isPeople ? people.length === 0 : storeRows.length === 0) && <EmptyState icon={isPeople ? <Users /> : <Store />} title={Object.values(filters).some(Boolean) || role ? "No matches just yet" : `No ${isPeople ? "people" : "stores"} yet`} copy={Object.values(filters).some(Boolean) || role ? "Try different filters, or clear them to see all results." : "Add a new entry to get the neighborhood started."} />}
        <div className="table-footer"><span>Showing <b>{(isPeople ? people.length : storeRows.length) ? (page - 1) * 10 + 1 : 0}–{Math.min(page * 10, isPeople ? peopleTotal : storeTotal)}</b> of {isPeople ? peopleTotal : storeTotal} results</span><div className="pagination"><button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(current - 1, 1))}><ChevronLeft size={16} /></button><span className="page-number">{page} / {Math.max(1, Math.ceil((isPeople ? peopleTotal : storeTotal) / 10))}</span><button aria-label="Next page" disabled={loading || page >= Math.ceil((isPeople ? peopleTotal : storeTotal) / 10)} onClick={() => setPage((current) => current + 1)}><ChevronRight size={16} /></button></div></div>
      </section>
      {modal && <CreateDialog type={modal} onClose={() => setModal(null)} onCreated={() => { setModal(null); setRefresh((n) => n + 1); notify(modal === "store" ? "Store added to your directory." : "New account created."); }} notify={notify} />}
      {assignmentStore && <AssignStoreOwnerDialog
        store={assignmentStore}
        onClose={() => setAssignmentStore(null)}
        onSaved={() => {
          setAssignmentStore(null);
          setRefresh((value) => value + 1);
          notify("Store owner assignment updated.");
        }}
        notify={notify}
      />}
    </div>
  );
}

function CustomerView({ active, notify, onNavigate, user }: {
  active: "Discover" | "Profile";
  notify: Notify;
  onNavigate: (value: string) => void;
  user: User;
}) {
  const [stores, setStores] = useState<StoreListing[]>([]);
  const [ratedProducts, setRatedProducts] = useState<ProductRatingRow[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [storePage, setStorePage] = useState(1);
  const [storeTotal, setStoreTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [storeLoadFailed, setStoreLoadFailed] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [ratingStore, setRatingStore] = useState<number | null>(null);
  const [selection, setSelection] = useState(0);
  const [ratingReview, setRatingReview] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch && active !== "Profile") params.set("search", debouncedSearch);
    params.set("sortBy", sortBy);
    params.set("order", sortOrder);
    params.set("page", String(active === "Profile" ? 1 : storePage));
    params.set("pageSize", active === "Profile" ? "100" : "9");
    storeService.list(params, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setStores(result.stores);
          setStoreTotal(result.total);
          setStoreLoadFailed(false);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setStoreLoadFailed(true);
          notify(errorMessage(error, "Unable to load stores."), "error");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active, debouncedSearch, sortBy, sortOrder, storePage, refresh, notify]);
  useEffect(() => {
    if (active !== "Profile") {
      setRatedProducts([]);
      setProductsLoading(false);
      return;
    }
    const controller = new AbortController();
    setProductsLoading(true);
    productService.list<ProductRatingRow>(new URLSearchParams({ sortBy: "name", order: "asc", page: "1", pageSize: "100" }), controller.signal)
      .then(({ products: rows }) => {
        if (!controller.signal.aborted) setRatedProducts(rows.filter((product) => product.userRating != null));
      })
      .catch((error) => {
        if (!controller.signal.aborted) notify(errorMessage(error, "Unable to load your product ratings."), "error");
      })
      .finally(() => {
        if (!controller.signal.aborted) setProductsLoading(false);
      });
    return () => controller.abort();
  }, [active, refresh, notify]);
  const myRatings = useMemo(() => stores.filter((store) => store.userRating != null), [stores]);
  const visibleStores = active === "Profile" ? myRatings : stores;
  const totalMyRatings = myRatings.length + ratedProducts.length;
  const selectedStore = stores.find((store) => store.id === ratingStore);
  async function saveRating() {
    if (!ratingStore || selection < 1) return;
    try {
      const rating = ratingSubmissionSchema.parse({ storeId: ratingStore, rating: selection, review: ratingReview });
      await ratingService.submitStore(rating.storeId, rating.rating, rating.review);
      setRatingStore(null); setSelection(0); setRefresh((value) => value + 1); notify("Your rating is in. Thanks for sharing the love!");
    } catch (error) { notify(errorMessage(error, "Could not save your rating."), "error"); }
  }
  async function removeStoreRating() {
    if (!ratingStore) return;
    try {
      await ratingService.deleteStore(ratingStore);
      setRatingStore(null);
      setSelection(0);
      setRatingReview("");
      setRefresh((value) => value + 1);
      notify("Your store rating has been removed.");
    } catch (error) {
      notify(errorMessage(error, "Could not remove your store rating."), "error");
    }
  }
  return (
    <div className={`content-wrap ${active === "Discover" ? "stores-discover-page" : ""}`}>
      <PageHeading eyebrow={active === "Profile" ? "YOUR GOOD WORD" : "THE STORE DIRECTORY"} title={active === "Profile" ? "Your profile." : "Discover local stores"} subtitle={active === "Profile" ? "Your account details and the places and products you’ve rated." : "Find a neighborhood favorite and share your honest rating."}><span className="date-chip"><Sparkles size={15} /> {active === "Profile" ? roleNames[user.role] : "Your local guide"}</span></PageHeading>
      {active === "Profile" && <section className="profile-card panel"><div className="avatar avatar-green profile-avatar">{initials(user.name)}</div><div className="profile-details"><span className="section-kicker">ACCOUNT PROFILE</span><h2>{user.name}</h2><p>{user.email}</p><p>{user.address || "No address provided"}</p></div><div className="profile-role">{roleNames[user.role]}</div></section>}
      {active !== "Profile" && <div className="store-section-head discover-store-controls"><div><span className="section-kicker">THE NEIGHBORHOOD LIST</span><h2>Stores worth knowing</h2><p>Real local listings from OpenStreetMap contributors.</p></div><div className="store-controls"><label className="search-wrap store-search"><Search size={17} /><input aria-label="Search by store name or address" placeholder="Search stores..." value={search} onChange={(event) => { setStorePage(1); setSearch(event.target.value); }} /></label><select aria-label="Sort stores" className="filter-select" value={`${sortBy}:${sortOrder}`} onChange={(event) => { setStorePage(1); const [field, order] = event.target.value.split(":"); setSortBy(field); setSortOrder(order); }}><option value="name:asc">Name A–Z</option><option value="name:desc">Name Z–A</option><option value="rating:desc">Highest rated</option><option value="rating:asc">Lowest rated</option><option value="createdAt:desc">Newest</option><option value="createdAt:asc">Oldest</option></select></div></div>}
      {active === "Profile" && <div className="store-section-head"><div><span className="section-kicker">YOUR STORE RATINGS</span><h2>Places you’ve rated</h2><p>Your submitted ratings for neighborhood stores.</p></div></div>}
      {loading ? <div className="store-grid">{[1, 2, 3].map((n) => <div key={n} className="store-skeleton" />)}</div> : visibleStores.length ? <div className="store-grid">{visibleStores.map((store, index) => <StoreCard key={store.id} store={store} index={index} onRate={() => { setRatingStore(store.id); setSelection(store.userRating ?? 0); setRatingReview(store.userReview ?? ""); }} />)}</div> : active !== "Profile" || (!productsLoading && ratedProducts.length === 0) ? <section className="panel empty-panel"><EmptyState icon={<Store />} title={active === "Profile" ? "No ratings yet" : storeLoadFailed ? "Stores couldn’t be loaded" : search ? "No spots found" : "The neighborhood is just getting started"} copy={active === "Profile" ? "Rate a store or product and it will appear here." : storeLoadFailed ? "Please try again in a moment." : search ? "Try another name or address." : "There aren't any stores in the directory yet. Check back soon."} /></section> : null}
      {active === "Discover" && storeTotal > 9 && <div className="catalog-pagination"><button className="button button-quiet" disabled={storePage <= 1} onClick={() => setStorePage((page) => page - 1)}>Previous</button><span>Page {storePage} of {Math.ceil(storeTotal / 9)}</span><button className="button button-quiet" disabled={storePage >= Math.ceil(storeTotal / 9)} onClick={() => setStorePage((page) => page + 1)}>Next</button></div>}
      {active === "Profile" && <section className="my-product-ratings">
        <div className="store-section-head"><div><span className="section-kicker">YOUR PRODUCT RATINGS</span><h2>Products you’ve rated</h2><p>Your submitted ratings for products in the catalog.</p></div><button className="text-button" onClick={() => onNavigate("Products")}>Browse products <ChevronRight size={15} /></button></div>
        {productsLoading ? <div className="product-grid">{[1, 2, 3].map((n) => <div key={n} className="product-skeleton" />)}</div> : ratedProducts.length ? <div className="product-grid">{ratedProducts.map((product) => <article className="product-card rated-product-card" key={product.id}>
          <div className="product-card-top"><span className="product-icon"><Package size={20} /></span><span className="product-price">{formatProductPrice(product.price)}</span></div>
          <h3>{product.name}</h3>{product.brand && <p className="product-brand">{product.brand}</p>}{product.category && <p className="product-category">{product.category}</p>}<p className="product-description">{product.description || product.quantity || "No description provided."}</p>
          {product.externalSource === "openfoodfacts" && product.externalId && <a className="product-attribution" href={`https://world.openfoodfacts.org/product/${product.externalId}`} target="_blank" rel="noreferrer">Product data: Open Food Facts</a>}
          {product.specialFeature && <div className="product-feature"><Sparkles size={15} /><span><b>Special feature</b>{product.specialFeature}</span></div>}
          <div className="my-product-score"><span>Your rating</span><span className="my-product-stars" aria-label={`Your rating: ${product.userRating} out of 5`}>{[1, 2, 3, 4, 5].map((score) => <Star key={score} size={15} fill={score <= (product.userRating ?? 0) ? "currentColor" : "none"} />)}<b>{product.userRating}/5</b></span></div>
        </article>)}</div> : <section className="panel empty-panel"><EmptyState icon={<Package />} title="No product ratings yet" copy="Rate a product from the Products tab and your rating will appear here." /></section>}
      </section>}
      <div className="customer-bottom"><div className="customer-note"><div className="note-icon"><Star size={17} /></div><span><b>A kind word goes a long way.</b><small>Your ratings help neighbors find products and local businesses they love.</small></span></div><span className="ratings-summary"><strong>{active === "Profile" ? totalMyRatings : myRatings.length}</strong> {active === "Profile" ? (totalMyRatings === 1 ? "rating" : "ratings") : (myRatings.length === 1 ? "place rated" : "places rated")} by you</span></div>
      {selectedStore && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRatingStore(null); }}><section className="modal-card rating-modal" role="dialog" aria-modal="true" aria-labelledby="rating-title"><button className="modal-close" onClick={() => setRatingStore(null)} aria-label="Close"><X size={19} /></button><div className="modal-symbol rating-symbol"><Star size={22} fill="currentColor" /></div><span className="section-kicker">SPREAD THE GOOD WORD</span><h2 id="rating-title">{selectedStore.userRating ? "Update your rating" : "How was your visit?"}</h2><p>How would you rate <b>{selectedStore.name}</b>?</p><StarPicker value={selection} onChange={setSelection} large /><div className="rating-label">{["", "Not for me", "It was okay", "Pretty good", "Really lovely", "Absolutely loved it!"][selection]}</div><label className="rating-review-field"><span>Review <small>optional</small></span><textarea value={ratingReview} maxLength={5000} rows={3} onChange={(event) => setRatingReview(event.target.value)} placeholder="Share a little more about your experience" /></label><div className="rating-modal-actions">{selectedStore.userRating && <button className="button button-quiet" onClick={removeStoreRating}>Remove rating</button>}<button className="button button-primary modal-submit" disabled={!selection} onClick={saveRating}>{selectedStore.userRating ? "Update rating" : "Share your rating"}<ChevronRight size={17} /></button></div></section></div>}
    </div>
  );
}

function StoreCard({ store, index, onRate }: { store: StoreListing; index: number; onRate: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const palettes = ["store-art-peach", "store-art-green", "store-art-lavender", "store-art-blue"];
  return <article className="store-card"><div className={`store-card-art ${palettes[index % palettes.length]}`}>{store.imageUrl && !imageFailed ? <img className="store-card-image" src={store.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : <><span className="store-card-spark">✳</span><div className="store-building"><div /><i /><b /></div></>}<span className="store-category">{store.externalSource === "openstreetmap" ? "PUNE STORE LISTING" : "LOCAL BUSINESS"}</span></div><div className="store-card-content"><div className="store-card-heading"><h3>{store.name}</h3><span className="card-rating"><Star size={14} fill="currentColor" /> {store.ratingCount ? Number(store.averageRating).toFixed(1) : "—"}</span></div><p className="store-address"><MapPin size={14} />{store.address}</p>{store.description && <p className="store-description">{store.description}</p>}{store.externalSource === "openstreetmap" && store.externalId && <a className="store-card-source" href={`https://www.openstreetmap.org/${store.externalId.split("/").map(encodeURIComponent).join("/")}`} target="_blank" rel="noreferrer">Map data © OpenStreetMap contributors</a>}<div className="store-card-footer"><span className="review-count">{store.ratingCount ? `${store.ratingCount} ${store.ratingCount === 1 ? "neighbor" : "neighbors"} rated this` : "Be the first to rate"}</span><button className={`rate-action ${store.userRating ? "rated" : ""}`} onClick={onRate}>{store.userRating ? <><Star size={14} fill="currentColor" /> Your rating: {store.userRating}</> : <><Plus size={15} /> Rate this place</>}</button></div></div></article>;
}

function OwnerView({ notify }: { notify: Notify }) {
  const [store, setStore] = useState<OwnerStore | null>(null);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [ratingSort, setRatingSort] = useState("createdAt:desc");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    ownerService.dashboard()
      .then((result) => { setStore(result.store); setRatings(result.ratings); })
      .catch((error) => notify(errorMessage(error, "Unable to load owner dashboard."), "error")).finally(() => setLoading(false));
  }, [notify]);
  const totalRatings = store?.totalRatings ?? 0;
  const average = store?.averageRating ?? 0;
  const storeRows: StoreListing[] = store ? [{ ...store, ratingCount: store.totalRatings }] : [];
  const [sortField, sortOrder] = ratingSort.split(":") as ["name" | "email" | "rating" | "createdAt", "asc" | "desc"];
  const sortedRatings = [...ratings].sort((a, b) => {
    const comparison = sortField === "rating"
      ? a.rating - b.rating
      : sortField === "createdAt"
        ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
        : sortField === "name"
          ? a.userName.localeCompare(b.userName)
          : a.userEmail.localeCompare(b.userEmail);
    return sortOrder === "asc" ? comparison : -comparison;
  });
  return <div className="content-wrap"><PageHeading eyebrow="YOUR BUSINESS, AT A GLANCE" title="Your store space" subtitle="See how your neighbors are feeling about their visits." /><div className="stats-grid owner-stats"><StatCard label="Your average rating" value={Number(average).toFixed(1)} icon={<Star size={19} />} tone="yellow" delta="Your store rating" /><StatCard label="Ratings received" value={totalRatings} icon={<ClipboardList size={19} />} tone="green" delta="From your community" /><StatCard label="Your stores" value={store ? 1 : 0} icon={<Store size={19} />} tone="peach" delta="On Goodmark" /></div><section className="panel recent-panel"><div className="panel-heading"><div><span className="section-kicker">YOUR STORE</span><h3>Store performance</h3></div></div>{loading ? <TableSkeleton /> : store ? <StoreTable rows={storeRows} /> : <EmptyState icon={<Store />} title="No store is linked to your account yet" copy="Ask your Goodmark administrator to connect your account with your store." />}</section><section className="panel ratings-panel"><div className="panel-heading"><div><span className="section-kicker">THE GOOD WORD</span><h3>Recent ratings</h3></div><div className="toolbar-right"><span className="feedback-count">{ratings.length} {ratings.length === 1 ? "rating" : "ratings"}</span><select aria-label="Sort ratings" className="filter-select" value={ratingSort} onChange={(event) => setRatingSort(event.target.value)}><option value="createdAt:desc">Newest first</option><option value="createdAt:asc">Oldest first</option><option value="name:asc">Name A–Z</option><option value="name:desc">Name Z–A</option><option value="email:asc">Email A–Z</option><option value="email:desc">Email Z–A</option><option value="rating:asc">Lowest rating</option><option value="rating:desc">Highest rating</option></select></div></div>{loading ? <TableSkeleton /> : sortedRatings.length ? <div className="owner-rating-list">{sortedRatings.map((rating) => <div className="owner-rating-row" key={rating.id}><div className="avatar avatar-lavender">{initials(rating.userName)}</div><div className="owner-reviewer"><b>{rating.userName}</b><small>{rating.userEmail}</small></div><div className="owner-review-score"><Star size={15} fill="currentColor" /><b>{rating.rating}.0</b></div><time>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(rating.createdAt))}</time></div>)}</div> : <EmptyState icon={<Star />} title="No ratings just yet" copy="Your neighbors' feedback will show up here." />}</section></div>;
}

function PageHeading({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-heading"><div><span className="section-kicker">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{children && <div className="heading-action">{children}</div>}</div>;
}

function StatCard({ label, value, icon, tone, delta }: { label: string; value: string | number; icon: ReactNode; tone: string; delta: string }) {
  return <div className="stat-card"><div className="stat-card-top"><span>{label}</span><span className={`stat-icon stat-${tone}`}>{icon}</span></div><strong className="stat-value">{value}</strong><div className="stat-delta"><span className="delta-dot" />{delta}</div></div>;
}

function StoreTable({ rows, onSort, onAssignOwner }: {
  rows: StoreListing[];
  onSort?: (field: string) => void;
  onAssignOwner?: (store: StoreListing) => void;
}) {
  return <div className="table-scroll"><table><thead><tr><th><SortButton label="Store" onClick={() => onSort?.("name")} /></th><th><SortButton label="Email" onClick={() => onSort?.("email")} /></th><th><SortButton label="Address" onClick={() => onSort?.("address")} /></th><th><SortButton label="Overall rating" onClick={() => onSort?.("rating")} /></th><th><SortButton label="Added" onClick={() => onSort?.("createdAt")} /></th>{onAssignOwner && <th>Store owner</th>}</tr></thead><tbody>{rows.map((store, index) => <tr key={store.id}><td><div className="table-primary"><div className={`table-store-icon table-store-${index % 4}`}><Store size={16} /></div><b>{store.name}</b></div></td><td className="table-muted">{store.email ?? "—"}</td><td className="table-muted address-cell">{store.address}</td><td><span className="table-rating"><Star size={14} fill="currentColor" />{store.ratingCount ? Number(store.averageRating).toFixed(1) : "—"}</span><span className="table-rating-count"> ({store.ratingCount})</span></td><td className="table-muted">{store.createdAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(store.createdAt)) : "—"}</td>{onAssignOwner && <td><button className="text-button" onClick={() => onAssignOwner(store)}>{store.ownerId ? "Manage owner" : "Assign owner"}</button></td>}</tr>)}</tbody></table></div>;
}

function PeopleTable({ rows, onSort }: { rows: AdminUser[]; onSort: (field: string) => void }) {
  return <div className="table-scroll"><table><thead><tr><th><SortButton label="Name" onClick={() => onSort("name")} /></th><th><SortButton label="Email" onClick={() => onSort("email")} /></th><th><SortButton label="Address" onClick={() => onSort("address")} /></th><th><SortButton label="Role" onClick={() => onSort("role")} /></th><th>Rating</th></tr></thead><tbody>{rows.map((person) => <tr key={person.id}><td><div className="table-primary"><div className="avatar avatar-table">{initials(person.name)}</div><b>{person.name}</b></div></td><td className="table-muted">{person.email}</td><td className="table-muted address-cell">{person.address || "—"}</td><td><span className={`role-badge role-${person.role}`}>{person.role === "admin" && <ShieldCheck size={13} />}{person.role === "owner" && <Store size={13} />}{roleNames[person.role]}</span></td><td>{person.role === "owner" && person.assignedStoreRatingAverage != null ? <span className="table-rating"><Star size={14} fill="currentColor" />{Number(person.assignedStoreRatingAverage).toFixed(1)}</span> : <span className="table-muted">—</span>}</td></tr>)}</tbody></table></div>;
}

function SortButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="sort-button" onClick={onClick}>{label}<ArrowUpDown size={13} /></button>;
}

function TableSkeleton() {
  return <div className="table-skeleton">{[1, 2, 3].map((row) => <div className="skeleton-row" key={row}><i /><i /><i /><i /></div>)}</div>;
}

function EmptyState({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{copy}</p>{action}</div>;
}

function AssignStoreOwnerDialog({ store, onClose, onSaved, notify }: {
  store: StoreListing;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}) {
  const [owners, setOwners] = useState<User[]>([]);
  const [selectedOwner, setSelectedOwner] = useState(store.ownerId ? String(store.ownerId) : "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    adminService.availableStoreOwners(store.id)
      .then(({ users: available }) => {
        if (active) setOwners(available);
      })
      .catch((error) => {
        if (active) setLoadError(errorMessage(error, "Unable to load store owners."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [store.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rawOwnerId = new FormData(event.currentTarget).get("ownerId");
    const parsed = storeOwnerAssignmentSchema.safeParse({
      ownerId: typeof rawOwnerId === "string" && rawOwnerId ? Number(rawOwnerId) : null,
    });
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Select a valid store owner.", "error");
      return;
    }

    setBusy(true);
    try {
      await adminService.assignStoreOwner(store.id, parsed.data.ownerId);
      onSaved();
    } catch (error) {
      notify(errorMessage(error, "Unable to update the store owner."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="assign-owner-title">
        <button className="modal-close" onClick={onClose} aria-label="Close" disabled={busy}><X size={19} /></button>
        <div className="modal-symbol"><Store size={21} /></div>
        <span className="section-kicker">STORE MANAGEMENT</span>
        <h2 id="assign-owner-title">Assign a store owner</h2>
        <p className="modal-description">{store.name}</p>
        {loading ? <TableSkeleton /> : loadError ? <div className="form-error" role="alert">{loadError}</div> : (
          <form className="modal-form" onSubmit={submit}>
            <Field label="Store owner">
              <select name="ownerId" value={selectedOwner} onChange={(event) => setSelectedOwner(event.target.value)} disabled={busy}>
                <option value="">No owner assigned</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>{owner.name} · {owner.email}</option>
                ))}
              </select>
            </Field>
            {owners.length === 0 && <p className="modal-description">No unassigned owner accounts are available. Add a person with the Store Owner role first.</p>}
            <div className="modal-actions">
              <button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="button button-primary" disabled={busy || loading || Boolean(loadError)}>
                {busy ? "Saving…" : "Save assignment"}<ChevronRight size={16} />
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function CreateDialog({ type, onClose, onCreated, notify }: { type: "store" | "user"; onClose: () => void; onCreated: () => void; notify: Notify }) {
  const [busy, setBusy] = useState(false);
  const [owners, setOwners] = useState<User[]>([]);
  useEffect(() => {
    if (type !== "store") return;
    adminService.availableStoreOwners().then(({ users: list }) => setOwners(list)).catch((error) => notify(errorMessage(error, "Unable to load store owners."), "error"));
  }, [type, notify]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const parsed = (type === "store" ? storeSchema : adminUserSchema).safeParse(data);
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Check the entered details.", "error");
      return;
    }
    setBusy(true);
    try {
      await adminService.createDirectoryRecord(parsed.data);
      onCreated();
    } catch (error) {
      notify(errorMessage(error, "Unable to create record."), "error");
    } finally { setBusy(false); }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        <div className="modal-symbol">{type === "store" ? <Store size={21} /> : <Users size={21} />}</div>
        <span className="section-kicker">{type === "store" ? "GROW THE DIRECTORY" : "GROW THE COMMUNITY"}</span>
        <h2 id="create-title">Add {type === "store" ? "a store" : "a person"}</h2>
        <p className="modal-description">{type === "store" ? "Give a great local business a place on Goodmark." : "Create an account for someone in the community."}</p>
        <form className="modal-form" onSubmit={submit}>
          {type === "store" ? <>
            <Field label="Store name"><input name="name" required maxLength={100} placeholder="e.g. Neighborhood Market" /></Field>
            <Field label="Store email"><input name="email" required type="email" maxLength={255} placeholder="hello@store.com" /></Field>
            <Field label="Address"><input name="address" required maxLength={400} placeholder="Street, city, and ZIP" /></Field>
            <Field label="Store owner"><select name="ownerId" defaultValue="" required disabled={owners.length === 0}><option value="">{owners.length ? "Select an unassigned owner" : "Create an owner account first"}</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.email}</option>)}</select></Field>
          </> : <>
            <Field label="Full name"><input name="name" required minLength={20} maxLength={60} placeholder="At least 20 characters" /></Field>
            <Field label="Email address"><input name="email" required type="email" maxLength={254} placeholder="you@example.com" /></Field>
            <Field label="Address"><input name="address" required maxLength={400} placeholder="Street, city, and ZIP" /></Field>
            <Field label="Temporary password"><input name="password" type="password" required minLength={8} maxLength={16} pattern="^(?=.*[A-Z])(?=.*[^A-Za-z0-9\\s]).{8,16}$" title="Use 8–16 characters, including an uppercase letter and a special character." placeholder="8–16 chars, uppercase & special character" /></Field>
            <Field label="Role"><select name="role" defaultValue="user"><option value="user">Normal user</option><option value="admin">Administrator</option><option value="owner">Store owner</option></select></Field>
          </>}
          <div className="modal-actions">
            <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy || (type === "store" && owners.length === 0)}>{busy ? "Adding…" : "Add"}<ChevronRight size={16} /></button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PasswordDialog({ onClose, notify }: { onClose: () => void; notify: Notify }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const formData = new FormData(event.currentTarget);
    const parsed = passwordChangeSchema.safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the entered details.");
      setBusy(false);
      return;
    }
    try {
      await authService.changePassword(parsed.data.currentPassword, parsed.data.newPassword);
      onClose(); notify("Your password has been updated.");
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Unable to update password."); }
    finally { setBusy(false); }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="password-title">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        <div className="modal-symbol"><ShieldCheck size={21} /></div>
        <span className="section-kicker">ACCOUNT SECURITY</span>
        <h2 id="password-title">Update your password</h2>
        <p className="modal-description">Use 8–16 characters, including an uppercase letter and a special character.</p>
        <form className="modal-form" onSubmit={submit}>
          <Field label="Current password"><input name="currentPassword" type="password" required autoComplete="current-password" /></Field>
          <Field label="New password"><input name="newPassword" type="password" required minLength={8} maxLength={16} pattern="^(?=.*[A-Z])(?=.*[^A-Za-z0-9\\s]).{8,16}$" title="Use 8–16 characters, including an uppercase letter and a special character." autoComplete="new-password" /></Field>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default App;
