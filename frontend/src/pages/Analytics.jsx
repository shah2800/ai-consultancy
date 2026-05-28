import { useState, useCallback, useEffect } from "react";
import api from "../api/api";
import SkeletonPulse from "../components/SkeletonPulse";
import DeferUntilInView from "../components/DeferUntilInView";

const URGENCY_CONFIG = {
  high: { color: "var(--hot)", bg: "var(--hot-bg)", label: "High" },
  medium: { color: "var(--warm)", bg: "var(--warm-bg)", label: "Medium" },
  low: { color: "var(--success)", bg: "var(--ready-bg)", label: "Low" },
};

/** CRM segments supported by AI analytics filtering (matches Lead.status). */
const ANALYTICS_SEGMENTS = [
  { key: "new", label: "New" },
  { key: "warm", label: "Warm" },
  { key: "hot", label: "Hot" },
];

function UrgencyBadge({ urgency }) {
  const cfg = URGENCY_CONFIG[urgency] || URGENCY_CONFIG.low;
  return (
    <span
      className="chip"
      style={{
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.color}33`,
      }}
    >
      {cfg.label}
    </span>
  );
}

function TopicBar({ topic, percentage, description }) {
  const color =
    percentage >= 50 ? "var(--accent)" : percentage >= 30 ? "var(--warm)" : "var(--text-3)";
  const targetScale = Math.min(100, Math.max(0, percentage)) / 100;
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setScale(targetScale));
    return () => cancelAnimationFrame(id);
  }, [targetScale]);

  return (
    <div className="analytics-topic-row">
      <div className="analytics-topic-row__head">
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{topic}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
          {percentage}%
        </span>
      </div>
      <div className="analytics-topic-row__bar">
        <div
          className="analytics-topic-row__fill"
          style={{
            transform: `scaleX(${scale})`,
            background: color,
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.45 }}>{description}</div>
    </div>
  );
}

function InsightCard({ title, detail, urgency }) {
  const edge = URGENCY_CONFIG[urgency]?.color || "var(--text-3)";
  return (
    <div
      className="analytics-insight-card"
      style={{ borderLeft: `3px solid ${edge}` }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1 }}>{title}</span>
        <UrgencyBadge urgency={urgency} />
      </div>
      <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0, lineHeight: 1.65 }}>{detail}</p>
    </div>
  );
}

function SuggestionCard({ title, prompt, reason, index }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        marginBottom: "var(--space-4)",
      background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <span className="analytics-suggestion-index">{index}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" }}>
          {title}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 var(--space-3)", lineHeight: 1.55 }}>{reason}</p>
      <div className="analytics-code-block">
        <pre>{prompt}</pre>
      </div>
      <button type="button" onClick={copy} className="btn btn-secondary" style={{ fontSize: 12, padding: "8px 14px" }}>
        {copied ? "Copied to clipboard" : "Copy prompt text"}
      </button>
      {copied ? (
        <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: "var(--success)" }}>✓ Ready to paste</span>
      ) : null}
    </div>
  );
}

function MissingInfoCard({ issue, recommendation }) {
  return (
    <div className="analytics-alert-gaps">
      <div className="analytics-alert-gaps__title">{issue}</div>
      <div className="analytics-alert-gaps__body">{recommendation}</div>
    </div>
  );
}

function splitSentences(text) {
  return (text || "")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBulletLines(text) {
  const bulletRe = /^(\d+[.)]\s*|[-•*]\s+)/;
  return (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((line) => line && bulletRe.test(line))
    .map((line) => line.replace(bulletRe, "").trim());
}

/** Text before the first markdown-style bullet line (intro paragraph). */
function preambleBeforeBullets(text) {
  const bulletRe = /^(\d+[.)]\s*|[-•*]\s+)/;
  const parts = [];
  for (const line of (text || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (bulletRe.test(t)) break;
    parts.push(t);
  }
  return parts.join(" ").trim();
}

function truncateEllipsis(s, max) {
  const t = (s || "").trim();
  if (!t || t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function dedupeLines(lines) {
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const k = line.toLowerCase().slice(0, 96);
    if (!line || seen.has(k)) continue;
    seen.add(k);
    out.push(line);
  }
  return out;
}

/**
 * When the model returns broken JSON, the API may fall back to `{ summary: fullRawString }`.
 * Repair prose + `"insights": [...]` into a real object so cards/lists render instead of one blob.
 */
function coerceServerAnalyticsPayload(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const hasArrays =
    Array.isArray(raw.insights) ||
    Array.isArray(raw.topTopics) ||
    Array.isArray(raw.missingInfo) ||
    Array.isArray(raw.suggestions);
  if (hasArrays) return raw;

  const summary = typeof raw.summary === "string" ? raw.summary : "";
  if (summary.length < 40) return raw;

  const m = summary.match(/"\s*,\s*"insights"\s*:\s*/);
  if (!m || m.index == null || m.index < 8) return raw;

  const head = summary
    .slice(0, m.index)
    .trim()
    .replace(/^["']+|["']+$/g, "");
  const tail = summary.slice(m.index + m[0].length);
  if (!head) return raw;

  const stitched = `{"summary":${JSON.stringify(head)},"insights":${tail}`;
  try {
    const o = JSON.parse(stitched);
    if (o && typeof o === "object" && !Array.isArray(o)) {
      return { ...raw, ...o, meta: raw.meta };
    }
  } catch {
    /* keep original */
  }
  return raw;
}

function buildTakeaways(summary, insights) {
  const bullets = parseBulletLines(summary);
  if (bullets.length >= 2) {
    return dedupeLines(bullets).slice(0, 6);
  }

  const sents = splitSentences(summary);
  const headline = sents[0] || "";
  const lede = sents[1] || "";
  const restFromProse = sents.slice(2).filter((s) => s.length > 12);

  let merged = dedupeLines(restFromProse);
  if (merged.length < 2 && insights?.length) {
    merged = dedupeLines([...merged, ...insights.map((i) => i.title).filter(Boolean)]);
  }

  merged = merged.filter((line) => {
    const low = line.toLowerCase();
    if (headline && low === headline.toLowerCase()) return false;
    if (lede && low === lede.toLowerCase()) return false;
    return true;
  });

  return merged.slice(0, 5);
}

function ExecutiveSummary({ data }) {
  const summary = typeof data.summary === "string" ? data.summary : "";
  const pre = preambleBeforeBullets(summary);
  const rawBullets = parseBulletLines(summary);

  let headline;
  let lede;
  let takeaways;

  if (rawBullets.length >= 2 && !pre) {
    headline = truncateEllipsis(rawBullets[0], 168);
    lede = rawBullets[1];
    takeaways = dedupeLines(rawBullets.slice(2));
  } else {
    const prose = pre || summary;
    const sents = splitSentences(prose);
    headline =
      sents[0] ||
      truncateEllipsis(summary.trim(), 220) ||
      "Analysis complete.";
    lede = sents[1] || "";
    takeaways = buildTakeaways(summary, data.insights);
  }

  if (takeaways.length === 0) {
    takeaways = buildTakeaways(summary, data.insights).filter((l) => {
      const a = l.toLowerCase();
      return a !== headline.toLowerCase() && (!lede || a !== lede.toLowerCase());
    });
  }

  const top = data.topTopics?.[0];
  const highCount = data.insights?.filter((i) => i.urgency === "high").length ?? 0;
  const gapCount = data.missingInfo?.length ?? 0;
  const conv = data.meta?.analyzedConversations;

  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "var(--space-5)",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          <div className="analytics-summary-card__label">Executive summary</div>
          <p className="analytics-exec-headline">{headline}</p>
          {lede ? <p className="analytics-exec-lede">{lede}</p> : null}
        </div>
        {data.meta ? (
          <div className="analytics-meta">
            <span className="analytics-meta-chip">Scope: {data.meta.leadFilterLabel || "All leads"}</span>
            <span className="analytics-meta-chip">
              {data.meta.totalLeads} lead{data.meta.totalLeads !== 1 ? "s" : ""}{" "}
              {data.meta.leadFilter?.length ? "in selection" : "in CRM"}
            </span>
            <span className="analytics-meta-chip">
              {data.meta.analyzedConversations} lead AI {data.meta.analyzedConversations !== 1 ? "summaries" : "summary"} used
            </span>
            <span className="analytics-meta-chip">
              Generated <time dateTime={data.meta.generatedAt}>{new Date(data.meta.generatedAt).toLocaleString()}</time>
            </span>
          </div>
        ) : null}
      </div>

      <div className="analytics-at-glance" role="list" aria-label="At a glance">
        <div className="analytics-glance-tile" role="listitem">
          <div className="analytics-glance-tile__k">Top student topic</div>
          <div className="analytics-glance-tile__v">{top ? top.topic : "—"}</div>
          {top ? (
            <div className="analytics-glance-tile__hint">Roughly {top.percentage}% (from summaries)</div>
          ) : (
            <div className="analytics-glance-tile__hint">Not enough signal yet</div>
          )}
        </div>
        <div className="analytics-glance-tile" role="listitem">
          <div className="analytics-glance-tile__k">Urgent findings</div>
          <div className="analytics-glance-tile__v">{highCount}</div>
          <div className="analytics-glance-tile__hint">High priority in insights below</div>
        </div>
        <div className="analytics-glance-tile" role="listitem">
          <div className="analytics-glance-tile__k">Information gaps</div>
          <div className="analytics-glance-tile__v">{gapCount}</div>
          <div className="analytics-glance-tile__hint">Where answers looked incomplete</div>
        </div>
        <div className="analytics-glance-tile" role="listitem">
          <div className="analytics-glance-tile__k">Summaries in this run</div>
          <div className="analytics-glance-tile__v">{conv != null ? String(conv) : "—"}</div>
          <div className="analytics-glance-tile__hint">In this run</div>
        </div>
      </div>

      {takeaways.length > 0 ? (
        <section className="analytics-key-points" aria-labelledby="analytics-key-points-heading">
          <div className="analytics-key-points__header">
            <h3 id="analytics-key-points-heading" className="analytics-key-points__title">
              <span className="analytics-key-points__title-icon" aria-hidden>
                ★
              </span>
              Key points
            </h3>
            <p className="analytics-key-points__subtitle">Main takeaways — read top to bottom</p>
          </div>
          <ol className="analytics-key-points__list">
            {takeaways.map((line, i) => (
              <li key={i} className="analytics-key-point">
                <span className="analytics-key-point__badge" aria-hidden>
                  {i + 1}
                </span>
                <span className="analytics-key-point__check" aria-hidden title="Takeaway">
                  ✓
                </span>
                <p className="analytics-key-point__text">{line}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <details className="analytics-summary-details">
        <summary>Full analytics narrative (complete text)</summary>
        <div className="analytics-summary-details__body">{summary || "—"}</div>
      </details>
    </>
  );
}

function AnalyticsGridSkeleton() {
  return (
    <div className="analytics-results-grid">
      <div className="analytics-panel-stack">
        <div className="panel">
          <div className="panel-body">
            <SkeletonPulse style={{ width: "55%", height: 14, marginBottom: 14 }} />
            <SkeletonPulse style={{ width: "100%", height: 52, marginBottom: 10, borderRadius: 8 }} />
            <SkeletonPulse style={{ width: "100%", height: 52, marginBottom: 10, borderRadius: 8 }} />
            <SkeletonPulse style={{ width: "92%", height: 52, borderRadius: 8 }} />
          </div>
        </div>
      </div>
      <div className="analytics-panel-stack">
        <div className="panel">
          <div className="panel-body">
            <SkeletonPulse style={{ width: "48%", height: 14, marginBottom: 14 }} />
            <SkeletonPulse style={{ width: "100%", height: 88, marginBottom: 12, borderRadius: 8 }} />
            <SkeletonPulse style={{ width: "100%", height: 88, borderRadius: 8 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /** When true, every lead is included. When false, only checked segments. */
  const [scopeAll, setScopeAll] = useState(true);
  const [segmentPick, setSegmentPick] = useState({ new: false, warm: false, hot: false });

  const setScopeAllLeads = (on) => {
    setScopeAll(on);
    if (on) setSegmentPick({ new: false, warm: false, hot: false });
  };

  const toggleSegment = (key) => {
    setScopeAll(false);
    setSegmentPick((p) => ({ ...p, [key]: !p[key] }));
  };

  const runAnalysis = useCallback(async () => {
    const statuses = scopeAll
      ? []
      : ANALYTICS_SEGMENTS.map((s) => s.key).filter((k) => segmentPick[k]);

    if (!scopeAll && statuses.length === 0) {
      setError('Choose at least one segment (New, Warm, Hot), or turn on “All leads”.');
      return;
    }

    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await api.post("/admin/analytics/ai", { statuses });
      setData(coerceServerAnalyticsPayload(res.data));
    } catch (err) {
      setError(err.response?.data?.error || "Analysis failed. Check your server connection.");
    } finally {
      setLoading(false);
    }
  }, [scopeAll, segmentPick]);

  const idleFeatures = [
    { title: "Topic mix", desc: "Themes inferred from profile summaries." },
    { title: "Insights", desc: "Prioritized notes aggregated from those summaries." },
    { title: "Gaps", desc: "Where summaries suggest thin or missing information." },
    { title: "Prompt ideas", desc: "Snippets to paste into Settings → AI behavior." },
  ];

  return (
    <div className="page-shell analytics-page" style={{ maxWidth: 1040 }}>
      <header className="analytics-hero">
        <div className="analytics-hero__top-row">
        <div>
            <h1 className="page-title">AI Analytics</h1>
            <p className="page-subtitle" style={{ marginTop: 6 }}>
              Turn profile summaries into trends, gaps, and ideas—one click.
          </p>
        </div>
          <div className="analytics-hero__actions">
            <button type="button" onClick={runAnalysis} disabled={loading} className="btn btn-primary" style={{ padding: "10px 18px", fontSize: 13 }}>
          {loading ? (
            <>
                  <svg
                    className="analytics-spin"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                    style={{ verticalAlign: "-4px", marginRight: 8 }}
                  >
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeOpacity="0.2" />
                    <path fill="none" strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  Analyzing summaries…
            </>
          ) : (
                "Run analysis"
          )}
        </button>
      </div>
        </div>

        <div className="analytics-scope" aria-label="Choose which leads to include">
          <div className="analytics-scope__label">Include leads from</div>
          <div className="analytics-scope__row">
            <label className="analytics-scope__all">
              <input
                type="checkbox"
                checked={scopeAll}
                onChange={(e) => setScopeAllLeads(e.target.checked)}
              />
              All leads
            </label>
            <span className="analytics-scope__sep">or only:</span>
            <div className="analytics-scope__segments">
              {ANALYTICS_SEGMENTS.map(({ key, label }) => (
                <label
                  key={key}
                  className={`analytics-seg-chip ${segmentPick[key] ? "is-on" : ""} ${scopeAll ? "is-disabled" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={segmentPick[key]}
                    disabled={scopeAll}
                    onChange={() => toggleSegment(key)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </header>

      {!data && !loading && !error && (
        <div className="panel">
          <div className="panel-body" style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center" }}>
            <div
              style={{
                width: 52,
                height: 52,
                margin: "0 auto var(--space-4)",
                borderRadius: "var(--radius-md)",
                background: "var(--accent-light)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-hidden
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <h2 className="page-title" style={{ fontSize: 20, marginBottom: 8 }}>
              Ready when you are
          </h2>
            <p style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 20, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
              Pick your segments and run—fresh insights in seconds.
            </p>
            <div className="analytics-idle-features">
              {idleFeatures.map((f) => (
                <div key={f.title} className="analytics-idle-card">
                  <div className="analytics-idle-card__title">{f.title}</div>
                  <div className="analytics-idle-card__desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
        </div>
      )}

      {error ? <div className="analytics-error">{error}</div> : null}

      {data ? (
        <div>
          <div className="analytics-summary-card">
            <>
              <ExecutiveSummary data={data} />

              {data.conversionInsights ? (
                <div className="analytics-conversion-row">
                  {[
                    { label: "Main bottleneck", value: data.conversionInsights.bottleneck },
                    { label: "Best converting topic", value: data.conversionInsights.bestConvertingTopic },
                    { label: "Avg. messages to convert", value: data.conversionInsights.avgMessagesToConvert },
                  ]
                    .filter((x) => x.value)
                    .map(({ label, value }) => (
                      <div key={label}>
                        <div className="analytics-conversion-item__label">{label}</div>
                        <div className="analytics-conversion-item__value">{value}</div>
                      </div>
                    ))}
                </div>
              ) : null}
            </>
          </div>

          <DeferUntilInView
            fallback={<AnalyticsGridSkeleton />}
            idleFallbackMs={1000}
            rootMargin="180px 0px"
          >
            <div className="analytics-results-grid">
              <div className="analytics-panel-stack">
                {data.topTopics?.length > 0 ? (
                  <div className="panel">
                    <div className="panel-body">
                      <h2 className="analytics-section-title">What students ask about most</h2>
                      {data.topTopics.map((t, i) => (
                        <TopicBar key={i} {...t} />
                      ))}
                    </div>
                  </div>
                ) : null}

                {data.missingInfo?.length > 0 ? (
                  <div className="panel">
                    <div className="panel-body">
                      <h2 className="analytics-section-title">Information gaps</h2>
                      {data.missingInfo.map((item, i) => (
                        <MissingInfoCard key={i} {...item} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="analytics-panel-stack">
                {data.insights?.length > 0 ? (
                  <div className="panel">
                    <div className="panel-body">
                      <h2 className="analytics-section-title">Actionable insights</h2>
                      {data.insights.map((ins, i) => (
                        <InsightCard key={i} {...ins} />
                      ))}
                    </div>
                  </div>
                ) : null}

                {data.suggestions?.length > 0 ? (
                  <div className="panel">
                    <div className="panel-body">
                      <h2 className="analytics-section-title">Suggested prompt additions</h2>
                      {data.suggestions.map((s, i) => (
                        <SuggestionCard key={i} index={i + 1} {...s} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </DeferUntilInView>
        </div>
      ) : null}
    </div>
  );
}
