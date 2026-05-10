import { useState, useEffect } from "react";

/**
 * Pick Excel vs CSV, then OK or Cancel (used from Leads + Dashboard).
 */
export default function ExportLeadsModal({ open, onClose, onConfirm, exporting }) {
  const [format, setFormat] = useState("xlsx");

  useEffect(() => {
    if (open) setFormat("xlsx");
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !exporting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, exporting, onClose]);

  if (!open) return null;

  const backdropClick = (e) => {
    if (e.target === e.currentTarget && !exporting) onClose();
  };

  const handleOk = () => {
    onConfirm(format);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgb(0 0 0 / 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={backdropClick}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-leads-modal-title"
        style={{
          background: "var(--surface)",
          borderRadius: 14,
          border: "1px solid var(--border)",
          padding: "22px 24px",
          maxWidth: 420,
          width: "100%",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="export-leads-modal-title"
          style={{
            margin: "0 0 8px",
            fontSize: 17,
            fontWeight: 700,
            fontFamily: "var(--font-heading)",
            color: "var(--text)",
          }}
        >
          Export leads
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>
          Choose a format, then tap OK to download.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              cursor: exporting ? "default" : "pointer",
              fontSize: 14,
              color: "var(--text)",
              lineHeight: 1.45,
            }}
          >
            <input
              type="radio"
              name="export-leads-format"
              checked={format === "xlsx"}
              onChange={() => setFormat("xlsx")}
              disabled={exporting}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>Excel</strong> (.xlsx) — wider columns, best for Excel / WPS
            </span>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              cursor: exporting ? "default" : "pointer",
              fontSize: 14,
              color: "var(--text)",
              lineHeight: 1.45,
            }}
          >
            <input
              type="radio"
              name="export-leads-format"
              checked={format === "csv"}
              onChange={() => setFormat("csv")}
              disabled={exporting}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>CSV</strong> (.csv) — plain text, works everywhere
            </span>
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={exporting}>
            Cancel
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleOk} disabled={exporting}>
            {exporting ? "Exporting…" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
