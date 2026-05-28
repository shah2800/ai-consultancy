import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/api";

function fmtWhen(value) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function prettify(text) {
  return String(text || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DocumentAlertsPanel({ leadId, onChanged }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actioningId, setActioningId] = useState("");
  const apiOrigin = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

  const loadAlerts = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/api/students/${leadId}/document-alerts`);
      const rows = Array.isArray(res.data?.alerts) ? res.data.alerts : [];
      setAlerts(rows);
    } catch (e) {
      setError(e.response?.data?.error || "Could not load incoming documents.");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const pending = useMemo(
    () => alerts.filter((a) => String(a?.status || "").toLowerCase() === "pending_review"),
    [alerts]
  );

  const handleView = async (alert) => {
    const mediaPath = String(alert?.savedPath || "");
    const mediaId = String(alert?.whatsappMediaId || "");

    if (mediaId || mediaPath.startsWith("/admin/whatsapp/media/")) {
      const proxyPath = mediaId
        ? `/admin/whatsapp/media/${encodeURIComponent(mediaId)}`
        : mediaPath;
      const res = await api.get(proxyPath, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(res.data);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
      return;
    }

    if (mediaPath.startsWith("http://") || mediaPath.startsWith("https://")) {
      window.open(mediaPath, "_blank", "noopener,noreferrer");
      return;
    }
    if (mediaPath.startsWith("/")) {
      window.open(`${apiOrigin}${mediaPath}`, "_blank", "noopener,noreferrer");
    }
  };

  const handleAction = async (alertId, action) => {
    if (!leadId || !alertId) return;
    setActioningId(`${action}:${alertId}`);
    setError("");
    try {
      await api.patch(`/api/students/${leadId}/document-alerts/${alertId}`, { action });
      await loadAlerts();
      onChanged?.();
    } catch (e) {
      setError(e.response?.data?.error || `Could not ${action} alert.`);
    } finally {
      setActioningId("");
    }
  };

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: "var(--text-2)" }}>
        Incoming document alerts
      </div>
      {loading ? <div style={{ fontSize: 12, color: "var(--text-3)" }}>Loading alerts…</div> : null}
      {!loading && pending.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>No pending alerts.</div>
      ) : null}
      {pending.map((a) => {
        const busy = actioningId.endsWith(`:${a.alertId}`);
        return (
          <div
            key={a.alertId}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 10px",
              marginBottom: 8,
              background: "var(--surface)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>{prettify(a.docType)}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              Received {fmtWhen(a.receivedAt)} via {prettify(a.source)}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handleView(a)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                View
              </button>
              <button
                type="button"
                onClick={() => handleAction(a.alertId, "save")}
                disabled={busy}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: "1px solid rgba(5, 150, 105, 0.35)",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#065f46",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                Save to Profile
              </button>
              <button
                type="button"
                onClick={() => handleAction(a.alertId, "reject")}
                disabled={busy}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: "1px solid rgba(185, 28, 28, 0.35)",
                  background: "rgba(239, 68, 68, 0.12)",
                  color: "#991b1b",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}
      {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
    </div>
  );
}

