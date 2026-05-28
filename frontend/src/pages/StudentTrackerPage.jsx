import { useState } from "react";
import api from "../api/api";

function iconFor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "done") return "✅";
  if (s === "active") return "⏳";
  if (s === "issue") return "❌";
  return "⬜";
}

function fmtDate(value) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return "—";
  }
}

export default function StudentTrackerPage() {
  const [registrationId, setRegistrationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  const lookup = async (e) => {
    e?.preventDefault?.();
    const rid = String(registrationId || "").trim();
    if (!rid) return;
    setLoading(true);
    setErr("");
    setData(null);
    try {
      const res = await api.get("/public/website/track", {
        params: { registrationId: rid },
      });
      setData(res.data || null);
    } catch {
      setErr("ID not found. Please contact NSI team.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell" style={{ maxWidth: 760, padding: "24px 20px 48px" }}>
      <h1 className="page-title" style={{ marginBottom: 6 }}>Student Application Tracker</h1>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>Enter your Register ID to see your live status.</p>

      <form onSubmit={lookup} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          value={registrationId}
          onChange={(e) => setRegistrationId(e.target.value)}
          placeholder="NSI-2026-001"
          style={{
            flex: "1 1 260px",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            fontFamily: "ui-monospace, monospace",
          }}
        />
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? "Checking..." : "Track"}
        </button>
      </form>

      {err ? <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>{err}</div> : null}

      {data ? (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginBottom: 12, fontSize: 13 }}>
            <div><strong>Name:</strong> {data.fullName || "—"}</div>
            <div><strong>ID:</strong> {data.registrationId || registrationId}</div>
            <div><strong>Country:</strong> {data.countryInterest || "—"}</div>
            <div><strong>University:</strong> {data.universityInterest || "—"}</div>
            <div><strong>Course:</strong> {data.courseInterest || "—"}</div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", color: "var(--text-3)" }}>
              Your Process Status
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              {(data.milestones || []).map((m) => (
                <div key={m.key} style={{ fontSize: 14 }}>
                  {iconFor(m.status)} {m.label}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 13 }}>{data.headline}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>
              Last Updated: {fmtDate(data.stageUpdatedAt || data.updatedAt)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

