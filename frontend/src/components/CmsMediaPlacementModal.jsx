import { useEffect, useMemo, useState } from "react";
import CmsMediaThumb, { isVideoMime } from "./CmsMediaThumb";

/** Mini homepage wireframe — click a zone to assign the open media file. */
function HomepageWireframe({ activeZone, onZoneClick, content, media, disabledZones }) {
  const isVid = isVideoMime(media?.mime, media?.url);
  const heroUrl = isVid ? content?.hero?.heroVideo : content?.hero?.heroImage;
  const heroActive = activeZone === "hero";
  const showcaseActive = activeZone === "showcase";
  const programsActive = activeZone?.startsWith("program-");

  const zoneStyle = (active, enabled) => ({
    position: "relative",
    borderRadius: 6,
    border: active ? "2px solid var(--accent)" : "2px dashed rgba(255,255,255,.35)",
    background: active ? "rgba(212,168,67,.25)" : enabled ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.04)",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.45,
    transition: "border-color .15s, background .15s",
    overflow: "hidden",
    minHeight: 0,
  });

  const labelStyle = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 9,
    fontWeight: 700,
    textAlign: "center",
    padding: 4,
    color: "rgba(255,255,255,.92)",
    lineHeight: 1.25,
    pointerEvents: "none",
  };

  const programItems = content?.programs?.items || [];
  const showcaseCount = (content?.videoGallery?.items || []).length;

  return (
    <div
      style={{
        background: "linear-gradient(180deg, #0a1f44 0%, #132952 100%)",
        borderRadius: 12,
        padding: 10,
        color: "#fff",
        fontSize: 10,
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.65, marginBottom: 8 }}>
        Homepage preview map
      </div>
      {/* Nav */}
      <div style={{ height: 14, background: "rgba(0,0,0,.35)", borderRadius: 4, marginBottom: 6, display: "flex", alignItems: "center", padding: "0 6px", gap: 4 }}>
        <span style={{ width: 28, height: 4, background: "rgba(255,255,255,.3)", borderRadius: 2 }} />
        <span style={{ flex: 1 }} />
        <span style={{ width: 18, height: 4, background: "rgba(255,255,255,.2)", borderRadius: 2 }} />
      </div>
      {/* Hero */}
      <button
        type="button"
        disabled={disabledZones.hero}
        onClick={() => !disabledZones.hero && onZoneClick(isVid ? "heroVideo" : "heroImage")}
        style={{
          ...zoneStyle(heroActive, !disabledZones.hero),
          height: 72,
          width: "100%",
          marginBottom: 6,
          padding: 0,
        }}
      >
        {heroUrl && (
          <div style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
            <CmsMediaThumb
              media={{
                url: heroUrl,
                mime: isVid ? "video/" : "image/",
                storage: String(heroUrl).includes("/cms/") ? "r2" : "",
              }}
              height="100%"
              style={{ height: "100%" }}
            />
          </div>
        )}
        <span style={labelStyle}>
          {isVid ? "Hero video" : "Hero image"}
          <br />
          <span style={{ fontWeight: 500, opacity: 0.85 }}>Top banner</span>
        </span>
      </button>
      {/* About placeholder */}
      <div style={{ height: 28, background: "rgba(255,255,255,.06)", borderRadius: 4, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, opacity: 0.5 }}>
        About (text only)
      </div>
      {/* Showcase */}
      <button
        type="button"
        disabled={disabledZones.showcase}
        onClick={() => !disabledZones.showcase && onZoneClick("showcase")}
        style={{
          ...zoneStyle(showcaseActive, !disabledZones.showcase),
          height: 52,
          width: "100%",
          marginBottom: 6,
          padding: 0,
        }}
      >
        <div style={{ position: "absolute", inset: 6, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, pointerEvents: "none" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ background: "rgba(255,255,255,.12)", borderRadius: 3, minHeight: 20 }} />
          ))}
        </div>
        <span style={labelStyle}>
          Photos &amp; videos grid
          {showcaseCount > 0 ? ` (${showcaseCount} live)` : ""}
        </span>
      </button>
      {/* Programs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
        {programItems.slice(0, 3).map((p, i) => {
          const zone = `program-${i}`;
          const disabled = disabledZones[`program-${i}`];
          return (
            <button
              key={p.id || i}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onZoneClick(zone, i)}
              style={{
                ...zoneStyle(programsActive && activeZone === zone, !disabled),
                height: 48,
                padding: 0,
              }}
            >
              {p.image && (
                <div style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
                  <CmsMediaThumb media={{ url: p.image, mime: "image/", storage: String(p.image).includes("/cms/") ? "r2" : "" }} height="100%" style={{ height: "100%" }} />
                </div>
              )}
              <span style={{ ...labelStyle, fontSize: 8 }}>
                {p.name || `Program ${i + 1}`}
              </span>
            </button>
          );
        })}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 9, opacity: 0.55, lineHeight: 1.4 }}>
        Click a highlighted area to place this file there. Save website after confirming.
      </p>
    </div>
  );
}

function slotDescription(zone, content, programIndex) {
  if (zone === "heroImage") {
    return {
      title: "Hero background image",
      body: "Shows full-width behind the main headline at the very top of the homepage. Best: wide landscape photo (1920×1080 or larger).",
      path: "Top → Hero section",
    };
  }
  if (zone === "heroVideo") {
    return {
      title: "Hero background video",
      body: "Plays silently behind the headline. Replaces the hero image when set. MP4 or WebM, keep file size reasonable.",
      path: "Top → Hero section",
    };
  }
  if (zone === "showcase") {
    const n = (content?.videoGallery?.items || []).length;
    return {
      title: "Media showcase grid",
      body: `Adds this file to the photo & video grid after the About section. Images and videos can mix in the same grid.${n ? ` Currently ${n} item(s) live.` : ""}`,
      path: "Middle → Photos & videos",
    };
  }
  const p = content?.programs?.items?.[programIndex];
  return {
    title: `Program card: ${p?.name || "Course"}`,
    body: "Adds this photo to the program card slideshow (rotates every 5 seconds). You can add up to several images per program — images only, not videos.",
    path: "Lower → Programs section",
  };
}

/**
 * Popup: pick where an uploaded image/video appears on the public website.
 */
export default function CmsMediaPlacementModal({ open, media, content, onClose, onPlace }) {
  const [hoverZone, setHoverZone] = useState(null);
  const [pickedZone, setPickedZone] = useState(null);
  const [programIndex, setProgramIndex] = useState(null);

  const isVid = isVideoMime(media?.mime, media?.url);

  const disabledZones = useMemo(
    () => ({
      hero: false,
      showcase: false,
      ...(content?.programs?.items || []).reduce((acc, _, i) => {
        acc[`program-${i}`] = isVid;
        return acc;
      }, {}),
    }),
    [content?.programs?.items, isVid]
  );

  useEffect(() => {
    if (!open) {
      setHoverZone(null);
      setPickedZone(null);
      setProgramIndex(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !media) return null;

  const activeZone = pickedZone || hoverZone;
  const desc = pickedZone ? slotDescription(pickedZone, content, programIndex) : null;

  function handleZoneClick(zone, progIdx) {
    if (zone.startsWith("program-") && isVid) return;
    setPickedZone(zone);
    setProgramIndex(typeof progIdx === "number" ? progIdx : null);
    setHoverZone(zone);
  }

  function handleConfirm() {
    if (!pickedZone) return;
    onPlace({ zone: pickedZone, programIndex, media });
    onClose();
  }

  const backdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="cms-placement-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgb(0 0 0 / 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: 16,
      }}
      onClick={backdropClick}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cms-placement-title"
        className="cms-placement-dialog"
        style={{
          background: "var(--surface)",
          borderRadius: 16,
          border: "1px solid var(--border)",
          maxWidth: 520,
          width: "100%",
          maxHeight: "min(92vh, 720px)",
          overflow: "auto",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "18px 20px 0" }}>
          <h2 id="cms-placement-title" style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800 }}>
            Where should this show?
          </h2>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-3)", lineHeight: 1.5 }}>
            Tap a zone on the mini homepage. If you put the file there, it will appear on the live site after you save.
          </p>
        </div>

        <div style={{ padding: "0 20px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 88, flexShrink: 0, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
            <CmsMediaThumb media={media} height={72} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, wordBreak: "break-word" }}>{media.name || "Uploaded file"}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              {isVid ? "Video" : "Image"} · {media.mime || "media"}
            </div>
          </div>
        </div>

        <div style={{ padding: "0 16px 16px" }}>
          <HomepageWireframe
            activeZone={activeZone}
            onZoneClick={handleZoneClick}
            content={content}
            media={media}
            disabledZones={disabledZones}
          />
        </div>

        {desc && (
          <div
            style={{
              margin: "0 16px 16px",
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--accent-light)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 4 }}>{desc.path}</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{desc.title}</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55 }}>{desc.body}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", padding: "12px 20px 18px", borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 16px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!pickedZone}
            onClick={handleConfirm}
            style={{
              padding: "9px 18px",
              borderRadius: 10,
              border: "none",
              background: pickedZone ? "var(--accent)" : "var(--surface-2)",
              color: pickedZone ? "#fff" : "var(--text-3)",
              fontWeight: 700,
              fontSize: 13,
              cursor: pickedZone ? "pointer" : "not-allowed",
            }}
          >
            Use this spot
          </button>
        </div>
      </div>
    </div>
  );
}

