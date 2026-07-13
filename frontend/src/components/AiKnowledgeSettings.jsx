import { useState } from "react";
import api from "../api/api";

/**
 * AI Knowledge & Automation — everything the WhatsApp AI states as fact,
 * fully workspace-editable (no code changes needed to update fees/countries/policy).
 */

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 13,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  boxSizing: "border-box",
};

const smallBtn = (variant) => ({
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 8,
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  border: variant === "danger" ? "1px solid #fca5a5" : "1px solid var(--accent)",
  background: variant === "danger" ? "#fef2f2" : "var(--accent-light)",
  color: variant === "danger" ? "#b91c1c" : "var(--accent)",
});

function Label({ children }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {children}
    </label>
  );
}

function Hint({ children }) {
  return <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 5 }}>{children}</div>;
}

export default function AiKnowledgeSettings({ settings, setSettings, orgLocked, SectionHeader }) {
  const [newFee, setNewFee] = useState({ country: "", program: "", amount: "", period: "per semester" });
  const [newCourse, setNewCourse] = useState("");
  const [mergeState, setMergeState] = useState({ running: false, result: null, error: "" });

  const feeFacts = Array.isArray(settings.feeFacts) ? settings.feeFacts : [];
  const courses = Array.isArray(settings.coursesOffered) ? settings.coursesOffered : [];

  const addFee = () => {
    if (!newFee.country.trim() || !newFee.amount.trim()) return;
    setSettings((p) => ({ ...p, feeFacts: [...(p.feeFacts || []), { ...newFee }] }));
    setNewFee({ country: "", program: "", amount: "", period: "per semester" });
  };

  const removeFee = (i) =>
    setSettings((p) => ({ ...p, feeFacts: (p.feeFacts || []).filter((_, idx) => idx !== i) }));

  const addCourse = () => {
    const c = newCourse.trim();
    if (!c || courses.includes(c)) return;
    setSettings((p) => ({ ...p, coursesOffered: [...(p.coursesOffered || []), c] }));
    setNewCourse("");
  };

  const runMerge = async (apply) => {
    setMergeState({ running: true, result: null, error: "" });
    try {
      const res = await api.post("/admin/maintenance/merge-duplicate-leads", { apply });
      setMergeState({ running: false, result: res.data, error: "" });
    } catch (e) {
      setMergeState({ running: false, result: null, error: e?.response?.data?.error || "Failed" });
    }
  };

  return (
    <div id="settings-ai-knowledge" className="settings-card" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 24px", marginBottom: 20 }}>
      <SectionHeader
        title="AI Knowledge & Automation"
        desc="Fees, courses, scholarship policy, welcome menu, follow-ups and alerts — the AI only says what you write here."
      />

      {/* Fee table */}
      <div style={{ marginBottom: 22 }}>
        <Label>Fee table (the ONLY fees the AI may quote)</Label>
        {feeFacts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {feeFacts.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", background: "var(--surface-2)", fontSize: 13 }}>
                <span style={{ flex: 1 }}>
                  <b>{f.program || "Any program"}</b> · {f.country} — <b>{f.amount}</b> {f.period}
                </span>
                <button type="button" disabled={orgLocked} onClick={() => removeFee(i)} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 15 }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8 }}>
          <input style={inputStyle} placeholder="Country (Georgia)" value={newFee.country} disabled={orgLocked} onChange={(e) => setNewFee((p) => ({ ...p, country: e.target.value }))} />
          <input style={inputStyle} placeholder="Program (MBBS)" value={newFee.program} disabled={orgLocked} onChange={(e) => setNewFee((p) => ({ ...p, program: e.target.value }))} />
          <input style={inputStyle} placeholder="Amount ($2,500)" value={newFee.amount} disabled={orgLocked} onChange={(e) => setNewFee((p) => ({ ...p, amount: e.target.value }))} />
          <input style={inputStyle} placeholder="per semester" value={newFee.period} disabled={orgLocked} onChange={(e) => setNewFee((p) => ({ ...p, period: e.target.value }))} />
          <button type="button" style={smallBtn()} disabled={orgLocked} onClick={addFee}>Add</button>
        </div>
        <Hint>Empty table = AI uses the built-in NextStep defaults. Add one row per program+country.</Hint>
      </div>

      {/* Courses offered */}
      <div style={{ marginBottom: 22 }}>
        <Label>Courses we handle</Label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {courses.map((c) => (
            <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 999 }}>
              {c}
              <button type="button" disabled={orgLocked} onClick={() => setSettings((p) => ({ ...p, coursesOffered: (p.coursesOffered || []).filter((x) => x !== c) }))} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 13, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...inputStyle, maxWidth: 260 }} placeholder="e.g. MBBS" value={newCourse} disabled={orgLocked} onChange={(e) => setNewCourse(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCourse())} />
          <button type="button" style={smallBtn()} disabled={orgLocked} onClick={addCourse}>Add</button>
        </div>
        <Hint>Any other course (e.g. LLB) → AI hands the student to a consultant instead of guessing.</Hint>
      </div>

      {/* Scholarship policy */}
      <div style={{ marginBottom: 22 }}>
        <Label>Scholarship policy (the ONLY thing AI may say about scholarships)</Label>
        <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} disabled={orgLocked}
          placeholder="Scholarships are possible at some partner universities depending on academic record. Never promise or name a specific grant…"
          value={settings.scholarshipPolicy ?? ""} onChange={(e) => setSettings((p) => ({ ...p, scholarshipPolicy: e.target.value }))} />
      </div>

      {/* Extra facts */}
      <div style={{ marginBottom: 22 }}>
        <Label>Extra confirmed facts (one per line)</Label>
        <textarea rows={4} style={{ ...inputStyle, resize: "vertical" }} disabled={orgLocked}
          placeholder={"Living cost Georgia: $250-350 per month\nNo IELTS required for Georgia\nPMC recognised: Georgia, Azerbaijan, Russia"}
          value={settings.aiFacts ?? ""} onChange={(e) => setSettings((p) => ({ ...p, aiFacts: e.target.value }))} />
      </div>

      {/* Apply URL + PKR rate */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 22 }}>
        <div>
          <Label>Apply link the AI sends</Label>
          <input style={inputStyle} disabled={orgLocked} placeholder="https://www.nextstepinternationals.com/?apply=true"
            value={settings.applyUrl ?? ""} onChange={(e) => setSettings((p) => ({ ...p, applyUrl: e.target.value }))} />
        </div>
        <div>
          <Label>PKR per USD (0 = never convert)</Label>
          <input style={inputStyle} type="number" min="0" disabled={orgLocked}
            value={settings.pkrPerUsd ?? 0} onChange={(e) => setSettings((p) => ({ ...p, pkrPerUsd: Number(e.target.value) || 0 }))} />
          <Hint>With 0, AI says “consultant will confirm exact PKR”.</Hint>
        </div>
      </div>

      {/* Welcome menu */}
      <div style={{ marginBottom: 22 }}>
        <Label>Welcome menu (first message)</Label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)", marginBottom: 8 }}>
          <input type="checkbox" disabled={orgLocked} checked={settings.welcomeMenuEnabled !== false}
            onChange={(e) => setSettings((p) => ({ ...p, welcomeMenuEnabled: e.target.checked }))} style={{ accentColor: "var(--accent)" }} />
          Send the guided 1-5 menu to brand-new leads
        </label>
        <textarea rows={4} style={{ ...inputStyle, resize: "vertical" }} disabled={orgLocked || settings.welcomeMenuEnabled === false}
          placeholder="Leave empty to use the standard welcome menu…"
          value={settings.welcomeMenuText ?? ""} onChange={(e) => setSettings((p) => ({ ...p, welcomeMenuText: e.target.value }))} />
      </div>

      {/* Follow-ups + alerts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 22 }}>
        <div>
          <Label>Auto follow-ups</Label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)" }}>
            <input type="checkbox" disabled={orgLocked} checked={settings.followUpsEnabled !== false}
              onChange={(e) => setSettings((p) => ({ ...p, followUpsEnabled: e.target.checked }))} style={{ accentColor: "var(--accent)" }} />
            Enabled (10:00–20:00 PKT only)
          </label>
        </div>
        <div>
          <Label>Max follow-ups per silence</Label>
          <input style={inputStyle} type="number" min="0" max="5" disabled={orgLocked || settings.followUpsEnabled === false}
            value={settings.followUpMaxPerWait ?? 2} onChange={(e) => setSettings((p) => ({ ...p, followUpMaxPerWait: Math.min(5, Math.max(0, Number(e.target.value) || 0)) }))} />
        </div>
        <div>
          <Label>Lead alerts to my WhatsApp</Label>
          <select style={inputStyle} disabled={orgLocked} value={settings.leadAlertMode ?? "all"}
            onChange={(e) => setSettings((p) => ({ ...p, leadAlertMode: e.target.value }))}>
            <option value="all">All (new + replies + hot)</option>
            <option value="new">New leads + hot only</option>
            <option value="off">Off</option>
          </select>
          <Hint>Sent to the alert number below.</Hint>
        </div>
      </div>

      <div style={{ marginBottom: 22 }}>
        <Label>Alert WhatsApp number (yours)</Label>
        <input style={{ ...inputStyle, maxWidth: 280 }} disabled={orgLocked} placeholder="92XXXXXXXXXX"
          value={settings.websiteApplyAlertWhatsApp ?? ""} onChange={(e) => setSettings((p) => ({ ...p, websiteApplyAlertWhatsApp: e.target.value }))} />
        <Hint>Also used for website-application alerts. Message your business number once from this phone so Meta allows alerts.</Hint>
      </div>

      {/* Merge duplicates */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <Label>Duplicate leads cleanup</Label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" style={smallBtn()} disabled={mergeState.running || orgLocked} onClick={() => runMerge(false)}>
            {mergeState.running ? "Checking…" : "Check duplicates (safe)"}
          </button>
          {mergeState.result && mergeState.result.mode?.startsWith("dry") && mergeState.result.duplicateGroups > 0 && (
            <button type="button" style={smallBtn("danger")} disabled={mergeState.running} onClick={() => runMerge(true)}>
              Merge {mergeState.result.duplicateGroups} duplicate group{mergeState.result.duplicateGroups > 1 ? "s" : ""} now
            </button>
          )}
        </div>
        {mergeState.result && (
          <Hint>
            {mergeState.result.mode?.startsWith("dry")
              ? mergeState.result.duplicateGroups === 0
                ? "✅ No duplicate leads found."
                : `Found ${mergeState.result.duplicateGroups} duplicate group(s): ${mergeState.result.plans.map((p) => p.keep.name || p.phoneKey).slice(0, 5).join(", ")}${mergeState.result.duplicateGroups > 5 ? "…" : ""}`
              : `✅ Merged ${mergeState.result.duplicateGroups} group(s). Chats are combined on one lead each.`}
          </Hint>
        )}
        {mergeState.error && <Hint>❌ {mergeState.error}</Hint>}
      </div>
    </div>
  );
}
