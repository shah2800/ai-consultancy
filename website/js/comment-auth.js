/**
 * Public website comment sign-in (localStorage session).
 */
window.NSI_COMMENT_AUTH = (function () {
  var STORAGE_KEY = "nsi_comment_token";

  function apiBase() {
    var cfg = window.NSI_CONFIG || {};
    var base = String(cfg.apiBase || "").replace(/\/+$/, "");
    if (!base || /^file:/i.test(base) || base === "null") {
      return "http://localhost:10000";
    }
    return base;
  }

  function getToken() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(STORAGE_KEY, token);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function authHeaders() {
    var token = getToken();
    var h = { "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    return h;
  }

  async function fetchMe() {
    var base = apiBase();
    if (!base || !getToken()) return null;
    try {
      var res = await fetch(base + "/public/website/comment-auth/me", {
        headers: authHeaders(),
      });
      if (!res.ok) {
        setToken("");
        return null;
      }
      var data = await res.json();
      return data.user || null;
    } catch (_) {
      return null;
    }
  }

  function networkErrorMessage() {
    var base = apiBase();
    if (!base) {
      return "API URL is not configured. Open the site through your running server (e.g. http://localhost:10000/site/index.html).";
    }
    return (
      "Could not reach the server at " + base + ". " +
      "If testing locally, run npm start in the project folder and open http://localhost:10000/site/index.html " +
      "(not the Python static server on port 8765)."
    );
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  async function login(email, password) {
    var base = apiBase();
    if (!base) throw new Error(networkErrorMessage());
    if (!isValidEmail(email)) {
      throw new Error("Please enter a valid email address (e.g. you@gmail.com).");
    }
    try {
      var res = await fetch(base + "/public/website/comment-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password }),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (_) {}
      if (res.status === 404) {
        throw new Error("Comment sign-in is not available yet on this server. Deploy the latest API and try again.");
      }
      if (!res.ok) throw new Error(data.error || "Sign in failed.");
      setToken(data.token || "");
      return data.user;
    } catch (err) {
      if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(err.message || ""))) {
        throw new Error(networkErrorMessage());
      }
      throw err;
    }
  }

  async function register(name, email, password) {
    var base = apiBase();
    if (!base) throw new Error(networkErrorMessage());
    if (!isValidEmail(email)) {
      throw new Error("Please enter a valid email address (e.g. you@gmail.com).");
    }
    try {
      var res = await fetch(base + "/public/website/comment-auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, email: email, password: password }),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (_) {}
      if (res.status === 404) {
        throw new Error("Comment sign-in is not available yet on this server. Deploy the latest API and try again.");
      }
      if (!res.ok) throw new Error(data.error || "Could not create account.");
      setToken(data.token || "");
      return data.user;
    } catch (err) {
      if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(err.message || ""))) {
        throw new Error(networkErrorMessage());
      }
      throw err;
    }
  }

  function signOut() {
    setToken("");
  }

  return {
    getToken: getToken,
    setToken: setToken,
    authHeaders: authHeaders,
    fetchMe: fetchMe,
    login: login,
    register: register,
    signOut: signOut,
  };
})();
