import { useState, useEffect } from "react";
import API from "../api/api";
import { useNavigate, Link } from "react-router-dom";
import PasswordField from "../components/PasswordField";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [allowPublicRegister, setAllowPublicRegister] = useState(
    import.meta.env.VITE_ALLOW_PUBLIC_REGISTER !== "false"
  );
  const nav = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await API.get("/public/app-config");
        if (!cancelled) setAllowPublicRegister(!!res.data?.allowPublicRegister);
      } catch {
        /* keep build-time default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async () => {
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await API.post("/auth/login", { email, password });
      localStorage.setItem("token", res.data.token);
      nav("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter") login();
  };

  const features = [
    { title: "AI-assisted", desc: "Student conversations" },
    { title: "Live pipeline", desc: "Lead scoring & stages" },
    { title: "WhatsApp", desc: "Integrated routing" },
  ];

  const logoMark = (
    <div className="auth-aside-logo" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    </div>
  );

  return (
    <div className="auth-shell">
      <aside className="auth-shell__aside">
        <div className="auth-aside-brand-row">
          {logoMark}
          <div>
            <div className="auth-aside-title">Next Step International</div>
            <div className="auth-aside-sub">Study abroad CRM</div>
          </div>
        </div>

        <h1 className="auth-aside-headline">
          Manage enquiries with clarity.
          <br />
          <span className="auth-aside-headline-accent">Help every student move forward.</span>
        </h1>
        <p className="auth-aside-lede">
          One workspace for intake, follow-ups, AI replies, and programmes across your markets—built for education
          consultants.
        </p>

        <dl className="auth-aside-features">
          {features.map(({ title, desc }) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>
      </aside>

      <div className="auth-shell__panel">
        <div className="auth-mobile-brand">
          {logoMark}
          <div>
            <div className="auth-mobile-brand__title">Next Step International</div>
            <div className="auth-mobile-brand__meta">Study abroad CRM</div>
          </div>
        </div>

        <main className="auth-shell__card auth-card-login">
          <header className="auth-login-header">
            <h2 className="auth-login-title">Sign in</h2>
            <p className="auth-login-lede">
              Workspace access for your team. Use the email and password from your administrator.
            </p>
          </header>

          <div aria-live="polite" aria-atomic="true">
            {error ? <div role="alert" className="auth-alert-error">{error}</div> : null}
          </div>

          <div className="auth-login-form">
            <div>
              <label className="auth-field-label" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKey}
                className="auth-input-login"
              />
            </div>
            <div>
              <label className="auth-field-label" htmlFor="login-password">
                Password
              </label>
              <PasswordField
                id="login-password"
                name="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKey}
                autoComplete="current-password"
                inputClassName="auth-input-login"
              />
            </div>

            <button type="button" className="auth-submit-primary" onClick={login} disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>

            {allowPublicRegister ? (
              <p className="auth-footer-links">
                New to the platform?{" "}
                <Link to="/register" className="auth-link-accent">
                  Create an account
                </Link>
              </p>
            ) : (
              <p className="auth-footer-links auth-footer-links--muted">
                Registration is invitation-only. Use the link from your admin (
                <code className="auth-inline-code">?invite=…</code>) to join this workspace.
              </p>
            )}

            <p className="auth-footer-links">
              <Link to="/forgot-password" className="auth-link-muted">
                Forgot password?
              </Link>
            </p>
          </div>

          <p className="auth-login-footnote">
            After you sign in, update your password anytime under{" "}
            <strong className="auth-footnote-strong">Settings → Account &amp; password</strong>.
          </p>
        </main>
      </div>
    </div>
  );
}
