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
    var loc = window.location;
    // Served through Express /site route OR any non-localhost domain → same origin
    if (loc.pathname.indexOf("/site") === 0) return loc.origin;
    if (loc.hostname !== "localhost" && loc.hostname !== "127.0.0.1") return loc.origin;
    // Local dev fallback
    return "http://localhost:10000";
  })(),
  // Must match WEBSITE_FORM_SECRET in ai-consultancy/.env
  formToken: "NSI-WEB-FORM-SECURE-KEY-7k3m9p2qx",
};

/*
 * HOW TO OPEN THE FORM (pick one):
 *
 *  ✅ BEST — via Express (no CORS issues):
 *     http://localhost:10000/site/apply.html
 *     http://localhost:10000/site/track.html
 *
 *  ✅ ALSO OK — direct file open (works after the CORS fix in index.js):
 *     Double-click apply.html in File Explorer
 *     (API must be running: node index.js inside ai-consultancy/)
 */
