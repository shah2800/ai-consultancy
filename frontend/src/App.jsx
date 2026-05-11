import { useState, useEffect, useLayoutEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, Link, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import api, { cachedGet } from "./api/api";
import { canPrefetchRoutes, runWhenIdle } from "./utils/performance";

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
          const res = await cachedGet("/public/invite-preview", { params: { token: invite } }, 120000);
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

function Layout({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  /* Long pages scroll `.app-shell__main`. Reset synchronously before paint so the next route isn’t “above” the viewport. */
  useLayoutEffect(() => {
    const scrollTop = () => {
      const main = document.querySelector(".app-shell__main");
      if (main) main.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo(0, 0);
    };
    scrollTop();
    requestAnimationFrame(scrollTop);
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
        <Navbar onNavigate={() => setNavOpen(false)} />
      </aside>

      <main className="app-shell__main">{children}</main>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    if (!canPrefetchRoutes()) return undefined;
    const cancel = runWhenIdle(() => {
      // Warm common route chunks after first paint.
      import("./pages/Dashboard");
      import("./pages/Leads");
      import("./pages/LeadProfile");
      import("./pages/Notifications");
      import("./pages/Analytics");
    }, 1400);
    return cancel;
  }, []);

  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="page-shell" style={{ padding: 24, color: "var(--text-2)" }}>
            Loading...
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
          <Route path="/leads" element={<Layout><Leads /></Layout>} />
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
          <Route path="/register" element={<RegisterRoute />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
