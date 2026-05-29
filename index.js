require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const fs = require("fs");
const multer = require("multer");
const FormData = require("form-data");
const mongoose = require("mongoose");
const axios = require("axios");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

let compression = null;
try { compression = require("compression"); } catch { /* optional */ }

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {
  console.warn("nodemailer not installed; run npm install in project root for password reset emails.");
}

const { calculatePriority, enrichLead } = require("./utils/calculatePriority");

const app = express();

/* ============================================================
   CONFIG
============================================================ */

/* Gzip all API responses — biggest single speed win */
if (compression) {
  app.use(compression({ level: 6, threshold: 1024 }));
}

app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

function normalizeOrigin(origin) {
  const raw = String(origin || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "").toLowerCase();
}

const corsAllowlist = new Set(
  [
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGINS,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
  ]
    .filter(Boolean)
    .flatMap((v) => String(v).split(","))
    .map((s) => normalizeOrigin(s))
    .filter(Boolean)
);

app.use(
  cors({
    origin: (origin, cb) => {
      /* Allow same-origin, server-to-server, Postman/curl (no Origin header). */
      if (!origin) return cb(null, true);
      /* Allow localhost and 127.0.0.1 on any port (dev CRM + website form). */
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        return cb(null, true);
      }
      /* Allow file:// → browser sends Origin: "null" (the string).
         Only in non-production so the public website form works when opened directly. */
      if (origin === "null" && process.env.NODE_ENV !== "production") {
        return cb(null, true);
      }
      if (corsAllowlist.size === 0) return cb(null, true);
      if (corsAllowlist.has(normalizeOrigin(origin))) return cb(null, true);
      return cb(new Error("CORS blocked for origin"));
    },
  })
);

app.use(
  "/uploads/website-leads",
  express.static(path.join(__dirname, "uploads", "website-leads"), {
    maxAge: "7d",
    immutable: false,
    etag: true,
    lastModified: true,
  })
);

const websiteDir = fs.existsSync(path.join(__dirname, "website"))
  ? path.join(__dirname, "website")
  : path.join(__dirname, "..", "website");
if (fs.existsSync(websiteDir)) {
  app.use("/site", express.static(websiteDir));
  /* Also serve website at root so custom domain works without /site prefix */
  app.use("/", express.static(websiteDir, { index: false }));
}

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI missing");
}

if (!process.env.GROQ_API_KEY) {
  if (String(process.env.ALLOW_MISSING_AI_KEYS || "").toLowerCase() === "true") {
    console.warn("⚠️ GROQ_API_KEY missing — set it for AI/WhatsApp features. ALLOW_MISSING_AI_KEYS=true bypasses startup.");
  } else {
    throw new Error(
      "GROQ_API_KEY missing (set ALLOW_MISSING_AI_KEYS=true only for local dev without AI)"
    );
  }
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET missing");
}

if (String(process.env.JWT_SECRET).length < 24) {
  console.warn("⚠️ JWT_SECRET is weak. Use 24+ random characters in production.");
}

const ALLOW_PUBLIC_REGISTER = process.env.ALLOW_PUBLIC_REGISTER !== "false";
const DAILY_AI_REPLY_LIMIT = Math.max(
  1,
  Number(process.env.DAILY_AI_REPLY_LIMIT || 100)
);

/** Comma-separated emails that always receive the `manager` role (cannot be demoted below manager). */
function permanentManagerEmails() {
  return String(process.env.PERMANENT_MANAGER_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isPermanentManagerEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return permanentManagerEmails().includes(e);
}

/**
 * Optional platform operators who may edit global public signup even when not workspace owner.
 * Set MAIN_ADMIN_EMAIL=admin@gmail.com or PLATFORM_ADMIN_EMAILS=comma@list.com
 */
function platformOperatorEmails() {
  const extra = String(process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const main = String(process.env.MAIN_ADMIN_EMAIL || "").trim().toLowerCase();
  const set = new Set(extra);
  if (main) set.add(main);
  return [...set];
}

/* ============================================================
   DATABASE
============================================================ */

mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 20,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 8000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  heartbeatFrequencyMS: 15000,
})
  .then(() => {
    console.log("🟢 MongoDB Connected");
    const pm = permanentManagerEmails();
    if (pm.length) {
      console.log(`   Permanent managers (env): ${pm.join(", ")}`);
    }
    const plat = platformOperatorEmails();
    if (plat.length) {
      console.log(`   Platform admins — global signup UI (env): ${plat.join(", ")}`);
    }
    startInactivityFollowupScheduler();
    startPassportExpiryScheduler();
  })
  .catch((err) => console.log("❌ Mongo Error:", err));

/* ============================================================
   HELPERS
============================================================ */

