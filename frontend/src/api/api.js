import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000",
  headers: { "Content-Type": "application/json" },
  timeout: 45000,
});

const memoryGetCache = new Map();
const inFlightGets = new Map();
const SESSION_CACHE_PREFIX = "api-cache:v1:";
const STORAGE_CACHE_PREFIX = "api-cache:v2:";

function stableStringify(value) {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${k}:${stableStringify(value[k])}`).join(",")}}`;
}

function cacheKeyFrom(url, config = {}) {
  const method = String(config.method || "get").toLowerCase();
  const params = stableStringify(config.params || {});
  const data = method === "get" ? "" : stableStringify(config.data || {});
  const token = localStorage.getItem("token") || "";
  const tokenHint = token ? token.slice(-16) : "anon";
  return `${tokenHint}|${method}|${url}|p:${params}|d:${data}`;
}

function readSessionCache(key) {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (Number(parsed.expiresAt || 0) <= Date.now()) {
      sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionCache(key, value) {
  try {
    sessionStorage.setItem(SESSION_CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* Ignore storage quota/private mode issues */
  }
}

function readPersistentCache(key) {
  try {
    const raw = localStorage.getItem(STORAGE_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (Number(parsed.expiresAt || 0) <= Date.now()) {
      localStorage.removeItem(STORAGE_CACHE_PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePersistentCache(key, value) {
  try {
    localStorage.setItem(STORAGE_CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* Ignore storage quota/private mode issues */
  }
}

export async function cachedGet(url, config = {}, ttlMs = 15000) {
  if (!ttlMs || ttlMs <= 0) {
    return api.get(url, config);
  }
  const key = cacheKeyFrom(url, { ...config, method: "get" });

  const inMemory = memoryGetCache.get(key);
  if (inMemory && inMemory.expiresAt > Date.now()) {
    return {
      data: inMemory.data,
      status: 200,
      statusText: "OK",
      headers: {},
      config: { ...config, url, method: "get" },
      request: undefined,
      __fromCache: true,
    };
  }

  const inSession = readSessionCache(key);
  if (inSession) {
    memoryGetCache.set(key, inSession);
    return {
      data: inSession.data,
      status: 200,
      statusText: "OK",
      headers: {},
      config: { ...config, url, method: "get" },
      request: undefined,
      __fromCache: true,
    };
  }

  const inPersistent = readPersistentCache(key);
  if (inPersistent) {
    memoryGetCache.set(key, inPersistent);
    return {
      data: inPersistent.data,
      status: 200,
      statusText: "OK",
      headers: {},
      config: { ...config, url, method: "get" },
      request: undefined,
      __fromCache: true,
    };
  }

  if (inFlightGets.has(key)) {
    return inFlightGets.get(key);
  }

  const requestPromise = api.get(url, config).then((res) => {
    const entry = { data: res.data, expiresAt: Date.now() + ttlMs };
    memoryGetCache.set(key, entry);
    writeSessionCache(key, entry);
    writePersistentCache(key, entry);
    return res;
  }).finally(() => {
    inFlightGets.delete(key);
  });

  inFlightGets.set(key, requestPromise);
  return requestPromise;
}

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
  } catch {
    /* Ignore storage access issues */
  }

  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const fullKey = localStorage.key(i);
      if (!fullKey || !fullKey.startsWith(STORAGE_CACHE_PREFIX)) continue;
      const cacheKey = fullKey.slice(STORAGE_CACHE_PREFIX.length);
      if (matcher(cacheKey)) localStorage.removeItem(fullKey);
    }
  } catch {
    /* Ignore storage access issues */
  }
}

/* =========================
   AUTO ATTACH JWT TOKEN
========================= */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    /* Let the browser set multipart boundary for FormData (broadcast attachments). */
    if (config.data instanceof FormData && config.headers) {
      if (typeof config.headers.delete === "function") {
        config.headers.delete("Content-Type");
      } else {
        delete config.headers["Content-Type"];
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (res) => res,
  (error) => {
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