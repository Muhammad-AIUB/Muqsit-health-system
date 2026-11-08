"use client";

// The Imaging DICOM viewer (physician's sheet 07/11/2026): a full-screen window
// onto one DICOM file, drawn in the browser with the open-source `dwv` library.
// The file is fetched from OUR server and never leaves it — nothing is sent to a
// third-party viewer (RadiAnt, the sheet's example, is a Windows desktop program,
// not a web page).
//
// Tools: Window/Level (drag — brightness and contrast), Zoom (drag; wheel),
// Scroll (drag or wheel through the slices of a series), Reset, Full screen.
// `dwv` is loaded only when a file is opened: it is large and every other page
// of the app is better off without it.
//
// Compressed files (JPEG, JPEG 2000, RLE) are decoded by `dwv`'s worker; if a
// browser or the bundler cannot start them, the error is shown in words and the
// file is still downloadable from the list — never a blank screen.

import { useEffect, useRef, useState } from "react";
import { C, font } from "@/theme";
import { btnSecondary } from "@/theme/styles";
import { useDialog } from "@/lib/useDialog";

type Tool = "WindowLevel" | "ZoomAndPan" | "Scroll";
const TOOLS: { key: Tool; label: string; hint: string }[] = [
  { key: "WindowLevel", label: "Window / level", hint: "Drag to change brightness and contrast" },
  { key: "ZoomAndPan", label: "Zoom / pan", hint: "Drag to move, wheel to zoom" },
  { key: "Scroll", label: "Scroll", hint: "Drag or use the wheel to go through the slices" },
];

// The viewer's own colours: a reading room is dark in both modes, as the image
// viewer's veil is (`ImageLightbox`).
const BG = "#0b0d10";

export default function DicomViewer({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const { ref: dialogRef, ...dialog } = useDialog(true, onClose);
  const shell = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<{ setTool: (t: string) => void; resetDisplay: () => void; fitToContainer: () => void; reset: () => void } | null>(null);
  const [tool, setTool] = useState<Tool>("WindowLevel");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [full, setFull] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const dwv = await import("dwv");
        if (dead) return;
        const view = new dwv.ViewConfig("dicom-layer");
        const options = new dwv.AppOptions({ "*": [view] });
        options.tools = { WindowLevel: {}, ZoomAndPan: {}, Scroll: {} } as never;
        const app = new dwv.App();
        app.init(options);
        appRef.current = app as never;
        app.addEventListener("loadend", () => {
          if (dead) return;
          app.setTool("WindowLevel");
          setState("ready");
        });
        app.addEventListener("error", (e: { error?: { message?: string } }) => {
          if (dead) return;
          setError(e?.error?.message || "This file could not be read.");
          setState("error");
        });
        app.addEventListener("loaderror", (e: { error?: { message?: string } }) => {
          if (dead) return;
          setError(e?.error?.message || "This file could not be read.");
          setState("error");
        });
        app.loadURLs([url]);
      } catch (e) {
        if (dead) return;
        setError(e instanceof Error && e.message ? e.message : "The viewer could not start.");
        setState("error");
      }
    })();
    return () => {
      dead = true;
      try { appRef.current?.reset(); } catch { /* already torn down */ }
      appRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const on = () => { setFull(Boolean(document.fullscreenElement)); try { appRef.current?.fitToContainer(); } catch { /* not ready */ } };
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const pick = (t: Tool) => { setTool(t); try { appRef.current?.setTool(t); } catch { /* not ready */ } };
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shell.current?.requestFullscreen?.().catch(() => {});
  };

  const btn = (active: boolean): React.CSSProperties => ({
    ...btnSecondary("sm"), cursor: "pointer",
    ...(active ? { borderColor: C.pri[400], background: C.pri[50], color: C.pri[600], fontWeight: 600 } : null),
  });

  return (
    <div
      ref={(el) => { shell.current = el; (dialogRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }}
      role="dialog"
      aria-modal="true"
      aria-label={`DICOM viewer — ${title}`}
      {...dialog}
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: BG, display: "flex", flexDirection: "column", fontFamily: font }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 12px", background: C.n[0], borderBottom: `1px solid ${C.n[200]}` }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.n[900], marginRight: "auto", minWidth: 0, overflowWrap: "anywhere" }}>{title}</div>
        {TOOLS.map((t) => (
          <button key={t.key} type="button" title={t.hint} aria-pressed={tool === t.key} disabled={state !== "ready"} onClick={() => pick(t.key)} style={btn(tool === t.key)}>{t.label}</button>
        ))}
        <button type="button" disabled={state !== "ready"} onClick={() => { try { appRef.current?.resetDisplay(); appRef.current?.fitToContainer(); } catch { /* not ready */ } }} style={btn(false)}>Reset</button>
        <button type="button" onClick={toggleFull} style={btn(full)} aria-pressed={full}>{full ? "Exit full screen" : "Full screen"}</button>
        <button type="button" onClick={onClose} aria-label="Close viewer" style={btn(false)}>× Close</button>
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <div id="dicom-layer" style={{ position: "absolute", inset: 0 }} />
        {state === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#d8dce2", fontSize: 14 }}>Loading the scan…</div>
        )}
        {state === "error" && (
          <div role="alert" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 10, alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color: "#d8dce2", fontSize: 14 }}>
            <div>This scan could not be opened here.</div>
            <div style={{ fontSize: 12.5, color: "#9aa1ab", maxWidth: 520, overflowWrap: "anywhere" }}>{error}</div>
            <a href={url} download style={{ color: "#8ab4f8", fontSize: 13 }}>Download the file instead</a>
          </div>
        )}
      </div>
    </div>
  );
}
