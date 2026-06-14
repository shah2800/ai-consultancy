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

export default function WebsiteCmsDashboard() {
  const [tab, setTab] = useState("general");
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const sitePreviewUrl =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/\/admin\/?$/, "")}/`
      : "/";

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
      setError(err?.response?.data?.error || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadMedia(file) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/admin/website-cms/media", fd);
      const item = res.data?.media;
      if (item) {
        setContent((prev) => ({
          ...prev,
          media: [item, ...(prev?.media || [])],
        }));
        setMessage(`Uploaded ${item.name}`);
      }
    } catch (err) {
      setError(err?.response?.data?.error || "Upload failed.");
    } finally {
      setUploading(false);
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

          {tab === "media" && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Media library</h2>
              <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16 }}>
                Upload images or videos. Copy the URL into Hero or Program fields.
              </p>
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
                {uploading ? "Uploading…" : "Upload file"}
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
                {(c.media || []).map((m) => (
                  <div key={m.id || m.url} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
                    {String(m.mime || "").startsWith("video/") ? (
                      <video src={m.url} style={{ width: "100%", height: 120, objectFit: "cover" }} muted />
                    ) : (
                      <img src={m.url} alt="" style={{ width: "100%", height: 120, objectFit: "cover" }} />
                    )}
                    <div style={{ padding: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6, wordBreak: "break-all" }}>{m.name}</div>
                      <input readOnly value={m.url} style={{ ...inputStyle, fontSize: 11, padding: "6px 8px" }} onFocus={(e) => e.target.select()} />
                      <button
                        type="button"
                        style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        onClick={() => {
                          patch("hero.heroVideo", m.url);
                          setMessage("Set as hero video — click Save website.");
                        }}
                      >
                        Use as hero video
                      </button>
                      {" · "}
                      <button
                        type="button"
                        style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        onClick={() => {
                          patch("hero.heroImage", m.url);
                          setMessage("Set as hero image — click Save website.");
                        }}
                      >
                        Use as hero image
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
