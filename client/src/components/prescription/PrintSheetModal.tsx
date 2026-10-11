"use client";

import { useCallback, useEffect, useRef } from "react";
import { C, font } from "@/theme";
import Icon from "@/components/common/Icon";
import { useDialog } from "@/lib/useDialog";

// The printable prescription, shown IN the app instead of a pop-up window
// (physician's decision, 2026-08-26). "Save & print" used to `window.open` a
// second browser window: it needed a pop-up allowance to appear at all, it lost
// the doctor's place in the editor behind it, and on a tablet it is simply a
// second app to dismiss.
//
// The sheet still renders inside an <iframe>, and that is not incidental: the
// document carries its own `@page` size, print stylesheet and font rules, and
// letting those loose in the app's document would restyle the editor and print
// the wrong thing. The iframe keeps the printed page byte-identical to what the
// pop-up printed — only the frame around it changed.

const isPrintKey = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "p";

export default function PrintSheetModal({
  html,
  onClose,
}: {
  /** The built sheet, or null while the visit is still being saved. */
  html: string | null;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  // ⚕️ The sheet is a popup like any other (2026-10-12). It covers the whole
  // screen, and until then the keyboard did not know: the focus was left on the
  // page underneath, and Tab walked on through it. Measured in the browser with
  // the sheet open: three presses of Tab reached the patient chat's message box
  // — where Enter SENDS — and fifteen reached the navigation. The hook brings
  // the focus in, keeps Tab on Print and Close, closes on Escape (unless a
  // message has been raised over the sheet) and puts the focus back on the way
  // out.
  const dialog = useDialog<HTMLDivElement>(true, onClose);

  // Print the SHEET, not the app. Focusing the frame first is what makes the
  // browser print the framed document rather than the page around it.
  const printSheet = useCallback(() => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }, []);

  // Write the sheet in. `srcDoc` would do it too, but document.write is what
  // the pop-up and the gallery snapshot already use, so all three routes to the
  // sheet stay the same one.
  //
  // ⚕️ …and listen for keys INSIDE it. A key pressed while the focus is in the
  // frame never reaches the app's own document, and after Print the focus is
  // always in the frame (printing focuses it). There Escape did nothing,
  // Ctrl+P went to the browser instead of to the sheet's own Print, and Tab
  // left the frame for whatever lay behind the overlay. The listener is put on after
  // every write, because `document.open()` drops the ones before it; nothing is
  // added to the sheet's own HTML, which is still exactly what prints and what
  // the gallery snapshot pictures.
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc || !html) return;
    doc.open();
    doc.write(html);
    doc.close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Handed to the app's document, so the popup hook applies the same rule
        // as everywhere: only the popup on top closes.
        e.preventDefault();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        return;
      }
      if (isPrintKey(e)) {
        e.preventDefault();
        printSheet();
        return;
      }
      if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const buttons = barRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
        if (!buttons || buttons.length === 0) return;
        (e.shiftKey ? buttons[buttons.length - 1] : buttons[0]).focus();
      }
    };
    doc.addEventListener("keydown", onKey);
    return () => doc.removeEventListener("keydown", onKey);
  }, [html, printSheet]);

  // The page behind must not scroll under the overlay.
  //
  // Ctrl/Cmd+P is caught too, and deliberately: the doctor's habit is to press
  // it, and left alone it prints the APP page with the sheet squeezed into it
  // as one framed element. Sent to the frame it prints the prescription, which
  // is the only thing on screen worth printing while this is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPrintKey(e)) {
        e.preventDefault();
        printSheet();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [printSheet]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Prescription"
      {...dialog}
      style={{ position: "fixed", inset: 0, zIndex: 2500, display: "flex", flexDirection: "column", background: "#f0f0f0", fontFamily: font }}
    >
      <div ref={barRef} style={{ background: C.pri[400], padding: 10, textAlign: "center", flexShrink: 0 }}>
        <button
          onClick={printSheet}
          disabled={!html}
          style={{ background: "#fff", color: html ? C.pri[600] : C.n[400], border: "none", padding: "8px 22px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: html ? "pointer" : "not-allowed", margin: "0 4px", fontFamily: font, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Icon name="printer" size={15} /> Print / Save as PDF
        </button>
        <button
          onClick={onClose}
          style={{ background: "#fff", color: C.pri[600], border: "none", padding: "8px 22px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", margin: "0 4px", fontFamily: font }}
        >
          Close
        </button>
      </div>

      {/* The frame is mounted from the first render, so the sheet drops into a
          window that is already there — the doctor never sees it appear late. */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <iframe
          ref={frameRef}
          title="Prescription"
          style={{ width: "100%", height: "100%", border: "none", background: "#f0f0f0", visibility: html ? "visible" : "hidden" }}
        />
        {!html && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: C.n[500] }}>
            Saving the prescription…
          </div>
        )}
      </div>
    </div>
  );
}
