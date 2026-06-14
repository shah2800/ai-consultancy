import { useState, useEffect, useLayoutEffect, Suspense, lazy, useRef } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useSearchParams,
  Link,
  useLocation,
  Outlet,
} from "react-router-dom";
import api from "./api/api";
import { canPrefetchRoutes, runWhenIdle } from "./utils/performance";
import { ShellScrollContext } from "./contexts/ShellScrollContext";

const Navbar = lazy(() => import("./components/Navbar"));
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Leads = lazy(() => import("./pages/Leads"));
const LeadProfile = lazy(() => import("./pages/LeadProfile"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Broadcast = lazy(() => import("./pages/Broadcast"));
const Universities = lazy(() => import("./pages/Universities"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Team = lazy(() => import("./pages/Team"));
const Help = lazy(() => import("./pages/Help"));
const WebsiteApplicationsDashboard = lazy(() => import("./pages/WebsiteApplicationsDashboard"));
const WebsiteReviewsDashboard = lazy(() => import("./pages/WebsiteReviewsDashboard"));
const WebsiteCmsDashboard = lazy(() => import("./pages/WebsiteCmsDashboard"));
const WebsiteIntakePage = lazy(() => import("./pages/WebsiteIntakePage"));
const StudentRegistrationPage = lazy(() => import("./pages/StudentRegistrationPage"));
const StudentTrackerPage = lazy(() => import("./pages/StudentTrackerPage"));

/** Wraps auth pages so route changes animate in (login ↔ register ↔ forgot / reset). */
function AuthPageTransition() {
  const location = useLocation();

  /* Warm sibling route chunks so "Back to sign in" / tab switches don’t flash Suspense. */
  useEffect(() => {
    void import("./pages/Login");
    void import("./pages/Register");
    void import("./pages/ForgotPassword");
    void import("./pages/ResetPassword");
  }, []);

  return (
    <div className="auth-page-transition">
      <div
        key={`${location.pathname}${location.search}`}
        className="auth-page-transition__inner"
      >
        <Outlet />
      </div>
    </div>
  );
}

function RegisterRoute() {
  const [searchParams] = useSearchParams();
  const invite = searchParams.get("invite")?.trim() || "";
  const [allow, setAllow] = useState(null);
  const [inviteValid, setInviteValid] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (invite) {
        try {
          const res = await api.get("/public/invite-preview", { params: { token: invite } });
          if (!cancelled) setInviteValid(!!res.data?.valid);
        } catch {
          if (!cancelled) setInviteValid(false);
        }
      } else {
        setInviteValid(null);
      }
      try {
        const res = await api.get("/public/app-config");
        if (!cancelled) setAllow(!!res.data?.allowPublicRegister);
      } catch {
        if (!cancelled) {
          setAllow(import.meta.env.VITE_ALLOW_PUBLIC_REGISTER !== "false");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invite]);

  if (allow === null || (invite && inviteValid === null)) {
    return (
      <div className="page-shell" style={{ padding: 28, color: "var(--text-2)" }}>
        Loading…
      </div>
    );
  }
  if (invite && inviteValid === false) {
    return (
      <div className="page-shell" style={{ padding: 48, maxWidth: 480 }}>
        <h1 style={{ fontSize: 22, fontFamily: "var(--font-heading)", marginTop: 0 }}>Invalid or expired invite</h1>
        <p style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
          Ask your admin for a new signup link (invites expire after 48 hours).
        </p>
        <Link to="/" style={{ color: "var(--accent)", fontWeight: 700 }}>
          Back to sign in
        </Link>
      </div>
    );
  }
  if (!allow && !invite) return <Navigate to="/" replace />;
  return <Register inviteToken={invite || null} />;
}

function RouteLoadingFallback() {
  return (
    <div className="page-shell" style={{ padding: 28, maxWidth: 560 }}>
      <div className="dashboard-skeleton-pulse" style={{ width: "min(100%, 320px)", height: 22, borderRadius: 8 }} aria-hidden />
      <div className="dashboard-skeleton-pulse" style={{ width: "min(100%, 260px)", height: 12, borderRadius: 6, marginTop: 14 }} aria-hidden />
      <p style={{ margin: "18px 0 0", fontSize: 13, color: "var(--text-3)" }}>Loading…</p>
    </div>
  );
}

function Layout({ children }) {
  const mainScrollRef = useRef(null);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  /* Reset scroll on route change synchronously before paint.
     Single-pass is enough now that scroll-behavior is `auto` on the main area;
     the old double-rAF worked around smooth-scroll fighting the jump-to-top. */
  useLayoutEffect(() => {
    const main = mainScrollRef.current;
    if (main) main.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <ShellScrollContext.Provider value={mainScrollRef}>
    <div className="app-shell">
      <header className="mobile-nav-bar" aria-label="Mobile navigation">
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-expanded={navOpen}
          aria-controls="crm-sidebar"
          onClick={() => setNavOpen(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
          <span className="sr-only">Open menu</span>
        </button>
        <span className="mobile-nav-brand">NextStep CRM</span>
      </header>

      <button
        type="button"
        className={`app-shell__overlay ${navOpen ? "is-open" : ""}`}
        aria-label="Close navigation"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      <aside id="crm-sidebar" className={`app-shell__sidebar ${navOpen ? "is-open" : ""}`}>
        <Suspense fallback={<div className="app-shell__sidebar-loading" aria-hidden />}>
          <Navbar onNavigate={() => setNavOpen(false)} />
        </Suspense>
      </aside>

      <main ref={mainScrollRef} className="app-shell__main">{children}</main>
    </div>
    </ShellScrollContext.Provider>
  );
}

export default function App() {
  useEffect(() => {
    if (!canPrefetchRoutes()) return undefined;
    // Tier 1 — most-visited chunks right after first paint
    const cancelT1 = runWhenIdle(() => {
      void import("./pages/Dashboard");
      void import("./pages/Leads");
      void import("./pages/Notifications");
      void import("./pages/WebsiteApplicationsDashboard");
    }, 800);
    // Tier 2 — secondary chunks after T1 finishes
    const cancelT2 = runWhenIdle(() => {
      void import("./pages/LeadProfile");
      void import("./pages/Analytics");
      void import("./pages/Settings");
      void import("./pages/Broadcast");
    }, 2800);
    // Tier 3 — rarely visited, lowest priority
    const cancelT3 = runWhenIdle(() => {
      void import("./pages/Universities");
      void import("./pages/Team");
      void import("./pages/WebsiteIntakePage");
      void import("./pages/Help");
    }, 5000);
    return () => {
      cancelT1();
      cancelT2();
      cancelT3();
    };
  }, []);

  return (
    <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || ""}>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route element={<AuthPageTransition />}>
            <Route path="/" element={<Login />} />
            <Route path="/register" element={<RegisterRoute />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Route>
          <Route path="/apply" element={<StudentRegistrationPage />} />
          <Route path="/track" element={<StudentTrackerPage />} />
          <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
          <Route path="/website-applications" element={<Layout><WebsiteApplicationsDashboard /></Layout>} />
          <Route path="/website-reviews" element={<Layout><WebsiteReviewsDashboard /></Layout>} />
          <Route path="/website-cms" element={<Layout><WebsiteCmsDashboard /></Layout>} />
          <Route path="/leads" element={<Layout><Leads /></Layout>} />
          <Route path="/website-intake/:id" element={<Layout><WebsiteIntakePage /></Layout>} />
          <Route path="/leads/:id" element={<Layout><LeadProfile /></Layout>} />
          <Route path="/analytics" element={<Layout><Analytics /></Layout>} />
          <Route path="/notifications" element={<Layout><Notifications /></Layout>} />
          <Route path="/team" element={<Layout><Team /></Layout>} />
          <Route path="/broadcast" element={<Layout><Broadcast /></Layout>} />
          <Route path="/universities" element={<Layout><Universities /></Layout>} />
          <Route path="/assigned-leads" element={<Navigate to="/leads" replace />} />
          <Route path="/assigned-team" element={<Navigate to="/leads" replace />} />
          <Route path="/settings" element={<Layout><Settings /></Layout>} />
          <Route path="/help" element={<Layout><Help /></Layout>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
