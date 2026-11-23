"use client";

// Deters screenshots and screen recording of patient data. A web page CANNOT
// truly block them (OS tools, a phone camera), so this does two honest things:
//   1. hides the screen when focus leaves the page or a capture key is pressed;
//   2. tiles a faint watermark (who / when) so a leaked picture is traceable.
// Production only: `next dev` and the E2E run (also `next dev`) never see it.
// Printing the prescription is NOT touched — it runs in its own iframe.

import { useEffect, useState } from "react";
import { C, font } from "@/theme";
import { useOptionalAuth } from "@/context/AuthContext";
import { stamp } from "@/lib/stamp";

export function screenGuardEnabled(): boolean {
  return process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SCREEN_GUARD !== "off";
}

// Keys that start a capture. PrintScreen usually reaches the page on keyup only.
export function isCaptureKey(e: Pick<KeyboardEvent, "key" | "code" | "shiftKey" | "metaKey" | "ctrlKey">): boolean {
  if (e.key === "PrintScreen" || e.code === "PrintScreen") return true;
  if (e.metaKey && e.shiftKey && ["3", "4", "5", "6"].includes(e.key)) return true; // macOS
  if (e.metaKey && e.shiftKey && (e.key === "S" || e.key === "s")) return true; // Win+Shift+S
  return false;
}

const KEY_COVER_MS = 2500;
const TILES = 60;

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !!el.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']");
}

export default function ScreenGuard() {
  const auth = useOptionalAuth();
  const enabled = screenGuardEnabled();
  const [blurred, setBlurred] = useState(false);
  const [keyCover, setKeyCover] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cover = () => {
      setKeyCover(true);
      try { void navigator.clipboard?.writeText(""); } catch { /* clipboard is a nicety */ }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setKeyCover(false), KEY_COVER_MS);
    };
    const onKey = (e: KeyboardEvent) => { if (isCaptureKey(e)) cover(); };
    // Focus moving into an iframe (the Save & print sheet) blurs the window but
    // is not a capture: the page is still on screen and in use.
    const onBlur = () => { if (document.activeElement?.tagName !== "IFRAME") setBlurred(true); };
    const onFocus = () => setBlurred(false);
    const onVis = () => { if (document.hidden) setBlurred(true); else if (document.hasFocus()) setBlurred(false); };
    const onMenu = (e: MouseEvent) => { if (!isTypingTarget(e.target)) e.preventDefault(); };
    const onDrag = (e: Event) => { if (!isTypingTarget(e.target)) e.preventDefault(); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("contextmenu", onMenu);
    document.addEventListener("dragstart", onDrag);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("contextmenu", onMenu);
      document.removeEventListener("dragstart", onDrag);
    };
  }, [enabled]);

  if (!enabled) return null;

  const who = auth?.user ? (auth.user.displayName || auth.user.name) : "";
  const mark = `${who} · ${auth?.user?.id ?? ""} · ${stamp(new Date().toISOString())}`;
  const covered = blurred || keyCover;

  return (
    <>
      {/* No selecting text on the page; typing boxes stay normal. */}
      <style>{`
        body { -webkit-user-select: none; user-select: none; }
        input, textarea, select, [contenteditable] { -webkit-user-select: text; user-select: text; }
        @media print { [data-screen-guard] { display: none !important; } }
      `}</style>
      <div
        data-screen-guard="watermark"
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, zIndex: 2147483000, pointerEvents: "none", overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", alignContent: "space-around", opacity: 0.07, color: C.n[900], fontFamily: font, fontSize: 13, fontWeight: 600 }}
      >
        {Array.from({ length: TILES }, (_, i) => (
          <span key={i} style={{ transform: "rotate(-24deg)", whiteSpace: "nowrap", padding: "28px 8px", textAlign: "center" }}>{mark}</span>
        ))}
      </div>
      {covered && (
        <div
          data-screen-guard="cover"
          role="alert"
          style={{ position: "fixed", inset: 0, zIndex: 2147483001, background: C.n[0], color: C.n[700], fontFamily: font, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}
        >
          Patient information is hidden. Return to this window to continue.
        </div>
      )}
    </>
  );
}
