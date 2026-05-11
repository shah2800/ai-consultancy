import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ShellScrollContext } from "../contexts/ShellScrollContext";
import { runWhenIdle } from "../utils/performance";

/**
 * Defers mounting `children` until the placeholder intersects the scroll root
 * (or viewport when no shell) or until an idle-time fallback — keeps first paint light.
 */
export default function DeferUntilInView({
  children,
  fallback = null,
  rootMargin = "140px 0px",
  idleFallbackMs = 1100,
  disabled = false,
  onFirstVisible,
}) {
  const scrollRef = useContext(ShellScrollContext);
  const hostRef = useRef(null);
  const [ready, setReady] = useState(disabled);
  const firedRef = useRef(false);

  const fireVisible = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (typeof onFirstVisible === "function") onFirstVisible();
    setReady(true);
  }, [onFirstVisible]);

  useEffect(() => {
    if (disabled || ready) return;
    const el = hostRef.current;
    if (!el) return;

    const root = scrollRef?.current ?? null;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fireVisible();
      },
      {
        root: root || undefined,
        rootMargin,
        threshold: 0,
      }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [disabled, ready, scrollRef, rootMargin]);

  useEffect(() => {
    if (disabled || ready || idleFallbackMs <= 0) return undefined;
    return runWhenIdle(fireVisible, idleFallbackMs);
  }, [disabled, ready, idleFallbackMs, fireVisible]);

  if (disabled || ready) {
    return children;
  }

  return (
    <div ref={hostRef} className="defer-until-in-view" data-defer-sentinel="">
      {fallback}
    </div>
  );
}
