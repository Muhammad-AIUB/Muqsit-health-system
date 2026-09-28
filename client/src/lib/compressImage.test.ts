// @vitest-environment jsdom
//
// JPEG has no alpha channel. A transparent PNG (a scanned report with black
// text on a transparent page) re-encoded without a background came out
// black-on-black — and replaced the original upload. jsdom has no real canvas,
// so the 2D context is a recorder: the pin is "white is painted before the
// image is drawn".

import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImage } from "./compressImage";

afterEach(() => vi.restoreAllMocks());

describe("compressImage — transparent images", () => {
  it("fills the canvas white before drawing, so transparency encodes as white", async () => {
    const calls: string[] = [];
    const ctx = {
      set fillStyle(v: string) { calls.push(`fillStyle=${v}`); },
      fillRect: (...a: number[]) => calls.push(`fillRect(${a.join(",")})`),
      drawImage: () => calls.push("drawImage"),
    };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return realCreate(tag);
      return {
        width: 0, height: 0,
        getContext: () => ctx,
        toBlob: (cb: (b: Blob) => void) => cb(new Blob(["j"], { type: "image/jpeg" })),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 20, height: 10 })));

    const png = new Uint8Array(64);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const out = await compressImage(new File([png], "report.png", { type: "image/png" }));

    expect(out.type).toBe("image/jpeg");
    expect(calls).toEqual(["fillStyle=#ffffff", "fillRect(0,0,20,10)", "drawImage"]);
    vi.unstubAllGlobals();
  });
});
