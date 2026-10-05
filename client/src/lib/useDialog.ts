import { useEffect, useRef } from "react";

// What every popup owes a doctor at a keyboard: Escape closes it, and Tab
// starts inside it rather than somewhere behind the backdrop.
//
// Until 2026-10-06 four of the app's popups closed on Escape (the lightbox, the
// print sheet, special advice, the personal note) and seven did not — the
// Investigation popup, On examination, Drug history, the field popup, the new
// patient and family forms, the summary download. A doctor who learnt Escape on
// one was left pressing it at the next.
//
//   const dialog = useDialog(open, close);
//   {open && <div onClick={close}> <div role="dialog" {...dialog}> … </div> </div>}
//
// `close` is whatever the popup's own × or backdrop already calls, so Escape
// can never do something the mouse cannot.
//
// Two rules keep Escape from being greedy:
//   • A field that uses Escape for itself — a date box abandoning a typo, a
//     value box cancelling an edit — calls `preventDefault()`, and the popup
//     stays open. The key did one job.
//   • Only the popup ON TOP answers. With a report image open over the
//     Investigation popup, Escape closes the image and nothing else: the last
//     `role="dialog"` in the document is the one on top.
export function useDialog<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs.length > 0 && dialogs[dialogs.length - 1] !== ref.current) return;
      e.preventDefault();
      close.current();
    };
    document.addEventListener("keydown", onKey);
    // Next frame, so a field that focuses itself on mount gets there first.
    const raf = requestAnimationFrame(() => {
      const el = ref.current;
      if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  // tabIndex -1: focusable by the line above, never a Tab stop of its own. The
  // panel is not a control, so it draws no focus ring (see globals.css).
  return { ref, tabIndex: -1, "data-focus-ring": "off" } as const;
}
