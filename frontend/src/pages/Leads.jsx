import { useEffect, useState, useMemo, useCallback } from "react";
import api from "../api/api";
import { useProgressiveRevealOneTier } from "../hooks/useProgressiveReveal";
import SkeletonPulse from "../components/SkeletonPulse";
import { useNavigate, useSearchParams } from "react-router-dom";
import { inferPhoneOrigin } from "../utils/phoneCountry";
import { formatLastActivity } from "../utils/lastActivity";
import { userIdFromToken } from "../utils/jwt";

const STATUS_CONFIG = {
  all: { label: "All", color: "var(--text-2)", bg: "var(--surface-2)" },
  new: { label: "New", color: "var(--new)", bg: "var(--new-bg)" },
  warm: { label: "Warm", color: "var(--warm)", bg: "var(--warm-bg)" },
  hot: { label: "Hot", color: "var(--hot)", bg: "var(--hot-bg)" },
  ready: { label: "Ready", color: "var(--ready)", bg: "var(--ready-bg)" },
  converted: { label: "Converted", color: "var(--converted)", bg: "var(--converted-bg)" },
  lost: { label: "Lost", color: "var(--lost)", bg: "var(--lost-bg)" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  return (
    <span className="status-badge" style={{ color: cfg.color, background: cfg.bg }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
      {cfg.label}
    </span>
  );
}

function ScoreRing({ score, size = 38 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color =
    score >= 70 ? "var(--hot)" : score >= 50 ? "var(--warm)" : score >= 25 ? "var(--accent)" : "var(--text-3)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={3} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize={10} fontWeight={600} fill={color}>
        {score}
      </text>
    </svg>
  );
}

const TABS = ["all", "new", "warm", "hot", "ready", "converted", "lost"];

function LeadsTableRowsSkeleton({ rows = 8 }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="leads-table-row lead-row"
          style={{ opacity: 0.85, pointerEvents: "none" }}
          aria-hidden
        >
          <div className="leads-row-lead-block" data-label="Lead" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SkeletonPulse style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <SkeletonPulse style={{ width: "55%", height: 14, marginBottom: 8, borderRadius: 4 }} />
              <SkeletonPulse style={{ width: "42%", height: 11, borderRadius: 4 }} />
            </div>
          </div>
          <div data-label="Stage">
            <SkeletonPulse style={{ width: 52, height: 22, borderRadius: 20 }} />
          </div>
          <div data-label="Course">
            <SkeletonPulse style={{ width: "60%", height: 11, borderRadius: 4 }} />
          </div>
          <div data-label="Source">
            <SkeletonPulse style={{ width: 72, height: 13, borderRadius: 4 }} />
          </div>
          <div data-label="Last activity">
            <SkeletonPulse style={{ width: 96, height: 13, borderRadius: 4 }} />
          </div>
          <div data-label="Destination">
            <SkeletonPulse style={{ width: "70%", height: 13, borderRadius: 4 }} />
          </div>
          <div data-label="AI score" style={{ display: "flex", justifyContent: "center" }}>
            <SkeletonPulse style={{ width: 38, height: 38, borderRadius: "50%" }} />
          </div>
        </div>
      ))}
    </>
  );
}

function LeadsPageSkeleton() {
  return (
    <div className="page-shell leads-page" style={{ maxWidth: 1100 }}>
      <header className="leads-hero">
        <div>
          <SkeletonPulse style={{ width: 120, height: 26, marginBottom: 10, borderRadius: 6 }} />
          <SkeletonPulse style={{ width: "min(420px, 90%)", height: 13, borderRadius: 4, marginBottom: 8 }} />
          <SkeletonPulse style={{ width: 280, height: 11, borderRadius: 4 }} />
        </div>
        <div className="leads-hero__search">
          <SkeletonPulse style={{ width: "100%", maxWidth: 380, height: 42, borderRadius: 10 }} />
        </div>
      </header>
      <div className="leads-toolbar">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonPulse key={i} style={{ width: 56, height: 34, borderRadius: 8 }} />
          ))}
        </div>
        <SkeletonPulse style={{ width: 200, height: 38, borderRadius: 8 }} />
      </div>
      <div className="leads-table-wrap panel">
        <div className="leads-table-head" aria-hidden>
          <SkeletonPulse style={{ width: 48, height: 11 }} />
          <SkeletonPulse style={{ width: 44, height: 11 }} />
          <SkeletonPulse style={{ width: 72, height: 11 }} />
          <SkeletonPulse style={{ width: 58, height: 11 }} />
          <SkeletonPulse style={{ width: 52, height: 11 }} />
          <SkeletonPulse style={{ width: 88, height: 11 }} />
          <SkeletonPulse style={{ width: 44, height: 11 }} />
        </div>
        <div style={{ padding: "8px 0" }}>
          <LeadsTableRowsSkeleton rows={10} />
        </div>
      </div>
    </div>
  );
}

