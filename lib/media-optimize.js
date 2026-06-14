const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

let sharp = null;
try {
  sharp = require("sharp");
} catch {
  console.warn("sharp not installed — CMS image optimization disabled on server.");
}

let ffmpegPath = null;
try {
  ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
} catch {
  console.warn("ffmpeg not available — CMS video optimization disabled on server.");
}

const IMAGE_MAX_EDGE = 1920;
/** WebP 88 ≈ high visual quality, much smaller than raw JPEG/PNG. */
const IMAGE_WEBP_QUALITY = 88;
const VIDEO_CRF = 23;
const VIDEO_MAX_HEIGHT = 1080;

function swapExtension(name, ext) {
  const base = String(name || "upload").replace(/\.[^.]+$/, "") || "upload";
  return base + (ext || "");
}

async function optimizeImageBuffer(buffer, mime) {
  if (!buffer || !sharp) {
    return { buffer, mime, ext: null, unchanged: true };
  }
  const type = String(mime || "").toLowerCase();
  if (/svg|gif|pdf/.test(type)) {
    return { buffer, mime, ext: null, unchanged: true };
  }
  if (type === "image/webp" && buffer.length <= 600 * 1024) {
    return { buffer, mime, ext: null, unchanged: true };
  }

  try {
    const meta = await sharp(buffer, { failOn: "none" }).metadata();
    let pipeline = sharp(buffer, { failOn: "none" }).rotate();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (w > IMAGE_MAX_EDGE || h > IMAGE_MAX_EDGE) {
      pipeline = pipeline.resize({
        width: IMAGE_MAX_EDGE,
        height: IMAGE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const webp = await pipeline.webp({ quality: IMAGE_WEBP_QUALITY, effort: 4 }).toBuffer();
    if (webp.length >= buffer.length * 0.92 && /jpe?g|webp|png/.test(type)) {
      return { buffer, mime, ext: null, unchanged: true };
    }
    return { buffer: webp, mime: "image/webp", ext: ".webp", optimized: true };
  } catch (err) {
    console.warn("optimizeImageBuffer:", err?.message || err);
    return { buffer, mime, ext: null, unchanged: true };
  }
}

async function optimizeVideoBuffer(buffer, originalName) {
  if (!buffer || !ffmpegPath) {
    return { buffer, mime: inferVideoMime(originalName), ext: null, unchanged: true };
  }
  if (buffer.length <= 6 * 1024 * 1024 && /\.mp4$/i.test(String(originalName || ""))) {
    return { buffer, mime: "video/mp4", ext: null, unchanged: true };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cms-vid-"));
  const inExt = path.extname(originalName || "") || ".mp4";
  const inPath = path.join(tmpDir, `in${inExt}`);
  const outPath = path.join(tmpDir, "out.mp4");

  try {
    fs.writeFileSync(inPath, buffer);
    await execFileAsync(
      ffmpegPath,
      [
        "-i",
        inPath,
        "-c:v",
        "libx264",
        "-crf",
        String(VIDEO_CRF),
        "-preset",
        "faster",
        "-vf",
        "scale=-2:'min(1080,ih)'",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-y",
        outPath,
      ],
      { timeout: 300000, maxBuffer: 20 * 1024 * 1024 }
    );
    const out = fs.readFileSync(outPath);
    if (!out.length || out.length >= buffer.length * 0.97) {
      return { buffer, mime: inferVideoMime(originalName), ext: null, unchanged: true };
    }
    return { buffer: out, mime: "video/mp4", ext: ".mp4", optimized: true };
  } catch (err) {
    console.warn("optimizeVideoBuffer:", err?.message || err);
    return { buffer, mime: inferVideoMime(originalName), ext: null, unchanged: true };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function inferVideoMime(name) {
  const ext = path.extname(String(name || "")).toLowerCase();
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  return "video/mp4";
}

async function optimizeMediaUpload(buffer, mime, originalName) {
  const type = String(mime || "").toLowerCase();
  if (/^image\//.test(type)) {
    const result = await optimizeImageBuffer(buffer, type);
    return { ...result, name: result.ext ? swapExtension(originalName, result.ext) : originalName };
  }
  if (/^video\//.test(type)) {
    const result = await optimizeVideoBuffer(buffer, originalName);
    return { ...result, name: result.ext ? swapExtension(originalName, result.ext) : originalName };
  }
  return { buffer, mime, ext: null, unchanged: true, name: originalName };
}

module.exports = {
  optimizeMediaUpload,
  optimizeImageBuffer,
  optimizeVideoBuffer,
  swapExtension,
};
