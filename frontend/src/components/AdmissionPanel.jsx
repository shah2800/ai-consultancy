import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../api/api";
import { isWebsiteLead } from "../utils/leadSource";
import DocumentAlertsPanel from "./DocumentAlertsPanel";

const PROCESS_STAGES = [
  { key: "registered", label: "1. Registered" },
  { key: "documents_under_review", label: "2. Documents Under Review" },
  { key: "documents_incomplete", label: "3. Documents Incomplete" },
  { key: "documents_complete", label: "4. Documents Complete" },
  { key: "counselor_assigned_process_started", label: "5. Counselor Assigned" },
  { key: "university_application_submitted", label: "6. Uni Application Submitted" },
  { key: "offer_letter_in_progress", label: "7. Offer Letter — In Progress" },
  { key: "conditional_offer_letter_received", label: "8. Conditional Offer" },
  { key: "unconditional_offer_letter_received", label: "9. Unconditional Offer" },
  { key: "visa_process_started", label: "10. Visa Process Started" },
  { key: "visa_application_submitted", label: "11. Visa Submitted" },
  { key: "visa_approved", label: "12. Visa Approved ✅" },
  { key: "visa_rejected", label: "13. Visa Rejected ❌" },
  { key: "travel_ready", label: "14. Travel Ready" },
  { key: "enrolled", label: "15. Enrolled" },
];

const DOC_ITEMS = [
  { key: "matric", label: "Matric Certificate" },
  { key: "fsc", label: "FSc Certificate" },
  { key: "passport", label: "Passport Copy" },
  { key: "photo", label: "Passport Photo" },
  { key: "cnic", label: "CNIC Copy" },
];

const DOC_STATUS_OPTIONS = [
  { value: "pending", label: "⏳ Pending" },
  { value: "ok", label: "✅ OK" },
  { value: "needs_resubmit", label: "⚠️ Resubmit" },
  { value: "missing", label: "❌ Missing" },
];

