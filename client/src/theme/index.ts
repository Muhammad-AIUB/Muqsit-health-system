import type { ColorKey } from "@/types";

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

type Palette = Record<number, string>;

interface Colors {
  pri: Palette;
  ok: Palette;
  warn: Palette;
  danger: Palette;
  info: Palette;
  n: Palette;
}

export const C: Colors = {
  pri: { 50: "#E8F0FE", 100: "#C6DAFC", 300: "#8AB4F8", 400: "#1A73E8", 500: "#1967D2", 600: "#185ABC", 700: "#174EA6", 800: "#123C80" },
  ok: { 50: "#E1F5EE", 100: "#9FE1CB", 400: "#1D9E75", 600: "#0F6E56", 800: "#085041" },
  warn: { 50: "#FAEEDA", 100: "#FAC775", 400: "#EF9F27", 600: "#BA7517", 800: "#854F0B" },
  danger: { 50: "#FCEBEB", 100: "#F7C1C1", 400: "#E24B4A", 800: "#A32D2D" },
  info: { 50: "#E6F1FB", 100: "#B5D4F4", 400: "#378ADD", 800: "#185FA5" },
  n: { 0: "#FFF", 50: "#F8F9FA", 100: "#F1F3F4", 200: "#E3E6EA", 300: "#CDD1D6", 400: "#8E949A", 500: "#6B7075", 600: "#565A5F", 700: "#44474A", 800: "#303438", 900: "#202124" },
};

export const font = "'DM Sans', 'Outfit', system-ui, sans-serif";

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
