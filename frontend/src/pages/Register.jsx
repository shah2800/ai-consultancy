import { useState, useEffect, useRef } from "react";
import API from "../api/api";
import { useNavigate, Link } from "react-router-dom";
import PasswordField from "../components/PasswordField";

export default function Register({ inviteToken = null }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [step, setStep] = useState("form");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [error, setError] = useState("");
  const [otpInfo, setOtpInfo] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [inviteHint, setInviteHint] = useState(null);
  const cooldownRef = useRef(null);
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
        if (locked) setForm((p) => ({ ...p, email: locked }));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    cooldownRef.current = setInterval(() => {
      setResendCooldown((p) => {
        if (p <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(cooldownRef.current);
  }, [resendCooldown]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const isGmailAddress = (value) => {
    const e = String(value || "").trim().toLowerCase();
    return e.endsWith("@gmail.com") || e.endsWith("@googlemail.com");
  };

  const isEmailFormatValid = (value) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  };

  const emailNorm = String(form.email || "").trim().toLowerCase();

  const sendOtp = async () => {
    setError("");
    if (!form.name.trim()) {
      setError("Full name is required.");
      return;
    }
    if (form.name.trim().length < 3) {
      setError("Full name must be at least 3 characters.");
      return;
    }
    if (!emailNorm) {
      setError("Email is required.");
      return;
    }
    if (!isEmailFormatValid(emailNorm)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!isGmailAddress(emailNorm)) {
      setError("Only Gmail addresses (@gmail.com) are allowed.");
      return;
    }
    if (!form.password) {
      setError("Password is required.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSendingOtp(true);
    try {
      await API.post("/auth/register/send-otp", { email: emailNorm });
      setOtpInfo(`A 6-digit code was sent to ${emailNorm}. It expires in 10 minutes.`);
      setOtpCode("");
      setStep("verify");
      setResendCooldown(60);
    } catch (err) {
      setError(err.response?.data?.error || "Could not send verification code. Try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  const resendOtp = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setOtpInfo("");
    setSendingOtp(true);
    try {
      await API.post("/auth/register/send-otp", { email: emailNorm });
      setOtpInfo(`A new code was sent to ${emailNorm}.`);
      setOtpCode("");
      setResendCooldown(60);
    } catch (err) {
      setError(err.response?.data?.error || "Could not resend code. Try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  const createAccount = async () => {
    setError("");
    if (!otpCode.trim()) {
      setError("Please enter the verification code.");
      return;
    }
    if (otpCode.trim().length !== 6) {
      setError("The code must be 6 digits.");
      return;
    }

    setLoading(true);
    try {
      let res;
      if (inviteToken) {
        res = await API.post("/auth/register-invite", {
          token: inviteToken,
          name: form.name,
          email: emailNorm,
          password: form.password,
          otpCode: otpCode.trim(),
        });
      } else {
        res = await API.post("/auth/register", {
          name: form.name,
          email: emailNorm,
          password: form.password,
          otpCode: otpCode.trim(),
        });
      }
      localStorage.setItem("token", res.data.token);
      nav("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFormKeyDown = (e) => {
    if (e.key === "Enter" && !sendingOtp) sendOtp();
  };

  const handleVerifyKeyDown = (e) => {
    if (e.key === "Enter" && !loading && otpCode.trim().length === 6) createAccount();
  };

  const inviteTitle =
    inviteHint?.kind === "owner"
      ? "Create your workspace"
      : inviteHint?.kind === "member"
        ? `Join ${inviteHint.workspaceName || "your team"}`
        : "Create your account";

  const asideHeadline =
    inviteToken != null ? "You're one step away from the dashboard." : "Launch your consultancy workspace.";

  const asideLede =
    inviteToken != null
      ? "Secure invite link verified. Finish signup with Gmail—we send a quick code so only you can activate this email."
      : "Sign up with Gmail, verify your inbox, then manage leads and AI chats in one calm workspace.";

  const features =
    inviteToken != null
      ? [
          { title: "Invite-only", desc: "Link from your organisation" },
          { title: "Email verify", desc: "Gmail OTP in seconds" },
          { title: "Same CRM", desc: "Leads & WhatsApp ready" },
        ]
      : [
          { title: "Gmail OTP", desc: "Confirms you own the inbox" },
          { title: "Team-ready", desc: "Roles & workspace access" },
          { title: "AI assistant", desc: "Replies & lead context" },
        ];

  const logoMark = (
    <div className="auth-aside-logo" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    </div>
  );

  const emailLocked = Boolean(inviteHint?.lockedEmail);

  return (
    <div className="auth-shell auth-shell--register">
      <aside className="auth-shell__aside">
        <div className="auth-aside-brand-row">
          {logoMark}
          <div>
            <div className="auth-aside-title">Next Step International</div>
            <div className="auth-aside-sub">Study abroad CRM</div>
          </div>
        </div>

        <h1 className="auth-aside-headline">
          {asideHeadline}
          <br />
          <span className="auth-aside-headline-accent">We keep onboarding simple.</span>
        </h1>
        <p className="auth-aside-lede">{asideLede}</p>

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
        <div className="auth-register-panel-stack">
          <div className="auth-mobile-brand">
            {logoMark}
            <div>
              <div className="auth-mobile-brand__title">Next Step International</div>
              <div className="auth-mobile-brand__meta">Study abroad CRM</div>
            </div>
          </div>

          <main className="auth-shell__card auth-card-login">
          <header className="auth-login-header">
            <h2 className="auth-login-title">{inviteTitle}</h2>
            <p className="auth-login-lede">
              Two steps: your profile, then a 6-digit verification code emailed to you.
            </p>
          </header>

          {inviteHint ? (
            <p className="auth-invite-meta" role="status">
              {inviteHint.kind === "owner"
                ? "You're creating a new consultancy workspace from a platform invite."
                : inviteHint.workspaceName
                  ? `Invitation to join "${inviteHint.workspaceName}".`
                  : "You're accepting a workspace invitation."}
            </p>
          ) : null}

          <div className="auth-register-stepper" aria-label="Registration progress">
            <span className={`auth-step-pill${step === "form" ? " is-current" : ""}`}>1 · Details</span>
            <span className="auth-step-sep" aria-hidden="true">
              →
            </span>
            <span className={`auth-step-pill${step === "verify" ? " is-current" : ""}`}>2 · Verify email</span>
          </div>

          <div aria-live="polite" aria-atomic="true">
            {error ? <div role="alert" className="auth-alert-error">{error}</div> : null}
            {otpInfo && !error ? <p className="auth-alert-success">{otpInfo}</p> : null}
          </div>

          {step === "form" ? (
            <div className="auth-login-form">
              <div>
                <label className="auth-field-label" htmlFor="register-name">
                  Full name
                </label>
                <input
                  id="register-name"
                  name="name"
                  autoComplete="name"
                  placeholder="Your full name"
                  value={form.name}
                  onChange={handleChange}
                  onKeyDown={handleFormKeyDown}
                  className="auth-input-login"
                />
              </div>
              <div>
                <label className="auth-field-label" htmlFor="register-email">
                  Email
                </label>
                <input
                  id="register-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@gmail.com"
                  value={form.email}
                  onChange={handleChange}
                  onKeyDown={handleFormKeyDown}
                  readOnly={emailLocked}
                  className={`auth-input-login${emailLocked ? " auth-input-login--readonly" : ""}`}
                />
              </div>
              <div>
                <label className="auth-field-label" htmlFor="register-password">
                  Password
                </label>
                <PasswordField
                  id="register-password"
                  name="password"
                  placeholder="At least 6 characters"
                  value={form.password}
                  onChange={handleChange}
                  onKeyDown={handleFormKeyDown}
                  autoComplete="new-password"
                  inputClassName="auth-input-login"
                />
              </div>

              <button type="button" className="auth-submit-primary" onClick={sendOtp} disabled={sendingOtp}>
                {sendingOtp ? "Sending code…" : "Send verification code"}
              </button>

              <p className="auth-form-hint">
                We only accept <strong className="auth-footnote-strong">@gmail.com</strong> addresses so we can deliver
                the verification code reliably.
              </p>

              <p className="auth-footer-links">
                Already registered?{" "}
                <Link to="/" className="auth-link-accent">
                  Sign in
                </Link>
              </p>
            </div>
          ) : null}

          {step === "verify" ? (
            <div className="auth-login-form">
              <p className="auth-callout">
                Enter the code we sent to <strong className="auth-footnote-strong">{emailNorm}</strong>. Wrong inbox?{" "}
                <button
                  type="button"
                  className="auth-text-btn"
                  onClick={() => {
                    setStep("form");
                    setError("");
                    setOtpInfo("");
                  }}
                >
                  Edit details
                </button>
              </p>

              <div>
                <label className="auth-field-label" htmlFor="register-otp">
                  6-digit code
                </label>
                <input
                  id="register-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={handleVerifyKeyDown}
                  className="auth-otp-input"
                  autoFocus
                />
              </div>

              <button type="button" className="auth-submit-primary" onClick={createAccount} disabled={loading}>
                {loading ? "Creating your account…" : "Verify and continue"}
              </button>

              <p className="auth-footer-links auth-footer-links--muted">
                Didn&apos;t get the code?{" "}
                <button
                  type="button"
                  className="auth-text-btn"
                  onClick={resendOtp}
                  disabled={resendCooldown > 0 || sendingOtp}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : sendingOtp ? "Sending…" : "Resend code"}
                </button>
              </p>

              <p className="auth-footer-links">
                <Link to="/" className="auth-link-muted">
                  Back to sign in
                </Link>
              </p>
            </div>
          ) : null}

          <p className="auth-login-footnote">
            By continuing you agree to use this workspace in line with your organisation&apos;s policies. Need help? Ask
            the person who sent your invite.
          </p>
          </main>
        </div>
      </div>
    </div>
  );
}
