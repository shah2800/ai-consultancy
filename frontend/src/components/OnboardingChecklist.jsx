import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/api";

/**
 * First-run checklist for workspace admins — reduces “how do I…?” support load.
 */
export default function OnboardingChecklist() {
  const [status, setStatus] = useState(null);
  const [dismissing, setDismissing] = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/admin/onboarding-status");
      setStatus(res.data);
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const refresh = () => load();
    window.addEventListener("crm-settings-updated", refresh);
    return () => window.removeEventListener("crm-settings-updated", refresh);
  }, []);

  const dismiss = async () => {
    setDismissing(true);
    try {
      await api.post("/admin/onboarding-dismiss");
      setStatus((s) => (s ? { ...s, dismissed: true } : null));
    } catch {
      /* ignore */
    } finally {
      setDismissing(false);
    }
  };

  if (!status || status.dismissed) return null;

  const items = [
    {
      key: "whatsapp",
      done: status.whatsappConnected,
      label: "Connect WhatsApp",
      hint: "Webhook + Phone Number ID in Settings.",
      to: "/settings#settings-whatsapp",
    },
    {
      key: "team",
      done: status.teamHasExtraMember,
      label: "Add your first team member",
      hint: "Invite someone under Team.",
      to: "/team",
    },
    {
      key: "name",
      done: status.consultancyNameCustomized,
      label: "Set your consultancy name",
      hint: "Consultancy Profile in Settings.",
      to: "/settings#settings-consultancy",
    },
    {
      key: "uni",
      done: status.hasUniversity,
      label: "Add a university",
      hint: "So the AI can answer destination questions.",
      to: "/universities",
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <div
      style={{
        marginBottom: 24,
        padding: "18px 20px",
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Getting started
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)", lineHeight: 1.5, maxWidth: 520 }}>
            Finish these once — then your workspace is ready for real leads.{" "}
            <Link to="/help" style={{ color: "var(--accent)", fontWeight: 600 }}>
              Help &amp; FAQ
            </Link>
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={dismissing}
          onClick={dismiss}
          style={{ fontSize: 12, flexShrink: 0 }}
        >
          {dismissing ? "…" : "Dismiss"}
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Progress
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>{doneCount} / {items.length}</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: 999,
              background: "linear-gradient(90deg, var(--accent), var(--accent-hover))",
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {items.map((it) => (
          <li key={it.key}>
            <Link
              to={it.to}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                textDecoration: "none",
                color: "inherit",
                transition: "background 0.15s",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: `2px solid ${it.done ? "var(--ready)" : "var(--border)"}`,
                  background: it.done ? "var(--ready-bg)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 800,
                  color: it.done ? "var(--ready)" : "var(--text-3)",
                }}
                aria-hidden
              >
                {it.done ? "✓" : ""}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{it.label}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{it.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