function safeJSONParse(raw, fallback = null) {
  try {
    if (!raw) return fallback;

    const cleaned = String(raw)
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

/** Strip markdown fences and trim (Groq often wraps JSON in ```json). */
function stripJsonFences(raw) {
  return String(raw || "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/**
 * Parse first complete `{ ... }` in text, respecting strings (so `{` inside quotes does not confuse depth).
 */
function extractBalancedJsonObject(text) {
  const s = stripJsonFences(text);
  const start = s.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const c = s[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }

    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const slice = s.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/**
 * Model sometimes emits prose + JSON keys without a leading `{` / `"summary":` (broken start).
 * Example: `The bottleneck is visa.", "insights": [ ...`
 */
function repairProseThenJsonKeys(raw) {
  const s = stripJsonFences(raw);
  if (s.startsWith("{")) return null;

  const marker = /"\s*,\s*"insights"\s*:\s*/;
  const m = s.match(marker);
  if (!m || m.index == null) return null;

  const head = s.slice(0, m.index).trim();
  const tailFromInsights = s.slice(m.index + m[0].length);
  const summaryText = head.replace(/^["']+|["']+$/g, "").trim();
  if (!summaryText) return null;

  const stitched = `{"summary":${JSON.stringify(
    summaryText
  )},"insights":${tailFromInsights}`;
  try {
    return JSON.parse(stitched);
  } catch {
    return null;
  }
}

/**
 * Best-effort parse for analytics LLM output (strict JSON, embedded object, or prose+JSON hybrid).
 */
function parseAnalyticsLLMOutput(raw) {
  const cleaned = stripJsonFences(raw);
  if (!cleaned) {
    return { summary: "Analysis completed." };
  }

  const direct = safeJSONParse(cleaned, null);
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct;
  }

  const extracted = extractBalancedJsonObject(cleaned);
  if (extracted && typeof extracted === "object" && !Array.isArray(extracted)) {
    return extracted;
  }

  const repaired = repairProseThenJsonKeys(cleaned);
  if (repaired && typeof repaired === "object") {
    return repaired;
  }

  return { summary: cleaned };
}

function normalizeAnalyticsPayload(
  raw,
  totalLeads = 0,
  analyzedConversations = 0,
  metaExtras = {}
) {
  const data = raw && typeof raw === "object" ? raw : {};

  const normalizedTopTopics = Array.isArray(data.topTopics)
    ? data.topTopics.map((topic, index) => {
        if (typeof topic === "string") {
          return {
            topic,
            percentage: Math.max(10, 100 - index * 15),
            description: "Frequently discussed by prospective students.",
          };
        }

        return {
          topic: topic?.topic || `Topic ${index + 1}`,
          percentage: Number(topic?.percentage) || Math.max(10, 100 - index * 15),
          description: topic?.description || "Frequently discussed by prospective students.",
        };
      })
    : [];

  const normalizedInsights = Array.isArray(data.insights)
    ? data.insights.map((item) => ({
        title: item?.title || "General insight",
        detail: item?.detail || "No detail provided.",
        urgency: ["high", "medium", "low"].includes(item?.urgency) ? item.urgency : "medium",
      }))
    : [];

  const normalizedMissingInfo = Array.isArray(data.missingInfo)
    ? data.missingInfo.map((item) => ({
        issue: item?.issue || "Missing response detail",
        recommendation: item?.recommendation || "Add clearer AI guidance for this topic.",
      }))
    : [];

  const normalizedSuggestions = Array.isArray(data.suggestions)
    ? data.suggestions.map((item) => ({
        title: item?.title || "Prompt refinement",
        reason: item?.reason || "Improve reply quality and conversion focus.",
        prompt: item?.prompt || "Keep replies short, clear, and ask one follow-up question.",
      }))
    : [];

  let summary = data.summary || "Analysis completed.";
  if (typeof summary === "string") {
    const leakIdx = summary.search(
      /"\s*,\s*"(?:insights|topTopics|missingInfo|suggestions|conversionInsights)"\s*:/
    );
    if (leakIdx > 12) {
      summary = summary.slice(0, leakIdx).replace(/["\s]+$/g, "").trim() || summary;
    }
  }

  return {
    summary,
    topTopics: normalizedTopTopics,
    insights: normalizedInsights,
    missingInfo: normalizedMissingInfo,
    suggestions: normalizedSuggestions,
    conversionInsights: {
      bottleneck: data?.conversionInsights?.bottleneck || "",
      bestConvertingTopic: data?.conversionInsights?.bestConvertingTopic || "",
      avgMessagesToConvert: data?.conversionInsights?.avgMessagesToConvert || "",
    },
    meta: {
      totalLeads,
      analyzedConversations,
      generatedAt: new Date().toISOString(),
      ...metaExtras,
    },
  };
}

async function groqChat({
  model = "llama-3.1-8b-instant",
  messages = [],
  temperature = 0.3,
  max_tokens = 300,
}) {
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model,
        messages,
        temperature,
        max_tokens,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        timeout: 30000,
      }
    );

    return response.data?.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.log("❌ GROQ ERROR:", err?.response?.data || err.message);

    if (err?.response?.status === 429) {
      return "AI is busy right now. Please try again shortly.";
    }

    return "Sorry, something went wrong.";
  }
}

/** CRM lead AI summary: refresh when total messages hit 10, 20, 30, … (Analytics uses `aiSummary` only). */
const AI_SUMMARY_MESSAGE_INTERVAL = 10;

function leadMessageSummaryBand(messageCount) {
  const n = Math.max(0, Number(messageCount) || 0);
  return n >= AI_SUMMARY_MESSAGE_INTERVAL
    ? Math.floor(n / AI_SUMMARY_MESSAGE_INTERVAL) * AI_SUMMARY_MESSAGE_INTERVAL
    : 0;
}

/**
 * Builds transcript text for AI summary. Short threads: all messages. Long threads:
 * first messages (how it started) + recent messages (current state); middle omitted with a count so
 * 100/1000-msg chats are still useful without sending megabytes to Groq.
 */
function buildLeadConversationSampleForSummary(messages) {
  const arr = Array.isArray(messages) ? messages : [];
  const n = arr.length;
  if (n === 0) return "";

  const MAX_SAMPLE_CHARS = 14_000;
  const PER_MSG_CHARS = 260;

  const formatLine = (m) => {
    const role = String(m.role || "?");
    let body = String(m.content || "").replace(/\s+/g, " ").trim();
    if (body.length > PER_MSG_CHARS) body = `${body.slice(0, PER_MSG_CHARS)}…`;
    return `${role}: ${body}`;
  };

  /** Include full thread when small enough to stay within model prompt limits. */
  const FULL_THREAD_MAX_MESSAGES = 48;

  let text;
  if (n <= FULL_THREAD_MAX_MESSAGES) {
    text = arr.map(formatLine).join("\n");
  } else {
    const HEAD = 8;
    const TAIL = Math.min(56, Math.max(1, n - HEAD));
    const omitted = Math.max(0, n - HEAD - TAIL);
    text = [
      `(Thread has ${n} messages; excerpt = how it started + most recent — middle not sent to AI.)`,
      "",
      "--- Start ---",
      ...arr.slice(0, HEAD).map(formatLine),
      "",
      `[… ${omitted} messages omitted …]`,
      "",
      "--- Recent ---",
      ...arr.slice(-TAIL).map(formatLine),
    ].join("\n");
  }

  if (text.length > MAX_SAMPLE_CHARS) {
    text = `${text.slice(0, MAX_SAMPLE_CHARS)}…`;
  }
  return text;
}

async function generateLeadAiSummaryGroq(lead) {
  if (!lead.messages?.length) return "";
  const facts =
    lead.importantDetails && String(lead.importantDetails).trim()
      ? `Student-stated facts (CRM):\n${String(lead.importantDetails).trim()}\n\n`
      : "";
  const sample = facts + buildLeadConversationSampleForSummary(lead.messages);

  return groqChat({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
        content: `Summarize this lead conversation for a CRM admin in 2-3 short lines. Include intent, blockers, and next best action.
If the excerpt says messages were omitted, you only see the beginning and recent messages—infer cautiously and mention uncertainty if needed.\n\n${sample}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 140,
  });
}

function assignLeadAiSummaryFields(lead, summaryText) {
  const n = lead.messages?.length || 0;
  lead.aiSummary = summaryText;
  lead.aiSummaryAt = new Date();
  lead.aiSummaryMilestone = leadMessageSummaryBand(n);
}

/** After new messages are saved: regenerate summary when crossing 10, 20, 30, … total messages. */
async function maybeAutoRefreshLeadAiSummary(lead) {
  const n = lead.messages?.length || 0;
  const band = leadMessageSummaryBand(n);
  const prev = Number(lead.aiSummaryMilestone || 0);
  if (band < AI_SUMMARY_MESSAGE_INTERVAL || band <= prev) return false;
  try {
    const summary = await generateLeadAiSummaryGroq(lead);
    assignLeadAiSummaryFields(lead, summary);
    await lead.save();
    return true;
  } catch (err) {
    console.log("Auto AI summary refresh failed:", err?.message || err);
    return false;
  }
}

async function createNotification(userId, type, message, leadId = null) {
  try {
    if (type === "new_message" && leadId) {
      const existing = await Notification.findOne({
        userId,
        type,
        leadId,
      }).sort({ createdAt: -1 });

      if (existing) {
        existing.message = message;
        if (existing.read) {
          // Fresh unread burst after user already viewed previous thread.
          existing.count = 1;
          existing.read = false;
        } else {
          existing.count = Math.max(1, Number(existing.count || 0) + 1);
        }
        await existing.save();
      } else {
        await Notification.create({
          userId,
          type,
          message,
          leadId,
          read: false,
          count: 1,
        });
      }
      return;
    }

    await Notification.create({
      userId,
      type,
      message,
      leadId,
      count: 1,
    });
  } catch (_) {}
}

function extractLeadSignals(text = "") {
  const raw = String(text || "").toLowerCase();
  const extracted = {};
  const tags = [];

  if (/\bgeorgia\b/.test(raw)) {
    extracted.countryInterest = "Georgia";
    tags.push("georgia");
  } else if (/\bturkey\b/.test(raw)) {
    extracted.countryInterest = "Turkey";
    tags.push("turkey");
  } else if (/\bchina\b/.test(raw)) {
    extracted.countryInterest = "China";
    tags.push("china");
  }

  if (/\bmbbs\b/.test(raw)) {
    extracted.courseInterest = "MBBS";
    tags.push("mbbs");
  } else if (/\bengineering\b/.test(raw)) {
    extracted.courseInterest = "Engineering";
  } else if (/\bbusiness\b/.test(raw)) {
    extracted.courseInterest = "Business";
  } else if (/\blaw\b/.test(raw)) {
    extracted.courseInterest = "Law";
  } else if (/\bcs\b|\bcomputer science\b/.test(raw)) {
    extracted.courseInterest = "CS";
  }

  const budgetMatch = raw.match(/\$?\s?(\d{3,6})/);
  if (budgetMatch) extracted.budget = budgetMatch[1];

  if (/\bielts\b/.test(raw)) extracted.ieltsStatus = "mentioned";
  if (/\bvisa\b/.test(raw)) {
    extracted.visaConcern = "yes";
    tags.push("visa_help");
  }
  if (/\bscholarship\b/.test(raw)) {
    extracted.scholarshipInterest = "yes";
    tags.push("scholarship");
  }
  if (/\burgent\b|\basap\b|\bimmediately\b/.test(raw)) {
    extracted.urgency = "high";
    tags.push("urgent");
  }

  let emotion = "neutral";
  if (/\bconfused\b|\bdon't understand\b|\bnot clear\b/.test(raw)) emotion = "confused";
  else if (/\bexcited\b|\bhappy\b/.test(raw)) emotion = "excited";
  else if (/\bnervous\b|\bworried\b/.test(raw)) emotion = "nervous";
  else if (/\bfrustrated\b|\bangry\b/.test(raw)) emotion = "frustrated";
  else if (/\burgent\b|\basap\b/.test(raw)) emotion = "urgent";
  else if (/\binterested\b|\bi want\b|\bi need\b/.test(raw)) emotion = "interested";

  return { extracted, tags, emotion };
}

function applyAutomationRules(lead) {
  const tags = Array.isArray(lead.tags) ? lead.tags : [];
  const hasUrgentTag = tags.includes("urgent");
  const highIntent = (lead.score || 0) >= 70 || tags.includes("high_intent");
  const hasMessages = (lead.messages || []).length > 0;
  const hasAdminReply = (lead.messages || []).some((m) => m.role === "admin");

  if (hasUrgentTag && !["converted", "lost"].includes(lead.status)) {
    lead.status = "hot";
  }

  if (highIntent && !["converted", "lost"].includes(lead.status)) {
    lead.status = "ready";
  }

  if (hasMessages && !hasAdminReply && !lead.followUpDate) {
    lead.followUpDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    lead.followUpNote = "First response pending";
  }
}

function extractNameFromMessage(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const blockedNameTokens = new Set([
    "hi",
    "hello",
    "hey",
    "ok",
    "okay",
    "yes",
    "no",
    "nhi",
    "nahi",
    "hmm",
  ]);

  const patterns = [
    /(?:my name is|i am|i'm)\s+([a-zA-Z][a-zA-Z\s.'-]{1,40})/i,
    /(?:this is)\s+([a-zA-Z][a-zA-Z\s.'-]{1,40})/i,
    /(?:name is)\s+([a-zA-Z][a-zA-Z\s.'-]{1,40})/i,
    /(?:my name)\s+([a-zA-Z][a-zA-Z\s.'-]{1,40})/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      let candidate = match[1].trim().replace(/\s+/g, " ");
      candidate = candidate
        .replace(/\b(is|am|i'm|my|name)\b/gi, "")
        .trim();
      if (candidate.length >= 2 && !blockedNameTokens.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }

  // Fallback: "ali here", "it's ali", "this is ali khan"
  const shortNameMatch = raw.match(/\b(?:it's|its|here is|here)\s+([a-zA-Z][a-zA-Z\s.'-]{1,30})/i);
  if (shortNameMatch?.[1]) {
    return shortNameMatch[1].trim().replace(/\s+/g, " ");
  }

  return "";
}

function shouldIgnoreForPersonalFacts(text = "") {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return true;
  const compact = t.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  if (!compact) return true;

  const softNoise = new Set([
    "hi",
    "hello",
    "hey",
    "ok",
    "okay",
    "yes",
    "no",
    "nhi",
    "nahi",
    "hmm",
    "hmmm",
    "i",
  ]);
  if (softNoise.has(compact)) return true;

  const introPattern = /\b(my name is|name is|i am|i'm|this is)\b/i;
  if (introPattern.test(t)) return false;

  const words = compact.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && compact.length <= 8) return true;
  return false;
}

function extractConfirmedStudentName(history = []) {
  const arr = Array.isArray(history) ? history : [];
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const m = arr[i] || {};
    const role = String(m.role || "").toLowerCase();
    if (role !== "user") continue;
    const name = extractNameFromMessage(String(m.content || ""));
    if (name) return name;
  }
  return "";
}

function lastUserGreetingIntent(history = []) {
  const arr = Array.isArray(history) ? history : [];
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const m = arr[i] || {};
    const role = String(m.role || "").toLowerCase();
    if (role !== "user") continue;
    const text = String(m.content || "").trim().toLowerCase();
    if (!text) return false;
    return /^(hi|hello|hey)\b/.test(text);
  }
  return false;
}

function sanitizeReplyNameUsage(reply, confirmedName, history = []) {
  const text = String(reply || "").trim();
  if (!text) return "";
  let next = text;

  if (confirmedName) return next;

  // If no confirmed name, avoid "Hi <Name>" style hallucinated greetings.
  next = next.replace(
    /^\s*(hi|hello|hey)\s+[a-zA-Z][a-zA-Z\s.'-]{1,25}([,!])?\s*/i,
    "Hi! "
  );

  // Only keep greeting when the latest user message was a greeting.
  if (!lastUserGreetingIntent(history)) {
    next = next
      .replace(/^\s*(hi|hello|hey)[!,.]?\s*/i, "")
      .trimStart();
  }

  return next;
}

/* ============================================================
   MODELS
============================================================ */

// AUTH USER
const authSchema = new mongoose.Schema(
  {
    name: String,

    email: {
      type: String,
      unique: true,
    },

    /* Shown in Settings / team lists; optional subtitle e.g. "Senior consultant". */
    jobTitle: {
      type: String,
      default: "",
    },

    /**
     * When set, this account uses another user's CRM workspace (leads, settings, WhatsApp config).
     * The owner's `_id` is stored here. Primary consultants leave this unset (they own their workspace).
     */
    workspaceOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuthUser",
      default: null,
      index: true,
    },

    password: String,

    role: {
      type: String,
      enum: ["admin", "manager", "staff", "viewer"],
      default: "admin",
    },

    assignedLeads: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Lead",
      },
    ],

    passwordResetTokenHash: String,
    passwordResetExpires: Date,

    /* When false, login and password reset are blocked (team admin control). */
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const AuthUser = mongoose.model("AuthUser", authSchema);

/* Singleton app flags (public signup, etc.). Env ALLOW_PUBLIC_REGISTER is the default until an admin saves from the panel. */
const appConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: "global",
    },
    allowPublicRegister: {
      type: Boolean,
      default: null,
    },
  },
  { timestamps: true }
);

const AppConfig = mongoose.model("AppConfig", appConfigSchema);

/** Invite-only signup links (new consultancy owner or workspace team member). Raw token is shown once; only SHA-256 hash is stored. */
const signupInviteSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    kind: { type: String, enum: ["owner", "member"], required: true },
    /** Workspace owner id for member invites; unset for owner (new consultancy) invites */
    workspaceOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuthUser",
      default: null,
      index: true,
    },
    /** If set, signup email must match (case-insensitive) */
    email: { type: String, default: "" },
    role: {
      type: String,
      enum: ["admin", "manager", "staff", "viewer"],
      default: "staff",
    },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuthUser",
      default: null,
    },
  },
  { timestamps: true }
);

const SignupInvite = mongoose.model("SignupInvite", signupInviteSchema);

/** Pending email-verification OTP for signup flows (public + invite). */
const signupOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    sentAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

const SignupOtp = mongoose.model("SignupOtp", signupOtpSchema);

function hashSignupInviteToken(raw) {
  return crypto.createHash("sha256").update(String(raw), "utf8").digest("hex");
}

function generateSignupInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Public signup visibility: once an admin saves from the panel, MongoDB wins on every request.
 * Env vars apply only when nothing has been stored yet (no boolean on AppConfig).
 */
async function getEffectiveAllowPublicRegister() {
  try {
    const doc = await AppConfig.findOne({ key: "global" }).lean();
    if (doc && typeof doc.allowPublicRegister === "boolean") {
      return doc.allowPublicRegister;
    }
  } catch (e) {
    console.log("AppConfig read failed:", e?.message || e);
  }
  const explicit = process.env.ALLOW_PUBLIC_REGISTER;
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return ALLOW_PUBLIC_REGISTER;
}

async function setAppAllowPublicRegister(value) {
  await AppConfig.findOneAndUpdate(
    { key: "global" },
    { $set: { key: "global", allowPublicRegister: value } },
    { upsert: true, new: true }
  );
}

async function findAuthUserByEmail(email) {
  const raw = String(email || "").trim();
  if (!raw) return null;
  return AuthUser.findOne({
    email: new RegExp(`^${escapeRegex(raw)}$`, "i"),
  });
}

// LEAD
const leadSchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuthUser",
      default: null,
    },

    /** Additional teammates working this lead together with assignedTo (optional). Max enforced in API. */
    assignedCollaborators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AuthUser",
      },
    ],

    name: String,
    phone: String,
    email: String,

    countryInterest: String,
    courseInterest: String,
    budget: String,

    source: {
      type: String,
      default: "Direct",
    },

    notes: String,

    /**
     * Facts the student stated about themselves (name, goals, etc.).
     * Updated by AI from inbound messages (corrections replace older facts). Fed to WhatsApp AI so it need not re-scan full chat.
     */
    importantDetails: {
      type: String,
      default: "",
    },

    internalNotes: [
      {
        text: String,
        by: String,
        at: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    tags: {
      type: [String],
      default: [],
    },

    emotion: {
      type: String,
      default: "neutral",
    },

    emotionHistory: [
      {
        emotion: String,
        at: Date,
      },
    ],

    status: {
      type: String,
      default: "new",
    },

    score: {
      type: Number,
      default: 0,
    },

    priorityScore: {
      type: Number,
      default: 0,
    },

    conversionProbability: {
      type: Number,
      default: 0,
    },

    extractedData: {
      intakeDate: String,
      ieltsStatus: String,
      visaConcern: String,
      scholarshipInterest: String,
      urgency: String,
      aiDailyDate: String,
      aiDailyCount: {
        type: Number,
        default: 0,
      },
      /** When set (1–1000), caps this lead's AI replies per day instead of Settings.aiDailyReplyLimit. */
      aiDailyReplyLimitOverride: Number,
      aiLimitResetAt: String,
    },

    lastActivity: Date,
    followUpDate: Date,
    followUpNote: String,

    aiSummary: String,
    aiSummaryAt: Date,
    /** Last 10-message band (10, 20, …) used for `aiSummary`; drives auto-refresh at 10, 20, 30… msgs. */
    aiSummaryMilestone: {
      type: Number,
      default: 0,
    },

    suggestedReply: String,

    mergedFrom: [
      {
        type: mongoose.Schema.Types.ObjectId,
      },
    ],

    isMerged: {
      type: Boolean,
      default: false,
    },

    activityLog: [
      {
        type: {
          type: String,
        },

        description: String,

        at: {
          type: Date,
          default: Date.now,
        },

        by: String,
      },
    ],

    messages: [
      {
        role: String,
        content: String,
        /** Outbound WhatsApp delivery metadata (admin UI only). */
        whatsappDeliveryChannel: {
          type: String,
          default: "",
        },
        whatsappDeliveryStatus: {
          type: String,
          default: "",
        },
        whatsappDeliveryError: {
          type: String,
          default: "",
        },
        whatsappDeliveredAt: Date,
        /** WhatsApp inbound: text | image | video | document | audio | sticker | unknown */
        kind: {
          type: String,
          default: "text",
        },
        caption: {
          type: String,
          default: "",
        },
        mediaFilename: {
          type: String,
          default: "",
        },
        mimeType: {
          type: String,
          default: "",
        },
        /** WhatsApp Cloud media id — used to fetch image/document/video via Graph API */
        whatsappMediaId: {
          type: String,
          default: "",
        },
        /** WhatsApp Cloud inbound message id for deduping webhook retries */
        whatsappMessageId: {
          type: String,
          default: "",
        },
        at: Date,
      },
    ],

    /**
     * Public website application + admissions workflow (staff edit in CRM; optional for WhatsApp-only leads).
     */
    admissionProfile: {
      fullName: { type: String, default: "" },
      fatherName: { type: String, default: "" },
      dob: { type: Date, default: null },
      gender: { type: String, default: "" },
      whatsappNumber: { type: String, default: "" },
      emailAddress: { type: String, default: "" },
      cityAddress: { type: String, default: "" },
      passportNumber: { type: String, default: "" },
      passportIssueDate: { type: Date, default: null },
      passportExpiry: { type: Date, default: null },
      passportExpiryReminderSentAt: { type: Date, default: null },
      matricGrade: { type: String, default: "" },
      fscGrade: { type: String, default: "" },
      otherDegree: { type: String, default: "" },
      ieltsScore: { type: String, default: "" },
      countryInterest: { type: String, default: "" },
      universityInterest: { type: String, default: "" },
      programInterest: { type: String, default: "" },
      registrationId: { type: String },
      processStage: {
        type: String,
        default: "registered",
      },
      paymentReceived: { type: Boolean, default: false },
      docMatric: { type: Boolean, default: false },
      docFsc: { type: Boolean, default: false },
      docPassport: { type: Boolean, default: false },
      docPhotos: { type: Boolean, default: false },
      docCnic: { type: Boolean, default: false },
      docBankStatement: { type: Boolean, default: false },
      docHecAttestation: { type: Boolean, default: false },
      documentStatuses: {
        type: Map,
        of: String,
        default: {},
      },
      pendingDocumentRequests: [
        {
          requestId: String,
          docType: String,
          method: String,
          tokenHash: String,
          tokenExpiresAt: Date,
          tokenUsedAt: Date,
          status: {
            type: String,
            default: "pending",
          },
          requestedAt: {
            type: Date,
            default: Date.now,
          },
          requestedBy: String,
          note: String,
        },
      ],
      inboundDocumentAlerts: [
        {
          alertId: String,
          requestId: String,
          docType: String,
          source: String,
          status: {
            type: String,
            default: "pending_review",
          },
          whatsappMediaId: String,
          mimeType: String,
          mediaFilename: String,
          caption: String,
          content: String,
          savedPath: String,
          receivedAt: {
            type: Date,
            default: Date.now,
          },
          reviewedAt: Date,
          reviewedBy: String,
        },
      ],
      internalNotes: [
        {
          text: String,
          by: String,
          at: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      uploadsMeta: [
        {
          storedPath: String,
          originalName: String,
          docType: { type: String, default: "" },
          docLabel: { type: String, default: "" },
        },
      ],
    },
  },
  { timestamps: true }
);

leadSchema.index(
  { "admissionProfile.registrationId": 1 },
  { unique: true, sparse: true }
);
/* Hot query indexes */
leadSchema.index({ userId: 1, lastActivity: -1 });
leadSchema.index({ userId: 1, isMerged: 1, lastActivity: -1 });
leadSchema.index({ userId: 1, phone: 1 });
leadSchema.index({ userId: 1, email: 1 });
leadSchema.index({ userId: 1, assignedTo: 1 });
leadSchema.index({ "activityLog.type": 1, userId: 1 });

/* Auto-invalidate dashboard/leads cache whenever a lead is saved */
leadSchema.post("save", function () {
  if (this.userId) invalidateTenantCache(String(this.userId));
});
leadSchema.post("findOneAndUpdate", function (doc) {
  if (doc?.userId) invalidateTenantCache(String(doc.userId));
});

const Lead = mongoose.model("Lead", leadSchema);

// SETTINGS
const settingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },

    consultancyName: {
      type: String,
      default: "Next Step International",
    },

    /** Human-readable phone/WhatsApp number the AI may give students when they ask how to reach you (can match WhatsApp routing number). */
    businessContactNumber: {
      type: String,
      default: "",
    },

    /** Public inquiry email the AI may share with leads. */
    contactEmail: {
      type: String,
      default: "",
    },

    /** Company website the AI may mention or share. */
    websiteUrl: {
      type: String,
      default: "",
    },

    /** Services, hours, team, tagline — free text injected into the AI prompt so replies stay on-brand. */
    consultancyNotes: {
      type: String,
      default: "",
    },

    whatsappNumber: {
      type: String,
      default: "",
    },

    whatsappPhoneNumberId: {
      type: String,
      default: "",
    },

    whatsappVerifyToken: {
      type: String,
      default: "",
    },

    city: {
      type: String,
      default: "",
    },

    aiTone: {
      type: String,
      default: "warm and professional",
    },

    aiAutoReplyEnabled: {
      type: Boolean,
      default: true,
    },

    aiDailyReplyLimit: {
      type: Number,
      default: 100,
      min: 1,
      max: 1000,
    },

    enabledCountries: {
      type: [String],
      default: ["Georgia", "Turkey", "China"],
    },

    customRules: {
      type: String,
      default: "",
    },

    faqs: {
      type: [
        {
          question: String,
          answer: String,
        },
      ],
      default: [],
    },

    cannotSay: {
      type: String,
      default:
        "never promise visa approval, never guarantee admission",
    },

    canSay: {
      type: String,
      default:
        "mention free consultation, mention scholarship possibilities",
    },

    onboardingChecklistDismissed: {
      type: Boolean,
      default: false,
    },

    charges: {
      applicationFee: {
        type: String,
        default: "",
      },

      serviceFee: {
        type: String,
        default: "",
      },

      visaFee: {
        type: String,
        default: "",
      },
    },
  },
  { timestamps: true }
);

const Settings = mongoose.model("Settings", settingsSchema);

// UNIVERSITY
const universitySchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,

    name: String,
    country: String,
    city: String,

    courses: [String],

    tuitionMin: Number,
    tuitionMax: Number,

    ranking: Number,

    intakeDates: [String],

    scholarships: String,
    visaRequirements: String,
    description: String,
    website: String,
  },
  { timestamps: true }
);

const University = mongoose.model("University", universitySchema);

// NOTIFICATIONS
const notificationSchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,

    type: String,

    message: String,

    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
    },

    read: {
      type: Boolean,
      default: false,
    },
    count: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

const Notification = mongoose.model(
  "Notification",
  notificationSchema
);

const websiteRequestedUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 15 * 1024 * 1024,
  },
});

const counterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);
const Counter = mongoose.model("Counter", counterSchema);

/* ============================================================
   PASSWORD + JWT USER ID (legacy plain-text in MongoDB supported)
============================================================ */

function looksLikeBcryptHash(s) {
  return (
    typeof s === "string" &&
    s.length >= 50 &&
    /^\$2[aby]\$\d{2}\$/.test(s)
  );
}

/** Resolved Mongo user id for queries (JWT may use `id` or legacy shapes). */
function reqAuthUserId(req) {
  const extracted = extractMongoUserId(req.user);
  if (extracted) return extracted;
  const raw = req.user?.id;
  return raw != null ? String(raw) : null;
}

/** Normalize user id from JWT payload (string ObjectId or legacy shapes). */
function extractMongoUserId(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [payload.id, payload._id, payload.sub, payload.userId];
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "string" && mongoose.Types.ObjectId.isValid(c)) {
      return c;
    }
    if (typeof c === "object" && c !== null && typeof c.toHexString === "function") {
      const h = c.toHexString();
      if (mongoose.Types.ObjectId.isValid(h)) return h;
    }
    if (typeof c === "object" && c !== null && typeof c.$oid === "string") {
      if (mongoose.Types.ObjectId.isValid(c.$oid)) return c.$oid;
    }
  }
  return null;
}

/** Accept assignedToMe=true / 1 / yes from query string (Express may receive arrays). */
function truthyQueryFlag(val) {
  if (val === true || val === 1) return true;
  if (Array.isArray(val)) return truthyQueryFlag(val[0]);
  if (val == null || val === "") return false;
  const s = String(val).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

async function verifyStoredPassword(plain, stored) {
  if (stored == null || typeof stored !== "string") return false;
  const p = String(plain);
  if (looksLikeBcryptHash(stored)) {
    return bcrypt.compare(p, stored);
  }
  /* Legacy: password pasted as plain text in MongoDB (not a bcrypt hash). */
  return p === stored;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePhoneKey(raw) {
  return String(raw || "").replace(/\D+/g, "");
}

function verifyWhatsAppSignature(req) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true; // Optional in local/dev

  const header = req.headers["x-hub-signature-256"];
  if (!header || typeof header !== "string") return false;
  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(req.rawBody || Buffer.from(""))
    .digest("hex")}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(header),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

function hashPasswordResetToken(raw) {
  return crypto.createHash("sha256").update(String(raw), "utf8").digest("hex");
}

function hashSignupOtp(raw) {
  return crypto.createHash("sha256").update(String(raw), "utf8").digest("hex");
}

function getMailTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host || !nodemailer) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS || "",
          }
        : undefined,
  });
}

/** 6-digit code; leading zeros allowed */
function generatePasswordResetOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

async function sendPasswordResetOtpEmail(to, otp, validMinutes = 15) {
  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    '"NextStep CRM" <noreply@localhost>';

  const transporter = getMailTransporter();

  if (!transporter) {
    console.warn(
      "\n========== PASSWORD RESET (no SMTP — email not sent) ==========\n" +
        `  To:   ${to}\n` +
        `  OTP:  ${otp}   (expires in ${validMinutes} minutes)\n` +
        "  Fix:  Add SMTP_HOST, SMTP_USER, SMTP_PASS to .env and restart the API.\n" +
        "===============================================================\n"
    );
    return false;
  }

  await transporter.sendMail({
    from,
    to,
    subject: "Your NextStep CRM password reset code",
    text: `Your verification code is: ${otp}\n\nIt expires in ${validMinutes} minutes.\n\nIf you did not request a password reset, ignore this email.`,
    html: `<p>Your verification code:</p><p style="font-size:26px;font-weight:700;letter-spacing:6px;font-family:monospace">${otp}</p><p>This code expires in <strong>${validMinutes} minutes</strong>.</p><p>If you did not request a password reset, you can ignore this email.</p>`,
  });

  return true;
}

async function sendSignupOtpEmail(to, otp, validMinutes = 10) {
  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    '"NextStep CRM" <noreply@localhost>';

  const transporter = getMailTransporter();

  if (!transporter) {
    console.warn(
      "\n========== SIGNUP VERIFY (no SMTP — email not sent) ==========\n" +
        `  To:   ${to}\n` +
        `  OTP:  ${otp}   (expires in ${validMinutes} minutes)\n` +
        "  Fix:  Add SMTP_HOST, SMTP_USER, SMTP_PASS to .env and restart the API.\n" +
        "=============================================================\n"
    );
    return false;
  }

  await transporter.sendMail({
    from,
    to,
    subject: "Your NextStep CRM signup verification code",
    text: `Your signup verification code is: ${otp}\n\nIt expires in ${validMinutes} minutes.\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Your signup verification code:</p><p style="font-size:26px;font-weight:700;letter-spacing:6px;font-family:monospace">${otp}</p><p>This code expires in <strong>${validMinutes} minutes</strong>.</p><p>If you did not request this, you can ignore this email.</p>`,
  });

  return true;
}

/* ============================================================
   AUTH MIDDLEWARE
============================================================ */

/**
 * Verifies JWT and attaches `workspaceUserId` (Mongo id of the CRM workspace owner).
 * Team members log in with their own account but share the owner's leads and settings.
 */
async function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: "No token",
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({
      error: "Invalid token",
    });
  }

  const uid = reqAuthUserId(req);
  req.actorUserId = uid;
  if (!uid) {
    return res.status(401).json({
      error: "Invalid token",
    });
  }

  try {
    const user = await AuthUser.findById(uid).select("workspaceOwnerId").lean();
    if (!user) {
      return res.status(401).json({
        error: "Account not found",
      });
    }

    let wid = user.workspaceOwnerId
      ? String(user.workspaceOwnerId)
      : String(uid);
    if (user.workspaceOwnerId) {
      const owner = await AuthUser.findById(wid).select("_id").lean();
      if (!owner) {
        wid = String(uid);
      }
    }

    req.workspaceUserId = wid;
    if (req.user && typeof req.user === "object") {
      req.user.wid = wid;
    }
    next();
  } catch (e) {
    console.log("auth workspace:", e?.message || e);
    res.status(500).json({ error: "Auth failed" });
  }
}

/** Mongo id used for Lead / Settings / Notification tenancy (shared workspace). */
function tenantUserId(req) {
  const w = req.workspaceUserId;
  if (w != null && mongoose.Types.ObjectId.isValid(String(w))) {
    return String(w);
  }
  return reqAuthUserId(req);
}

/** User belongs to the same CRM workspace as the current actor (owner or invited staff). */
function sameWorkspaceQuery(tenantId) {
  const tid = String(tenantId);
  return {
    $or: [{ _id: tid }, { workspaceOwnerId: tid }],
  };
}

function isSameWorkspaceMember(tenantId, targetDoc) {
  const tid = String(tenantId);
  if (!targetDoc?._id) return false;
  if (String(targetDoc._id) === tid) return true;
  if (
    targetDoc.workspaceOwnerId &&
    String(targetDoc.workspaceOwnerId) === tid
  ) {
    return true;
  }
  return false;
}

/** True when this account owns the CRM tenant (not invited into someone else's workspace). */
function isWorkspaceOwner(req) {
  const actor = req.actorUserId;
  const wid = req.workspaceUserId;
  if (!actor || wid == null) return false;
  return String(actor) === String(wid);
}

function jwtActorEmail(req) {
  const e = req.user?.email;
  return typeof e === "string" ? e.trim().toLowerCase() : "";
}

/** Workspace owner, PERMANENT_MANAGER_EMAILS, or PLATFORM_ADMIN_EMAILS / MAIN_ADMIN_EMAIL. */
async function canManageGlobalPublicSignup(req) {
  if (isWorkspaceOwner(req)) return true;
  let email = jwtActorEmail(req);
  if (!email && req.actorUserId && mongoose.Types.ObjectId.isValid(String(req.actorUserId))) {
    try {
      const u = await AuthUser.findById(req.actorUserId).select("email").lean();
      email = u?.email ? String(u.email).trim().toLowerCase() : "";
    } catch (_) {}
  }
  if (!email) return false;
  if (isPermanentManagerEmail(email)) return true;
  if (platformOperatorEmails().includes(email)) return true;
  return false;
}

/** Platform operators only (MAIN_ADMIN / PLATFORM_ADMIN_EMAILS), for issuing new-workspace signup invites. */
async function isPlatformOperatorRequest(req) {
  let email = jwtActorEmail(req);
  if (!email && req.actorUserId && mongoose.Types.ObjectId.isValid(String(req.actorUserId))) {
    try {
      const u = await AuthUser.findById(req.actorUserId).select("email").lean();
      email = u?.email ? String(u.email).trim().toLowerCase() : "";
    } catch (_) {}
  }
  return Boolean(email && platformOperatorEmails().includes(email));
}

/** AuthUser filter: accounts that may receive a lead assignment (dropdown + overview). */
function assignableTeamMemberFilter(tenantId) {
  const tid = String(tenantId);
  return {
    role: { $in: ["admin", "manager", "staff"] },
    isActive: { $ne: false },
    $or: [{ _id: tid }, { workspaceOwnerId: tid }],
  };
}

/** Resolve id to an assignable workspace member, or null if assignee should be cleared. */
async function findAssignableStaff(tenantId, assigneeId) {
  if (!assigneeId || !mongoose.Types.ObjectId.isValid(String(assigneeId))) {
    return null;
  }
  const oid = new mongoose.Types.ObjectId(String(assigneeId));
  return AuthUser.findOne({
    _id: oid,
    ...assignableTeamMemberFilter(tenantId),
  })
    .select("_id name")
    .lean();
}

/**
 * Match Lead.userId to the CRM workspace tenant. Handles ObjectId- or string-typed userId in MongoDB.
 */
function admissionPipelineFilter() {
  return {
    $or: [
      { source: { $regex: /^website$/i } },
      { "activityLog.type": "website_apply" },
      { "admissionProfile.processStage": { $exists: true, $ne: "" } },
    ],
  };
}

function leadTenantUserIdMatch(tenantId) {
  const tid = String(tenantId);
  if (!mongoose.Types.ObjectId.isValid(tid)) {
    return { userId: tid };
  }
  const oid = new mongoose.Types.ObjectId(tid);
  return { userId: { $in: [oid, tid] } };
}

function requireRoles(...allowed) {
  return (req, res, next) => {
    if (!req.user?.role || !allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    next();
  };
}

function validateId(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      error: "Invalid ID",
    });
  }

  next();
}

/* ============================================================
   AI CORE
============================================================ */

const UNIVERSITY_AI_CHAR_BUDGET = 7500;

function truncateForPrompt(s, maxLen) {
  const t = String(s || "").trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

function universityMatchesStudentMessage(u, queryLower) {
  if (!queryLower || queryLower.length < 2) return false;
  const name = String(u.name || "").toLowerCase().trim();
  if (name && queryLower.includes(name)) return true;
  const city = String(u.city || "").toLowerCase().trim();
  if (city && city.length >= 3 && queryLower.includes(city)) return true;
  const tokens = name.split(/\s+/).filter((w) => w.length >= 4);
  for (const w of tokens) {
    if (queryLower.includes(w)) return true;
  }
  const courseBlob = (Array.isArray(u.courses) ? u.courses : []).join(" ").toLowerCase();
  if (courseBlob && queryLower.length >= 4) {
    const cw = courseBlob.split(/\s+/).filter((w) => w.length >= 4);
    for (const w of cw) {
      if (queryLower.includes(w)) return true;
    }
  }
  return false;
}

function formatOneUniversityForPrompt(u) {
  const courses = Array.isArray(u.courses) ? u.courses.filter(Boolean).join(", ") : "";
  const intakes = Array.isArray(u.intakeDates) ? u.intakeDates.filter(Boolean).join(", ") : "";
  let tuition = "";
  const min = u.tuitionMin != null ? Number(u.tuitionMin) : null;
  const max = u.tuitionMax != null ? Number(u.tuitionMax) : null;
  if (min != null && max != null && Number.isFinite(min) && Number.isFinite(max)) {
    tuition = min === max ? `$${min}/yr (USD)` : `$${min}–$${max}/yr (USD)`;
  } else if (min != null && Number.isFinite(min)) {
    tuition = `from $${min}/yr (USD)`;
  } else if (max != null && Number.isFinite(max)) {
    tuition = `up to $${max}/yr (USD)`;
  }
  const lines = [];
  lines.push(`【${u.name || "Unnamed institution"}】`);
  const loc = [u.country, u.city].filter(Boolean).join(", ");
  if (loc) lines.push(`Location: ${loc}`);
  if (courses) lines.push(`Courses / programs: ${truncateForPrompt(courses, 240)}`);
  if (tuition) lines.push(`Tuition: ${tuition}`);
  if (u.ranking != null && Number.isFinite(Number(u.ranking))) {
    lines.push(`Ranking note: ${u.ranking}`);
  }
  if (intakes) lines.push(`Intakes: ${truncateForPrompt(intakes, 120)}`);
  if (u.scholarships) {
    lines.push(`Scholarships: ${truncateForPrompt(u.scholarships, 320)}`);
  }
  if (u.visaRequirements) {
    lines.push(`Visa / entry notes: ${truncateForPrompt(u.visaRequirements, 280)}`);
  }
  if (u.website) lines.push(`Website: ${String(u.website).trim()}`);
  if (u.description) {
    lines.push(`Details: ${truncateForPrompt(u.description, 400)}`);
  }
  return lines.join("\n");
}

/**
 * Loads CRM university rows for this account and formats them for the AI system prompt.
 * Schools that look relevant to the student's latest message are listed first.
 */
async function buildUniversitiesKnowledgeSection(userId, recentUserMessage) {
  try {
    const rows = await University.find({ userId })
      .sort({ name: 1 })
      .limit(80)
      .lean();
    if (!rows.length) {
      return `

UNIVERSITIES / FEES (no rows in your CRM yet):
- You may answer using general study-abroad knowledge (typical fee ranges, how pricing works, etc.).
- For school-specific exact fees, say your team can confirm — there is no saved sheet yet.
`;
    }

    const queryLower = String(recentUserMessage || "").toLowerCase();
    const scored = rows.map((u) => ({
      u,
      hit: universityMatchesStudentMessage(u, queryLower),
    }));
    scored.sort((a, b) => Number(b.hit) - Number(a.hit));

    let chunks = scored.map(({ u }) => formatOneUniversityForPrompt(u));
    let body = chunks.join("\n---\n");

    if (body.length > UNIVERSITY_AI_CHAR_BUDGET) {
      chunks = [];
      let used = 0;
      for (const { u } of scored) {
        const piece = formatOneUniversityForPrompt(u);
        const sep = chunks.length ? "\n---\n" : "";
        if (used + sep.length + piece.length > UNIVERSITY_AI_CHAR_BUDGET) break;
        chunks.push(piece);
        used += sep.length + piece.length;
      }
      body =
        chunks.join("\n---\n") +
        "\n…(list truncated — shorten descriptions in University Database or split across fewer schools.)";
    }

    return `

INTERNAL UNIVERSITY DATABASE (live CRM — this block is refreshed every reply from your panel):
- For any school that appears BELOW: use ONLY these facts for fees, intakes, scholarships, visa notes, and links. When your team changes $2000 to $2400 in the panel, that new number is what you must use — never an older figure from chat memory.
- If the student asks about a university that is NOT listed below, you may answer from general knowledge (typical ranges, how fees work, etc.) and suggest the consultant for exact numbers for that school.
- Never contradict the database when the same school is listed here.

${body}
`;
  } catch (e) {
    console.log("buildUniversitiesKnowledgeSection:", e?.message || e);
    return "";
  }
}

/**
 * Merge new student message into saved bullet facts (corrections override, e.g. name Ali → Khan).
 */
async function mergeLeadImportantDetailsGroq(previousDetails, latestUserMessage) {
  const prev = String(previousDetails || "").trim();
  const msg = String(latestUserMessage || "").trim();
  if (!msg || msg.length < 2) return prev;

  const prevBlock = prev.length > 6000 ? `${prev.slice(0, 6000)}…` : prev;

  const raw = await groqChat({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
        content: `You maintain bullet-point facts a STUDENT said about themselves: preferred name, country, study goals, exams (IELTS), budget, intake — short phrases only.

Previous saved facts (may be empty):
${prevBlock || "(none)"}

Their latest message:
"""${msg.slice(0, 3500)}"""

Return ONLY valid JSON with keys "details" (string, newline-separated facts) and "changed" (boolean).
Rules:
- Keep previous facts that are still valid.
- If they CORRECT something (e.g. new name), replace the old fact with the new one.
- Add new facts only they stated.
- Ignore greetings/short filler messages like: hi, hello, ok, yes, no, nhi/nahi, hmm.
- Max 18 lines in details. Plain text lines only.
- If nothing personal in this message, set details to the previous facts unchanged and changed false.`,
      },
    ],
    temperature: 0.1,
    max_tokens: 700,
  });

  let cleaned = String(raw || "").trim();
  cleaned = cleaned.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    const details =
      typeof parsed.details === "string" ? parsed.details.trim() : prev;
    return details.slice(0, 8000);
  } catch (_) {
    return prev;
  }
}

async function updateLeadImportantDetailsFromStudentMessage(lead, messageText) {
  const t = String(messageText || "").trim();
  if (!t || t.length < 2) return;
  if (shouldIgnoreForPersonalFacts(t)) return;
  try {
    const next = await mergeLeadImportantDetailsGroq(
      lead.importantDetails || "",
      t
    );
    lead.importantDetails = next;
  } catch (e) {
    console.log("importantDetails merge:", e?.message || e);
  }
}

async function askAI(history, userId) {
  const confirmedStudentName = extractConfirmedStudentName(history);

  let settings = null;

  try {
    settings = await Settings.findOne({ userId });
  } catch (_) {}

  const lastInbound = [...history].reverse().find((m) => {
    const role = String(m.role || "").toLowerCase();
    return role === "user";
  });
  const recentUserMessage = lastInbound?.content != null ? String(lastInbound.content) : "";

  const universitiesSection = await buildUniversitiesKnowledgeSection(
    userId,
    recentUserMessage
  );

  const name =
    settings?.consultancyName || "Next Step International";

  const tone =
    settings?.aiTone || "warm and professional";

  const countryList =
    Array.isArray(settings?.enabledCountries) &&
    settings.enabledCountries.length > 0
      ? settings.enabledCountries
      : [
      "Georgia",
      "Turkey",
      "China",
    ];

  const countries = countryList.join(", ");
  const customRules = settings?.customRules || "";
  const canSay = settings?.canSay || "";
  const cannotSay = settings?.cannotSay || "";
  const faqs = Array.isArray(settings?.faqs) ? settings.faqs : [];
  const faqText = faqs
    .slice(0, 12)
    .map((f, i) => `${i + 1}. Q: ${f.question}\nA: ${f.answer}`)
    .join("\n");

  const bizPhone = String(settings?.businessContactNumber || "").trim();
  const bizEmail = String(settings?.contactEmail || "").trim();
  const webUrl = String(settings?.websiteUrl || "").trim();
  const officeCity = String(settings?.city || "").trim();
  const consultancyNotes = String(settings?.consultancyNotes || "").trim();

  const contactFacts = [];
  if (bizPhone) {
    contactFacts.push(
      `- Phone / WhatsApp for students to reach you: ${bizPhone}`
    );
  }
  if (bizEmail) {
    contactFacts.push(`- Contact email: ${bizEmail}`);
  }
  if (webUrl) {
    contactFacts.push(`- Website: ${webUrl}`);
  }
  if (officeCity) {
    contactFacts.push(`- Office city / location: ${officeCity}`);
  }

  const contactFactsBlock =
    contactFacts.length > 0
      ? contactFacts.join("\n")
      : "- No public phone/email/website stored yet — do NOT invent numbers or URLs; say a consultant will share contact details.";

  const aboutBlock = consultancyNotes
    ? `ABOUT THIS CONSULTANCY (facts from your CRM — use these; do not contradict or invent):\n${consultancyNotes}`
    : "";

  const prompt = `
You are a helpful study abroad consultant for ${name}.

Tone: ${tone}

Countries:
${countries}

CONSULTANCY CONTACT & LOCATION (only share details that appear below when students ask how to reach you):
${contactFactsBlock}
${aboutBlock ? `\n${aboutBlock}\n` : ""}

CONFIRMED STUDENT NAME (use only if explicitly confirmed by student):
${confirmedStudentName || "(not confirmed)"}

IMPORTANT RULES:
- Keep replies SHORT
- Max 80 words
- WhatsApp style
- Friendly and natural
- Ask only 1-2 questions
- No long paragraphs
- Do not promise visa approval
- Suggest human consultant after few messages
- If confirmed student name is "(not confirmed)", DO NOT address the student by any name.
- Never infer name from greetings/short words (hi, hey, nhi, ok, etc.).
- Only use the exact confirmed student name when available.

BUSINESS ALLOWED:
${canSay || "mention consultation support and process guidance only"}

BUSINESS NOT ALLOWED:
${cannotSay || "never guarantee outcomes"}

CUSTOM RULES:
${customRules || "none"}

FAQ KNOWLEDGE:
${faqText || "No custom FAQs provided yet."}
${universitiesSection}
`;

  const reply = await groqChat({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: prompt,
      },
      ...history.slice(-8),
    ],
    temperature: 0.7,
    max_tokens: 120,
  });

  return sanitizeReplyNameUsage(reply, confirmedStudentName, history);
}

async function sendWhatsAppCloudText({ phoneNumberId, to, text }) {
  const token = String(process.env.WHATSAPP_TOKEN || "").trim();
  if (!token) {
    throw new Error("WHATSAPP_TOKEN missing; cannot send WhatsApp message");
  }
  if (!phoneNumberId) {
    throw new Error("WhatsApp phone number id missing; cannot send WhatsApp message");
  }
  if (!to || !text) {
    throw new Error("Recipient or message text missing; cannot send WhatsApp message");
  }

  const url = `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`;
  try {
    await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: String(to).trim(),
        type: "text",
        text: { body: String(text).trim() },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    const meta = err?.response?.data?.error;
    if (meta?.code === 190) {
      console.error(
        "WhatsApp send blocked: access token invalid or expired (Meta error 190). In developers.facebook.com open your app → WhatsApp → API Setup: create a new permanent token (or refresh), copy Phone number ID for the same number, update WHATSAPP_TOKEN (and WHATSAPP_PHONE_NUMBER_ID if needed) in .env, restart npm start."
      );
    }
    throw err;
  }
}

const FOLLOWUP_IDLE_MS = 24 * 60 * 60 * 1000;
const FOLLOWUP_SWEEP_MS = 10 * 60 * 1000;
let followupSchedulerStarted = false;
let followupSweepInProgress = false;

function toMs(d) {
  const t = Date.parse(String(d || ""));
  return Number.isFinite(t) ? t : 0;
}

function latestMessageByRoles(messages = [], roles = []) {
  const allow = new Set((Array.isArray(roles) ? roles : []).map((r) => String(r).toLowerCase()));
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] || {};
    const role = String(m.role || "").toLowerCase();
    if (allow.has(role)) return m;
  }
  return null;
}

function build24hFollowupText({ confirmedName, lastOutboundText }) {
  const greeting = confirmedName ? `Hi ${confirmedName},` : "Hi,";
  const prev = String(lastOutboundText || "").toLowerCase();

  const proposalPattern = /\b(proposal|quote|quotation|pricing|price plan|offer|next steps?)\b/i;
  if (proposalPattern.test(prev)) {
    return `${greeting} just checking if you had any questions on the proposal or if you're ready for the next steps?`;
  }

  const docPattern = /\b(document|documents|details|detail|passport|transcript|ielts|bank statement|cv|sop)\b/i;
  if (docPattern.test(prev)) {
    return `${greeting} just circling back to see if you've had a chance to grab those documents/details we discussed?`;
  }

  return `${greeting} just following up on our last message. Let me know if you want to continue with the next steps.`;
}

async function runInactivityFollowupSweep() {
  if (followupSweepInProgress) return;
  followupSweepInProgress = true;
  try {
    const cutoff = new Date(Date.now() - FOLLOWUP_IDLE_MS);
    const leads = await Lead.find({
      source: "WhatsApp",
      isMerged: { $ne: true },
      phone: { $exists: true, $ne: "" },
      status: { $nin: ["converted", "lost"] },
      lastActivity: { $lte: cutoff },
    }).select("_id userId phone status messages extractedData lastActivity");

    if (!leads.length) return;

    const settingsByUser = new Map();

    for (const lead of leads) {
      const msgs = Array.isArray(lead.messages) ? lead.messages : [];
      if (msgs.length === 0) continue;

      const lastMsg = msgs[msgs.length - 1] || {};
      const lastRole = String(lastMsg.role || "").toLowerCase();
      if (lastRole !== "assistant" && lastRole !== "admin") {
        continue; // only follow up when waiting for student response
      }

      const lastOutboundAtMs = toMs(lastMsg.at || lead.lastActivity);
      if (!lastOutboundAtMs || Date.now() - lastOutboundAtMs < FOLLOWUP_IDLE_MS) {
        continue;
      }

      const lastUserMsg = latestMessageByRoles(msgs, ["user"]);
      const lastUserAtMs = toMs(lastUserMsg?.at);
      const lastReminderAtMs = toMs(lead.extractedData?.autoReminderSentAt);
      if (lastReminderAtMs && (!lastUserAtMs || lastUserAtMs <= lastReminderAtMs)) {
        continue; // already reminded for this waiting period
      }

      const uid = String(lead.userId || "");
      if (!uid) continue;

      if (!settingsByUser.has(uid)) {
        const s = await Settings.findOne({ userId: uid }).lean();
        settingsByUser.set(uid, s || null);
      }
      const st = settingsByUser.get(uid);
      if (!st) continue;
      if (st.aiAutoReplyEnabled === false) continue;

      const phoneNumberId =
        String(st.whatsappPhoneNumberId || "").trim() ||
        String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
      if (!phoneNumberId) continue;

      const confirmedName = extractConfirmedStudentName(msgs);
      const reminderText = build24hFollowupText({
        confirmedName,
        lastOutboundText: String(lastMsg.content || ""),
      });

      try {
        await sendWhatsAppCloudText({
          phoneNumberId,
          to: String(lead.phone).trim(),
          text: reminderText,
        });
      } catch (sendErr) {
        console.log(
          "Auto follow-up send failed:",
          sendErr?.response?.data || sendErr?.message || sendErr
        );
        continue;
      }

      lead.messages.push({
        role: "assistant",
        content: reminderText,
        whatsappDeliveryChannel: "whatsapp",
        whatsappDeliveryStatus: "sent",
        whatsappDeliveredAt: new Date(),
        at: new Date(),
      });
      lead.lastActivity = new Date();
      lead.extractedData = {
        ...(lead.extractedData || {}),
        autoReminderSentAt: new Date().toISOString(),
      };
      await lead.save();
    }
  } catch (e) {
    console.log("Auto follow-up sweep failed:", e?.message || e);
  } finally {
    followupSweepInProgress = false;
  }
}

function startInactivityFollowupScheduler() {
  if (followupSchedulerStarted) return;
  followupSchedulerStarted = true;
  // First sweep shortly after boot, then every 10 minutes.
  setTimeout(() => {
    runInactivityFollowupSweep().catch(() => {});
  }, 45 * 1000);
  setInterval(() => {
    runInactivityFollowupSweep().catch(() => {});
  }, FOLLOWUP_SWEEP_MS);
  console.log("⏰ 24h follow-up scheduler started");
}

/** WhatsApp Cloud API media kinds (image | video | audio | document). */
function classifyBroadcastAttachment(mimetype, originalname) {
  const mt = String(mimetype || "").toLowerCase();
  const ext = path.extname(String(originalname || "")).toLowerCase();

  if (mt.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
    return { waType: "image", maxBytes: 5 * 1024 * 1024 };
  }
  if (mt.startsWith("video/") || [".mp4", ".3gp", ".3gpp"].includes(ext)) {
    return { waType: "video", maxBytes: 16 * 1024 * 1024 };
  }
  if (mt.startsWith("audio/") || [".ogg", ".aac", ".mp3", ".m4a", ".opus"].includes(ext)) {
    return { waType: "audio", maxBytes: 16 * 1024 * 1024 };
  }
  return { waType: "document", maxBytes: 100 * 1024 * 1024 };
}

async function uploadWhatsAppMediaBuffer({ phoneNumberId, buffer, filename, mimeType }) {
  const token = String(process.env.WHATSAPP_TOKEN || "").trim();
  if (!token) {
    throw new Error("WHATSAPP_TOKEN missing; cannot upload WhatsApp media");
  }
  if (!phoneNumberId) {
    throw new Error("WhatsApp phone number id missing; cannot upload WhatsApp media");
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append(
    "file",
    buffer,
    {
      filename: filename || "attachment",
      contentType: mimeType || "application/octet-stream",
    }
  );

  const url = `https://graph.facebook.com/v25.0/${phoneNumberId}/media`;
  const res = await axios.post(url, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${token}`,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const id = res.data?.id;
  if (!id) {
    throw new Error("WhatsApp media upload returned no media id");
  }
  return id;
}

async function sendWhatsAppCloudMedia({
  phoneNumberId,
  to,
  waType,
  mediaId,
  caption,
  filename,
}) {
  const token = String(process.env.WHATSAPP_TOKEN || "").trim();
  if (!token) {
    throw new Error("WHATSAPP_TOKEN missing; cannot send WhatsApp message");
  }
  if (!phoneNumberId) {
    throw new Error("WhatsApp phone number id missing; cannot send WhatsApp message");
  }
  if (!to || !mediaId) {
    throw new Error("Recipient or media id missing; cannot send WhatsApp message");
  }

  const cap = caption != null ? String(caption).trim().slice(0, 1024) : "";
  const url = `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`;

  const base = {
    messaging_product: "whatsapp",
    to: String(to).trim(),
    type: waType,
  };

  if (waType === "image") {
    base.image = { id: String(mediaId) };
    if (cap) base.image.caption = cap;
  } else if (waType === "video") {
    base.video = { id: String(mediaId) };
    if (cap) base.video.caption = cap;
  } else if (waType === "document") {
    base.document = { id: String(mediaId) };
    if (cap) base.document.caption = cap;
    const fn = String(filename || "file").trim().slice(0, 240);
    if (fn) base.document.filename = fn;
  } else if (waType === "audio") {
    base.audio = { id: String(mediaId) };
  } else {
    throw new Error(`Unsupported WhatsApp media type: ${waType}`);
  }

  try {
    await axios.post(url, base, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    const meta = err?.response?.data?.error;
    if (meta?.code === 190) {
      console.error(
        "WhatsApp send blocked: access token invalid or expired (Meta error 190)."
      );
    }
    throw err;
  }
}

const BROADCAST_MAX_ATTACHMENTS = 5;

const broadcastUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

function broadcastMultipartOnly(req, res, next) {
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("multipart/form-data")) {
    return broadcastUpload.array("attachments", BROADCAST_MAX_ATTACHMENTS)(
      req,
      res,
      next
    );
  }
  return next();
}

function leadMessageMultipartOnly(req, res, next) {
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("multipart/form-data")) {
    return broadcastUpload.array("attachments", BROADCAST_MAX_ATTACHMENTS)(
      req,
      res,
      next
    );
  }
  return next();
}

/**
 * WhatsApp delivery rules for broadcast: single image/video/document uses message as caption when provided;
 * audio + text sends audio then text; multiple files send text first (if any) then each media.
 */
async function deliverBroadcastWhatsAppForLead({
  phoneNumberId,
  to,
  message,
  uploaded,
}) {
  const hasMsg = Boolean(message && String(message).trim());
  const text = hasMsg ? String(message).trim() : "";
  const n = uploaded.length;

  if (n === 0) {
    if (hasMsg) {
      await sendWhatsAppCloudText({
        phoneNumberId,
        to,
        text,
      });
    }
    return;
  }

  if (n === 1) {
    const u = uploaded[0];
    if (u.waType === "audio" && hasMsg) {
      await sendWhatsAppCloudMedia({
        phoneNumberId,
        to,
        waType: "audio",
        mediaId: u.mediaId,
        caption: "",
        filename: u.filename,
      });
      await sendWhatsAppCloudText({
        phoneNumberId,
        to,
        text,
      });
      return;
    }
    if (
      hasMsg &&
      ["image", "video", "document"].includes(u.waType)
    ) {
      await sendWhatsAppCloudMedia({
        phoneNumberId,
        to,
        waType: u.waType,
        mediaId: u.mediaId,
        caption: text,
        filename: u.filename,
      });
      return;
    }
    await sendWhatsAppCloudMedia({
      phoneNumberId,
      to,
      waType: u.waType,
      mediaId: u.mediaId,
      caption: "",
      filename: u.filename,
    });
    return;
  }

  if (hasMsg) {
    await sendWhatsAppCloudText({
      phoneNumberId,
      to,
      text,
    });
    await new Promise((r) => setTimeout(r, 120));
  }

  for (let i = 0; i < uploaded.length; i++) {
    const u = uploaded[i];
    await sendWhatsAppCloudMedia({
      phoneNumberId,
      to,
      waType: u.waType,
      mediaId: u.mediaId,
      caption: "",
      filename: u.filename,
    });
    if (i < uploaded.length - 1) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
}

/* ============================================================
   AUTH ROUTES
============================================================ */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth requests. Please try again later." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes." },
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reset requests. Please wait before retrying." },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many code attempts. Please request a new code later." },
});

const signupOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification code requests. Please wait and retry." },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many webhook requests. Slow down and retry." },
});

const aiMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?.id ? `user:${String(req.user.id)}` : ipKeyGenerator(req.ip || "unknown"),
  message: { error: "Too many chat requests. Please wait a moment." },
});

const adminSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?.id ? `user:${String(req.user.id)}` : ipKeyGenerator(req.ip || "unknown"),
  message: { error: "Too many outbound messages. Please wait a moment." },
});

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\d{6,20}$/, "Phone must be digits only (6-20 chars).");

const userMessageSchema = z.object({
  phone: phoneSchema,
  message: z.string().trim().min(1).max(500),
  whatsappName: z.string().trim().max(80).optional(),
  "whatsapp-Name": z.string().trim().max(80).optional(),
  whatsapp_name: z.string().trim().max(80).optional(),
  profileName: z.string().trim().max(80).optional(),
});

const adminMessageSchema = z.object({
  text: z.string().trim().min(1).max(500),
});

const webhookInboundMessageSchema = z.object({
  id: z.string().trim().max(120).optional(),
  from: z
    .string()
    .trim()
    .regex(/^\d{8,20}$/, "Invalid WhatsApp sender id"),
  text: z
    .object({
      body: z.string().trim().min(1).max(4096),
    })
    .optional(),
  type: z.string().trim().max(40).optional(),
})
  /* Meta sends image / document / video / audio payloads alongside `from` */
  .passthrough();

/**
 * Normalize inbound WhatsApp Cloud payload into CRM message fields + AI-readable content.
 */
function summarizeInboundWhatsAppMessage(msg) {
  const type = String(msg.type || "text").toLowerCase();

  if (type === "text") {
    const body = String(msg.text?.body ?? "").trim();
    return {
      kind: "text",
      content: body || "(empty message)",
      caption: "",
      mediaFilename: "",
      mimeType: "",
      whatsappMediaId: "",
    };
  }

  if (type === "image") {
    const cap = String(msg.image?.caption ?? "").trim();
    const mime = String(msg.image?.mime_type ?? "").trim();
    const mid = String(msg.image?.id ?? "").trim();
    const content = cap ? `📷 Photo\n${cap}` : "📷 Photo";
    return {
      kind: "image",
      content,
      caption: cap,
      mediaFilename: "",
      mimeType: mime,
      whatsappMediaId: mid,
    };
  }

  if (type === "video") {
    const cap = String(msg.video?.caption ?? "").trim();
    const mime = String(msg.video?.mime_type ?? "").trim();
    const mid = String(msg.video?.id ?? "").trim();
    const content = cap ? `🎬 Video\n${cap}` : "🎬 Video";
    return {
      kind: "video",
      content,
      caption: cap,
      mediaFilename: "",
      mimeType: mime,
      whatsappMediaId: mid,
    };
  }

  if (type === "document") {
    const fn = String(msg.document?.filename ?? "Document").trim() || "Document";
    const cap = String(msg.document?.caption ?? "").trim();
    const mime = String(msg.document?.mime_type ?? "").trim();
    const mid = String(msg.document?.id ?? "").trim();
    const content = cap ? `📄 ${fn}\n${cap}` : `📄 ${fn}`;
    return {
      kind: "document",
      content,
      caption: cap,
      mediaFilename: fn,
      mimeType: mime,
      whatsappMediaId: mid,
    };
  }

  if (type === "audio") {
    const voice = Boolean(msg.audio?.voice);
    const mime = String(msg.audio?.mime_type ?? "").trim();
    const mid = String(msg.audio?.id ?? "").trim();
    const label = voice ? "🎤 Voice message" : "🎵 Audio";
    return {
      kind: "audio",
      content: label,
      caption: "",
      mediaFilename: "",
      mimeType: mime,
      whatsappMediaId: mid,
    };
  }

  if (type === "sticker") {
    const mid = String(msg.sticker?.id ?? "").trim();
    return {
      kind: "sticker",
      content: "😀 Sticker",
      caption: "",
      mediaFilename: "",
      mimeType: String(msg.sticker?.mime_type ?? "").trim(),
      whatsappMediaId: mid,
    };
  }

  return {
    kind: type || "unknown",
    content: `[${type || "message"} received]`,
    caption: "",
    mediaFilename: "",
    mimeType: "",
    whatsappMediaId: "",
  };
}

/** Full name must contain at least this many characters (after trim). */
const REGISTER_MIN_NAME_LENGTH = 3;

function registerNameOk(name) {
  return String(name || "").trim().length >= REGISTER_MIN_NAME_LENGTH;
}

const REGISTER_EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const REGISTER_ALLOWED_EMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
const SIGNUP_OTP_TTL_MINUTES = 10;
const SIGNUP_OTP_RESEND_COOLDOWN_MS = 60 * 1000;

function registerEmailDomainAllowed(email) {
  const emailNorm = String(email || "").trim().toLowerCase();
  const at = emailNorm.lastIndexOf("@");
  if (at < 0) return false;
  const domain = emailNorm.slice(at + 1);
  return REGISTER_ALLOWED_EMAIL_DOMAINS.has(domain);
}

app.get("/auth/email-available", authLimiter, async (req, res) => {
  try {
    const raw = String(req.query.email || "").trim().toLowerCase();
    if (!raw) {
      return res.json({ valid: false, available: false });
    }
    if (!REGISTER_EMAIL_RE.test(raw)) {
      return res.json({ valid: false, available: false });
    }
    const existing = await findAuthUserByEmail(raw);
    return res.json({ valid: true, available: !existing });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Could not check email" });
  }
});

app.post("/auth/register/send-otp", signupOtpLimiter, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "Database is offline. Check MONGO_URI / MongoDB connection, then retry.",
      });
    }

    const emailNorm = String(req.body?.email || "").trim().toLowerCase();
    if (!emailNorm) {
      return res.status(400).json({ error: "Email is required." });
    }
    if (!REGISTER_EMAIL_RE.test(emailNorm)) {
      return res.status(400).json({ error: "Invalid email address." });
    }
    if (!registerEmailDomainAllowed(emailNorm)) {
      return res
        .status(400)
        .json({ error: "Only Gmail addresses are allowed for registration." });
    }

    const existingUser = await findAuthUserByEmail(emailNorm);
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const existingOtp = await SignupOtp.findOne({ email: emailNorm })
      .select("sentAt")
      .lean();
    if (
      existingOtp?.sentAt &&
      Date.now() - new Date(existingOtp.sentAt).getTime() <
        SIGNUP_OTP_RESEND_COOLDOWN_MS
    ) {
      return res.status(429).json({
        error: "Please wait 60 seconds before requesting another code.",
      });
    }

    const otp = generatePasswordResetOtp();
    const expiresAt = new Date(Date.now() + SIGNUP_OTP_TTL_MINUTES * 60 * 1000);
    await SignupOtp.findOneAndUpdate(
      { email: emailNorm },
      {
        $set: {
          email: emailNorm,
          tokenHash: hashSignupOtp(otp),
          expiresAt,
          sentAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    try {
      await sendSignupOtpEmail(emailNorm, otp, SIGNUP_OTP_TTL_MINUTES);
    } catch (mailErr) {
      console.error("Signup verification email failed:", mailErr?.message || mailErr);
      console.log(`[Signup verify] OTP for ${emailNorm}: ${otp}`);
    }

    return res.json({
      success: true,
      message: "Verification code sent to your email.",
    });
  } catch (err) {
    console.log(err);
    if (String(err?.message || "").includes("buffering timed out")) {
      return res.status(503).json({
        error: "Database is offline. Check MONGO_URI / MongoDB connection, then retry.",
      });
    }
    return res.status(500).json({ error: "Could not send verification code." });
  }
});

app.post("/auth/register", authLimiter, async (req, res) => {
  try {
    if (!(await getEffectiveAllowPublicRegister())) {
      return res.status(403).json({
        error: "Public registration is disabled. Contact an admin to create your account.",
      });
    }

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Name, email and password required",
      });
    }

    if (!registerNameOk(name)) {
      return res.status(400).json({
        error: `Full name must be at least ${REGISTER_MIN_NAME_LENGTH} characters.`,
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters.",
      });
    }

    const emailNorm = String(email).trim().toLowerCase();
    if (!REGISTER_EMAIL_RE.test(emailNorm)) {
      return res.status(400).json({
        error: "Invalid email address.",
      });
    }
    if (!registerEmailDomainAllowed(emailNorm)) {
      return res.status(400).json({
        error: "Only Gmail addresses are allowed for registration.",
      });
    }

    const existing = await findAuthUserByEmail(emailNorm);

    if (existing) {
      return res.status(400).json({
        error: "Email already exists",
      });
    }

    // Require email OTP verification before creating the account
    const otpCode = String(req.body.otpCode || "").trim();
    if (!otpCode) {
      return res.status(400).json({
        error: "Email verification code is required. Please verify your email first.",
      });
    }
    const signupOtpRecord = await SignupOtp.findOne({ email: emailNorm });
    if (
      !signupOtpRecord ||
      signupOtpRecord.tokenHash !== hashSignupOtp(otpCode) ||
      new Date(signupOtpRecord.expiresAt).getTime() < Date.now()
    ) {
      return res.status(400).json({
        error: "Invalid or expired verification code. Please request a new one.",
      });
    }
    await SignupOtp.deleteOne({ email: emailNorm });

    const hashed = await bcrypt.hash(password, 10);

    const user = await AuthUser.create({
      name,
      email: emailNorm,
      password: hashed,
      /* Public signup creates their own workspace — admin by default */
      role: "admin",
    });

    const wid = String(user._id);
    const token = jwt.sign(
      {
        id: String(user._id),
        email: user.email,
        role: user.role,
        wid,
      },
      process.env.JWT_SECRET
    );

    res.json({
      token,
      user,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      error: "Registration failed",
    });
  }
});

const SIGNUP_INVITE_TTL_MS = 48 * 60 * 60 * 1000;

app.post("/auth/register-invite", authLimiter, async (req, res) => {
  try {
    const rawToken = String(req.body?.token || "").trim();
    const { name, email, password } = req.body;

    if (!rawToken || !name || !email || !password) {
      return res.status(400).json({
        error: "Invite token, name, email and password required",
      });
    }

    if (!registerNameOk(name)) {
      return res.status(400).json({
        error: `Full name must be at least ${REGISTER_MIN_NAME_LENGTH} characters.`,
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters.",
      });
    }

    const emailNorm = String(email).trim().toLowerCase();
    if (!REGISTER_EMAIL_RE.test(emailNorm)) {
      return res.status(400).json({
        error: "Invalid email address.",
      });
    }
    if (!registerEmailDomainAllowed(emailNorm)) {
      return res.status(400).json({
        error: "Only Gmail addresses are allowed for registration.",
      });
    }

    const tokenHash = hashSignupInviteToken(rawToken);
    const invite = await SignupInvite.findOne({ tokenHash });
    if (!invite || invite.usedAt) {
      return res.status(400).json({
        error: "Invalid or already used invite.",
      });
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({
        error: "This invite has expired.",
      });
    }

    const locked = String(invite.email || "").trim().toLowerCase();
    if (locked && locked !== emailNorm) {
      return res.status(400).json({
        error: "This invite is for a different email address.",
      });
    }

    const existing = await findAuthUserByEmail(emailNorm);
    if (existing) {
      return res.status(400).json({
        error: "Email already exists",
      });
    }

    // Require email OTP verification before creating the account
    const otpCode = String(req.body.otpCode || "").trim();
    if (!otpCode) {
      return res.status(400).json({
        error: "Email verification code is required. Please verify your email first.",
      });
    }
    const signupOtpRecord = await SignupOtp.findOne({ email: emailNorm });
    if (
      !signupOtpRecord ||
      signupOtpRecord.tokenHash !== hashSignupOtp(otpCode) ||
      new Date(signupOtpRecord.expiresAt).getTime() < Date.now()
    ) {
      return res.status(400).json({
        error: "Invalid or expired verification code. Please request a new one.",
      });
    }
    await SignupOtp.deleteOne({ email: emailNorm });

    const hashed = await bcrypt.hash(password, 10);

    if (invite.kind === "owner") {
      const user = await AuthUser.create({
        name,
        email: emailNorm,
        password: hashed,
        role: "admin",
      });
      invite.usedAt = new Date();
      await invite.save();

      const wid = String(user._id);
      const token = jwt.sign(
        {
          id: String(user._id),
          email: user.email,
          role: user.role,
          wid,
        },
        process.env.JWT_SECRET
      );

      return res.json({
        token,
        user,
      });
    }

    if (invite.kind === "member") {
      const ownerId = invite.workspaceOwnerId;
      if (!ownerId) {
        return res.status(400).json({
          error: "Invalid invite configuration.",
        });
      }
      const ownerOk = await AuthUser.findById(ownerId).select("_id").lean();
      if (!ownerOk) {
        return res.status(400).json({
          error: "Workspace no longer exists.",
        });
      }

      let finalRole = invite.role || "staff";
      if (!["admin", "manager", "staff", "viewer"].includes(finalRole)) {
        finalRole = "staff";
      }
      if (isPermanentManagerEmail(emailNorm)) {
        finalRole = finalRole === "admin" ? "admin" : "manager";
      }

      const user = await AuthUser.create({
        name,
        email: emailNorm,
        password: hashed,
        role: finalRole,
        workspaceOwnerId: ownerId,
      });
      invite.usedAt = new Date();
      await invite.save();

      const wid = String(ownerId);
      const token = jwt.sign(
        {
          id: String(user._id),
          email: user.email,
          role: user.role,
          wid,
        },
        process.env.JWT_SECRET
      );

      return res.json({
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }

    return res.status(400).json({ error: "Unknown invite type." });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "Registration failed",
    });
  }
});

app.post("/auth/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await findAuthUserByEmail(email);

    if (!user) {
      return res.status(400).json({
        error: "User not found",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        error:
          "This account has been disabled. Ask an administrator to turn it back on.",
      });
    }

    let ok = false;
    try {
      ok = await verifyStoredPassword(password, user.password);
    } catch {
      ok = false;
    }

    if (!ok) {
      return res.status(400).json({
        error: "Wrong password",
      });
    }

    /* Upgrade legacy plain-text password to bcrypt on successful login. */
    if (!looksLikeBcryptHash(user.password)) {
      try {
        user.password = await bcrypt.hash(String(password), 10);
        await user.save();
      } catch (e) {
        console.log("Password upgrade after login skipped:", e?.message || e);
      }
    }

    /* Env-listed emails stay `manager` unless they are full admins. */
    if (isPermanentManagerEmail(user.email) && user.role !== "admin") {
      if (user.role !== "manager") {
        try {
          user.role = "manager";
          await user.save();
        } catch (e) {
          console.log("Permanent manager role sync skipped:", e?.message || e);
        }
      }
    }

    const row = await AuthUser.findById(user._id).select("workspaceOwnerId").lean();
    let workspaceOwnerIdForToken = row?.workspaceOwnerId
      ? String(row.workspaceOwnerId)
      : String(user._id);
    if (row?.workspaceOwnerId) {
      const ownerOk = await AuthUser.findById(workspaceOwnerIdForToken).select("_id").lean();
      if (!ownerOk) {
        workspaceOwnerIdForToken = String(user._id);
      }
    }

    const token = jwt.sign(
      {
        id: String(user._id),
        email: user.email,
        role: user.role,
        wid: workspaceOwnerIdForToken,
      },
      process.env.JWT_SECRET
    );

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      error: "Login failed",
    });
  }
});

app.post("/auth/forgot-password", forgotLimiter, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "Database is offline. Check MONGO_URI / MongoDB connection, then retry.",
      });
    }

    const emailRaw = String(req.body.email || "").trim();
    if (!emailRaw) {
      return res.status(400).json({
        error: "Email is required",
      });
    }

    const generic = {
      message:
        "If an account exists for that email, you will receive a verification code shortly.",
    };

    const user = await findAuthUserByEmail(emailRaw);

    if (!user) {
      return res.json(generic);
    }

    if (user.isActive === false) {
      return res.json(generic);
    }

    const otp = generatePasswordResetOtp();
    const otpTtlMinutes = 15;
    user.passwordResetTokenHash = hashPasswordResetToken(otp);
    user.passwordResetExpires = new Date(
      Date.now() + otpTtlMinutes * 60 * 1000
    );
    await user.save();

    try {
      await sendPasswordResetOtpEmail(user.email, otp, otpTtlMinutes);
    } catch (mailErr) {
      console.error("Password reset email failed:", mailErr?.message || mailErr);
      console.log(`[Password reset] OTP for ${user.email}: ${otp}`);
    }

    res.json(generic);
  } catch (err) {
    console.log(err);
    if (String(err?.message || "").includes("buffering timed out")) {
      return res.status(503).json({
        error: "Database is offline. Check MONGO_URI / MongoDB connection, then retry.",
      });
    }

    res.status(500).json({
      error: "Could not process request. Try again later.",
    });
  }
});

app.post("/auth/reset-password", resetLimiter, async (req, res) => {
  try {
    const codeRaw = String(
      req.body.otp ?? req.body.token ?? ""
    ).trim();
    const emailRaw = String(req.body.email || "").trim();
    const newPassword = req.body.newPassword;

    if (!codeRaw || !emailRaw || !newPassword) {
      return res.status(400).json({
        error: "Email, verification code, and new password are required",
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        error: "New password must be at least 6 characters",
      });
    }

    const tokenHash = hashPasswordResetToken(codeRaw);
    const user = await AuthUser.findOne({
      email: new RegExp(`^${escapeRegex(emailRaw)}$`, "i"),
      passwordResetTokenHash: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        error:
          "Invalid or expired code. Request a new code from the forgot password page.",
      });
    }

    if (user.isActive === false) {
      return res.status(400).json({
        error: "This account is disabled. Contact an administrator.",
      });
    }

    user.password = await bcrypt.hash(String(newPassword), 10);
    user.passwordResetTokenHash = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({
      success: true,
      message: "Password updated. You can sign in with your new password.",
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      error: "Could not reset password",
    });
  }
});

/* ============================================================
   WHATSAPP WEBHOOK (META CLOUD)
============================================================ */

app.get("/webhooks/whatsapp", async (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const verifyToken = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode !== "subscribe" || !verifyToken) {
      return res.status(403).send("Verification failed");
    }

    const tokenIn = String(verifyToken || "");
    const settings = await Settings.findOne({
      whatsappVerifyToken: tokenIn,
    }).lean();

    const envVerify = String(process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
    if (!settings && (!envVerify || tokenIn !== envVerify)) {
      return res.status(403).send("Invalid verify token");
    }

    return res.status(200).send(String(challenge || ""));
  } catch (err) {
    console.log(err);
    return res.status(500).send("Webhook verification error");
  }
});

app.post("/webhooks/whatsapp", webhookLimiter, async (req, res) => {
  try {
    if (!verifyWhatsAppSignature(req)) {
      return res.status(401).send("Invalid webhook signature");
    }

    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const value = change?.value || {};
        const metadata = value?.metadata || {};
        const phoneNumberId = String(metadata.phone_number_id || "").trim();
        const displayNumber = normalizePhoneKey(metadata.display_phone_number);

        let accountSettings = null;

        if (phoneNumberId) {
          accountSettings = await Settings.findOne({
            whatsappPhoneNumberId: phoneNumberId,
          });
        }

        if (!accountSettings && displayNumber) {
          accountSettings = await Settings.findOne({
            whatsappNumber: new RegExp(`${displayNumber}$`),
          });
        }

        /* Dev / single-tenant: match Meta payload to .env phone number ID if CRM Settings row not filled */
        if (!accountSettings && phoneNumberId) {
          const envPid = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
          if (envPid && phoneNumberId === envPid) {
            accountSettings =
              (await Settings.findOne({ whatsappPhoneNumberId: envPid })) ||
              (await Settings.findOne({
                $or: [
                  { whatsappPhoneNumberId: "" },
                  { whatsappPhoneNumberId: { $exists: false } },
                ],
              }));
          }
        }

        if (!accountSettings) {
          continue;
        }

        const autoReplyEnabled = accountSettings.aiAutoReplyEnabled !== false;

        const inboundMessages = Array.isArray(value?.messages) ? value.messages : [];
        const profileName =
          value?.contacts?.[0]?.profile?.name ||
          "";

        for (const msg of inboundMessages) {
          const parsedInbound = webhookInboundMessageSchema.safeParse(msg || {});
          if (!parsedInbound.success) continue;

          const fromPhone = String(parsedInbound.data.from || "").trim();
          if (!fromPhone) continue;
          const inboundMessageId = String(parsedInbound.data.id || "").trim();

          const summary = summarizeInboundWhatsAppMessage(msg || {});

          const introName =
            summary.kind === "text"
              ? extractNameFromMessage(summary.content)
              : "";

          /* --- Find existing lead: exact phone first, then fuzzy (last 8 digits) --- */
          let lead = await Lead.findOne({
            phone: fromPhone,
            userId: accountSettings.userId,
          });

          if (!lead) {
            const digits = fromPhone.replace(/\D/g, "");
            if (digits.length >= 6) {
              lead = await Lead.findOne({
                userId: accountSettings.userId,
                isMerged: { $ne: true },
                phone: { $regex: digits.slice(-8) },
              });
              if (lead) {
                lead.phone = fromPhone;
                if (!lead.source || lead.source === "Website") {
                  lead.activityLog = lead.activityLog || [];
                  lead.activityLog.push({
                    type: "whatsapp_linked",
                    description: `WhatsApp contact matched to existing ${lead.source || "website"} lead (phone updated)`,
                    at: new Date(),
                    by: "system",
                  });
                }
              }
            }
          }

          if (!lead) {
            lead = await Lead.create({
              name: String(profileName || introName || "").trim(),
              phone: fromPhone,
              source: "WhatsApp",
              userId: accountSettings.userId,
              status: "new",
              messages: [],
              lastActivity: new Date(),
            });
          } else if (!lead.name && (profileName || introName)) {
            lead.name = String(profileName || introName || "").trim();
          }

          if (
            inboundMessageId &&
            (lead.messages || []).some(
              (m) =>
                m?.role === "user" &&
                String(m?.whatsappMessageId || "").trim() === inboundMessageId
            )
          ) {
            continue;
          }

          lead.messages.push({
            role: "user",
            content: summary.content,
            kind: summary.kind,
            caption: summary.caption || "",
            mediaFilename: summary.mediaFilename || "",
            mimeType: summary.mimeType || "",
            whatsappMediaId: summary.whatsappMediaId || "",
            whatsappMessageId: inboundMessageId,
            at: new Date(),
          });

          let capturedMissingDocViaWhatsapp = false;
          if (summary.kind !== "text") {
            const pendingRequest = findActivePendingRequestForLead(lead);
            if (pendingRequest && pendingRequest.method === "whatsapp_reply") {
              const ap = lead.admissionProfile || {};
              const alerts = Array.isArray(ap.inboundDocumentAlerts) ? ap.inboundDocumentAlerts : [];
              alerts.push({
                alertId: crypto.randomUUID(),
                requestId: pendingRequest.requestId,
                docType: pendingRequest.docType,
                source: "whatsapp_reply",
                status: "pending_review",
                whatsappMediaId: summary.whatsappMediaId || "",
                mimeType: summary.mimeType || "",
                mediaFilename: summary.mediaFilename || "",
                caption: summary.caption || "",
                content: summary.content || "",
                receivedAt: new Date(),
              });
              ap.inboundDocumentAlerts = alerts;
              pendingRequest.status = "received";
              lead.admissionProfile = ap;
              lead.markModified("admissionProfile");
              capturedMissingDocViaWhatsapp = true;
              await createNotification(
                accountSettings.userId,
                "document_received",
                `${lead.name || fromPhone} sent ${DOCUMENT_LABELS[normalizeDocType(pendingRequest.docType)] || "a requested document"}`,
                lead._id
              );
            }
          }

          let aiReply = "";
          const inboundText = String(summary.content || "");
          const explicitRegisterId = summary.kind === "text" ? extractRegisterIdFromText(inboundText) : "";
          if (explicitRegisterId) {
            const studentLead = await findWebsiteLeadForTrackQuery(explicitRegisterId);
            if (studentLead) {
              aiReply = buildWhatsappTrackerStatusMessage(studentLead);
            } else {
              aiReply = "Sorry, we couldn't find that ID. Please check the number or contact our team.";
            }
          } else if (summary.kind === "text" && looksLikeStatusIntent(inboundText)) {
            aiReply = "Sure! Please share your Register ID (example: NSI-2026-001).";
          } else if (capturedMissingDocViaWhatsapp) {
            aiReply = "Thanks. We received your document and our team will review it shortly.";
          } else if (autoReplyEnabled) {
            const todayKey = new Date().toISOString().slice(0, 10);
            const globalLimitRaw = Number(accountSettings.aiDailyReplyLimit || DAILY_AI_REPLY_LIMIT);
            const globalLimit = Number.isFinite(globalLimitRaw)
              ? Math.min(1000, Math.max(1, Math.floor(globalLimitRaw)))
              : DAILY_AI_REPLY_LIMIT;
            const overrideRaw = lead.extractedData?.aiDailyReplyLimitOverride;
            const hasOverride =
              overrideRaw != null &&
              Number.isFinite(Number(overrideRaw)) &&
              Number(overrideRaw) >= 1;
            const configuredLimit = hasOverride
              ? Math.min(1000, Math.max(1, Math.floor(Number(overrideRaw))))
              : globalLimit;
            const previousDate = String(lead.extractedData?.aiDailyDate || "");
            const previousCount = Number(lead.extractedData?.aiDailyCount || 0);
            const resetAtRaw = String(lead.extractedData?.aiLimitResetAt || "");
            const resetAtMs = Date.parse(resetAtRaw);
            const nowMs = Date.now();
            const hasResetAt = Number.isFinite(resetAtMs);
            const cooldownExpired = Number.isFinite(resetAtMs) && resetAtMs <= nowMs;

            let dailyCount = previousDate === todayKey ? previousCount : 0;
            if (cooldownExpired) {
              dailyCount = 0;
            }
            // Legacy data fallback: old records may have high count without reset timestamp.
            // Do not keep them permanently stuck in "limit finished".
            if (!hasResetAt && dailyCount >= configuredLimit) {
              dailyCount = 0;
            }
            const atDailyCap = dailyCount >= configuredLimit;
            // Cooldown only applies while still at today's cap. Raising the limit must allow AI again.
            const cooldownActive = hasResetAt && resetAtMs > nowMs && atDailyCap;
            const contactNumber = String(accountSettings.whatsappNumber || "")
              .replace(/\D+/g, "");
            const contactLine = contactNumber
              ? ` Please contact us on WhatsApp: +${contactNumber}.`
              : "";
            let nextDailyCount = dailyCount;
            let nextResetAt = cooldownActive ? resetAtRaw : "";

            if (cooldownActive) {
              aiReply = "";
            } else if (dailyCount >= configuredLimit - 1) {
              aiReply =
                `Today's AI chat is finished for now. Please share your details and our consultant will reply faster shortly.${contactLine}`;
              nextDailyCount = Math.min(configuredLimit, dailyCount + 1);
              nextResetAt = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
            } else {
              const history = lead.messages.map((m) => ({
                role: m.role === "admin" || m.role === "assistant" ? "assistant" : "user",
                content: String(m.content || ""),
              }));

              aiReply = await askAI(history, accountSettings.userId);
              if (!String(aiReply || "").trim()) {
                aiReply = "Thanks for your message. Our consultant will reply shortly.";
              }
              nextDailyCount = dailyCount + 1;
            }

            lead.extractedData = {
              ...(lead.extractedData || {}),
              aiDailyDate: todayKey,
              aiDailyCount: nextDailyCount,
              aiDailyLimit: configuredLimit,
              aiLimitResetAt: nextResetAt,
            };
          }

          let aiReplyDelivered = false;
          if (aiReply) {
            try {
              await sendWhatsAppCloudText({
                phoneNumberId:
                  accountSettings.whatsappPhoneNumberId ||
                  process.env.WHATSAPP_PHONE_NUMBER_ID,
                to: fromPhone,
                text: aiReply,
              });
              aiReplyDelivered = true;
            } catch (sendErr) {
              console.log(
                "WhatsApp auto-reply send failed:",
                `lead=${String(lead?._id || "")}`,
                `to=${String(fromPhone || "")}`,
                sendErr?.response?.data || sendErr?.message || sendErr
              );
            }
          }

          if (aiReply && aiReplyDelivered) {
            lead.messages.push({
              role: "assistant",
              content: aiReply,
              whatsappDeliveryChannel: "whatsapp",
              whatsappDeliveryStatus: "sent",
              whatsappDeliveredAt: new Date(),
              at: new Date(),
            });
          }

          lead.lastActivity = new Date();
          await lead.save();
          await maybeAutoRefreshLeadAiSummary(lead);

          await createNotification(
            accountSettings.userId,
            "new_message",
            `New WhatsApp message from ${lead.name || fromPhone}`,
            lead._id
          );
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.log("WhatsApp webhook error:", err?.message || err);
    return res.sendStatus(500);
  }
});

/* ============================================================
   MESSAGE API
============================================================ */

app.post("/message", auth, aiMessageLimiter, async (req, res) => {
  try {
    const parsed = userMessageSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid message payload. Provide digits-only phone and message up to 500 characters.",
      });
    }

    const { phone, message } = parsed.data;
    const rawWhatsappName =
      parsed.data.whatsappName ||
      parsed.data["whatsapp-Name"] ||
      parsed.data.whatsapp_name ||
      parsed.data.profileName ||
      "";
    const cleanWhatsappName = String(rawWhatsappName).trim();
    const introName = extractNameFromMessage(message);

    if (!phone || !message) {
      return res.status(400).json({
        error: "phone and message required",
      });
    }

    let lead = await Lead.findOne({
      phone,
      userId: tenantUserId(req),
    });

    if (!lead) {
      lead = await Lead.create({
        name: cleanWhatsappName || introName || "",
        phone,
        userId: tenantUserId(req),
        status: "new",
        messages: [],
        lastActivity: new Date(),
      });
    } else if (!lead.name && (cleanWhatsappName || introName)) {
      // Backfill name when profile/introduction appears later
      lead.name = cleanWhatsappName || introName;
    }

    const history = lead.messages.map((m) => ({
      role:
        m.role === "admin"
          ? "assistant"
          : m.role,
      content: m.content,
    }));

    history.push({
      role: "user",
      content: message,
    });

    const aiReply = await askAI(history, tenantUserId(req));

    lead.messages.push(
      {
        role: "user",
        content: message,
        at: new Date(),
      },
      {
        role: "assistant",
        content: aiReply,
        at: new Date(),
      }
    );

    lead.lastActivity = new Date();

    // SIMPLE SCORE
    const userMessages = lead.messages.filter(
      (m) => m.role === "user"
    ).length;

    if (userMessages >= 10) {
      lead.score = 80;
    } else if (userMessages >= 5) {
      lead.score = 50;
    } else {
      lead.score = 20;
    }

    // PRIORITY
    try {
      lead.priorityScore = calculatePriority(
        lead.toObject()
      );
    } catch {
      lead.priorityScore = lead.score;
    }

    const signals = extractLeadSignals(message);
    lead.tags = [...new Set([...(lead.tags || []), ...signals.tags])];

    if (signals.extracted.countryInterest) {
      lead.countryInterest = signals.extracted.countryInterest;
    }
    if (signals.extracted.courseInterest) {
      lead.courseInterest = signals.extracted.courseInterest;
    }
    if (signals.extracted.budget) {
      lead.budget = signals.extracted.budget;
    }

    lead.extractedData = {
      ...(lead.extractedData || {}),
      ieltsStatus: signals.extracted.ieltsStatus || lead.extractedData?.ieltsStatus || "",
      visaConcern: signals.extracted.visaConcern || lead.extractedData?.visaConcern || "",
      scholarshipInterest: signals.extracted.scholarshipInterest || lead.extractedData?.scholarshipInterest || "",
      urgency: signals.extracted.urgency || lead.extractedData?.urgency || "",
    };

    lead.emotion = signals.emotion || lead.emotion || "neutral";
    lead.emotionHistory = [
      ...(lead.emotionHistory || []),
      { emotion: lead.emotion, at: new Date() },
    ].slice(-20);

    applyAutomationRules(lead);

    // SUGGESTED REPLY
    lead.suggestedReply =
      "Thanks for your interest. Our consultant will contact you shortly.";

    await createNotification(
      tenantUserId(req),
      "new_message",
      `New message from ${phone}`,
      lead._id
    );

    await lead.save();
    await maybeAutoRefreshLeadAiSummary(lead);

    res.json({
      reply: aiReply,
      lead: enrichLead(lead.toObject()),
    });
  } catch (err) {
    console.log("MESSAGE ERROR:", err);

    res.status(500).json({
      error: "Failed to process message",
    });
  }
});

/* ============================================================
   LEADS
============================================================ */

const MAX_LEAD_COLLABORATORS = 5;

app.get("/admin/leads", auth, async (req, res) => {
  try {
    const query = {
      ...leadTenantUserIdMatch(tenantUserId(req)),
      isMerged: { $ne: true },
    };

    const mine = truthyQueryFlag(req.query.assignedToMe);
    let actorOid = null;
    let actorStr = "";
    if (mine) {
      const actor = req.actorUserId || extractMongoUserId(req.user);
      actorStr = actor != null ? String(actor) : "";
      if (!actorStr || !mongoose.Types.ObjectId.isValid(actorStr)) {
        return res.status(401).json({ error: "Invalid session" });
      }
      actorOid = new mongoose.Types.ObjectId(actorStr);
    }

    const src = String(req.query.source || "").trim().toLowerCase();
    const websiteOnly =
      src === "website"
        ? {
            $or: [
              { source: { $regex: /^website$/i } },
              { activityLog: { $elemMatch: { type: "website_apply" } } },
              {
                activityLog: {
                  $elemMatch: { description: /Application submitted from public website form/i },
                },
              },
            ],
          }
        : null;

    if (mine && websiteOnly) {
      query.$and = [
        {
          $or: [
            { assignedTo: { $in: [actorOid, actorStr] } },
            { assignedCollaborators: actorOid },
            { assignedCollaborators: actorStr },
          ],
        },
        websiteOnly,
      ];
    } else if (mine) {
      query.$or = [
        { assignedTo: { $in: [actorOid, actorStr] } },
        { assignedCollaborators: actorOid },
        { assignedCollaborators: actorStr },
      ];
    } else if (websiteOnly) {
      Object.assign(query, websiteOnly);
    }

    if (req.query.status && req.query.status !== "all") {
      query.status = req.query.status;
    }

    const sort = req.query.sort === "priority"
      ? { priorityScore: -1, score: -1, lastActivity: -1 }
      : { lastActivity: -1 };

    const leads = await Lead.find(query)
      .select(LEADS_LIST_SELECT)
      .populate({ path: "assignedTo", select: "name email role jobTitle" })
      .populate({ path: "assignedCollaborators", select: "name email role jobTitle" })
      .sort(sort)
      .lean();

    res.json(
      leads.map((lead) =>
        enrichLead(lead)
      )
    );
  } catch (err) {
    console.error("GET /admin/leads:", err?.message || err);
    res.status(500).json({
      error: "Failed to fetch leads",
    });
  }
});

/**
 * Website apply form submissions only — avoids relying on query-string `source=`
 * (proxies, older bundles, or caching). Same visibility rules as GET /admin/leads?source=website.
 */
app.get("/admin/website-applications", auth, async (req, res) => {
  try {
    const query = {
      ...leadTenantUserIdMatch(tenantUserId(req)),
      isMerged: { $ne: true },
      $or: [
        { source: { $regex: /^website$/i } },
        { activityLog: { $elemMatch: { type: "website_apply" } } },
        {
          activityLog: {
            $elemMatch: { description: /Application submitted from public website form/i },
          },
        },
      ],
    };

    const leads = await Lead.find(query)
      .populate({ path: "assignedTo", select: "name email role jobTitle" })
      .populate({ path: "assignedCollaborators", select: "name email role jobTitle" })
      .sort({ lastActivity: -1 })
      .lean();

    const enriched = leads.map((lead) => enrichLead(lead));
    if (process.env.NODE_ENV !== "production") {
      console.log(
        "[website-applications]",
        "tenant=",
        tenantUserId(req),
        "rows=",
        enriched.length
      );
    }
    res.json(enriched);
  } catch (err) {
    console.error("GET /admin/website-applications:", err?.message || err);
    res.status(500).json({
      error: "Failed to fetch website applications",
    });
  }
});

/**
 * Leads can still reference assignedTo = deleted AuthUser _id. Clears those refs for this workspace.
 */
app.post(
  "/admin/leads/repair-orphan-assignments",
  auth,
  requireRoles("admin", "manager"),
  async (req, res) => {
    try {
      const tenant = tenantUserId(req);
      const tenantMatch = leadTenantUserIdMatch(tenant);

      const leads = await Lead.find({
        ...tenantMatch,
        isMerged: { $ne: true },
        $or: [
          { assignedTo: { $ne: null } },
          { assignedCollaborators: { $exists: true, $not: { $size: 0 } } },
        ],
      })
        .select("_id assignedTo assignedCollaborators")
        .lean();

      if (leads.length === 0) {
        return res.json({ cleared: 0, message: "No assigned leads to check." });
      }

      const assigneeIds = new Set();
      for (const l of leads) {
        if (l.assignedTo) assigneeIds.add(String(l.assignedTo));
        for (const c of l.assignedCollaborators || []) {
          if (c) assigneeIds.add(String(c));
        }
      }

      const oidList = [...assigneeIds]
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

      const existingDocs =
        oidList.length === 0
          ? []
          : await AuthUser.find({ _id: { $in: oidList } })
              .select("_id")
              .lean();
      const existing = new Set(existingDocs.map((d) => String(d._id)));

      let cleared = 0;
      for (const lead of leads) {
        const $set = {};
        if (lead.assignedTo && !existing.has(String(lead.assignedTo))) {
          $set.assignedTo = null;
        }
        const keptCollabs = (lead.assignedCollaborators || []).filter((c) =>
          c ? existing.has(String(c)) : false
        );
        if (keptCollabs.length !== (lead.assignedCollaborators || []).length) {
          $set.assignedCollaborators = keptCollabs;
        }
        if (Object.keys($set).length > 0) {
          await Lead.updateOne({ _id: lead._id }, { $set });
          cleared += 1;
        }
      }

      res.json({
        cleared,
        message:
          cleared > 0
            ? `Repaired ${cleared} lead(s) (removed deleted users from assignment).`
            : "No orphan assignments.",
      });
    } catch (err) {
      console.error("repair-orphan-assignments:", err);
      res.status(500).json({ error: "Failed to repair assignments." });
    }
  }
);

app.get(
  "/admin/leads/:id",
  auth,
  validateId,
  async (req, res) => {
    try {
      const lead = await Lead.findOne({
        _id: req.params.id,
        ...leadTenantUserIdMatch(tenantUserId(req)),
      })
        .populate({ path: "assignedTo", select: "name email role jobTitle" })
        .populate({
          path: "assignedCollaborators",
          select: "name email role jobTitle",
        })
        .lean();

      if (!lead) {
        return res.status(404).json({
          error: "Lead not found",
        });
      }

      res.json(enrichLead(lead));
    } catch (err) {
      res.status(500).json({
        error: "Failed to fetch lead",
      });
    }
  }
);

app.patch(
  "/admin/leads/:id/status",
  auth,
  requireRoles("admin", "manager", "staff"),
  validateId,
  async (req, res) => {
    try {
      const { status } = req.body;

      const lead =
        await Lead.findOneAndUpdate(
          {
            _id: req.params.id,
            userId: tenantUserId(req),
          },
          {
            status,
            lastActivity: new Date(),
          },
          {
            new: true,
          }
        ).lean();

      if (!lead) {
        return res.status(404).json({
          error: "Lead not found",
        });
      }

      res.json(enrichLead(lead));
    } catch (err) {
      res.status(500).json({
        error: "Failed to update status",
      });
    }
  }
);

app.patch(
  "/admin/leads/:id/tags",
  auth,
  requireRoles("admin", "manager", "staff"),
  validateId,
  async (req, res) => {
    try {
      const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
      const cleanedTags = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];

      const lead = await Lead.findOneAndUpdate(
        {
          _id: req.params.id,
          userId: tenantUserId(req),
        },
        {
          tags: cleanedTags,
          lastActivity: new Date(),
        },
        { new: true }
      ).lean();

      if (!lead) {
        return res.status(404).json({
          error: "Lead not found",
        });
      }

      res.json(enrichLead(lead));
    } catch (err) {
      res.status(500).json({
        error: "Failed to update tags",
      });
    }
  }
);

