import { useState, useEffect } from "react";
import api from "../api/api";
import { COUNTRIES } from "../utils/countries";
import { useProgressiveRevealTwoTier } from "../hooks/useProgressiveReveal";
import SkeletonPulse from "../components/SkeletonPulse";

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
    <div className="page-shell">
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
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [initialLoad, setInitialLoad] = useState(true);

  const load = async () => {
    try {
      const res = await api.get("/admin/universities");
      setUniversities(res.data || []);
    } catch {
      setUniversities([]);
    } finally {
      setInitialLoad(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const { primaryReady, secondaryReady } = useProgressiveRevealTwoTier(!initialLoad, "universities");

  const addUniversity = async () => {
    if (!form.name.trim()) {
      alert("University name is required");
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
      await load();
      alert("University added successfully");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to add university");
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
    setRemovingId(uniId);
    try {
      await api.delete(`/admin/universities/${uniId}`);
      if (expandedId === uniId) setExpandedId("");
      await load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to remove university");
    } finally {
      setRemovingId("");
    }
  };

  if (initialLoad && universities.length === 0) {
    return <UniversitiesInitialShell />;
  }

  return (
    <div className="page-shell universities-page">
      <h1 className="page-title">University Database</h1>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>
        Add complete university data so your team and AI can answer accurately.
      </p>

      {primaryReady ? (
      <div className="panel" style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <input className="input" placeholder="University Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
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
          <input className="input" placeholder="City" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
          <input className="input" placeholder="Ranking (e.g. 1200)" value={form.ranking} onChange={e => setForm({ ...form, ranking: e.target.value })} />
          <input className="input" placeholder="Tuition Min (USD)" value={form.tuitionMin} onChange={e => setForm({ ...form, tuitionMin: e.target.value })} />
          <input className="input" placeholder="Tuition Max (USD)" value={form.tuitionMax} onChange={e => setForm({ ...form, tuitionMax: e.target.value })} />
        </div>

        <div style={{ marginTop: 10 }}>
          <input className="input" placeholder="Courses (comma separated, e.g. MBBS, Engineering, CS)" value={form.courses} onChange={e => setForm({ ...form, courses: e.target.value })} />
        </div>
        <div style={{ marginTop: 10 }}>
          <input className="input" placeholder="Intake Dates (comma separated, e.g. Jan 2027, Sep 2027)" value={form.intakeDates} onChange={e => setForm({ ...form, intakeDates: e.target.value })} />
        </div>
        <div style={{ marginTop: 10 }}>
          <input className="input" placeholder="Scholarships info" value={form.scholarships} onChange={e => setForm({ ...form, scholarships: e.target.value })} />
        </div>
        <div style={{ marginTop: 10 }}>
          <input className="input" placeholder="Visa Requirements" value={form.visaRequirements} onChange={e => setForm({ ...form, visaRequirements: e.target.value })} />
        </div>
        <div style={{ marginTop: 10 }}>
          <input className="input" placeholder="Website URL" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
        </div>
        <div style={{ marginTop: 10 }}>
          <textarea className="textarea" placeholder="Description / Notes" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ minHeight: 90 }} />
        </div>

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {universities.map(u => (
          <div
            key={u._id}
            className="panel"
            style={{ padding: 14, cursor: "pointer" }}
            onClick={() => setExpandedId(expandedId === u._id ? "" : u._id)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{u.name}</h3>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--text-3)" }}>
                  {u.country} {u.city ? `· ${u.city}` : ""}
                </p>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="chip" style={{ background: "var(--surface-2)", color: "var(--text-2)", whiteSpace: "nowrap" }}>
                  {expandedId === u._id ? "Hide" : "View"}
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

            {expandedId === u._id && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10, fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
                <div><strong>Courses:</strong> {(u.courses || []).join(", ") || "—"}</div>
                <div><strong>Tuition:</strong> {u.tuitionMin || "—"} - {u.tuitionMax || "—"} USD</div>
                <div><strong>Intakes:</strong> {(u.intakeDates || []).join(", ") || "—"}</div>
                <div><strong>Scholarships:</strong> {u.scholarships || "—"}</div>
                <div><strong>Visa:</strong> {u.visaRequirements || "—"}</div>
                <div><strong>Ranking:</strong> {u.ranking || "—"}</div>
                <div><strong>Website:</strong> {u.website ? <a href={u.website} target="_blank" rel="noreferrer">{u.website}</a> : "—"}</div>
                {u.description && <div><strong>Description:</strong> {u.description}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
      ) : primaryReady ? (
        <UniversitiesGridSkeleton />
      ) : null}
    </div>
  );
}