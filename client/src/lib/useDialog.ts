import { useEffect, useRef } from "react";

// What every popup owes a doctor at a keyboard: Escape closes it, Tab stays
// inside it, and when it closes they are back where they were.
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
//     dialog in the document is the one on top.
//
// Tab (same day). The popups said `aria-modal`, but Tab walked straight out of
// them: past the last button it went on into the page behind the backdrop —
// the prescription editor, where a doctor could type into a field they could
// not see. Now Tab past the last control comes round to the first, and
// Shift+Tab the other way. It only ever acts at the two ends, so a popup's own
// Enter/Tab order in between is untouched. If the focus is not in the popup at
// all — still on the button that opened it, say — Tab brings it in. So whatever
// a popup shows must be drawn INSIDE its panel: a list hung elsewhere in the
// document would be unreachable by keyboard (the app has none today).
//
// Closing puts the focus back on what opened the popup, but only if closing
// left it nowhere. A popup that hands focus on by itself (pick a patient, land
// in the next box) keeps its own choice.

const DIALOGS = '[role="dialog"], [role="alertdialog"]';
const TABBABLE = [
  "a[href]", "button:not([disabled])", 'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])", "textarea:not([disabled])", "summary",
  '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]', '[contenteditable=""]',
].join(", ");

// The controls Tab can land on, in order. A control inside something hidden
// has no box; where NOTHING has a box (a test's DOM has no layout at all) the
// test is dropped rather than calling the whole popup empty.
function tabStops(panel: HTMLElement): HTMLElement[] {
  const all = Array.from(panel.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[inert], [aria-hidden="true"]'),
  );
  const drawn = all.filter((el) => el.getClientRects().length > 0);
  return drawn.length > 0 ? drawn : all;
}

export function useDialog<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // What had the focus when the popup was asked for. Read while rendering, not
  // in the effect: by then a box inside the popup may already have taken focus
  // for itself, and "where the doctor was" would be inside the popup.
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) {
    const active = typeof document === "undefined" ? null : document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const onTop = () => {
      const dialogs = document.querySelectorAll(DIALOGS);
      return dialogs.length === 0 || dialogs[dialogs.length - 1] === ref.current;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (e.defaultPrevented || !onTop()) return;
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const panel = ref.current;
      if (!panel || !onTop()) return;
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && panel.contains(active);
      const stops = tabStops(panel);
      if (stops.length === 0) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (e.shiftKey) {
        if (!inside || active === panel || active === first) { e.preventDefault(); last.focus(); }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
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
      // `opener` is left set: in development React runs this cleanup once
      // straight after mounting, and the popup is still open after it.
      const back = opener.current;
      const active = document.activeElement;
      const nowhere = !active || active === document.body;
      if (back && back.isConnected && nowhere) back.focus({ preventScroll: true });
    };
  }, [open]);

  // tabIndex -1: focusable by the line above, never a Tab stop of its own. The
  // panel is not a control, so it draws no focus ring (see globals.css).
  return { ref, tabIndex: -1, "data-focus-ring": "off" } as const;
}
