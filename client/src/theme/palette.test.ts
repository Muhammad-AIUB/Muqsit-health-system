import { describe, expect, it } from "vitest";
import { DARK, LIGHT, paletteCss } from "./palette";
import { C } from "./index";
import { scrim, shadowCard, shadowDialog, shadowMenu } from "./styles";

// ⚕️ Light mode is the app every doctor already knows: night mode must not move
// a single colour of it. This is today's table, copied literally — a change
// here is a change to the light app, not to night mode.
const TODAY = {
  pri: { 50: "#E8F0FE", 100: "#C6DAFC", 300: "#8AB4F8", 400: "#1A73E8", 500: "#1967D2", 600: "#185ABC", 700: "#174EA6", 800: "#123C80" },
  ok: { 50: "#E1F5EE", 100: "#9FE1CB", 400: "#1D9E75", 600: "#0F6E56", 800: "#085041" },
  warn: { 50: "#FAEEDA", 100: "#FAC775", 400: "#EF9F27", 600: "#BA7517", 800: "#854F0B" },
  danger: { 50: "#FCEBEB", 100: "#F7C1C1", 400: "#E24B4A", 800: "#A32D2D" },
  info: { 50: "#E6F1FB", 100: "#B5D4F4", 400: "#378ADD", 800: "#185FA5" },
  n: { 0: "#FFF", 50: "#F8F9FA", 100: "#F1F3F4", 200: "#E3E6EA", 300: "#CDD1D6", 400: "#8E949A", 500: "#6B7075", 600: "#565A5F", 700: "#44474A", 800: "#303438", 900: "#202124" },
};

describe("the palette", () => {
  it("light is today's palette, colour for colour", () => {
    expect(LIGHT).toEqual(TODAY);
  });

  it("night has a value for every light colour, and no other", () => {
    for (const hue of Object.keys(LIGHT) as (keyof typeof LIGHT)[]) {
      expect(Object.keys(DARK[hue]).sort()).toEqual(Object.keys(LIGHT[hue]).sort());
    }
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });

  it("night is the dark grey the physician chose, not black", () => {
    expect(DARK.n[100]).toBe("#16181B"); // the page
    expect(DARK.n[0]).toBe("#1F2226"); // a card
    expect(DARK.n[900]).toBe("#E3E6EA"); // body text
  });

  it("every C colour is a variable that falls back to its light value", () => {
    expect(C.n[900]).toBe("var(--c-n-900, #202124)");
    for (const [hue, shades] of Object.entries(C)) {
      for (const [shade, v] of Object.entries(shades as Record<string, string>)) {
        expect(v).toBe(`var(--c-${hue}-${shade}, ${(LIGHT as Record<string, Record<string, string>>)[hue][shade]})`);
      }
    }
  });

  it("shadows and the veil are variables too, light as they always were", () => {
    expect(shadowCard).toBe("var(--c-shadow-card, 0 1px 2px rgba(60,64,67,0.06), 0 2px 8px rgba(60,64,67,0.05))");
    expect(shadowMenu).toBe("var(--c-shadow-menu, 0 1px 3px rgba(32,33,36,0.10), 0 8px 24px rgba(32,33,36,0.16))");
    expect(shadowDialog).toBe("var(--c-shadow-dialog, 0 2px 6px rgba(32,33,36,0.10), 0 16px 44px rgba(32,33,36,0.22))");
    expect(scrim).toBe("var(--c-scrim, rgba(32,33,36,0.45))");
    const css = paletteCss();
    expect(css).toMatch(/html\[data-theme="dark"\]\{[^}]*--c-scrim:rgba\(0,0,0,0\.60\);/);
    expect(css).toMatch(/html\[data-theme="dark"\]\{[^}]*--c-shadow-dialog:[^;]*rgba\(0,0,0,/);
  });

  it("the stylesheet defines light at the root and night under data-theme", () => {
    const css = paletteCss();
    expect(css).toMatch(/:root\{[^}]*--c-n-900:#202124;/);
    expect(css).toMatch(/:root\{[^}]*color-scheme:light/);
    expect(css).toMatch(/html\[data-theme="dark"\]\{[^}]*--c-n-900:#E3E6EA;/);
    expect(css).toMatch(/html\[data-theme="dark"\]\{[^}]*color-scheme:dark/);
  });
});
