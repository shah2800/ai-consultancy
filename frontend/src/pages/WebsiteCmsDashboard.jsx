import { useCallback, useEffect, useState } from "react";
import api, { invalidateCachedGet } from "../api/api";
import SkeletonPulse from "../components/SkeletonPulse";

const TABS = [
  { id: "general", label: "General & SEO" },
  { id: "hero", label: "Hero & video" },
  { id: "about", label: "About" },
  { id: "programs", label: "Programs" },
  { id: "faq", label: "FAQ" },
  { id: "contact", label: "Contact" },
  { id: "footer", label: "Footer" },
  { id: "media", label: "Media library" },
  { id: "videos", label: "Video section" },
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

function isVideoMime(mime, url) {
  if (String(mime || "").startsWith("video/")) return true;
  return /\.(mp4|webm|mov)(\?|$)/i.test(String(url || ""));
}

function getMediaPlacements(content, url) {
  if (!url) return [];
  const places = [];
  if (content?.hero?.heroVideo === url) places.push("Hero video");
  if (content?.hero?.heroImage === url) places.push("Hero image");
  if ((content?.videoGallery?.items || []).some((v) => v.url === url)) places.push("Video gallery");
  return places;
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
  const [storageInfo, setStorageInfo] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

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
    setError("");
    try {
      const useR2 = storageInfo?.storage === "r2";
      let item;

      const uploadViaServer = async () => {
        const fd = new FormData();
        fd.append("file", file);
        const res = await api.post("/admin/website-cms/media", fd, { timeout: 300000 });
        return res.data?.media;
      };

      if (useR2) {
        try {
          const presign = await api.post("/admin/website-cms/media/presign", {
            name: file.name,
            mime: file.type || "application/octet-stream",
            size: file.size,
          });
          const { uploadUrl, key, publicUrl, headers } = presign.data || {};
          if (!uploadUrl || !key) throw new Error("Could not start Cloudflare upload.");

          const putRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": headers?.["Content-Type"] || file.type || "application/octet-stream",
            },
            body: file,
          });
          if (!putRes.ok) {
            throw new Error(`Cloudflare direct upload failed (${putRes.status}). Trying server upload…`);
          }

          const done = await api.post("/admin/website-cms/media/complete", {
            key,
            name: file.name,
            mime: file.type || "",
            size: file.size,
          });
          item = done.data?.media;
          if (!item && publicUrl) {
            item = { url: publicUrl, name: file.name, key, storage: "r2", id: key };
          }
        } catch (directErr) {
          console.warn("R2 direct upload failed, using server:", directErr?.message);
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
          useR2
            ? `Uploaded to Cloudflare R2: ${item.name}. Use buttons below to show it on the website, then Save.`
            : `Uploaded ${item.name} (local disk — configure R2 on Render for CDN).`
        );
        invalidateCachedGet("/admin/website-cms");
      }
    } catch (err) {
      const raw = err?.response?.data?.error || err?.message || "Upload failed.";
      setError(
        raw === "Failed to fetch" || /failed to fetch/i.test(raw)
          ? "Upload failed — add R2 CORS for https://api.nextstepinternationals.com in Cloudflare bucket settings (see docs/CLOUDFLARE-SETUP.md), then retry."
          : raw
      );
    } finally {
      setUploading(false);
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

  function addToVideoGallery(m) {
    if (!isVideoMime(m.mime, m.url)) {
      setError("Only videos can be added to the video gallery section.");
      return;
    }
    setContent((prev) => {
      const items = [...(prev?.videoGallery?.items || [])];
      if (items.some((v) => v.url === m.url)) {
        setMessage("Already in video gallery.");
        return prev;
      }
      items.push({
        id: m.id || m.key || m.url,
        url: m.url,
        title: m.name || "Student video",
      });
      return {
        ...prev,
        videoGallery: { ...(prev?.videoGallery || {}), enabled: true, items },
      };
    });
    setMessage(`Added to video gallery — click Save website.`);
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
    <div className="page-shell" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 20px 48px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20, alignItems: "start" }}>
        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            position: "sticky",
            top: 16,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 8,
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                background: tab === t.id ? "var(--accent)" : "transparent",
                color: tab === t.id ? "#fff" : "var(--text)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="panel" style={{ padding: 22, minHeight: 420 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
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
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Programs</h2>
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                    <Field label="Image URL">
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
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Video section (homepage)</h2>
              <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16 }}>
                Videos you add from the Media library appear here. Pick videos in Media → &quot;Show in gallery&quot;.
              </p>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={c.videoGallery?.enabled !== false}
                  onChange={(e) => patch("videoGallery.enabled", e.target.checked)}
                />
                Show video section on website
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
                <p style={{ fontSize: 13, color: "var(--text-3)" }}>No videos selected yet — use Media library.</p>
              ) : (
                (c.videoGallery?.items || []).map((v, i) => (
                  <div
                    key={v.url || i}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      padding: 10,
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      marginBottom: 8,
                    }}
                  >
                    <video src={v.url} style={{ width: 100, height: 56, objectFit: "cover", borderRadius: 6 }} muted />
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
                Upload files to Cloudflare R2. You choose what appears on the site — hero, gallery, or hidden.
              </p>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                {(c.media || []).map((m) => {
                  const placements = getMediaPlacements(c, m.url);
                  const onSite = placements.length > 0;
                  const isVid = isVideoMime(m.mime, m.url);
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
                      {isVid ? (
                        <video src={m.url} style={{ width: "100%", height: 140, objectFit: "cover", background: "#000" }} muted controls playsInline />
                      ) : (
                        <img src={m.url} alt="" style={{ width: "100%", height: 140, objectFit: "cover" }} />
                      )}
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
                          {isVid ? (
                            <>
                              <button type="button" style={mediaBtnStyle} onClick={() => { patch("hero.heroVideo", m.url); setMessage("Set as hero video — Save website."); }}>
                                {c.hero?.heroVideo === m.url ? "✓ Hero video" : "Set hero video"}
                              </button>
                              <button type="button" style={mediaBtnStyle} onClick={() => addToVideoGallery(m)}>
                                {placements.includes("Video gallery") ? "✓ In gallery" : "Show in gallery"}
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" style={mediaBtnStyle} onClick={() => { patch("hero.heroImage", m.url); setMessage("Set as hero image — Save website."); }}>
                                {c.hero?.heroImage === m.url ? "✓ Hero image" : "Set hero image"}
                              </button>
                            </>
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
