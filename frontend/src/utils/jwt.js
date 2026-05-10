/**
 * Decode JWT payload (browser). Handles base64url encoding used by jsonwebtoken.
 */
export function parseJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b64.length % 4)) % 4;
    const padded = b64 + "=".repeat(pad);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function roleFromToken(token) {
  const p = parseJwtPayload(token);
  return String(p?.role || "");
}

export function emailFromToken(token) {
  const p = parseJwtPayload(token);
  return typeof p?.email === "string" ? p.email.trim() : "";
}

/** Mongo user id from JWT (`id` claim), for matching lead assignment. */
export function userIdFromToken(token) {
  const p = parseJwtPayload(token);
  if (!p) return "";
  const id = p.id ?? p.sub ?? p.userId;
  return id != null ? String(id) : "";
}
