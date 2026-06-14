import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { invalidateCachedGet } from "../api/api";
import SkeletonPulse from "../components/SkeletonPulse";
import { setupManagedPolling } from "../utils/performance";

function fmtWhen(d) {
  if (!d) return "\u2014";
  try {
    const x = new Date(d);
    return Number.isNaN(x.getTime())
      ? "\u2014"
      : x.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "\u2014";
  }
}

const API_HINT = import.meta.env.VITE_API_URL || "http://localhost:5000";

const RESPONSIVE_STYLES = `
  .wad-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
  }
  @media (min-width: 600px) {
    .wad-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (min-width: 1024px) {
    .wad-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .wad-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .wad-card:hover {
    border-color: var(--accent, #6366f1);
    box-shadow: 0 2px 14px rgba(0,0,0,0.09);
  }
  .wad-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .wad-name {
    font-weight: 700;
    font-size: 15px;
    color: var(--text);
    word-break: break-word;
    line-height: 1.3;
  }
  .wad-rid {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    color: var(--text-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 2px 7px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .wad-meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
  }
  .wad-meta-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .wad-meta-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
  }
  .wad-meta-value {
    font-size: 13px;
    color: var(--text);
    word-break: break-word;
  }
  .wad-meta-value.mono {
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .wad-meta-value.muted {
    color: var(--text-2);
  }
  .wad-stage-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    text-transform: capitalize;
    background: rgba(99,102,241,0.1);
    color: var(--accent, #6366f1);
    border-radius: 20px;
    padding: 3px 10px;
    border: 1px solid rgba(99,102,241,0.25);
    width: fit-content;
  }
  .wad-stage-badge.enrolled {
    background: rgba(22, 163, 74, 0.12);
    color: #16a34a;
    border: 1px solid rgba(22, 163, 74, 0.35);
  }
  .wad-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .wad-btn-review {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    background: var(--accent, #6366f1);
    border: none;
    border-radius: 9px;
    padding: 10px 12px;
    text-decoration: none;
    cursor: pointer;
    transition: opacity 0.15s;
    min-height: 42px;
    text-align: center;
    line-height: 1.2;
  }
  .wad-btn-review:hover {
    opacity: 0.85;
    color: #fff;
  }
  .wad-btn-chat {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 10px 12px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    min-height: 42px;
    line-height: 1.2;
  }
  .wad-btn-chat:hover {
    background: var(--surface);
    border-color: var(--accent, #6366f1);
    color: var(--accent, #6366f1);
  }
  .wad-search-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-bottom: 20px;
  }
  .wad-search-input {
    flex: 1 1 200px;
    min-width: 0;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    font-size: 14px;
    background: var(--surface);
    color: var(--text);
  }
  .wad-count {
    font-size: 13px;
    color: var(--text-2);
    font-weight: 600;
    white-space: nowrap;
  }
  .wad-refresh-btn {
    padding: 9px 14px;
    border-radius: 9px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
    white-space: nowrap;
    transition: background 0.15s;
  }
  .wad-refresh-btn:hover {
    background: var(--surface);
  }
`;