app.post(
  "/admin/leads/:id/message",
  auth,
  adminSendLimiter,
  requireRoles("admin", "manager", "staff"),
  validateId,
  leadMessageMultipartOnly,
  async (req, res) => {
    try {
      const isMultipart = String(req.headers["content-type"] || "").includes(
        "multipart/form-data"
      );

      let text = "";
      let files = [];

      if (isMultipart) {
        text = String(req.body.text || "").trim();
        files = Array.isArray(req.files) ? req.files : [];
        if (!text && files.length === 0) {
          return res.status(400).json({
            error: "Add a message or at least one attachment.",
          });
        }
        if (text.length > 4096) {
          return res.status(400).json({
            error: "Message too long (max 4096 characters).",
          });
        }
        for (const file of files) {
          const { waType: wt, maxBytes } = classifyBroadcastAttachment(
            file.mimetype,
            file.originalname
          );
          if (file.size > maxBytes) {
            return res.status(400).json({
              error: `Attachment "${file.originalname || "file"}" too large for ${wt} (max ${Math.round(maxBytes / (1024 * 1024))} MB).`,
            });
          }
        }
      } else {
        const parsed = adminMessageSchema.safeParse(req.body || {});
        if (!parsed.success) {
          return res.status(400).json({
            error: "text required (1-500 characters).",
          });
        }
        text = parsed.data.text;
      }

      const lead = await Lead.findOne({
        _id: req.params.id,
        userId: tenantUserId(req),
      });

      if (!lead) {
        return res.status(404).json({
          error: "Lead not found",
        });
      }

      let crmContent = text;
      if (files.length) {
        const lines = files.map((f) => `📎 ${f.originalname || "attachment"}`);
        crmContent = text ? `${text}\n${lines.join("\n")}` : lines.join("\n");
      }

      lead.messages.push({
        role: "admin",
        content: crmContent || text || "📎 attachment",
        whatsappDeliveryChannel: "whatsapp",
        whatsappDeliveryStatus: "pending",
        at: new Date(),
      });
      const outboundMessage = lead.messages[lead.messages.length - 1];
      lead.lastActivity = new Date();
      lead.priorityScore = calculatePriority(lead.toObject());

      const whatsappInfo = {
        configured: false,
        sent: false,
        skippedNoPhone: false,
        error: null,
      };

      const accountSettings = await Settings.findOne({
        userId: tenantUserId(req),
      }).lean();
      const phoneNumberId = String(
        accountSettings?.whatsappPhoneNumberId ||
          process.env.WHATSAPP_PHONE_NUMBER_ID ||
          ""
      ).trim();
      const hasToken = Boolean(String(process.env.WHATSAPP_TOKEN || "").trim());
      whatsappInfo.configured = hasToken && Boolean(phoneNumberId);

      const to = normalizePhoneKey(lead.phone);
      if (whatsappInfo.configured && to.length >= 8) {
        let uploadedMedia = [];
        try {
          if (files.length > 0) {
            for (const file of files) {
              const { waType: wt } = classifyBroadcastAttachment(
                file.mimetype,
                file.originalname
              );
              const mediaId = await uploadWhatsAppMediaBuffer({
                phoneNumberId,
                buffer: file.buffer,
                filename: file.originalname || "attachment",
                mimeType: file.mimetype,
              });
              uploadedMedia.push({
                waType: wt,
                mediaId,
                filename: file.originalname || "attachment",
              });
            }
          }
          await deliverBroadcastWhatsAppForLead({
            phoneNumberId,
            to,
            message: text,
            uploaded: uploadedMedia,
          });
          whatsappInfo.sent = true;
          outboundMessage.whatsappDeliveryStatus = "sent";
          outboundMessage.whatsappDeliveredAt = new Date();
          outboundMessage.whatsappDeliveryError = "";
        } catch (waErr) {
          whatsappInfo.error =
            waErr?.response?.data?.error?.message ||
            waErr?.message ||
            "WhatsApp delivery failed";
          outboundMessage.whatsappDeliveryStatus = "failed";
          outboundMessage.whatsappDeliveryError = whatsappInfo.error;
          console.log(
            "Lead message WhatsApp send failed:",
            String(lead._id),
            waErr?.response?.data || waErr?.message || waErr
          );
        }
      } else if (whatsappInfo.configured && to.length < 8) {
        whatsappInfo.skippedNoPhone = true;
        outboundMessage.whatsappDeliveryStatus = "skipped_no_phone";
        outboundMessage.whatsappDeliveryError = "Lead phone is missing or invalid for WhatsApp delivery.";
      } else {
        outboundMessage.whatsappDeliveryStatus = "not_configured";
        outboundMessage.whatsappDeliveryError = "WhatsApp is not configured on the server.";
      }

      await lead.save();
      await maybeAutoRefreshLeadAiSummary(lead);

      const notifBits = [];
      if (files.length) {
        notifBits.push(`${files.length} file(s)`);
      }
      if (text) {
        notifBits.push("message");
      }
      await createNotification(
        tenantUserId(req),
        "admin_message",
        `Sent to ${lead.phone}${notifBits.length ? ` (${notifBits.join(" + ")})` : ""}`,
        lead._id
      );

      res.json({
        ...enrichLead(lead.toObject()),
        whatsapp: whatsappInfo,
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to send message",
      });
    }
  }
);

