/** Strip upload file extensions from labels shown on the public website. */
function stripMediaFilename(name) {
  return String(name || "")
    .replace(/\.(jpe?g|png|gif|webp|avif|mp4|webm|mov|m4v|pdf)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyCmsMediaUrl(url) {
  const u = String(url || "").trim();
  if (!u) return false;
  if (u.includes("/cms/")) return true;
  if (/^\/uploads\/website-cms\//i.test(u)) return true;
  return false;
}

module.exports = {
  stripMediaFilename,
  isLikelyCmsMediaUrl,
};
