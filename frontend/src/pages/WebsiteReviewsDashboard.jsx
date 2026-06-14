import { useCallback, useEffect, useState } from "react";
import api, { invalidateCachedGet } from "../api/api";
import SkeletonPulse from "../components/SkeletonPulse";

function fmtWhen(d) {
  if (!d) return "—";
  try {
    const x = new Date(d);
    return Number.isNaN(x.getTime())
      ? "—"
      : x.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

const STATUS_TABS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

export default function WebsiteReviewsDashboard() {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    invalidateCachedGet("/admin/website-reviews");
    try {
      const res = await api.get("/admin/website-reviews", { params: { status } });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to load reviews.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function moderate(id, nextStatus) {
    setBusyId(id);
    try {
      await api.patch(`/admin/website-reviews/${id}`, { status: nextStatus });
      await load();
    } catch (err) {
      alert(err?.response?.data?.error || "Could not update review.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 48px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Website reviews</h1>
        <p style={{ color: "var(--text-3)", fontSize: 14 }}>
          Student comments on the website. Open comments publish instantly; you can hide or remove any in CRM.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatus(tab.id)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: status === tab.id ? "var(--accent)" : "var(--surface)",
              color: status === tab.id ? "#fff" : "var(--text)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={load}
          style={{
            marginLeft: "auto",
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "rgba(220,38,38,.08)",
            border: "1px solid rgba(220,38,38,.2)",
            color: "#b91c1c",
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "grid", gap: 12 }}>
          {[1, 2, 3].map((n) => (
            <SkeletonPulse key={n} style={{ height: 140, borderRadius: 12 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            border: "1px dashed var(--border)",
            borderRadius: 12,
            color: "var(--text-3)",
          }}
        >
          No {status === "all" ? "" : status} reviews.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {rows.map((row) => (
            <article
              key={row.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {row.name}
                    {row.verified && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#047857",
                          background: "rgba(5,150,105,.12)",
                          border: "1px solid rgba(5,150,105,.22)",
                          padding: "2px 8px",
                          borderRadius: 999,
                        }}
                      >
                        ✓ Verified student
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-3)" }}>
                    {row.stars} · {row.role || "Student"} · {fmtWhen(row.createdAt)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    padding: "4px 10px",
                    borderRadius: 999,
                    background:
                      row.status === "approved"
                        ? "rgba(5,150,105,.12)"
                        : row.status === "rejected"
                          ? "rgba(220,38,38,.1)"
                          : "rgba(217,119,6,.12)",
                    color:
                      row.status === "approved"
                        ? "#047857"
                        : row.status === "rejected"
                          ? "#b91c1c"
                          : "#b45309",
                  }}
                >
                  {row.status}
                </span>
              </div>

              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "var(--text)",
                  marginBottom: 12,
                  fontStyle: "italic",
                }}
              >
                &ldquo;{row.text}&rdquo;
              </p>

              {(row.phone || row.email || row.registrationId) && (
                <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12 }}>
                  {row.registrationId && <span>ID: {row.registrationId} · </span>}
                  {row.phone && <span>{row.phone} · </span>}
                  {row.email && <span>{row.email}</span>}
                </div>
              )}

              {row.status === "pending" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => moderate(row.id, "approved")}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: "#059669",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                      opacity: busyId === row.id ? 0.6 : 1,
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => moderate(row.id, "rejected")}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "#b91c1c",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                      opacity: busyId === row.id ? 0.6 : 1,
                    }}
                  >
                    Reject
                  </button>
                </div>
              )}

              {row.status !== "pending" && (
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => moderate(row.id, "pending")}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Move to pending
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
