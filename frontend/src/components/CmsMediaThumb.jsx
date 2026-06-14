import { useEffect, useState } from "react";
import api from "../api/api";

function isVideoMime(mime, url) {
  if (String(mime || "").startsWith("video/")) return true;
  return /\.(mp4|webm|mov)(\?|$)/i.test(String(url || ""));
}

/** Loads CRM thumbnails via authenticated preview (works when R2 URL is private). */
export default function CmsMediaThumb({ media, height = 140, style = {} }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let blobUrl = "";
    let cancelled = false;

    async function load() {
      if (!media?.url) {
        setSrc("");
        return;
      }
      setFailed(false);
      const needsProxy =
        media.storage === "r2" ||
        String(media.url).startsWith("/uploads/website-cms/") ||
        /\/cms\//i.test(String(media.url || ""));

      if (needsProxy) {
        try {
          const res = await api.get("/admin/website-cms/media/preview", {
            params: {
              key: media.key || "",
              url: media.url,
            },
            responseType: "blob",
          });
          if (cancelled) return;
          blobUrl = URL.createObjectURL(res.data);
          setSrc(blobUrl);
          return;
        } catch {
          if (!cancelled) {
            setFailed(true);
            setSrc("");
          }
          return;
        }
      }
      setSrc(media.url);
    }

    load();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [media?.url, media?.key, media?.storage]);

  const boxStyle = {
    width: "100%",
    height,
    objectFit: "cover",
    display: "block",
    background: "#0a1f44",
    ...style,
  };

  if (failed || !src) {
    return (
      <div
        style={{
          ...boxStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,.7)",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {failed ? "Preview unavailable" : "Loading…"}
      </div>
    );
  }

  if (isVideoMime(media?.mime, media?.url)) {
    return <video src={src} style={boxStyle} muted playsInline controls preload="metadata" />;
  }

  return <img src={src} alt={media?.name || ""} style={boxStyle} />;
}

export { isVideoMime };
