// ═══════════════════════════════════════════════════════════
// The two palettes: light (the app as it always was) and night.
//
// `C` (./index.ts) hands every component `var(--c-<hue>-<shade>, <light>)`;
// `paletteCss()` defines those variables — light under :root, night under
// html[data-theme="dark"] — and `app/layout.tsx` puts it in <head>. One source
// for both, so a stylesheet and an inline style can never disagree.
//
// Night is the physician's choice of 2026-10-15: dark GREY, not black (pure
// black under white text glares at night). Each hue keeps its one job — blue
// pressable/selected, green fine, amber attention, red danger — only its shade
// moves. What decides a night value is ./contrast.test.ts: every pair the app
// draws reaches WCAG AA in both modes.
// ═══════════════════════════════════════════════════════════

export type Hue = "pri" | "ok" | "warn" | "danger" | "info" | "n";
export type Palette = Record<Hue, Record<number, string>>;

export const LIGHT: Palette = {
  pri: { 50: "#E8F0FE", 100: "#C6DAFC", 300: "#8AB4F8", 400: "#1A73E8", 500: "#1967D2", 600: "#185ABC", 700: "#174EA6", 800: "#123C80" },
  ok: { 50: "#E1F5EE", 100: "#9FE1CB", 400: "#1D9E75", 600: "#0F6E56", 800: "#085041" },
  warn: { 50: "#FAEEDA", 100: "#FAC775", 400: "#EF9F27", 600: "#BA7517", 800: "#854F0B" },
  danger: { 50: "#FCEBEB", 100: "#F7C1C1", 400: "#E24B4A", 800: "#A32D2D" },
  info: { 50: "#E6F1FB", 100: "#B5D4F4", 400: "#378ADD", 800: "#185FA5" },
  n: { 0: "#FFF", 50: "#F8F9FA", 100: "#F1F3F4", 200: "#E3E6EA", 300: "#CDD1D6", 400: "#8E949A", 500: "#6B7075", 600: "#565A5F", 700: "#44474A", 800: "#303438", 900: "#202124" },
};

// `n` runs the other way at night: n0 is the card, n900 the text. A filled
// control (`C.pri[400]` under `C.n[0]` text) becomes dark text on a light tint,
// as Android's dark theme draws it.
export const DARK: Palette = {
  pri: { 50: "#1B2A44", 100: "#24395C", 300: "#4F7BC4", 400: "#8AB4F8", 500: "#9EC1FA", 600: "#A8C7FA", 700: "#C2D7FB", 800: "#D3E3FD" },
  ok: { 50: "#12322A", 100: "#1E5A48", 400: "#5DCAA5", 600: "#7FD9B9", 800: "#A7E8D0" },
  warn: { 50: "#3A2C12", 100: "#6B4E1C", 400: "#F2B65A", 600: "#F5C47A", 800: "#F8D49C" },
  danger: { 50: "#3D1C1C", 100: "#6E2E2E", 400: "#F28B82", 800: "#F6AEA9" },
  info: { 50: "#172C40", 100: "#234A6B", 400: "#7AB4EE", 800: "#A9CDF4" },
  n: { 0: "#1F2226", 50: "#1B1D21", 100: "#16181B", 200: "#33373C", 300: "#464B51", 400: "#80868C", 500: "#9AA0A6", 600: "#AEB4BA", 700: "#C4C9CE", 800: "#D6DADE", 900: "#E3E6EA" },
};

/** The CSS a component writes for one colour: the variable, with today's value as its fallback. */
export const tokenVar = (hue: Hue, shade: number): string => `var(--c-${hue}-${shade}, ${LIGHT[hue][shade]})`;

// Surfaces that stand off the page, and the veil behind a popup. A shadow
// barely shows on a dark page, so night uses a deeper black.
export const LIGHT_EFFECTS = {
  "shadow-card": "0 1px 2px rgba(60,64,67,0.06), 0 2px 8px rgba(60,64,67,0.05)",
  "shadow-menu": "0 1px 3px rgba(32,33,36,0.10), 0 8px 24px rgba(32,33,36,0.16)",
  "shadow-dialog": "0 2px 6px rgba(32,33,36,0.10), 0 16px 44px rgba(32,33,36,0.22)",
  scrim: "rgba(32,33,36,0.45)",
  // A see-through layer of the CARD over a card (the note's "Saving…" cover).
  "veil-surface": "rgba(255,255,255,0.75)",
  // The frosted page behind the workstation switcher.
  "veil-switch": "rgba(248,248,246,0.55)",
  // On a FILLED control (text C.n[0] on C.pri[600]): a chip, and quieter text.
  "on-fill-chip": "rgba(255,255,255,0.2)",
  "on-fill-muted": "rgba(255,255,255,0.85)",
  // Around the printed sheet's preview; the sheet itself stays white paper.
  "backdrop-print": "#f0f0f0",
} as const;
export const DARK_EFFECTS: Record<keyof typeof LIGHT_EFFECTS, string> = {
  "shadow-card": "0 1px 2px rgba(0,0,0,0.40), 0 2px 8px rgba(0,0,0,0.30)",
  "shadow-menu": "0 1px 3px rgba(0,0,0,0.50), 0 8px 24px rgba(0,0,0,0.55)",
  "shadow-dialog": "0 2px 6px rgba(0,0,0,0.50), 0 16px 44px rgba(0,0,0,0.60)",
  scrim: "rgba(0,0,0,0.60)",
  "veil-surface": "rgba(31,34,38,0.75)",
  "veil-switch": "rgba(22,24,27,0.60)",
  "on-fill-chip": "rgba(0,0,0,0.15)",
  "on-fill-muted": "rgba(31,34,38,0.80)",
  "backdrop-print": "#101113",
};
export const effectVar = (name: keyof typeof LIGHT_EFFECTS): string => `var(--c-${name}, ${LIGHT_EFFECTS[name]})`;

const block = (p: Palette, fx: Record<string, string>): string =>
  (Object.keys(p) as Hue[])
    .flatMap((hue) => Object.entries(p[hue]).map(([shade, v]) => `--c-${hue}-${shade}:${v};`))
    .concat(Object.entries(fx).map(([k, v]) => `--c-${k}:${v};`))
    .join("");

/** The variables for both modes, for a <style> in the document head. */
export function paletteCss(): string {
  return `:root{${block(LIGHT, LIGHT_EFFECTS)}color-scheme:light}html[data-theme="dark"]{${block(DARK, DARK_EFFECTS)}color-scheme:dark}`;
}
