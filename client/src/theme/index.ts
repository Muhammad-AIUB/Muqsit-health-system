import type { ColorKey } from "@/types";

// ═══════════════════════════════════════════════════════════
// Color palette + typography tokens
//
// NOTE: This palette intentionally mirrors the original prototype
// exactly. A few shades referenced in the UI (e.g. C.pri[300],
// C.n[400], C.n[700], C.warn[200]) were never defined in the source,
// so they resolve to `undefined` at runtime — React then omits that
// style property. The `Palette` index signature preserves this
// behavior under TypeScript instead of introducing new colors.
// ═══════════════════════════════════════════════════════════

type Palette = Record<number, string>;

interface Colors {
  pri: Palette;
  warn: Palette;
  danger: Palette;
  info: Palette;
  n: Palette;
}

export const C: Colors = {
  pri: { 50: "#E1F5EE", 100: "#9FE1CB", 400: "#1D9E75", 600: "#0F6E56", 800: "#085041" },
  warn: { 50: "#FAEEDA", 100: "#FAC775", 400: "#EF9F27", 600: "#BA7517", 800: "#854F0B" },
  danger: { 50: "#FCEBEB", 100: "#F7C1C1", 400: "#E24B4A", 800: "#A32D2D" },
  info: { 50: "#E6F1FB", 100: "#B5D4F4", 400: "#378ADD", 800: "#185FA5" },
  n: { 0: "#FFF", 50: "#F8F8F6", 100: "#EEEEEC", 200: "#E5E5E3", 300: "#D4D4D2", 500: "#999", 600: "#6B6B6B", 800: "#333", 900: "#1A1A1A" },
};

export const font = "'DM Sans', 'Outfit', system-ui, sans-serif";

interface Swatch {
  bg: string;
  fg: string;
}

export const colorOf = (c: ColorKey | string): Swatch => {
  const map: Record<ColorKey, Swatch> = {
    pri: { bg: C.pri[50], fg: C.pri[600] },
    warn: { bg: C.warn[50], fg: C.warn[800] },
    danger: { bg: C.danger[50], fg: C.danger[800] },
    info: { bg: C.info[50], fg: C.info[800] },
  };
  return map[c as ColorKey] || map.pri;
};
