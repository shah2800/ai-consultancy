import { useEffect, useState, useCallback, memo } from "react";
import api from "../api/api";
import ExportLeadsModal from "../components/ExportLeadsModal";
import WeeklyReportModal from "../components/WeeklyReportModal";
import DeferUntilInView from "../components/DeferUntilInView";
import { useNavigate } from "react-router-dom";
import SkeletonPulse from "../components/SkeletonPulse";
import { setupManagedPolling } from "../utils/performance";

const STATUS_CONFIG = {
  new:       { color: "var(--new)", bg: "var(--new-bg)", label: "New" },
  warm:      { color: "var(--warm)", bg: "var(--warm-bg)", label: "Warm" },
  hot:       { color: "var(--hot)", bg: "var(--hot-bg)", label: "Hot" },
  ready:     { color: "var(--ready)", bg: "var(--ready-bg)", label: "Ready" },
  converted: { color: "var(--converted)", bg: "var(--converted-bg)", label: "Converted" },
  lost:      { color: "var(--lost)", bg: "var(--lost-bg)", label: "Lost" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 20,
      background: cfg.bg,
      color: cfg.color,
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: "0.02em",
      textTransform: "uppercase",
    }}>
      {cfg.label}
    </span>
  );
}

function PriorityRing({ score, size = 44 }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  let color = "var(--new)";
  if (score >= 75) color = "var(--hot)";
  else if (score >= 50) color = "var(--warm)";
  else if (score >= 25) color = "var(--converted)";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--border)" strokeWidth={4} />
      <circle
        cx={size/2} cy={size/2} r={radius}
        fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize={size < 40 ? 9 : 11} fontWeight={500} fill={color}>
        {score}
      </text>
    </svg>
  );
}

