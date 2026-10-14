"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { C, font } from "@/theme";
import { btnClose, btnSecondary, btnDisabled } from "@/theme/styles";
import { zoomScale } from "@/lib/dropdownAnchor";
import type { DayImage } from "@/lib/investigationImages";

// The report image, large, beside the Investigation popup (physician's request,
// 2026-10-15): a click on a test's thumbnail opens it here instead of a new
// browser tab. Zoom, rotate, drag to move about the page, ‹ › (or ← →) through
// every test image of the day, and its own × — the form stays open beside it.

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

interface Props {
  items: DayImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** The day the images belong to, dd/mm/yyyy. */
  date: string;
}

export default function ReportViewerPane({ items, index, onIndex, onClose, date }: Props) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const item = items[index];
  const paneRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  // Every image starts at fit and upright.
  useEffect(() => { setZoom(1); setRotation(0); }, [item?.key]);
  // Opened from a thumbnail: the arrows belong to the viewer at once.
  useEffect(() => { paneRef.current?.focus({ preventScroll: true }); }, []);

  if (!item) return null;
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  const zoomBy = (d: number) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + d).toFixed(2))));

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" && hasPrev) { e.preventDefault(); onIndex(index - 1); }
    else if (e.key === "ArrowRight" && hasNext) { e.preventDefault(); onIndex(index + 1); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(ZOOM_STEP); }
    else if (e.key === "-") { e.preventDefault(); zoomBy(-ZOOM_STEP); }
  };

  // Drag to move about a zoomed page. The pointer travels in screen px and the
  // scroll box counts in the page's own (`zoom: 1.12`) — see zoomScale.
  const panStart = (e: MouseEvent) => {
    const el = stageRef.current;
    if (!el) return;
    drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    e.preventDefault();
  };
  const panMove = (e: MouseEvent) => {
    const el = stageRef.current;
    if (!el || !drag.current) return;
    const k = zoomScale(el);
    el.scrollLeft = drag.current.sl - (e.clientX - drag.current.x) / k;
    el.scrollTop = drag.current.st - (e.clientY - drag.current.y) / k;
  };
  const panEnd = () => { drag.current = null; };

  const tool: CSSProperties = {
    minWidth: 30, height: 30, padding: "0 8px", borderRadius: 7, border: `1px solid ${C.n[200]}`,
    background: C.n[0], color: C.n[800], fontSize: 15, lineHeight: 1, cursor: "pointer", fontFamily: font,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  };
  const side = (enabled: boolean): CSSProperties => ({
    position: "absolute", top: "50%", transform: "translateY(-50%)", width: 36, height: 56, borderRadius: 10,
    border: `1px solid ${C.n[200]}`, background: C.n[0], color: C.n[800], fontSize: 22, lineHeight: 1,
    cursor: enabled ? "pointer" : "default", opacity: enabled ? 0.92 : 0.35, fontFamily: font, zIndex: 2,
    display: "flex", alignItems: "center", justifyContent: "center",
  });

  return (
    <div
      ref={paneRef}
      role="region"
      aria-label="Report image viewer"
      tabIndex={-1}
      onKeyDown={onKey}
      className="invViewer"
      style={{ flex: "0 1 46%", minWidth: 0, display: "flex", flexDirection: "column", borderLeft: `0.5px solid ${C.n[200]}`, background: C.n[50], outline: "none" }}
    >
      {/* Header — which test, which of its images, and the viewer's own × */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `0.5px solid ${C.n[200]}`, background: C.n[0] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.n[900], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.test} · image {item.n} of {item.of}
          </div>
          <div style={{ fontSize: 11, color: C.n[500] }}>{date}</div>
        </div>
        <button type="button" aria-label="Close the image viewer" title="Close the image viewer" onClick={onClose} style={btnClose}>×</button>
      </div>

      {/* Tools */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, padding: "8px 14px", borderBottom: `0.5px solid ${C.n[200]}`, background: C.n[0] }}>
        <button type="button" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} style={{ ...tool, ...(zoom <= ZOOM_MIN ? btnDisabled : null) }}>−</button>
        <span style={{ minWidth: 46, textAlign: "center", fontSize: 12, color: C.n[700], fontVariantNumeric: "tabular-nums" }}>{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} style={{ ...tool, ...(zoom >= ZOOM_MAX ? btnDisabled : null) }}>+</button>
        <button type="button" aria-label="Fit to the window" title="Fit to the window" onClick={() => setZoom(1)} style={{ ...tool, fontSize: 12 }}>Fit</button>
        <span style={{ width: 1, height: 20, background: C.n[200], margin: "0 4px" }} />
        <button type="button" aria-label="Rotate left" title="Rotate left" onClick={() => setRotation((r) => (r + 270) % 360)} style={tool}>↺</button>
        <button type="button" aria-label="Rotate right" title="Rotate right" onClick={() => setRotation((r) => (r + 90) % 360)} style={tool}>↻</button>
        <a href={item.url} target="_blank" rel="noreferrer" title="Open the image in a new tab" style={{ ...tool, fontSize: 12, textDecoration: "none", marginLeft: "auto" }}>Open ↗</a>
      </div>

      {/* The image. Drag to move about it once zoomed in. */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <div
          ref={stageRef}
          onMouseDown={panStart}
          onMouseMove={panMove}
          onMouseUp={panEnd}
          onMouseLeave={panEnd}
          style={{ position: "absolute", inset: 0, overflow: "auto", display: "flex", alignItems: "flex-start", padding: 12, cursor: zoom > 1 ? "grab" : "default", userSelect: "none", background: C.n[100] }}
        >
          {/* Centred by `margin: auto`, NOT `justify-content: center`: a zoomed
              image centred by its box spills out on the LEFT too, where no
              scroll reaches — the start of every line was cut off. Auto
              margins centre a narrower image and fall to 0 for a wider one. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={`${item.test} report image ${item.n} of ${item.of}`}
            draggable={false}
            style={{ width: `${zoom * 100}%`, maxWidth: "none", height: "auto", display: "block", flexShrink: 0, margin: "0 auto", transform: `rotate(${rotation}deg)`, transition: "width 0.12s, transform 0.15s" }}
          />
        </div>
        <button type="button" aria-label="Previous image" title="Previous image (←)" disabled={!hasPrev} onClick={() => hasPrev && onIndex(index - 1)} style={{ ...side(hasPrev), left: 8 }}>‹</button>
        <button type="button" aria-label="Next image" title="Next image (→)" disabled={!hasNext} onClick={() => hasNext && onIndex(index + 1)} style={{ ...side(hasNext), right: 8 }}>›</button>
      </div>

      {/* Where you are among the day's images, and each one to jump to */}
      <div style={{ padding: "8px 14px 12px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[0] }}>
        <div style={{ textAlign: "center", fontSize: 12, color: C.n[600], marginBottom: 6 }}>{index + 1} / {items.length}</div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {items.map((it, i) => (
            <button
              key={it.key}
              type="button"
              aria-label={`${it.test}, image ${it.n} of ${it.of}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => onIndex(i)}
              title={`${it.test} · image ${it.n} of ${it.of}`}
              style={{ ...btnSecondary("sm"), flexShrink: 0, width: 52, height: 52, minHeight: 52, padding: 0, overflow: "hidden", border: `2px solid ${i === index ? C.pri[400] : C.n[200]}`, borderRadius: 8 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
