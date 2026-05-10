import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import api from "../api/api";
import SkeletonPulse from "../components/SkeletonPulse";
import { useParams, useNavigate } from "react-router-dom";
import { inferPhoneOrigin } from "../utils/phoneCountry";
import { formatLastActivity } from "../utils/lastActivity";
import { roleFromToken, userIdFromToken } from "../utils/jwt";

const STATUS_CONFIG = {
  new:       { color: "#7C84A0", bg: "#F1F2F8",  label: "New" },
  warm:      { color: "#D08A12", bg: "#FEF3DC",  label: "Warm" },
  hot:       { color: "#D64B2A", bg: "#FEF0EC",  label: "Hot" },
  ready:     { color: "#1E9E5E", bg: "#E9F8F0",  label: "Ready" },
  converted: { color: "#2B64C4", bg: "#EBF2FD",  label: "Converted" },
  lost:      { color: "#B23A3A", bg: "#FDEDED",  label: "Lost" },
};

// FEATURE 2: Quick reply templates
const QUICK_REPLIES = [
  { label: "👋 Greeting", text: "Hi! Thank you for your interest in studying abroad with Next Step International. I'm here to help you explore your options. What program or country are you most interested in?" },
  { label: "📋 Enrollment", text: "Great news! Based on our conversation, you seem like a perfect candidate. I'd like to send you our enrollment form to get the process started. Can you confirm your full name and email address?" },
  { label: "📞 Call invite", text: "I'd love to schedule a quick 15-minute call to discuss your study abroad plans in detail. What time works best for you this week?" },
  { label: "📄 Send brochure", text: "I'm sending over our program brochure which covers all the details about fees, courses, and visa requirements. Please take a look and feel free to ask any questions!" },
  { label: "⏰ Follow up", text: "Hi! I wanted to follow up on our earlier conversation. Have you had a chance to think about the program options we discussed? I'm here if you have any questions." },
  { label: "✅ Next steps", text: "You're all set for the next step! Please prepare the following documents: passport copy, academic transcripts, and a passport-size photo. Once ready, we can proceed with your application." },
  { label: "💰 Scholarship", text: "Good news! There are scholarship opportunities available for this program. Based on your profile, you may qualify for a partial scholarship. Would you like me to share the eligibility criteria?" },
  { label: "🎓 Congratulations", text: "Congratulations! Your application has been approved. Welcome to the Next Step family! I'll be in touch shortly with your orientation details and next steps." },
];

const MAX_CHAT_ATTACHMENTS = 5;

