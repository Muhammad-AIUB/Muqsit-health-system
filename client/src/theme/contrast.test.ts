import { describe, expect, it } from "vitest";
import { DARK, LIGHT, type Hue, type Palette } from "./palette";

// ⚕️ A number a doctor cannot read is one they will guess. Every text/background
// pair the app actually draws must reach WCAG AA (4.5:1) in BOTH modes — this is
// what decides a night value, not taste. A failure names the mode and the pair.

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const rgb = (hex: string): [number, number, number] => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

type Ref = [Hue, number];
// [text, background, what it is]
const PAIRS: [Ref, Ref, string][] = [
  [["n", 900], ["n", 0], "body text on a card"],
  [["n", 900], ["n", 50], "body text on a panel"],
  [["n", 900], ["n", 100], "body text on the page"],
  [["n", 800], ["n", 0], "strong secondary text on a card"],
  [["n", 700], ["n", 0], "secondary text on a card"],
  [["n", 600], ["n", 0], "labels on a card"],
  [["n", 600], ["n", 50], "labels on a panel"],
  [["n", 500], ["n", 0], "age / sex / mobile on a card"],
  [["n", 500], ["n", 50], "muted text on a panel"],
  [["pri", 600], ["pri", 50], "selected tab / pri chip"],
  [["ok", 600], ["ok", 50], "ok chip"],
  [["warn", 800], ["warn", 50], "warn chip"],
  [["danger", 800], ["danger", 50], "danger chip"],
  [["info", 800], ["info", 50], "info chip"],
  [["pri", 600], ["n", 0], "a link on a card"],
  [["pri", 500], ["n", 0], "a link (500) on a card"],
  [["n", 0], ["pri", 400], "text on the primary button"],
  [["n", 0], ["danger", 800], "text on the danger button"],
  [["ok", 600], ["n", 0], "'saved / normal' text on a card"],
  [["warn", 800], ["n", 0], "attention text on a card"],
  [["danger", 800], ["n", 0], "danger text on a card"],
  [["info", 800], ["n", 0], "info text on a card"],
];

const MODES: [string, Palette][] = [["light", LIGHT], ["night", DARK]];

describe("contrast — every drawn pair reaches WCAG AA in both modes", () => {
  for (const [mode, p] of MODES) {
    it.each(PAIRS)(`${mode}: %j on %j (%s)`, (fg, bg) => {
      const ratio = contrast(p[fg[0]][fg[1]], p[bg[0]][bg[1]]);
      expect(ratio, `${mode}: ${fg.join("")} on ${bg.join("")} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("the measure itself is right: black on white is 21:1, a colour on itself 1:1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#1A73E8", "#1A73E8")).toBeCloseTo(1, 5);
  });
});
