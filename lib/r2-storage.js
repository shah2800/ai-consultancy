const crypto = require("crypto");
const path = require("path");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

let cachedClient = null;

function r2Config() {
  return {
    accountId: String(process.env.R2_ACCOUNT_ID || "").trim(),
    accessKeyId: String(process.env.R2_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: String(process.env.R2_SECRET_ACCESS_KEY || "").trim(),
    bucket: String(process.env.R2_BUCKET_NAME || "").trim(),
    publicBaseUrl: String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
  };
}

function isR2Configured() {
  const c = r2Config();
  return !!(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket && c.publicBaseUrl);
}

function getR2Client() {
  if (!isR2Configured()) return null;
  if (cachedClient) return cachedClient;
  const c = r2Config();
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
    },
  });
  return cachedClient;
}

function sanitizeCmsExt(originalName, mime) {
  const ext = path.extname(String(originalName || "")).toLowerCase().slice(0, 12);
  if (ext.match(/^\.(jpe?g|png|gif|webp|mp4|webm|mov|pdf)$/i)) return ext;
  const m = String(mime || "").toLowerCase();
  if (m.includes("jpeg")) return ".jpg";
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("gif")) return ".gif";
  if (m.includes("mp4")) return ".mp4";
  if (m.includes("webm")) return ".webm";
  if (m.includes("quicktime")) return ".mov";
  if (m.includes("pdf")) return ".pdf";
  return "";
}

function buildCmsObjectKey(tenantId, originalName, mime) {
  const safeExt = sanitizeCmsExt(originalName, mime);
  const tenant = String(tenantId || "shared").replace(/[^a-zA-Z0-9_-]/g, "");
  return `cms/${tenant}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`;
}

function publicUrlForKey(key) {
  const base = r2Config().publicBaseUrl;
  const k = String(key || "").replace(/^\/+/, "");
  return `${base}/${k}`;
}

async function uploadBufferToR2({ key, buffer, contentType }) {
  const client = getR2Client();
  if (!client) throw new Error("R2 is not configured.");
  await client.send(
    new PutObjectCommand({
      Bucket: r2Config().bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    })
  );
  return publicUrlForKey(key);
}

async function createPresignedPutUrl({ key, contentType, expiresIn = 3600 }) {
  const client = getR2Client();
  if (!client) throw new Error("R2 is not configured.");
  const command = new PutObjectCommand({
    Bucket: r2Config().bucket,
    Key: key,
    ContentType: contentType || "application/octet-stream",
  });
  return getSignedUrl(client, command, { expiresIn });
}

async function deleteR2Object(key) {
  const client = getR2Client();
  if (!client || !key) return false;
  await client.send(
    new DeleteObjectCommand({
      Bucket: r2Config().bucket,
      Key: key,
    })
  );
  return true;
}

async function testR2Connection() {
  if (!isR2Configured()) {
    return { ok: false, configured: false, error: "R2 env vars not set (see docs/CLOUDFLARE-SETUP.md)." };
  }
  try {
    const client = getR2Client();
    await client.send(new HeadBucketCommand({ Bucket: r2Config().bucket }));
    return {
      ok: true,
      configured: true,
      bucket: r2Config().bucket,
      publicBaseUrl: r2Config().publicBaseUrl,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      error: String(err?.message || err || "R2 connection failed"),
    };
  }
}

function getR2StorageStatus() {
  const c = r2Config();
  return {
    configured: isR2Configured(),
    bucket: c.bucket || "",
    publicBaseUrl: c.publicBaseUrl || "",
    accountIdSet: !!c.accountId,
    accessKeySet: !!c.accessKeyId,
    secretKeySet: !!c.secretAccessKey,
  };
}

function cmsKeyPrefixForTenant(tenantId) {
  const tenant = String(tenantId || "shared").replace(/[^a-zA-Z0-9_-]/g, "");
  return `cms/${tenant}/`;
}

async function getR2ObjectStream(key, range) {
  const client = getR2Client();
  if (!client) throw new Error("R2 is not configured.");
  const params = {
    Bucket: r2Config().bucket,
    Key: key,
  };
  if (range && range.start != null) {
    params.Range =
      range.end != null ? `bytes=${range.start}-${range.end}` : `bytes=${range.start}-`;
  }
  const res = await client.send(new GetObjectCommand(params));
  return {
    body: res.Body,
    contentType: res.ContentType || "application/octet-stream",
    contentLength: res.ContentLength,
    contentRange: res.ContentRange,
    acceptRanges: res.AcceptRanges,
  };
}

async function headR2Object(key) {
  const client = getR2Client();
  if (!client) throw new Error("R2 is not configured.");
  const res = await client.send(
    new HeadObjectCommand({
      Bucket: r2Config().bucket,
      Key: key,
    })
  );
  return {
    contentType: res.ContentType || "application/octet-stream",
    contentLength: res.ContentLength,
    acceptRanges: res.AcceptRanges,
  };
}

function resolveKeyFromPublicUrl(url) {
  const base = r2Config().publicBaseUrl;
  const raw = String(url || "").trim();
  if (!base || !raw.startsWith(base)) return "";
  return raw.slice(base.length).replace(/^\/+/, "");
}

module.exports = {
  isR2Configured,
  buildCmsObjectKey,
  cmsKeyPrefixForTenant,
  publicUrlForKey,
  uploadBufferToR2,
  createPresignedPutUrl,
  deleteR2Object,
  getR2ObjectStream,
  headR2Object,
  resolveKeyFromPublicUrl,
  testR2Connection,
  getR2StorageStatus,
};
