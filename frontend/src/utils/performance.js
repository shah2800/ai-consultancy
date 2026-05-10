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
  return !saveData && !effectiveType.includes("2g");
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
