import axios from "axios";

const memoryGetCache = new Map();
const inFlightGets = new Map();
const SESSION_CACHE_PREFIX = "api:get:session:";
const STORAGE_CACHE_PREFIX = "api:get:storage:";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000",
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

export function invalidateCachedGet(match) {
  const matcher = typeof match === "function"
    ? match
    : (key) => key.includes(String(match || ""));

  for (const key of Array.from(memoryGetCache.keys())) {
    if (matcher(key)) memoryGetCache.delete(key);
  }
  for (const key of Array.from(inFlightGets.keys())) {
    if (matcher(key)) inFlightGets.delete(key);
  }

  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const fullKey = sessionStorage.key(i);
      if (!fullKey || !fullKey.startsWith(SESSION_CACHE_PREFIX)) continue;
      const cacheKey = fullKey.slice(SESSION_CACHE_PREFIX.length);
      if (matcher(cacheKey)) sessionStorage.removeItem(fullKey);
    }
  } catch { /* Ignore storage access issues */ }

  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const fullKey = localStorage.key(i);
      if (!fullKey || !fullKey.startsWith(STORAGE_CACHE_PREFIX)) continue;
      const cacheKey = fullKey.slice(STORAGE_CACHE_PREFIX.length);
      if (matcher(cacheKey)) localStorage.removeItem(fullKey);
    }
  } catch { /* Ignore storage access issues */ }
}

/* =========================
   AUTO ATTACH JWT TOKEN
========================= */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;

    /* Let the browser set multipart boundary for FormData */
    if (config.data instanceof FormData && config.headers) {
      if (typeof config.headers.delete === "function") {
        config.headers.delete("Content-Type");
      } else {
        delete config.headers["Content-Type"];
      }
    }

    /* Deduplicate concurrent identical GET requests — if the same URL is
       already in-flight, reuse its promise instead of firing a second request. */
    if (config.method === "get" && !config._skipDedup) {
      const key = `${config.baseURL || ""}${config.url}${JSON.stringify(config.params || {})}`;
      if (inFlightGets.has(key)) {
        config._dedupKey = key;
        config._dedupPromise = inFlightGets.get(key);
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (res) => {
    /* Clean up dedup tracker on success */
    if (res.config?._dedupKey) {
      inFlightGets.delete(res.config._dedupKey);
    }
    return res;
  },
  (error) => {
    /* Clean up dedup tracker on error */
    if (error.config?._dedupKey) {
      inFlightGets.delete(error.config._dedupKey);
    }
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      const path = window.location?.pathname || "";
      if (path !== "/" && path !== "/forgot-password" && path !== "/reset-password") {
        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