function LeadProfileShellSkeleton() {
  return (
    <div className="lead-profile-shell" style={{ position: "relative", display: "flex", height: "100vh", overflow: "hidden", fontFamily: "var(--font-body)", minHeight: 0 }}>
      <div className="lead-profile-sidebar" style={{ width: 300, minWidth: 300, background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <SkeletonPulse style={{ width: 72, height: 12, marginBottom: 14 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SkeletonPulse style={{ width: 48, height: 48, borderRadius: "50%" }} />
            <div style={{ flex: 1 }}>
              <SkeletonPulse style={{ width: "85%", height: 14, marginBottom: 8 }} />
              <SkeletonPulse style={{ width: "65%", height: 12 }} />
            </div>
            <SkeletonPulse style={{ width: 44, height: 44, borderRadius: "50%" }} />
          </div>
          <div style={{ marginTop: 14 }}>
            <SkeletonPulse style={{ width: "90%", height: 36, borderRadius: 8 }} />
          </div>
        </div>
        <div style={{ flex: 1, padding: "16px 20px" }}>
          <SkeletonPulse style={{ width: "100%", height: 100, borderRadius: 10, marginBottom: 12 }} />
          <SkeletonPulse style={{ width: "100%", height: 72, borderRadius: 10 }} />
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <SkeletonPulse style={{ flex: 1, height: 40, borderRadius: 8 }} />
          <SkeletonPulse style={{ flex: 1, height: 40, borderRadius: 8 }} />
        </div>
      </div>
      <div className="lead-profile-chat" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", minHeight: 0 }}>
        <div style={{ padding: "14px 20px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          <SkeletonPulse style={{ width: 140, height: 16, marginBottom: 6 }} />
          <SkeletonPulse style={{ width: 220, height: 12 }} />
        </div>
        <div style={{ flex: 1, padding: "20px 24px" }}>
          <SkeletonPulse style={{ width: "78%", height: 14, marginBottom: 10 }} />
          <SkeletonPulse style={{ width: "52%", height: 14, marginBottom: 18 }} />
          <SkeletonPulse style={{ width: "88%", height: 14, marginBottom: 10 }} />
          <SkeletonPulse style={{ width: "70%", height: 14 }} />
        </div>
      </div>
      <p style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", fontSize: 12, color: "var(--text-3)", pointerEvents: "none" }}>
        Loading NextStep CRM…
      </p>
    </div>
  );
}

/** Top of scroll column: Conversion / Next Action / Follow-up */
function LeadSidebarIntelSkeleton() {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
      <SkeletonPulse style={{ width: "55%", height: 10, marginBottom: 10 }} />
      <SkeletonPulse style={{ width: "100%", height: 6, borderRadius: 3, marginBottom: 14 }} />
      <SkeletonPulse style={{ width: "40%", height: 10, marginBottom: 8 }} />
      <SkeletonPulse style={{ width: "100%", height: 36, borderRadius: 8, marginBottom: 12 }} />
      <SkeletonPulse style={{ width: "45%", height: 10, marginBottom: 6 }} />
      <SkeletonPulse style={{ width: "72%", height: 22, borderRadius: 20 }} />
    </div>
  );
}

/** Tags, lead details, important details, AI summary, notes */
function LeadSidebarRestSkeleton() {
  return (
    <>
      <SkeletonPulse style={{ width: "28%", height: 11, marginBottom: 10 }} />
      <SkeletonPulse style={{ width: "100%", height: 28, borderRadius: 8, marginBottom: 16 }} />
      <SkeletonPulse style={{ width: "38%", height: 11, marginBottom: 10 }} />
      <SkeletonPulse style={{ width: "100%", height: 140, borderRadius: 10, marginBottom: 12 }} />
      <SkeletonPulse style={{ width: "70%", height: 12, marginBottom: 8 }} />
      <SkeletonPulse style={{ width: "100%", height: 88, borderRadius: 8 }} />
    </>
  );
}

function LeadChatThreadSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading messages">
      <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
        <SkeletonPulse style={{ width: "68%", height: 52, borderRadius: "16px 16px 16px 4px" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <SkeletonPulse style={{ width: "58%", height: 44, borderRadius: "16px 16px 4px 16px" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
        <SkeletonPulse style={{ width: "74%", height: 40, borderRadius: "16px 16px 16px 4px" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <SkeletonPulse style={{ width: "52%", height: 56, borderRadius: "16px 16px 4px 16px" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <SkeletonPulse style={{ width: "62%", height: 48, borderRadius: "16px 16px 16px 4px" }} />
      </div>
    </div>
  );
}

// Tag colors
const TAG_COLORS = {
  urgent:          { bg: "#FEF0EC", color: "#D64B2A" },
  scholarship:     { bg: "#E9F8F0", color: "#1E9E5E" },
  mbbs:            { bg: "#EBF2FD", color: "#2B64C4" },
  visa_help:       { bg: "#F1F2F8", color: "#4361EE" },
  georgia:         { bg: "#E6F1FB", color: "#185FA5" },
  turkey:          { bg: "#FEF0EC", color: "#D64B2A" },
  china:           { bg: "#E9F8F0", color: "#1E9E5E" },
  budget_concern:  { bg: "#FEF3DC", color: "#D08A12" },
  ready_to_enroll: { bg: "#E9F8F0", color: "#1E9E5E" },
  needs_info:      { bg: "#F1F2F8", color: "#7C84A0" },
  follow_up:       { bg: "#FEF3DC", color: "#D08A12" },
  high_intent:     { bg: "#FEF0EC", color: "#D64B2A" },
  language_barrier:{ bg: "#FDEDED", color: "#B23A3A" },
  parent_involved: { bg: "#EBF2FD", color: "#2B64C4" },
};

const ALL_TAGS = Object.keys(TAG_COLORS);

function getConversionProbability(lead) {
  let prob = 0;
  prob += ((lead.score || 0) / 100) * 60;
  const statusBonus = { converted: 30, ready: 25, hot: 18, warm: 10, new: 3, lost: 0 };
  prob += statusBonus[lead.status] || 0;
  prob += Math.min((lead.messages?.length || 0) * 1.5, 10);
  return Math.min(Math.round(prob), 99);
}

function getNextAction(lead) {
  const score = lead.score || 0;
  const msgs = lead.messages || [];
  const lastAdminMsg = msgs.filter(m => m.role === "admin").pop();
  const hoursSinceLast = lead.lastActivity ? (Date.now() - new Date(lead.lastActivity)) / 36e5 : 999;
  if (lead.status === "converted") return { text: "Request referral", icon: "⭐", color: "#2B64C4" };
  if (lead.status === "lost") return { text: "Re-engage after 30 days", icon: "🔁", color: "#B23A3A" };
  if (lead.status === "ready") return { text: "Send enrollment form now", icon: "📋", color: "#1E9E5E" };
  if (score >= 70) return { text: "Call to close — high intent", icon: "📞", color: "#D64B2A" };
  if (!lastAdminMsg) return { text: "Send first message", icon: "👋", color: "#D08A12" };
  if (hoursSinceLast > 48) return { text: "Follow up — no reply in 2 days", icon: "⏰", color: "#D64B2A" };
  if (score >= 40) return { text: "Share program brochure", icon: "📄", color: "#D08A12" };
  return { text: "Nurture with course info", icon: "💡", color: "#7C84A0" };
}

function getFollowUpStatus(lead) {
  const lastDate = lead.lastActivity ? new Date(lead.lastActivity) : null;
  if (!lastDate) return { label: "Never contacted", color: "#D64B2A", bg: "#FEF0EC" };
  const hoursAgo = (Date.now() - lastDate) / 36e5;
  if (hoursAgo < 24) return { label: "Active today", color: "#1E9E5E", bg: "#E9F8F0" };
  if (hoursAgo < 48) return { label: "Follow-up due", color: "#D08A12", bg: "#FEF3DC" };
  return { label: `${Math.floor(hoursAgo / 24)}d overdue`, color: "#D64B2A", bg: "#FEF0EC" };
}

/** Own 1s ticks — avoids re-rendering the whole lead page (fixes sidebar/chat scroll jank). */
function AiLimitResetCountdown({ resetAtMs, active }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || !Number.isFinite(resetAtMs)) return;
    const id = setInterval(() => setTick((n) => (n + 1) % 1e9), 1000);
    return () => clearInterval(id);
  }, [active, resetAtMs]);
  if (!active || !Number.isFinite(resetAtMs)) return null;
  const left = Math.max(0, resetAtMs - Date.now());
  if (left <= 0) return null;
  const h = String(Math.floor(left / 3600000)).padStart(2, "0");
  const m = String(Math.floor((left % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  return (
    <span style={{ marginLeft: 8, color: "var(--danger)", fontWeight: 600 }}>
      resets in {h}:{m}:{s}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

function ScoreRing({ score, size = 52 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? "#D64B2A" : score >= 50 ? "#D08A12" : score >= 25 ? "#4361EE" : "#7C84A0";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color + "22"} strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dashoffset 0.6s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize={13} fontWeight={700} fill={color}>{score}</text>
    </svg>
  );
}

function ProbabilityBar({ value }) {
  const color = value >= 70 ? "#1E9E5E" : value >= 40 ? "#D08A12" : "#D64B2A";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Conversion Probability</span>
        <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: `linear-gradient(90deg, ${color}99, ${color})`, borderRadius: 3, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  const isReactNode = typeof value === "object" && value !== null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, flexShrink: 0, width: 100 }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          color: "var(--text)",
          fontWeight: 500,
          textAlign: "right",
          fontFamily: !isReactNode && mono ? "ui-monospace, monospace" : "inherit",
          maxWidth: "62%",
        }}
      >
        {isReactNode ? value : value ?? "—"}
      </span>
    </div>
  );
}

const INBOUND_MEDIA_KINDS = ["image", "video", "document", "audio", "sticker"];

const MEDIA_CARD_META = {
  image: { icon: "🖼️", label: "Photo", tint: "#2563EB" },
  video: { icon: "🎬", label: "Video", tint: "#7C3AED" },
  document: { icon: "📄", label: "Document", tint: "#B45309" },
  audio: { icon: "🎵", label: "Audio", tint: "#0D9488" },
  sticker: { icon: "🙂", label: "Sticker", tint: "#DB2777" },
};

function effectiveInboundKind(msg) {
  if (msg.role !== "user") return "text";
  const k = String(msg.kind || "").toLowerCase();
  if (k && k !== "text" && k !== "unknown") return k;
  const c = String(msg.content || "").trim().toLowerCase();
  if (c === "[image received]") return "image";
  if (c === "[video received]") return "video";
  if (c === "[document received]" || c.startsWith("[document")) return "document";
  if (c === "[audio received]") return "audio";
  return "text";
}

function captionForInboundMedia(msg) {
  if (String(msg.caption || "").trim()) return String(msg.caption).trim();
  const raw = String(msg.content || "");
  if (!raw.includes("\n")) return "";
  return raw.split("\n").slice(1).join("\n").trim();
}

const WHATSAPP_MEDIA_API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

function whatsappMediaRequestUrl(mediaId, query = {}) {
  const u = new URL(
    `${WHATSAPP_MEDIA_API_BASE.replace(/\/$/, "")}/admin/whatsapp/media/${encodeURIComponent(mediaId)}`
  );
  Object.entries(query).forEach(([k, v]) => {
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  });
  return u.toString();
}

/** Prefer WhatsApp metadata; fill extension from resolved MIME when missing. */
function downloadFilename(baseName, whatsappMime, resolvedMime) {
  let name =
    String(baseName || "").trim() ||
    (whatsappMime || resolvedMime ? "document" : "download");
  const mime = `${String(whatsappMime || "").toLowerCase()} ${String(resolvedMime || "").toLowerCase()}`;
  if (!name.includes(".")) {
    if (mime.includes("pdf")) name += ".pdf";
    else if (mime.includes("wordprocessingml") || mime.includes("msword")) name += ".docx";
    else if (mime.includes("spreadsheetml") || mime.includes("ms-excel")) name += ".xlsx";
    else if (mime.includes("presentationml")) name += ".pptx";
    else if (mime.includes("zip")) name += ".zip";
    else if (mime.includes("text/plain")) name += ".txt";
  }
  return name;
}

/** Fetches authenticated WhatsApp media and shows preview + download where applicable. */
function InboundWhatsAppMediaPreview({ msg, inboundKind, meta }) {
  const mediaId = String(msg.whatsappMediaId || "").trim();
  const [blobUrl, setBlobUrl] = useState(null);
  const [resolvedMime, setResolvedMime] = useState("");
  const [loading, setLoading] = useState(Boolean(mediaId));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!mediaId) {
      setLoading(false);
      setBlobUrl(null);
      setResolvedMime("");
      setError(null);
      return;
    }

    const token = localStorage.getItem("token");
    let cancelled = false;
    const ac = new AbortController();

    setLoading(true);
    setError(null);
    setResolvedMime("");
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    (async () => {
      try {
        const res = await fetch(whatsappMediaRequestUrl(mediaId), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: ac.signal,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Could not load media (${res.status})`);
        }
        const blob = await res.blob();
        if (cancelled) return;
        const headerCt = (res.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
        const blobCt = (blob.type || "").split(";")[0].trim().toLowerCase();
        setResolvedMime(headerCt || blobCt || "");
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch (e) {
        if (cancelled || e?.name === "AbortError") return;
        setError(e?.message || "Preview unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [mediaId]);

  const whatsappMime = String(msg.mimeType || "").trim().toLowerCase();
  const filename = downloadFilename(
    String(msg.mediaFilename || "").trim(),
    whatsappMime,
    resolvedMime
  );

  const triggerDownload = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        whatsappMediaRequestUrl(mediaId, { download: "1", filename }),
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      if (!blobUrl) return;
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const openInNewTab = () => {
    if (!blobUrl) return;
    window.open(blobUrl, "_blank", "noopener,noreferrer");
  };

  if (!mediaId) return null;

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: "var(--text-3)", padding: "6px 0 10px" }}>
        {inboundKind === "document" ? "Loading file…" : "Loading preview…"}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontSize: 12, color: "#B45309", padding: "6px 0 10px", fontWeight: 600 }}>
        {error}
      </div>
    );
  }

  if (!blobUrl) return null;

  const wrapStyle = { marginBottom: 10 };

  if (inboundKind === "image") {
    return (
      <div style={wrapStyle}>
        <img
          src={blobUrl}
          alt=""
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: 320,
            width: "auto",
            height: "auto",
            borderRadius: 12,
            objectFit: "contain",
            background: "rgb(15 23 42 / 0.06)",
          }}
        />
      </div>
    );
  }

  if (inboundKind === "sticker") {
    return (
      <div style={wrapStyle}>
        <img
          src={blobUrl}
          alt="Sticker"
          style={{
            display: "block",
            maxWidth: 200,
            maxHeight: 200,
            width: "auto",
            height: "auto",
            borderRadius: 8,
          }}
        />
      </div>
    );
  }

  if (inboundKind === "video") {
    return (
      <div style={wrapStyle}>
        <video
          src={blobUrl}
          controls
          playsInline
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: 280,
            borderRadius: 12,
            background: "#000",
          }}
        />
      </div>
    );
  }

  if (inboundKind === "audio") {
    return (
      <div style={wrapStyle}>
        <audio src={blobUrl} controls style={{ width: "100%", maxWidth: 320, height: 40 }} />
      </div>
    );
  }

  const docBtnStyle = {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--font-body)",
  };

  if (inboundKind === "document") {
    return (
      <div style={wrapStyle}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden>{meta.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{meta.label}</div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
                marginTop: 6,
                wordBreak: "break-word",
                lineHeight: 1.35,
              }}
              title={filename}
            >
              {filename}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" onClick={openInNewTab} style={docBtnStyle}>
            Open
          </button>
          <button type="button" onClick={() => void triggerDownload()} style={docBtnStyle}>
            Download
          </button>
        </div>
      </div>
    );
  }

  return null;
}

const ChatBubble = memo(function ChatBubble({ msg }) {
  const isUser = msg.role === "user";
  const isAI = msg.role === "assistant" || msg.role === "ai";
  const time = msg.at ? new Date(msg.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";
  const inboundKind = effectiveInboundKind(msg);
  const isInboundMedia = isUser && INBOUND_MEDIA_KINDS.includes(inboundKind);
  const deliveryStatus = String(msg.whatsappDeliveryStatus || "").trim().toLowerCase();
  const deliveryError = String(msg.whatsappDeliveryError || "").trim();
  const deliveryChannel = String(msg.whatsappDeliveryChannel || "").trim().toLowerCase();
  const isUndeliveredWhatsApp =
    deliveryChannel === "whatsapp" &&
    ["failed", "skipped_no_phone", "not_configured"].includes(deliveryStatus);

  const renderDeliveryBadge = (align = "left") => {
    if (!isUndeliveredWhatsApp) return null;
    return (
      <div
        title={deliveryError || "Not sent to WhatsApp"}
        style={{
          marginTop: 3,
          textAlign: align,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.02em",
            color: "#b91c1c",
            background: "#fef2f2",
            borderRadius: 999,
            padding: "2px 8px",
          }}
        >
          Not sent to WhatsApp
        </span>
      </div>
    );
  };

  if (isUser && isInboundMedia) {
    const meta = MEDIA_CARD_META[inboundKind] || { icon: "📎", label: "Media", tint: "var(--accent)" };
    const cap = captionForInboundMedia(msg);
    const showMime = String(msg.mimeType || "").trim();
    const hasMediaId = Boolean(String(msg.whatsappMediaId || "").trim());

    return (
      <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
        <div style={{ maxWidth: "78%" }}>
          <div
            style={{
              background: "#F0F1F8",
              color: "var(--text)",
              padding: "12px 14px",
              borderRadius: "16px 16px 16px 4px",
              fontSize: 14,
              lineHeight: 1.45,
              borderLeft: `4px solid ${meta.tint}`,
              boxShadow: "0 1px 2px rgb(15 23 42 / 0.06)",
            }}
          >
            {hasMediaId ? (
              <InboundWhatsAppMediaPreview msg={msg} inboundKind={inboundKind} meta={meta} />
            ) : null}
            {!hasMediaId ? (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", letterSpacing: "0.02em" }}>
                    {meta.label}
                    {inboundKind === "audio" && String(msg.content || "").includes("Voice") ? (
                      <span style={{ fontWeight: 600, color: "var(--text-3)", marginLeft: 6 }}>(voice)</span>
                    ) : null}
                  </div>
                  {inboundKind === "document" && msg.mediaFilename ? (
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginTop: 4, wordBreak: "break-word" }}>
                      {msg.mediaFilename}
                    </div>
                  ) : null}
                  {showMime ? (
                    <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>{showMime}</div>
                  ) : null}
                </div>
              </div>
            ) : inboundKind === "document" && showMime && !String(msg.mimeType || "").toLowerCase().includes("pdf") ? (
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>{showMime}</div>
            ) : null}
            {cap ? (
              <div style={{ marginTop: hasMediaId ? 8 : 10, fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{cap}</div>
            ) : null}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3, paddingLeft: 4 }}>{time}</div>
        </div>
      </div>
    );
  }

  if (isUser) return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
      <div style={{ maxWidth: "72%" }}>
        <div style={{ background: "#F0F1F8", color: "var(--text)", padding: "10px 14px", borderRadius: "16px 16px 16px 4px", fontSize: 14, lineHeight: 1.5 }}>{msg.text || msg.content}</div>
        <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3, paddingLeft: 4 }}>{time}</div>
      </div>
    </div>
  );

  if (isAI) return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
      <div style={{ maxWidth: "72%" }}>
        <div
          style={{
            background: isUndeliveredWhatsApp ? "#fef2f2" : "#F0F1F8",
            color: isUndeliveredWhatsApp ? "#7f1d1d" : "var(--text)",
            padding: "10px 14px",
            borderRadius: "16px 16px 16px 4px",
            fontSize: 14,
            lineHeight: 1.5,
            borderLeft: isUndeliveredWhatsApp ? "3px solid #dc2626" : "3px solid #4361EE",
          }}
        >
          {msg.text || msg.content}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3, paddingLeft: 4 }}>{time}</div>
        {renderDeliveryBadge("left")}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
      <div style={{ maxWidth: "72%" }}>
        <div
          style={{
            background: isUndeliveredWhatsApp ? "#fef2f2" : "#4361EE",
            color: isUndeliveredWhatsApp ? "#7f1d1d" : "#fff",
            padding: "10px 14px",
            borderRadius: "16px 16px 4px 16px",
            fontSize: 14,
            lineHeight: 1.5,
            border: isUndeliveredWhatsApp ? "1px solid #fecaca" : "none",
          }}
        >
          {msg.text || msg.content}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3, paddingRight: 4, textAlign: "right" }}>{time}</div>
        {renderDeliveryBadge("right")}
      </div>
    </div>
  );
});

export default function LeadProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const chatEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  /** True when the thread is scrolled up — show jump-to-bottom control */
  const [showScrollDownBtn, setShowScrollDownBtn] = useState(false);

  const scrollToBottomSmooth = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    shouldAutoScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowScrollDownBtn(false);
  }, []);

  const [lead, setLead] = useState(null);
  const [leadLoading, setLeadLoading] = useState(true);
  /** Staged paint after lead loads: intel + chat thread first; tags/details/summary next (both columns feel top-first). */
  const [sidebarIntelReady, setSidebarIntelReady] = useState(false);
  const [sidebarRestReady, setSidebarRestReady] = useState(false);
  const [chatThreadReady, setChatThreadReady] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [chatAttachments, setChatAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  // FEATURE 6: AI Summary — text comes from `lead.aiSummary` (server refreshes every 10 msgs); manual refresh reloads lead.
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [importantDraft, setImportantDraft] = useState("");
  const [importantSaving, setImportantSaving] = useState(false);

  // FEATURE 5: Tags state
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [savingTags, setSavingTags] = useState(false);

  // FEATURE 2: Quick replies panel
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 900 : false
  );
  const [team, setTeam] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const [aiGlobalLimit, setAiGlobalLimit] = useState(100);
  /** Draft for this lead only (saved as override unless it equals account default). */
  const [aiLeadLimitDraft, setAiLeadLimitDraft] = useState(100);
  /** String while typing so you can clear the field and enter e.g. 21 */
  const [aiLeadLimitStr, setAiLeadLimitStr] = useState("100");
  const [aiControlSaving, setAiControlSaving] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLeadLoading(true);
    try {
      const res = await api.get(`/admin/leads/${id}`);
      setLead(res.data);
    } catch (e) { console.error(e); }
    finally { if (!silent) setLeadLoading(false); }
  }, [id]);

  useEffect(() => {
    setSidebarIntelReady(false);
    setSidebarRestReady(false);
    setChatThreadReady(false);
    setMobileSidebarOpen(false);
  }, [id]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onResize = () => {
      if (window.innerWidth > 900) {
        setMobileSidebarOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    const updateMobile = () => {
      setIsMobileView(window.innerWidth <= 900);
    };
    updateMobile();
    window.addEventListener("resize", updateMobile);
    return () => window.removeEventListener("resize", updateMobile);
  }, []);

  useEffect(() => {
    if (window.innerWidth > 900) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = mobileSidebarOpen ? "hidden" : prevOverflow || "";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!lead?._id || String(lead._id) !== String(id)) return;
    let cancelled = false;
    const tier1 = () => {
      if (!cancelled) {
        setSidebarIntelReady(true);
        setChatThreadReady(true);
      }
    };
    const tier2 = () => {
      if (!cancelled) setSidebarRestReady(true);
    };
    let idle1;
    let idle2;
    if (typeof window.requestIdleCallback === "function") {
      idle1 = window.requestIdleCallback(tier1, { timeout: 220 });
      idle2 = window.requestIdleCallback(tier2, { timeout: 520 });
    } else {
      idle1 = setTimeout(tier1, 56);
      idle2 = setTimeout(tier2, 140);
    }
    return () => {
      cancelled = true;
      if (typeof window.requestIdleCallback === "function") {
        if (typeof idle1 === "number") window.cancelIdleCallback(idle1);
        if (typeof idle2 === "number") window.cancelIdleCallback(idle2);
      } else {
        clearTimeout(idle1);
        clearTimeout(idle2);
      }
    };
  }, [lead?._id, id]);

  useEffect(() => {
    load();

    let interval = null;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      load({ silent: true });
    };
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(refresh, 10000);
    };
    const stopPolling = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
        startPolling();
      } else {
        stopPolling();
      }
    };

    onVisibilityChange();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopPolling();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  /** Clear unread notification badge(s) for this lead when you open the thread. */
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        await api.post(`/admin/notifications/read-for-lead/${id}`);
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent("crm-notifications-updated"));
        }
      } catch {
        /* ignore read acknowledgement failures */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!chatThreadReady) return;
    if (!shouldAutoScrollRef.current) return;
    const el = chatScrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
      setShowScrollDownBtn(false);
    } else {
      chatEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    }
  }, [lead?.messages, chatThreadReady]);

  const aiSummaryDisplay = useMemo(() => {
    const s = lead?.aiSummary;
    return typeof s === "string" && s.trim() ? s.trim() : null;
  }, [lead?.aiSummary]);

  /** Manual refresh — GET regenerates on server; silent load picks up `aiSummary`. */
  const fetchSummary = useCallback(async () => {
    if (!id) return;
    setSummaryLoading(true);
    try {
      await api.get(`/admin/leads/${id}/summary`);
      await load({ silent: true });
    } catch {
      /* ignore summary refresh errors */
    } finally {
      setSummaryLoading(false);
    }
  }, [id, load]);

  useEffect(() => {
    setImportantDraft(String(lead?.importantDetails ?? ""));
  }, [lead?._id, lead?.importantDetails]);

  const saveImportantDetails = useCallback(async () => {
    const r = roleFromToken(localStorage.getItem("token"));
    if (r === "viewer" || !id || importantSaving) return;
    setImportantSaving(true);
    try {
      await api.patch(`/admin/leads/${id}/important-details`, {
        importantDetails: importantDraft,
      });
      await load({ silent: true });
    } catch (e) {
      window.alert(e.response?.data?.error || "Could not save important details.");
    } finally {
      setImportantSaving(false);
    }
  }, [id, importantDraft, importantSaving, load]);

  const loadTeam = useCallback(async () => {
    const r = roleFromToken(localStorage.getItem("token"));
    if (r !== "admin" && r !== "manager") {
      setTeam([]);
      return;
    }
    try {
      const res = await api.get("/admin/team-assignees");
      setTeam(res.data || []);
    } catch {
      setTeam([]);
    }
  }, []);

  useEffect(() => {
    if (!lead?._id) return;
    loadTeam();
  }, [lead?._id, loadTeam]);

  const loadAiControls = useCallback(async () => {
    try {
      const res = await api.get("/admin/settings");
      const s = res.data || {};
      const lim = Number(s.aiDailyReplyLimit || 100);
      const clean = Number.isFinite(lim) ? Math.min(1000, Math.max(1, Math.floor(lim))) : 100;
      setAiGlobalLimit(clean);
    } catch {
      /* ignore settings fetch errors */
    }
  }, []);

  useEffect(() => {
    if (!lead?._id) return;
    loadAiControls();
  }, [lead?._id, loadAiControls]);

  useEffect(() => {
    const onSettings = (e) => {
      const lim = e.detail?.aiDailyReplyLimit;
      if (!Number.isFinite(lim)) return;
      const clean = Math.min(1000, Math.max(1, Math.floor(lim)));
      setAiGlobalLimit(clean);
    };
    window.addEventListener("crm-settings-updated", onSettings);
    return () => window.removeEventListener("crm-settings-updated", onSettings);
  }, []);

  useEffect(() => {
    if (!lead?._id) return;
    const o = lead.extractedData?.aiDailyReplyLimitOverride;
    const has =
      o != null && Number.isFinite(Number(o)) && Number(o) >= 1;
    if (has) {
      const v = Math.min(1000, Math.max(1, Math.floor(Number(o))));
      setAiLeadLimitDraft(v);
      setAiLeadLimitStr(String(v));
    } else {
      setAiLeadLimitDraft(aiGlobalLimit);
      setAiLeadLimitStr(String(aiGlobalLimit));
    }
  }, [lead?._id, lead?.extractedData?.aiDailyReplyLimitOverride, aiGlobalLimit]);

  const phoneOrigin = useMemo(() => inferPhoneOrigin(lead?.phone), [lead?.phone]);

  const addChatFiles = (fileList) => {
    const picked = Array.from(fileList || []);
    if (picked.length === 0) return;
    setChatAttachments((prev) => [...prev, ...picked].slice(0, MAX_CHAT_ATTACHMENTS));
  };

  const removeChatAttachment = (index) => {
    setChatAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async () => {
    const text = msgInput.trim();
    if ((!text && chatAttachments.length === 0) || sending) return;
    setSending(true);
    setShowQuickReplies(false);
    try {
      if (chatAttachments.length > 0) {
        const fd = new FormData();
        fd.append("text", text);
        chatAttachments.forEach((f) => fd.append("attachments", f));
        const res = await api.post(`/admin/leads/${id}/message`, fd);
        const w = res.data?.whatsapp;
        if (w?.error) {
          window.alert(`Saved in CRM. WhatsApp delivery failed: ${w.error}`);
        } else if (w?.configured && !w?.sent && w?.skippedNoPhone) {
          window.alert("Saved in CRM. WhatsApp skipped — lead has no valid phone number.");
        }
      } else {
        const res = await api.post(`/admin/leads/${id}/message`, { text });
        const w = res.data?.whatsapp;
        if (w?.error) {
          window.alert(`Saved in CRM. WhatsApp delivery failed: ${w.error}`);
        } else if (w?.configured && !w?.sent && w?.skippedNoPhone) {
          window.alert("Saved in CRM. WhatsApp skipped — lead has no valid phone number.");
        }
      }
      setMsgInput("");
      setChatAttachments([]);
      await load();
    } catch (e) {
      console.error(e);
      window.alert(e.response?.data?.error || "Send failed.");
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const changeStatus = async (newStatus) => {
    setStatusUpdating(true);
    setShowStatusMenu(false);
    try {
      await api.patch(`/admin/leads/${id}/status`, { status: newStatus });
      setLead(prev => ({ ...prev, status: newStatus }));
    } catch (e) { console.error(e); }
    finally { setStatusUpdating(false); }
  };

  // FEATURE 5: Toggle tag
  const toggleTag = async (tag) => {
    const current = lead.tags || [];
    const updated = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
    setSavingTags(true);
    try {
      await api.patch(`/admin/leads/${id}/tags`, { tags: updated });
      setLead(prev => ({ ...prev, tags: updated }));
    } catch {
      /* ignore tag toggle errors */
    } finally {
      setSavingTags(false);
    }
  };

  const openWhatsApp = () => {
    const msg = `Hi${lead.name ? ` ${lead.name}` : ""}, this is Next Step International. I'd love to help you with your study abroad plans!`;
    window.open(`https://wa.me/${lead.phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const assignLead = async (assignedTo) => {
    if (!lead?._id) return;
    setAssigning(true);
    try {
      const res = await api.patch(`/admin/leads/${lead._id}/assign`, { assignedTo: assignedTo || null });
      setLead(res.data);
    } catch {
      /* ignore assign errors */
    } finally {
      setAssigning(false);
    }
  };

  const saveLeadAiLimitOverride = async () => {
    if (aiControlSaving || !lead?._id) return;
    const desired =
      aiLeadLimitDraft === aiGlobalLimit
        ? null
        : Math.min(1000, Math.max(1, Math.floor(Number(aiLeadLimitDraft))));
    const o = lead.extractedData?.aiDailyReplyLimitOverride;
    const current =
      o != null && Number.isFinite(Number(o)) && Number(o) >= 1
        ? Math.min(1000, Math.max(1, Math.floor(Number(o))))
        : null;
    const unchanged =
      (desired === null && current === null) ||
      (desired !== null && current !== null && desired === current);
    if (unchanged) return;

    setAiControlSaving(true);
    try {
      const res = await api.patch(`/admin/leads/${lead._id}/ai-reply-limit-override`, {
        aiDailyReplyLimitOverride: desired,
      });
      setLead(res.data);
    } catch {
      alert("Failed to save this lead's AI limit. Try again.");
    } finally {
      setAiControlSaving(false);
    }
  };

  const clearChat = async () => {
    if (!lead?._id || clearingChat) return;
    const ok = window.confirm("Clear all chat messages for this lead? This cannot be undone.");
    if (!ok) return;
    setClearingChat(true);
    try {
      await api.post(`/admin/leads/${lead._id}/clear-chat`);
      setShowQuickReplies(false);
      await load();
      window.dispatchEvent(new CustomEvent("crm-notifications-updated"));
    } catch {
      alert("Failed to clear chat. Please try again.");
    } finally {
      setClearingChat(false);
    }
  };

  if (leadLoading) return <LeadProfileShellSkeleton />;
  if (!lead) return <div style={{ padding: 40, color: "#D64B2A", fontSize: 14 }}>Lead not found.</div>;

  const myRole = roleFromToken(localStorage.getItem("token"));
  const canAssignLeads = myRole === "admin" || myRole === "manager";
  const canEditImportantDetails = myRole !== "viewer";
  const assignedId =
    typeof lead.assignedTo === "object" && lead.assignedTo?._id
      ? String(lead.assignedTo._id)
      : lead.assignedTo
        ? String(lead.assignedTo)
        : "";
  const assignedLabel =
    typeof lead.assignedTo === "object" && lead.assignedTo?.name
      ? `${lead.assignedTo.name}${
          lead.assignedTo.jobTitle ? ` — ${lead.assignedTo.jobTitle}` : ""
        } (${lead.assignedTo.role || "staff"})`
      : null;

  const myUserId = userIdFromToken(localStorage.getItem("token"));
  const collaboratorIds = Array.isArray(lead.assignedCollaborators)
    ? lead.assignedCollaborators
        .map((c) =>
          typeof c === "object" && c?._id != null
            ? String(c._id)
            : c != null
              ? String(c)
              : null
        )
        .filter(Boolean)
    : [];
  const iAmPrimaryOwner =
    Boolean(myUserId && assignedId && String(assignedId) === String(myUserId));
  const iAmCollaboratorOnly =
    Boolean(myUserId) &&
    !iAmPrimaryOwner &&
    collaboratorIds.some((id) => String(id) === String(myUserId));
  const assignedToMe = iAmPrimaryOwner || iAmCollaboratorOnly;

  const displayName = lead.name || "WhatsApp User";
  const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const convProb = getConversionProbability(lead);
  const nextAction = getNextAction(lead);
  const followUp = getFollowUpStatus(lead);
  const messages = lead.messages || [];
  const currentTags = lead.tags || [];
  const storedLeadOverride = lead.extractedData?.aiDailyReplyLimitOverride;
  const hasLeadOverride =
    storedLeadOverride != null &&
    Number.isFinite(Number(storedLeadOverride)) &&
    Number(storedLeadOverride) >= 1;
  const aiDailyLimit = Math.max(
    1,
    hasLeadOverride
      ? Math.min(1000, Math.max(1, Math.floor(Number(storedLeadOverride))))
      : Number(aiGlobalLimit || import.meta.env.VITE_DAILY_AI_REPLY_LIMIT || 100)
  );
  const desiredOverrideNorm =
    aiLeadLimitDraft === aiGlobalLimit
      ? null
      : Math.min(1000, Math.max(1, Math.floor(Number(aiLeadLimitDraft))));
  const currentOverrideNorm =
    hasLeadOverride
      ? Math.min(1000, Math.max(1, Math.floor(Number(storedLeadOverride))))
      : null;
  const aiLeadLimitDirty =
    (desiredOverrideNorm === null && currentOverrideNorm !== null) ||
    (desiredOverrideNorm !== null &&
      (currentOverrideNorm === null || desiredOverrideNorm !== currentOverrideNorm));
  /** Cap shown next to count: preview draft while editing so 11/50 matches the box before Save. */
  const draftCapForDisplay =
    aiLeadLimitStr.trim() === ""
      ? aiLeadLimitDraft
      : Math.min(1000, Math.max(1, Math.floor(Number(aiLeadLimitStr)) || aiLeadLimitDraft));
  const shownReplyCap = aiLeadLimitDirty ? draftCapForDisplay : aiDailyLimit;
  const aiDailyDate = String(lead.extractedData?.aiDailyDate || "");
  const aiDailyCount = Number(lead.extractedData?.aiDailyCount || 0);
  const aiCountToday = aiDailyDate === new Date().toISOString().slice(0, 10) ? aiDailyCount : 0;
  const resetAtMs = Date.parse(String(lead.extractedData?.aiLimitResetAt || ""));
  const limitReachedToday = aiCountToday >= aiDailyLimit;
  const aiResetCountdownActive =
    limitReachedToday && Number.isFinite(resetAtMs);

  const leadsListPath = "/leads";
  const leadsListLabel = "All Leads";

  return (
    <div className="lead-profile-shell" style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "var(--font-body)", minHeight: 0 }}>

      {/* LEFT PANEL */}
      <div className={`lead-profile-sidebar ${mobileSidebarOpen ? "is-mobile-open" : ""}`} style={{ width: 300, minWidth: 300, background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>

        {/* Back + Header */}
        <div style={{ padding: "16px 20px 0", borderBottom: "1px solid var(--border)", paddingBottom: 16, position: "relative" }}>
          <button onClick={() => navigate(leadsListPath)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "var(--text-3)", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 14, fontFamily: "var(--font-body)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            {leadsListLabel}
          </button>
          <button
            type="button"
            className="lead-profile-mobile-close"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close lead details"
          >
            ✕
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: lead.score >= 70 ? "#FEF0EC" : lead.score >= 40 ? "#FEF3DC" : "#EEF1FD", color: lead.score >= 70 ? "#D64B2A" : lead.score >= 40 ? "#D08A12" : "#4361EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" }}>{displayName}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2, fontFamily: "ui-monospace, monospace" }}>{lead.phone}</div>
              {phoneOrigin && (
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700, color: "var(--text-2)" }}>{phoneOrigin.country}</span>
                  <span style={{ marginLeft: 6, opacity: 0.9 }}>{phoneOrigin.dialDisplay}</span>
                  {phoneOrigin.iso ? (
                    <span style={{ marginLeft: 6, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{phoneOrigin.iso}</span>
                  ) : null}
                </div>
              )}
            </div>
            <ScoreRing score={lead.score || 0} size={44} />
          </div>

          {assignedToMe ? (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgb(67 97 238 / 0.08)",
                border: "1px solid rgb(67 97 238 / 0.28)",
                fontSize: 12,
                color: "var(--text)",
                lineHeight: 1.5,
              }}
            >
              <span style={{ fontWeight: 700 }}>
                {iAmPrimaryOwner ? "Assigned to you" : "You're on this lead"}
              </span>
              {" — "}
              {iAmPrimaryOwner ? (
                <>
                  You are the primary owner of this lead as{" "}
                  <strong style={{ fontFamily: "var(--font-heading)" }}>
                    {typeof lead.assignedTo === "object" && lead.assignedTo?.name
                      ? lead.assignedTo.name
                      : "this account"}
                  </strong>
                  . Follow up with the student from this page.
                </>
              ) : (
                <>
                  You're collaborating on this lead with the team. Follow up with the student from this page.
                </>
              )}
            </div>
          ) : null}

          {/* Status */}
          <div style={{ marginTop: 12, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusBadge status={lead.status} />
              <button onClick={() => setShowStatusMenu(v => !v)} disabled={statusUpdating} style={{ fontSize: 11, color: "var(--text-3)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                Change ▾
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-3)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              AI replies today:{" "}
              <span style={{ color: aiCountToday >= shownReplyCap - 1 ? "var(--danger)" : "var(--text-2)" }}>
                {aiCountToday}/{shownReplyCap}
              </span>
              {aiLeadLimitDirty ? (
                <span style={{ fontWeight: 600, color: "var(--text-3)", fontSize: 10 }}>
                  · save to apply
                </span>
              ) : null}
              <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                <button
                  type="button"
                  disabled={aiControlSaving || aiLeadLimitDraft <= 1}
                  onClick={() => {
                    const n = Math.max(1, aiLeadLimitDraft - 1);
                    setAiLeadLimitDraft(n);
                    setAiLeadLimitStr(String(n));
                  }}
                  style={{ padding: "2px 7px", border: "none", background: "var(--surface-2)", cursor: aiControlSaving || aiLeadLimitDraft <= 1 ? "not-allowed" : "pointer" }}
                >
                  -
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={aiControlSaving}
                  value={aiLeadLimitStr}
                  onChange={(e) => {
                    const s = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setAiLeadLimitStr(s);
                    if (s !== "") {
                      const n = Math.min(1000, Math.max(1, Math.floor(Number(s))));
                      setAiLeadLimitDraft(n);
                    }
                  }}
                  onBlur={() => {
                    if (aiLeadLimitStr === "") {
                      setAiLeadLimitStr(String(aiLeadLimitDraft));
                      return;
                    }
                    const n = Math.min(1000, Math.max(1, Math.floor(Number(aiLeadLimitStr))));
                    setAiLeadLimitDraft(n);
                    setAiLeadLimitStr(String(n));
                  }}
                  style={{
                    width: 36,
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-2)",
                    padding: "4px 4px",
                    border: "none",
                    background: "var(--surface)",
                    textAlign: "center",
                    fontFamily: "ui-monospace, monospace",
                  }}
                />
                <button
                  type="button"
                  disabled={aiControlSaving || aiLeadLimitDraft >= 1000}
                  onClick={() => {
                    const n = Math.min(1000, aiLeadLimitDraft + 1);
                    setAiLeadLimitDraft(n);
                    setAiLeadLimitStr(String(n));
                  }}
                  style={{ padding: "2px 7px", border: "none", background: "var(--surface-2)", cursor: aiControlSaving || aiLeadLimitDraft >= 1000 ? "not-allowed" : "pointer" }}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                disabled={aiControlSaving || !aiLeadLimitDirty}
                onClick={() => saveLeadAiLimitOverride()}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: aiControlSaving || !aiLeadLimitDirty ? "var(--text-3)" : "var(--accent)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "2px 7px",
                  cursor: aiControlSaving || !aiLeadLimitDirty ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                {aiControlSaving ? "Saving..." : "Save for this number"}
              </button>
              <AiLimitResetCountdown resetAtMs={resetAtMs} active={aiResetCountdownActive} />
            </div>
            {showStatusMenu && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-md)", overflow: "hidden", minWidth: 150 }}>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <button key={key} onClick={() => changeStatus(key)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", background: key === lead.status ? cfg.bg : "transparent", color: cfg.color, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", fontFamily: "var(--font-body)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                    {cfg.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable details — CRM intel first, then tags/details/summary (top-down on whole page) */}
        <div
          className="lead-sidebar-details-scroll"
          style={{
            flex: 1,
            overflow: "auto",
            overflowAnchor: "none",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            padding: "16px 20px",
          }}
        >
          {sidebarIntelReady ? (
          /* CRM Intelligence */
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
            <ProbabilityBar value={convProb} />
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Next Action</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: nextAction.color + "10", border: `1px solid ${nextAction.color}30`, borderRadius: 8, padding: "8px 10px" }}>
                <span style={{ fontSize: 16 }}>{nextAction.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: nextAction.color }}>{nextAction.text}</span>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Follow-up Status</div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: followUp.bg, color: followUp.color, fontSize: 11, fontWeight: 700 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: followUp.color }} />
                {followUp.label}
              </span>
            </div>
          </div>
          ) : (
            <LeadSidebarIntelSkeleton />
          )}

          {sidebarRestReady ? (
            <>
          {/* FEATURE 5: Tags */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Tags</div>
              <button onClick={() => setShowTagMenu(v => !v)} style={{ fontSize: 10, color: "var(--accent)", background: "var(--accent-light)", border: "none", borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 600 }}>
                {showTagMenu ? "Done" : "+ Edit"}
              </button>
            </div>

            {/* Current tags */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: showTagMenu ? 10 : 0 }}>
              {currentTags.length === 0 && !showTagMenu && (
                <span style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>No tags yet</span>
              )}
              {currentTags.map(tag => {
                const cfg = TAG_COLORS[tag] || { bg: "#F1F2F8", color: "#7C84A0" };
                return (
                  <span key={tag} onClick={() => !savingTags && toggleTag(tag)} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em" }}>
                    {tag.replace(/_/g, " ")} ×
                  </span>
                );
              })}
            </div>

            {/* Tag selector */}
            {showTagMenu && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {ALL_TAGS.filter(t => !currentTags.includes(t)).map(tag => {
                  const palette = TAG_COLORS[tag];
                  return (
                    <span
                      key={tag}
                      onClick={() => !savingTags && toggleTag(tag)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 8px",
                        borderRadius: 12,
                        background: palette.bg,
                        border: `1px solid ${palette.color}44`,
                        color: palette.color,
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: "pointer",
                        letterSpacing: "0.02em",
                      }}
                    >
                      + {tag.replace(/_/g, " ")}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lead details */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Lead Details</div>
            <div style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, marginBottom: 5 }}>Assigned To</div>
              {canAssignLeads ? (
                <select
                  value={assignedId}
                  disabled={assigning}
                  onChange={(e) => assignLead(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    background: "var(--surface)",
                  }}
                >
                  <option value="">Unassigned</option>
                  {team.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                      {u.jobTitle ? ` — ${u.jobTitle}` : ""} ({u.role})
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
                  {assignedToMe ? (
                    iAmCollaboratorOnly ? (
                      <span>
                        Collaborating <span style={{ color: "var(--text-3)", fontWeight: 500 }}>(you)</span>
                        {assignedLabel ? (
                          <span style={{ fontSize: 12, color: "var(--text-2)", display: "block", marginTop: 6 }}>
                            Primary: {assignedLabel}
                          </span>
                        ) : null}
                      </span>
                    ) : typeof lead.assignedTo === "object" && lead.assignedTo?.name ? (
                      <>
                        <strong>{lead.assignedTo.name}</strong>
                        <span style={{ color: "var(--text-3)", fontWeight: 500 }}> (you)</span>
                        <span style={{ fontSize: 12, color: "var(--text-2)", display: "block", marginTop: 6 }}>
                          {[lead.assignedTo.jobTitle, lead.assignedTo.role || "staff"].filter(Boolean).join(" · ")}
                        </span>
                      </>
                    ) : (
                      <span>Assigned to you</span>
                    )
                  ) : (
                    assignedLabel || "Unassigned"
                  )}
                </div>
              )}
              {!canAssignLeads ? (
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, lineHeight: 1.45 }}>
                  Only admins and managers can change assignment. Ask an admin to assign this lead.
                </div>
              ) : null}
              {collaboratorIds.length > 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 8, lineHeight: 1.45 }}>
                  Also on this lead:{" "}
                  {lead.assignedCollaborators
                    .map((c) =>
                      typeof c === "object" && c?.name ? c.name : c != null ? String(c) : ""
                    )
                    .filter(Boolean)
                    .join(", ")}
                </div>
              ) : null}
            </div>
            <InfoRow label="Country" value={lead.countryInterest} />
            <InfoRow label="Course" value={lead.courseInterest} />
            <InfoRow label="Budget" value={lead.budget} />
            <InfoRow label="Source" value={lead.source || "Direct"} />
            <InfoRow label="Messages" value={messages.length} />
            <InfoRow label="Last Active" value={lead.lastActivity ? formatLastActivity(lead.lastActivity) : "Never"} />
            <InfoRow
              label="Phone"
              value={
                <span style={{ display: "block" }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", display: "block" }}>{lead.phone}</span>
                  {phoneOrigin ? (
                    <span
                      style={{
                        display: "block",
                        fontSize: 11,
                        color: "var(--text-3)",
                        marginTop: 6,
                        fontFamily: "var(--font-body)",
                        fontWeight: 500,
                        lineHeight: 1.45,
                      }}
                    >
                      Line / SIM region:{" "}
                      <strong style={{ color: "var(--text-2)", fontWeight: 700 }}>{phoneOrigin.country}</strong>
                      {" · "}
                      {phoneOrigin.dialDisplay}
                      {phoneOrigin.iso ? ` (${phoneOrigin.iso})` : ""}
                    </span>
                  ) : (
                    <span style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
                      Country code could not be detected — number may be missing country prefix.
                    </span>
                  )}
                </span>
              }
            />

            {/* Important details + AI Summary — directly under Phone */}
            <div style={{ marginTop: 14 }}>
              {/* Student-stated facts — synced to WhatsApp AI */}
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(30, 158, 94, 0.06), rgba(30, 158, 94, 0.02))",
                  border: "1px solid rgba(30, 158, 94, 0.22)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#1E9E5E", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Important details (from chat)
                  </span>
                  {canEditImportantDetails ? (
                    <button
                      type="button"
                      onClick={saveImportantDetails}
                      disabled={importantSaving}
                      style={{
                        fontSize: 10,
                        color: "var(--accent)",
                        background: "var(--accent-light)",
                        border: "none",
                        borderRadius: 5,
                        padding: "3px 10px",
                        cursor: importantSaving ? "wait" : "pointer",
                        fontFamily: "var(--font-body)",
                        fontWeight: 600,
                      }}
                    >
                      {importantSaving ? "Saving…" : "Save"}
                    </button>
                  ) : null}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 8, lineHeight: 1.45 }}>
                  Auto-updated when the student shares facts (e.g. name). Corrections replace old lines. The WhatsApp assistant uses this—no need to search the full thread for their name.
                </div>
                <textarea
                  value={importantDraft}
                  onChange={(e) => setImportantDraft(e.target.value)}
                  readOnly={!canEditImportantDetails}
                  placeholder={"e.g. Prefers to be called Khan\nInterested in MBBS in Georgia\nIELTS 6.5"}
                  rows={5}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: "var(--font-body)",
                    color: "var(--text)",
                    background: canEditImportantDetails ? "var(--surface)" : "var(--surface-2)",
                    lineHeight: 1.55,
                    resize: "vertical",
                    minHeight: 88,
                    cursor: canEditImportantDetails ? "text" : "default",
                  }}
                />
              </div>

              {/* FEATURE 6: AI Summary */}
              <div style={{ background: "linear-gradient(135deg, #4361EE10, #4361EE05)", border: "1px solid #4361EE25", borderRadius: 10, padding: "12px 14px", marginBottom: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#4361EE", textTransform: "uppercase", letterSpacing: "0.06em" }}>🧠 AI Summary</span>
                  <button onClick={fetchSummary} style={{ fontSize: 10, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>↺ Refresh</button>
                </div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 8, lineHeight: 1.45 }}>
                  Refreshes every 10 messages (10, 20, …). Long chats use start + recent messages for the summary—not every line. Same blurb is used in Analytics; use Refresh for a new pass.
                </div>
                {summaryLoading ? (
                  <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>Generating summary...</div>
                ) : aiSummaryDisplay ? (
                  <p style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.6, margin: 0 }}>{aiSummaryDisplay}</p>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>No conversation to summarize yet.</div>
                )}
              </div>
            </div>
          </div>

          {lead.notes && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, background: "#FFFDE7", padding: "10px 12px", borderRadius: 8, border: "1px solid #FFF3C4" }}>{lead.notes}</div>
            </div>
          )}
            </>
          ) : sidebarIntelReady ? (
            <LeadSidebarRestSkeleton />
          ) : null}
        </div>

        {/* Quick Actions */}
        {isMobileView ? (
          <div className="lead-profile-mobile-drawer-controls">
            <div
              style={{
                marginBottom: 10,
                paddingBottom: 10,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" }}>
                Conversation
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                {messages.length} message{messages.length !== 1 ? "s" : ""} · {displayName}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setShowQuickReplies((v) => !v);
                  setMobileSidebarOpen(false);
                }}
                className="lead-profile-mobile-info-btn"
              >
                ⚡ Quick Replies
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!clearingChat && messages.length > 0) {
                    clearChat();
                    setMobileSidebarOpen(false);
                  }
                }}
                disabled={clearingChat || messages.length === 0}
                className="lead-profile-mobile-info-btn"
                style={{
                  color: clearingChat || messages.length === 0 ? "var(--text-3)" : "var(--danger)",
                }}
              >
                {clearingChat ? "Clearing..." : "Clear Chat"}
              </button>
            </div>
            <span
              style={{
                display: "inline-flex",
                marginTop: 8,
                padding: "4px 10px",
                borderRadius: 6,
                background: nextAction.color + "15",
                color: nextAction.color,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {nextAction.icon} {nextAction.text}
            </span>
          </div>
        ) : null}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <button onClick={openWhatsApp} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", background: "#25D366", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.99 0C5.368 0 0 5.374 0 12c0 2.115.552 4.097 1.513 5.816L.057 23.28a.985.985 0 001.207 1.207l5.472-1.458A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.617 0 11.99 0zm.01 21.818a9.814 9.814 0 01-5.006-1.368l-.36-.214-3.727.979.998-3.648-.235-.374A9.818 9.818 0 012.182 12c0-5.42 4.402-9.818 9.818-9.818 5.417 0 9.818 4.399 9.818 9.818 0 5.42-4.401 9.818-9.818 9.818z"/></svg>
            WhatsApp
          </button>
          <button onClick={() => window.open(`tel:${lead.phone}`)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.01 2.2 2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14v2.92z"/></svg>
            Call
          </button>
        </div>
      </div>

      <button
        type="button"
        className={`lead-profile-mobile-overlay ${mobileSidebarOpen ? "is-open" : ""}`}
        aria-label="Close lead details"
        onClick={() => setMobileSidebarOpen(false)}
      />

      {/* RIGHT PANEL: Chat */}
      <div className="lead-profile-chat" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", minHeight: 0, minWidth: 0 }}>

        {/* Chat header */}
        <div className="lead-profile-chat-header" style={{ padding: "14px 20px", background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "var(--shadow-sm)" }}>
          {isMobileView ? (
            <div
              className="lead-profile-mobile-summary-trigger"
              role="button"
              tabIndex={0}
              onClick={() => setMobileSidebarOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setMobileSidebarOpen(true);
                }
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minWidth: 0 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: lead.score >= 70 ? "#FEF0EC" : lead.score >= 40 ? "#FEF3DC" : "#EEF1FD", color: lead.score >= 70 ? "#D64B2A" : lead.score >= 40 ? "#D08A12" : "#4361EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {initials}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {lead.phone} · {(STATUS_CONFIG[lead.status] || STATUS_CONFIG.new).label}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    AI replies today: {aiCountToday}/{shownReplyCap}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {!isMobileView ? (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" }}>Conversation</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 1 }}>{messages.length} message{messages.length !== 1 ? "s" : ""} · {displayName}</div>
            </div>
          ) : null}
          {!isMobileView ? (
          <div className="lead-profile-chat-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* FEATURE 2: Quick replies toggle */}
            <button onClick={() => setShowQuickReplies(v => !v)} style={{ padding: "6px 12px", background: showQuickReplies ? "var(--accent)" : "var(--surface-2)", color: showQuickReplies ? "#fff" : "var(--text-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
              ⚡ Quick Replies
            </button>
            <span style={{ padding: "4px 10px", borderRadius: 6, background: nextAction.color + "15", color: nextAction.color, fontSize: 11, fontWeight: 700 }}>
              {nextAction.icon} {nextAction.text}
            </span>
            <button
              onClick={clearChat}
              disabled={clearingChat || messages.length === 0}
              style={{
                padding: "6px 12px",
                background: clearingChat || messages.length === 0 ? "var(--border)" : "var(--surface-2)",
                color: clearingChat || messages.length === 0 ? "var(--text-3)" : "var(--danger)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: clearingChat || messages.length === 0 ? "not-allowed" : "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              {clearingChat ? "Clearing..." : "Clear Chat"}
            </button>
          </div>
          ) : null}
        </div>

        {/* Messages area + scroll-to-bottom */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            ref={chatScrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const distanceFromBottom =
                el.scrollHeight - (el.scrollTop + el.clientHeight);
              shouldAutoScrollRef.current = distanceFromBottom < 80;
              setShowScrollDownBtn(distanceFromBottom > 100);
            }}
            className="chat-scroll-panel lead-chat-messages-scroll"
            style={{ flex: 1, minHeight: 0, padding: "20px 24px" }}
          >
            {messages.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-2)" }}>No messages yet</div>
                <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>Send the first message or wait for the lead to reach out.</div>
                <button onClick={openWhatsApp} style={{ marginTop: 16, padding: "10px 20px", background: "#25D366", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                  Start on WhatsApp
                </button>
              </div>
            ) : chatThreadReady ? (
              messages.map((msg, i) => <ChatBubble key={i} msg={msg} />)
            ) : (
              <LeadChatThreadSkeleton />
            )}
            <div ref={chatEndRef} />
          </div>
          {chatThreadReady && messages.length > 0 && showScrollDownBtn ? (
            <button
              type="button"
              aria-label="Scroll to latest messages"
              title="Jump to bottom"
              onClick={scrollToBottomSmooth}
              style={{
                position: "absolute",
                right: 18,
                bottom: 14,
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--accent)",
                boxShadow: "0 4px 14px rgb(15 23 42 / 0.12)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 4,
                padding: 0,
                fontFamily: "var(--font-body)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            </button>
          ) : null}
        </div>

        {/* FEATURE 2: Quick reply panel */}
        {showQuickReplies && (
          <div style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", padding: "12px 20px", flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Quick Replies — click to fill</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {QUICK_REPLIES.map(({ label, text }) => (
                <button
                  key={label}
                  onClick={() => { setMsgInput(text); setShowQuickReplies(false); }}
                  style={{
                    padding: "6px 12px", fontSize: 12, fontWeight: 600,
                    background: "var(--surface-2)", color: "var(--text)",
                    border: "1px solid var(--border)", borderRadius: 8,
                    cursor: "pointer", fontFamily: "var(--font-body)",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-light)"; e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message input */}
        <div style={{ padding: "12px 20px", background: "var(--surface)", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label
              title="Attach files (max 5)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 42,
                height: 42,
                flexShrink: 0,
                borderRadius: 10,
                border: "1.5px solid var(--border)",
                background: "var(--surface-2)",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                userSelect: "none",
              }}
            >
              <input
                type="file"
                multiple
                style={{ display: "none" }}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                onChange={(e) => {
                  addChatFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              📎
            </label>
            <textarea
              value={msgInput}
              onChange={e => setMsgInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
              rows={2}
              style={{ flex: 1, padding: "10px 14px", border: "1.5px solid var(--border)", borderRadius: 12, fontSize: 14, fontFamily: "var(--font-body)", color: "var(--text)", background: "var(--surface)", resize: "none", lineHeight: 1.5 }}
            />
            <button
              onClick={sendMessage}
              disabled={sending || (!msgInput.trim() && chatAttachments.length === 0)}
              style={{ padding: "10px 18px", height: 42, background: sending || (!msgInput.trim() && chatAttachments.length === 0) ? "var(--border)" : "var(--accent)", color: sending || (!msgInput.trim() && chatAttachments.length === 0) ? "var(--text-3)" : "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: sending || (!msgInput.trim() && chatAttachments.length === 0) ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", flexShrink: 0, transition: "all 0.15s" }}
            >
              {sending ? "..." : "Send"}
            </button>
          </div>
          {chatAttachments.length > 0 ? (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>Attached ({chatAttachments.length}/{MAX_CHAT_ATTACHMENTS}):</span>
              {chatAttachments.map((f, i) => (
                <span
                  key={`${f.name}-${f.size}-${i}`}
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 8,
                    background: "var(--accent-light)",
                    color: "var(--accent)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {f.name}
                  <button
                    type="button"
                    onClick={() => removeChatAttachment(i)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "inherit",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                    aria-label="Remove attachment"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