/** Read-only site map (no file selected) — explains all placement zones. */
export function CmsPlacementGuideModal({ open, content, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const rows = [
    { zone: "Hero image", accepts: "Images only", where: "Top banner behind headline", current: content?.hero?.heroImage ? "Set" : "Empty" },
    { zone: "Hero video", accepts: "Videos only", where: "Top banner (overrides hero image)", current: content?.hero?.heroVideo ? "Set" : "Empty" },
    { zone: "Media showcase", accepts: "Images + videos", where: "Grid after About section", current: `${(content?.videoGallery?.items || []).length} file(s)` },
    ...(content?.programs?.items || []).map((p) => ({
      zone: `Program: ${p.name || p.id}`,
      accepts: "Images only",
      where: "Program card background",
      current: p.image ? "Set" : "Empty",
    })),
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgb(0 0 0 / 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1050,
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: "var(--surface)",
          borderRadius: 14,
          border: "1px solid var(--border)",
          maxWidth: 480,
          width: "100%",
          maxHeight: "85vh",
          overflow: "auto",
          padding: "20px 22px",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800 }}>Website placement map</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-3)", lineHeight: 1.5 }}>
          Each upload can go to one or more of these spots. Nothing appears publicly until you click <strong>Save website</strong>.
        </p>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid var(--border)" }}>
              <th style={{ padding: "8px 6px", fontWeight: 700 }}>Spot</th>
              <th style={{ padding: "8px 6px", fontWeight: 700 }}>Accepts</th>
              <th style={{ padding: "8px 6px", fontWeight: 700 }}>On site</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.zone} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 6px", verticalAlign: "top" }}>
                  <div style={{ fontWeight: 700 }}>{r.zone}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{r.where}</div>
                </td>
                <td style={{ padding: "10px 6px", verticalAlign: "top", color: "var(--text-2)" }}>{r.accepts}</td>
                <td style={{ padding: "10px 6px", verticalAlign: "top", fontWeight: 600, color: r.current === "Empty" ? "var(--text-3)" : "var(--ready)" }}>
                  {r.current}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 18px",
              borderRadius: 10,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
