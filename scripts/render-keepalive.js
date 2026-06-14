/**
 * Render Cron: ping the live site so the free-tier web service stays warm.
 * Set KEEP_ALIVE_URL in Render (default: https://www.nextstepinternationals.com/ping).
 */
const https = require("https");
const http = require("http");

const url = String(process.env.KEEP_ALIVE_URL || "https://www.nextstepinternationals.com/ping").trim();
const lib = url.startsWith("http://") ? http : https;

const req = lib.get(url, (res) => {
  const ok = res.statusCode >= 200 && res.statusCode < 400;
  console.log(`[keepalive] ${res.statusCode} ${url}`);
  res.resume();
  process.exit(ok ? 0 : 1);
});

req.setTimeout(120_000, () => {
  console.error("[keepalive] timeout (server may be cold-starting):", url);
  req.destroy();
  process.exit(1);
});

req.on("error", (err) => {
  console.error("[keepalive] error:", err.message);
  process.exit(1);
});
