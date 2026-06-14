/**
 * NextStep International — Website Config
 *
 * apiBase: URL of your running API server.
 *   - Cloudflare Pages (www) → api.nextstepinternationals.com on Render
 *   - Local dev → localhost:10000
 *
 * formToken: Must match WEBSITE_FORM_SECRET in Render Environment.
 */
window.NSI_CONFIG = {
  apiBase: (function () {
    var loc = window.location;
    var protocol = String(loc.protocol || "").toLowerCase();
    var host = String(loc.hostname || "").toLowerCase();

    if (protocol === "file:" || !protocol.startsWith("http")) {
      return "http://localhost:10000";
    }

    if (host === "localhost" || host === "127.0.0.1") {
      if (loc.pathname.indexOf("/site") === 0) return loc.origin;
      return "http://localhost:10000";
    }

    if (host === "www.nextstepinternationals.com" || host === "nextstepinternationals.com") {
      return "https://api.nextstepinternationals.com";
    }

    return loc.origin;
  })(),
  formToken: "NSI-WEB-FORM-SECURE-KEY-7k3m9p2qx",
};
