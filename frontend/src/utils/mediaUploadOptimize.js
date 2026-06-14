/**
 * Compress CMS uploads before they hit R2 — high quality, smaller files, faster website.
 * Images: WebP ~92% quality, max 1920px (in a Web Worker so the CRM UI stays smooth).
 * Videos: sent via server for ffmpeg (faststart MP4, no browser lag).
 */

function isOptimizableImage(file) {
  if (!file || !/^image\//i.test(file.type || "")) return false;
  if (/^image\/(svg\+xml|gif)/i.test(file.type)) return false;
  return true;
}

function isVideoFile(file) {
  return Boolean(file && /^video\//i.test(file.type || ""));
}

function formatSavedPct(before, after) {
  if (!before || after >= before) return 0;
  return Math.round((1 - after / before) * 100);
}

export async function prepareMediaForUpload(file, { onPhase } = {}) {
  if (!file) return { file, optimized: false, forceServerUpload: false, savedPct: 0 };

  if (isVideoFile(file)) {
    return { file, optimized: false, forceServerUpload: true, savedPct: 0 };
  }

  if (!isOptimizableImage(file)) {
    return { file, optimized: false, forceServerUpload: false, savedPct: 0 };
  }

  if (file.size <= 400 * 1024 && /\.webp$/i.test(file.name || "")) {
    return { file, optimized: false, forceServerUpload: false, savedPct: 0 };
  }

  onPhase?.("optimizing");
  try {
    const { default: imageCompression } = await import("browser-image-compression");
    const compressed = await imageCompression(file, {
      maxSizeMB: 2.5,
      maxWidthOrHeight: 1920,
      initialQuality: 0.92,
      useWebWorker: true,
      fileType: "image/webp",
      preserveExif: false,
    });
    const base = (file.name || "photo").replace(/\.[^.]+$/, "") || "photo";
    const outFile = new File([compressed], `${base}.webp`, {
      type: compressed.type || "image/webp",
      lastModified: Date.now(),
    });
    const savedPct = formatSavedPct(file.size, outFile.size);
    return {
      file: outFile,
      optimized: savedPct >= 3,
      forceServerUpload: false,
      savedPct,
    };
  } catch (err) {
    console.warn("Client image optimize failed, uploading original:", err?.message || err);
    return { file, optimized: false, forceServerUpload: false, savedPct: 0 };
  }
}

export { isOptimizableImage, isVideoFile };