app.post(
  "/admin/leads/:id/clear-chat",
  auth,
  requireRoles("admin", "manager", "staff"),
  validateId,
  async (req, res) => {
    try {
      const lead = await Lead.findOne({
        _id: req.params.id,
        userId: tenantUserId(req),
      });

      if (!lead) {
        return res.status(404).json({
          error: "Lead not found",
        });
      }

      lead.messages = [];
      lead.lastActivity = new Date();
      lead.aiSummary = "";
      lead.aiSummaryAt = null;
      lead.aiSummaryMilestone = 0;
      lead.importantDetails = "";
      lead.suggestedReply =
        "Thanks for your interest. Our consultant will contact you shortly.";
      lead.priorityScore = calculatePriority(lead.toObject());

      await lead.save();

      await createNotification(
        tenantUserId(req),
        "admin_message",
        `Chat cleared for ${lead.name || lead.phone}`,
        lead._id
      );

      res.json(enrichLead(lead.toObject()));
    } catch (err) {
      res.status(500).json({
        error: "Failed to clear chat",
      });
    }
  }
);

app.patch(
  "/admin/leads/:id/important-details",
  auth,
  requireRoles("admin", "manager", "staff"),
  validateId,
  async (req, res) => {
    try {
      const lead = await Lead.findOne({
        _id: req.params.id,
        userId: tenantUserId(req),
      });

      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const raw = req.body?.importantDetails;
      if (raw !== undefined && raw !== null && typeof raw !== "string") {
        return res.status(400).json({ error: "importantDetails must be a string" });
      }

      lead.importantDetails = String(raw ?? "").slice(0, 8000);
      lead.lastActivity = new Date();
      await lead.save();

      res.json(enrichLead(lead.toObject()));
    } catch (err) {
      res.status(500).json({ error: "Failed to save important details" });
    }
  }
);

app.patch(
  "/admin/leads/:id/ai-reply-limit-override",
  auth,
  requireRoles("admin", "manager", "staff"),
  validateId,
  async (req, res) => {
    try {
      const raw = req.body?.aiDailyReplyLimitOverride;
      let override = null;
      if (raw !== null && raw !== undefined && raw !== "") {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          return res.status(400).json({
            error: "Limit must be a number between 1 and 1000.",
          });
        }
        override = Math.min(1000, Math.max(1, Math.floor(n)));
      }

      const lead = await Lead.findOne({
        _id: req.params.id,
        userId: tenantUserId(req),
      });

      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const settings = await Settings.findOne({ userId: tenantUserId(req) }).lean();
      const globalLimitRaw = Number(settings?.aiDailyReplyLimit ?? DAILY_AI_REPLY_LIMIT);
      const globalLimit = Number.isFinite(globalLimitRaw)
        ? Math.min(1000, Math.max(1, Math.floor(globalLimitRaw)))
        : DAILY_AI_REPLY_LIMIT;

      const effectiveLimit = override ?? globalLimit;
      const todayKey = new Date().toISOString().slice(0, 10);
      const prevDate = String(lead.extractedData?.aiDailyDate || "");
      const count = Number(lead.extractedData?.aiDailyCount || 0);
      const countToday = prevDate === todayKey ? count : 0;

      lead.extractedData = { ...(lead.extractedData || {}) };
      if (override === null) {
        delete lead.extractedData.aiDailyReplyLimitOverride;
      } else {
        lead.extractedData.aiDailyReplyLimitOverride = override;
      }
      lead.extractedData.aiDailyLimit = effectiveLimit;
      if (countToday < effectiveLimit) {
        lead.extractedData.aiLimitResetAt = "";
      }
      lead.lastActivity = new Date();
      await lead.save();

      res.json(enrichLead(lead.toObject()));
    } catch (err) {
      res.status(500).json({ error: "Failed to update per-lead AI limit" });
    }
  }
);

app.get(
  "/admin/leads/:id/summary",
  auth,
  validateId,
  async (req, res) => {
    try {
      const lead = await Lead.findOne({
        _id: req.params.id,
        userId: tenantUserId(req),
      });

      if (!lead) {
        return res.status(404).json({
          error: "Lead not found",
        });
      }

      if (!lead.messages?.length) {
        return res.json({
          summary: "",
        });
      }

      const summary = await generateLeadAiSummaryGroq(lead);
      assignLeadAiSummaryFields(lead, summary);
      await lead.save();

      res.json({
        summary,
        aiSummaryAt: lead.aiSummaryAt,
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to generate summary",
      });
    }
  }
);