export default function Leads() {
  const myUserId = userIdFromToken(localStorage.getItem("token"));
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const status = searchParams.get("status") || "all";
  const sortMode = searchParams.get("sort") === "priority" ? "priority" : "recent";

  const fetchLeads = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("status", status);
      if (sortMode === "priority") qs.set("sort", "priority");
      const res = await api.get(`/admin/leads?${qs.toString()}`);
      setLeads(res.data || []);
    } catch (e) {
      console.error(e);
      setLeads([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [status, sortMode]);

  useEffect(() => {
    fetchLeads();

    let interval = null;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      fetchLeads({ silent: true });
    };
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(refresh, 15000);
    };
    const stopPolling = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
        startPolling();
      } else {
        stopPolling();
      }
    };

    onVisibilityChange();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopPolling();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchLeads]);

  const setStatusTab = (tab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("status", tab);
        return next;
      },
      { replace: true }
    );
  };

  const setSortMode = (mode) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (mode === "priority") next.set("sort", "priority");
        else next.delete("sort");
        return next;
      },
      { replace: true }
    );
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    const qDial = q.replace(/^\+/, "").replace(/\s/g, "");
    return leads.filter((l) => {
      const o = inferPhoneOrigin(l.phone);
      return (
        l.phone?.toLowerCase().includes(q) ||
        l.name?.toLowerCase().includes(q) ||
        l.countryInterest?.toLowerCase().includes(q) ||
        l.courseInterest?.toLowerCase().includes(q) ||
        (o &&
          (o.country.toLowerCase().includes(q) ||
            (o.iso && o.iso.toLowerCase().includes(q)) ||
            o.dialDisplay.replace("+", "").startsWith(qDial) ||
            String(o.nationalNumber || "").includes(qDial)))
      );
    });
  }, [leads, search]);

  const tablePaintReady = useProgressiveRevealOneTier(
    !loading,
    `${status}-${sortMode}-${loading ? "wait" : "ok"}`
  );

  const initials = (lead) => {
    const name = lead.name || "WhatsApp User";
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const avatarColor = (score) => {
    if (score >= 70) return { bg: "var(--hot-bg)", color: "var(--hot)" };
    if (score >= 50) return { bg: "var(--warm-bg)", color: "var(--warm)" };
    return { bg: "var(--accent-light)", color: "var(--accent)" };
  };

  const subtitle =
    search.trim() && filtered.length !== leads.length
      ? `${filtered.length} match${filtered.length !== 1 ? "es" : ""} · ${leads.length} in "${STATUS_CONFIG[status]?.label || status}"`
      : `${leads.length} lead${leads.length !== 1 ? "s" : ""} · ${STATUS_CONFIG[status]?.label || "All"} · ${sortMode === "priority" ? "AI priority" : "Recent activity"}`;

  if (loading) {
    return <LeadsPageSkeleton />;
  }

  return (
    <div className="page-shell leads-page" style={{ maxWidth: 1100 }}>
      <header className="leads-hero">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle" style={{ marginTop: 4 }}>
            {subtitle}
          </p>
          <p className="leads-hero__hint" style={{ marginTop: 10 }}>
            Open a row to chat and search to narrow the list.
          </p>
        </div>
        <div className="leads-hero__search">
          <label htmlFor="leads-search" className="sr-only">
            Search by name, phone, country, or course
          </label>
          <div className="leads-search-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              id="leads-search"
              className="input leads-search-input"
              placeholder="Search name, phone, country…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
      </header>

      <div className="leads-toolbar">
        <div className="leads-tabs" role="tablist" aria-label="Filter by pipeline stage" style={{ flex: 1, minWidth: 0 }}>
          {TABS.map((tab) => {
            const active = tab === status;
            const cfg = STATUS_CONFIG[tab];
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                className={`leads-tab ${active ? "leads-tab--active" : ""}`}
                onClick={() => setStatusTab(tab)}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="leads-table-controls">
        <div className="leads-sort" role="group" aria-label="Sort order">
          <span className="leads-sort-label">Sort</span>
          <div className="leads-sort-toggle">
            <button
              type="button"
              className={sortMode === "recent" ? "is-active" : ""}
              onClick={() => setSortMode("recent")}
            >
              Recent activity
            </button>
            <button
              type="button"
              className={sortMode === "priority" ? "is-active" : ""}
              onClick={() => setSortMode("priority")}
            >
              AI priority
            </button>
          </div>
        </div>
      </div>

      <div className="leads-table-wrap panel">
        <div className="leads-table-head" aria-hidden>
          <span>Lead</span>
          <span>Stage</span>
          <span>Course</span>
          <span>Source</span>
          <span>Last activity</span>
          <span>Destination</span>
          <span style={{ textAlign: "center" }}>Score</span>
        </div>

        {!tablePaintReady && filtered.length > 0 ? (
          <LeadsTableRowsSkeleton rows={Math.min(12, Math.max(6, filtered.length))} />
        ) : filtered.length === 0 ? (
          <div className="leads-empty">
            <div className="leads-empty__icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" }}>
              {search.trim() ? "No matches for that search" : "No leads in this stage yet"}
            </div>
            <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 8, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
              {search.trim()
                ? "Try another keyword or clear the search box."
                : "New WhatsApp conversations will appear here. Switch filters above to see other stages."}
            </p>
            {search.trim() ? (
              <button type="button" className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => setSearch("")}>
                Clear search
              </button>
            ) : null}
          </div>
        ) : tablePaintReady ? (
          filtered.map((lead) => {
            const av = avatarColor(lead.score || 0);
            const origin = inferPhoneOrigin(lead.phone);
            const assignedRaw = lead.assignedTo;
            const assignedSame =
              Boolean(
                myUserId &&
                  assignedRaw &&
                  String(
                    typeof assignedRaw === "object" && assignedRaw?._id != null
                      ? assignedRaw._id
                      : assignedRaw
                  ) === String(myUserId)
              );
            const open = () => navigate(`/leads/${lead._id}`);
            return (
              <div
                key={lead._id}
                className="leads-table-row lead-row"
                onClick={open}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open();
                  }
                }}
              >
                <div
                  className="leads-row-lead-block"
                  data-label="Lead"
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  <div
                    className="leads-avatar"
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: "50%",
                      background: av.bg,
                      color: av.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      flexShrink: 0,
                      border: "2px solid var(--surface)",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    {initials(lead)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className="leads-name" style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" }}>
                        {lead.name || "WhatsApp User"}
                      </span>
                      {assignedSame ? (
                        <span
                          className="chip"
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 8px",
                            background: "rgb(67 97 238 / 0.15)",
                            color: "var(--accent)",
                            border: "1px solid rgb(67 97 238 / 0.35)",
                          }}
                        >
                          Assigned to you
                        </span>
                      ) : null}
                    </div>
                    <div className="leads-cell-muted" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                      {lead.phone}
                    </div>
                    {origin ? (
                      <div className="leads-origin" style={{ fontSize: 11, marginTop: 6, color: "var(--text-2)", fontWeight: 600 }}>
                        {origin.country}{" "}
                        <span style={{ fontWeight: 500, color: "var(--text-3)" }}>{origin.dialDisplay}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div data-label="Stage">
                  <StatusBadge status={lead.status} />
                </div>

                <div data-label="Course">
                  <div
                    className="leads-cell-muted"
                    style={{
                      marginTop: 0,
                      color: lead.courseInterest ? "var(--text)" : "var(--text-3)",
                      opacity: lead.courseInterest ? 1 : 0.9,
                      fontWeight: lead.courseInterest ? 600 : 500,
                    }}
                  >
                    {lead.courseInterest || "Course not set"}
                  </div>
                </div>

                <div className="leads-source" data-label="Source" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-2)" }}>
                  {lead.source || "Direct"}
                </div>

                <div className="leads-last-activity" data-label="Last activity" style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                  {formatLastActivity(lead.lastActivity, true)}
                </div>

                <div data-label="Destination">
                  <div className="leads-destination-main" style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{lead.countryInterest || "—"}</div>
                </div>

                <div className="leads-score-cell" data-label="AI score" style={{ display: "flex", justifyContent: "center" }}>
                  <ScoreRing score={lead.score || 0} />
                </div>
              </div>
            );
          })
        ) : null}
      </div>
    </div>
  );
}
