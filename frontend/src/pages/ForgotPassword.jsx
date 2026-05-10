import { useState } from "react";
import { Link } from "react-router-dom";
import API from "../api/api";
import PasswordField from "../components/PasswordField";

function formatForgotPasswordError(err) {
  if (!err.response) {
    const base = API.defaults?.baseURL || "http://localhost:5000";
    if (err.code === "ERR_NETWORK" || err.message === "Network Error") {
      return `Cannot reach the API (${base}). Start the backend from the folder that contains index.js: npm install && npm start. Match the port in frontend/.env as VITE_API_URL if it is not 5000.`;
    }
    return err.message || "No response from server. Is the backend running?";
  }
  const d = err.response.data;
  const status = err.response.status;
  if (typeof d === "string") {
    if (d.includes("Cannot POST") || status === 404) {
      return `API returned 404 — this server does not have password reset routes. Restart the backend from your ai-consultancy project (node index.js) and use the same URL as login (${API.defaults?.baseURL || "http://localhost:5000"}).`;
    }
    return d.length < 400 ? `${d} (${status})` : `Server error (${status}).`;
  }
  if (typeof d === "object" && d !== null) {
    return d.error || d.message || `Something went wrong (${status}).`;
  }
  return `Server error (${status}).`;
}

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

export default function ForgotPassword() {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [finished, setFinished] = useState(false);

  const sendCode = async () => {
    const e = email.trim();
    if (!e) {
      setError("Enter your email address.");
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await API.post("/auth/forgot-password", { email: e });
      setStep("reset");
      setInfo(
        "If that email is registered, a 6-digit code was generated. With SMTP configured in the server .env, it is emailed to you (check spam). If you have not set up SMTP yet, look at the terminal where you ran npm start / node index.js — the OTP is printed there in a boxed message."
      );
    } catch (err) {
      setError(formatForgotPasswordError(err));
    } finally {
      setLoading(false);
    }
  };

  const updatePassword = async () => {
    const e = email.trim();
    const code = otp.trim().replace(/\D/g, "");
    if (!e || !code) {
      setError("Enter the email and the 6-digit code from the email.");
      return;
    }
    if (code.length !== 6) {
      setError("The code must be 6 digits.");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await API.post("/auth/reset-password", {
        email: e,
        otp: code,
        newPassword,
      });
      setFinished(true);
      setInfo("");
    } catch (err) {
      setError(formatForgotPasswordError(err));
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
          Forgot password
        </div>
        <p style={{ color: "var(--sidebar-text)", marginTop: 20, fontSize: 15, lineHeight: 1.6, maxWidth: 420 }}>
          We email a <strong style={{ color: "var(--sidebar-text-active)" }}>6-digit verification code</strong>. Enter it
          here with your new password. Codes expire in 15 minutes. Configure SMTP on the server to deliver mail; otherwise
          the code appears in the API terminal when you click send.
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
            {finished ? "Password updated" : step === "email" ? "Send code" : "New password"}
          </h2>

          {!finished ? (
            <p style={{ color: "var(--text-3)", fontSize: 14, marginBottom: 20, lineHeight: 1.55 }}>
              Use the same email as your CRM account. The API must be running (same URL as sign-in — check{" "}
              <code style={{ fontSize: 12 }}>VITE_API_URL</code> in frontend/.env).
            </p>
          ) : null}

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
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          ) : null}

          {info ? (
            <div
              style={{
                background: "var(--accent-light)",
                border: "1px solid rgb(var(--accent-rgb) / 0.25)",
                color: "var(--accent-hover)",
                padding: "12px 14px",
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.55,
                marginBottom: 16,
              }}
            >
              {info}
            </div>
          ) : null}

          {finished ? (
            <div
              style={{
                background: "var(--ready-bg)",
                border: "1px solid rgb(167 243 208)",
                color: "var(--ready)",
                padding: "12px 14px",
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.55,
                marginBottom: 20,
              }}
            >
              You can sign in with your new password.
            </div>
          ) : null}

          {!finished && step === "email" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label
                  htmlFor="forgot-email"
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}
                >
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  onKeyDown={(ev) => ev.key === "Enter" && sendCode()}
                  style={inputStyle}
                />
              </div>
              <button
                type="button"
                onClick={sendCode}
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
                {loading ? "Sending…" : "Send verification code"}
              </button>
            </div>
          ) : null}

          {!finished && step === "reset" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label
                  htmlFor="forgot-email-2"
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}
                >
                  Email
                </label>
                <input
                  id="forgot-email-2"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  htmlFor="forgot-otp"
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}
                >
                  Verification code (6 digits)
                </label>
                <input
                  id="forgot-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChange={(ev) => setOtp(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                  style={{ ...inputStyle, fontSize: 20, letterSpacing: "0.2em", fontFamily: "monospace" }}
                />
              </div>
              <div>
                <label
                  htmlFor="forgot-new-pw"
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}
                >
                  New password
                </label>
                <PasswordField
                  id="forgot-new-pw"
                  value={newPassword}
                  onChange={(ev) => setNewPassword(ev.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  htmlFor="forgot-confirm-pw"
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 6 }}
                >
                  Confirm new password
                </label>
                <PasswordField
                  id="forgot-confirm-pw"
                  value={confirmPassword}
                  onChange={(ev) => setConfirmPassword(ev.target.value)}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  style={inputStyle}
                />
              </div>
              <button
                type="button"
                onClick={updatePassword}
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
              <button
                type="button"
                onClick={sendCode}
                disabled={loading}
                style={{
                  padding: "10px",
                  background: "transparent",
                  color: "var(--text-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                Resend code
              </button>
            </div>
          ) : null}

          {finished ? (
            <Link
              to="/"
              style={{
                display: "inline-block",
                marginTop: 8,
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
              Go to sign in
            </Link>
          ) : null}

          <p style={{ marginTop: 24, fontSize: 14, textAlign: "center", color: "var(--text-2)" }}>
            <Link to="/" style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}>
              ← Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