app.patch(
  "/admin/leads/:id/assign",
  auth,
  requireRoles("admin", "manager"),
  validateId,
  async (req, res) => {
    try {
      const tenant = tenantUserId(req);
      const hasPrimary = Object.prototype.hasOwnProperty.call(
        req.body,
        "assignedTo"
      );
      const hasCollabs = Object.prototype.hasOwnProperty.call(
        req.body,
        "assignedCollaborators"
      );

      if (!hasPrimary && !hasCollabs) {
        return res.status(400).json({
          error: "Send assignedTo and/or assignedCollaborators",
        });
      }

      let assignedToOid = null;
      let primaryStaff = null;

      if (hasPrimary) {
        const raw = req.body.assignedTo;
        if (raw != null && raw !== "") {
          if (!mongoose.Types.ObjectId.isValid(String(raw))) {
            return res.status(400).json({ error: "Invalid staff id" });
          }
          primaryStaff = await findAssignableStaff(tenant, raw);
          if (!primaryStaff) {
            return res.status(404).json({
              error: "Team member not found or cannot be assigned",
            });
          }
          assignedToOid = primaryStaff._id;
        }
      }

      let effectivePrimaryForCollabs = null;
      if (hasPrimary) {
        effectivePrimaryForCollabs = assignedToOid;
      } else if (hasCollabs) {
        const snap = await Lead.findOne({
          _id: req.params.id,
          userId: tenant,
          isMerged: { $ne: true },
        })
          .select("assignedTo")
          .lean();
        effectivePrimaryForCollabs = snap?.assignedTo || null;
      }

      let collaboratorOids = [];
      if (hasCollabs) {
        const collaboratorsRaw = req.body.assignedCollaborators;
        if (!Array.isArray(collaboratorsRaw)) {
          return res.status(400).json({
            error: "assignedCollaborators must be an array",
          });
        }
        if (collaboratorsRaw.length > MAX_LEAD_COLLABORATORS) {
          return res.status(400).json({
            error: `At most ${MAX_LEAD_COLLABORATORS} additional teammates`,
          });
        }

        const seen = new Set();
        for (const raw of collaboratorsRaw) {
          if (raw == null || raw === "") continue;
          if (!mongoose.Types.ObjectId.isValid(String(raw))) {
            return res.status(400).json({ error: "Invalid collaborator id" });
          }
          const sid = String(raw);
          if (seen.has(sid)) continue;
          seen.add(sid);
          if (
            effectivePrimaryForCollabs &&
            sid === String(effectivePrimaryForCollabs)
          ) {
            return res.status(400).json({
              error:
                "Primary assignee cannot also be listed as a collaborator",
            });
          }
          const collab = await findAssignableStaff(tenant, raw);
          if (!collab) {
            return res.status(404).json({
              error: "Team member not found or cannot be assigned",
            });
          }
          collaboratorOids.push(collab._id);
        }
      }

      const $set = {};
      if (hasPrimary) {
        $set.assignedTo = assignedToOid;
      }
      if (hasCollabs) {
        $set.assignedCollaborators = collaboratorOids;
      }

      const lead = await Lead.findOneAndUpdate(
        {
          _id: req.params.id,
          userId: tenant,
          isMerged: { $ne: true },
        },
        { $set },
        { new: true }
      )
        .populate({ path: "assignedTo", select: "name email role jobTitle" })
        .populate({
          path: "assignedCollaborators",
          select: "name email role jobTitle",
        })
        .lean();

      if (!lead) {
        return res.status(404).json({
          error: "Lead not found",
        });
      }

      const assignedToName =
        (lead.assignedTo && lead.assignedTo.name) || primaryStaff?.name || "";

      res.json({
        ...enrichLead(lead),
        assignedToName,
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to assign lead",
      });
    }
  }
);

app.patch(
  "/admin/leads/:id/admission",
  auth,
  requireRoles("admin", "manager", "staff"),
  validateId,
  async (req, res) => {
    try {
      const body = req.body || {};
      const lead = await Lead.findOne({
        _id: req.params.id,
        userId: tenantUserId(req),
        isMerged: { $ne: true },
      });

      if (!lead) {
        return res.status(404).json({
          error: "Lead not found",
        });
      }

      const prev = lead.admissionProfile || {};
      const next = typeof prev.toObject === "function" ? prev.toObject() : { ...prev };
      const prevStage = normalizeAdmissionStage(prev.processStage || "registered");
      const prevRegisterId = String(prev.registrationId || "").trim();

      const setStr = (key, val) => {
        if (val === undefined) return;
        if (val === null || val === "") {
          next[key] = key === "registrationId" ? undefined : "";
          return;
        }
        next[key] = String(val).trim();
      };

      if (body.passportNumber !== undefined) {
        setStr("passportNumber", body.passportNumber);
      }
      if (body.universityInterest !== undefined) {
        setStr("universityInterest", body.universityInterest);
      }
      if (body.passportExpiry !== undefined) {
        if (!body.passportExpiry) {
          next.passportExpiry = null;
        } else {
          const d = new Date(String(body.passportExpiry));
          next.passportExpiry = Number.isNaN(d.getTime()) ? null : d;
        }
      }

      if (body.registrationId !== undefined) {
        const rid = String(body.registrationId || "").trim();
        if (rid) {
          const clash = await Lead.findOne({
            "admissionProfile.registrationId": rid,
            _id: { $ne: lead._id },
          })
            .select("_id")
            .lean();
          if (clash) {
            return res.status(400).json({
              error: "That registration ID is already assigned to another student.",
            });
          }
        }
        next.registrationId = rid || undefined;
      }

      if (body.processStage !== undefined && body.processStage !== null) {
        next.processStage = normalizeAdmissionStage(body.processStage);
      }

      if (typeof body.paymentReceived === "boolean") {
        next.paymentReceived = body.paymentReceived;
      }

      for (const k of [
        "docMatric",
        "docFsc",
        "docPassport",
        "docPhotos",
        "docCnic",
        "docBankStatement",
        "docHecAttestation",
      ]) {
        if (typeof body[k] === "boolean") {
          next[k] = body[k];
        }
      }

      if (
        next.registrationId &&
        admissionStageIndex(next.processStage) < admissionStageIndex("documents_complete")
      ) {
        return res.status(400).json({
          error: "Register ID can only be assigned after Documents Complete.",
        });
      }

      if (admissionStageIndex(next.processStage) >= admissionStageIndex("documents_complete")) {
        await assignRegisterIdIfNeeded(lead, next);
      }

      lead.admissionProfile = next;
      lead.markModified("admissionProfile");
      lead.lastActivity = new Date();

      await lead.save();
      const nextStage = normalizeAdmissionStage(next.processStage || "registered");
      if (!prevRegisterId && String(next.registrationId || "").trim()) {
        await notifyRegisterIdAssignment(lead);
      }
      await notifyStageUpdateOnWhatsApp(lead, prevStage, nextStage);
      if (lead.isModified("messages")) {
        await lead.save();
      }

      res.json(enrichLead(lead.toObject()));
    } catch (err) {
      console.error("PATCH /admin/leads/:id/admission:", err);
      res.status(500).json({
        error: "Failed to update admission profile",
      });
    }
  }
);

/* ============================================================
   DASHBOARD
============================================================ */
/* ============================================================
   TOP LEADS
============================================================ */

/* ============================================================
   DASHBOARD + LEADS LIST — SERVER-SIDE RESPONSE CACHE
   Keyed by tenantId string; entries expire after CACHE_TTL_MS.
   Invalidated on any Lead write via invalidateTenantCache().
============================================================ */
const _tenantCache = new Map(); // key → { data, expiresAt }
const DASHBOARD_CACHE_TTL_MS = 20_000;
const LEADS_CACHE_TTL_MS = 8_000;

function getTenantCache(key) {
  const entry = _tenantCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _tenantCache.delete(key); return null; }
  return entry.data;
}
function setTenantCache(key, data, ttlMs) {
  _tenantCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
function invalidateTenantCache(tenantId) {
  for (const key of _tenantCache.keys()) {
    if (key.startsWith(String(tenantId))) _tenantCache.delete(key);
  }
}

/* Only fields needed for the leads list — excludes message content */
const LEADS_LIST_SELECT = {
  name: 1, phone: 1, email: 1, source: 1, status: 1, score: 1,
  priorityScore: 1, countryInterest: 1, courseInterest: 1, budget: 1,
  lastActivity: 1, createdAt: 1, updatedAt: 1, followUpDate: 1,
  assignedTo: 1, assignedCollaborators: 1, userId: 1, isMerged: 1,
  tags: 1,
  "admissionProfile.processStage": 1,
  "admissionProfile.registrationId": 1,
  "admissionProfile.uploadsMeta": 1,
  "messages.role": 1,
  activityLog: 1,
};

app.get("/leads/top", auth, async (req, res) => {
  try {
    const tid = tenantUserId(req);
    if (!tid) return res.status(401).json({ error: "Invalid session" });

    const cacheKey = `${tid}:top`;
    const cached = getTenantCache(cacheKey);
    if (cached) return res.json(cached);

    const leads = await Lead.find({ userId: tid, isMerged: { $ne: true } })
      .select(LEADS_LIST_SELECT)
      .sort({ priorityScore: -1, score: -1, lastActivity: -1 })
      .limit(5)
      .lean();

    const result = leads.map((lead) => enrichLead(lead));
    setTenantCache(cacheKey, result, LEADS_CACHE_TTL_MS);
    res.json(result);
  } catch (err) {
    console.log("TOP LEADS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch top leads" });
  }
});
app.get("/admin/dashboard", auth, async (req, res) => {
  try {
    const tid = tenantUserId(req);
    if (!tid) return res.status(401).json({ error: "Invalid session" });

    const cacheKey = `${tid}:dashboard`;
    const cached = getTenantCache(cacheKey);
    if (cached) return res.json(cached);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const last24h    = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [agg] = await Lead.aggregate([
      { $match: { ...leadTenantUserIdMatch(tid) } },
      { $facet: {
        statusCounts: [
          { $group: { _id: "$status", n: { $sum: 1 } } },
        ],
        avgScore: [
          { $group: { _id: null, avg: { $avg: "$score" } } },
        ],
        followUpsDue: [
          { $match: { followUpDate: { $gte: todayStart, $lt: todayEnd } } },
          { $count: "n" },
        ],
        followUpsOverdue: [
          { $match: { followUpDate: { $lt: todayStart } } },
          { $count: "n" },
        ],
        newLeads24h: [
          { $match: { createdAt: { $gte: last24h } } },
          { $count: "n" },
        ],
        uncontacted: [
          { $match: {
            isMerged: { $ne: true },
            "messages.role": { $not: { $in: ["assistant", "admin"] } },
          }},
          { $count: "n" },
        ],
        replied: [
          { $match: { "messages.role": { $in: ["assistant", "admin"] } } },
          { $count: "n" },
        ],
        engaged: [
          { $project: {
            msgCount: { $size: { $ifNull: ["$messages", []] } },
            score: 1,
          }},
          { $match: { msgCount: { $gt: 3 }, score: { $lt: 50 } } },
          { $count: "n" },
        ],
        countryBreakdown: [
          { $group: { _id: { $ifNull: ["$countryInterest", "Unknown"] }, n: { $sum: 1 } } },
        ],
        pendingDocumentAlerts: [
          { $project: {
            pending: { $size: { $filter: {
              input: { $ifNull: ["$admissionProfile.inboundDocumentAlerts", []] },
              as: "a",
              cond: { $eq: [{ $toLower: { $ifNull: ["$$a.status", ""] } }, "pending_review"] },
            }}},
          }},
          { $group: { _id: null, total: { $sum: "$pending" } } },
        ],
      }},
    ]);

    const statusMap = {};
    for (const s of (agg?.statusCounts || [])) statusMap[s._id] = s.n;
    const total = Object.values(statusMap).reduce((s, n) => s + n, 0);
    const converted = statusMap.converted || 0;

    const country = {};
    for (const c of (agg?.countryBreakdown || [])) country[c._id] = c.n;

    const result = {
      total,
      new:      statusMap.new       || 0,
      converted,
      hot:      statusMap.hot       || 0,
      warm:     statusMap.warm      || 0,
      ready:    statusMap.ready     || 0,
      avgScore: Math.round(agg?.avgScore?.[0]?.avg || 0),
      uncontacted:      agg?.uncontacted?.[0]?.n      || 0,
      replied:          agg?.replied?.[0]?.n           || 0,
      engaged:          agg?.engaged?.[0]?.n           || 0,
      followUpsDue:     agg?.followUpsDue?.[0]?.n      || 0,
      followUpsOverdue: agg?.followUpsOverdue?.[0]?.n  || 0,
      newLeads24h:      agg?.newLeads24h?.[0]?.n       || 0,
      pendingDocumentAlerts: agg?.pendingDocumentAlerts?.[0]?.total || 0,
      countryBreakdown: country,
      conversionRate: total ? Math.round((converted / total) * 100) : 0,
    };

    setTenantCache(cacheKey, result, DASHBOARD_CACHE_TTL_MS);
    res.json(result);
  } catch (err) {
    console.error("GET /admin/dashboard:", err?.message || err);
    res.status(500).json({ error: "Dashboard error" });
  }
});

app.get("/admin/document-alerts/count", auth, async (req, res) => {
  try {
    const tenant = tenantUserId(req);
    if (!tenant) {
      return res.status(401).json({ error: "Invalid session" });
    }
    const rows = await Lead.aggregate([
      {
        $match: {
          ...leadTenantUserIdMatch(tenant),
          ...admissionPipelineFilter(),
          isMerged: { $ne: true },
        },
      },
      {
        $project: {
          pendingCount: {
            $size: {
              $filter: {
                input: { $ifNull: ["$admissionProfile.inboundDocumentAlerts", []] },
                as: "a",
                cond: { $eq: ["$$a.status", "pending_review"] },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$pendingCount" },
        },
      },
    ]);
    return res.json({
      count: Number(rows?.[0]?.total || 0),
    });
  } catch (err) {
    console.error("GET /admin/document-alerts/count:", err?.message || err);
    return res.status(500).json({ error: "Could not fetch document alert count." });
  }
});

app.get("/public/app-config", async (req, res) => {
  try {
    const allowPublicRegister = await getEffectiveAllowPublicRegister();
    res.json({ allowPublicRegister });
  } catch (err) {
    res.status(500).json({ error: "Could not load app configuration." });
  }
});

app.get("/public/invite-preview", authLimiter, async (req, res) => {
  try {
    const raw = String(req.query.token || "").trim();
    if (!raw) {
      return res.json({ valid: false });
    }
    const tokenHash = hashSignupInviteToken(raw);
    const invite = await SignupInvite.findOne({ tokenHash }).lean();
    if (!invite || invite.usedAt) {
      return res.json({ valid: false });
    }
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      return res.json({ valid: false, expired: true });
    }
    let workspaceName = "";
    if (invite.kind === "member" && invite.workspaceOwnerId) {
      const st = await Settings.findOne({ userId: invite.workspaceOwnerId })
        .select("consultancyName")
        .lean();
      workspaceName = String(st?.consultancyName || "").trim();
    }
    res.json({
      valid: true,
      kind: invite.kind,
      lockedEmail: invite.email ? String(invite.email).trim().toLowerCase() : "",
      role: invite.role || "staff",
      expiresAt: invite.expiresAt,
      workspaceName,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Could not validate invite." });
  }
});

app.get("/admin/app-config", auth, requireRoles("admin", "manager"), async (req, res) => {
  try {
    const allowPublicRegister = await getEffectiveAllowPublicRegister();
    const doc = await AppConfig.findOne({ key: "global" }).lean();
    const source =
      doc && typeof doc.allowPublicRegister === "boolean" ? "database" : "environment";
    const eligible = await canManageGlobalPublicSignup(req);
    const isAdminRole = String(req.user?.role || "") === "admin";
    res.json({
      allowPublicRegister,
      source,
      envDefault: ALLOW_PUBLIC_REGISTER,
      canManagePublicSignup: eligible && isAdminRole,
    });
  } catch (err) {
    res.status(500).json({ error: "Could not load app configuration." });
  }
});

app.patch("/admin/app-config", auth, requireRoles("admin"), async (req, res) => {
  try {
    if (String(req.user?.role || "") !== "admin") {
      return res.status(403).json({
        error: "Only admins can change global public signup.",
      });
    }
    if (!(await canManageGlobalPublicSignup(req))) {
      return res.status(403).json({
        error:
          "Only the workspace owner or a platform admin can change global public signup (see MAIN_ADMIN_EMAIL, PLATFORM_ADMIN_EMAILS, or PERMANENT_MANAGER_EMAILS on the server).",
      });
    }
    const raw = req.body?.allowPublicRegister;
    if (typeof raw !== "boolean") {
      return res.status(400).json({
        error: "allowPublicRegister must be true or false",
      });
    }
    await setAppAllowPublicRegister(raw);
    res.json({
      allowPublicRegister: raw,
      message:
        "Saved. This applies to everyone who visits your app: open or closed public signup.",
    });
  } catch (err) {
    res.status(500).json({ error: "Could not save app configuration." });
  }
});

app.get("/platform/signup-invite-eligibility", auth, async (req, res) => {
  try {
    const ok = await isPlatformOperatorRequest(req);
    res.json({ canCreateOwnerInvites: ok });
  } catch (err) {
    res.status(500).json({ error: "Could not check eligibility." });
  }
});

app.post("/platform/owner-signup-invites", auth, async (req, res) => {
  try {
    if (!(await isPlatformOperatorRequest(req))) {
      return res.status(403).json({
        error: "Only platform operators can create new-workspace signup invites.",
      });
    }
    const emailLock = String(req.body?.email || "").trim().toLowerCase();
    const rawToken = generateSignupInviteToken();
    const tokenHash = hashSignupInviteToken(rawToken);
    await SignupInvite.create({
      tokenHash,
      kind: "owner",
      workspaceOwnerId: null,
      email: emailLock && REGISTER_EMAIL_RE.test(emailLock) ? emailLock : "",
      role: "manager",
      expiresAt: new Date(Date.now() + SIGNUP_INVITE_TTL_MS),
      createdBy: req.actorUserId || null,
    });
    const origin =
      String(process.env.FRONTEND_URL || process.env.PUBLIC_WEB_ORIGIN || "").replace(/\/$/, "") ||
      "";
    const path = `/register?invite=${encodeURIComponent(rawToken)}`;
    const inviteUrl = origin ? `${origin}${path}` : path;
    res.status(201).json({
      token: rawToken,
      inviteUrl,
      expiresInHours: 48,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Could not create invite." });
  }
});

app.get("/admin/workspace-invites", auth, requireRoles("admin", "manager"), async (req, res) => {
  try {
    const tid = tenantUserId(req);
    if (!mongoose.Types.ObjectId.isValid(String(tid))) {
      return res.json([]);
    }
    const oid = new mongoose.Types.ObjectId(String(tid));
    const rows = await SignupInvite.find({
      kind: "member",
      workspaceOwnerId: oid,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(
      rows.map((r) => ({
        id: r._id,
        email: r.email || "",
        role: r.role,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
      }))
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Could not list invites." });
  }
});

app.post("/admin/workspace-invites", auth, requireRoles("admin", "manager"), async (req, res) => {
  try {
    const tid = tenantUserId(req);
    if (!mongoose.Types.ObjectId.isValid(String(tid))) {
      return res.status(400).json({ error: "Invalid workspace." });
    }
    const oid = new mongoose.Types.ObjectId(String(tid));
    let role = String(req.body?.role || "staff").trim();
    if (!["admin", "manager", "staff", "viewer"].includes(role)) {
      role = "staff";
    }
    const emailLock = String(req.body?.email || "").trim().toLowerCase();
    const rawToken = generateSignupInviteToken();
    const tokenHash = hashSignupInviteToken(rawToken);
    await SignupInvite.create({
      tokenHash,
      kind: "member",
      workspaceOwnerId: oid,
      email: emailLock && REGISTER_EMAIL_RE.test(emailLock) ? emailLock : "",
      role,
      expiresAt: new Date(Date.now() + SIGNUP_INVITE_TTL_MS),
      createdBy: req.actorUserId || null,
    });
    const origin =
      String(process.env.FRONTEND_URL || process.env.PUBLIC_WEB_ORIGIN || "").replace(/\/$/, "") ||
      "";
    const path = `/register?invite=${encodeURIComponent(rawToken)}`;
    const inviteUrl = origin ? `${origin}${path}` : path;
    res.status(201).json({
      token: rawToken,
      inviteUrl,
      expiresInHours: 48,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Could not create invite." });
  }
});

app.get("/admin/onboarding-status", auth, async (req, res) => {
  try {
    const tid = tenantUserId(req);
    const settings = await Settings.findOne({ userId: tid }).lean();
    const dismissed = settings?.onboardingChecklistDismissed === true;
    const teamCount = await AuthUser.countDocuments(sameWorkspaceQuery(tid));
    const uniCount = await University.countDocuments({ userId: tid });
    const cn = String(settings?.consultancyName || "").trim();
    const whatsappConnected = Boolean(String(settings?.whatsappPhoneNumberId || "").trim());
    const consultancyNameCustomized = Boolean(
      cn && cn !== "Next Step International"
    );
    const teamHasExtraMember = teamCount >= 2;
    const hasUniversity = uniCount >= 1;
    const items = [
      whatsappConnected,
      teamHasExtraMember,
      consultancyNameCustomized,
      hasUniversity,
    ];
    const done = items.filter(Boolean).length;
    res.json({
      dismissed,
      whatsappConnected,
      teamHasExtraMember,
      consultancyNameCustomized,
      hasUniversity,
      progress: done,
      total: 4,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Could not load onboarding status." });
  }
});

app.post("/admin/onboarding-dismiss", auth, requireRoles("admin", "manager"), async (req, res) => {
  try {
    const tid = tenantUserId(req);
    await Settings.findOneAndUpdate(
      { userId: tid },
      { $set: { onboardingChecklistDismissed: true } },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Could not save preference." });
  }
});

/* Users who can receive a lead assignment (admin picks from this list). */
app.get(
  "/admin/team-assignees",
  auth,
  requireRoles("admin", "manager"),
  async (req, res) => {
    try {
      const tenant = tenantUserId(req);
      const users = await AuthUser.find(
        assignableTeamMemberFilter(tenant),
        "_id name email role jobTitle"
      )
        .sort({ name: 1 })
        .lean();
      res.json(users);
    } catch (err) {
      res.status(500).json({
        error: "Failed to load assignees",
      });
    }
  }
);

/** Workspace assignees with current lead assignment counts — admins only. */
app.get(
  "/admin/team-assignments-overview",
  auth,
  requireRoles("admin"),
  async (req, res) => {
  try {
    const tenant = tenantUserId(req);
    const members = await AuthUser.find(
      assignableTeamMemberFilter(tenant),
      "_id name email role jobTitle"
    )
      .sort({ name: 1 })
      .lean();

    const memberIdSet = new Set(members.map((m) => String(m._id)));

    const assignmentLeads = await Lead.find({
      ...leadTenantUserIdMatch(tenant),
      isMerged: { $ne: true },
      $or: [
        { assignedTo: { $ne: null } },
        { assignedCollaborators: { $exists: true, $not: { $size: 0 } } },
      ],
    })
      .select("assignedTo assignedCollaborators")
      .lean();

    const countByAssignee = new Map(members.map((m) => [String(m._id), 0]));

    for (const lead of assignmentLeads) {
      const touched = new Set();
      if (lead.assignedTo) {
        const sid = String(lead.assignedTo);
        if (memberIdSet.has(sid)) touched.add(sid);
      }
      for (const c of lead.assignedCollaborators || []) {
        if (!c) continue;
        const sid = String(c);
        if (memberIdSet.has(sid)) touched.add(sid);
      }
      for (const sid of touched) {
        countByAssignee.set(sid, (countByAssignee.get(sid) || 0) + 1);
      }
    }

    res.json(
      members.map((m) => ({
        ...m,
        assignedLeadCount: countByAssignee.get(String(m._id)) || 0,
      }))
    );
  } catch (err) {
    console.error("team-assignments-overview:", err?.message || err);
    res.status(500).json({
      error: "Failed to load assignment overview",
    });
  }
  }
);

app.get("/admin/team", auth, requireRoles("admin", "manager"), async (req, res) => {
  try {
    const tenant = tenantUserId(req);
    const pmSet = new Set(permanentManagerEmails());
    const users = await AuthUser.find(
      {
        $or: [{ _id: tenant }, { workspaceOwnerId: tenant }],
      },
      "_id name email role jobTitle createdAt isActive workspaceOwnerId"
    )
      .sort({ createdAt: 1 })
      .lean();
    const out = users.map((u) => ({
      ...u,
      isPermanentManager: pmSet.has(
        String(u.email || "").trim().toLowerCase()
      ),
    }));
    res.json(out);
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch team",
    });
  }
});

app.patch(
  "/admin/team/:id",
  auth,
  requireRoles("admin", "manager"),
  validateId,
  async (req, res) => {
    try {
      const targetId = req.params.id;
      const actorId = extractMongoUserId(req.user);
      const roleIn = req.body?.role;
      const isActiveIn = req.body?.isActive;

      const hasRole = roleIn !== undefined && roleIn !== null;
      const hasActive = isActiveIn !== undefined && isActiveIn !== null;

      if (!hasRole && !hasActive) {
        return res.status(400).json({
          error: "Send role and/or isActive to update.",
        });
      }

      if (
        hasRole &&
        !["admin", "manager", "staff", "viewer"].includes(String(roleIn))
      ) {
        return res.status(400).json({
          error: "Role must be admin, manager, staff, or viewer",
        });
      }

      if (hasActive && typeof isActiveIn !== "boolean") {
        return res.status(400).json({
          error: "isActive must be a boolean",
        });
      }

      const target = await AuthUser.findById(targetId);
      if (!target) {
        return res.status(404).json({ error: "User not found" });
      }

      const tenant = tenantUserId(req);
      if (!isSameWorkspaceMember(tenant, target)) {
        return res.status(404).json({ error: "User not found" });
      }

      if (isPermanentManagerEmail(target.email)) {
        if (hasActive && isActiveIn === false) {
          return res.status(400).json({
            error:
              "This account is listed in PERMANENT_MANAGER_EMAILS and cannot be suspended.",
          });
        }
        if (
          hasRole &&
          !["manager", "admin"].includes(String(roleIn))
        ) {
          return res.status(400).json({
            error:
              "Permanent manager accounts cannot be demoted to staff or viewer.",
          });
        }
      }

      const sameUser =
        actorId &&
        target._id &&
        String(actorId) === String(target._id);

      if (sameUser && hasActive && isActiveIn === false) {
        return res.status(400).json({
          error: "You cannot disable your own account.",
        });
      }

      if (sameUser && hasRole && String(roleIn) !== String(target.role)) {
        return res.status(400).json({
          error: "You cannot change your own role from this screen.",
        });
      }

      if (hasActive && isActiveIn === false && target.role === "admin") {
        const activeAdmins = await AuthUser.countDocuments({
          role: "admin",
          isActive: { $ne: false },
          ...sameWorkspaceQuery(tenant),
        });
        if (activeAdmins <= 1) {
          return res.status(400).json({
            error: "Cannot disable the only active admin account.",
          });
        }
      }

      if (hasRole && String(roleIn) !== "admin" && target.role === "admin") {
        const activeAdmins = await AuthUser.countDocuments({
          role: "admin",
          isActive: { $ne: false },
          ...sameWorkspaceQuery(tenant),
        });
        if (activeAdmins <= 1) {
          return res.status(400).json({
            error: "Cannot remove admin role from the only admin.",
          });
        }
      }

      const updates = {};
      if (hasRole) updates.role = String(roleIn);
      if (hasActive) updates.isActive = isActiveIn;

      await AuthUser.updateOne({ _id: target._id }, { $set: updates });

      const fresh = await AuthUser.findById(target._id)
        .select("_id name email role jobTitle createdAt isActive")
        .lean();

      res.json(fresh);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: "Failed to update team member" });
    }
  }
);

app.post("/admin/team", auth, requireRoles("admin", "manager"), async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const role = String(req.body?.role || "staff").trim();

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Name, email and password required",
      });
    }

    if (!["admin", "manager", "staff", "viewer"].includes(role)) {
      return res.status(400).json({
        error: "Role must be admin, manager, staff, or viewer",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters",
      });
    }

    const existing = await AuthUser.findOne({
      email: new RegExp(`^${escapeRegex(email)}$`, "i"),
    });

    if (existing) {
      return res.status(400).json({
        error: "Email already exists",
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    let finalRole = role;
    if (isPermanentManagerEmail(email)) {
      finalRole = role === "admin" ? "admin" : "manager";
    }

    const tenant = tenantUserId(req);

    const user = await AuthUser.create({
      name,
      email,
      password: hashed,
      role: finalRole,
      workspaceOwnerId: tenant,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "Failed to create team member",
    });
  }
});

async function purgeTeamMemberData(userId) {
  if (!userId) return;
  await Lead.deleteMany({ userId });
  await Lead.updateMany({ assignedTo: userId }, { $set: { assignedTo: null } });
  await Settings.deleteMany({ userId });
  await University.deleteMany({ userId });
  await Notification.deleteMany({ userId });
}

app.delete(
  "/admin/team/:id",
  auth,
  requireRoles("admin", "manager"),
  validateId,
  async (req, res) => {
    try {
      const targetId = req.params.id;
      const actorId = extractMongoUserId(req.user);
      const target = await AuthUser.findById(targetId);
      if (!target) {
        return res.status(404).json({ error: "User not found" });
      }

      const tenant = tenantUserId(req);
      if (!isSameWorkspaceMember(tenant, target)) {
        return res.status(404).json({ error: "User not found" });
      }

      if (isPermanentManagerEmail(target.email)) {
        return res.status(400).json({
          error:
            "This account is listed in PERMANENT_MANAGER_EMAILS and cannot be deleted.",
        });
      }

      if (actorId && String(target._id) === String(actorId)) {
        return res.status(400).json({
          error: "You cannot delete your own account.",
        });
      }

      if (target.role === "admin") {
        const otherActiveAdmins = await AuthUser.countDocuments({
          role: "admin",
          isActive: { $ne: false },
          _id: { $ne: target._id },
          ...sameWorkspaceQuery(tenant),
        });
        if (otherActiveAdmins < 1) {
          return res.status(400).json({
            error: "Cannot delete the only remaining admin account.",
          });
        }
      }

      await purgeTeamMemberData(target._id);
      await AuthUser.deleteOne({ _id: target._id });

      res.json({ ok: true, deletedId: String(target._id) });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: "Failed to delete team member" });
    }
  }
);

async function fetchWhatsAppMediaBinary(mediaId) {
  const token = String(process.env.WHATSAPP_TOKEN || "").trim();
  if (!token) {
    throw new Error("WHATSAPP_TOKEN missing");
  }
  const id = String(mediaId || "").trim();
  if (!id || id.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Invalid media id");
  }

  const metaUrl = `https://graph.facebook.com/v25.0/${id}`;
  const metaRes = await axios.get(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  });

  const url = metaRes.data?.url;
  const mime = metaRes.data?.mime_type || "application/octet-stream";
  if (!url) {
    throw new Error("Media metadata missing URL");
  }

  const binRes = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: "arraybuffer",
    timeout: 120000,
    maxContentLength: 100 * 1024 * 1024,
    maxBodyLength: 100 * 1024 * 1024,
  });

  return {
    buffer: Buffer.from(binRes.data),
    mime,
  };
}

/**
 * Proxies WhatsApp Cloud media so the CRM can show images / download files (requires JWT).
 * Query: download=1&filename=name.pdf for Content-Disposition attachment.
 */
app.get("/admin/whatsapp/media/:mediaId", auth, async (req, res) => {
  try {
    const rawName = String(req.query.filename || "download").trim();
    const safeName = rawName.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180) || "download";
    const asAttachment = req.query.download === "1";

    const { buffer, mime } = await fetchWhatsAppMediaBinary(req.params.mediaId);

    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "private, max-age=120");
    if (asAttachment) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeName}"`
      );
    }

    res.send(buffer);
  } catch (err) {
    console.log(
      "WhatsApp media proxy:",
      err?.response?.data || err?.message || err
    );
    const msg =
      err?.response?.data?.error?.message ||
      err?.message ||
      "Could not fetch media from WhatsApp";
    const code =
      String(msg).includes("missing") || String(msg).includes("WHATSAPP_TOKEN")
        ? 503
        : 400;
    res.status(code).json({ error: msg });
  }
});

