import { useCallback, useEffect, useState } from "react";
import api, { invalidateCachedGet } from "../api/api";
import SkeletonPulse from "../components/SkeletonPulse";
import CmsMediaThumb, { isVideoMime } from "../components/CmsMediaThumb";
import CmsMediaPlacementModal, { CmsPlacementGuideModal } from "../components/CmsMediaPlacementModal";

const TABS = [
  { id: "general", label: "General & SEO" },
  { id: "hero", label: "Hero & video" },
  { id: "about", label: "About" },
  { id: "programs", label: "Programs" },
  { id: "faq", label: "FAQ" },
  { id: "contact", label: "Contact" },
  { id: "footer", label: "Footer" },
  { id: "media", label: "Media library" },
  { id: "videos", label: "Media showcase" },
];

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{hint}</span>}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  font: "inherit",
  fontSize: 14,
  background: "var(--surface)",
  color: "var(--text)",
};

function getMediaPlacements(content, url) {
  if (!url) return [];
  const places = [];
  if (content?.hero?.heroVideo === url) places.push("Hero video");
  if (content?.hero?.heroImage === url) places.push("Hero image");
  if ((content?.videoGallery?.items || []).some((v) => v.url === url)) places.push("Media showcase");
  (content?.programs?.items || []).forEach((p) => {
    if (p.image === url) places.push(`Program: ${p.name || p.id || "course"}`);
  });
  return places;
}

function putFileWithProgress(uploadUrl, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr);
      else reject(new Error(`Cloudflare upload failed (${xhr.status})`));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(file);
  });
}

function clearMediaFromSite(content, url) {
  const next = JSON.parse(JSON.stringify(content || {}));
  if (next.hero?.heroVideo === url) next.hero.heroVideo = "";
  if (next.hero?.heroImage === url) next.hero.heroImage = "";
  if (Array.isArray(next.videoGallery?.items)) {
    next.videoGallery.items = next.videoGallery.items.filter((v) => v.url !== url);
  }
  if (Array.isArray(next.programs?.items)) {
    next.programs.items = next.programs.items.map((p) =>
      p.image === url ? { ...p, image: "" } : p
    );
  }
  return next;
}

const mediaBtnStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--accent)",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  textAlign: "left",
};

