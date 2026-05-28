import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import API from "../api/api";
import PasswordField from "../components/PasswordField";

const inputStyle = {
  width: "100%",
  padding: "11px 14px",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  background: "var(--surface)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  boxSizing: "border-box",
};

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const emailFromUrl = useMemo(() => searchParams.get("email") || "", [searchParams]);

  const [email, setEmail] = useState(emailFromUrl);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (emailFromUrl) setEmail(emailFromUrl);
  }, [emailFromUrl]);

  const submit = async () => {
    setError("");
    const code = otp.trim().replace(/\D/g, "");
    if (!email.trim() || code.length !== 6) {
      setError("Enter your email and the 6-digit code from the email.");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await API.post("/auth/reset-password", {
        email: email.trim(),
        otp: code,
        newPassword,
      });
      setSuccess(true);
    } catch (err) {
      const d = err.response?.data;
      setError(
        typeof d === "object" && d?.error
          ? d.error
          : err.response?.status === 404
            ? "API not found — start the backend from the project with index.js."
            : "Could not reset password."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-shell__aside">
        <div
          style={{
            color: "var(--sidebar-text-active)",
            fontSize: 32,
            fontWeight: 700,
            lineHeight: 1.15,
            fontFamily: "var(--font-heading)",
          }}
        >
          Reset password
        </div>
        <p style={{ color: "var(--sidebar-text)", marginTop: 20, fontSize: 15, lineHeight: 1.6, maxWidth: 400 }}>
          Enter the <strong style={{ color: "var(--sidebar-text-active)" }}>6-digit code</strong> from your email, then
          choose a new password. Prefer the main flow? Use{" "}
          <Link to="/forgot-password" style={{ color: "var(--accent)" }}>
            Forgot password
          </Link>
          .
        </p>
      </div>

      <div className="auth-shell__panel">
        <div className="auth-shell__card">
          <h2
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "var(--text)",
              fontFamily: "var(--font-heading)",
              marginBottom: 8,
            }}
          >
            Code &amp; new password
          </h2>

          {error ? (
            <div
              style={{
                background: "var(--danger-bg)",
                border: "1px solid rgb(252 165 165)",
                color: "var(--danger)",
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          ) : null}

          {success ? (
            <div
              style={{
                background: "var(--ready-bg)",
                border: "1px solid rgb(167 243 208)",
                color: "var(--ready)",
                padding: "12px 14px",
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 20,
              }}
            >
              Password updated.
            </div>
          ) : null}

          {!success ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label htmlFor="reset-email" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}>
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  placeholder="Your account email"
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="reset-otp" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}>
                  Verification code
                </label>
                <input
                  id="reset-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(ev) => setOtp(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  style={{ ...inputStyle, fontSize: 20, letterSpacing: "0.2em", fontFamily: "monospace" }}
                />
              </div>
              <div>
                <label htmlFor="reset-new" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}>
                  New password
                </label>
                <PasswordField id="reset-new" value={newPassword} onChange={(ev) => setNewPassword(ev.target.value)} autoComplete="new-password" style={inputStyle} />
              </div>
              <div>
                <label htmlFor="reset-confirm" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}>
                  Confirm
                </label>
                <PasswordField id="reset-confirm" value={confirm} onChange={(ev) => setConfirm(ev.target.value)} autoComplete="new-password" style={inputStyle} />
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={loading}
                style={{
                  padding: "13px",
                  background: loading ? "var(--border)" : "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-body)",
                  boxShadow: loading ? "none" : "0 4px 18px rgb(var(--accent-rgb) / 0.35)",
                }}
              >
                {loading ? "Saving…" : "Update password"}
              </button>
            </div>
          ) : (
            <Link
              to="/"
              style={{
                display: "inline-block",
                padding: "13px 20px",
                background: "var(--accent)",
                color: "#fff",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                fontFamily: "var(--font-body)",
              }}
            >
              Sign in
            </Link>
          )}

          <p style={{ marginTop: 24, fontSize: 14, textAlign: "center" }}>
            <Link to="/forgot-password" style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}>
              Forgot password flow
            </Link>
            {" · "}
            <Link to="/" style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
