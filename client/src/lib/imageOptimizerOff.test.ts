// ⚠️ SECURITY PIN — 2026-10-16.
//
// Both Next apps (this one and admin/) switch the image optimizer off with
// `images: { unoptimized: true }`. Neither uses `next/image`, but `next start`
// answers `/_next/image` regardless, and on the Next 14 line that endpoint
// carries advisories with no 14.x fix — remote code execution when an AVIF
// file is optimized (GHSA-2xp9-vwfh-vxw4, critical) among them. With the
// setting on, Next answers the route with a 404 before it reads anything.
//
// Red here means the setting was dropped — as a tidy-up, or with an upgrade.
// Restore it, or confirm the installed Next is past those advisories (15.5.24+)
// and that an image is now really meant to go through the optimizer.

import { describe, expect, it } from "vitest";
import { join } from "path";

const repo = join(__dirname, "..", "..", "..");

// A plain absolute path, not `pathToFileURL(...).href`: the URL writes a space
// as %20, and Vite then looks for a folder named `Muqsit%20health%20system`
// and fails — this checkout's own path has spaces (found 2026-10-17).
const loadConfig = async (app: "client" | "admin") => {
  const mod = await import(/* @vite-ignore */ join(repo, app, "next.config.mjs"));
  return mod.default as { images?: { unoptimized?: boolean } };
};

describe("the Next image optimizer stays off", () => {
  it.each(["client", "admin"] as const)("%s/next.config.mjs sets images.unoptimized", async (app) => {
    expect((await loadConfig(app)).images?.unoptimized).toBe(true);
  });

  it("no source file uses next/image, so switching the optimizer off changes nothing on screen", async () => {
    const { readdirSync, readFileSync, statSync } = await import("fs");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(name) && /from\s+["']next\/(legacy\/)?image["']/.test(readFileSync(p, "utf8"))) offenders.push(p);
      }
    };
    for (const dir of ["client/src", "client/app", "admin/app", "admin/src"]) walk(join(repo, dir));
    expect(offenders).toEqual([]);
  });
});
