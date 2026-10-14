import { useEffect, useState } from "react";

/**
 * Whether a CSS media query matches, following it as the window changes.
 * False where there is no `matchMedia` (the server render, jsdom) — the
 * full-size layout is the default, and a short screen is the exception.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, [query]);
  return matches;
}