export default function WebsiteCmsDashboard() {
  const [tab, setTab] = useState("general");
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [storageInfo, setStorageInfo] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [placementMedia, setPlacementMedia] = useState(null);
  const [showPlacementGuide, setShowPlacementGuide] = useState(false);

  const sitePreviewUrl = "https://www.nextstepinternationals.com/";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    invalidateCachedGet("/admin/website-cms");
    try {
      const res = await api.get("/admin/website-cms");
      setContent(res.data?.content || {});
      setUpdatedAt(res.data?.updatedAt || null);
    } catch (err) {
      setError(err?.response?.data?.error || "Could not load website content.");
      setContent(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api
      .get("/admin/website-cms/storage")
      .then((res) => setStorageInfo(res.data || null))
      .catch(() => setStorageInfo(null));
  }, [load]);

  function patch(path, value) {
    setContent((prev) => {
      const next = JSON.parse(JSON.stringify(prev || {}));
      const keys = path.split(".");
      let cur = next;
      for (let i = 0; i < keys.length - 1; i += 1) {
        if (!cur[keys[i]] || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await api.put("/admin/website-cms", { content });
      setContent(res.data?.content || content);
      setMessage(res.data?.message || "Website saved. Refresh the homepage to see changes.");
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Save failed.";
      setError(msg === "Failed to fetch" ? "Save failed — check you are logged in and api.nextstepinternationals.com is online." : msg);
    } finally {
      setSaving(false);
    }
  }

  async function uploadMedia(file) {
    if (!file) return;
    setUploading(true);
    setUploadPct(0);
    setError("");
    try {
      const useR2 = storageInfo?.storage === "r2";
      let item;
      const mime = file.type || "application/octet-stream";

      const uploadViaServer = async () => {
        const fd = new FormData();
        fd.append("file", file);
        const res = await api.post("/admin/website-cms/media", fd, {
          timeout: 300000,
          onUploadProgress: (e) => {
            if (e.total) setUploadPct(Math.min(100, Math.round((e.loaded / e.total) * 100)));
          },
        });
        return res.data?.media;
      };

      if (useR2) {
        try {
          setUploadPct(2);
          const presign = await api.post("/admin/website-cms/media/presign", {
            name: file.name,
            mime,
            size: file.size,
          });
          const { uploadUrl, key, publicUrl, headers } = presign.data || {};
          if (!uploadUrl || !key) throw new Error("Could not start Cloudflare upload.");

          await putFileWithProgress(
            uploadUrl,
            file,
            headers?.["Content-Type"] || mime,
            setUploadPct
          );

          setUploadPct(98);
          const done = await api.post("/admin/website-cms/media/complete", {
            key,
            name: file.name,
            mime,
            size: file.size,
          });
          item = done.data?.media;
          if (!item && publicUrl) {
            item = { url: publicUrl, name: file.name, key, storage: "r2", id: key, mime };
          }
          setUploadPct(100);
        } catch (directErr) {
          console.warn("R2 direct upload failed, using server:", directErr?.message);
          setUploadPct(0);
          item = await uploadViaServer();
        }
      } else {
        item = await uploadViaServer();
      }

      if (item) {
        setContent((prev) => ({
          ...prev,
          media: [item, ...(prev?.media || []).filter((m) => m.url !== item.url)],
        }));
        setMessage(
          `Uploaded ${item.name}. Pick where it shows on the homepage, then Save website.`
        );
        setPlacementMedia(item);
        invalidateCachedGet("/admin/website-cms");
      }
    } catch (err) {
      const raw = err?.response?.data?.error || err?.message || "Upload failed.";
      setError(
        raw === "Failed to fetch" || /failed to fetch/i.test(raw)
          ? "Upload failed — check R2 CORS for api.nextstepinternationals.com or retry (server fallback runs automatically)."
          : raw
      );
    } finally {
      setUploading(false);
      setTimeout(() => setUploadPct(0), 1200);
    }
  }

  async function deleteMediaItem(m) {
    if (!m?.url) return;
    const label = m.name || "this file";
    if (!window.confirm(`Delete "${label}" from Cloudflare/library? This removes it from the website if published.`)) {
      return;
    }
    setError("");
    try {
      const id = encodeURIComponent(m.id || m.key || m.url);
      const storage = m.storage === "r2" ? "r2" : "";
      const key = m.key || m.id || "";
      await api.delete(
        `/admin/website-cms/media/${id}${storage ? `?storage=r2&key=${encodeURIComponent(key)}` : ""}`
      );
      setContent((prev) => {
        const cleared = clearMediaFromSite(prev, m.url);
        return {
          ...cleared,
          media: (cleared.media || []).filter((x) => x.url !== m.url),
        };
      });
      setMessage(`Deleted ${label}. Click Save website to update the live site.`);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Delete failed.");
    }
  }

  function removeMediaFromSite(m) {
    setContent((prev) => clearMediaFromSite(prev, m.url));
    setMessage(`Removed ${m.name || "file"} from website slots. Click Save website to apply.`);
  }

  function addToShowcase(m) {
    setContent((prev) => {
      const items = [...(prev?.videoGallery?.items || [])];
      if (items.some((v) => v.url === m.url)) {
        setMessage("Already in media showcase.");
        return prev;
      }
      items.push({
        id: m.id || m.key || m.url,
        url: m.url,
        title: m.name || (isVideoMime(m.mime, m.url) ? "Student video" : "Photo"),
        mime: m.mime || "",
      });
      return {
        ...prev,
        videoGallery: { ...(prev?.videoGallery || {}), enabled: true, items },
      };
    });
    setMessage(`Added to homepage media showcase — click Save website.`);
  }

  function setProgramImage(programIndex, url) {
    setContent((prev) => {
      const items = [...(prev?.programs?.items || [])];
      if (!items[programIndex]) return prev;
      const progName = items[programIndex].name || "Program";
      items[programIndex] = { ...items[programIndex], image: url };
      setMessage(`Set ${progName} card image — click Save website.`);
      return { ...prev, programs: { ...(prev.programs || {}), items } };
    });
  }

  function handleMediaPlacement({ zone, programIndex, media: m }) {
    if (!m?.url) return;
    if (zone === "heroImage") {
      patch("hero.heroImage", m.url);
      setMessage(`"${m.name || "Image"}" → hero background. Save website to publish.`);
    } else if (zone === "heroVideo") {
      patch("hero.heroVideo", m.url);
      setMessage(`"${m.name || "Video"}" → hero video. Save website to publish.`);
    } else if (zone === "showcase") {
      addToShowcase(m);
    } else if (zone.startsWith("program-") && typeof programIndex === "number") {
      setProgramImage(programIndex, m.url);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        <SkeletonPulse style={{ width: 320, height: 28, marginBottom: 16 }} />
        <SkeletonPulse style={{ height: 400, borderRadius: 14 }} />
      </div>
    );
  }

  if (!content) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
        {error || "No content loaded."}
      </div>
    );
  }

  const c = content;

  return (
    <div className="page-shell website-cms-page" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 20px 48px" }}>
      <CmsMediaPlacementModal
        open={Boolean(placementMedia)}
        media={placementMedia}
        content={c}
        onClose={() => setPlacementMedia(null)}
        onPlace={handleMediaPlacement}
      />
      <CmsPlacementGuideModal open={showPlacementGuide} content={c} onClose={() => setShowPlacementGuide(false)} />
      <div className="cms-header">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>Website CMS</h1>
          <p style={{ color: "var(--text-3)", fontSize: 14, maxWidth: 520 }}>
            Edit your public site at{" "}
            <a href={sitePreviewUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
              nextstepinternationals.com
            </a>
            . Changes apply after you save — no code or redeploy needed.
          </p>
          {updatedAt && (
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
              Last saved: {new Date(updatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="cms-header-actions">
          <a
            href={sitePreviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              fontWeight: 600,
              fontSize: 13,
              textDecoration: "none",
              color: "var(--text)",
            }}
          >
            Preview site ↗
          </a>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save website"}
          </button>
        </div>
      </div>

      {message && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "rgba(5,150,105,.1)",
            border: "1px solid rgba(5,150,105,.25)",
            color: "#047857",
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {message}
        </div>
      )}
      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "rgba(220,38,38,.08)",
            border: "1px solid rgba(220,38,38,.2)",
            color: "#b91c1c",
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      <div className="cms-layout">
        <nav className="cms-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? "var(--accent)" : "transparent",
                color: tab === t.id ? "#fff" : "var(--text)",
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="panel cms-panel">
          {tab === "general" && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>General & SEO</h2>
              <Field label="Page title (browser tab & Google)">
                <input style={inputStyle} value={c.seo?.title || ""} onChange={(e) => patch("seo.title", e.target.value)} />
              </Field>
              <Field label="Meta description">
                <textarea
                  style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
                  value={c.seo?.description || ""}
                  onChange={(e) => patch("seo.description", e.target.value)}
                />
              </Field>
              <Field label="Brand name">
                <input style={inputStyle} value={c.brand?.name || ""} onChange={(e) => patch("brand.name", e.target.value)} />
              </Field>
              <Field label="Brand tagline">
                <input style={inputStyle} value={c.brand?.tagline || ""} onChange={(e) => patch("brand.tagline", e.target.value)} />
              </Field>
              <Field label="Notice bar" hint="Top banner on homepage">
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={c.notice?.enabled !== false}
                    onChange={(e) => patch("notice.enabled", e.target.checked)}
                  />
                  Show notice bar
                </label>
                <input style={inputStyle} value={c.notice?.text || ""} onChange={(e) => patch("notice.text", e.target.value)} />
              </Field>
              <div className="cms-two-col">
                <Field label="Notice link text">
                  <input style={inputStyle} value={c.notice?.linkText || ""} onChange={(e) => patch("notice.linkText", e.target.value)} />
                </Field>
                <Field label="Notice link URL">
                  <input style={inputStyle} value={c.notice?.linkUrl || ""} onChange={(e) => patch("notice.linkUrl", e.target.value)} />
                </Field>
              </div>
            </>
          )}

          {tab === "hero" && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Hero section</h2>
              <Field label="Pill text">
                <input style={inputStyle} value={c.hero?.pill || ""} onChange={(e) => patch("hero.pill", e.target.value)} />
              </Field>
              <Field label="Headline (HTML allowed for &lt;span&gt; highlights)" hint='Example: Your Gateway to &lt;span&gt;Higher Education&lt;/span&gt; Abroad.'>
                <textarea
                  style={{ ...inputStyle, minHeight: 64 }}
                  value={c.hero?.title || ""}
                  onChange={(e) => patch("hero.title", e.target.value)}
                />
              </Field>
              <Field label="Description">
                <textarea
                  style={{ ...inputStyle, minHeight: 90 }}
                  value={c.hero?.description || ""}
                  onChange={(e) => patch("hero.description", e.target.value)}
                />
              </Field>
              <Field label="Hero background image URL" hint="Path like images/heros/hero.webp or uploaded /uploads/website-cms/…">
                <input style={inputStyle} value={c.hero?.heroImage || ""} onChange={(e) => patch("hero.heroImage", e.target.value)} />
              </Field>
              <Field label="Hero background video URL (optional)" hint="MP4/WebM — overrides image when set. Upload in Media tab first.">
                <input style={inputStyle} value={c.hero?.heroVideo || ""} onChange={(e) => patch("hero.heroVideo", e.target.value)} />
              </Field>
              <div className="cms-two-col">
                <Field label="Primary button text">
                  <input style={inputStyle} value={c.hero?.ctaPrimary?.text || ""} onChange={(e) => patch("hero.ctaPrimary.text", e.target.value)} />
                </Field>
                <Field label="Primary button URL">
                  <input style={inputStyle} value={c.hero?.ctaPrimary?.url || ""} onChange={(e) => patch("hero.ctaPrimary.url", e.target.value)} />
                </Field>
                <Field label="Secondary button text">
                  <input style={inputStyle} value={c.hero?.ctaSecondary?.text || ""} onChange={(e) => patch("hero.ctaSecondary.text", e.target.value)} />
                </Field>
                <Field label="Secondary button URL" hint='Use "whatsapp" for auto WhatsApp link'>
                  <input style={inputStyle} value={c.hero?.ctaSecondary?.url || ""} onChange={(e) => patch("hero.ctaSecondary.url", e.target.value)} />
                </Field>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "20px 0 12px" }}>Hero stats</h3>
              {(c.hero?.stats || []).map((s, i) => (
                <div key={i} className="cms-stat-row">
                  <input
                    style={inputStyle}
                    placeholder="500+"
                    value={s.value || ""}
                    onChange={(e) => {
                      const stats = [...(c.hero?.stats || [])];
                      stats[i] = { ...stats[i], value: e.target.value };
                      patch("hero.stats", stats);
                    }}
                  />
                  <input
                    style={inputStyle}
                    placeholder="Label"
                    value={s.label || ""}
                    onChange={(e) => {
                      const stats = [...(c.hero?.stats || [])];
                      stats[i] = { ...stats[i], label: e.target.value };
                      patch("hero.stats", stats);
                    }}
                  />
                </div>
              ))}
            </>
          )}

          {tab === "about" && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>About section</h2>
              <Field label="Eyebrow">
                <input style={inputStyle} value={c.about?.eyebrow || ""} onChange={(e) => patch("about.eyebrow", e.target.value)} />
              </Field>
              <Field label="Heading (HTML line breaks OK)">
                <textarea style={{ ...inputStyle, minHeight: 64 }} value={c.about?.title || ""} onChange={(e) => patch("about.title", e.target.value)} />
              </Field>
              <Field label="Lead paragraph">
                <textarea style={{ ...inputStyle, minHeight: 90 }} value={c.about?.lead || ""} onChange={(e) => patch("about.lead", e.target.value)} />
              </Field>
              {(c.about?.cards || []).map((card, i) => (
                <div key={i} style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>Card {i + 1}</div>
                  <Field label="Icon (emoji)">
                    <input
                      style={inputStyle}
                      value={card.icon || ""}
                      onChange={(e) => {
                        const cards = [...(c.about?.cards || [])];
                        cards[i] = { ...cards[i], icon: e.target.value };
                        patch("about.cards", cards);
                      }}
                    />
                  </Field>
                  <Field label="Title">
                    <input
                      style={inputStyle}
                      value={card.title || ""}
                      onChange={(e) => {
                        const cards = [...(c.about?.cards || [])];
                        cards[i] = { ...cards[i], title: e.target.value };
                        patch("about.cards", cards);
                      }}
                    />
                  </Field>
                  <Field label="Text">
                    <textarea
                      style={{ ...inputStyle, minHeight: 72 }}
                      value={card.text || ""}
                      onChange={(e) => {
                        const cards = [...(c.about?.cards || [])];
                        cards[i] = { ...cards[i], text: e.target.value };
                        patch("about.cards", cards);
                      }}
                    />
                  </Field>
                </div>
              ))}
            </>
          )}

          {tab === "programs" && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Programs</h2>
              <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16 }}>
                Card images: upload in <strong>Media library</strong>, then click &quot;Set program image&quot; on each file.
              </p>
              <Field label="Eyebrow">
                <input style={inputStyle} value={c.programs?.eyebrow || ""} onChange={(e) => patch("programs.eyebrow", e.target.value)} />
              </Field>
              <Field label="Heading">
                <input style={inputStyle} value={c.programs?.title || ""} onChange={(e) => patch("programs.title", e.target.value)} />
              </Field>
              <Field label="Lead">
                <input style={inputStyle} value={c.programs?.lead || ""} onChange={(e) => patch("programs.lead", e.target.value)} />
              </Field>
              {(c.programs?.items || []).map((item, i) => (
                <div key={item.id || i} style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>{item.name || `Program ${i + 1}`}</div>
                  {item.image ? (
                    <div style={{ marginBottom: 12, maxWidth: 280, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
                      <CmsMediaThumb media={{ url: item.image, mime: "image/", storage: item.image.includes("cms/") ? "r2" : "" }} height={120} />
                      <div style={{ fontSize: 11, padding: "6px 10px", color: "var(--text-3)", wordBreak: "break-all" }}>{item.image}</div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12 }}>No image selected — pick from Media library.</p>
                  )}
                  <Field label="Name">
                    <input
                      style={inputStyle}
                      value={item.name || ""}
                      onChange={(e) => {
                        const items = [...(c.programs?.items || [])];
                        items[i] = { ...items[i], name: e.target.value };
                        patch("programs.items", items);
                      }}
                    />
                  </Field>
                  <Field label="Badge">
                    <input
                      style={inputStyle}
                      value={item.badge || ""}
                      onChange={(e) => {
                        const items = [...(c.programs?.items || [])];
                        items[i] = { ...items[i], badge: e.target.value };
                        patch("programs.items", items);
                      }}
                    />
                  </Field>
                  <div className="cms-two-col" style={{ gap: 10 }}>
                    <Field label="Fee">
                      <input
                        style={inputStyle}
                        value={item.fee || ""}
                        onChange={(e) => {
                          const items = [...(c.programs?.items || [])];
                          items[i] = { ...items[i], fee: e.target.value };
                          patch("programs.items", items);
                        }}
                      />
                    </Field>
                    <Field label="Image URL (or pick from Media library)">
                      <input
                        style={inputStyle}
                        value={item.image || ""}
                        onChange={(e) => {
                          const items = [...(c.programs?.items || [])];
                          items[i] = { ...items[i], image: e.target.value };
                          patch("programs.items", items);
                        }}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    style={{ ...mediaBtnStyle, marginTop: 4 }}
                    onClick={() => setTab("media")}
                  >
                    Open Media library to choose image
                  </button>
                </div>
              ))}
            </>
          )}

          {tab === "faq" && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>FAQ</h2>
              <Field label="Eyebrow">
                <input style={inputStyle} value={c.faq?.eyebrow || ""} onChange={(e) => patch("faq.eyebrow", e.target.value)} />
              </Field>
              <Field label="Heading">
                <input style={inputStyle} value={c.faq?.title || ""} onChange={(e) => patch("faq.title", e.target.value)} />
              </Field>
              {(c.faq?.items || []).map((item, i) => (
                <div key={i} style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 16 }}>
                  <Field label={`Question ${i + 1}`}>
                    <input
                      style={inputStyle}
                      value={item.q || ""}
                      onChange={(e) => {
                        const items = [...(c.faq?.items || [])];
                        items[i] = { ...items[i], q: e.target.value };
                        patch("faq.items", items);
                      }}
                    />
                  </Field>
                  <Field label="Answer">
                    <textarea
                      style={{ ...inputStyle, minHeight: 72 }}
                      value={item.a || ""}
                      onChange={(e) => {
                        const items = [...(c.faq?.items || [])];
                        items[i] = { ...items[i], a: e.target.value };
                        patch("faq.items", items);
                      }}
                    />
                  </Field>
                </div>
              ))}
              <button
                type="button"
                style={{ marginTop: 12, padding: "8px 14px", borderRadius: 8, border: "1px dashed var(--border)", background: "transparent", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
                onClick={() => patch("faq.items", [...(c.faq?.items || []), { q: "", a: "" }])}
              >
                + Add FAQ
              </button>
            </>
          )}

          {tab === "contact" && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Contact & WhatsApp</h2>
              <Field label="WhatsApp number (digits only, with country code)">
                <input style={inputStyle} value={c.contact?.whatsapp || ""} onChange={(e) => patch("contact.whatsapp", e.target.value)} />
              </Field>
              <Field label="WhatsApp display text">
                <input style={inputStyle} value={c.contact?.whatsappDisplay || ""} onChange={(e) => patch("contact.whatsappDisplay", e.target.value)} />
              </Field>
              <Field label="Email">
                <input style={inputStyle} value={c.contact?.email || ""} onChange={(e) => patch("contact.email", e.target.value)} />
              </Field>
              <Field label="Facebook page URL">
                <input style={inputStyle} value={c.contact?.facebook || ""} onChange={(e) => patch("contact.facebook", e.target.value)} />
              </Field>
            </>
          )}

          {tab === "footer" && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Footer</h2>
              <Field label="About blurb">
                <textarea
                  style={{ ...inputStyle, minHeight: 100 }}
                  value={c.footer?.about || ""}
                  onChange={(e) => patch("footer.about", e.target.value)}
                />
              </Field>
            </>
          )}

          {tab === "videos" && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Media showcase (homepage)</h2>
              <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16 }}>
                Photos and videos you pick in Media library appear in a responsive grid on the site (between About and Programs).
                The section stays hidden until at least one file is added and you click <strong>Save website</strong>.
              </p>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={c.videoGallery?.enabled !== false}
                  onChange={(e) => patch("videoGallery.enabled", e.target.checked)}
                />
                Show this section on website
              </label>
              <Field label="Section eyebrow">
                <input
                  style={inputStyle}
                  value={c.videoGallery?.eyebrow || ""}
                  onChange={(e) => patch("videoGallery.eyebrow", e.target.value)}
                />
              </Field>
              <Field label="Section heading">
                <input
                  style={inputStyle}
                  value={c.videoGallery?.title || ""}
                  onChange={(e) => patch("videoGallery.title", e.target.value)}
                />
              </Field>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "20px 0 10px" }}>
                Live on website ({(c.videoGallery?.items || []).length})
              </h3>
              {(c.videoGallery?.items || []).length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-3)" }}>Nothing selected yet — upload in Media library and click &quot;Show on homepage showcase&quot;.</p>
              ) : (
                (c.videoGallery?.items || []).map((v, i) => (
                  <div key={v.url || i} className="cms-showcase-row">
                    <div className="cms-showcase-thumb">
                      <CmsMediaThumb
                        media={{
                          url: v.url,
                          mime: v.mime || "",
                          key: v.id,
                          storage: String(v.url || "").includes("/cms/") ? "r2" : "",
                        }}
                        height={68}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        style={{ ...inputStyle, marginBottom: 6 }}
                        value={v.title || ""}
                        placeholder="Video title"
                        onChange={(e) => {
                          const items = [...(c.videoGallery?.items || [])];
                          items[i] = { ...items[i], title: e.target.value };
                          patch("videoGallery.items", items);
                        }}
                      />
                      <div style={{ fontSize: 11, color: "var(--text-3)", wordBreak: "break-all" }}>{v.url}</div>
                    </div>
                    <button
                      type="button"
                      style={{ fontSize: 12, fontWeight: 600, color: "#b91c1c", background: "none", border: "none", cursor: "pointer" }}
                      onClick={() => {
                        const items = (c.videoGallery?.items || []).filter((_, j) => j !== i);
                        patch("videoGallery.items", items);
                        setMessage("Removed from gallery — Save website.");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </>
          )}

          {tab === "media" && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Media library</h2>
              <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 8 }}>
                Upload files to Cloudflare R2. Use <strong>Where to show?</strong> on each file to pick the exact homepage spot.
              </p>
              <button
                type="button"
                onClick={() => setShowPlacementGuide(true)}
                style={{
                  marginBottom: 16,
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  color: "var(--accent)",
                }}
              >
                View website placement map
              </button>
              {storageInfo ? (
                <p
                  style={{
                    fontSize: 12,
                    marginBottom: 16,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: storageInfo.storage === "r2" ? "var(--ready-bg)" : "var(--surface-2)",
                    color: storageInfo.storage === "r2" ? "var(--ready)" : "var(--text-3)",
                  }}
                >
                  Storage:{" "}
                  <strong>{storageInfo.storage === "r2" ? "Cloudflare R2" : "Render disk (temporary)"}</strong>
                  {storageInfo.r2?.publicBaseUrl ? ` · ${storageInfo.r2.publicBaseUrl}` : ""}
                </p>
              ) : null}
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 16px",
                  borderRadius: 10,
                  background: "var(--accent)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: uploading ? "wait" : "pointer",
                  marginBottom: 20,
                }}
              >
                {uploading ? "Uploading…" : "Upload image or video"}
                <input
                  type="file"
                  accept="image/*,video/*,.pdf"
                  hidden
                  disabled={uploading}
                  onChange={(e) => {
                    uploadMedia(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {uploading && (
                <div style={{ marginBottom: 20, maxWidth: 420 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    <span>Uploading…</span>
                    <span>{uploadPct}%</span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 999,
                      background: "var(--surface-2)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${uploadPct}%`,
                        background: "var(--accent)",
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                </div>
              )}
              <div className="cms-media-grid">
                {(c.media || []).map((m) => {
                  const placements = getMediaPlacements(c, m.url);
                  const onSite = placements.length > 0;
                  const isVid = isVideoMime(m.mime, m.url);
                  const inShowcase = placements.includes("Media showcase");
                  return (
                    <div
                      key={m.id || m.url}
                      style={{
                        border: onSite ? "2px solid var(--accent)" : "1px solid var(--border)",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "var(--surface)",
                      }}
                    >
                      <CmsMediaThumb media={m} height={140} />
                      <div style={{ padding: 12, fontSize: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4, wordBreak: "break-word" }}>{m.name}</div>
                        {onSite ? (
                          <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {placements.map((p) => (
                              <span
                                key={p}
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  background: "var(--accent-light)",
                                  color: "var(--accent)",
                                }}
                              >
                                Live: {p}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>Not on website</div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <button
                            type="button"
                            style={{
                              ...mediaBtnStyle,
                              background: "var(--accent)",
                              color: "#fff",
                              border: "none",
                              fontWeight: 700,
                              textAlign: "center",
                            }}
                            onClick={() => setPlacementMedia(m)}
                          >
                            Where to show?
                          </button>
                          {isVid ? (
                            <button type="button" style={mediaBtnStyle} onClick={() => { patch("hero.heroVideo", m.url); setMessage("Set as hero video — Save website."); }}>
                              {c.hero?.heroVideo === m.url ? "✓ Hero video" : "Set hero video"}
                            </button>
                          ) : (
                            <button type="button" style={mediaBtnStyle} onClick={() => { patch("hero.heroImage", m.url); setMessage("Set as hero image — Save website."); }}>
                              {c.hero?.heroImage === m.url ? "✓ Hero image" : "Set hero image"}
                            </button>
                          )}
                          <button type="button" style={mediaBtnStyle} onClick={() => addToShowcase(m)}>
                            {inShowcase ? "✓ On homepage showcase" : "Show on homepage showcase"}
                          </button>
                          {!isVid && (c.programs?.items || []).length > 0 && (
                            <select
                              style={{ ...mediaBtnStyle, padding: "6px 8px" }}
                              value=""
                              onChange={(e) => {
                                const idx = Number(e.target.value);
                                if (Number.isFinite(idx) && idx >= 0) setProgramImage(idx, m.url);
                                e.target.value = "";
                              }}
                            >
                              <option value="">Set program card image…</option>
                              {(c.programs?.items || []).map((p, pi) => (
                                <option key={p.id || pi} value={pi}>
                                  {p.name || `Program ${pi + 1}`}
                                  {p.image === m.url ? " ✓" : ""}
                                </option>
                              ))}
                            </select>
                          )}
                          {onSite && (
                            <button type="button" style={{ ...mediaBtnStyle, color: "#b45309" }} onClick={() => removeMediaFromSite(m)}>
                              Remove from website
                            </button>
                          )}
                          <button type="button" style={{ ...mediaBtnStyle, color: "#b91c1c" }} onClick={() => deleteMediaItem(m)}>
                            Delete file
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(c.media || []).length === 0 && (
                <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 12 }}>No uploads yet.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
