"use client";

import { useEffect, useRef } from "react";

// ── "Are you sure?" and "that did not work" ───────────────────
// Moved out of app/page.tsx (16/11/2026) so the account page can ask the same way:
// confirmations and failures are drawn by the page, never `window.confirm` /
// `window.alert` (admin/CLAUDE.md).
//
// `confirm` given: a question — Cancel holds the focus, so a stray Enter keeps
// what was there; Escape and a click on the backdrop mean no. Without it: a
// message, which stays until OK and is not dismissed by a click beside it.

export interface Question { title: string; body?: string; confirm: string; danger?: boolean }

// The same colours as app/page.tsx (`C` there is hand-copied, not shared).
const C = { pri: "#1A73E8", dangerDark: "#A32D2D", border: "#E3E6EA", n600: "#565A5F", n900: "#202124", white: "#fff" };
const btnPri: React.CSSProperties = { padding: "10px 20px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "9px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.n900, fontSize: 13, fontWeight: 500, cursor: "pointer" };

export function Dialog({ title, body, confirm, danger, onAnswer }: { title: string; body?: string; confirm?: string; danger?: boolean; onAnswer: (ok: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const answer = useRef(onAnswer);
  answer.current = onAnswer;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); answer.current(false); return; }
      if (e.key !== "Tab") return;
      // Tab stays on the two buttons instead of walking into the table behind.
      const stops = Array.from(box.current?.querySelectorAll<HTMLElement>("button") ?? []);
      if (!stops.length) return;
      const at = stops.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      stops[(at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div onClick={confirm ? () => onAnswer(false) : undefined} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(32,33,36,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, whiteSpace: "normal" }}>
      <div ref={box} role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 100%)", background: C.white, borderRadius: 12, padding: 20, boxShadow: "0 2px 6px rgba(32,33,36,0.10), 0 16px 44px rgba(32,33,36,0.22)" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.n900, lineHeight: 1.35, overflowWrap: "anywhere" }}>{title}</div>
        {body && <div style={{ fontSize: 13, color: C.n600, lineHeight: 1.55, marginTop: 6, overflowWrap: "anywhere" }}>{body}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginTop: 20 }}>
          {confirm ? (
            <>
              <button type="button" autoFocus onClick={() => onAnswer(false)} style={btnGhost}>Cancel</button>
              <button type="button" onClick={() => onAnswer(true)} style={danger ? { ...btnPri, background: C.dangerDark } : btnPri}>{confirm}</button>
            </>
          ) : (
            <button type="button" autoFocus onClick={() => onAnswer(true)} style={btnPri}>OK</button>
          )}
        </div>
      </div>
    </div>
  );
}
