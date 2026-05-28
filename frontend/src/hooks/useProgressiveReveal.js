import { useEffect, useState } from "react";

function cancelScheduled(id) {
  if (typeof window.requestIdleCallback === "function" && typeof id === "number") {
    window.cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

function scheduleIdle(callback, timeout) {
  if (typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback, { timeout });
  }
  return setTimeout(callback, 64);
}

/**
 * After `active` is true, sets `ready` on the next idle window (timeout fallback).
 * Resets when `resetKey` changes.
 */
export function useProgressiveRevealOneTier(active, resetKey = "") {
  const [ready, setReady] = useState(false);

  /* Reset-then-reveal: intentional stagger for progressive paint (same pattern as Lead Profile). */
  useEffect(() => {
    setReady(false);
  }, [resetKey]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setReady(true);
    };
    const id = scheduleIdle(finish, 280);
    return () => {
      cancelled = true;
      cancelScheduled(id);
    };
  }, [active, resetKey]);

  return ready;
}

/**
 * Two staggered idle reveals (primary first, then secondary) — matches Lead Profile staging.
 */
export function useProgressiveRevealTwoTier(active, resetKey = "") {
  const [primaryReady, setPrimaryReady] = useState(false);
  const [secondaryReady, setSecondaryReady] = useState(false);

  useEffect(() => {
    setPrimaryReady(false);
    setSecondaryReady(false);
  }, [resetKey]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const runPrimary = () => {
      if (!cancelled) setPrimaryReady(true);
    };
    const runSecondary = () => {
      if (!cancelled) setSecondaryReady(true);
    };
    const id1 = scheduleIdle(runPrimary, 220);
    const id2 = scheduleIdle(runSecondary, 520);
    return () => {
      cancelled = true;
      cancelScheduled(id1);
      cancelScheduled(id2);
    };
  }, [active, resetKey]);

  return { primaryReady, secondaryReady };
}
