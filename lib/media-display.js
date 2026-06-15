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

/** Merge legacy program.image with program.images[] (deduped, ordered). */
function normalizeProgramImages(program) {
  if (!program || typeof program !== "object") return [];
  const list = Array.isArray(program.images)
    ? program.images.map((u) => String(u || "").trim()).filter(Boolean)
    : [];
  const single = String(program.image || "").trim();
  if (single && !list.includes(single)) list.unshift(single);
  return list;
}

module.exports = {
  stripMediaFilename,
  isLikelyCmsMediaUrl,
  normalizeProgramImages,
};
