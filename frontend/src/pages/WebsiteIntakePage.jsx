import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api/api";
import { isWebsiteLead } from "../utils/leadSource";
import DocumentAlertsPanel from "../components/DocumentAlertsPanel";

const STAGES = [
  { key: "registered", label: "1. Registered", auto: true },
  { key: "documents_under_review", label: "2. Documents Under Review", auto: true },
  { key: "documents_incomplete", label: "3. Documents Incomplete" },
  { key: "documents_complete", label: "4. Documents Complete" },
  { key: "counselor_assigned_process_started", label: "5. Counselor Assigned — Process Started" },
  { key: "university_application_submitted", label: "6. University Application Submitted" },
  { key: "offer_letter_in_progress", label: "7. Offer Letter — In Progress" },
  { key: "conditional_offer_letter_received", label: "8. Conditional Offer Letter Received" },
  { key: "unconditional_offer_letter_received", label: "9. Unconditional Offer Letter Received" },
  { key: "visa_process_started", label: "10. Visa Process Started" },
  { key: "visa_application_submitted", label: "11. Visa Application Submitted" },
  { key: "visa_approved", label: "12. Visa Approved ✅" },
  { key: "visa_rejected", label: "13. Visa Rejected ❌" },
  { key: "travel_ready", label: "14. Travel Ready" },
  { key: "enrolled", label: "15. Enrolled" },
];

const DOC_TYPES = [
  { key: "matric", label: "Matric Certificate" },
  { key: "fsc", label: "FSc Certificate / Transcript" },
  { key: "passport", label: "Passport Copy (photo page)" },
  { key: "photo", label: "Passport Size Photo" },
  { key: "cnic", label: "CNIC Copy" },
  { key: "other", label: "Other Document" },
];

const DOC_STATUSES = [
  { value: "pending", label: "⏳ Pending Review", color: "#6b7280" },
  { value: "ok", label: "✅ Received & OK", color: "#059669" },
  { value: "needs_resubmit", label: "⚠️ Needs Resubmission", color: "#d97706" },
  { value: "missing", label: "❌ Missing", color: "#dc2626" },
];

function fmtDate(d) {
  if (!d) return "—";
  try {
    const x = new Date(d);
    return Number.isNaN(x.getTime()) ? "—" : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return "—"; }
}

