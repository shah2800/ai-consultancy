import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import DeferUntilInView from "../components/DeferUntilInView";
import SkeletonPulse from "../components/SkeletonPulse";
import PasswordField from "../components/PasswordField";
import OnboardingChecklist from "../components/OnboardingChecklist";
import { roleFromToken } from "../utils/jwt";
import { COUNTRIES } from "../utils/countries";

const TONES = [
  { value: "warm, conversational, and concise for WhatsApp chats", label: "WhatsApp Friendly (recommended)" },
  { value: "friendly and casual", label: "Friendly & Casual" },
  { value: "formal and concise", label: "Formal & Concise" },
  { value: "enthusiastic and motivating", label: "Enthusiastic & Motivating" },
];

const PRESET_FAQS = [
  { question: "What is the tuition fee for Georgia?", answer: "Tuition fees in Georgia range from $3,000–$6,000 per year depending on the university and program." },
  { question: "How long does the visa process take?", answer: "The student visa process typically takes 2–4 weeks after document submission." },
  { question: "Are scholarships available?", answer: "Yes, partial scholarships are available for top-performing students. Contact us for eligibility details." },
];

/** Shown in Consultancy Profile for new workspaces when the API has not saved a name yet. */
const DEFAULT_CONSULTANCY_NAME = "Next Step International";

function serializeSettingsPayload(settings, aiDailyLimitStr) {
  const raw = String(aiDailyLimitStr ?? "").trim();
  const lim =
    raw === ""
      ? Math.min(1000, Math.max(1, Math.floor(Number(settings.aiDailyReplyLimit) || 100)))
      : Math.min(1000, Math.max(1, Math.floor(Number(raw) || 100)));
  return JSON.stringify({ ...settings, aiDailyReplyLimit: lim });
}

function SectionHeader({ title, desc }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", margin: "0 0 4px" }}>{title}</h2>
      <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>{desc}</p>
    </div>
  );
}

function FieldGroup({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

function SettingsLoadingShell() {
  return (
    <div className="page-shell settings-page" style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <SkeletonPulse style={{ width: 140, height: 26, marginBottom: 8, borderRadius: 6 }} />
          <SkeletonPulse style={{ width: 280, height: 13, borderRadius: 4 }} />
        </div>
        <SkeletonPulse style={{ width: 130, height: 42, borderRadius: 10 }} />
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 22, marginBottom: 18 }}>
        <SkeletonPulse style={{ width: "45%", height: 16, marginBottom: 16 }} />
        <SkeletonPulse style={{ width: "100%", height: 44, marginBottom: 12, borderRadius: 10 }} />
        <SkeletonPulse style={{ width: "100%", height: 44, marginBottom: 12, borderRadius: 10 }} />
        <SkeletonPulse style={{ width: "100%", height: 100, borderRadius: 10 }} />
      </div>
      <SkeletonPulse style={{ width: "100%", height: 220, borderRadius: 14 }} />
    </div>
  );
}

