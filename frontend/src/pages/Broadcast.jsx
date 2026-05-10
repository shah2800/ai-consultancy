import { useEffect, useMemo, useState } from "react";
import api from "../api/api";
import { useProgressiveRevealTwoTier } from "../hooks/useProgressiveReveal";

const STATUS_OPTIONS = [
  "all",
  "new",
  "warm",
  "hot",
  "ready",
  "converted",
  "lost",
];

/** Must match server `BROADCAST_MAX_ATTACHMENTS` in index.js */
const MAX_ATTACHMENTS = 5;

export default function Broadcast() {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [status, setStatus] = useState("all");
  const [mode, setMode] = useState("all_in_status");
  const [leads, setLeads] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [sending, setSending] = useState(false);

  const loadLeads = async (nextStatus) => {
    setLoadingLeads(true);
    try {
      const res = await api.get(`/admin/leads?status=${nextStatus}`);
      setLeads(res.data || []);
    } catch {
      setLeads([]);
    } finally {
      setLoadingLeads(false);
    }
  };

  useEffect(() => {
    loadLeads(status);
    setSelectedIds([]);
  }, [status]);

  const selectableLeads = useMemo(
    () => (status === "all" ? leads : leads.filter((l) => l.status === status)),
    [leads, status]
  );

  const { primaryReady, secondaryReady } = useProgressiveRevealTwoTier(true, status);

  const toggleLead = (leadId) => {
    setSelectedIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  const toggleAllVisible = () => {
    const allVisibleIds = selectableLeads.map((l) => l._id);
    const allSelected = allVisibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allVisibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...allVisibleIds])]);
    }
  };

  const addFiles = (fileList) => {
    const picked = Array.from(fileList || []);
    if (picked.length === 0) return;
    setAttachments((prev) => {
      const merged = [...prev, ...picked];
      return merged.slice(0, MAX_ATTACHMENTS);
    });
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const sendBroadcast = async () => {
    if (!message.trim() && attachments.length === 0) {
      alert("Add a message and/or at least one attachment (up to 5 files).");
      return;
    }
    if (mode === "selected_only" && selectedIds.length === 0) {
      alert("Please select at least one lead.");
      return;
    }

    setSending(true);
    try {
      const fd = new FormData();
      fd.append("message", message.trim());
      fd.append("status", status);
      if (mode === "selected_only") {
        fd.append("leadIds", JSON.stringify(selectedIds));
      }
      attachments.forEach((file) => {
        fd.append("attachments", file);
      });

      const res = await api.post("/admin/broadcast", fd);
      const n = res.data?.sent ?? 0;
      const w = res.data?.whatsapp;
      let lines = [`Saved to CRM for ${n} lead(s).`];
      if (w) {
        if (!w.configured) {
          lines.push("");
          lines.push("WhatsApp: not sending — connect WhatsApp in Settings (or ask your admin).");
          if (w.reason) lines.push(w.reason);
        } else {
          lines.push("");
          lines.push(
            `WhatsApp: ${w.delivered} delivered, ${w.skippedNoPhone} skipped (no/short phone), ${w.failed} failed.`
          );
          if (w.errors?.length) {
            lines.push("");
            lines.push("Sample errors:");
            w.errors.forEach((e) => lines.push(`• ${e.phone || "?"}: ${e.message}`));
          }
          const list = w.attachments;
          if (Array.isArray(list) && list.length > 0) {
            lines.push("");
            lines.push(
              `Attachments (${list.length}): ${list.map((a) => `${a.kind}: ${a.name}`).join("; ")}`
            );
          }
          lines.push("");
          lines.push("Tip: free-form messages usually only work within ~24h of the student’s last reply.");
        }
      }
      alert(lines.join("\n"));
      setMessage("");
      setAttachments([]);
      setSelectedIds([]);
      loadLeads(status);
    } catch (err) {
      alert(err.response?.data?.error || "Broadcast failed.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page-shell broadcast-page">
      <h1 className="page-title">Broadcast Message</h1>
      <p className="page-subtitle" style={{ marginBottom: 18 }}>
        Text plus up to <strong>{MAX_ATTACHMENTS}</strong> files—bulk-send to the leads you choose below.
      </p>

      {primaryReady ? (
      <div className="panel" style={{ padding: 16, marginBottom: 14 }}>
        <div className="broadcast-form-row" style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <label className="label">Lead type</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="select"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All Leads" : `${s[0].toUpperCase()}${s.slice(1)} Leads`}
              </option>
            ))}
          </select>
        </div>

        <div className="broadcast-form-row" style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, alignItems: "start" }}>
          <label className="label" style={{ paddingTop: 6 }}>Send mode</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input
                type="radio"
                checked={mode === "all_in_status"}
                onChange={() => setMode("all_in_status")}
              />
              Send to all in selected lead type ({selectableLeads.length})
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input
                type="radio"
                checked={mode === "selected_only"}
                onChange={() => setMode("selected_only")}
              />
              Send only to checked leads ({selectedIds.length} selected)
            </label>
          </div>
        </div>
      </div>
      ) : (
        <div className="panel" style={{ padding: 16, marginBottom: 14 }}>
          <div className="dashboard-skeleton-pulse" style={{ width: "45%", height: 14, marginBottom: 14 }} aria-hidden />
          <div className="dashboard-skeleton-pulse" style={{ width: "100%", height: 88, borderRadius: 10 }} aria-hidden />
        </div>
      )}

      {primaryReady ? (
      <div className="panel" style={{ padding: 16, marginBottom: 14 }}>
        <textarea
          placeholder="Write your message or caption…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="textarea"
          style={{ height: 130 }}
        />
        <div
          className="broadcast-compose-attach"
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            border: "1px dashed var(--border)",
            background: "var(--surface)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 8 }}>
            Attachments (optional, max {MAX_ATTACHMENTS})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <label className="btn btn-secondary" style={{ margin: 0, cursor: "pointer", padding: "8px 14px", fontSize: 13 }}>
              <input
                type="file"
                multiple
                style={{ display: "none" }}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              Add files
            </label>
          </div>
          {attachments.length > 0 ? (
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--text)" }}>
              {attachments.map((f, i) => (
                <li key={`${f.name}-${f.size}-${i}`} style={{ marginBottom: 4 }}>
                  {f.name}{" "}
                  <span style={{ color: "var(--text-3)", fontSize: 12 }}>({(f.size / 1024).toFixed(1)} KB)</span>{" "}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: "2px 8px", fontSize: 11, marginLeft: 6, verticalAlign: "middle" }}
                    onClick={() => removeAttachment(i)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      ) : (
        <div className="panel" style={{ padding: 16, marginBottom: 14 }}>
          <div className="dashboard-skeleton-pulse" style={{ width: "100%", height: 130, borderRadius: 10, marginBottom: 12 }} aria-hidden />
          <div className="dashboard-skeleton-pulse" style={{ width: "100%", height: 56, borderRadius: 10 }} aria-hidden />
        </div>
      )}

      {secondaryReady ? (
      <div className="panel" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Lead List ({selectableLeads.length})</h3>
          <button
            onClick={toggleAllVisible}
            disabled={selectableLeads.length === 0}
            className="btn btn-secondary"
            style={{ padding: "6px 10px", fontSize: 12 }}
          >
            Toggle all
          </button>
        </div>

        {loadingLeads ? (
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>Loading leads...</div>
        ) : selectableLeads.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>No leads in this filter.</div>
        ) : (
          <div className="list-table" style={{ maxHeight: 260, overflow: "auto" }}>
            {selectableLeads.map((lead) => (
              <label
                key={lead._id}
                className="list-row"
                style={{ gridTemplateColumns: "24px 1fr auto", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(lead._id)}
                  onChange={() => toggleLead(lead._id)}
                />
                <span style={{ fontSize: 13 }}>
                  {lead.name || "WhatsApp User"} <span style={{ color: "var(--text-3)" }}>({lead.phone})</span>
                </span>
                <span style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase" }}>{lead.status}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      ) : primaryReady ? (
        <div className="panel" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="dashboard-skeleton-pulse" style={{ width: 160, height: 16 }} aria-hidden />
            <div className="dashboard-skeleton-pulse" style={{ width: 80, height: 32, borderRadius: 8 }} aria-hidden />
          </div>
          <div className="dashboard-skeleton-pulse" style={{ width: "100%", height: 200, borderRadius: 8 }} aria-hidden />
        </div>
      ) : null}

      {secondaryReady ? (
      <button
        onClick={sendBroadcast}
        disabled={sending}
        className="btn btn-primary"
        style={{ padding: "11px 24px" }}
      >
        {sending ? "Sending..." : "Send Broadcast"}
      </button>
      ) : primaryReady ? (
        <div className="dashboard-skeleton-pulse" style={{ width: 180, height: 44, borderRadius: 10 }} aria-hidden />
      ) : null}
    </div>
  );
}
