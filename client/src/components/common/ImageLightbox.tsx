"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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
//
// ⚕️ It also owns the ZOOM (2026-08-30). Fitting a photographed order sheet to
// the screen is not the same as being able to read the handwriting on it, so
// the viewer magnifies up to 6× and pans. Two rules keep the zoom from getting
// in the doctor's way: it starts at fit (nothing changes until they ask for
// it), and it RESETS on every image change — carrying one page's magnified
// corner onto the next page would show them a crop of a document they have not
// seen whole.

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const STEP = 1.4;

const clampScale = (s: number) => Math.min(Math.max(s, MIN_SCALE), MAX_SCALE);

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

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // A pan and a click on the backdrop are the same gesture until the mouse
  // moves. Without this, dragging a zoomed page and releasing shut the viewer.
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const moved = useRef(false);

  // Keep the image overlapping the frame: at scale s it can travel at most half
  // the overflow in each direction. `getBoundingClientRect` reports the SCALED
  // box, so divide it back out to get the fitted size.
  const clampPan = useCallback((p: { x: number; y: number }, s: number) => {
    if (s <= 1) return { x: 0, y: 0 };
    const el = imgRef.current;
    if (!el) return p;
    const r = el.getBoundingClientRect();
    const maxX = (r.width / s) * (s - 1) * 0.5;
    const maxY = (r.height / s) * (s - 1) * 0.5;
    return {
      x: Math.min(Math.max(p.x, -maxX), maxX),
      y: Math.min(Math.max(p.y, -maxY), maxY),
    };
  }, []);

  const zoomTo = useCallback(
    (next: number) => {
      const s = clampScale(next);
      setScale(s);
      setPan((p) => clampPan(s <= 1 ? { x: 0, y: 0 } : p, s));
    },
    [clampPan],
  );

  const resetZoom = useCallback(() => { setScale(1); setPan({ x: 0, y: 0 }); }, []);

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

  // A new page is a new document: never inherit the last one's magnification.
  const currentUrl = urls[clamped];
  useEffect(() => { resetZoom(); }, [currentUrl, resetZoom]);

  // The caption promises ← → keys, so they have to work. Escape closes: this
  // covers the whole screen, and a doctor who cannot get out of it cannot get
  // back to the prescription. + − 0 drive the zoom from the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "+" || e.key === "=") zoomTo(scale * STEP);
      else if (e.key === "-" || e.key === "_") zoomTo(scale / STEP);
      else if (e.key === "0") resetZoom();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose, zoomTo, resetZoom, scale]);

  // Wheel-to-zoom has to be a native listener: React's onWheel is passive, so
  // preventDefault there is ignored and the ward page scrolls away behind the
  // viewer while the doctor is trying to magnify.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo(scale * (e.deltaY < 0 ? STEP : 1 / STEP));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo, scale]);

  if (urls.length === 0) return null;

  const zoomed = scale > 1;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!zoomed) return;
    e.stopPropagation();
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    moved.current = false;
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!moved.current && Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    setPan(clampPan({ x: d.px + dx, y: d.py + dy }, scale));
  };
  const endDrag = (e: ReactPointerEvent) => {
    if (drag.current) e.stopPropagation();
    drag.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={overlayRef}
      data-testid="image-lightbox"
      // ⚕️ A pan that ends on the backdrop must not close the viewer — the
      // doctor was reading, not dismissing.
      onClick={() => { if (moved.current) { moved.current = false; return; } onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 24, overflow: "hidden" }}
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
        ref={imgRef}
        src={urls[clamped]}
        alt={alt}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => { e.stopPropagation(); if (zoomed) resetZoom(); else zoomTo(2.5); }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          maxWidth: "82vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "center",
          transition: dragging ? "none" : "transform 120ms ease-out",
          cursor: zoomed ? (dragging ? "grabbing" : "grab") : "zoom-in",
          touchAction: "none",
          userSelect: "none",
        }}
      />

      <button
        onClick={(e) => { e.stopPropagation(); step(1); }}
        disabled={atLast}
        title="Next (→)"
        aria-label="Next image"
        style={navArrow(atLast, "right")}
      >›</button>

      {/* Zoom controls sit with the counter, so the one line the doctor reads
          tells them both where they are in the pages and how far in they are. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, color: "#fff", fontSize: 13, background: "rgba(0,0,0,0.55)", padding: "5px 12px", borderRadius: 999, zIndex: 2001 }}
      >
        <button onClick={() => zoomTo(scale / STEP)} disabled={scale <= MIN_SCALE} title="Zoom out (−)" aria-label="Zoom out" style={zoomBtn(scale <= MIN_SCALE)}>−</button>
        <button onClick={resetZoom} title="Reset zoom (0)" aria-label="Reset zoom" style={{ ...zoomBtn(false), width: "auto", padding: "0 10px", fontSize: 12, borderRadius: 999 }}>
          {Math.round(scale * 100)}%
        </button>
        <button onClick={() => zoomTo(scale * STEP)} disabled={scale >= MAX_SCALE} title="Zoom in (+)" aria-label="Zoom in" style={zoomBtn(scale >= MAX_SCALE)}>＋</button>
        <span style={{ opacity: 0.55 }}>|</span>
        <span style={{ whiteSpace: "nowrap" }}>
          {clamped + 1} / {urls.length} · {zoomed ? "drag to move · double-click to fit" : "← → keys · scroll or double-click to zoom"}
        </span>
      </div>

      <button
        onClick={onClose}
        title="Close (Esc)"
        aria-label="Close"
        style={{ position: "fixed", top: 18, right: 22, width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.92)", color: C.n[900], fontSize: 20, cursor: "pointer", zIndex: 2001 }}
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

const zoomBtn = (disabled: boolean): CSSProperties => ({
  width: 26, height: 26, borderRadius: "50%", border: "none",
  background: disabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.92)",
  color: C.n[900], fontSize: 15, lineHeight: 1, cursor: disabled ? "default" : "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
});