/* ============================================================
   SETTINGS
============================================================ */

app.get("/admin/settings", auth, async (req, res) => {
  try {
    let settings = await Settings.findOne({
      userId: tenantUserId(req),
    });

    if (!settings) {
      settings = await Settings.create({
        userId: tenantUserId(req),
      });
    }

    if (settings.aiDailyReplyLimit == null || Number.isNaN(Number(settings.aiDailyReplyLimit))) {
      settings.aiDailyReplyLimit = DAILY_AI_REPLY_LIMIT;
      settings.aiAutoReplyEnabled = settings.aiAutoReplyEnabled !== false;
      await settings.save();
    }

    const cn = String(settings.consultancyName || "").trim();
    if (!cn) {
      settings.consultancyName = "Next Step International";
      await settings.save();
    }

    res.json(settings);
  } catch (err) {
    res.status(500).json({
      error: "Failed to load settings",
    });
  }
});

app.post(
  "/admin/settings",
  auth,
  requireRoles("admin", "manager"),
  async (req, res) => {
  try {
    const incoming = req.body || {};
    /* Always scoped to this login's CRM tenant — never another workspace */
    const tid = tenantUserId(req);

    const existing = await Settings.findOne({
      userId: tid,
    }).lean();

    const prevLimitRaw = Number(existing?.aiDailyReplyLimit);
    const incomingLimitRaw = Number(incoming.aiDailyReplyLimit);
    const clampedDailyLimit = Number.isFinite(incomingLimitRaw)
      ? Math.min(1000, Math.max(1, Math.floor(incomingLimitRaw)))
      : Number.isFinite(prevLimitRaw) && prevLimitRaw > 0
        ? Math.min(1000, Math.max(1, Math.floor(prevLimitRaw)))
        : Math.min(1000, Math.max(1, DAILY_AI_REPLY_LIMIT));

    const $set = { ...incoming, aiDailyReplyLimit: clampedDailyLimit };
    if (!Object.prototype.hasOwnProperty.call(incoming, "aiAutoReplyEnabled")) {
      delete $set.aiAutoReplyEnabled;
    } else {
      $set.aiAutoReplyEnabled = incoming.aiAutoReplyEnabled === true;
    }

    const settings = await Settings.findOneAndUpdate(
      {
        userId: tid,
      },
      { $set },
      {
        new: true,
        upsert: true,
      }
    );

    if (tid && mongoose.Types.ObjectId.isValid(String(tid))) {
      const todayKey = new Date().toISOString().slice(0, 10);
      await Lead.updateMany(
        {
          userId: tid,
          "extractedData.aiDailyDate": todayKey,
          $and: [
            {
              $or: [
                { "extractedData.aiDailyReplyLimitOverride": { $exists: false } },
                { "extractedData.aiDailyReplyLimitOverride": null },
              ],
            },
            {
              $or: [
                { "extractedData.aiDailyCount": { $exists: false } },
                { "extractedData.aiDailyCount": null },
                { "extractedData.aiDailyCount": { $lt: clampedDailyLimit } },
              ],
            },
          ],
        },
        {
          $set: {
            "extractedData.aiLimitResetAt": "",
            "extractedData.aiDailyLimit": clampedDailyLimit,
          },
        }
      );
    }

    res.json(settings);
  } catch (err) {
    res.status(500).json({
      error: "Failed to save settings",
    });
  }
});

app.get("/admin/me", auth, async (req, res) => {
  try {
    const uid = extractMongoUserId(req.user) || req.user?.id;
    if (!uid || !mongoose.Types.ObjectId.isValid(String(uid))) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const user = await AuthUser.findById(uid)
      .select("_id name email role jobTitle workspaceOwnerId")
      .lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const workspaceId = tenantUserId(req);
    let workspaceOwner = null;
    if (user.workspaceOwnerId) {
      workspaceOwner = await AuthUser.findById(String(user.workspaceOwnerId))
        .select("name email")
        .lean();
    }

    res.json({
      ...user,
      workspaceId,
      workspaceOwnerName: workspaceOwner?.name || null,
      workspaceOwnerEmail: workspaceOwner?.email || null,
      usesSharedWorkspace: Boolean(user.workspaceOwnerId),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.patch("/admin/me", auth, async (req, res) => {
  try {
    const uid = extractMongoUserId(req.user) || req.user?.id;
    if (!uid || !mongoose.Types.ObjectId.isValid(String(uid))) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const updates = {};
    if (req.body?.name != null) {
      updates.name = String(req.body.name).trim().slice(0, 120);
    }
    if (req.body?.jobTitle != null) {
      updates.jobTitle = String(req.body.jobTitle).trim().slice(0, 120);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: "Provide name and/or jobTitle to update.",
      });
    }

    await AuthUser.updateOne({ _id: uid }, { $set: updates });

    const user = await AuthUser.findById(uid)
      .select("_id name email role jobTitle")
      .lean();

    res.json(user);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

async function handleChangePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Current password and new password are required",
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        error: "New password must be at least 6 characters",
      });
    }

    const userId = extractMongoUserId(req.user);
    const tokenEmail =
      typeof req.user?.email === "string" ? req.user.email.trim() : "";

    let user =
      userId != null ? await AuthUser.findById(userId) : null;

    if (!user && tokenEmail) {
      user = await AuthUser.findOne({
        email: tokenEmail,
      });
    }

    if (!user) {
      return res.status(404).json({
        error:
          "User not found in AuthUser collection. Sign out, sign in again (fresh token), then retry.",
      });
    }

    const stored = user.password;
    if (!stored || typeof stored !== "string") {
      return res.status(400).json({
        error:
          "Your account password could not be loaded. Sign out, sign in again, then try changing your password.",
      });
    }

    let match = false;
    try {
      match = await verifyStoredPassword(currentPassword, stored);
    } catch (cmpErr) {
      console.log("verify password error:", cmpErr?.message || cmpErr);

      return res.status(400).json({
        error:
          "Could not verify your current password. Sign out and sign in again, then retry.",
      });
    }

    if (!match) {
      return res.status(400).json({
        error: "Current password is incorrect",
      });
    }

    const hashed = await bcrypt.hash(String(newPassword), 10);
    /* Use document _id so MongoDB always matches the same row as findById. */
    const result = await AuthUser.updateOne(
      { _id: user._id },
      { $set: { password: hashed } }
    );

    if (result.matchedCount === 0) {
      return res.status(500).json({
        error: "Could not update password",
        detail: "No document matched _id in authusers.",
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("handleChangePassword:", err);

    res.status(500).json({
      error: "Could not update password",
      detail: err?.message ? String(err.message) : undefined,
    });
  }
}

/* POST preferred — some proxies block PATCH; both work */
app.post("/admin/me/password", auth, handleChangePassword);
app.patch("/admin/me/password", auth, handleChangePassword);

app.post(
  "/admin/broadcast",
  auth,
  requireRoles("admin", "manager", "staff"),
  broadcastMultipartOnly,
  async (req, res) => {
    try {
      const message = String(req.body.message || "").trim();
      const status = req.body.status || "all";
      let leadIds = [];
      const rawIds = req.body.leadIds;
      if (Array.isArray(rawIds)) {
        leadIds = rawIds;
      } else if (typeof rawIds === "string" && rawIds.trim()) {
        try {
          const parsed = JSON.parse(rawIds);
          leadIds = Array.isArray(parsed) ? parsed : [];
        } catch {
          leadIds = [];
        }
      }

      const files = Array.isArray(req.files) ? req.files : [];
      if (!message && files.length === 0) {
        return res.status(400).json({
          error: "Add a message and/or at least one attachment.",
        });
      }

      if (message.length > 4096) {
        return res.status(400).json({
          error: "message too long (max 4096 characters for WhatsApp).",
        });
      }

      for (const file of files) {
        const { waType: wt, maxBytes } = classifyBroadcastAttachment(
          file.mimetype,
          file.originalname
        );
        if (file.size > maxBytes) {
          return res.status(400).json({
            error: `Attachment "${file.originalname || "file"}" too large for ${wt} (max ${Math.round(maxBytes / (1024 * 1024))} MB).`,
          });
        }
      }

      const attachMetaList = files.map((file) => {
        const { waType: wt } = classifyBroadcastAttachment(
          file.mimetype,
          file.originalname
        );
        return {
          kind: wt,
          name: file.originalname || "attachment",
          mime: file.mimetype || "application/octet-stream",
          size: file.size,
        };
      });

      let crmContent = message;
      if (files.length) {
        const lines = files.map((f) => `📎 ${f.originalname || "attachment"}`);
        crmContent = message ? `${message}\n${lines.join("\n")}` : lines.join("\n");
      }

      const query = {
        userId: tenantUserId(req),
        isMerged: { $ne: true },
      };

      if (status && status !== "all") {
        query.status = status;
      }

      if (leadIds.length > 0) {
        const validIds = leadIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
        query._id = { $in: validIds };
      }

      const leads = await Lead.find(query);

      const accountSettings = await Settings.findOne({
        userId: tenantUserId(req),
      }).lean();
      const phoneNumberId = String(
        accountSettings?.whatsappPhoneNumberId ||
          process.env.WHATSAPP_PHONE_NUMBER_ID ||
          ""
      ).trim();
      const hasToken = Boolean(String(process.env.WHATSAPP_TOKEN || "").trim());
      const whatsappConfigured = hasToken && Boolean(phoneNumberId);

      const whatsappStats = {
        attempted: whatsappConfigured,
        configured: whatsappConfigured,
        delivered: 0,
        skippedNoPhone: 0,
        failed: 0,
        errors: [],
        attachments: attachMetaList,
      };

      let uploadedMedia = [];

      if (!whatsappConfigured) {
        whatsappStats.reason = !hasToken
          ? "WHATSAPP_TOKEN missing in server .env"
          : "WhatsApp Phone number ID missing (Settings or WHATSAPP_PHONE_NUMBER_ID)";
      } else if (files.length > 0 && phoneNumberId) {
        try {
          for (const file of files) {
            const { waType: wt } = classifyBroadcastAttachment(
              file.mimetype,
              file.originalname
            );
            const mediaId = await uploadWhatsAppMediaBuffer({
              phoneNumberId,
              buffer: file.buffer,
              filename: file.originalname || "attachment",
              mimeType: file.mimetype,
            });
            uploadedMedia.push({
              waType: wt,
              mediaId,
              filename: file.originalname || "attachment",
            });
          }
        } catch (upErr) {
          console.log("Broadcast media upload failed:", upErr?.response?.data || upErr?.message || upErr);
          return res.status(400).json({
            error:
              upErr?.response?.data?.error?.message ||
              upErr?.message ||
              "WhatsApp rejected an attachment upload.",
          });
        }
      }

      const pushErrorSample = (phone, err) => {
        if (whatsappStats.errors.length >= 5) return;
        const meta = err?.response?.data?.error;
        whatsappStats.errors.push({
          phone: phone || "",
          message:
            meta?.message ||
            meta?.error_user_msg ||
            err?.message ||
            "Send failed",
          code: meta?.code,
        });
      };

      for (const lead of leads) {
        lead.messages.push({
          role: "admin",
          content: crmContent || message || "📎 attachment",
          whatsappDeliveryChannel: "whatsapp",
          whatsappDeliveryStatus: "pending",
          at: new Date(),
        });
        const outboundMessage = lead.messages[lead.messages.length - 1];
        lead.lastActivity = new Date();
        lead.priorityScore = calculatePriority(lead.toObject());

        if (!whatsappConfigured) {
          outboundMessage.whatsappDeliveryStatus = "not_configured";
          outboundMessage.whatsappDeliveryError =
            whatsappStats.reason || "WhatsApp is not configured on the server.";
          await lead.save();
          continue;
        }

        const to = normalizePhoneKey(lead.phone);
        if (to.length < 8) {
          whatsappStats.skippedNoPhone++;
          outboundMessage.whatsappDeliveryStatus = "skipped_no_phone";
          outboundMessage.whatsappDeliveryError =
            "Lead phone is missing or invalid for WhatsApp delivery.";
          await lead.save();
          continue;
        }

        try {
          await deliverBroadcastWhatsAppForLead({
            phoneNumberId,
            to,
            message,
            uploaded: uploadedMedia,
          });

          whatsappStats.delivered++;
          outboundMessage.whatsappDeliveryStatus = "sent";
          outboundMessage.whatsappDeliveredAt = new Date();
          outboundMessage.whatsappDeliveryError = "";
          await lead.save();
          await new Promise((r) => setTimeout(r, 250));
        } catch (sendErr) {
          whatsappStats.failed++;
          outboundMessage.whatsappDeliveryStatus = "failed";
          outboundMessage.whatsappDeliveryError =
            sendErr?.response?.data?.error?.message ||
            sendErr?.message ||
            "WhatsApp delivery failed";
          await lead.save();
          pushErrorSample(lead.phone, sendErr);
          console.log(
            "Broadcast WhatsApp send failed:",
            String(lead._id),
            sendErr?.response?.data || sendErr?.message || sendErr
          );
        }
      }

      const attachNote =
        files.length > 0
          ? ` + ${files.length} attachment(s)`
          : "";

      await createNotification(
        tenantUserId(req),
        "broadcast",
        whatsappConfigured
          ? `Broadcast: ${leads.length} lead(s) updated; WhatsApp delivered ${whatsappStats.delivered}${attachNote} (${whatsappStats.failed} failed, ${whatsappStats.skippedNoPhone} no phone).`
          : `Broadcast saved for ${leads.length} lead(s) in CRM (WhatsApp not configured on server).`,
        null
      );

      res.json({
        success: true,
        sent: leads.length,
        whatsapp: whatsappStats,
      });
    } catch (err) {
      res.status(500).json({
        error: "Broadcast failed",
      });
    }
  }
);

/* ============================================================
   UNIVERSITIES
============================================================ */

app.get("/admin/universities", auth, async (req, res) => {
  try {
    const universities =
      await University.find({
        userId: tenantUserId(req),
      }).lean();

    res.json(universities);
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch universities",
    });
  }
});

app.post("/admin/universities", auth, async (req, res) => {
  try {
    const university =
      await University.create({
        ...req.body,
        userId: tenantUserId(req),
      });

    res.json(university);
  } catch (err) {
    res.status(500).json({
      error: "Failed to create university",
    });
  }
});

app.delete("/admin/universities/:id", auth, validateId, async (req, res) => {
  try {
    const result = await University.deleteOne({
      _id: req.params.id,
      userId: tenantUserId(req),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: "University not found",
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      error: "Failed to delete university",
    });
  }
});

/* ============================================================
   NOTIFICATIONS
============================================================ */

app.get(
  "/admin/notifications",
  auth,
  async (req, res) => {
    try {
      const notifications =
        await Notification.find({
          userId: tenantUserId(req),
        })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();

      res.json(notifications);
    } catch (err) {
      res.status(500).json({
        error: "Failed to fetch notifications",
      });
    }
  }
);

app.patch(
  "/admin/notifications/:id/read",
  auth,
  validateId,
  async (req, res) => {
    try {
      const updated = await Notification.findOneAndUpdate(
        {
          _id: req.params.id,
          userId: tenantUserId(req),
        },
        { read: true, count: 0 },
        { new: true }
      ).lean();

      if (!updated) {
        return res.status(404).json({
          error: "Notification not found",
        });
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({
        error: "Failed to update notification",
      });
    }
  }
);

app.post(
  "/admin/notifications/read-all",
  auth,
  async (req, res) => {
    try {
      const result = await Notification.updateMany(
        { userId: tenantUserId(req) },
        { $set: { read: true, count: 0 } }
      );

      res.json({
        success: true,
        updated: result.modifiedCount || 0,
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to update notifications",
      });
    }
  }
);

/** Mark every notification tied to a lead as read (e.g. after opening the lead). */
app.post(
  "/admin/notifications/read-for-lead/:id",
  auth,
  validateId,
  async (req, res) => {
    try {
      const leadId = req.params.id;
      const result = await Notification.updateMany(
        {
          userId: tenantUserId(req),
          leadId,
        },
        { $set: { read: true, count: 0 } }
      );

      res.json({
        success: true,
        updated: result.modifiedCount || 0,
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to mark notifications read for lead",
      });
    }
  }
);

app.delete(
  "/admin/notifications/:id",
  auth,
  validateId,
  async (req, res) => {
    try {
      const deleted = await Notification.findOneAndDelete({
        _id: req.params.id,
        userId: tenantUserId(req),
      }).lean();

      if (!deleted) {
        return res.status(404).json({
          error: "Notification not found",
        });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({
        error: "Failed to delete notification",
      });
    }
  }
);

app.post(
  "/admin/notifications/delete-selected",
  auth,
  async (req, res) => {
    try {
      const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
      const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));

      if (!validIds.length) {
        return res.status(400).json({
          error: "No valid notification ids",
        });
      }

      const result = await Notification.deleteMany({
        userId: tenantUserId(req),
        _id: { $in: validIds },
      });

      res.json({
        success: true,
        deleted: result.deletedCount || 0,
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to delete notifications",
      });
    }
  }
);

app.post(
  "/admin/notifications/clear-all",
  auth,
  async (req, res) => {
    try {
      const result = await Notification.deleteMany({
        userId: tenantUserId(req),
      });

      res.json({
        success: true,
        deleted: result.deletedCount || 0,
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to clear notifications",
      });
    }
  }
);

/* ============================================================
   AI ANALYTICS FIXED
============================================================ */

app.post(
  "/admin/analytics/ai",
  auth,
  async (req, res) => {
    try {
      const ALLOWED_ANALYTICS_STATUSES = new Set(["new", "warm", "hot"]);
      const rawStatuses = req.body?.statuses;
      const statuses =
        Array.isArray(rawStatuses) && rawStatuses.length
          ? [
              ...new Set(
                rawStatuses.filter(
                  (s) =>
                    typeof s === "string" &&
                    ALLOWED_ANALYTICS_STATUSES.has(s)
                )
              ),
            ]
          : [];

      const query = {
        userId: tenantUserId(req),
      };
      if (statuses.length) {
        query.status = {
          $in: statuses,
        };
      }

      const leads = await Lead.find(query)
        .select(
          "status score countryInterest tags emotion aiSummary name"
        )
        .lean();

      const filterLabel =
        statuses.length === 0
          ? "All leads"
          : statuses
              .map(
                (s) =>
                  s.charAt(0).toUpperCase() + s.slice(1)
              )
              .join(" + ");

      const metaExtras = {
        leadFilter: statuses.length ? statuses : null,
        leadFilterLabel: filterLabel,
        analyticsSource: "lead_ai_summary",
      };

      if (!leads.length) {
        return res.json(
          normalizeAnalyticsPayload(
            {
              summary:
                statuses.length > 0
                  ? `No leads match this selection (${filterLabel}). Try “All leads” or pick different segments.`
                  : "No leads yet.",
            },
            0,
            0,
            metaExtras
          )
        );
      }

      const withSummary = leads.filter((l) => String(l.aiSummary || "").trim());

      if (!withSummary.length) {
        return res.json(
          normalizeAnalyticsPayload(
            {
              summary:
                statuses.length > 0
                  ? `No AI summaries for ${filterLabel} yet. Open those leads, run “AI Summary” on each profile, then try again. Raw chats are not read here.`
                  : "No AI summaries yet. Open each lead, refresh “AI Summary” on the profile, then run analytics. This report only uses those summaries—not full student chats.",
            },
            leads.length,
            0,
            metaExtras
          )
        );
      }

      // Summaries only (from lead profile); cap count/length for token limits
      const summarySample = withSummary.slice(0, 25).map((l) => ({
        status: l.status,
        score: l.score,
        country: l.countryInterest,
        emotion: l.emotion,
        tags: l.tags?.slice(0, 5),
        lead: String(l.name || "").trim() || "Lead",
        aiSummary: String(l.aiSummary || "").trim().slice(0, 800),
      }));

      const prompt = `
You are aggregating CRM analytics from per-lead "AI Summary" blurbs only (already generated on each lead profile). Do NOT assume you see raw chat transcripts—only the aiSummary text below.

Selection: ${filterLabel}. (${withSummary.length} lead(s) with an AI Summary in this scope; you are given up to 25 summaries.)

Data (each object is one lead's profile AI Summary, not messages):
${JSON.stringify(summarySample)}

Return ONLY JSON:
{
  "summary":"short summary",
  "insights":[
    {
      "title":"string",
      "detail":"string",
      "urgency":"high|medium|low"
    }
  ],
  "topTopics":[
    {
      "topic":"string",
      "percentage":35,
      "description":"string"
    }
  ],
  "missingInfo":[
    {
      "issue":"string",
      "recommendation":"string"
    }
  ],
  "suggestions":[
    {
      "title":"string",
      "reason":"string",
      "prompt":"string"
    }
  ],
  "conversionInsights":{
    "bottleneck":"string",
    "bestConvertingTopic":"string",
    "avgMessagesToConvert":"string"
  }
}
`;

      const result = await groqChat({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 1200,
        temperature: 0.2,
      });

      const parsed = parseAnalyticsLLMOutput(result);

      const responsePayload = normalizeAnalyticsPayload(
        parsed,
        leads.length,
        summarySample.length,
        metaExtras
      );

      res.json(responsePayload);
    } catch (err) {
      console.log(err);

      res.status(500).json({
        error: "Analytics failed",
      });
    }
  }
);

app.get("/admin/reports/weekly", auth, async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const leads = await Lead.find({
      userId: tenantUserId(req),
      createdAt: { $gte: weekAgo },
    }).lean();

    const total = leads.length;
    const converted = leads.filter((l) => l.status === "converted").length;
    const hotReady = leads.filter((l) => ["hot", "ready"].includes(l.status)).length;
    const avgScore = total
      ? Math.round(leads.reduce((sum, l) => sum + (l.score || 0), 0) / total)
      : 0;

    const topCountries = Object.entries(
      leads.reduce((acc, l) => {
        const key = l.countryInterest || "Unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([country, count]) => ({ country, count }));

    res.json({
      period: "last_7_days",
      totalLeads: total,
      converted,
      conversionRate: total ? Math.round((converted / total) * 100) : 0,
      hotReady,
      avgScore,
      topCountries,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to generate weekly report",
    });
  }
});

/** RFC 4180 CSV field escaping */
function csvEscapeField(val) {
  return `"${String(val ?? "").replace(/"/g, '""')}"`;
}

/**
 * Excel / WPS auto-format long digit strings as numbers (3.23E+09) and dates as serials
 * (column shows ########). Leading apostrophe is ignored by some apps (e.g. WPS).
 * Emitting an Excel text formula ="...\" forces literal display in Excel, WPS Office, etc.
 */
function csvFormulaTextCell(val) {
  if (val === null || val === undefined) {
    return csvEscapeField("");
  }
  const s = String(val).replace(/\r\n|\r|\n/g, " ");
  if (s === "") {
    return csvEscapeField("");
  }
  const innerQuoted = s.replace(/"/g, '""');
  const excelFormula = `="${innerQuoted}"`;
  return `"${excelFormula.replace(/"/g, '""')}"`;
}

/** Align with spreadsheet examples: whatsapp (lowercase), Direct, etc. */
function csvLeadSourceDisplay(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "Direct";
  const low = s.toLowerCase();
  if (low === "whatsapp") return "whatsapp";
  return s;
}

function csvExportPriorityScore(lead) {
  const p = lead.priorityScore;
  if (p != null && Number.isFinite(Number(p))) {
    return String(Math.round(Number(p)));
  }
  return String(calculatePriority(lead));
}

function csvExportLastActivity(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  /* ISO-like but forced as text in Excel — avoids serial numbers and ##### */
  return dt.toISOString().replace("T", " ").slice(0, 19);
}

const LEAD_EXPORT_HEADERS = [
  "Name",
  "Phone",
  "PhoneFrom",
  "Email",
  "Status",
  "Score",
  "PriorityScore",
  "CountryInterest",
  "CourseInterest",
  "Budget",
  "Source",
  "LastActivity",
];

function leadToExportPlain(l, inferFn) {
  const origin = inferFn && l.phone ? inferFn(l.phone) : null;
  const phoneFrom =
    origin && origin.country ? String(origin.country) : "";
  const scoreStr =
    l.score != null && l.score !== "" ? String(l.score) : "";
  return {
    name: l.name || "",
    phone: l.phone || "",
    phoneFrom,
    email: l.email || "",
    status: l.status || "",
    score: scoreStr,
    priorityScore: csvExportPriorityScore(l),
    countryInterest: l.countryInterest || "",
    courseInterest: l.courseInterest || "",
    budget: l.budget || "",
    source: csvLeadSourceDisplay(l.source),
    lastActivity: csvExportLastActivity(l.lastActivity),
  };
}

function plainLeadRowToArray(p) {
  return [
    p.name,
    p.phone,
    p.phoneFrom,
    p.email,
    p.status,
    p.score,
    p.priorityScore,
    p.countryInterest,
    p.courseInterest,
    p.budget,
    p.source,
    p.lastActivity,
  ];
}

let inferPhoneOriginForCsv = null;
let inferPhoneOriginCsvResolved = false;

async function getInferPhoneOriginForCsv() {
  if (inferPhoneOriginCsvResolved) return inferPhoneOriginForCsv;
  inferPhoneOriginCsvResolved = true;
  try {
    const { pathToFileURL } = require("url");
    const modUrl = pathToFileURL(
      path.join(__dirname, "frontend/src/utils/phoneCountry.js")
    ).href;
    const m = await import(modUrl);
    inferPhoneOriginForCsv =
      typeof m.inferPhoneOrigin === "function" ? m.inferPhoneOrigin : null;
  } catch (_) {
    inferPhoneOriginForCsv = null;
  }
  return inferPhoneOriginForCsv;
}

app.get("/admin/export/leads.csv", auth, async (req, res) => {
  try {
    const leads = await Lead.find({
      userId: tenantUserId(req),
      isMerged: { $ne: true },
    }).lean();

    const inferFn = await getInferPhoneOriginForCsv();

    const lines = [
      LEAD_EXPORT_HEADERS.map(csvEscapeField).join(","),
      ...leads.map((l) => {
        const p = leadToExportPlain(l, inferFn);
        return [
          csvFormulaTextCell(p.name),
          csvFormulaTextCell(p.phone),
          csvFormulaTextCell(p.phoneFrom),
          csvFormulaTextCell(p.email),
          csvEscapeField(p.status),
          csvFormulaTextCell(p.score),
          csvFormulaTextCell(p.priorityScore),
          csvEscapeField(p.countryInterest),
          csvEscapeField(p.courseInterest),
          csvFormulaTextCell(p.budget),
          csvEscapeField(p.source),
          csvFormulaTextCell(p.lastActivity),
        ].join(",");
      }),
    ];

    const csv = "\ufeff" + lines.join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=leads.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({
      error: "Failed to export leads",
    });
  }
});

app.get("/admin/export/leads.xlsx", auth, async (req, res) => {
  try {
    const ExcelJS = require("exceljs");
    const leads = await Lead.find({
      userId: tenantUserId(req),
      isMerged: { $ne: true },
    }).lean();

    const inferFn = await getInferPhoneOriginForCsv();
    const plains = leads.map((l) => leadToExportPlain(l, inferFn));

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Leads", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    ws.addRow(LEAD_EXPORT_HEADERS);
    ws.getRow(1).font = { bold: true };

    for (const p of plains) {
      ws.addRow(plainLeadRowToArray(p));
    }

    const colCount = LEAD_EXPORT_HEADERS.length;
    for (let c = 1; c <= colCount; c++) {
      let maxLen = String(LEAD_EXPORT_HEADERS[c - 1]).length;
      for (let r = 2; r <= ws.rowCount; r++) {
        const val = ws.getRow(r).getCell(c).value;
        maxLen = Math.max(maxLen, String(val ?? "").length);
      }
      ws.getColumn(c).width = Math.min(Math.max(maxLen + 2, 12), 60);
      ws.getColumn(c).numFmt = "@";
    }

    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="leads.xlsx"'
    );
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error("export leads.xlsx:", err?.message || err);
    res.status(500).json({
      error: "Failed to export Excel file",
    });
  }
});

/* ============================================================
   WEBSITE — public student form + tracking (Complete System)
============================================================ */

const websiteTrackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const websiteApplyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

const websiteFormUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function verifyWebsiteFormToken(req, res, next) {
  const secret = process.env.WEBSITE_FORM_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({
        error:
          "Website form is not configured. Set WEBSITE_FORM_SECRET in the API environment.",
      });
    }
    console.warn(
      "[website] WEBSITE_FORM_SECRET unset — accepting form posts without token (development only)"
    );
    return next();
  }
  const token = String(req.headers["x-website-form-token"] || "").trim();
  if (token !== secret) {
    return res.status(401).json({
      error: "Invalid or missing X-Website-Form-Token header",
    });
  }
  return next();
}

function sanitizeWebsiteFilename(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

const DOCUMENT_LABELS = {
  matric: "Matric Certificate",
  fsc: "FSc Certificate",
  passport: "Passport Copy",
  cnic: "CNIC Copy",
  photo: "Passport Size Photo",
  clarification: "Clarification",
  other: "Document",
};

const OFFICIAL_UPLOAD_DOCS = new Set(["matric", "fsc", "passport", "cnic"]);
const WHATSAPP_REPLY_DOCS = new Set(["photo", "clarification"]);

function normalizeDocType(docTypeRaw) {
  const x = String(docTypeRaw || "").trim().toLowerCase();
  if (!x) return "";
  if (x === "passport_photo" || x === "passportsizephoto") return "photo";
  if (x === "matric_certificate") return "matric";
  if (x === "fsc_certificate") return "fsc";
  if (x === "passport_copy") return "passport";
  if (x === "cnic_copy") return "cnic";
  return x;
}

function documentLabel(docTypeRaw) {
  const k = normalizeDocType(docTypeRaw);
  return DOCUMENT_LABELS[k] || "Document";
}

function listMissingDocumentLabels(admissionProfile = {}) {
  const statuses = admissionProfile.documentStatuses;
  const rows = [];
  const read = (docType) => {
    if (statuses instanceof Map) return String(statuses.get(docType) || "").toLowerCase();
    if (statuses && typeof statuses === "object") return String(statuses[docType] || "").toLowerCase();
    return "";
  };
  for (const docType of ["matric", "fsc", "passport", "cnic", "photo", "other"]) {
    if (documentStatusIsMissing(read(docType))) {
      rows.push(documentLabel(docType));
    }
  }
  return rows;
}

function documentStatusIsMissing(statusRaw) {
  const x = String(statusRaw || "").trim().toLowerCase();
  return x === "missing" || x === "needs_resubmit";
}

function hashUploadToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || ""), "utf8").digest("hex");
}

function makeDocumentRequestToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function getWebsiteBaseUrl(req) {
  const envBase = String(process.env.WEBSITE_BASE_URL || "").trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const host = req?.get?.("host") || `localhost:${process.env.PORT || 5000}`;
  const proto = req?.protocol || "http";
  return `${proto}://${host}`;
}

async function getSettingsForLeadUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid || !mongoose.Types.ObjectId.isValid(uid)) return null;
  return Settings.findOne({ userId: uid }).lean();
}

async function sendLeadWhatsAppText(lead, text) {
  const to = normalizePhoneKey(lead?.phone);
  if (!to || !text) return { sent: false, reason: "missing_phone_or_text" };
  const st = await getSettingsForLeadUser(lead?.userId);
  const phoneNumberId =
    String(st?.whatsappPhoneNumberId || "").trim() ||
    String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const hasToken = Boolean(String(process.env.WHATSAPP_TOKEN || "").trim());
  if (!hasToken || !phoneNumberId) return { sent: false, reason: "whatsapp_not_configured" };
  await sendWhatsAppCloudText({
    phoneNumberId,
    to,
    text,
  });
  return { sent: true };
}

async function notifyStageUpdateOnWhatsApp(lead, prevStageRaw, nextStageRaw) {
  const prevStage = normalizeAdmissionStage(prevStageRaw);
  const nextStage = normalizeAdmissionStage(nextStageRaw);
  if (prevStage === nextStage) return;
  const ap = lead?.admissionProfile || {};
  const firstName = String((lead?.name || ap.fullName || "Student").split(/\s+/)[0] || "Student");
  const registerId = String(ap.registrationId || "").trim();
  const university = String(ap.universityInterest || "your university").trim();
  const country = String(ap.countryInterest || lead?.countryInterest || "your destination").trim();

  const missingDocs = listMissingDocumentLabels(ap);
  const templates = {
    documents_incomplete:
      `Hi ${firstName}! We checked your documents and something is missing: ${missingDocs.length ? missingDocs.join(", ") : "requested documents"}. Please send them so we can proceed.`,
    counselor_assigned_process_started:
      `Great news ${firstName}! Your documents are approved and your application process has officially started.${registerId ? ` Track anytime with your ID: ${registerId}` : ""}`,
    unconditional_offer_letter_received:
      `Exciting news ${firstName}! Your offer letter from ${university} has been received. Our team will contact you shortly with next steps.`,
    visa_application_submitted:
      `Hi ${firstName}! Your visa application has been submitted to the embassy. Processing usually takes 2-4 weeks. We'll keep you updated.`,
    visa_approved:
      `CONGRATULATIONS ${firstName}! Your student visa has been approved. Time to start planning your journey.`,
    visa_rejected:
      `Hi ${firstName}, we have an update on your visa. Unfortunately it was not approved this time. Our team will contact you shortly to discuss next steps.`,
    enrolled:
      `Welcome to ${country} ${firstName}! You are now officially enrolled at ${university}. Wishing you a wonderful journey ahead.`,
  };

  const msg = templates[nextStage];
  if (!msg) return;
  try {
    const sent = await sendLeadWhatsAppText(lead, msg);
    if (sent?.sent) {
      lead.messages.push({
        role: "assistant",
        content: msg,
        whatsappDeliveryChannel: "whatsapp",
        whatsappDeliveryStatus: "sent",
        whatsappDeliveredAt: new Date(),
        at: new Date(),
      });
    }
  } catch (e) {
    console.log("Stage WhatsApp notification failed:", e?.message || e);
  }
}

function extractRegisterIdFromText(raw) {
  const t = String(raw || "").toUpperCase();
  const m = t.match(/\bNSI-\d{4}-\d{3,}\b/);
  return m ? m[0] : "";
}

function looksLikeStatusIntent(raw) {
  const t = String(raw || "").toLowerCase();
  return /\b(where\s+is\s+my\s+application|track|status|check)\b/.test(t);
}

function toWhatsappMilestoneLine(row = {}) {
  const status = String(row.status || "").toLowerCase();
  const icon =
    status === "done" ? "✅" :
    status === "active" ? "⏳" :
    status === "issue" ? "❌" : "⬜";
  return `${icon} ${row.label}`;
}

function buildWhatsappTrackerStatusMessage(lead) {
  const ap = lead?.admissionProfile || {};
  const stage = normalizeAdmissionStage(ap.processStage);
  const ms = buildAdmissionMilestones(stage);
  const firstName = String((lead?.name || ap.fullName || "Student").split(/\s+/)[0] || "Student");
  const university = String(ap.universityInterest || "your university");
  const lines = (Array.isArray(ms.rows) ? ms.rows : []).map((r) => toWhatsappMilestoneLine(r));
  return [
    `Hi ${firstName}! Here is your latest update`,
    "",
    ...lines,
    "",
    `University: ${university}`,
    `Current Stage: ${stage.replace(/_/g, " ")}`,
    "",
    ms.headline || "Your process is active. Our team will keep you updated.",
  ].join("\n");
}

async function notifyRegisterIdAssignment(lead) {
  const ap = lead?.admissionProfile || {};
  const registerId = String(ap.registrationId || "").trim();
  if (!registerId) return;
  const firstName = String((lead?.name || ap.fullName || "Student").split(/\s+/)[0] || "Student");
  const msg = `Welcome ${firstName}! Your Register ID is ${registerId}. Save this number — you can use it to track your process anytime.`;
  try {
    const sent = await sendLeadWhatsAppText(lead, msg);
    if (sent?.sent) {
      lead.messages.push({
        role: "assistant",
        content: msg,
        whatsappDeliveryChannel: "whatsapp",
        whatsappDeliveryStatus: "sent",
        whatsappDeliveredAt: new Date(),
        at: new Date(),
      });
    }
  } catch (e) {
    console.log("Register ID WhatsApp notification failed:", e?.message || e);
  }
}

const PASSPORT_EXPIRY_SWEEP_MS = 24 * 60 * 60 * 1000;
let passportExpirySchedulerStarted = false;
let passportExpirySweepInProgress = false;

async function runPassportExpirySweep() {
  if (passportExpirySweepInProgress) return;
  passportExpirySweepInProgress = true;
  try {
    const now = Date.now();
    const sixMonthsAhead = now + 183 * 24 * 60 * 60 * 1000;
    const leads = await Lead.find({
      ...admissionPipelineFilter(),
      isMerged: { $ne: true },
      "admissionProfile.passportExpiry": { $ne: null, $lte: new Date(sixMonthsAhead) },
    }).select("_id name phone userId admissionProfile messages");
    for (const lead of leads) {
      const ap = lead.admissionProfile || {};
      const expiryMs = new Date(ap.passportExpiry || 0).getTime();
      if (!Number.isFinite(expiryMs) || expiryMs <= 0) continue;
      const lastSentMs = new Date(ap.passportExpiryReminderSentAt || 0).getTime();
      if (Number.isFinite(lastSentMs) && lastSentMs > now - PASSPORT_EXPIRY_SWEEP_MS) {
        continue;
      }
      const firstName = String((lead.name || ap.fullName || "Student").split(/\s+/)[0] || "Student");
      const text =
        `Reminder ${firstName}: your passport expires in less than 6 months. ` +
        `Please renew it before your visa application to avoid delays.`;
      try {
        const sent = await sendLeadWhatsAppText(lead, text);
        if (sent?.sent) {
          lead.messages.push({
            role: "assistant",
            content: text,
            whatsappDeliveryChannel: "whatsapp",
            whatsappDeliveryStatus: "sent",
            whatsappDeliveredAt: new Date(),
            at: new Date(),
          });
          ap.passportExpiryReminderSentAt = new Date();
          lead.admissionProfile = ap;
          lead.markModified("admissionProfile");
          await lead.save();
        }
      } catch (e) {
        console.log("Passport expiry reminder failed:", e?.message || e);
      }
    }
  } catch (e) {
    console.log("Passport expiry sweep failed:", e?.message || e);
  } finally {
    passportExpirySweepInProgress = false;
  }
}

function startPassportExpiryScheduler() {
  if (passportExpirySchedulerStarted) return;
  passportExpirySchedulerStarted = true;
  setTimeout(() => {
    runPassportExpirySweep().catch(() => {});
  }, 60 * 1000);
  setInterval(() => {
    runPassportExpirySweep().catch(() => {});
  }, PASSPORT_EXPIRY_SWEEP_MS);
  console.log("🛂 Passport expiry reminder scheduler started");
}

function createPendingDocumentRequest({
  lead,
  docType,
  requestedBy,
  note,
}) {
  const method = OFFICIAL_UPLOAD_DOCS.has(docType) ? "upload_link" : "whatsapp_reply";
  const requestId = crypto.randomUUID();
  const token = method === "upload_link" ? makeDocumentRequestToken() : "";
  const tokenHash = token ? hashUploadToken(token) : "";
  const tokenExpiresAt =
    method === "upload_link" ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 2) : null;
  const request = {
    requestId,
    docType,
    method,
    tokenHash,
    tokenExpiresAt,
    status: "pending",
    requestedAt: new Date(),
    requestedBy: String(requestedBy || "staff"),
    note: String(note || "").trim(),
  };
  const ap = lead.admissionProfile || {};
  const list = Array.isArray(ap.pendingDocumentRequests) ? ap.pendingDocumentRequests : [];
  list.push(request);
  ap.pendingDocumentRequests = list;
  lead.admissionProfile = ap;
  lead.markModified("admissionProfile");
  return {
    request,
    rawToken: token,
  };
}

function findActivePendingRequestForLead(lead, docTypeFilter = "") {
  const ap = lead?.admissionProfile || {};
  const rows = Array.isArray(ap.pendingDocumentRequests) ? ap.pendingDocumentRequests : [];
  const now = Date.now();
  const wanted = normalizeDocType(docTypeFilter);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const req = rows[i] || {};
    const status = String(req.status || "pending").toLowerCase();
    if (status !== "pending") continue;
    if (wanted && normalizeDocType(req.docType) !== wanted) continue;
    const expiresAt = req.tokenExpiresAt ? new Date(req.tokenExpiresAt).getTime() : 0;
    if (req.method === "upload_link" && expiresAt && expiresAt < now) continue;
    return req;
  }
  return null;
}

function findUploadRequestByTokenHash(lead, tokenHash) {
  const ap = lead?.admissionProfile || {};
  const rows = Array.isArray(ap.pendingDocumentRequests) ? ap.pendingDocumentRequests : [];
  const now = Date.now();
  return rows.find((req) => {
    if (!req || req.method !== "upload_link") return false;
    if (String(req.tokenHash || "") !== String(tokenHash || "")) return false;
    const status = String(req.status || "pending").toLowerCase();
    if (status !== "pending") return false;
    const expiresAt = req.tokenExpiresAt ? new Date(req.tokenExpiresAt).getTime() : 0;
    if (expiresAt && expiresAt < now) return false;
    return true;
  }) || null;
}

async function findLeadByUploadToken(rawToken) {
  const tokenHash = hashUploadToken(rawToken);
  const lead = await Lead.findOne({
    source: { $regex: /^website$/i },
    "admissionProfile.pendingDocumentRequests": {
      $elemMatch: {
        method: "upload_link",
        tokenHash,
        status: "pending",
      },
    },
  });
  if (!lead) return null;
  const req = findUploadRequestByTokenHash(lead, tokenHash);
  if (!req) return null;
  return { lead, request: req, tokenHash };
}

const ADMISSION_STAGE_LEGACY_MAP = {
  submitted: "registered",
  under_review: "documents_under_review",
  university_applied: "university_application_submitted",
  offer_in_progress: "offer_letter_in_progress",
  offer_received: "unconditional_offer_letter_received",
  visa_applied: "visa_application_submitted",
  visa_expired: "visa_rejected",
};

const ADMISSION_PIPELINE = [
  "registered",
  "documents_under_review",
  "documents_incomplete",
  "documents_complete",
  "counselor_assigned_process_started",
  "university_application_submitted",
  "offer_letter_in_progress",
  "conditional_offer_letter_received",
  "unconditional_offer_letter_received",
  "visa_process_started",
  "visa_application_submitted",
  "visa_approved",
  "visa_rejected",
  "travel_ready",
  "enrolled",
];

function normalizeAdmissionStage(stageRaw) {
  const raw = String(stageRaw || "").trim().toLowerCase();
  if (!raw) return "registered";
  const mapped = ADMISSION_STAGE_LEGACY_MAP[raw] || raw;
  return ADMISSION_PIPELINE.includes(mapped) ? mapped : "registered";
}

function admissionStageIndex(stageRaw) {
  const normalized = normalizeAdmissionStage(stageRaw);
  const i = ADMISSION_PIPELINE.indexOf(normalized);
  return i < 0 ? 0 : i;
}

async function generateNextRegisterId(year = new Date().getFullYear()) {
  const key = `nsi-register-id-${year}`;
  const seqDoc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 }, $setOnInsert: { key } },
    { upsert: true, new: true }
  ).lean();
  const serial = String(seqDoc?.seq || 1).padStart(3, "0");
  return `NSI-${year}-${serial}`;
}

async function assignRegisterIdIfNeeded(lead, admissionProfile) {
  if (!lead || !admissionProfile) return admissionProfile?.registrationId;
  if (admissionProfile.registrationId) return admissionProfile.registrationId;
  const createdYear = new Date(lead.createdAt || Date.now()).getFullYear();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = await generateNextRegisterId(createdYear);
    const clash = await Lead.findOne({
      "admissionProfile.registrationId": candidate,
      _id: { $ne: lead._id },
    })
      .select("_id")
      .lean();
    if (!clash) {
      admissionProfile.registrationId = candidate;
      return candidate;
    }
  }
  throw new Error("Could not allocate a unique register ID.");
}

function buildAdmissionMilestones(processStage) {
  const st = normalizeAdmissionStage(processStage);
  const i = admissionStageIndex(st);

  const registered = i >= admissionStageIndex("registered") ? "done" : "active";
  const documents =
    i >= admissionStageIndex("documents_complete")
      ? "done"
      : i >= admissionStageIndex("documents_under_review")
        ? "active"
        : "pending";
  const processStarted =
    i >= admissionStageIndex("counselor_assigned_process_started") ? "done" : "pending";
  const university =
    i >= admissionStageIndex("university_application_submitted")
      ? "done"
      : i >= admissionStageIndex("counselor_assigned_process_started")
        ? "active"
        : "pending";
  const offer =
    i >= admissionStageIndex("unconditional_offer_letter_received")
      ? "done"
      : i >= admissionStageIndex("offer_letter_in_progress")
        ? "active"
        : "pending";

  let visa = "pending";
  if (st === "visa_rejected") visa = "issue";
  else if (i >= admissionStageIndex("visa_approved")) visa = "done";
  else if (i >= admissionStageIndex("visa_process_started")) visa = "active";

  const travel =
    i >= admissionStageIndex("travel_ready")
      ? "done"
      : i >= admissionStageIndex("visa_approved")
        ? "active"
        : "pending";
  const enrolled = st === "enrolled" ? "done" : "pending";

  let headline =
    "Your process is active. Use your Register ID on this page anytime for live updates.";
  if (st === "documents_incomplete") {
    headline = "Some documents are still pending. Please submit requested files to continue.";
  } else if (st === "offer_letter_in_progress") {
    headline = "Offer letter is in progress. Expected timeline is usually 5–7 working days.";
  } else if (st === "visa_approved") {
    headline = "Visa approved. Your team will now coordinate travel preparation.";
  } else if (st === "visa_rejected") {
    headline =
      "Visa was not approved this time. The NSI team will contact you with next steps.";
  }

  return {
    headline,
    rows: [
      { key: "registered", label: "Registered", status: registered },
      { key: "documents", label: "Documents", status: documents },
      { key: "process", label: "Process Started", status: processStarted },
      { key: "university", label: "University Application", status: university },
      { key: "offer", label: "Offer Letter", status: offer },
      { key: "visa", label: "Visa", status: visa },
      { key: "travel", label: "Travel", status: travel },
      { key: "enrolled", label: "Enrolled", status: enrolled },
    ],
  };
}

app.post(
  "/public/website/apply",
  websiteApplyLimiter,
  verifyWebsiteFormToken,
  websiteFormUpload.fields([
    { name: "doc_matric", maxCount: 1 },
    { name: "doc_fsc", maxCount: 1 },
    { name: "doc_passport", maxCount: 1 },
    { name: "doc_photo", maxCount: 1 },
    { name: "doc_cnic", maxCount: 1 },
    { name: "doc_other", maxCount: 1 },
    { name: "doc_complete", maxCount: 1 },
    { name: "attachments", maxCount: 12 },
  ]),
  async (req, res) => {
    try {
      const tenantRaw = String(process.env.WEBSITE_TENANT_USER_ID || "").trim();
      if (!tenantRaw || !mongoose.Types.ObjectId.isValid(tenantRaw)) {
        return res.status(503).json({
          error:
            "Set WEBSITE_TENANT_USER_ID to your MongoDB user id (CRM workspace owner) that should receive website leads.",
        });
      }

      const fullName = String(req.body.fullName || "").trim();
      const fatherName = String(req.body.fatherName || "").trim();
      const dobRaw = String(req.body.dob || "").trim();
      const gender = String(req.body.gender || "").trim();
      const phone = String(req.body.phone || "").trim();
      const email = String(req.body.email || "").trim();
      const cityAddress = String(req.body.cityAddress || req.body.city || "").trim();
      const passportNumber = String(req.body.passportNumber || "").trim();
      const passportIssueRaw = String(req.body.passportIssueDate || "").trim();
      const passportExpiryRaw = String(req.body.passportExpiry || "").trim();
      const matricGrade = String(req.body.matricGrade || "").trim();
      const fscGrade = String(req.body.fscGrade || "").trim();
      const otherDegree = String(req.body.otherDegree || "").trim();
      const ieltsScore = String(req.body.ieltsScore || "").trim();
      const countryInterest = String(req.body.countryInterest || "").trim();
      const universityInterest = String(req.body.universityInterest || "Not decided").trim();
      const courseInterest = String(req.body.courseInterest || req.body.programInterest || "").trim();

      if (
        !fullName ||
        !fatherName ||
        !dobRaw ||
        !gender ||
        !phone ||
        !email ||
        !passportNumber ||
        !passportExpiryRaw ||
        !countryInterest ||
        !courseInterest
      ) {
        return res.status(400).json({ error: "Missing required fields." });
      }

      let passportExpiry = null;
      let dob = null;
      let passportIssueDate = null;
      if (dobRaw) {
        const d = new Date(dobRaw);
        dob = Number.isNaN(d.getTime()) ? null : d;
      }
      if (passportIssueRaw) {
        const d = new Date(passportIssueRaw);
        passportIssueDate = Number.isNaN(d.getTime()) ? null : d;
      }
      if (passportExpiryRaw) {
        const d = new Date(passportExpiryRaw);
        passportExpiry = Number.isNaN(d.getTime()) ? null : d;
      }

      const DOC_FIELD_LABELS = {
        doc_matric: "Matric Certificate",
        doc_fsc: "FSc Certificate / Transcript",
        doc_passport: "Passport Copy",
        doc_photo: "Passport Size Photo",
        doc_cnic: "CNIC Copy",
        doc_other: "Other Document",
        doc_complete: "Complete File (All Documents)",
        attachments: "Attachment",
      };

      /* --- Duplicate detection: find existing lead by phone or email --- */
      const phoneDigits = phone.replace(/\D/g, "");
      const existingLead = await Lead.findOne({
        userId: tenantRaw,
        isMerged: { $ne: true },
        $or: [
          ...(phoneDigits.length >= 6
            ? [{ phone: { $regex: phoneDigits.slice(-8) } }]
            : []),
          ...(email
            ? [{ email: { $regex: new RegExp(`^${escapeRegex(email)}$`, "i") } }]
            : []),
        ],
      });

      const targetId = existingLead ? existingLead._id : new mongoose.Types.ObjectId();
      const isExisting = !!existingLead;

      const uploadsMeta = [];
      const allFiles = req.files || {};
      for (const [fieldName, files] of Object.entries(allFiles)) {
        for (const file of files) {
          if (!file?.buffer?.length) continue;
          const safe = sanitizeWebsiteFilename(file.originalname);
          const fn = `${Date.now()}-${safe}`;
          try {
            const uploadDir = path.join(__dirname, "uploads", "website-leads", String(targetId));
            fs.mkdirSync(uploadDir, { recursive: true });
            fs.writeFileSync(path.join(uploadDir, fn), file.buffer);
            uploadsMeta.push({
              storedPath: `/uploads/website-leads/${targetId}/${fn}`,
              originalName: file.originalname || fn,
              docType: fieldName.replace(/^doc_/, ""),
              docLabel: DOC_FIELD_LABELS[fieldName] || fieldName,
            });
          } catch (_) {
            try {
              const tmpDir = path.join("/tmp", "website-leads", String(targetId));
              fs.mkdirSync(tmpDir, { recursive: true });
              fs.writeFileSync(path.join(tmpDir, fn), file.buffer);
            } catch (_2) {}
            uploadsMeta.push({
              storedPath: null,
              originalName: file.originalname || fn,
              docType: fieldName.replace(/^doc_/, ""),
              docLabel: DOC_FIELD_LABELS[fieldName] || fieldName,
            });
          }
        }
      }

      const admissionData = {
        fullName,
        fatherName,
        dob,
        gender,
        whatsappNumber: phone,
        emailAddress: email,
        cityAddress,
        passportNumber,
        passportIssueDate,
        passportExpiry,
        matricGrade,
        fscGrade,
        otherDegree,
        ieltsScore,
        countryInterest,
        universityInterest,
        programInterest: courseInterest,
      };

      let savedLead;

      if (isExisting) {
        /* --- MERGE into existing lead (e.g. WhatsApp lead) --- */
        const setFields = { lastActivity: new Date() };
        if (!existingLead.name || existingLead.name === existingLead.phone) setFields.name = fullName;
        if (!existingLead.email) setFields.email = email;
        if (!existingLead.countryInterest) setFields.countryInterest = countryInterest;
        if (!existingLead.courseInterest) setFields.courseInterest = courseInterest;

        const existingAp = existingLead.admissionProfile || {};
        for (const [k, v] of Object.entries(admissionData)) {
          if (v !== null && v !== undefined && v !== "") {
            setFields[`admissionProfile.${k}`] = v;
          }
        }

        if (!existingAp.processStage || existingAp.processStage === "registered") {
          setFields["admissionProfile.processStage"] = "registered";
        }
        if (existingAp.paymentReceived === undefined) {
          setFields["admissionProfile.paymentReceived"] = false;
        }

        const existingUploads = Array.isArray(existingAp.uploadsMeta) ? existingAp.uploadsMeta : [];
        const mergedUploads = [...existingUploads, ...uploadsMeta];

        savedLead = await Lead.findByIdAndUpdate(
          targetId,
          {
            $set: setFields,
            $push: {
              activityLog: {
                type: "website_apply",
                description: `Website form submitted (merged with existing ${existingLead.source || "lead"} profile)`,
                at: new Date(),
                by: "system",
              },
            },
          },
          { new: true }
        );

        if (mergedUploads.length > 0) {
          await Lead.findByIdAndUpdate(targetId, {
            $set: { "admissionProfile.uploadsMeta": mergedUploads },
          });
        }

        console.log(
          `[website-apply] MERGED into existing lead ${targetId} (source: ${existingLead.source}, phone: ${phone})`
        );
      } else {
        /* --- CREATE new lead --- */
        savedLead = await Lead.create({
          _id: targetId,
          userId: tenantRaw,
          name: fullName,
          phone,
          email,
          countryInterest,
          courseInterest,
          budget: "",
          source: "Website",
          status: "new",
          lastActivity: new Date(),
          admissionProfile: {
            ...admissionData,
            processStage: "registered",
            paymentReceived: false,
            uploadsMeta,
          },
          messages: [],
          activityLog: [
            {
              type: "website_apply",
              description: "Application submitted from public website form",
              at: new Date(),
              by: "system",
            },
          ],
        });

        console.log(
          `[website-apply] CREATED new lead ${targetId} (phone: ${phone})`
        );
      }

      await createNotification(
        tenantRaw,
        "website_application",
        `${isExisting ? "Website form merged into existing profile" : "New website application"} from ${fullName}`,
        savedLead._id
      );

      return res.status(201).json({
        ok: true,
        id: String(targetId),
        merged: isExisting,
        status: isExisting ? "Merged with existing profile" : "Pending Review",
      });
    } catch (err) {
      if (err?.code === "LIMIT_FILE_SIZE" || err?.name === "MulterError") {
        return res.status(413).json({ error: "File too large. Maximum 25 MB per file." });
      }
      console.error("POST /public/website/apply:", err?.message || err);
      return res.status(500).json({ error: "Could not save application." });
    }
  }
);

/** Public track lookup by assigned Register ID (case-insensitive). */
async function findWebsiteLeadForTrackQuery(ridRaw) {
  const rid = String(ridRaw || "").trim();
  if (!rid) return null;

  const select =
    "name admissionProfile countryInterest courseInterest createdAt source _id";

  let lead = await Lead.findOne({
    "admissionProfile.registrationId": rid,
  })
    .select(select)
    .lean();

  if (!lead) {
    lead = await Lead.findOne({
      $expr: {
        $eq: [
          { $toLower: { $ifNull: ["$admissionProfile.registrationId", ""] } },
          rid.toLowerCase(),
        ],
      },
    })
      .select(select)
      .lean();
  }

  return lead || null;
}

function stageNumberFromKey(stageKey) {
  return admissionStageIndex(stageKey) + 1;
}

