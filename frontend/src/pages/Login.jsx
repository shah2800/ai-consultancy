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
    if (!email || !password) { setError("Please fill in all fields."); return; }
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

  const handleKey = (e) => { if (e.key === "Enter") login(); };

  return (
    <div className="auth-shell">
      {/* Left brand panel */}
      <div className="auth-shell__aside auth-shell__aside--login">
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 60 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: "linear-gradient(145deg, var(--accent-hover), var(--accent))",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 32px var(--sidebar-glow)",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, fontFamily: "var(--font-heading)" }}>
              Next Step International
            </div>
            <div style={{ color: "var(--sidebar-text-muted)", fontSize: 12, marginTop: 2 }}>
              Study Abroad CRM
            </div>
          </div>
        </div>

        <h1 style={{
          color: "#fff",
          fontSize: 38,
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          lineHeight: 1.2,
          marginBottom: 18,
          letterSpacing: "-0.02em",
        }}>
          Manage your leads<br />
          <span style={{ color: "var(--accent)" }}>smarter with AI.</span>
        </h1>
        <p style={{ color: "var(--sidebar-text)", fontSize: 15, lineHeight: 1.7, maxWidth: 360 }}>
          Track student inquiries, view AI conversations, and convert leads for Georgia, Turkey & China programs.
        </p>

        {/* Stats */}
        <div style={{ display: "flex", gap: 32, marginTop: 48 }}>
          {[
            { val: "AI Powered", label: "Conversations" },
            { val: "Real-time", label: "Lead Scoring" },
            { val: "WhatsApp", label: "Direct Contact" },
          ].map(({ val, label }) => (
            <div key={label}>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "var(--font-heading)" }}>{val}</div>
              <div style={{ color: "var(--sidebar-text-muted)", fontSize: 12, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="auth-shell__panel">
        <div className="auth-shell__card">
          <h2 style={{ fontSize: 26, fontFamily: "var(--font-heading)", fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>
            Welcome back
          </h2>
          <p style={{ color: "var(--text-3)", fontSize: 14, marginBottom: 36 }}>
            Sign in to your CRM dashboard
          </p>

          {error && (
            <div style={{
              background: "var(--danger-bg)",
              border: "1px solid rgb(252 165 165)",
              color: "var(--danger)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              marginBottom: 20,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}>
                Email address
              </label>
              <input
                type="email"
                className="login-form-input"
                placeholder="admin@nextstep.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKey}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  border: "1.5px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 14,
                  background: "var(--surface)",
                  color: "var(--text)",
                  fontFamily: "var(--font-body)",
                  transition: "border-color 0.15s",
                }}
              />
            </div>
            <div>
              <label htmlFor="login-password" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}>
                Password
              </label>
              <PasswordField
                id="login-password"
                className="login-form-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKey}
                autoComplete="current-password"
                style={{
                  padding: "11px 14px",
                  border: "1.5px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 14,
                  background: "var(--surface)",
                  color: "var(--text)",
                  fontFamily: "var(--font-body)",
                  transition: "border-color 0.15s",
                }}
              />
            </div>

            <button
              onClick={login}
              disabled={loading}
              style={{
                marginTop: 6,
                padding: "13px",
                background: loading ? "var(--border)" : "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "var(--font-body)",
                transition: "all 0.15s",
                boxShadow: loading ? "none" : "0 4px 18px rgb(var(--accent-rgb) / 0.35)",
              }}
            >
              {loading ? "Signing in..." : "Sign in →"}
            </button>

            {allowPublicRegister ? (
              <p style={{ textAlign: "center", marginTop: 8, marginBottom: 0, fontSize: 14, color: "var(--text-2)", lineHeight: 1.5 }}>
                Don&apos;t have an account?{" "}
                <Link
                  to="/register"
                  style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}
                >
                  Create account
                </Link>
              </p>
            ) : (
              <p style={{ textAlign: "center", marginTop: 8, marginBottom: 0, fontSize: 13, color: "var(--text-3)", lineHeight: 1.5 }}>
                Public signup is off. Use the <strong style={{ color: "var(--text-2)" }}>invite link</strong> from your admin or platform owner (ends with{" "}
                <code style={{ fontSize: 11 }}>?invite=…</code>
                ).
              </p>
            )}

            <p style={{ textAlign: "center", marginTop: 10, marginBottom: 0, fontSize: 13 }}>
              <Link to="/forgot-password" style={{ color: "var(--text-3)", fontWeight: 600, textDecoration: "none" }}>
                Forgot password?
              </Link>
            </p>
          </div>

          <p style={{ marginTop: 28, fontSize: 12, color: "var(--text-3)", lineHeight: 1.55 }}>
            To change your password after you’re logged in, open <strong style={{ color: "var(--text-2)" }}>Settings</strong> from the sidebar and use{" "}
            <strong style={{ color: "var(--text-2)" }}>Account &amp; password</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
