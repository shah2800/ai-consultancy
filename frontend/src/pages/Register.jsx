import { useState, useEffect } from "react";

import API from "../api/api";

import { useNavigate, Link } from "react-router-dom";

import PasswordField from "../components/PasswordField";



export default function Register({ inviteToken = null }) {

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "admin" });

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [inviteHint, setInviteHint] = useState(null);
  const [otp, setOtp] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpSentTo, setOtpSentTo] = useState("");
  const [otpOk, setOtpOk] = useState("");
  const [showOtpModal, setShowOtpModal] = useState(false);

  const nav = useNavigate();



  useEffect(() => {

    if (!inviteToken) {

      setInviteHint(null);

      return;

    }

    let cancelled = false;

    (async () => {

      try {

        const res = await API.get("/public/invite-preview", { params: { token: inviteToken } });

        if (cancelled || !res.data?.valid) return;

        const locked = res.data.lockedEmail;

        setInviteHint({

          kind: res.data.kind,

          workspaceName: res.data.workspaceName,

          lockedEmail: locked || "",

        });

        if (locked) {

          setForm((p) => ({ ...p, email: locked }));

        }

      } catch {

        /* ignore */

      }

    })();

    return () => {

      cancelled = true;

    };

  }, [inviteToken]);



  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (name === "email") {
      setOtpSentTo("");
      setOtp("");
      setOtpOk("");
      setShowOtpModal(false);
    }
  };

  const isAllowedRegisterEmail = (value) => {
    const email = String(value || "").trim().toLowerCase();
    return email.endsWith("@gmail.com") || email.endsWith("@googlemail.com");
  };
  const isEmailFormatValid = (value) => {
    const email = String(value || "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const normalizedEmail = String(form.email || "").trim().toLowerCase();

  const requestSignupOtp = async (email) => {
    await API.post("/auth/register/send-otp", { email });
    setOtpSentTo(email);
    setOtpOk("We sent OTP to your email. Enter it to finish account creation.");
  };



  const register = async () => {

    if (!form.name || !form.email || !form.password) {

      setError("All fields required");

      return;

    }

    if (form.name.trim().length < 3) {

      setError("Full name must be at least 3 characters.");

      return;

    }

    if (!isEmailFormatValid(normalizedEmail)) {

      setError("Enter a valid email like username@gmail.com.");

      return;

    }

    if (!isAllowedRegisterEmail(form.email)) {

      setError("Use a Gmail address (@gmail.com) to create an account.");

      return;

    }

    const code = otp.trim().replace(/\D/g, "");
    if (otpSentTo !== normalizedEmail) {
      setLoading(true);
      setError("");
      setOtpOk("");
      try {
        await requestSignupOtp(normalizedEmail);
        setShowOtpModal(true);
      } catch (err) {
        setError(err.response?.data?.error || "Could not send verification code.");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (code.length !== 6) {
      setError("Enter the OTP from your Gmail to continue.");
      setShowOtpModal(true);
      return;
    }

    setLoading(true);

    setError("");

    try {

      let res;

      if (inviteToken) {

        res = await API.post("/auth/register-invite", {

          token: inviteToken,

          name: form.name,

          email: form.email,

          password: form.password,

          otp: code,

        });

      } else {

        res = await API.post("/auth/register", { ...form, otp: code });

      }

      localStorage.setItem("token", res.data.token);

      nav("/dashboard");

    } catch (err) {

      setError(err.response?.data?.error || "Registration failed");

    } finally {

      setLoading(false);

    }

  };



  const inviteTitle =

    inviteHint?.kind === "owner"

      ? "Create your consultancy workspace"

      : inviteHint?.kind === "member"

        ? `Join ${inviteHint.workspaceName || "your team"}`

        : "Create your consultancy account";



  return (

    <div className="auth-shell">

      <div className="auth-shell__aside">

        <div style={{ color: "var(--sidebar-text-active)", fontSize: 38, fontWeight: 700, lineHeight: 1.1, fontFamily: "var(--font-heading)" }}>

          Join NextStep<br />CRM

        </div>

        <p style={{ color: "var(--sidebar-text)", marginTop: 20, fontSize: 15, lineHeight: 1.6 }}>

          {inviteToken

            ? "You’re joining using a secure invite link from your organisation."

            : "Create your consultancy account and start converting leads with AI."}

        </p>

      </div>



      <div className="auth-shell__panel">

        <div className="auth-shell__card">

          <h2 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" }}>{inviteTitle}</h2>



          {error && (

            <div

              style={{

                background: "var(--danger-bg)",

                border: "1px solid rgb(252 165 165)",

                color: "var(--danger)",

                padding: 12,

                borderRadius: 8,

                marginBottom: 16,

                fontSize: 13,

              }}

            >

              {error}

            </div>

          )}



          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            <input name="name" placeholder="Full Name" value={form.name} onChange={handleChange} style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontFamily: "var(--font-body)", fontSize: 14 }} />

            <input

              name="email"

              type="email"

              placeholder="username@gmail.com"

              value={form.email}

              onChange={handleChange}

              readOnly={Boolean(inviteHint?.lockedEmail)}

              style={{

                padding: "11px 14px",

                borderRadius: 10,

                border: "1.5px solid var(--border)",

                background: inviteHint?.lockedEmail ? "var(--surface-2)" : "var(--surface)",

                fontFamily: "var(--font-body)",

                fontSize: 14,

                opacity: inviteHint?.lockedEmail ? 0.95 : 1,

              }}

            />

            <PasswordField

              id="register-password"

              name="password"

              placeholder="Password (min 6)"

              value={form.password}

              onChange={handleChange}

              autoComplete="new-password"

              style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontFamily: "var(--font-body)", fontSize: 14 }}

            />



            <button

              onClick={register}

              disabled={loading}

              style={{

                padding: "13px",

                background: loading ? "var(--border)" : "var(--accent)",

                color: "#fff",

                border: "none",

                borderRadius: 10,

                fontWeight: 600,

                cursor: loading ? "not-allowed" : "pointer",

                fontFamily: "var(--font-body)",

                boxShadow: loading ? "none" : "0 4px 18px rgb(var(--accent-rgb) / 0.35)",

              }}

            >

              {loading ? "Creating..." : "Create Account →"}

            </button>



            <p style={{ textAlign: "center", marginTop: 10, fontSize: 14, color: "var(--text-2)" }}>

              Already have an account?{" "}

              <Link to="/" style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}>

                Sign in

              </Link>

            </p>

          </div>

        </div>

      </div>

      {showOtpModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgb(15 23 42 / 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 14,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow: "var(--shadow-lg)",
              padding: 18,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", marginBottom: 8 }}>
              Verify your Gmail
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>
              {otpOk || "We sent OTP to your email. Enter it below to complete registration."}
              <br />
              <strong style={{ color: "var(--text)" }}>{normalizedEmail}</strong>
            </p>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="Enter OTP from Gmail"
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: 10,
                border: "1.5px solid var(--border)",
                background: "var(--surface)",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                marginBottom: 12,
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowOtpModal(false)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1.5px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--text-2)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={otpSending}
                onClick={async () => {
                  setOtpSending(true);
                  setError("");
                  try {
                    await requestSignupOtp(normalizedEmail);
                  } catch (err) {
                    setError(err.response?.data?.error || "Could not send verification code.");
                  } finally {
                    setOtpSending(false);
                  }
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1.5px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--text-2)",
                  fontWeight: 600,
                  cursor: otpSending ? "not-allowed" : "pointer",
                }}
              >
                {otpSending ? "Sending..." : "Resend OTP"}
              </button>
              <button
                type="button"
                onClick={register}
                disabled={loading}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: loading ? "var(--border)" : "var(--accent)",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Verifying..." : "Verify & Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>

  );

}

