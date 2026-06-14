/**
 * Upload website/images/hero.webp to CRM media (R2) and set as hero banner.
 *
 * Option A — CRM login (uses live API, same as Website CMS UI):
 *   CRM_EMAIL=you@example.com CRM_PASSWORD=secret API_BASE=https://www.nextstepinternationals.com node scripts/upload-hero-to-cms.js
 *
 * Option B — Direct Mongo + R2 (same as server, no login):
 *   MONGO_URI=... WEBSITE_TENANT_USER_ID=... R2_*=... node scripts/upload-hero-to-cms.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const mongoose = require("mongoose");
const FormData = require("form-data");

const {
  uploadBufferToR2,
  buildCmsObjectKey,
  publicUrlForKey,
  isR2Configured,
} = require("../lib/r2-storage");
const { deepMerge } = require("../lib/website-cms-defaults");

const HERO_PATH = path.join(__dirname, "..", "website", "images", "hero.webp");
const API_BASE = String(process.env.API_BASE || "https://ai-consultancy-2dk0.onrender.com").replace(/\/+$/, "");

const websiteContentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    content: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

function readHeroFile() {
  if (!fs.existsSync(HERO_PATH)) {
    throw new Error(`Hero file not found: ${HERO_PATH}`);
  }
  const buffer = fs.readFileSync(HERO_PATH);
  return { buffer, name: "hero-banner.webp", mime: "image/webp" };
}

async function uploadViaApi() {
  const email = String(process.env.CRM_EMAIL || "").trim();
  const password = String(process.env.CRM_PASSWORD || "").trim();
  if (!email || !password) {
    throw new Error("Set CRM_EMAIL and CRM_PASSWORD for API upload.");
  }

  const login = await axios.post(
    `${API_BASE}/auth/login`,
    { email, password },
    { timeout: 60000, validateStatus: () => true }
  );
  if (login.status !== 200 || !login.data?.token) {
    throw new Error(login.data?.error || `Login failed (${login.status})`);
  }
  const token = login.data.token;
  const headers = { Authorization: `Bearer ${token}` };

  const { buffer, name, mime } = readHeroFile();
  const fd = new FormData();
  fd.append("file", buffer, { filename: name, contentType: mime });

  const upload = await axios.post(`${API_BASE}/admin/website-cms/media`, fd, {
    headers: { ...headers, ...fd.getHeaders() },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 120000,
    validateStatus: () => true,
  });
  if (upload.status !== 201 || !upload.data?.media?.url) {
    throw new Error(upload.data?.error || `Upload failed (${upload.status})`);
  }
  const media = upload.data.media;

  const current = await axios.get(`${API_BASE}/admin/website-cms`, { headers, timeout: 60000 });
  const prev = current.data?.content || {};
  const patch = deepMerge(prev, {
    hero: { heroImage: media.url },
    media: [media, ...(Array.isArray(prev.media) ? prev.media.filter((m) => m.url !== media.url) : [])],
  });

  const save = await axios.put(
    `${API_BASE}/admin/website-cms`,
    { content: patch },
    { headers: { ...headers, "Content-Type": "application/json" }, timeout: 60000, validateStatus: () => true }
  );
  if (save.status !== 200) {
    throw new Error(save.data?.error || `Save failed (${save.status})`);
  }

  return { mode: "api", url: media.url, message: save.data?.message || "Website updated." };
}

async function uploadViaMongo() {
  const tenantRaw = String(process.env.WEBSITE_TENANT_USER_ID || "").trim();
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing.");
  if (!tenantRaw || !mongoose.Types.ObjectId.isValid(tenantRaw)) {
    throw new Error("WEBSITE_TENANT_USER_ID missing or invalid.");
  }
  if (!isR2Configured()) {
    throw new Error("R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL).");
  }

  const { buffer, name, mime } = readHeroFile();
  const key = buildCmsObjectKey(tenantRaw, name, mime);
  await uploadBufferToR2({ key, buffer, contentType: mime });
  const url = publicUrlForKey(key);
  const item = {
    id: key,
    key,
    url,
    storage: "r2",
    name,
    mime,
    size: buffer.length,
    optimized: true,
    uploadedAt: new Date().toISOString(),
  };

  const WebsiteContent = mongoose.models.WebsiteContent || mongoose.model("WebsiteContent", websiteContentSchema);
  await mongoose.connect(uri);

  const existing = await WebsiteContent.findOne({ userId: tenantRaw }).lean();
  const prevMedia = Array.isArray(existing?.content?.media) ? existing.content.media : [];
  const merged = deepMerge(existing?.content || {}, {
    hero: { heroImage: url },
    media: [item, ...prevMedia.filter((m) => m.url !== url)],
  });

  await WebsiteContent.findOneAndUpdate(
    { userId: tenantRaw },
    { $set: { content: merged } },
    { upsert: true, new: true }
  );

  return { mode: "mongo", url, message: "Hero saved to MongoDB + R2." };
}

async function main() {
  const hasCrm = process.env.CRM_EMAIL && process.env.CRM_PASSWORD;
  const hasMongo = process.env.MONGO_URI && process.env.WEBSITE_TENANT_USER_ID;

  if (!hasCrm && !hasMongo) {
    console.error(
      "Missing credentials. Set CRM_EMAIL + CRM_PASSWORD (API) or MONGO_URI + WEBSITE_TENANT_USER_ID + R2_* (direct)."
    );
    process.exit(1);
  }

  try {
    const result = hasCrm ? await uploadViaApi() : await uploadViaMongo();
    console.log("OK", result.mode);
    console.log("heroImage:", result.url);
    console.log(result.message);
  } catch (err) {
    console.error("FAILED:", err?.response?.data?.error || err?.message || err);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  }
}

main();
