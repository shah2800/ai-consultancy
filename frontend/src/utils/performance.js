export function getAdaptivePollInterval(baseMs = 15000) {
  if (typeof navigator === "undefined") return baseMs;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = Boolean(connection?.saveData);
  const effectiveType = String(connection?.effectiveType || "").toLowerCase();
  const slowNetwork =
    saveData || effectiveType.includes("2g") || effectiveType === "slow-2g";

  if (slowNetwork) return Math.max(baseMs, 45000);
  if (effectiveType === "3g") return Math.max(baseMs, 30000);
  return Math.max(baseMs, 20000);
}

export function canPrefetchRoutes() {
  if (typeof navigator === "undefined") return false;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = Boolean(connection?.saveData);
  const effectiveType = String(connection?.effectiveType || "").toLowerCase();
  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  const constrainedDevice =
    (Number.isFinite(memory) && memory > 0 && memory <= 1) ||
    (Number.isFinite(cores) && cores > 0 && cores <= 2);
  return !saveData && !effectiveType.includes("2g") && !constrainedDevice;
}

export function runWhenIdle(task, timeout = 1200) {
  if (typeof window === "undefined") return () => {};
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, Math.min(timeout, 400));
  return () => window.clearTimeout(id);
}

/**
 * Returns a debounced version of `fn` that delays invocation by `wait` ms.
 * Useful for search inputs to avoid firing on every keystroke.
 */
export function debounce(fn, wait = 300) {
  let timer = null;
  const debounced = (...args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };
  return debounced;
}

export function setupManagedPolling(task, options = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { dispose: () => {}, trigger: () => {} };
  }

  const {
    baseMs = 15000,
    minGapMs = 1200,
    requireFocus = true,
    runImmediately = true,
  } = options;
  const pollMs = getAdaptivePollInterval(baseMs);

  let disposed = false;
  let intervalId = null;
  let inFlight = false;
  let lastRunAt = 0;

  const canRun = (respectGap = true) => {
    if (disposed) return false;
    if (document.visibilityState !== "visible") return false;
    if (requireFocus && typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
    if (!respectGap) return true;
    return Date.now() - lastRunAt >= minGapMs;
  };

  const run = async ({ force = false } = {}) => {
    if (!canRun(!force)) return;
    if (inFlight) return;
    inFlight = true;
    lastRunAt = Date.now();
    try {
      await task();
    } finally {
      inFlight = false;
    }
  };

  const start = () => {
    if (intervalId != null) return;
    intervalId = window.setInterval(() => {
      void run();
    }, pollMs);
  };

  const stop = () => {
    if (intervalId == null) return;
    window.clearInterval(intervalId);
    intervalId = null;
  };

  const onActive = () => {
    if (document.visibilityState !== "visible") return;
    start();
    if (runImmediately) void run();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") onActive();
    else stop();
  };

  onVisibilityChange();
  window.addEventListener("focus", onActive);
  window.addEventListener("online", onActive);
  window.addEventListener("offline", stop);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return {
    dispose() {
      disposed = true;
      stop();
      window.removeEventListener("focus", onActive);
      window.removeEventListener("online", onActive);
      window.removeEventListener("offline", stop);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
    trigger({ force = false } = {}) {
      void run({ force });
    },
  };
}