function studentApiView(lead) {
  const ap = lead?.admissionProfile || {};
  const stage = normalizeAdmissionStage(ap.processStage);
  const readDocumentStatus = (docType) => {
    if (ap.documentStatuses instanceof Map) {
      return ap.documentStatuses.get(docType) || "pending";
    }
    if (ap.documentStatuses && typeof ap.documentStatuses === "object") {
      return ap.documentStatuses[docType] || "pending";
    }
    return "pending";
  };
  return {
    studentId: String(lead?._id || ""),
    registerId: ap.registrationId || "",
    fullName: lead?.name || ap.fullName || "",
    fatherName: ap.fatherName || "",
    dob: ap.dob || null,
    gender: ap.gender || "",
    whatsapp: ap.whatsappNumber || lead?.phone || "",
    email: ap.emailAddress || lead?.email || "",
    city: ap.cityAddress || "",
    passportNumber: ap.passportNumber || "",
    passportExpiry: ap.passportExpiry || null,
    matricGrade: ap.matricGrade || "",
    fscGrade: ap.fscGrade || "",
    ieltsScore: ap.ieltsScore || "",
    country: ap.countryInterest || lead?.countryInterest || "",
    university: ap.universityInterest || "",
    course: ap.programInterest || lead?.courseInterest || "",
    currentStage: stageNumberFromKey(stage),
    stageKey: stage,
    stageUpdatedAt: lead?.updatedAt || lead?.lastActivity || lead?.createdAt || null,
    assignedCounselor: lead?.assignedTo || null,
    internalNotes: ap.internalNotes || [],
    documents: {
      matric: readDocumentStatus("matric"),
      fsc: readDocumentStatus("fsc"),
      passport: readDocumentStatus("passport"),
      photo: readDocumentStatus("photo"),
      cnic: readDocumentStatus("cnic"),
      other: readDocumentStatus("other"),
    },
    createdAt: lead?.createdAt || null,
  };
}

app.post("/api/students", async (req, res) => {
  try {
    const body = req.body || {};
    const fullName = String(body.fullName || "").trim();
    const fatherName = String(body.fatherName || "").trim();
    const dobRaw = String(body.dob || "").trim();
    const gender = String(body.gender || "").trim();
    const whatsapp = String(body.whatsapp || body.phone || "").trim();
    const email = String(body.email || "").trim();
    const passportNumber = String(body.passportNumber || "").trim();
    const passportExpiryRaw = String(body.passportExpiry || "").trim();
    const country = String(body.country || body.countryInterest || "").trim();
    const university = String(body.university || body.universityInterest || "Not decided").trim();
    const course = String(body.course || body.program || body.courseInterest || "").trim();

    if (
      !fullName ||
      !fatherName ||
      !dobRaw ||
      !gender ||
      !whatsapp ||
      !email ||
      !passportNumber ||
      !passportExpiryRaw ||
      !country ||
      !course
    ) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const tenantRaw = String(process.env.WEBSITE_TENANT_USER_ID || "").trim();
    if (!tenantRaw || !mongoose.Types.ObjectId.isValid(tenantRaw)) {
      return res.status(503).json({ error: "WEBSITE_TENANT_USER_ID is not configured." });
    }

    const dob = dobRaw ? new Date(dobRaw) : null;
    const passportExpiry = passportExpiryRaw ? new Date(passportExpiryRaw) : null;

    const lead = await Lead.create({
      userId: tenantRaw,
      name: fullName,
      phone: whatsapp,
      email,
      countryInterest: country,
      courseInterest: course,
      source: "Website",
      status: "new",
      lastActivity: new Date(),
      admissionProfile: {
        fullName,
        fatherName,
        dob: Number.isNaN(dob?.getTime?.()) ? null : dob,
        gender,
        whatsappNumber: whatsapp,
        emailAddress: email,
        cityAddress: String(body.city || body.cityAddress || "").trim(),
        passportNumber,
        passportIssueDate: body.passportIssueDate ? new Date(body.passportIssueDate) : null,
        passportExpiry: Number.isNaN(passportExpiry?.getTime?.()) ? null : passportExpiry,
        matricGrade: String(body.matricGrade || "").trim(),
        fscGrade: String(body.fscGrade || "").trim(),
        otherDegree: String(body.otherDegree || "").trim(),
        ieltsScore: String(body.ieltsScore || "").trim(),
        countryInterest: country,
        universityInterest: university,
        programInterest: course,
        processStage: "registered",
      },
      activityLog: [
        {
          type: "website_apply",
          description: "Application submitted from student registration API",
          at: new Date(),
          by: "system",
        },
      ],
    });

    return res.status(201).json({
      ok: true,
      message: "Your application has been received. Our team will contact you within 24 hours.",
      student: studentApiView(lead.toObject()),
    });
  } catch (err) {
    console.error("POST /api/students:", err?.message || err);
    return res.status(500).json({ error: "Could not save student registration." });
  }
});

app.get("/api/students", auth, requireRoles("admin", "manager", "staff"), async (req, res) => {
  try {
    const rows = await Lead.find({
      ...leadTenantUserIdMatch(tenantUserId(req)),
      ...admissionPipelineFilter(),
      isMerged: { $ne: true },
    })
      .sort({ updatedAt: -1 })
      .lean();
    return res.json(rows.map(studentApiView));
  } catch (err) {
    console.error("GET /api/students:", err?.message || err);
    return res.status(500).json({ error: "Could not load students." });
  }
});

app.get("/api/students/:registerId", async (req, res) => {
  try {
    const registerId = String(req.params.registerId || "").trim();
    if (!registerId) return res.status(400).json({ error: "registerId is required." });
    const lead = await findWebsiteLeadForTrackQuery(registerId);
    if (!lead) return res.status(404).json({ error: "ID not found. Please contact NSI team." });
    return res.json(studentApiView(lead));
  } catch (err) {
    console.error("GET /api/students/:registerId:", err?.message || err);
    return res.status(500).json({ error: "Could not load student status." });
  }
});

app.patch("/api/students/:id/stage", auth, requireRoles("admin", "manager", "staff"), validateId, async (req, res) => {
  try {
    const lead = await Lead.findOne({
      _id: req.params.id,
      ...leadTenantUserIdMatch(tenantUserId(req)),
      isMerged: { $ne: true },
    });
    if (!lead) return res.status(404).json({ error: "Student not found." });
    const prevStage = normalizeAdmissionStage(lead.admissionProfile?.processStage || "registered");
    const prevRegisterId = String(lead.admissionProfile?.registrationId || "").trim();
    const nextStage = normalizeAdmissionStage(req.body?.stage || req.body?.processStage);
    const ap = lead.admissionProfile || {};
    ap.processStage = nextStage;
    if (admissionStageIndex(nextStage) >= admissionStageIndex("documents_complete")) {
      await assignRegisterIdIfNeeded(lead, ap);
    }
    lead.admissionProfile = ap;
    lead.markModified("admissionProfile");
    lead.lastActivity = new Date();
    await lead.save();
    if (!prevRegisterId && String(ap.registrationId || "").trim()) {
      await notifyRegisterIdAssignment(lead);
    }
    await notifyStageUpdateOnWhatsApp(lead, prevStage, nextStage);
    if (lead.isModified("messages")) {
      await lead.save();
    }
    return res.json(studentApiView(lead.toObject()));
  } catch (err) {
    console.error("PATCH /api/students/:id/stage:", err?.message || err);
    return res.status(500).json({ error: "Could not update stage." });
  }
});

app.patch("/api/students/:id/reassign-doc", auth, requireRoles("admin", "manager", "staff"), validateId, async (req, res) => {
  try {
    const lead = await Lead.findOne({
      _id: req.params.id,
      ...leadTenantUserIdMatch(tenantUserId(req)),
      isMerged: { $ne: true },
    });
    if (!lead) return res.status(404).json({ error: "Student not found." });
    const ap = lead.admissionProfile || {};
    const uploads = Array.isArray(ap.uploadsMeta) ? ap.uploadsMeta : [];
    const fileIndex = parseInt(req.body?.fileIndex, 10);
    const newDocType = String(req.body?.docType || "").trim();
    if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= uploads.length) {
      return res.status(400).json({ error: "Invalid file index." });
    }
    const DOC_LABELS = {
      matric: "Matric Certificate",
      fsc: "FSc Certificate / Transcript",
      passport: "Passport Copy",
      photo: "Passport Size Photo",
      cnic: "CNIC Copy",
      other: "Other Document",
      complete: "Complete File (All Documents)",
    };
    uploads[fileIndex].docType = newDocType;
    uploads[fileIndex].docLabel = DOC_LABELS[newDocType] || newDocType || "";
    ap.uploadsMeta = uploads;
    lead.admissionProfile = ap;
    lead.markModified("admissionProfile");
    await lead.save();
    return res.json({ ok: true, uploadsMeta: uploads });
  } catch (err) {
    console.error("PATCH /api/students/:id/reassign-doc:", err?.message || err);
    return res.status(500).json({ error: "Could not reassign document." });
  }
});

app.patch("/api/students/:id/documents", auth, requireRoles("admin", "manager", "staff"), validateId, async (req, res) => {
  try {
    const lead = await Lead.findOne({
      _id: req.params.id,
      ...leadTenantUserIdMatch(tenantUserId(req)),
      isMerged: { $ne: true },
    });
    if (!lead) return res.status(404).json({ error: "Student not found." });
    const ap = lead.admissionProfile || {};
    const prevStage = normalizeAdmissionStage(ap.processStage || "registered");
    const prevRegisterId = String(ap.registrationId || "").trim();
    const statuses = new Map(ap.documentStatuses || {});
    const updates = Array.isArray(req.body?.documents) ? req.body.documents : [];
    const actor = req.user?.name || req.user?.email || "staff";
    const uploadLinksToSend = [];
    const whatsappReplyRequests = [];
    const toBoolKey = {
      matric: "docMatric",
      fsc: "docFsc",
      passport: "docPassport",
      photo: "docPhotos",
      cnic: "docCnic",
    };
    for (const item of updates) {
      const docType = normalizeDocType(item?.docType);
      const status = String(item?.status || "").trim().toLowerCase();
      if (!docType || !status) continue;
      statuses.set(docType, status);
      const boolKey = toBoolKey[docType];
      if (boolKey) {
        ap[boolKey] = status === "ok";
      }
      const requests = Array.isArray(ap.pendingDocumentRequests) ? ap.pendingDocumentRequests : [];
      if (status === "ok") {
        for (const req of requests) {
          if (normalizeDocType(req?.docType) !== docType) continue;
          if (String(req?.status || "").toLowerCase() === "approved") continue;
          req.status = "approved";
          req.tokenUsedAt = req.tokenUsedAt || new Date();
        }
      }
      if (documentStatusIsMissing(status)) {
        const existing = findActivePendingRequestForLead(lead, docType);
        if (!existing) {
          const created = createPendingDocumentRequest({
            lead,
            docType,
            requestedBy: actor,
            note: String(item?.note || "").trim(),
          });
          if (created.request.method === "upload_link" && created.rawToken) {
            const uploadUrl = `${getWebsiteBaseUrl(req)}/public/website/upload?token=${encodeURIComponent(created.rawToken)}`;
            uploadLinksToSend.push({
              docType,
              label: DOCUMENT_LABELS[docType] || "document",
              url: uploadUrl,
            });
          } else if (created.request.method === "whatsapp_reply") {
            whatsappReplyRequests.push({
              docType,
              label: DOCUMENT_LABELS[docType] || "document",
            });
          }
        }
      }
    }
    const uploadsList = Array.isArray(ap.uploadsMeta) ? ap.uploadsMeta : [];
    const hasCompleteFile = uploadsList.some((u) => u.docType === "complete");
    const docHasFile = (docKey) =>
      uploadsList.some((u) => u.docType === docKey) || hasCompleteFile;

    for (const [docKey, st] of statuses.entries()) {
      if (st === "ok" && !docHasFile(docKey)) {
        statuses.set(docKey, "pending");
      }
    }

    ap.documentStatuses = statuses;
    const hasMissing = [...statuses.values()].some((s) => documentStatusIsMissing(s));
    const REQUIRED_DOCS = ["matric", "fsc", "passport", "photo", "cnic"];
    const completeFileApproved = hasCompleteFile && statuses.get("complete") === "ok";
    const allRequiredOk = completeFileApproved || REQUIRED_DOCS.every(
      (d) => statuses.get(d) === "ok" && docHasFile(d)
    );

    if (allRequiredOk) {
      if (admissionStageIndex(ap.processStage) < admissionStageIndex("documents_complete")) {
        ap.processStage = "documents_complete";
      }
      await assignRegisterIdIfNeeded(lead, ap);
    } else if (hasMissing) {
      if (admissionStageIndex(ap.processStage) < admissionStageIndex("documents_incomplete")) {
        ap.processStage = "documents_incomplete";
      }
    }
    lead.admissionProfile = ap;
    lead.markModified("admissionProfile");
    lead.lastActivity = new Date();
    await lead.save();
    if (!prevRegisterId && String(ap.registrationId || "").trim()) {
      await notifyRegisterIdAssignment(lead);
    }
    const firstName = String((lead.name || ap.fullName || "Student").split(/\s+/)[0] || "Student");
    for (const reqMeta of uploadLinksToSend) {
      const text = `Hi ${firstName}! Your ${reqMeta.label} is missing. Please upload it here:\n${reqMeta.url}\nThis link is one-time and expires automatically.`;
      try {
        const sent = await sendLeadWhatsAppText(lead, text);
        if (sent?.sent) {
          lead.messages.push({
            role: "assistant",
            content: text,
            whatsappDeliveryChannel: "whatsapp",
            whatsappDeliveryStatus: "sent",
            whatsappDeliveredAt: new Date(),
            at: new Date(),
          });
        }
      } catch (e) {
        console.log("Missing document link send failed:", e?.message || e);
      }
    }
    if (whatsappReplyRequests.length > 0) {
      const labels = whatsappReplyRequests.map((x) => x.label).join(", ");
      const text = `Hi ${firstName}! Please send your ${labels} by replying to this WhatsApp message.`;
      try {
        const sent = await sendLeadWhatsAppText(lead, text);
        if (sent?.sent) {
          lead.messages.push({
            role: "assistant",
            content: text,
            whatsappDeliveryChannel: "whatsapp",
            whatsappDeliveryStatus: "sent",
            whatsappDeliveredAt: new Date(),
            at: new Date(),
          });
        }
      } catch (e) {
        console.log("Missing document WhatsApp-reply request failed:", e?.message || e);
      }
    }
    if (lead.isModified("messages")) {
      await lead.save();
    }
    await notifyStageUpdateOnWhatsApp(lead, prevStage, ap.processStage || prevStage);
    if (lead.isModified("messages")) {
      await lead.save();
    }
    return res.json(studentApiView(lead.toObject()));
  } catch (err) {
    console.error("PATCH /api/students/:id/documents:", err?.message || err);
    return res.status(500).json({ error: "Could not update documents." });
  }
});

app.post("/api/students/:id/notes", auth, requireRoles("admin", "manager", "staff"), validateId, async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Note text is required." });
    const lead = await Lead.findOne({
      _id: req.params.id,
      ...leadTenantUserIdMatch(tenantUserId(req)),
      isMerged: { $ne: true },
    });
    if (!lead) return res.status(404).json({ error: "Student not found." });
    const actor = req.user?.name || req.user?.email || "staff";
    const ap = lead.admissionProfile || {};
    const notes = Array.isArray(ap.internalNotes) ? ap.internalNotes : [];
    notes.push({ text, by: actor, at: new Date() });
    ap.internalNotes = notes;
    lead.internalNotes = Array.isArray(lead.internalNotes) ? lead.internalNotes : [];
    lead.internalNotes.push({ text, by: actor, at: new Date() });
    lead.admissionProfile = ap;
    lead.markModified("admissionProfile");
    lead.lastActivity = new Date();
    await lead.save();
    return res.status(201).json(studentApiView(lead.toObject()));
  } catch (err) {
    console.error("POST /api/students/:id/notes:", err?.message || err);
    return res.status(500).json({ error: "Could not save note." });
  }
});

app.get("/api/students/:id/document-alerts", auth, requireRoles("admin", "manager", "staff"), validateId, async (req, res) => {
  try {
    const lead = await Lead.findOne({
      _id: req.params.id,
      ...leadTenantUserIdMatch(tenantUserId(req)),
      isMerged: { $ne: true },
    }).lean();
    if (!lead) return res.status(404).json({ error: "Student not found." });
    const ap = lead.admissionProfile || {};
    const alerts = Array.isArray(ap.inboundDocumentAlerts) ? ap.inboundDocumentAlerts : [];
    return res.json({
      studentId: String(lead._id),
      alerts: alerts.sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0)),
    });
  } catch (err) {
    console.error("GET /api/students/:id/document-alerts:", err?.message || err);
    return res.status(500).json({ error: "Could not fetch document alerts." });
  }
});

app.patch("/api/students/:id/document-alerts/:alertId", auth, requireRoles("admin", "manager", "staff"), validateId, async (req, res) => {
  try {
    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!["save", "reject"].includes(action)) {
      return res.status(400).json({ error: "action must be save or reject." });
    }
    const lead = await Lead.findOne({
      _id: req.params.id,
      ...leadTenantUserIdMatch(tenantUserId(req)),
      isMerged: { $ne: true },
    });
    if (!lead) return res.status(404).json({ error: "Student not found." });
    const ap = lead.admissionProfile || {};
    const alerts = Array.isArray(ap.inboundDocumentAlerts) ? ap.inboundDocumentAlerts : [];
    const idx = alerts.findIndex((x) => String(x.alertId || "") === String(req.params.alertId || ""));
    if (idx < 0) return res.status(404).json({ error: "Alert not found." });
    const alert = alerts[idx];
    if (String(alert.status || "").toLowerCase() !== "pending_review") {
      return res.status(400).json({ error: "Alert already reviewed." });
    }
    const actor = req.user?.name || req.user?.email || "staff";
    alert.status = action === "save" ? "saved" : "rejected";
    alert.reviewedAt = new Date();
    alert.reviewedBy = actor;
    const statuses = new Map(ap.documentStatuses || {});
    const docType = normalizeDocType(alert.docType);
    if (action === "save") {
      statuses.set(docType, "ok");
      const toBoolKey = {
        matric: "docMatric",
        fsc: "docFsc",
        passport: "docPassport",
        photo: "docPhotos",
        cnic: "docCnic",
      };
      const boolKey = toBoolKey[docType];
      if (boolKey) ap[boolKey] = true;
      if (alert.whatsappMediaId) {
        const original = alert.mediaFilename || `${docType || "document"}-from-whatsapp`;
        const item = {
          storedPath: `/admin/whatsapp/media/${encodeURIComponent(alert.whatsappMediaId)}`,
          originalName: original,
        };
        const uploadsMeta = Array.isArray(ap.uploadsMeta) ? ap.uploadsMeta : [];
        uploadsMeta.push(item);
        ap.uploadsMeta = uploadsMeta;
        alert.savedPath = item.storedPath;
      }
      const reqs = Array.isArray(ap.pendingDocumentRequests) ? ap.pendingDocumentRequests : [];
      for (const r of reqs) {
        if (String(r.requestId || "") === String(alert.requestId || "")) {
          r.status = "approved";
          r.tokenUsedAt = r.tokenUsedAt || new Date();
        }
      }
    } else {
      statuses.set(docType, "needs_resubmit");
      const reqs = Array.isArray(ap.pendingDocumentRequests) ? ap.pendingDocumentRequests : [];
      for (const r of reqs) {
        if (String(r.requestId || "") === String(alert.requestId || "")) {
          r.status = "rejected";
        }
      }
    }
    ap.documentStatuses = statuses;
    ap.inboundDocumentAlerts = alerts;
    lead.admissionProfile = ap;
    lead.markModified("admissionProfile");
    lead.lastActivity = new Date();
    await lead.save();
    return res.json({
      ok: true,
      student: studentApiView(lead.toObject()),
      alert,
    });
  } catch (err) {
    console.error("PATCH /api/students/:id/document-alerts/:alertId:", err?.message || err);
    return res.status(500).json({ error: "Could not update document alert." });
  }
});

const staffDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 25 * 1024 * 1024 },
});

app.post(
  "/api/students/:id/upload-doc",
  auth,
  requireRoles("admin", "manager", "staff"),
  validateId,
  staffDocUpload.single("file"),
  async (req, res) => {
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: "No file received." });
      }
      const docType = String(req.body?.docType || "other").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const docLabel = String(req.body?.docLabel || docType).trim();
      const lead = await Lead.findOne({
        _id: req.params.id,
        ...leadTenantUserIdMatch(tenantUserId(req)),
        isMerged: { $ne: true },
      });
      if (!lead) return res.status(404).json({ error: "Student not found." });

      const leadId = String(lead._id);
      const safe = sanitizeWebsiteFilename(req.file.originalname || "document");
      const fn = `${Date.now()}-${safe}`;
      const uploadDir = path.join(__dirname, "uploads", "website-leads", leadId, "staff");
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, fn), req.file.buffer);
      const storedPath = `/uploads/website-leads/${leadId}/staff/${fn}`;

      const ap = lead.admissionProfile || {};
      const uploads = Array.isArray(ap.uploadsMeta) ? ap.uploadsMeta : [];
      uploads.push({
        storedPath,
        originalName: req.file.originalname || fn,
        docType,
        docLabel,
        uploadedByStaff: true,
        uploadedAt: new Date(),
      });
      ap.uploadsMeta = uploads;

      const statuses = new Map(ap.documentStatuses instanceof Map ? ap.documentStatuses : Object.entries(ap.documentStatuses || {}));
      const normKey = normalizeDocType(docType);
      if (normKey) statuses.set(normKey, "ok");
      ap.documentStatuses = statuses;

      const boolMap = { matric: "docMatric", fsc: "docFsc", passport: "docPassport", photo: "docPhotos", cnic: "docCnic" };
      if (boolMap[normKey]) ap[boolMap[normKey]] = true;

      lead.admissionProfile = ap;
      lead.markModified("admissionProfile");
      lead.lastActivity = new Date();
      await lead.save();

      return res.json({ ok: true, storedPath, originalName: req.file.originalname || fn, docType, docLabel });
    } catch (err) {
      console.error("POST /api/students/:id/upload-doc:", err?.message || err);
      return res.status(500).json({ error: "Upload failed." });
    }
  }
);

app.get("/public/website/upload", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).send("Missing token.");
    const found = await findLeadByUploadToken(token);
    if (!found) return res.status(410).send("This upload link is invalid or expired.");
    const { lead, request } = found;
    const docLabel = DOCUMENT_LABELS[normalizeDocType(request.docType)] || "Document";
    const studentName = lead.name || lead.admissionProfile?.fullName || "Student";
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Upload ${docLabel}</title>
<style>body{font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;color:#111} .card{max-width:540px;margin:0 auto;background:#fff;padding:22px;border-radius:12px;border:1px solid #dbe4f5} h1{margin:0 0 8px;font-size:22px} p{line-height:1.5} input,button{font-size:15px} input[type=file]{display:block;margin:14px 0} button{background:#2f5cff;color:#fff;border:0;border-radius:8px;padding:10px 14px;cursor:pointer}</style>
</head><body><div class="card">
<h1>Upload requested document</h1>
<p><strong>Student:</strong> ${studentName}</p>
<p><strong>Requested:</strong> ${docLabel}</p>
<form method="post" enctype="multipart/form-data" action="/public/website/upload?token=${encodeURIComponent(token)}">
<input type="file" name="file" required />
<button type="submit">Upload document</button>
</form>
</div></body></html>`;
    return res.status(200).send(html);
  } catch (err) {
    console.error("GET /public/website/upload:", err?.message || err);
    return res.status(500).send("Could not open upload page.");
  }
});

app.post("/public/website/upload", websiteRequestedUpload.single("file"), async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).send("Missing token.");
    const found = await findLeadByUploadToken(token);
    if (!found) return res.status(410).send("This upload link is invalid or expired.");
    if (!req.file?.buffer?.length) return res.status(400).send("Please choose a file.");
    const { lead, request } = found;
    const leadId = String(lead._id);
    const safe = sanitizeWebsiteFilename(req.file.originalname || "document");
    const fn = `${Date.now()}-${safe}`;
    const uploadDir = path.join(__dirname, "uploads", "website-leads", leadId, "requested");
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, fn), req.file.buffer);
    const storedPath = `/uploads/website-leads/${leadId}/requested/${fn}`;

    const ap = lead.admissionProfile || {};
    const uploadsMeta = Array.isArray(ap.uploadsMeta) ? ap.uploadsMeta : [];
    uploadsMeta.push({
      storedPath,
      originalName: req.file.originalname || fn,
    });
    ap.uploadsMeta = uploadsMeta;
    const statuses = new Map(ap.documentStatuses || {});
    const docType = normalizeDocType(request.docType);
    statuses.set(docType, "pending");
    ap.documentStatuses = statuses;
    const reqs = Array.isArray(ap.pendingDocumentRequests) ? ap.pendingDocumentRequests : [];
    for (const r of reqs) {
      if (String(r.requestId || "") === String(request.requestId || "")) {
        r.status = "received";
        r.tokenUsedAt = new Date();
      }
    }
    const alerts = Array.isArray(ap.inboundDocumentAlerts) ? ap.inboundDocumentAlerts : [];
    alerts.push({
      alertId: crypto.randomUUID(),
      requestId: request.requestId,
      docType,
      source: "upload_link",
      status: "pending_review",
      mediaFilename: req.file.originalname || fn,
      mimeType: req.file.mimetype || "",
      savedPath: storedPath,
      receivedAt: new Date(),
    });
    ap.inboundDocumentAlerts = alerts;
    lead.admissionProfile = ap;
    lead.markModified("admissionProfile");
    lead.lastActivity = new Date();
    await lead.save();
    await createNotification(
      lead.userId,
      "document_received",
      `${lead.name || "Student"} uploaded ${DOCUMENT_LABELS[docType] || "a requested document"}.`,
      lead._id
    );
    return res.status(200).send("Upload received successfully. Our team will review it shortly.");
  } catch (err) {
    console.error("POST /public/website/upload:", err?.message || err);
    return res.status(500).send("Could not upload file.");
  }
});

app.get("/public/website/health", (_req, res) => {
  res.json({
    ok: true,
    website: true,
    apply: "POST /public/website/apply (multipart)",
    upload: "GET|POST /public/website/upload?token=…",
    track: "GET /public/website/track?registrationId=…",
  });
});

app.get("/public/website/track", websiteTrackLimiter, async (req, res) => {
  try {
    const registrationId = String(req.query.registrationId || "").trim();
    if (!registrationId) {
      return res.status(400).json({ error: "registrationId query required" });
    }

    const lead = await findWebsiteLeadForTrackQuery(registrationId);

    if (!lead) {
      return res.status(404).json({ error: "Not found" });
    }

    const ap = lead.admissionProfile || {};
    const ms = buildAdmissionMilestones(ap.processStage);
    const displayRegistrationId =
      (ap.registrationId && String(ap.registrationId).trim()) || registrationId;

    return res.json({
      registrationId: displayRegistrationId,
      fullName: lead.name,
      universityInterest: ap.universityInterest || "",
      courseInterest: lead.courseInterest || "",
      countryInterest: lead.countryInterest || "",
      processStage: normalizeAdmissionStage(ap.processStage),
      paymentReceived: !!ap.paymentReceived,
      headline: ms.headline,
      milestones: ms.rows,
      stageUpdatedAt: lead.updatedAt || lead.createdAt || null,
    });
  } catch (err) {
    console.error("GET /public/website/track:", err?.message || err);
    return res.status(500).json({ error: "Lookup failed" });
  }
});

/* ============================================================
   HEALTH CHECK
============================================================ */

app.get("/", (req, res) => {
  const indexFile = path.join(websiteDir, "index.html");
  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }
  res.json({ success: true, message: "CRM API Running 🚀" });
});

/* Final error handler keeps malformed JSON responses consistent and stacktrace-free. */
app.use((err, _req, res, next) => {
  if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }
  if (err?.name === "MulterError" || err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large. Maximum 25 MB per file." });
  }
  console.error("[global-error]", err?.message || err);
  return res.status(500).json({ error: "Internal server error." });
});

/* ============================================================
   PUBLIC AI CHAT — Website AI Advisor (no auth required)
============================================================ */
const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 10,               // 10 messages per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment." },
});

app.post("/api/ai-chat", aiChatLimiter, async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Message is required." });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "Message too long (max 2000 chars)." });
    }

    const systemPrompt = `You are a knowledgeable and friendly Study Abroad Advisor for NextStep International (NSI), Pakistan's trusted education consultancy. You help Pakistani students find the best university and country for their goals.

You specialize in:
- MBBS, Engineering, Business, IT programs abroad
- Study destinations: Georgia, Azerbaijan, Russia, Turkey, China, Kazakhstan, Poland, Hungary
- Admission requirements, fees, scholarships, and timelines
- Visa guidance for Pakistani students
- Cost of living and student life abroad

Key facts about NextStep International:
- Based in Pakistan
- WhatsApp: +92 314 2638901
- Email: nextstepinternational25@gmail.com
- Free consultation available
- Apply at: https://www.nextstepinternationals.com/apply.html

Always be helpful, honest, and specific. If asked about fees or requirements, give real approximate figures. End responses by encouraging the student to apply or contact NSI for personalized guidance. Keep answers clear and well-structured. Use bullet points when listing multiple items.`;

    // Build messages array: system + last 6 turns of history + new message
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: message.trim() },
    ];

    const reply = await groqChat({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.5,
      max_tokens: 1200,
    });

    return res.json({ reply });
  } catch (err) {
    console.error("AI chat error:", err.message);
    return res.status(500).json({ error: "AI is unavailable right now. Please try again." });
  }
});

/* ============================================================
   SERVER
============================================================ */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `🚀 Server running on http://localhost:${PORT}`
  );
  console.log(
    `   Auth reset: POST /auth/forgot-password  POST /auth/reset-password (email + otp + newPassword)`
  );
  console.log(
    `   Website health: GET /public/website/health`
  );
  console.log(
    `   Website form: POST /public/website/apply   Track: GET /public/website/track?registrationId=`
  );
  if (fs.existsSync(path.join(__dirname, "website")) || fs.existsSync(path.join(__dirname, "..", "website"))) {
    console.log(
      `🌐 Website served at http://localhost:${PORT}/site/`
    );
  }
});