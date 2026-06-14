/**
 * NextStep International — Website Config
 *
 * apiBase: URL of your running API server.
 *   - When served via Express /site route: auto-detects (same origin).
 *   - When opened as a file or on a custom domain: set the full URL below.
 *
 * formToken: Must match WEBSITE_FORM_SECRET in your API .env file.
 *            Leave blank ("") if you have not set WEBSITE_FORM_SECRET.
 */
window.NSI_CONFIG = {
  apiBase: (function () {
    /* When website is on Cloudflare Pages and API on Render, set this explicitly: */
    // return "https://api.nextstepinternationals.com";

    var loc = window.location;
    var protocol = String(loc.protocol || "").toLowerCase();

    // Opened as file:///D:/.../index.html — no real origin; point at local API
    if (protocol === "file:" || !protocol.startsWith("http")) {
      return "http://localhost:10000";
    }

    // Served through Express /site route OR live domain → same origin
    if (loc.pathname.indexOf("/site") === 0) return loc.origin;
    if (loc.hostname && loc.hostname !== "localhost" && loc.hostname !== "127.0.0.1") {
      return loc.origin;
    }

    // Local dev (e.g. python -m http.server on :8765)
    return "http://localhost:10000";
  })(),
  // Must match WEBSITE_FORM_SECRET in ai-consultancy/.env
  formToken: "NSI-WEB-FORM-SECURE-KEY-7k3m9p2qx",
};

/*
 * HOW TO OPEN THE FORM (pick one):
 *
 *  ✅ BEST — via Express (no CORS issues):
 *     http://localhost:10000/site/index.html
 *     http://localhost:10000/site/apply.html
 *
 *  ⚠️ Do not double-click index.html (file://) — comments and forms need the API.
 *     Run: npm start   then open the /site/ URL above.
 */
