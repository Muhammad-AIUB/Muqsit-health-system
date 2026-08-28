"use client";

import { Component, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { C, font } from "@/theme";
import { rxAlertsByLine, type RxAlert, type RxAlertInput } from "@/lib/rxAlerts";
import { anchorDropdown, sameAnchor, type DropdownAnchor } from "@/lib/dropdownAnchor";
import { useMuqsit } from "@/context/MuqsitContext";

// ⚕️ The prescribing warning on the ℞ pad: ONE blinking sign, then the advice.
//
// It used to be drawn as a red bubble under each medicine as soon as a rule
// fired. The physician's decision (2026-08-28) is that the pad stays a writing
// surface: a single red sign lights up in the corner the moment ANY warned
// medicine is written — one sign however many warnings there are — and the
// advice appears, in the same red-bubble language as before, only when the
// doctor presses it.
//
// Nothing is hidden by this. The "MHS is suggesting" banner in Notifications,
// Chats & Reports still lists every alert in full at all times, and every
// warning a visit raised is still written to the activity feed on save,
// ignored or not. This is where the doctor's eye goes while writing, not the
// only place the advice exists.
//
// Same containment rules as RxAlerts.tsx, for the same reason: this renders
// INSIDE the ℞ pad, and React unmounts the whole tree on an uncaught render
// error. Losing a warning sign is survivable; losing the editor a doctor
// prescribes through is not. So:
//   · the boundary is here, and the matching runs in a CHILD of it;
//   · the fallback SAYS the check did not run, because a doctor who sees
//     nothing reads it as "no contraindication".
export default function RxPadAlerts({ input }: { input: RxAlertInput }) {
  return (
    <PadAlertBoundary>
      <PadAlertBody input={input} />
    </PadAlertBoundary>
  );
}

// ⚕️ The rule whose warning the doctor may set aside on the pad.
//
// The physician asked for it on entecavir — the drug they prescribe as Barcavir
// — and for that rule ONLY. It is keyed on the rule's own drug label, not on
// the brand typed into the pad, so every entecavir brand behaves the same:
// Barcavir and Entaliv are the same medicine and must not offer the doctor two
// different affordances. No other rule gets the button; widening this is a
// clinical decision, not a tidy-up.
const IGNORABLE_RULE_DRUGS = new Set(["Entecavir"]);

/** One warning, with the medicine (or medicines) on the pad that raised it. */
interface PadAlert {
  alert: RxAlert;
  drugs: string[];
}

export function padAlerts(input: RxAlertInput): PadAlert[] {
  const byLine = rxAlertsByLine(input);
  const out: PadAlert[] = [];
  const seen = new Map<string, PadAlert>();
  // In pad order, so the list reads down the prescription.
  for (const [idx, alerts] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    const line = input.rxDrugs?.[idx];
    const drug = (line?.text || line?.generic || "").trim();
    for (const alert of alerts) {
      const existing = seen.get(alert.id);
      // A drug-drug rule lands on both medicines: one entry, both named.
      if (existing) {
        if (drug && !existing.drugs.includes(drug)) existing.drugs.push(drug);
        continue;
      }
      const entry: PadAlert = { alert, drugs: drug ? [drug] : [] };
      seen.set(alert.id, entry);
      out.push(entry);
    }
  }
  return out;
}

/** How wide the panel would like to be, before the screen has its say. */
export const PANEL_W = 520;

/**
 * The panel hangs from the sign's RIGHT edge, so on a desktop it opens back
 * across the pad. On a phone that would put its left edge off the screen and
 * clip the advice — measured at 375px: 36px of it gone, with no scrollbar to
 * get it back. So it is placed the same way the medicine dropdown is: against
 * the viewport, through `anchorDropdown`, which pulls it inside both edges,
 * flips it above near the bottom of the screen, and trims its height to the
 * room available. The rect handed over is where the panel WANTS to start.
 */
export function panelAnchor(sign: DOMRect | { top: number; bottom: number; right: number }, vp: { width: number; height: number }) {
  const width = Math.min(PANEL_W, vp.width - 16);
  return {
    width,
    ...anchorDropdown({ top: sign.top, bottom: sign.bottom + 4, left: sign.right - width }, vp, width),
  };
}

function PadAlertBody({ input }: { input: RxAlertInput }) {
  const { ignoredAlerts, ignoreAlert } = useMuqsit();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const signRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<(DropdownAnchor & { width: number }) | null>(null);

  // Ignoring hides the warning HERE and nowhere else: the advisory in
  // "Notifications, Chats & Reports" stays up, and the visit is logged with the
  // warning either way.
  const shown = padAlerts(input).filter((p) => !ignoredAlerts.has(p.alert.id));

  // Nothing to warn about — the sign goes out, and so does the panel.
  useEffect(() => {
    if (shown.length === 0 && open) setOpen(false);
  }, [shown.length, open]);

  // Keep the open panel under its sign through a scroll or a resize. `capture`
  // catches the ℞ pad's own scroll box as well as the page's.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const measure = () => {
      const el = signRef.current;
      if (!el) return;
      const next = panelAnchor(el.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
      setPos((prev) => (prev && prev.width === next.width && sameAnchor(prev, next) ? prev : next));
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (shown.length === 0) return null;

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {/* A small solid dot rather than a thin outlined ring: at this size an
          outline and a hairline "!" read as a stray character, while a filled
          disc reads as a signal. The halo does the attracting, so the dot never
          fades below 0.4 — a warning that blinks all the way out is a warning a
          doctor can look straight past. Both stop under reduced motion; the
          dot itself stays red and visible either way. */}
      <style>{`
        @keyframes mhs-rx-alert-blink { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes mhs-rx-alert-halo {
          0% { box-shadow: 0 0 0 0 rgba(226,75,74,0.5) }
          70%, 100% { box-shadow: 0 0 0 7px rgba(226,75,74,0) }
        }
        .mhs-rx-alert-sign {
          animation: mhs-rx-alert-blink 1.3s ease-in-out infinite,
                     mhs-rx-alert-halo 1.3s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .mhs-rx-alert-sign { animation: none } }
      `}</style>
      <button
        type="button"
        ref={signRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={`${shown.length} prescribing warning${shown.length === 1 ? "" : "s"} — press to read`}
        title={`${shown.length} prescribing warning${shown.length === 1 ? "" : "s"} — press to read`}
        // 24px of button around a 15px dot: small to the eye, still a fingertip
        // target on a phone.
        style={{
          width: 24, height: 24, borderRadius: "50%", flexShrink: 0, padding: 0,
          border: "none", background: open ? C.danger[50] : "transparent",
          cursor: "pointer", fontFamily: font,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span
          aria-hidden
          className={open ? undefined : "mhs-rx-alert-sign"}
          style={{
            width: 15, height: 15, borderRadius: "50%",
            background: open ? C.danger[800] : C.danger[400], color: C.n[0],
            fontSize: 10.5, fontWeight: 700, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >!</span>
      </button>

      {open && (
        <div
          role="alert"
          style={{
            position: "fixed", top: pos?.top, bottom: pos?.bottom, left: pos?.left ?? 0,
            visibility: pos ? "visible" : "hidden", zIndex: 60,
            width: pos?.width ?? PANEL_W, maxHeight: pos?.maxHeight ?? 320, overflowY: "auto",
            background: C.n[0], border: `1.5px solid ${C.danger[400]}`, borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,0.16)", padding: "8px 12px",
            fontFamily: font, fontSize: 12, lineHeight: 1.45, color: C.danger[800],
            textAlign: "left",
          }}
        >
          {shown.map(({ alert, drugs }, i) => (
            <div key={alert.id} style={{ marginTop: i === 0 ? 0 : 8, paddingTop: i === 0 ? 0 : 8, borderTop: i === 0 ? undefined : `0.5px solid ${C.danger[100]}` }}>
              <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                <span aria-hidden style={{ flexShrink: 0 }}>⚠️</span>
                {/* Which medicine raised it — the pad no longer says so by
                    position, so it has to say so in words. */}
                <span style={{ fontWeight: 600 }}>{drugs.join(" + ")}</span>
                {IGNORABLE_RULE_DRUGS.has(alert.drug) && (
                  <button
                    type="button"
                    onClick={() => ignoreAlert(alert.id)}
                    title="Hide this warning for this prescription. It stays in the patient's log."
                    style={{
                      flexShrink: 0, marginLeft: "auto", padding: "2px 9px", borderRadius: 999,
                      border: `1px solid ${C.danger[400]}`, background: C.n[0], color: C.danger[800],
                      fontFamily: font, fontSize: 11, fontWeight: 500, cursor: "pointer", lineHeight: 1.5,
                    }}
                  >
                    Ignore Warning
                  </button>
                )}
              </div>
              {/* pre-line: a message can be a dosing table (entecavir + CKD),
                  and its line breaks are the table. See data/rxAlerts.ts. */}
              <div style={{ whiteSpace: "pre-line", marginTop: 2 }}>{alert.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

class PadAlertBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("[rx-pad-alerts] prescribing check failed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // Fails loud: silence here would read as "these medicines are fine".
    return (
      <span style={{ fontSize: 11.5, color: C.danger[800], fontFamily: font }}>
        ⚠️ Prescribing check did not run — no warning here means “not checked”.
      </span>
    );
  }
}
