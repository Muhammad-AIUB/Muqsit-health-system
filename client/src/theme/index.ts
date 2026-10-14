import type { ColorKey } from "@/types";
import { LIGHT, tokenVar, type Hue } from "./palette";

// ═══════════════════════════════════════════════════════════
// Color palette + typography tokens
//
// Each hue has ONE job, and a doctor reads the job from the hue:
//
//   pri    — the brand and everything you can press or have selected
//            (buttons, links, the active tab, a ticked option). Blue.
//   ok     — "done / normal / saved / stable". Green. These are the exact
//            greens the app used as its brand before 2026-10-05, when the
//            brand moved to blue: every chip that MEANT "fine" keeps the
//            colour it always had. Never use `pri` for a status.
//   warn   — needs attention; also the ⊘ "hidden from print" amber.
//   danger — critical / contraindicated / destructive.
//   info   — passive information (Discharge, IPD badges).
//   n      — neutrals, cool grey.
//
// `warn`, `danger` and `info` are unchanged by the rebrand. Secondary text
// (`n[500]`, `n[600]`) is dark enough to pass WCAG AA (4.5:1) on white —
// the old `#999` was 2.8:1, on the lines that carry age, sex and mobile.
//
// `Palette` stays an index signature: a shade that is not defined here
// resolves to `undefined` and React drops the property. `n[400]`, `n[700]`,
// `pri[500]` and `pri[700]` were referenced for years without existing, so
// 72 "muted" labels and disabled buttons silently rendered in the parent's
// colour; they are defined now.
// ═══════════════════════════════════════════════════════════

//
// Since 2026-10-15 each value is a CSS variable (`var(--c-n-900, #202124)`):
// the hex itself lives in ./palette.ts, once for light and once for night, and
// the header's ☀/☾ switch flips which set is in force. Never write a colour as
// a literal in a component — it would not switch (src/theme/rawColours.test.ts).

type Palette = Record<number, string>;

interface Colors {
  pri: Palette;
  ok: Palette;
  warn: Palette;
  danger: Palette;
  info: Palette;
  n: Palette;
}

const tokens = (hue: Hue): Palette =>
  Object.fromEntries(Object.keys(LIGHT[hue]).map((shade) => [shade, tokenVar(hue, Number(shade))]));

export const C: Colors = {
  pri: tokens("pri"),
  ok: tokens("ok"),
  warn: tokens("warn"),
  danger: tokens("danger"),
  info: tokens("info"),
  n: tokens("n"),
};

// PAPER — the one surface night mode does not darken: rich text (the personal
// note, the printed header and footer) is written in colours a doctor chose for
// white paper and prints on white paper, so it is edited and read on white in
// both modes. Black text a doctor picked would vanish on a dark card.
export const PAPER = { background: LIGHT.n[0], color: LIGHT.n[900], muted: LIGHT.n[500] } as const;

export const font ="'DM Sans', 'Outfit', system-ui, sans-serif";

interface Swatch {
  bg: string;
  fg: string;
}

export const colorOf = (c: ColorKey | string): Swatch => {
  const map: Record<ColorKey, Swatch> = {
    pri: { bg: C.pri[50], fg: C.pri[600] },
    ok: { bg: C.ok[50], fg: C.ok[600] },
    warn: { bg: C.warn[50], fg: C.warn[800] },
    danger: { bg: C.danger[50], fg: C.danger[800] },
    info: { bg: C.info[50], fg: C.info[800] },
  };
  return map[c as ColorKey] || map.pri;
};
