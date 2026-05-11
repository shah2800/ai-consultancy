import { useState, useEffect } from "react";
import api from "../api/api";
import { COUNTRIES } from "../utils/countries";
import { useProgressiveRevealTwoTier } from "../hooks/useProgressiveReveal";
import SkeletonPulse from "../components/SkeletonPulse";

function websiteHref(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function UniversitiesGridSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
      {[1, 2, 3].map((k) => (
        <div key={k} className="panel" style={{ padding: 14 }}>
          <SkeletonPulse style={{ width: "85%", height: 18, marginBottom: 10 }} />
          <SkeletonPulse style={{ width: "55%", height: 12 }} />
        </div>
      ))}
    </div>
  );
}

function UniversitiesInitialShell() {
  return (
    <div className="page-shell universities-page">
      <SkeletonPulse style={{ width: 280, height: 26, marginBottom: 10, borderRadius: 6 }} />
      <SkeletonPulse style={{ width: "min(420px, 90%)", height: 14, marginBottom: 18, borderRadius: 4 }} />
      <div className="panel" style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <SkeletonPulse style={{ height: 40, borderRadius: 10 }} />
          <SkeletonPulse style={{ height: 40, borderRadius: 10 }} />
          <SkeletonPulse style={{ height: 40, borderRadius: 10 }} />
          <SkeletonPulse style={{ height: 40, borderRadius: 10 }} />
        </div>
        <SkeletonPulse style={{ width: "100%", height: 90, marginTop: 12, borderRadius: 10 }} />
      </div>
      <UniversitiesGridSkeleton />
    </div>
  );
}

const FORM_TABS = [
  { id: "basics", label: "Basics" },
  { id: "programs", label: "Programs & costs" },
  { id: "extra", label: "Visa, aid & notes" },
];

function uniCardSummary(u) {
  const courses = u.courses || [];
  const firstCourse = courses[0];
  const more = courses.length > 1 ? ` +${courses.length - 1}` : "";
  const tMin = u.tuitionMin != null && u.tuitionMin !== "" ? u.tuitionMin : null;
  const tMax = u.tuitionMax != null && u.tuitionMax !== "" ? u.tuitionMax : null;
  let tuition = "";
  if (tMin != null && tMax != null) tuition = `$${tMin}–$${tMax}`;
  else if (tMin != null) tuition = `from $${tMin}`;
  else if (tMax != null) tuition = `up to $${tMax}`;
  const parts = [];
  if (firstCourse) parts.push(`${firstCourse}${more}`);
  if (tuition) parts.push(tuition);
  return parts.length ? parts.join(" · ") : "Tap for full details";
}