function MetricCard({ label, value, sub, onClick, accent, icon }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={"dashboard-metric-card " + (onClick ? "dashboard-metric-card--interactive" : "")}
      style={{
        borderLeft: accent ? `3px solid ${accent}` : undefined,
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </span>
        {icon && <span style={{ fontSize: 16, opacity: 0.45 }}>{icon}</span>}
      </div>
      <div className="dashboard-metric-card__value" style={{ fontSize: 26, fontWeight: 700, color: accent || "var(--text)", lineHeight: 1, fontFamily: "var(--font-heading)" }}>
        {value ?? "—"}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

const TopLeadRow = memo(function TopLeadRow({ lead, rank, onClick }) {
  const initials = (lead.name || "WhatsApp User")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const priorityLabel = lead.priorityScore >= 75 ? "Urgent" :
    lead.priorityScore >= 50 ? "High" :
    lead.priorityScore >= 25 ? "Medium" : "Low";

  const priorityColor = lead.priorityScore >= 75 ? "var(--hot)" :
    lead.priorityScore >= 50 ? "var(--warm)" :
    lead.priorityScore >= 25 ? "var(--converted)" : "var(--new)";

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: "transparent",
        cursor: "pointer",
        transition: "background 0.12s ease",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      {/* Rank */}
      <span style={{ width: 18, fontSize: 12, color: "var(--text-3)", fontWeight: 600, textAlign: "center", flexShrink: 0 }}>
        {rank}
      </span>

      {/* Avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
        background: lead.priorityScore >= 75 ? "var(--hot-bg)" : lead.priorityScore >= 50 ? "var(--warm-bg)" : "var(--converted-bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 600,
        color: lead.priorityScore >= 75 ? "var(--hot)" : lead.priorityScore >= 50 ? "var(--warm)" : "var(--converted)",
      }}>
        {initials}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {lead.name || "WhatsApp User"}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
          {lead.countryInterest || "No country"} · {lead.source || "Direct"} · Score {lead.score}
        </div>
      </div>

      {/* Status */}
      <StatusBadge status={lead.status} />

      {/* Priority ring */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
        <PriorityRing score={lead.priorityScore} size={40} />
        <span style={{ fontSize: 9, color: priorityColor, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {priorityLabel}
        </span>
      </div>
    </div>
  );
});

function CountryBar({ data }) {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) return <div style={{ fontSize: 12, color: "var(--text-3)" }}>No data yet</div>;

  const colors = { Georgia: "var(--converted)", Turkey: "var(--hot)", China: "var(--ready)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Object.entries(data).sort((a, b) => b[1] - a[1]).map(([country, count]) => (
        <div key={country}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>{country}</span>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>{count} ({Math.round(count/total*100)}%)</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.round(count/total*100)}%`,
              background: colors[country] || "var(--new)",
              borderRadius: 3,
              transition: "width 0.6s ease",
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatLoadError(err) {
  const base = import.meta.env.VITE_API_URL || "http://localhost:5000";
  if (!err?.response) {
    return `Cannot reach the API (${base}). Start the backend (e.g. npm start in the project root) and confirm VITE_API_URL matches its port.`;
  }
  if (err.response.status === 401) {
    return "Session expired or invalid. Sign in again.";
  }
  const msg = err.response?.data?.error;
  if (typeof msg === "string" && msg.trim()) return msg;
  return "Could not load dashboard.";
}

function Sk({ style }) {
  return <div className="dashboard-skeleton-pulse" aria-hidden style={style} />;
}

/** Shown only until `/admin/dashboard` returns — top metrics paint first; bottom list streams in after. */
function DashboardInitialSkeleton() {
  const bar = (w, h = 14) => <Sk style={{ width: w, height: h }} />;
  return (
    <div className="page-shell" style={{ maxWidth: 1100 }}>
      <header className="dashboard-hero">
        <div style={{ flex: 1 }}>
          {bar(280, 22)}
          <div style={{ marginTop: 10 }}>{bar(340, 12)}</div>
          <div style={{ marginTop: 12 }}>{bar(88, 22)}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Sk style={{ width: 118, height: 36, borderRadius: 8 }} />
          <Sk style={{ width: 88, height: 36, borderRadius: 8 }} />
        </div>
      </header>
      <section className="dashboard-section">
        <Sk style={{ width: 140, height: 12, marginBottom: 12 }} />
        <div className="dashboard-kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="dashboard-metric-card" style={{ minHeight: 88 }}>
              <Sk style={{ width: "48%", height: 10, marginBottom: 10 }} />
              <Sk style={{ width: "55%", height: 28 }} />
            </div>
          ))}
        </div>
      </section>
      <section className="dashboard-section">
        <Sk style={{ width: 200, height: 12, marginBottom: 12 }} />
        <div className="dashboard-kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(156px, 1fr))" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="dashboard-metric-card" style={{ minHeight: 96 }}>
              <Sk style={{ width: "52%", height: 10, marginBottom: 10 }} />
              <Sk style={{ width: "40%", height: 26 }} />
              <Sk style={{ width: "70%", height: 10, marginTop: 10 }} />
            </div>
          ))}
        </div>
      </section>
      <div className="dashboard-grid-bottom">
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, minHeight: 280 }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
            <Sk style={{ width: 200, height: 14 }} />
            <div style={{ marginTop: 8 }}>{bar(160, 10)}</div>
          </div>
          <div style={{ padding: "12px 16px" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < 4 ? "1px solid var(--border-subtle)" : undefined }}>
                <Sk style={{ width: 18, height: 12 }} />
                <Sk style={{ width: 36, height: 36, borderRadius: "50%" }} />
                <div style={{ flex: 1 }}>
                  <Sk style={{ width: "72%", height: 12, marginBottom: 6 }} />
                  <Sk style={{ width: "55%", height: 10 }} />
                </div>
                <Sk style={{ width: 52, height: 22, borderRadius: 20 }} />
                <Sk style={{ width: 40, height: 40, borderRadius: "50%" }} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", minHeight: 140 }}>
            <Sk style={{ width: 100, height: 14, marginBottom: 14 }} />
            <Sk style={{ width: "100%", height: 8, marginBottom: 10 }} />
            <Sk style={{ width: "90%", height: 8, marginBottom: 10 }} />
            <Sk style={{ width: "75%", height: 8 }} />
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", minHeight: 160 }}>
            <Sk style={{ width: 96, height: 14, marginBottom: 14 }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: i < 3 ? 10 : 0 }}>
                <Sk style={{ width: "42%", height: 12 }} />
                <Sk style={{ width: 28, height: 12 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 16, textAlign: "center" }}>Loading dashboard…</p>
    </div>
  );
}

/** Bottom grid only — top KPI rows paint first; this streams in after idle. */
function DashboardBottomSkeleton() {
  return (
    <div className="dashboard-grid-bottom">
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, minHeight: 280 }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <SkeletonPulse style={{ width: 200, height: 14 }} />
          <SkeletonPulse style={{ width: 160, height: 10, marginTop: 8 }} />
        </div>
        <div style={{ padding: "12px 16px" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < 4 ? "1px solid var(--border-subtle)" : undefined,
              }}
            >
              <SkeletonPulse style={{ width: 18, height: 12, borderRadius: 4 }} />
              <SkeletonPulse style={{ width: 36, height: 36, borderRadius: "50%" }} />
              <div style={{ flex: 1 }}>
                <SkeletonPulse style={{ width: "72%", height: 12, marginBottom: 6, borderRadius: 4 }} />
                <SkeletonPulse style={{ width: "55%", height: 10, borderRadius: 4 }} />
              </div>
              <SkeletonPulse style={{ width: 52, height: 22, borderRadius: 20 }} />
              <SkeletonPulse style={{ width: 40, height: 40, borderRadius: "50%" }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", minHeight: 140 }}>
          <SkeletonPulse style={{ width: 100, height: 14, marginBottom: 14 }} />
          <SkeletonPulse style={{ width: "100%", height: 8, marginBottom: 10 }} />
          <SkeletonPulse style={{ width: "90%", height: 8, marginBottom: 10 }} />
          <SkeletonPulse style={{ width: "75%", height: 8 }} />
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", minHeight: 160 }}>
          <SkeletonPulse style={{ width: 96, height: 14, marginBottom: 14 }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: i < 3 ? 10 : 0 }}>
              <SkeletonPulse style={{ width: "42%", height: 12 }} />
              <SkeletonPulse style={{ width: 28, height: 12 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopLeadsPanelSkeleton() {
  return (
    <div style={{ padding: "12px 16px" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 0",
            borderBottom: i < 4 ? "1px solid var(--border-subtle)" : undefined,
          }}
        >
          <div className="dashboard-skeleton-pulse" style={{ width: 18, height: 12, borderRadius: 4 }} aria-hidden />
          <div className="dashboard-skeleton-pulse" style={{ width: 36, height: 36, borderRadius: "50%" }} aria-hidden />
          <div style={{ flex: 1 }}>
            <div className="dashboard-skeleton-pulse" style={{ width: "70%", height: 12, marginBottom: 6, borderRadius: 4 }} aria-hidden />
            <div className="dashboard-skeleton-pulse" style={{ width: "55%", height: 10, borderRadius: 4 }} aria-hidden />
          </div>
          <div className="dashboard-skeleton-pulse" style={{ width: 56, height: 22, borderRadius: 20 }} aria-hidden />
          <div className="dashboard-skeleton-pulse" style={{ width: 40, height: 40, borderRadius: "50%" }} aria-hidden />
        </div>
      ))}
    </div>
  );
}

function DashboardDeferredPanels({ data, navigate, topLeads, topLeadsLoading, loadTopLeads }) {
  useEffect(() => {
    void loadTopLeads();
  }, [loadTopLeads]);

  return (
    <div className="dashboard-grid-bottom">

      {/* Top Leads Panel */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
      }}>
        <div style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <h2 className="dashboard-panel-title">Top 5 to contact today</h2>
            <p className="dashboard-panel-desc">Ranked by AI priority score</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/leads?sort=priority")}
            className="btn btn-secondary"
            style={{ fontSize: 11, padding: "6px 12px", fontWeight: 600 }}
          >
            View all →
          </button>
        </div>

        {topLeadsLoading ? (
          <TopLeadsPanelSkeleton />
        ) : topLeads.length === 0 ? (
          <div style={{ padding: 24, color: "var(--text-3)", fontSize: 13, textAlign: "center" }}>
            No active leads yet
          </div>
        ) : (
          <div>
            {topLeads.map((lead, i) => (
              <TopLeadRow
                key={lead._id}
                lead={lead}
                rank={i + 1}
                onClick={() => navigate(`/leads/${lead._id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right column: Country + Quick Stats */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Country Breakdown */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "14px 16px",
          boxShadow: "var(--shadow-sm)",
        }}>
          <h2 className="dashboard-panel-title" style={{ marginBottom: 14 }}>
            By country
          </h2>
          <CountryBar data={data.countryBreakdown || {}} />
        </div>

        {/* Conversion health */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "14px 16px",
          boxShadow: "var(--shadow-sm)",
        }}>
          <h2 className="dashboard-panel-title" style={{ marginBottom: 14 }}>
            Health check
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              {
                label: "Response rate",
                value: data.total > 0 ? `${Math.round(data.replied / data.total * 100)}%` : "—",
                good: data.total > 0 && (data.replied / data.total) >= 0.5,
              },
              {
                label: "Hot + Ready",
                value: data.hot + data.ready,
                good: (data.hot + data.ready) >= 3,
              },
              {
                label: "Uncontacted",
                value: data.uncontacted,
                good: data.uncontacted === 0,
                invert: true,
              },
              {
                label: "Overdue follow-ups",
                value: data.followUpsOverdue,
                good: data.followUpsOverdue === 0,
                invert: true,
              },
            ].map(({ label, value, good }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>{label}</span>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: good ? "var(--success)" : "var(--danger)",
                }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [topLeads, setTopLeads] = useState([]);
  const [dashLoading, setDashLoading] = useState(true);
  const [topLeadsLoading, setTopLeadsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [topLeadsError, setTopLeadsError] = useState(false);
  const [leadExportModalOpen, setLeadExportModalOpen] = useState(false);
  const [leadExporting, setLeadExporting] = useState(false);
  const [weeklyModalOpen, setWeeklyModalOpen] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState("");
  const [weeklyData, setWeeklyData] = useState(null);
  const navigate = useNavigate();

  const loadTopLeads = useCallback(async () => {
    setTopLeadsLoading(true);
    setTopLeadsError(false);
    try {
      const res = await api.get("/leads/top");
      const list = res.data;
      setTopLeads(Array.isArray(list) ? list : []);
      setTopLeadsError(false);
    } catch (e) {
      console.error(e);
      setTopLeads([]);
      setTopLeadsError(true);
    } finally {
      setTopLeadsLoading(false);
    }
  }, []);

  const fetchDashboardOnly = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadError("");
      setDashLoading(true);
    }
    try {
      const res = await api.get("/admin/dashboard");
      setData(res.data);
      setLoadError("");
    } catch (reason) {
      console.error(reason);
      setData(null);
      setLoadError(formatLoadError(reason));
    } finally {
      if (!silent) setDashLoading(false);
    }
  }, []);

  const silentRefreshBoth = useCallback(async () => {
    const results = await Promise.allSettled([api.get("/admin/dashboard"), api.get("/leads/top")]);

    const [dashResult, topResult] = results;

    if (dashResult.status === "fulfilled") {
      setData(dashResult.value.data);
      setLoadError("");
    } else {
      console.error(dashResult.reason);
      setData(null);
      setLoadError(formatLoadError(dashResult.reason));
    }

    if (topResult.status === "fulfilled") {
      const list = topResult.value.data;
      setTopLeads(Array.isArray(list) ? list : []);
      setTopLeadsError(false);
    } else {
      console.error(topResult.reason);
      setTopLeads([]);
      setTopLeadsError(true);
    }
  }, []);

  useEffect(() => {
    void fetchDashboardOnly();
    const polling = setupManagedPolling(
      () => silentRefreshBoth(),
      { baseMs: 25000, minGapMs: 2500, runImmediately: false }
    );

    return () => {
      polling.dispose();
    };
  }, [fetchDashboardOnly, silentRefreshBoth]);

  if (dashLoading && !data) {
    return <DashboardInitialSkeleton />;
  }

  if (!data) {
    return (
      <div className="page-shell" style={{ maxWidth: 640 }}>
        <div
          style={{
            padding: "18px 20px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--danger-bg)",
            color: "var(--danger)",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          <strong style={{ display: "block", marginBottom: 8, color: "var(--text)" }}>
            Dashboard could not load
          </strong>
          {loadError}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 14 }}
          onClick={() => void fetchDashboardOnly()}
        >
          Retry
        </button>
      </div>
    );
  }

  const nav = (status) => navigate(`/leads?status=${status}`);

  const exportLeadsWithFormat = async (format) => {
    setLeadExporting(true);
    try {
      if (format === "xlsx") {
        const res = await api.get("/admin/export/leads.xlsx", {
          responseType: "blob",
        });
        const blob = new Blob([res.data], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "leads.xlsx");
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const res = await api.get("/admin/export/leads.csv", {
          responseType: "blob",
        });
        const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "leads.csv");
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch {
      alert(
        format === "xlsx"
          ? "Failed to export Excel file."
          : "Failed to export CSV."
      );
    } finally {
      setLeadExporting(false);
      setLeadExportModalOpen(false);
    }
  };

  const openWeeklyReport = async () => {
    setWeeklyModalOpen(true);
    setWeeklyLoading(true);
    setWeeklyError("");
    setWeeklyData(null);
    try {
      const res = await api.get("/admin/reports/weekly");
      setWeeklyData(res.data);
    } catch (err) {
      const msg =
        (typeof err.response?.data?.error === "string" && err.response.data.error) ||
        err.message ||
        "Could not load weekly report.";
      setWeeklyError(msg);
    } finally {
      setWeeklyLoading(false);
    }
  };

  return (
    <div className="page-shell" style={{ maxWidth: 1100 }}>

      {topLeadsError ? (
        <div
          className="analytics-error"
          style={{ marginBottom: 16, fontSize: 13 }}
          role="status"
        >
          &quot;Top leads&quot; could not load, but your funnel numbers below are still valid. Refresh or check the server log if this persists.
        </div>
      ) : null}

      <header className="dashboard-hero">
        <div>
          <h1 className="page-title">CRM Dashboard</h1>
          <p className="page-subtitle" style={{ marginTop: 4 }}>
            Your funnel at a glance—who’s moving and where to focus next.
          </p>
          <div className="dashboard-live-pill" aria-live="polite">
            Live metrics
          </div>
        </div>
        <div className="dashboard-hero__actions" style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
          <button onClick={openWeeklyReport} type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: "9px 14px" }}>
            Weekly Report
          </button>
          <button
            onClick={() => setLeadExportModalOpen(true)}
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: "9px 14px" }}
          >
            Export
          </button>
        </div>
      </header>

      {/* === FUNNEL ROW === */}
      <section className="dashboard-section" aria-labelledby="dash-funnel-heading">
        <p id="dash-funnel-heading" className="dashboard-section__title">
          Pipeline funnel
        </p>
        <div className="dashboard-kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))" }}>
          <MetricCard label="Total" value={data.total} onClick={() => nav("all")} />
          <MetricCard label="New" value={data.new} accent="var(--new)" onClick={() => nav("new")} />
          <MetricCard label="Warm" value={data.warm} accent="var(--warm)" onClick={() => nav("warm")} />
          <MetricCard label="Hot" value={data.hot} accent="var(--hot)" onClick={() => nav("hot")} />
          <MetricCard label="Ready" value={data.ready} accent="var(--ready)" onClick={() => nav("ready")} />
          <MetricCard label="Converted" value={data.converted} accent="var(--converted)" onClick={() => nav("converted")} />
        </div>
      </section>

      {/* === INTELLIGENCE ROW === */}
      <section className="dashboard-section" aria-labelledby="dash-intel-heading">
        <p id="dash-intel-heading" className="dashboard-section__title">
          Operations &amp; intelligence
        </p>
        <div className="dashboard-kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(156px, 1fr))" }}>
          <MetricCard
            label="New (24h)"
            value={data.newLeads24h}
            sub="leads since yesterday"
            accent="var(--converted)"
            onClick={() => nav("new")}
          />
          <MetricCard
            label="Uncontacted"
            value={data.uncontacted}
            sub="awaiting first reply"
            accent="var(--hot)"
            onClick={() => nav("all")}
          />
          <MetricCard
            label="Follow-ups Due"
            value={data.followUpsDue}
            sub={data.followUpsOverdue > 0 ? `+${data.followUpsOverdue} overdue` : "today"}
            accent={data.followUpsOverdue > 0 ? "var(--lost)" : "var(--warm)"}
            onClick={() => nav("all")}
          />
          <MetricCard
            label="Replied"
            value={data.replied}
            sub="got AI response"
            accent="var(--ready)"
            onClick={() => nav("warm")}
          />
          <MetricCard
            label="Engaged (Low)"
            value={data.engaged}
            sub=">3 msgs, score <50"
            accent="var(--accent)"
            onClick={() => nav("warm")}
          />
          <MetricCard
            label="Avg Lead Score"
            value={data.avgScore}
            sub={`${data.conversionRate}% conversion rate`}
            accent="var(--success)"
          />
        </div>
      </section>

      {/* === BOTTOM ROW: fetched + mounted when scrolled near (idle fallback keeps large screens instant) */}
      <DeferUntilInView
        fallback={<DashboardBottomSkeleton />}
        idleFallbackMs={950}
        rootMargin="180px 0px"
      >
        <DashboardDeferredPanels
          data={data}
          navigate={navigate}
          topLeads={topLeads}
          topLeadsLoading={topLeadsLoading}
          loadTopLeads={loadTopLeads}
        />
      </DeferUntilInView>

      <WeeklyReportModal
        open={weeklyModalOpen}
        onClose={() => {
          if (!weeklyLoading) setWeeklyModalOpen(false);
        }}
        loading={weeklyLoading}
        error={weeklyError}
        data={weeklyData}
      />

      <ExportLeadsModal
        open={leadExportModalOpen}
        onClose={() => {
          if (!leadExporting) setLeadExportModalOpen(false);
        }}
        exporting={leadExporting}
        onConfirm={exportLeadsWithFormat}
      />
    </div>
  );
}
