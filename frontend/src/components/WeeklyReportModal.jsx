import { useEffect } from "react";

/**
 * Shows last-7-days stats from GET /admin/reports/weekly (replaces easy-to-miss alert()).
 */
export default function WeeklyReportModal({ open, onClose, loading, error, data }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const backdropClick = (e) => {
    if (e.target === e.currentTarget && !loading) onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgb(0 0 0 / 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={backdropClick}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-report-title"
        aria-busy={loading}
        style={{
          background: "var(--surface)",
          borderRadius: 14,
          border: "1px solid var(--border)",
          padding: "22px 24px",
          maxWidth: 440,
          width: "100%",
          boxShadow: "var(--shadow-lg)",
          maxHeight: "90vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="weekly-report-title"
          style={{
            margin: "0 0 6px",
            fontSize: 17,
            fontWeight: 700,
            fontFamily: "var(--font-heading)",
            color: "var(--text)",
          }}
        >
          Weekly report
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--text-3)" }}>
          Leads created in the last 7 days (same scope as the server metric).
        </p>

        {loading ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-2)", fontSize: 14 }}>
            Loading…
          </div>
        ) : error ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--danger-bg)",
              color: "var(--danger)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        ) : data ? (
          <>
            <dl
              style={{
                margin: 0,
                display: "grid",
                gap: 12,
                fontSize: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <dt style={{ color: "var(--text-2)", fontWeight: 600 }}>New leads (7d)</dt>
                <dd style={{ margin: 0, fontWeight: 700, color: "var(--text)" }}>{data.totalLeads ?? "—"}</dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <dt style={{ color: "var(--text-2)", fontWeight: 600 }}>Converted</dt>
                <dd style={{ margin: 0, fontWeight: 700, color: "var(--text)" }}>{data.converted ?? "—"}</dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <dt style={{ color: "var(--text-2)", fontWeight: 600 }}>Conversion rate</dt>
                <dd style={{ margin: 0, fontWeight: 700, color: "var(--text)" }}>
                  {data.conversionRate != null ? `${data.conversionRate}%` : "—"}
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <dt style={{ color: "var(--text-2)", fontWeight: 600 }}>Hot + Ready</dt>
                <dd style={{ margin: 0, fontWeight: 700, color: "var(--text)" }}>{data.hotReady ?? "—"}</dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <dt style={{ color: "var(--text-2)", fontWeight: 600 }}>Avg score</dt>
                <dd style={{ margin: 0, fontWeight: 700, color: "var(--text)" }}>{data.avgScore ?? "—"}</dd>
              </div>
            </dl>
            {Array.isArray(data.topCountries) && data.topCountries.length > 0 ? (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Top destinations
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>
                  {data.topCountries.map((row) => (
                    <li key={row.country}>
                      {row.country}: <strong>{row.count}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {data.generatedAt ? (
              <p style={{ margin: "16px 0 0", fontSize: 11, color: "var(--text-3)" }}>
                Generated {new Date(data.generatedAt).toLocaleString()}
              </p>
            ) : null}
          </>
        ) : (
          <div style={{ color: "var(--text-3)", fontSize: 13 }}>No data.</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