export default function AdmissionPanel({ lead, onSaved }) {
  const ap = lead.admissionProfile || {};
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [processStage, setProcessStage] = useState(ap.processStage || "registered");
  const [paymentReceived, setPaymentReceived] = useState(!!ap.paymentReceived);
  const [docStatuses, setDocStatuses] = useState({});
  const [uploading, setUploading] = useState({}); // { [docKey]: true/false }
  const [uploadErr, setUploadErr] = useState({});  // { [docKey]: "error msg" }
  const fileRefs = useRef({});                      // hidden input refs per doc key

  useEffect(() => {
    const p = lead.admissionProfile || {};
    setProcessStage(p.processStage || "registered");
    setPaymentReceived(!!p.paymentReceived);
    const ds = {};
    const rawMap = p.documentStatuses || {};
    const entries = rawMap instanceof Map ? [...rawMap.entries()] : Object.entries(rawMap);
    for (const [k, v] of entries) ds[k] = v || "pending";
    if (!ds.matric) ds.matric = p.docMatric ? "ok" : "pending";
    if (!ds.fsc) ds.fsc = p.docFsc ? "ok" : "pending";
    if (!ds.passport) ds.passport = p.docPassport ? "ok" : "pending";
    if (!ds.photo) ds.photo = p.docPhotos ? "ok" : "pending";
    if (!ds.cnic) ds.cnic = p.docCnic ? "ok" : "pending";
    setDocStatuses(ds);
  }, [lead._id, lead.admissionProfile]);

  const visible = useMemo(() => {
    return isWebsiteLead(lead) || !!(ap && (ap.passportNumber || ap.uploadsMeta?.length || ap.processStage));
  }, [lead, ap]);

  const handleFileUpload = useCallback(async (docKey, docLabel, file) => {
    if (!file) return;
    setUploadErr((p) => ({ ...p, [docKey]: "" }));
    setUploading((p) => ({ ...p, [docKey]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docType", docKey);
      fd.append("docLabel", docLabel);
      await api.post(`/api/students/${lead._id}/upload-doc`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDocStatuses((p) => ({ ...p, [docKey]: "ok" }));
      onSaved?.();
    } catch (e) {
      setUploadErr((p) => ({ ...p, [docKey]: e.response?.data?.error || "Upload failed." }));
    } finally {
      setUploading((p) => ({ ...p, [docKey]: false }));
      if (fileRefs.current[docKey]) fileRefs.current[docKey].value = "";
    }
  }, [lead._id, onSaved]);

  const save = useCallback(async () => {
    setSaving(true);
    setErr("");
    try {
      await api.patch(`/admin/leads/${lead._id}/admission`, {
        processStage,
        paymentReceived,
        docMatric: docStatuses.matric === "ok",
        docFsc: docStatuses.fsc === "ok",
        docPassport: docStatuses.passport === "ok",
        docPhotos: docStatuses.photo === "ok",
        docCnic: docStatuses.cnic === "ok",
      });
      try {
        await api.patch(`/api/students/${lead._id}/documents`, { documentStatuses: docStatuses });
      } catch { /* optional */ }
      onSaved?.();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [lead._id, processStage, paymentReceived, docStatuses, onSaved]);

  if (!visible) return null;

  const uploads = Array.isArray(ap.uploadsMeta) ? ap.uploadsMeta : [];
  const apiOrigin = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

  return (
    <div style={{
      marginTop: 16, padding: 14,
      background: "linear-gradient(135deg, rgba(91,77,255,0.08), rgba(6,182,212,0.06))",
      border: "1px solid rgba(91,77,255,0.25)", borderRadius: 10,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent-2, #5b4dff)", marginBottom: 10 }}>
        Website application & admission
      </div>

      <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 12 }}>
        <strong>Passport:</strong> {ap.passportNumber || "—"}
        <br /><strong>University:</strong> {ap.universityInterest || "—"}
        <br /><strong>Father:</strong> {ap.fatherName || "—"} · <strong>DOB:</strong> {ap.dob ? new Date(ap.dob).toLocaleDateString() : "—"}
        {ap.registrationId && (
          <><br /><strong>Register ID:</strong> <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "#059669" }}>{ap.registrationId}</span></>
        )}
      </div>

      <label style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
        <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Admission stage</span>
        <select value={processStage} onChange={e => setProcessStage(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}>
          {PROCESS_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 10 }}>
        <input type="checkbox" checked={paymentReceived} onChange={e => setPaymentReceived(e.target.checked)} />
        Consultancy fee received
      </label>

      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--text-2)" }}>Document checklist</div>
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {DOC_ITEMS.map(doc => {
          const val = docStatuses[doc.key] || "pending";
          const isUploading = uploading[doc.key];
          const uErr = uploadErr[doc.key];
          return (
            <div key={doc.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ flex: 1, fontWeight: 500 }}>{doc.label}</span>
                <select value={val} onChange={e => setDocStatuses(prev => ({ ...prev, [doc.key]: e.target.value }))}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 11, fontWeight: 600,
                    color: val === "ok" ? "#059669" : val === "missing" ? "#dc2626" : val === "needs_resubmit" ? "#d97706" : "#6b7280" }}>
                  {DOC_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {/* Hidden file input */}
                <input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  style={{ display: "none" }}
                  ref={(el) => { fileRefs.current[doc.key] = el; }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(doc.key, doc.label, file);
                  }}
                />
                <button
                  type="button"
                  disabled={isUploading}
                  title={`Attach file for ${doc.label}`}
                  onClick={() => fileRefs.current[doc.key]?.click()}
                  style={{
                    padding: "4px 9px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: isUploading ? "var(--surface-2)" : "var(--surface)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: isUploading ? "wait" : "pointer",
                    color: "var(--text-2)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {isUploading ? "⏳" : "📎 Attach"}
                </button>
              </div>
              {uErr && (
                <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 2, paddingLeft: 2 }}>{uErr}</div>
              )}
            </div>
          );
        })}
      </div>

      {uploads.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--text-2)" }}>Uploaded files</div>
          <ul style={{ margin: 0, paddingLeft: 0, fontSize: 12, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {uploads.map((u, i) => (
              <li key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, opacity: 0.6 }}>{u.uploadedByStaff ? "📎" : "🌐"}</span>
                <a href={`${apiOrigin}${u.storedPath}`} target="_blank" rel="noopener noreferrer"
                  style={{ color: "var(--accent)", wordBreak: "break-all" }}>
                  {u.originalName || u.storedPath}
                </a>
                {u.docLabel && (
                  <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>({u.docLabel})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <DocumentAlertsPanel leadId={lead._id} onChanged={onSaved} />

      {err && <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>{err}</div>}

      <button type="button" onClick={save} disabled={saving} style={{
        padding: "8px 14px", borderRadius: 8, border: "none",
        background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 13,
        cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1,
      }}>
        {saving ? "Saving…" : "Save admission"}
      </button>
    </div>
  );
}
