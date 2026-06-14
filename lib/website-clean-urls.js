const fs = require("fs");
const path = require("path");

/** Basenames of website/*.html (except index) that get clean URLs e.g. /contact */
function discoverWebsitePageSlugs(websiteDir) {
  if (!websiteDir || !fs.existsSync(websiteDir)) return new Set();
  return new Set(
    fs
      .readdirSync(websiteDir)
      .filter((name) => name.endsWith(".html") && name !== "index.html")
      .map((name) => name.replace(/\.html$/i, ""))
  );
}

function registerWebsiteCleanUrlRoutes(app, websiteDir) {
  const slugs = discoverWebsitePageSlugs(websiteDir);
  if (!slugs.size) return;

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const m = req.path.match(/^\/([a-z0-9-]+)\.html$/i);
    if (m && slugs.has(m[1])) {
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      return res.redirect(301, `/${m[1]}${qs}`);
    }
    next();
  });

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const slug = req.path.replace(/^\//, "").replace(/\/$/, "");
    if (!slug || slug.includes(".") || !slugs.has(slug)) return next();
    const file = path.join(websiteDir, `${slug}.html`);
    if (fs.existsSync(file)) return res.sendFile(file);
    next();
  });

  console.log(`🔗 Clean website URLs enabled for ${slugs.size} pages (e.g. /contact, /apply)`);
}

module.exports = { discoverWebsitePageSlugs, registerWebsiteCleanUrlRoutes };
