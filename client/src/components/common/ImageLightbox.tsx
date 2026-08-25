"use client";

import { useCallback, useEffect, type CSSProperties } from "react";
import { C } from "@/theme";

// ── Full-screen image viewer ────────────────────────────────────────────────
//
// One copy, three callers: the patient's prescription and report galleries, the
// investigation findings field, and the ward's paper order sheet. There used to
// be two independent implementations of this with slightly different keyboard
// handling and captions — on a screen where a doctor reads a scanned document,
// two versions that can drift apart is the problem, not the duplication.
//
// The component owns the keyboard and the chrome; the caller owns which image
// is showing, so "clicked page 3, opened page 3" stays the caller's guarantee
// rather than something this component quietly decides.
export default function ImageLightbox({
  urls,
  index,
  onIndex,
  onClose,
  alt = "",
  wrap = false,
}: {
  urls: string[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
  alt?: string;
  /** Past the last image, go back to the first. The investigation-findings
   *  viewer has always behaved this way; the record galleries clamp and grey
   *  out the arrow. Kept as a prop rather than picking a winner, because both
   *  are existing patient-facing behaviour and neither was asked to change. */
  wrap?: boolean;
}) {
  const clamped = Math.min(Math.max(index, 0), Math.max(0, urls.length - 1));
  const atFirst = !wrap && clamped === 0;
  const atLast = !wrap && clamped >= urls.length - 1;

  const step = useCallback(
    (d: number) => {
      if (urls.length === 0) return;
      onIndex(
        wrap
          ? (clamped + d + urls.length) % urls.length
          : Math.min(Math.max(clamped + d, 0), urls.length - 1),
      );
    },
    [clamped, urls.length, onIndex, wrap],
  );

  // The caption promises ← → keys, so they have to work. Escape closes: this
  // covers the whole screen, and a doctor who cannot get out of it cannot get
  // back to the prescription.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose]);

  if (urls.length === 0) return null;

  return (
    <div
      data-testid="image-lightbox"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 24 }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); step(-1); }}
        disabled={atFirst}
        title="Previous (←)"
        aria-label="Previous image"
        style={navArrow(atFirst, "left")}
      >‹</button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[clamped]}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "82vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
      />

      <button
        onClick={(e) => { e.stopPropagation(); step(1); }}
        disabled={atLast}
        title="Next (→)"
        aria-label="Next image"
        style={navArrow(atLast, "right")}
      >›</button>

      <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", fontSize: 13, background: "rgba(0,0,0,0.5)", padding: "4px 12px", borderRadius: 999 }}>
        {clamped + 1} / {urls.length} · use ← → keys
      </div>

      <button
        onClick={onClose}
        title="Close (Esc)"
        aria-label="Close"
        style={{ position: "fixed", top: 18, right: 22, width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.92)", color: C.n[900], fontSize: 20, cursor: "pointer" }}
      >×</button>
    </div>
  );
}

const navArrow = (disabled: boolean, side: "left" | "right"): CSSProperties => ({
  position: "fixed", [side]: 18, top: "50%", transform: "translateY(-50%)",
  width: 46, height: 46, borderRadius: "50%", border: "none",
  background: disabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.92)",
  color: C.n[900], fontSize: 26, lineHeight: 1, cursor: disabled ? "default" : "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2001,
});