export default function Universities() {
  const [universities, setUniversities] = useState([]);
  const [form, setForm] = useState({
    name: "",
    country: "Georgia",
    city: "",
    courses: "",
    tuitionMin: "",
    tuitionMax: "",
    ranking: "",
    intakeDates: "",
    scholarships: "",
    visaRequirements: "",
    description: "",
    website: "",
  });
  const [formTab, setFormTab] = useState("basics");
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [initialLoad, setInitialLoad] = useState(true);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [listError, setListError] = useState("");

  const load = async () => {
    setListError("");
    try {
      const res = await api.get("/admin/universities");
      setUniversities(res.data || []);
    } catch {
      setUniversities([]);
      setListError("Could not load universities.");
    } finally {
      setInitialLoad(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setFormError("");
  }, [form]);

  const { primaryReady, secondaryReady } = useProgressiveRevealTwoTier(!initialLoad, "universities");

  const toggleExpanded = (id) => {
    setExpandedId((cur) => (cur === id ? "" : id));
  };

  const addUniversity = async () => {
    setFormError("");
    setFormSuccess("");
    if (!form.name.trim()) {
      setFormError("University name is required.");
      setFormTab("basics");
      return;
    }
    setAdding(true);
    try {
      const payload = {
        ...form,
        courses: form.courses
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        intakeDates: form.intakeDates
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        tuitionMin: form.tuitionMin ? Number(form.tuitionMin) : undefined,
        tuitionMax: form.tuitionMax ? Number(form.tuitionMax) : undefined,
        ranking: form.ranking ? Number(form.ranking) : undefined,
      };

      await api.post("/admin/universities", payload);

      setForm({
        name: "",
        country: "Georgia",
        city: "",
        courses: "",
        tuitionMin: "",
        tuitionMax: "",
        ranking: "",
        intakeDates: "",
        scholarships: "",
        visaRequirements: "",
        description: "",
        website: "",
      });
      setFormTab("basics");
      await load();
      setFormSuccess("University added.");
      window.setTimeout(() => setFormSuccess(""), 5000);
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to add university.");
    } finally {
      setAdding(false);
    }
  };

  const removeUniversity = async (uniId, displayName) => {
    if (
      !window.confirm(
        `Remove "${displayName || "this university"}" from the database? This cannot be undone.`
      )
    ) {
      return;
    }
    setListError("");
    setRemovingId(uniId);
    try {
      await api.delete(`/admin/universities/${uniId}`);
      if (expandedId === uniId) setExpandedId("");
      await load();
    } catch (err) {
      setListError(err.response?.data?.error || "Failed to remove university.");
    } finally {
      setRemovingId("");
    }
  };

  if (initialLoad && universities.length === 0) {
    return <UniversitiesInitialShell />;
  }

  return (
    <div className="page-shell universities-page" style={{ maxWidth: 920 }}>
      <h1 className="page-title">University Database</h1>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>
        Add complete university data so your team and AI can answer accurately.
      </p>

      {listError ? (
        <div className="analytics-error" style={{ marginBottom: 14 }}>
          {listError}
        </div>
      ) : null}

      {primaryReady ? (
      <div id="uni-add-form" className="panel" style={{ padding: 16, marginBottom: 18 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)" }}>
          Add a university
        </h2>

        {formError ? (
          <div className="analytics-error" style={{ marginBottom: 12 }}>
            {formError}
          </div>
        ) : null}
        {formSuccess ? (
          <div
            style={{
              background: "var(--ready-bg)",
              border: "1px solid rgb(134 239 172)",
              color: "var(--ready)",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {formSuccess}
          </div>
        ) : null}

        <div className="uni-form-tabs" role="tablist" aria-label="Add university form sections">
          {FORM_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={formTab === t.id}
              className={`uni-form-tab${formTab === t.id ? " is-active" : ""}`}
              onClick={() => setFormTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {formTab === "basics" ? (
          <div className="uni-form-panel" role="tabpanel">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <input
                className="input"
                placeholder="University Name *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                aria-invalid={Boolean(formError && !form.name.trim())}
                aria-required
              />
              <select
                className="select"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input className="input" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <input
                className="input"
                placeholder="Ranking (e.g. 1200)"
                value={form.ranking}
                onChange={(e) => setForm({ ...form, ranking: e.target.value })}
              />
              <input
                className="input"
                placeholder="Website URL"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
          </div>
        ) : null}

        {formTab === "programs" ? (
          <div className="uni-form-panel" role="tabpanel">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <input
                className="input"
                placeholder="Tuition Min (USD)"
                value={form.tuitionMin}
                onChange={(e) => setForm({ ...form, tuitionMin: e.target.value })}
              />
              <input
                className="input"
                placeholder="Tuition Max (USD)"
                value={form.tuitionMax}
                onChange={(e) => setForm({ ...form, tuitionMax: e.target.value })}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <input
                className="input"
                placeholder="Courses (comma separated, e.g. MBBS, Engineering, CS)"
                value={form.courses}
                onChange={(e) => setForm({ ...form, courses: e.target.value })}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <input
                className="input"
                placeholder="Intake Dates (comma separated, e.g. Jan 2027, Sep 2027)"
                value={form.intakeDates}
                onChange={(e) => setForm({ ...form, intakeDates: e.target.value })}
              />
            </div>
          </div>
        ) : null}

        {formTab === "extra" ? (
          <div className="uni-form-panel" role="tabpanel">
            <div style={{ marginTop: 0 }}>
              <input
                className="input"
                placeholder="Scholarships info"
                value={form.scholarships}
                onChange={(e) => setForm({ ...form, scholarships: e.target.value })}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <input
                className="input"
                placeholder="Visa Requirements"
                value={form.visaRequirements}
                onChange={(e) => setForm({ ...form, visaRequirements: e.target.value })}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <textarea
                className="textarea"
                placeholder="Description / Notes"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                style={{ minHeight: 90 }}
              />
            </div>
          </div>
        ) : null}

        <button className="btn btn-primary" onClick={addUniversity} disabled={adding} style={{ marginTop: 12 }}>
          {adding ? "Adding..." : "Add University"}
        </button>
      </div>
      ) : (
        <div className="panel" style={{ padding: 16, marginBottom: 18 }}>
          <div className="dashboard-skeleton-pulse" style={{ width: "100%", height: 120, borderRadius: 10, marginBottom: 12 }} aria-hidden />
          <div className="dashboard-skeleton-pulse" style={{ width: 140, height: 40, borderRadius: 10 }} aria-hidden />
        </div>
      )}

      {secondaryReady ? (
      universities.length === 0 ? (
        <div
          className="panel uni-empty-state"
          style={{
            padding: "28px 20px",
            textAlign: "center",
            background: "var(--surface-2)",
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" }}>
            No universities yet
          </p>
          <p style={{ margin: "0 auto 16px", maxWidth: 420, fontSize: 14, color: "var(--text-2)", lineHeight: 1.55 }}>
            Your AI and team use this list when answering students. Start with a name and country above, then use the
            tabs for courses, fees, and visa notes.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => document.getElementById("uni-add-form")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            Jump to add form
          </button>
        </div>
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {universities.map((u) => {
          const expanded = expandedId === u._id;
          const href = websiteHref(u.website);
          return (
            <div
              key={u._id}
              className="panel uni-card"
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              aria-label={`${u.name}, ${expanded ? "expanded" : "collapsed"}. ${uniCardSummary(u)}`}
              style={{ padding: 14, cursor: "pointer" }}
              onClick={() => toggleExpanded(u._id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleExpanded(u._id);
                }
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{u.name}</h3>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--text-3)" }}>
                    {u.country}
                    {u.city ? ` · ${u.city}` : ""}
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-2)", lineHeight: 1.45 }}>
                    {uniCardSummary(u)}
                  </p>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <span className="chip" style={{ background: "var(--surface-2)", color: "var(--text-2)", whiteSpace: "nowrap" }}>
                    {expanded ? "Hide" : "View"}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={removingId === u._id}
                    onClick={() => removeUniversity(u._id, u.name)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--danger)",
                      borderColor: "rgb(178 58 58 / 0.35)",
                    }}
                  >
                    {removingId === u._id ? "…" : "Remove"}
                  </button>
                </div>
              </div>

              {expanded && (
                <div
                  style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10, fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}
                >
                  <div><strong>Courses:</strong> {(u.courses || []).join(", ") || "—"}</div>
                  <div><strong>Tuition:</strong> {u.tuitionMin || "—"} - {u.tuitionMax || "—"} USD</div>
                  <div><strong>Intakes:</strong> {(u.intakeDates || []).join(", ") || "—"}</div>
                  <div><strong>Scholarships:</strong> {u.scholarships || "—"}</div>
                  <div><strong>Visa:</strong> {u.visaRequirements || "—"}</div>
                  <div><strong>Ranking:</strong> {u.ranking || "—"}</div>
                  <div>
                    <strong>Website:</strong>{" "}
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        {u.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                  {u.description && <div><strong>Description:</strong> {u.description}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )
      ) : primaryReady ? (
        <UniversitiesGridSkeleton />
      ) : null}
    </div>
  );
}