function passportWarning(expiry) {
  if (!expiry) return null;
  const exp = new Date(expiry);
  if (Number.isNaN(exp.getTime())) return null;
  const months = (exp - new Date()) / (1000 * 60 * 60 * 24 * 30);
  if (months < 0) return { text: "EXPIRED", color: "#dc2626" };
  if (months < 6) return { text: `Expires in ${Math.ceil(months)} month(s) — renew before visa!`, color: "#d97706" };
  return null;
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <dt style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</dt>
      <dd style={{ margin: "3px 0 0", fontWeight: 500, fontFamily: mono ? "ui-monospace, monospace" : "inherit", fontSize: 14 }}>{value || "—"}</dd>
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
      color: "var(--accent, #5b4dff)", borderBottom: "2px solid rgba(91,77,255,0.15)",
      paddingBottom: 6, marginTop: 20, marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

export default function WebsiteIntakePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [activeTab, setActiveTab] = useState("info");
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const apiOrigin = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

  const [processStage, setProcessStage] = useState("registered");
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [docStatuses, setDocStatuses] = useState({});
  const [docUploading, setDocUploading] = useState({});
  const [docUploadErr, setDocUploadErr] = useState({});
  const docFileRefs = useRef({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await api.get(`/admin/leads/${id}`);
      let l = res.data;
      const currentStage = l?.admissionProfile?.processStage || "registered";
      if (currentStage === "registered") {
        try {
          await api.patch(`/api/students/${id}/stage`, { stage: "documents_under_review" });
          const refreshed = await api.get(`/admin/leads/${id}`);
          l = refreshed.data;
        } catch { /* keep original */ }
      }
      const STAGE_4_PLUS = ["documents_complete","counselor_assigned_process_started","university_application_submitted","offer_letter_in_progress","conditional_offer_letter_received","unconditional_offer_letter_received","visa_process_started","visa_application_submitted","visa_approved","visa_rejected","travel_ready","enrolled"];
      if (!l?.admissionProfile?.registrationId && STAGE_4_PLUS.includes(l?.admissionProfile?.processStage)) {
        try {
          await api.patch(`/api/students/${id}/stage`, { stage: l.admissionProfile.processStage });
          const refreshed = await api.get(`/admin/leads/${id}`);
          l = refreshed.data;
        } catch { /* keep original */ }
      }
      setLead(l);
      const ap = l.admissionProfile || {};
      setProcessStage(ap.processStage || "registered");
      setPaymentReceived(!!ap.paymentReceived);
      const ds = {};
      const rawMap = ap.documentStatuses || {};
      const entries = rawMap instanceof Map ? [...rawMap.entries()] : Object.entries(rawMap);
      for (const [k, v] of entries) ds[k] = v || "pending";
      setDocStatuses(ds);
    } catch (e) {
      setErr(e.response?.status === 404 ? "Lead not found or you don't have access." : "Could not load lead.");
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleDocAttach = useCallback(async (docKey, docLabel, file) => {
    if (!file) return;
    setDocUploadErr((p) => ({ ...p, [docKey]: "" }));
    setDocUploading((p) => ({ ...p, [docKey]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docType", docKey);
      fd.append("docLabel", docLabel);
      await api.post(`/api/students/${id}/upload-doc`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDocStatuses((p) => ({ ...p, [docKey]: "ok" }));
      await load();
    } catch (e) {
      setDocUploadErr((p) => ({ ...p, [docKey]: e.response?.data?.error || "Upload failed." }));
    } finally {
      setDocUploading((p) => ({ ...p, [docKey]: false }));
      if (docFileRefs.current[docKey]) docFileRefs.current[docKey].value = "";
    }
  }, [id, load]);

  const saveAdmission = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const docUpdates = Object.entries(docStatuses).map(([docType, status]) => ({ docType, status }));
      await api.patch(`/api/students/${id}/documents`, { documents: docUpdates });
      await api.patch(`/admin/leads/${id}/admission`, {
        processStage,
        paymentReceived,
        docMatric: docStatuses.matric === "ok",
        docFsc: docStatuses.fsc === "ok",
        docPassport: docStatuses.passport === "ok",
        docPhotos: docStatuses.photo === "ok",
        docCnic: docStatuses.cnic === "ok",
      });
      setSaveMsg("Saved successfully.");
      await load();
    } catch (e) {
      setSaveMsg(e.response?.data?.error || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await api.post(`/api/students/${id}/notes`, { text: noteText.trim() });
      setNoteText("");
      await load();
    } catch { /* ignore */ }
    setAddingNote(false);
  };

  if (loading) {
    return <div className="page-shell" style={{ padding: 28, maxWidth: 1100 }}><p style={{ color: "var(--text-2)" }}>Loading application…</p></div>;
  }
  if (err || !lead) {
    return (
      <div className="page-shell" style={{ padding: 28, maxWidth: 560 }}>
        <p style={{ color: "var(--danger, #b91c1c)" }}>{err || "Unknown error."}</p>
        <Link to="/leads" style={{ color: "var(--accent)", fontWeight: 600 }}>← Back to leads</Link>
      </div>
    );
  }

  const ap = lead.admissionProfile || {};
  const uploads = Array.isArray(ap.uploadsMeta) ? ap.uploadsMeta : [];
  const isWebsite = isWebsiteLead(lead) || !!(uploads.length || ap.passportNumber || ap.universityInterest);
  if (!isWebsite) {
    return (
      <div className="page-shell" style={{ padding: 28, maxWidth: 560 }}>
        <p style={{ color: "var(--text-2)" }}>This lead is not a website application.</p>
        <button type="button" className="btn-primary" style={{ marginTop: 16 }} onClick={() => navigate(`/leads/${id}`)}>Open lead profile</button>
      </div>
    );
  }

  const ppWarn = passportWarning(ap.passportExpiry);
  const notes = Array.isArray(ap.internalNotes) ? ap.internalNotes : [];
  const activityLog = Array.isArray(lead.activityLog) ? lead.activityLog : [];
  const stageIndex = STAGES.findIndex(s => s.key === processStage);

  const tabs = [
    { key: "info", label: "Student Info" },
    { key: "documents", label: `Documents (${uploads.length})` },
    { key: "stages", label: "Process Stages" },
    { key: "notes", label: `Notes (${notes.length})` },
    { key: "activity", label: "Activity Log" },
  ];

  return (
    <div className="page-shell" style={{ padding: "24px 20px 48px", maxWidth: 1200 }}>
      <div style={{ marginBottom: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <Link to="/website-applications" style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>← Applications</Link>
        <button type="button" onClick={() => navigate(`/leads/${id}`)} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
          Open chat profile
        </button>
      </div>

      {/* Header card */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14,
        padding: "20px 24px", marginBottom: 20,
        display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", justifyContent: "space-between",
      }}>
            <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text)" }}>{ap.fullName || lead.name || "—"}</h1>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>
            {ap.registrationId ? <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "var(--accent)", marginRight: 12 }}>{ap.registrationId}</span> : null}
            {ap.countryInterest || lead.countryInterest || ""} · {ap.programInterest || lead.courseInterest || ""} · {ap.universityInterest || ""}
            </div>
            </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{
            padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: stageIndex >= 4 ? "rgba(5, 150, 105, 0.1)" : "rgba(217, 119, 6, 0.1)",
            color: stageIndex >= 4 ? "#059669" : "#d97706",
            border: `1px solid ${stageIndex >= 4 ? "rgba(5,150,105,0.3)" : "rgba(217,119,6,0.3)"}`,
          }}>
            {STAGES[stageIndex]?.label || processStage}
          </span>
          {ppWarn && (
            <span style={{ padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${ppWarn.color}15`, color: ppWarn.color, border: `1px solid ${ppWarn.color}40` }}>
              ⚠️ Passport {ppWarn.text}
            </span>
          )}
            </div>
            </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "2px solid var(--border)", overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} style={{
            padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            background: "none", border: "none", borderBottom: activeTab === t.key ? "3px solid var(--accent)" : "3px solid transparent",
            color: activeTab === t.key ? "var(--accent)" : "var(--text-2)",
            whiteSpace: "nowrap",
          }}>{t.label}</button>
        ))}
            </div>

      {/* Tab: Student Info */}
      {activeTab === "info" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }} className="intake-info-grid">
          <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px" }}>
            <SectionHeader>Personal Information</SectionHeader>
            <dl style={{ margin: 0 }}>
              <InfoRow label="Full Name" value={ap.fullName || lead.name} />
              <InfoRow label="Father's Name" value={ap.fatherName} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <InfoRow label="Date of Birth" value={fmtDate(ap.dob)} />
                <InfoRow label="Gender" value={ap.gender} />
            </div>
              <InfoRow label="WhatsApp Number" value={ap.whatsappNumber || lead.phone} mono />
              <InfoRow label="Email Address" value={ap.emailAddress || lead.email} />
              <InfoRow label="City / Address" value={ap.cityAddress} />
            </dl>

            <SectionHeader>Passport Details</SectionHeader>
            <dl style={{ margin: 0 }}>
              <InfoRow label="Passport Number" value={ap.passportNumber} mono />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <InfoRow label="Issue Date" value={fmtDate(ap.passportIssueDate)} />
            <div>
                  <InfoRow label="Expiry Date" value={fmtDate(ap.passportExpiry)} />
                  {ppWarn && <p style={{ fontSize: 12, fontWeight: 700, color: ppWarn.color, margin: "-8px 0 12px" }}>⚠️ {ppWarn.text}</p>}
            </div>
            </div>
          </dl>
          </section>

          <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px" }}>
            <SectionHeader>Academic Information</SectionHeader>
            <dl style={{ margin: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <InfoRow label="Matric Marks / Grade" value={ap.matricGrade} />
                <InfoRow label="FSc Marks / Grade" value={ap.fscGrade} />
              </div>
              <InfoRow label="Other Degree" value={ap.otherDegree} />
              <InfoRow label="IELTS Score" value={ap.ieltsScore} />
            </dl>

            <SectionHeader>Application Preference</SectionHeader>
            <dl style={{ margin: 0 }}>
              <InfoRow label="Country of Interest" value={ap.countryInterest || lead.countryInterest} />
              <InfoRow label="University Preference" value={ap.universityInterest} />
              <InfoRow label="Course / Program" value={ap.programInterest || lead.courseInterest} />
            </dl>

            <SectionHeader>Submission Details</SectionHeader>
            <dl style={{ margin: 0 }}>
              <InfoRow label="Source" value={lead.source} />
              <InfoRow label="Submitted" value={fmtDate(lead.createdAt)} />
              <InfoRow label="Last Updated" value={fmtDate(lead.updatedAt)} />
            </dl>
          </section>
          <style>{`@media (max-width: 800px) { .intake-info-grid { grid-template-columns: 1fr !important; } }`}</style>
        </div>
      )}

      {/* Tab: Documents */}
      {activeTab === "documents" && (() => {
        const uploadsByType = {};
        uploads.forEach((u, idx) => {
          const t = u.docType || "_untagged";
          if (!uploadsByType[t]) uploadsByType[t] = [];
          uploadsByType[t].push({ ...u, _origIndex: idx });
        });

        const ALL_SLOTS = [
          ...DOC_TYPES,
          { key: "complete", label: "Complete File (All Documents)" },
        ];
        const hasCompleteFile = (uploadsByType["complete"] || []).length > 0;

        return (
        <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px", maxWidth: 800 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 20px" }}>Documents</h2>

          <div style={{ display: "grid", gap: 0 }}>
            {ALL_SLOTS.map(doc => {
              const files = uploadsByType[doc.key] || [];
              const status = docStatuses[doc.key] || "pending";
              const statusInfo = DOC_STATUSES.find(s => s.value === status) || DOC_STATUSES[0];
              const hasFile = files.length > 0 || hasCompleteFile;
              const isUploading = docUploading[doc.key];
              const uErr = docUploadErr[doc.key];

              return (
                <div key={doc.key} style={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "14px 0",
                  }}>
                    {/* Thumbnail or placeholder */}
                    {files.length > 0 ? (
                      files[0] && /\.(jpg|jpeg|png|webp|gif)$/i.test(files[0].originalName || files[0].storedPath) ? (
                        <a href={`${apiOrigin}${files[0].storedPath}`} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                          <img src={`${apiOrigin}${files[0].storedPath}`} alt={doc.label} loading="lazy" style={{
                            width: 56, height: 56, objectFit: "cover", borderRadius: 8,
                            border: "1px solid var(--border)", cursor: "pointer", background: "#f0f0f0",
                          }} />
                        </a>
                      ) : (
                        <a href={`${apiOrigin}${files[0].storedPath}`} target="_blank" rel="noopener noreferrer" style={{
                          width: 56, height: 56, borderRadius: 8, background: "rgba(91,77,255,0.08)", border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, textDecoration: "none",
                        }}>📄</a>
                      )
                    ) : (
                      <div style={{
                        width: 56, height: 56, borderRadius: 8, background: "var(--surface-2, #f5f5f5)", border: "1px dashed var(--border)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--text-3)", flexShrink: 0, textAlign: "center", lineHeight: 1.2,
                      }}>No file</div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{doc.label}</div>
                      {files.length > 0 ? (
                        files.map((f, i) => (
                          <a key={i} href={`${apiOrigin}${f.storedPath}`} target="_blank" rel="noopener noreferrer"
                            style={{ display: "block", fontSize: 12, color: "var(--accent)", fontWeight: 600, textDecoration: "none", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {f.originalName || "File"} ↗
                          </a>
                        ))
                      ) : (
                        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Not uploaded</div>
                      )}
                    </div>

                    {/* Hidden file input */}
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      style={{ display: "none" }}
                      ref={(el) => { docFileRefs.current[doc.key] = el; }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleDocAttach(doc.key, doc.label, file);
                      }}
                    />

                    {/* Attach button */}
                    <button
                      type="button"
                      disabled={isUploading}
                      title={`Attach file for ${doc.label}`}
                      onClick={() => docFileRefs.current[doc.key]?.click()}
                      style={{
                        padding: "7px 11px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: isUploading ? "var(--surface-2)" : "var(--surface)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: isUploading ? "wait" : "pointer",
                        color: "var(--accent)",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {isUploading ? "⏳" : "📎 Attach"}
                    </button>

                    <select value={status} onChange={e => {
                      setDocStatuses(prev => ({ ...prev, [doc.key]: e.target.value }));
                    }}
                      style={{
                        padding: "6px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, flexShrink: 0, width: 130,
                        border: `1px solid ${statusInfo.color}40`, color: statusInfo.color, background: "var(--surface)",
                      }}>
                      {DOC_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  {uErr && (
                    <div style={{ fontSize: 12, color: "#b91c1c", paddingBottom: 8, paddingLeft: 70 }}>{uErr}</div>
                  )}
                </div>
              );
            })}

            {/* Untagged files — show assign dropdown */}
            {(uploadsByType["_untagged"] || []).length > 0 && (
              <div style={{ marginTop: 16, padding: "14px 16px", background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#d97706", textTransform: "uppercase", marginBottom: 10 }}>
                  Untagged Files — Assign Document Type
                </div>
                {(uploadsByType["_untagged"] || []).map((f, i) => (
                  <div key={`ut-${i}`} style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "10px 0",
                    borderBottom: i < (uploadsByType["_untagged"]?.length || 0) - 1 ? "1px solid rgba(217,119,6,0.15)" : "none",
                  }}>
                    {/\.(jpg|jpeg|png|webp|gif)$/i.test(f.originalName || f.storedPath) ? (
                      <a href={`${apiOrigin}${f.storedPath}`} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                        <img src={`${apiOrigin}${f.storedPath}`} alt={f.originalName} loading="lazy" style={{
                          width: 48, height: 48, objectFit: "cover", borderRadius: 8,
                          border: "1px solid var(--border)", cursor: "pointer", background: "#f0f0f0",
                        }} />
                      </a>
                    ) : (
                      <a href={`${apiOrigin}${f.storedPath}`} target="_blank" rel="noopener noreferrer" style={{
                        width: 48, height: 48, borderRadius: 8, background: "rgba(91,77,255,0.08)", border: "1px solid var(--border)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0, textDecoration: "none",
                      }}>📄</a>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={`${apiOrigin}${f.storedPath}`} target="_blank" rel="noopener noreferrer"
                        style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--accent)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.originalName || "File"} ↗
                      </a>
                    </div>
                    <select
                      defaultValue=""
                      onChange={async (e) => {
                        const newType = e.target.value;
                        if (!newType) return;
                        try {
                          await api.patch(`/api/students/${id}/reassign-doc`, { fileIndex: f._origIndex, docType: newType });
                          await load();
                        } catch (err) {
                          alert(err?.response?.data?.error || "Failed to assign document type");
                        }
                      }}
                      style={{
                        padding: "6px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, flexShrink: 0, width: 160,
                        border: "1px solid #d9770640", color: "#d97706", background: "var(--surface)", cursor: "pointer",
                      }}
                    >
                      <option value="">Assign type…</option>
                      {ALL_SLOTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="button" onClick={saveAdmission} disabled={saving} style={{
            marginTop: 20, width: "100%", padding: "12px 16px", borderRadius: 10, border: "none",
            background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 14,
            cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1,
          }}>
            {saving ? "Saving…" : "Save Document Status"}
          </button>
          {saveMsg && <p style={{ fontSize: 13, marginTop: 8, color: saveMsg.includes("success") ? "#059669" : "#b91c1c", fontWeight: 600 }}>{saveMsg}</p>}
        </section>
        );
      })()}

      {/* Tab: Process Stages */}
      {activeTab === "stages" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr min(380px, 100%)", gap: 24, alignItems: "start" }} className="intake-stages-grid">
          <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px" }}>Process Timeline</h2>
            <div style={{ display: "grid", gap: 0 }}>
              {STAGES.map((s, i) => {
                const isDone = i < stageIndex;
                const isActive = i === stageIndex;
                const isPending = i > stageIndex;
                return (
                  <div key={s.key} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                    borderLeft: `3px solid ${isDone ? "#059669" : isActive ? "#d97706" : "#e5e7eb"}`,
                    background: isActive ? "rgba(217,119,6,0.06)" : "transparent",
                    borderRadius: isActive ? "0 8px 8px 0" : 0,
                  }}>
                    <span style={{ fontSize: 18, width: 28, textAlign: "center", flexShrink: 0 }}>
                      {isDone ? "✅" : isActive ? "⏳" : "⬜"}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isPending ? "var(--text-3)" : "var(--text)" }}>
                        {s.label}
                      </div>
                      {s.auto && <span style={{ fontSize: 10, color: "var(--text-3)" }}>Auto</span>}
                    </div>
                  </div>
                );
              })}
            </div>
        </section>

          <aside style={{
            background: "linear-gradient(145deg, rgba(91,77,255,0.06), rgba(6,182,212,0.05))",
            border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px", position: "sticky", top: 16,
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>Update Stage</h2>
          <p style={{ fontSize: 12, color: "var(--text-2)", margin: "0 0 16px", lineHeight: 1.45 }}>
              Changing the stage will send an automatic WhatsApp notification to the student at major milestones.
              {!ap.registrationId && <><br /><strong style={{ color: "#d97706" }}>Register ID assigned automatically at Stage 4 (Documents Complete).</strong></>}
            </p>

            {ap.registrationId && (
              <div style={{ padding: "10px 14px", background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.25)", borderRadius: 10, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>Register ID</div>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "ui-monospace, monospace", color: "#059669", marginTop: 2 }}>{ap.registrationId}</div>
              </div>
            )}

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Current Stage</label>
            <select value={processStage} onChange={e => setProcessStage(e.target.value)} style={{
              width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 14, fontSize: 13,
            }}>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={paymentReceived} onChange={e => setPaymentReceived(e.target.checked)} />
            Consultancy fee received
          </label>

            <button type="button" onClick={saveAdmission} disabled={saving} style={{
              width: "100%", padding: "12px 16px", borderRadius: 10, border: "none",
              background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 14,
              cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1,
            }}>
              {saving ? "Saving…" : "Update Stage"}
            </button>
            {saveMsg && <p style={{ fontSize: 13, marginTop: 8, color: saveMsg.includes("success") ? "#059669" : "#b91c1c", fontWeight: 600 }}>{saveMsg}</p>}
          </aside>
          <style>{`@media (max-width: 900px) { .intake-stages-grid { grid-template-columns: 1fr !important; } }`}</style>
        </div>
      )}

      {/* Tab: Notes */}
      {activeTab === "notes" && (
        <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px", maxWidth: 700 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>Internal Notes</h2>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16 }}>Only visible to the team. Students cannot see these.</p>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note…"
              onKeyDown={e => { if (e.key === "Enter") addNote(); }}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14 }} />
            <button type="button" onClick={addNote} disabled={addingNote || !noteText.trim()} style={{
              padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff",
              fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: addingNote ? 0.7 : 1,
            }}>Add</button>
          </div>
          {notes.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-3)" }}>No notes yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {[...notes].reverse().map((n, i) => (
                <div key={i} style={{ padding: "10px 14px", background: "var(--surface-2, #f8f9fa)", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 13, margin: 0, whiteSpace: "pre-wrap" }}>{typeof n === "string" ? n : n.text || JSON.stringify(n)}</p>
                  {n.at && <p style={{ fontSize: 11, color: "var(--text-3)", margin: "6px 0 0" }}>{fmtDate(n.at)} {n.by ? `— ${n.by}` : ""}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tab: Activity Log */}
      {activeTab === "activity" && (
        <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px", maxWidth: 700 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px" }}>Activity Log</h2>
          {activityLog.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-3)" }}>No activity recorded yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {[...activityLog].reverse().map((entry, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, padding: "10px 14px", borderLeft: "3px solid rgba(91,77,255,0.3)",
                  background: i === 0 ? "rgba(91,77,255,0.04)" : "transparent",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{entry.description || entry.type || "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                      {fmtDate(entry.at)} {entry.by ? `— ${entry.by}` : ""}
                    </div>
                  </div>
                </div>
              ))}
      </div>
          )}
        </section>
      )}
    </div>
  );
}
