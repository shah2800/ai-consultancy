import { useContext, useEffect, useRef, useState } from "react";
import { ShellScrollContext } from "../contexts/ShellScrollContext";

/**
 * Tracks when `sentinelRef` intersects the shell scroll container (above-the-fold
 * sentinel stays cold until the user scrolls). `resetKey` re-arms after each chunk load.
 *
 * @param {{ enabled?: boolean, rootMargin?: string, resetKey?: string }} [options]
 */
export function useInViewSentinel({ enabled = true, rootMargin = "240px 0px", resetKey = "" } = {}) {
  const scrollRef = useContext(ShellScrollContext);
  const sentinelRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    setInView(false);
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    const el = sentinelRef.current;
    if (!el) return undefined;

    const root = scrollRef?.current ?? null;
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (hit) setInView(true);
      },
      {
        root: root || undefined,
        rootMargin,
        threshold: 0,
      }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [enabled, scrollRef, rootMargin, resetKey]);

  return { sentinelRef, inView };
}
