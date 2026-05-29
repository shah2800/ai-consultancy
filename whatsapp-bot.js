/**
 * NextStep International — WhatsApp AI Bot
 * ─────────────────────────────────────────
 * • Greets every new customer automatically
 * • Shows typing indicator before every reply
 * • Replies using Groq AI (llama-3.3-70b)
 * • Remembers conversation history per chat
 * • Skips group chats and status messages
 *
 * HOW TO RUN:
 *   1. node whatsapp-bot.js
 *   2. Scan the QR code with YOUR WhatsApp (the business number)
 *   3. Done — bot handles all incoming messages
 */

require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const axios = require("axios");

// ──────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL   = "llama-3.3-70b-versatile";

// Typing delay per character (ms) — makes it feel human
const TYPING_MS_PER_CHAR = 28;
const TYPING_MIN_MS      = 1800;
const TYPING_MAX_MS      = 5000;

// System prompt — edit this to match your business
const SYSTEM_PROMPT = `You are the friendly AI assistant for NextStep International, Pakistan's trusted study abroad consultancy.

Your job is to help Pakistani students who want to study abroad — especially MBBS, BBA/MBA, and IT programs in Georgia, Azerbaijan, Russia, and Turkey.

Key facts to share when relevant:
- MBBS in Georgia: ~$2,500/semester, 5–6 years, PMC recognised, no IELTS required
- BBA/MBA in Georgia: ~$1,750/semester, 4 years, English medium, HEC recognised
- IT/CS in Georgia: ~$1,500/semester, 4 years
- Free consultation available — we guide students from application to visa
- WhatsApp: +923142638901 | Website: nextstepinternationals.com
- Georgia is safe, affordable, has halal food and a Pakistani student community

Tone: Warm, helpful, professional. Reply in the same language the student uses (Urdu or English). Keep replies concise — 2–4 short paragraphs max. End with a call to action (apply, ask more, or book free consultation).

IMPORTANT: You are NOT a human — if directly asked, say you are an AI assistant for NextStep International. Never make up facts about specific universities or fees beyond what is listed above.`;

// Track conversation history per chat (in memory)
// Key: chatId, Value: array of {role, content}
const chatHistories = new Map();
const MAX_HISTORY   = 10; // messages to remember (5 exchanges)

// Track which chats already received a greeting
const greetedChats = new Set();

// ──────────────────────────────────────────
// WHATSAPP CLIENT
// ──────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "nextstep-bot" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

// ──────────────────────────────────────────
// QR CODE — scan with your WhatsApp
// ──────────────────────────────────────────
client.on("qr", (qr) => {
  console.log("\n📱 Scan this QR code with your WhatsApp (business number):\n");
  qrcode.generate(qr, { small: true });
  console.log("\nWaiting for scan...\n");
});

client.on("authenticated", () => {
  console.log("✅ WhatsApp authenticated!");
});

client.on("auth_failure", (msg) => {
  console.error("❌ Auth failed:", msg);
});

client.on("ready", () => {
  console.log("🚀 NextStep WhatsApp Bot is LIVE and ready!\n");
});

client.on("disconnected", (reason) => {
  console.log("⚠️  WhatsApp disconnected:", reason);
  console.log("Reconnecting in 5 seconds...");
  setTimeout(() => client.initialize(), 5000);
});

// ──────────────────────────────────────────
// MESSAGE HANDLER
// ──────────────────────────────────────────
client.on("message", async (msg) => {
  try {
    // Ignore: own messages, status broadcasts, group chats
    if (msg.fromMe)                         return;
    if (msg.from === "status@broadcast")    return;
    if (msg.from.endsWith("@g.us"))         return; // group
    if (msg.type === "revoked")             return;

    const chat    = await msg.getChat();
    const contact = await msg.getContact();
    const chatId  = msg.from;
    const name    = contact.pushname || contact.name || "there";
    const text    = (msg.body || "").trim();

    console.log(`💬 [${name}] ${text}`);

    // ── Send greeting if first time ──
    if (!greetedChats.has(chatId)) {
      greetedChats.add(chatId);

      // Show typing for greeting
      await chat.sendStateTyping();
      await sleep(1800);
      await chat.clearState();

      const greeting =
        `Assalam o Alaikum ${name}! 👋\n\n` +
        `Welcome to *NextStep International* — Pakistan's trusted study abroad consultancy.\n\n` +
        `I'm your AI assistant. I can help you with:\n` +
        `🏥 *MBBS / Medicine* in Georgia\n` +
        `💼 *BBA / MBA* Business programs\n` +
        `💻 *IT / Computer Science* degrees\n` +
        `🛂 Visa process, fees, scholarships & more\n\n` +
        `_How can I help you today?_`;

      await client.sendMessage(chatId, greeting);
      console.log(`✅ Greeting sent to ${name}`);

      // If the first message was just a "hi/hello", greeting is enough
      if (/^(hi|hello|salam|assalam|hey|helo|hii|salaam|aoa|wslm)\b/i.test(text)) {
        return;
      }
    }

    // ── Skip empty or non-text messages ──
    if (!text) {
      await chat.sendStateTyping();
      await sleep(1200);
      await chat.clearState();
      await client.sendMessage(chatId,
        "Please send a text message and I'll be happy to help! 😊\n\nFor quick help, share which program you're interested in: MBBS, BBA, or IT?"
      );
      return;
    }

    // ── Build conversation history ──
    if (!chatHistories.has(chatId)) {
      chatHistories.set(chatId, []);
    }
    const history = chatHistories.get(chatId);
    history.push({ role: "user", content: text });

    // Trim history to last MAX_HISTORY messages
    while (history.length > MAX_HISTORY) history.shift();

    // ── Show typing indicator ──
    await chat.sendStateTyping();

    // ── Get AI response from Groq ──
    const aiText = await getAIResponse(history);

    // ── Typing delay proportional to reply length ──
    const typingMs = Math.min(
      Math.max(aiText.length * TYPING_MS_PER_CHAR, TYPING_MIN_MS),
      TYPING_MAX_MS
    );
    await sleep(typingMs);
    await chat.clearState();

    // ── Send the reply ──
    await client.sendMessage(chatId, aiText);
    console.log(`✅ Replied to ${name}: ${aiText.substring(0, 60)}...`);

    // Save assistant reply to history
    history.push({ role: "assistant", content: aiText });

  } catch (err) {
    console.error("❌ Message handler error:", err.message);
  }
});

// ──────────────────────────────────────────
// GROQ AI
// ──────────────────────────────────────────
async function getAIResponse(history) {
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
        ],
        temperature: 0.55,
        max_tokens: 350,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return (
      response.data?.choices?.[0]?.message?.content ||
      "Sorry, I couldn't process that right now. Please WhatsApp us directly or visit nextstepinternationals.com 🙏"
    );
  } catch (err) {
    console.error("❌ Groq error:", err?.response?.data || err.message);
    if (err?.response?.status === 429) {
      return "I'm handling a lot of queries right now! Please try again in a moment, or call/WhatsApp us directly at +92 314 2638901 😊";
    }
    return "Something went wrong on my end. Please contact us directly on WhatsApp: +92 314 2638901 or visit nextstepinternationals.com";
  }
}

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────
// START
// ──────────────────────────────────────────
console.log("🤖 Starting NextStep WhatsApp AI Bot...\n");
client.initialize();
