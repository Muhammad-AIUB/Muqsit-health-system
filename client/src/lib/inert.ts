import { useCallback, useRef } from "react";

// `inert` takes an element and everything in it out of the tab order, away from
// the mouse and away from assistive technology — what a locked section and a
// closed patient gate both need. React 18 does not know the `inert` prop, so it
// has to be set on the element by hand:
//
//   const inert = useInert<HTMLDivElement>();
//   <div key="…" ref={inert}> … </div>
//
// ⚕️ What is set by hand must be taken off by hand. When the wrapper goes away
// and what it wrapped is itself a <div>, React does not remove the wrapper's
// node — it RE-USES it for that <div>, and an attribute React never knew about
// stays on it. Until 2026-10-06 that is what happened: a section unlocked, or a
// patient chosen, and the content came back still inert — nothing in it could
// be clicked or typed into until the page was reloaded. This ref removes the
// attribute when React detaches it, re-used node or not.
//
// Give the wrapper a `key` as well, so its node is not recycled into the
// content's root at all; the ref is what keeps it safe if a key is ever dropped.
export function useInert<T extends HTMLElement>() {
  const node = useRef<T | null>(null);
  return useCallback((el: T | null) => {
    if (el) el.setAttribute("inert", "");
    else node.current?.removeAttribute("inert");
    node.current = el;
  }, []);
}