export default function WebsiteApplicationsDashboard() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [loadMeta, setLoadMeta] = useState({ status: 0, count: 0 });
  const [alertEmail, setAlertEmail] = useState("");
  const [alertWhatsApp, setAlertWhatsApp] = useState("");
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");
  const [alertErr, setAlertErr] = useState("");

  const loadAlerts = useCallback(async () => {
    try {
      const res = await api.get("/admin/website-apply-alerts");
      setAlertEmail(res.data?.email || "");
      setAlertWhatsApp(res.data?.whatsapp || "");
      setSmtpConfigured(!!res.data?.smtpConfigured);
    } catch {
      /* optional panel */
    }
  }, []);

  const saveAlerts = async () => {
    setAlertSaving(true);
    setAlertMsg("");
    setAlertErr("");
    try {
      await api.patch("/admin/website-apply-alerts", {
        email: alertEmail.trim(),
        whatsapp: alertWhatsApp.trim(),
      });
      setAlertMsg("Alert settings saved.");
    } catch (e) {
      setAlertErr(e?.response?.data?.error || "Could not save alert settings.");
    } finally {
      setAlertSaving(false);
    }
  };

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setFetchError("");
    invalidateCachedGet("/admin/leads");
    invalidateCachedGet("/admin/website-applications");
    try {
      const res = await api.get("/admin/website-applications", {
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      const raw = Array.isArray(res.data) ? res.data : [];
      setLeads(raw);
      setLoadMeta({ status: res.status, count: raw.length });
    } catch (e) {
      setLeads([]);
      setLoadMeta({ status: e.response?.status || 0, count: 0 });
      const msg =
        e.response?.data?.error ||
        (e.response?.status === 401
          ? "Not authenticated (401). In DevTools \u2192 Network \u2192 website-applications \u2192 Headers, you should see Authorization: Bearer \u2026 If not, sign out and sign in again."
          : e.message || "Could not load applications.");
      setFetchError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadAlerts();
    const poll = setupManagedPolling(() => load({ silent: true }), {
      baseMs: 8000,
      minGapMs: 2000,
      runImmediately: false,
    });
    return () => poll.dispose();
  }, [load, loadAlerts]);

  const websiteLeads = useMemo(
    () =>
      [...(leads || [])].sort((a, b) => {
        const ta = new Date(a.lastActivity || a.createdAt || 0).getTime();
        const tb = new Date(b.lastActivity || b.createdAt || 0).getTime();
        return tb - ta;
      }),
    [leads]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return websiteLeads;
    return websiteLeads.filter((l) => {
      const hay = [
        l.name,
        l.email,
        l.phone,
        l.countryInterest,
        l.courseInterest,
        l.admissionProfile?.universityInterest,
        l.admissionProfile?.passportNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [websiteLeads, search]);

  if (loading) {
    return (
      <div className="page-shell" style={{ maxWidth: 1200, padding: "24px 16px 48px" }}>
        <SkeletonPulse style={{ width: 280, height: 28, borderRadius: 8, marginBottom: 12 }} />
        <SkeletonPulse style={{ width: "min(100%, 420px)", height: 14, borderRadius: 6, marginBottom: 28 }} />
        <SkeletonPulse style={{ width: "100%", height: 200, borderRadius: 12 }} />
      </div>
    );
  }

  return (
    <div className="page-shell" style={{ maxWidth: 1200, padding: "24px 16px 48px" }}>
      <style>{RESPONSIVE_STYLES}</style>

      <header style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 8, fontSize: "clamp(20px, 4vw, 28px)" }}>
          Website Applications
        </h1>
        <p className="page-subtitle" style={{ margin: 0, maxWidth: 560, fontSize: "clamp(12px, 2.5vw, 14px)" }}>
          Submissions from the public <strong>Apply</strong> form create leads here. Use{" "}
          <strong>Review</strong> to see uploads and <strong>Chat Profile</strong> for the full lead view.
        </p>
      </header>

      <section
        className="panel"
        style={{ marginBottom: 20, padding: "18px 20px" }}
        aria-label="Application alert settings"
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Email & WhatsApp alerts</h2>
        <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 14, maxWidth: 640, lineHeight: 1.55 }}>
          When someone submits the website apply form (with documents), send all their details to your inbox or WhatsApp.
          You only need <strong>one</strong> — email or WhatsApp — or leave both blank to use CRM notifications only.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Alert email (Gmail)</span>
            <input
              type="email"
              value={alertEmail}
              onChange={(e) => setAlertEmail(e.target.value)}
              placeholder="you@gmail.com"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                font: "inherit",
                background: "var(--surface)",
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Alert WhatsApp (optional)</span>
            <input
              type="tel"
              value={alertWhatsApp}
              onChange={(e) => setAlertWhatsApp(e.target.value)}
              placeholder="923142638901"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                font: "inherit",
                background: "var(--surface)",
              }}
            />
          </label>
        </div>
        {!smtpConfigured && alertEmail.trim() && (
          <p style={{ fontSize: 12, color: "#b45309", marginBottom: 10 }}>
            SMTP is not configured on the server — add SMTP_HOST, SMTP_USER, SMTP_PASS in Render env for email alerts.
          </p>
        )}
        {alertMsg && (
          <p style={{ fontSize: 13, color: "#047857", marginBottom: 8 }}>{alertMsg}</p>
        )}
        {alertErr && (
          <p style={{ fontSize: 13, color: "#b91c1c", marginBottom: 8 }}>{alertErr}</p>
        )}
        <button
          type="button"
          onClick={saveAlerts}
          disabled={alertSaving}
          style={{
            padding: "9px 16px",
            borderRadius: 9,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: alertSaving ? "wait" : "pointer",
          }}
        >
          {alertSaving ? "Saving…" : "Save alert settings"}
        </button>
      </section>

      {fetchError ? (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(185, 28, 28, 0.08)",
            border: "1px solid rgba(185, 28, 28, 0.35)",
            color: "var(--danger, #b91c1c)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <strong>Could not load list.</strong> {fetchError}{" "}
          <button
            type="button"
            onClick={() => load()}
            style={{
              marginLeft: 8,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div
        style={{
          fontSize: 12,
          color: "var(--text-3)",
          marginBottom: 16,
          padding: "8px 12px",
          background: "var(--surface-2)",
          borderRadius: 8,
          border: "1px solid var(--border)",
          wordBreak: "break-all",
        }}
      >
        API: <code style={{ fontSize: 11 }}>{API_HINT}</code> &mdash; must match your running server. Refreshes every ~8s.
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.95 }}>
          Last: HTTP {loadMeta.status || "\u2014"} &middot; {loadMeta.count} row(s)
        </div>
      </div>

      {!fetchError && loadMeta.status === 200 && loadMeta.count === 0 ? (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(217, 119, 6, 0.09)",
            border: "1px solid rgba(217, 119, 6, 0.4)",
            color: "var(--text)",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <strong>API returned an empty list (200, 0 rows).</strong> If you know forms are submitting, the CRM
          user&apos;s workspace may not match <code>WEBSITE_TENANT_USER_ID</code> in the API <code>.env</code>.
        </div>
      ) : null}

      <div className="wad-search-row">
        <label htmlFor="website-apps-search" className="sr-only">
          Search applications
        </label>
        <input
          id="website-apps-search"
          type="search"
          className="wad-search-input"
          placeholder="Search name, email, phone, country, course\u2026"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="wad-count">
          {search.trim()
            ? `${filtered.length} match${filtered.length !== 1 ? "es" : ""} \u00b7 ${websiteLeads.length} total`
            : `${websiteLeads.length} application${websiteLeads.length !== 1 ? "s" : ""}`}
        </span>
        <button type="button" className="wad-refresh-btn" onClick={() => load()}>
          &#8635; Refresh
        </button>
      </div>

      {filtered.length === 0 && !fetchError ? (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            background: "var(--surface)",
            border: "1px dashed var(--border)",
            borderRadius: 12,
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>
            {websiteLeads.length === 0 ? "No applications yet" : "No matches"}
          </p>
          <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 auto 16px", maxWidth: 420, lineHeight: 1.5 }}>
            {websiteLeads.length === 0
              ? "Submit the form on apply.html while the API is running."
              : "Try clearing or changing the search terms."}
          </p>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600 }}
            onClick={() => load()}
          >
            Refresh now
          </button>
        </div>
      ) : null}

      {filtered.length > 0 ? (
        <div className="wad-grid">
          {filtered.map((lead) => {
            const n = Array.isArray(lead.admissionProfile?.uploadsMeta)
              ? lead.admissionProfile.uploadsMeta.length
              : 0;
            const rid = String(lead.admissionProfile?.registrationId || "\u2014");
            const stage = String(lead.admissionProfile?.processStage || "registered").replace(/_/g, " ");
            return (
              <div key={lead._id} className="wad-card">
                <div className="wad-card-header">
                  <div className="wad-name">{lead.name || "\u2014"}</div>
                  <div className="wad-rid">{rid}</div>
                </div>

                <div className="wad-meta-grid">
                  <div className="wad-meta-item" style={{ gridColumn: "1 / -1" }}>
                    <span className="wad-meta-label">Email</span>
                    <span className="wad-meta-value mono muted">{lead.email || "\u2014"}</span>
                  </div>
                  <div className="wad-meta-item">
                    <span className="wad-meta-label">Phone</span>
                    <span className="wad-meta-value mono muted">{lead.phone || "\u2014"}</span>
                  </div>
                  <div className="wad-meta-item">
                    <span className="wad-meta-label">Files</span>
                    <span className="wad-meta-value" style={{ fontWeight: 700 }}>{n} uploaded</span>
                  </div>
                  <div className="wad-meta-item">
                    <span className="wad-meta-label">Country</span>
                    <span className="wad-meta-value muted">{lead.countryInterest || "\u2014"}</span>
                  </div>
                  <div className="wad-meta-item">
                    <span className="wad-meta-label">Course</span>
                    <span className="wad-meta-value muted">{lead.courseInterest || "\u2014"}</span>
                  </div>
                  <div className="wad-meta-item">
                    <span className="wad-meta-label">Stage</span>
                    <span className={`wad-stage-badge${stage.trim() === "enrolled" ? " enrolled" : ""}`}>{stage}</span>
                  </div>
                  <div className="wad-meta-item">
                    <span className="wad-meta-label">Submitted</span>
                    <span className="wad-meta-value muted" style={{ fontSize: 12 }}>
                      {fmtWhen(lead.createdAt || lead.lastActivity)}
                    </span>
                  </div>
                </div>

                <div className="wad-actions">
                  <Link to={`/website-intake/${lead._id}`} className="wad-btn-review">
                    &#128196; Review
                  </Link>
                  <button
                    type="button"
                    className="wad-btn-chat"
                    onClick={() => navigate(`/leads/${lead._id}`)}
                  >
                    &#128172; Chat Profile
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <p style={{ marginTop: 24, fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
        All sources:{" "}
        <Link to="/leads" style={{ color: "var(--accent)", fontWeight: 600 }}>
          Leads
        </Link>
        . Filenames and downloads are under <strong>Review</strong>.
      </p>
    </div>
  );
}
