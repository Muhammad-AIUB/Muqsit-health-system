// @vitest-environment jsdom
//
// Night mode (physician's request, 2026-10-15). The mode is one attribute on
// <html>; the palette's variables do the rest (src/theme/palette.ts).

import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { savedTheme, setTheme, getTheme, THEME_BOOT_SCRIPT } from "./theme";

const root = () => document.documentElement;
afterEach(() => {
  setTheme("light");
  window.localStorage.clear();
});

describe("theme store", () => {
  it("night sets data-theme on <html>, light takes it away", () => {
    setTheme("dark");
    expect(root().dataset.theme).toBe("dark");
    expect(getTheme()).toBe("dark");
    setTheme("light");
    expect(root().hasAttribute("data-theme")).toBe(false);
    expect(getTheme()).toBe("light");
  });

  it("remembers the choice for that user AND as this device's last", () => {
    setTheme("dark", "u1");
    expect(window.localStorage.getItem("mhs_theme:u1")).toBe("dark");
    expect(window.localStorage.getItem("mhs_theme")).toBe("dark");
    setTheme("light", "u1");
    expect(window.localStorage.getItem("mhs_theme:u1")).toBe("light");
    expect(window.localStorage.getItem("mhs_theme")).toBe("light");
  });

  it("a user's saved mode is night only when it says so; anything else is light", () => {
    window.localStorage.setItem("mhs_theme:u1", "dark");
    window.localStorage.setItem("mhs_theme:u2", "purple");
    expect(savedTheme("u1")).toBe("dark");
    expect(savedTheme("u2")).toBe("light");
    expect(savedTheme("u3")).toBe("light");
    expect(savedTheme(undefined)).toBe("light");
  });
});

describe("what the root layout imports holds no React", () => {
  // app/layout.tsx is a SERVER component. A hook reached from it fails the
  // build ("needs useSyncExternalStore … only works in a Client Component") —
  // which the typecheck and this suite did not see, and the browser did
  // (2026-10-15). So the layout's own imports are read here.
  it("layout.tsx imports only modules with no React in them", () => {
    const root = join(__dirname, "..", "..");
    const layout = readFileSync(join(root, "app", "layout.tsx"), "utf8");
    const local = [...layout.matchAll(/from\s+"@\/([^"]+)"/g)].map((m) => m[1]).filter((p) => !p.startsWith("components/"));
    expect(local.sort()).toEqual(["lib/themeBoot", "theme/palette"]);
    for (const p of local) {
      const src = readFileSync(join(root, "src", `${p}.ts`), "utf8");
      expect(src, p).not.toMatch(/from\s+["']react["']/);
      expect(src, p).not.toMatch(/from\s+["']\.\/theme["']|from\s+["']@\/lib\/theme["']/);
    }
  });
});

describe("the script that sets the mode before the first paint", () => {
  const boot = () => new Function(THEME_BOOT_SCRIPT)();

  it("puts night on before React has drawn anything", () => {
    window.localStorage.setItem("mhs_theme", "dark");
    boot();
    expect(root().dataset.theme).toBe("dark");
  });

  it("leaves light alone, and anything unreadable is light", () => {
    window.localStorage.setItem("mhs_theme", "light");
    boot();
    expect(root().hasAttribute("data-theme")).toBe(false);
    window.localStorage.setItem("mhs_theme", "<script>");
    boot();
    expect(root().hasAttribute("data-theme")).toBe(false);
  });

  it("never throws when storage is blocked", () => {
    const orig = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    try {
      expect(boot).not.toThrow();
    } finally {
      Object.defineProperty(window, "localStorage", orig);
    }
  });
});