function SettingsLowerSkeleton() {
  return (
    <>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 24px", marginBottom: 20 }}>
        <SkeletonPulse style={{ width: "55%", height: 16, marginBottom: 14 }} />
        <SkeletonPulse style={{ width: "100%", height: 40, marginBottom: 12, borderRadius: 10 }} />
        <SkeletonPulse style={{ width: "100%", height: 40, marginBottom: 12, borderRadius: 10 }} />
        <SkeletonPulse style={{ width: "100%", height: 40, borderRadius: 10 }} />
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 24px", marginBottom: 20 }}>
        <SkeletonPulse style={{ width: "40%", height: 16, marginBottom: 14 }} />
        <SkeletonPulse style={{ width: "100%", height: 120, borderRadius: 10 }} />
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 24px", marginBottom: 20 }}>
        <SkeletonPulse style={{ width: "50%", height: 16, marginBottom: 14 }} />
        <SkeletonPulse style={{ width: "100%", height: 200, borderRadius: 10 }} />
      </div>
      <SkeletonPulse style={{ width: "100%", height: 56, borderRadius: 10, marginBottom: 40 }} />
    </>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    consultancyName: DEFAULT_CONSULTANCY_NAME,
    businessContactNumber: "",
    contactEmail: "",
    websiteUrl: "",
    consultancyNotes: "",
    whatsappNumber: "",
    whatsappPhoneNumberId: "",
    whatsappVerifyToken: "",
    city: "",
    aiTone: "warm and professional",
    aiAutoReplyEnabled: true,
    aiDailyReplyLimit: 100,
    enabledCountries: ["Georgia", "Turkey", "China"],
    customRules: "",
    canSay: "",
    cannotSay: "",
    faqs: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newFaq, setNewFaq] = useState({ question: "", answer: "" });
  const [addingFaq, setAddingFaq] = useState(false);
  const [countrySelectKey, setCountrySelectKey] = useState(0);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState("");
  const [pwError, setPwError] = useState("");
  /** Lets you clear the field and type a new value (e.g. 21) without the input snapping to 1 */
  const [aiDailyLimitStr, setAiDailyLimitStr] = useState("100");
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState("");
  const baselineRef = useRef(null);
  const settingsRef = useRef(settings);
  const aiDailyStrRef = useRef(aiDailyLimitStr);
  const saveErrorRef = useRef(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    aiDailyStrRef.current = aiDailyLimitStr;
  }, [aiDailyLimitStr]);

  const settingsRole = roleFromToken(localStorage.getItem("token"));
  /* Admins and managers may edit org/AI settings for this workspace only (API uses tenant scope). */
  const canEditOrgSettings =
    settingsRole === "admin" || settingsRole === "manager";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settingsRes = await api.get("/admin/settings");
      const raw = settingsRes.data || {};
      setSettings({
        ...raw,
        consultancyName:
          String(raw.consultancyName ?? "").trim() || DEFAULT_CONSULTANCY_NAME,
      });
      const lim = Number(settingsRes.data?.aiDailyReplyLimit);
      setAiDailyLimitStr(
        String(Number.isFinite(lim) ? Math.min(1000, Math.max(1, Math.floor(lim))) : 100)
      );
    } catch {
      /* ignore settings load errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    if (baselineRef.current === null) {
      baselineRef.current = serializeSettingsPayload(settingsRef.current, aiDailyStrRef.current);
      setDirty(false);
      return;
    }
    setDirty(
      serializeSettingsPayload(settings, aiDailyLimitStr) !== baselineRef.current
    );
  }, [settings, aiDailyLimitStr, loading]);

  useEffect(() => {
    if (!dirty || !canEditOrgSettings) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, canEditOrgSettings]);

  useEffect(() => {
    if (saveError && saveErrorRef.current) {
      saveErrorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [saveError]);

  useEffect(() => {
    setSaveError("");
  }, [settings, aiDailyLimitStr]);

  useEffect(() => {
    const onUpdated = (e) => {
      const lim = e.detail?.aiDailyReplyLimit;
      if (Number.isFinite(lim)) {
        const n = Math.min(1000, Math.max(1, Math.floor(lim)));
        setSettings((prev) => ({ ...prev, aiDailyReplyLimit: n }));
        setAiDailyLimitStr(String(n));
        window.setTimeout(() => {
          baselineRef.current = serializeSettingsPayload(
            settingsRef.current,
            aiDailyStrRef.current
          );
          setDirty(false);
        }, 0);
      } else {
        baselineRef.current = null;
        load();
      }
    };
    window.addEventListener("crm-settings-updated", onUpdated);
    return () => window.removeEventListener("crm-settings-updated", onUpdated);
  }, [load]);

  const save = async () => {
    if (!canEditOrgSettings) return;
    setSaveError("");
    setSaving(true);
    try {
      const raw = aiDailyLimitStr.trim();
      const lim =
        raw === ""
          ? Math.min(1000, Math.max(1, Math.floor(Number(settings.aiDailyReplyLimit) || 100)))
          : Math.min(1000, Math.max(1, Math.floor(Number(raw) || 100)));
      const toSave = { ...settings, aiDailyReplyLimit: lim };
      const enabled = toSave.enabledCountries || [];
      if (enabled.length === 0) {
        setSaveError(
          "Add at least one enabled country so the AI knows which destinations you support."
        );
        setSaving(false);
        return;
      }
      await api.post("/admin/settings", toSave);
      setSettings(toSave);
      setAiDailyLimitStr(String(lim));
      baselineRef.current = serializeSettingsPayload(toSave, String(lim));
      setDirty(false);
      window.dispatchEvent(
        new CustomEvent("crm-settings-updated", { detail: { aiDailyReplyLimit: lim } })
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      const msg =
        e?.response == null
          ? "Could not reach the server. Check your connection and that the API is running."
          : typeof e.response?.data === "object" && e.response.data?.error
            ? String(e.response.data.error)
            : "Failed to save settings.";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setPwError("");
    setPwMessage("");
    if (!currentPassword || !newPassword) {
      setPwError("Fill in current password and new password.");
      return;
    }
    if (newPassword.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New password and confirmation do not match.");
      return;
    }
    setPwSaving(true);
    try {
      await api.post("/admin/me/password", {
        currentPassword,
        newPassword,
      });
      setPwMessage("Password updated. Use your new password next time you sign in.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwMessage(""), 5000);
    } catch (err) {
      if (!err.response) {
        const base = api.defaults?.baseURL || "API";
        setPwError(
          `Cannot reach server (${base}). Start the backend (e.g. npm start in the project root) and use the same URL as VITE_API_URL if not on port 5000.`
        );
        return;
      }
      const data = err.response.data;
      const msg = typeof data === "object" && data?.error ? data.error : "Could not update password.";
      const detail = typeof data === "object" && data?.detail ? ` ${data.detail}` : "";
      setPwError(`${msg}${detail}`.trim());
    } finally {
      setPwSaving(false);
    }
  };

  const enableCountry = (country) => {
    if (!country || !canEditOrgSettings) return;
    setSettings((prev) => {
      const cur = prev.enabledCountries || [];
      if (cur.includes(country)) return prev;
      return { ...prev, enabledCountries: [country, ...cur] };
    });
  };

  const disableCountry = (country) => {
    if (!canEditOrgSettings) return;
    setSettings((prev) => ({
      ...prev,
      enabledCountries: (prev.enabledCountries || []).filter((c) => c !== country),
    }));
  };

  const addFaq = () => {
    if (!canEditOrgSettings) return;
    if (!newFaq.question.trim() || !newFaq.answer.trim()) return;
    setSettings(prev => ({ ...prev, faqs: [...(prev.faqs || []), { ...newFaq }] }));
    setNewFaq({ question: "", answer: "" });
    setAddingFaq(false);
  };

  const removeFaq = (index) => {
    if (!canEditOrgSettings) return;
    setSettings(prev => ({ ...prev, faqs: prev.faqs.filter((_, i) => i !== index) }));
  };

  const addPresetFaq = (faq) => {
    if (!canEditOrgSettings) return;
    const exists = (settings.faqs || []).some(f => f.question === faq.question);
    if (!exists) {
      setSettings(prev => ({ ...prev, faqs: [...(prev.faqs || []), faq] }));
    }
  };

  if (loading) return <SettingsLoadingShell />;

  const orgLocked = !canEditOrgSettings;

  const enabledList = settings.enabledCountries || [];
  const availableForSelect = COUNTRIES.filter((c) => !enabledList.includes(c));

  const inputStyle = {
    width: "100%", padding: "10px 14px", border: "1.5px solid var(--border)", borderRadius: 10,
    fontSize: 14, background: "var(--surface)", color: "var(--text)", fontFamily: "var(--font-body)",
    transition: "border-color 0.15s", boxSizing: "border-box",
  };

  return (
    <div className="page-shell settings-page" style={{ maxWidth: 760 }}>

      {/* Header */}
      <div className="settings-header" style={{ display: "flex", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", fontFamily: "var(--font-heading)" }}>Settings</h1>
          <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>
            Workspace-only—your branding, AI, and WhatsApp routing.
          </p>
        </div>
      </div>

      {saveError && canEditOrgSettings ? (
        <div ref={saveErrorRef} className="analytics-error" style={{ marginBottom: 14 }}>
          {saveError}
        </div>
      ) : null}

      {!canEditOrgSettings ? (
        <div
          style={{
            marginBottom: 20,
            padding: "12px 16px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            fontSize: 13,
            color: "var(--text-2)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--text)" }}>View only.</strong> Ask an admin to edit org settings—you can still change your password below.
        </div>
      ) : null}

      {canEditOrgSettings ? <OnboardingChecklist /> : null}

      {/* Section 1: Consultancy Info */}
      <div id="settings-consultancy" className="settings-card" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 24px", marginBottom: 20 }}>
        <SectionHeader title="Consultancy Profile" desc="What the AI knows about you—keep contact info accurate." />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <FieldGroup label="Consultancy Name">
            <input disabled={orgLocked} style={inputStyle} value={settings.consultancyName ?? ""} onChange={e => setSettings(p => ({ ...p, consultancyName: e.target.value }))} placeholder={DEFAULT_CONSULTANCY_NAME} />
          </FieldGroup>
          <FieldGroup label="City / Location">
            <input disabled={orgLocked} style={inputStyle} value={settings.city || ""} onChange={e => setSettings(p => ({ ...p, city: e.target.value }))} placeholder="e.g. Lahore" />
          </FieldGroup>
          <FieldGroup label="Business contact number" hint="Country code, digits only (e.g. 923001234567).">
            <input
              disabled={orgLocked}
              style={inputStyle}
              value={settings.businessContactNumber ?? ""}
              onChange={(e) => setSettings((p) => ({ ...p, businessContactNumber: e.target.value }))}
              placeholder="e.g. 923001234567"
            />
          </FieldGroup>
          <FieldGroup label="Email address" hint="Shown when students ask how to email you.">
            <input
              type="email"
              disabled={orgLocked}
              style={inputStyle}
              value={settings.contactEmail ?? ""}
              onChange={(e) => setSettings((p) => ({ ...p, contactEmail: e.target.value }))}
              placeholder="hello@yourconsultancy.com"
            />
          </FieldGroup>
          <div style={{ gridColumn: "1 / -1" }}>
            <FieldGroup label="Website" hint="Include https://">
              <input
                disabled={orgLocked}
                style={inputStyle}
                value={settings.websiteUrl ?? ""}
                onChange={(e) => setSettings((p) => ({ ...p, websiteUrl: e.target.value }))}
                placeholder="https://www.example.com"
              />
            </FieldGroup>
          </div>
        </div>

        <FieldGroup label="About your consultancy (for AI)" hint="Services, hours, strengths—optional.">
          <textarea
            disabled={orgLocked}
            style={{ ...inputStyle, resize: "vertical", minHeight: 110, lineHeight: 1.55 }}
            value={settings.consultancyNotes ?? ""}
            onChange={(e) => setSettings((p) => ({ ...p, consultancyNotes: e.target.value }))}
            placeholder="e.g. We specialize in Georgia & Turkey admissions; free first consultation; office hours Mon–Sat 10–6."
          />
        </FieldGroup>
      </div>

      <DeferUntilInView
        fallback={<SettingsLowerSkeleton />}
        idleFallbackMs={850}
        rootMargin="120px 0px"
      >
        <>
      {/* WhatsApp webhook (business number + Meta IDs) */}
      <div id="settings-whatsapp" className="settings-card" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 24px", marginBottom: 20 }}>
        <SectionHeader title="WhatsApp webhook routing" desc="Route inbound WhatsApp to this workspace." />
        <details className="settings-whatsapp-guide" style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", background: "var(--surface-2)" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
            Meta setup checklist
          </summary>
          <ol style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 12, color: "var(--text-2)", lineHeight: 1.65 }}>
            <li>In Meta Business Suite: WhatsApp → API — copy your <strong>Phone number ID</strong> into the field below.</li>
            <li>Choose a secret <strong>Verify token</strong>; paste the same value here and in Meta’s webhook verification.</li>
            <li>Point Meta’s callback URL to your server’s <code>/webhooks/whatsapp</code> (GET for verify, POST for messages).</li>
          </ol>
        </details>
        <FieldGroup label="WhatsApp Number" hint="Digits only, country code (same style as Meta).">
          <input disabled={orgLocked} style={inputStyle} value={settings.whatsappNumber || ""} onChange={e => setSettings(p => ({ ...p, whatsappNumber: e.target.value }))} placeholder="923001234567" />
        </FieldGroup>
        <FieldGroup label="WhatsApp Phone Number ID" hint="Meta → WhatsApp → API → phone_number_id.">
          <input
            disabled={orgLocked}
            style={inputStyle}
            value={settings.whatsappPhoneNumberId || ""}
            onChange={e => setSettings(p => ({ ...p, whatsappPhoneNumberId: e.target.value }))}
            placeholder="e.g. 123456789012345"
          />
        </FieldGroup>
        <FieldGroup label="Webhook Verify Token" hint="Pick a secret—paste the same in Meta webhooks.">
          <PasswordField
            id="settings-wa-verify-token"
            autoComplete="off"
            disabled={orgLocked}
            style={inputStyle}
            value={settings.whatsappVerifyToken || ""}
            onChange={(e) => setSettings((p) => ({ ...p, whatsappVerifyToken: e.target.value }))}
            placeholder="e.g. my-company-wa-verify-token"
          />
        </FieldGroup>
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: "8px 0 0", lineHeight: 1.5 }}>
          Endpoints: <code>GET</code> / <code>POST</code> <code>/webhooks/whatsapp</code>
        </p>
      </div>

      {/* Section 2: Countries */}
      <div id="settings-countries" className="settings-card" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 24px", marginBottom: 20 }}>
        <SectionHeader title="Enabled Countries" desc="AI talks about these destinations only—add from the list, remove with a chip." />

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Active (newest first)
          </div>
          <div
            className="settings-country-chip-scroll"
            role="region"
            aria-label="Enabled countries — scroll sideways to see all"
          >
            <div className="settings-country-chip-row">
            {enabledList.length === 0 ? (
              <span style={{ fontSize: 13, color: "var(--text-3)", flexShrink: 0 }}>Add a country below.</span>
            ) : (
              enabledList.map((country) => (
                <button
                  key={country}
                  type="button"
                  disabled={orgLocked}
                  onClick={() => disableCountry(country)}
                  aria-label={`Remove ${country} from enabled destinations`}
                  className="settings-country-chip"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1.5px solid var(--accent)",
                    background: "var(--accent-light)",
                    color: "var(--accent)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    transition: "all 0.2s",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      flexShrink: 0,
                    }}
                  />
                  <span>{country}</span>
                  <span className="settings-country-chip-remove" aria-hidden>
                    <span className="settings-country-chip-remove-x">×</span>
                    <span className="settings-country-chip-remove-text">Remove</span>
                  </span>
                </button>
              ))
            )}
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>{enabledList.length} enabled</div>
        </div>

        <FieldGroup label="Add country" hint="New picks go to the top; enabled ones hide here.">
          <select
            key={countrySelectKey}
            className="select"
            disabled={orgLocked}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              enableCountry(v);
              setCountrySelectKey((k) => k + 1);
            }}
            style={{ maxWidth: "100%" }}
          >
            <option value="" disabled>
              Select a country to add…
            </option>
            {availableForSelect.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {availableForSelect.length === 0 && enabledList.length > 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
              All listed—turn off a chip above to add again.
            </div>
          ) : null}
        </FieldGroup>
      </div>

      {/* Section 3: AI Tone */}
      <div id="settings-ai" className="settings-card" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 24px", marginBottom: 20 }}>
        <SectionHeader title="AI Tone & Behavior" desc="How the assistant sounds on WhatsApp." />

        <FieldGroup label="Communication Tone">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TONES.map(({ value, label }) => {
              const selected = settings.aiTone === value;
              return (
                <label key={value} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, background: selected ? "var(--accent-light)" : "var(--surface)", cursor: "pointer", transition: "all 0.15s" }}>
                  <input type="radio" name="tone" value={value} checked={selected} disabled={orgLocked} onChange={() => setSettings(p => ({ ...p, aiTone: value }))} style={{ accentColor: "var(--accent)" }} />
                  <span style={{ fontSize: 13, fontWeight: selected ? 600 : 500, color: selected ? "var(--accent)" : "var(--text)" }}>{label}</span>
                </label>
              );
            })}
          </div>
        </FieldGroup>

        <FieldGroup label="Allow to say" hint="What to emphasize or include (business allowed).">
          <textarea
            disabled={orgLocked}
            style={{ ...inputStyle, resize: "vertical", minHeight: 100, lineHeight: 1.6 }}
            value={settings.canSay ?? ""}
            onChange={(e) => setSettings((p) => ({ ...p, canSay: e.target.value }))}
            placeholder="e.g. Never guarantee visa; mention free consult; keep answers short."
          />
        </FieldGroup>

        <FieldGroup label="Not allowed to say" hint="Topics or claims to avoid (compliance, no guarantees).">
          <textarea
            disabled={orgLocked}
            style={{ ...inputStyle, resize: "vertical", minHeight: 100, lineHeight: 1.6 }}
            value={settings.cannotSay ?? ""}
            onChange={(e) => setSettings((p) => ({ ...p, cannotSay: e.target.value }))}
            placeholder="e.g. Never promise visa approval; don't invent fees, deadlines, or admission outcomes."
          />
        </FieldGroup>

        <FieldGroup label="Custom AI Rules" hint="Extra rules on every reply (compliance, offers, etc.).">
          <textarea
            disabled={orgLocked}
            style={{ ...inputStyle, resize: "vertical", minHeight: 100, lineHeight: 1.6 }}
            value={settings.customRules || ""}
            onChange={(e) => setSettings((p) => ({ ...p, customRules: e.target.value }))}
            placeholder="e.g. Sign off with the office city; link to website only when asked."
          />
        </FieldGroup>

        <FieldGroup label="Daily AI reply limit per phone" hint="Global default; override per lead on their profile.">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            disabled={orgLocked}
            style={inputStyle}
            value={aiDailyLimitStr}
            onChange={(e) => {
              const s = e.target.value.replace(/\D/g, "").slice(0, 4);
              setAiDailyLimitStr(s);
              if (s !== "") {
                const n = Math.min(1000, Math.max(1, Math.floor(Number(s))));
                setSettings((p) => ({ ...p, aiDailyReplyLimit: n }));
              }
            }}
            onBlur={() => {
              if (aiDailyLimitStr.trim() === "") {
                setAiDailyLimitStr(String(settings.aiDailyReplyLimit ?? 100));
                return;
              }
              const n = Math.min(
                1000,
                Math.max(1, Math.floor(Number(aiDailyLimitStr) || 1))
              );
              setAiDailyLimitStr(String(n));
              setSettings((p) => ({ ...p, aiDailyReplyLimit: n }));
            }}
          />
        </FieldGroup>

        <FieldGroup label="Auto AI replies" hint="Off = no auto AI (you can still reply manually).">
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
            <input
              type="checkbox"
              disabled={orgLocked}
              checked={settings.aiAutoReplyEnabled !== false}
              onChange={(e) => setSettings((p) => ({ ...p, aiAutoReplyEnabled: e.target.checked }))}
              style={{ accentColor: "var(--accent)" }}
            />
            {settings.aiAutoReplyEnabled !== false ? "Enabled" : "Disabled"}
          </label>
        </FieldGroup>
      </div>

      {/* Section 4: FAQs */}
      <div id="settings-faq" className="settings-card" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 24px", marginBottom: 20 }}>
        <SectionHeader title="FAQ Knowledge Base" desc="Q&A the AI can reuse." />

        {/* Preset FAQs */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Presets</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PRESET_FAQS.map((faq, i) => {
              const exists = (settings.faqs || []).some(f => f.question === faq.question);
              return (
                <button
                  key={i}
                  type="button"
                  title={faq.question}
                  onClick={() => addPresetFaq(faq)}
                  disabled={exists || orgLocked}
                  style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, background: exists ? "var(--surface-2)" : "var(--accent-light)", color: exists ? "var(--text-3)" : "var(--accent)", border: `1px solid ${exists ? "var(--border)" : "var(--accent)"}`, borderRadius: 8, cursor: exists || orgLocked ? "default" : "pointer", fontFamily: "var(--font-body)", maxWidth: "100%", textAlign: "left" }}
                >
                  {exists ? "✓ " : "+ "}
                  <span className="settings-faq-preset-q">{faq.question.length > 36 ? `${faq.question.slice(0, 36)}…` : faq.question}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Existing FAQs */}
        {(settings.faqs || []).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            {settings.faqs.map((faq, i) => (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", background: "var(--surface-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Q: {faq.question}</div>
                    <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>A: {faq.answer}</div>
                  </div>
                  <button
                    type="button"
                    disabled={orgLocked}
                    onClick={() => removeFaq(i)}
                    aria-label={`Remove FAQ: ${faq.question}`}
                    style={{ background: "none", border: "none", color: "var(--text-3)", cursor: orgLocked ? "not-allowed" : "pointer", fontSize: 16, padding: "0 0 0 12px", flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add new FAQ */}
        {addingFaq ? (
          <div style={{ border: "1.5px solid var(--accent)", borderRadius: 10, padding: "14px 16px", background: "var(--accent-light)" }}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", display: "block", marginBottom: 5 }}>QUESTION</label>
              <input disabled={orgLocked} style={inputStyle} value={newFaq.question} onChange={e => setNewFaq(p => ({ ...p, question: e.target.value }))} placeholder="e.g. What documents do I need?" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", display: "block", marginBottom: 5 }}>ANSWER</label>
              <textarea disabled={orgLocked} style={{ ...inputStyle, resize: "vertical", minHeight: 70 }} value={newFaq.answer} onChange={e => setNewFaq(p => ({ ...p, answer: e.target.value }))} placeholder="Answer for the AI to use" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={orgLocked} onClick={addFaq} style={{ padding: "8px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: orgLocked ? "not-allowed" : "pointer", fontFamily: "var(--font-body)" }}>Add FAQ</button>
              <button type="button" onClick={() => { setAddingFaq(false); setNewFaq({ question: "", answer: "" }); }} style={{ padding: "8px 16px", background: "var(--surface)", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={orgLocked} onClick={() => setAddingFaq(true)} style={{ padding: "9px 16px", background: "var(--surface-2)", color: "var(--text-2)", border: "1.5px dashed var(--border)", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: orgLocked ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", width: "100%" }}>
            + Add FAQ
          </button>
        )}
      </div>

      {/* Account password */}
      <div id="settings-account" className="settings-card" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 24px", marginBottom: 20 }}>
        <SectionHeader title="Account & password" desc="Sign-in password only." />
        {pwError ? (
          <div style={{ background: "var(--danger-bg)", border: "1px solid rgb(252 165 165)", color: "var(--danger)", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
            {pwError}
          </div>
        ) : null}
        {pwMessage ? (
          <div style={{ background: "var(--ready-bg)", border: "1px solid rgb(134 239 172)", color: "var(--ready)", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
            {pwMessage}
          </div>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, maxWidth: 420 }}>
          <FieldGroup label="Current password">
            <PasswordField
              id="settings-pw-current"
              autoComplete="current-password"
              style={inputStyle}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
            />
          </FieldGroup>
          <FieldGroup label="New password" hint="At least 6 characters.">
            <PasswordField
              id="settings-pw-new"
              autoComplete="new-password"
              style={inputStyle}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
            />
          </FieldGroup>
          <FieldGroup label="Confirm new password">
            <PasswordField
              id="settings-pw-confirm"
              autoComplete="new-password"
              style={inputStyle}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
            />
          </FieldGroup>
          <div>
            <button
              type="button"
              onClick={changePassword}
              disabled={pwSaving}
              style={{
                padding: "10px 20px",
                background: pwSaving ? "var(--border)" : "var(--surface-2)",
                color: pwSaving ? "var(--text-3)" : "var(--text)",
                border: "1.5px solid var(--border)",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: pwSaving ? "not-allowed" : "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              {pwSaving ? "Updating…" : "Update password"}
            </button>
          </div>
        </div>
      </div>

      {/* Help — opens full Help page (same as former sidebar item) */}
      <div id="settings-help" style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => navigate("/help")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text)",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "var(--font-body)",
            cursor: "pointer",
            textAlign: "left",
            transition: "background 0.15s ease, border-color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--surface)";
            e.currentTarget.style.borderColor = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--surface-2)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", color: "var(--accent)", opacity: 0.9 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            Help & documentation
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45, flexShrink: 0 }} aria-hidden>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Save button bottom */}
      {canEditOrgSettings ? (
        <div className="settings-footer-actions" style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 40 }}>
          <button type="button" onClick={save} disabled={saving} style={{ padding: "12px 28px", background: saved ? "#1E9E5E" : saving ? "var(--border)" : "var(--accent)", color: saving ? "var(--text-3)" : "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", transition: "all 0.2s", boxShadow: saved || saving ? "none" : "0 4px 14px rgba(67,97,238,0.3)" }}>
            {saved ? "✓ Saved!" : saving ? "Saving..." : "Save All Changes"}
          </button>
        </div>
      ) : (
        <div style={{ paddingBottom: 40 }} />
      )}
        </>
      </DeferUntilInView>
    </div>
  );
}
