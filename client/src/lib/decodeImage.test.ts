// @vitest-environment jsdom
//
// A TIFF with an alpha channel converted to JPEG must composite onto WHITE:
// putImageData replaces pixels (no compositing), so a background fill before it
// does nothing and transparent pixels encoded as black.

import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeToJpeg, flattenOntoWhite } from "./decodeImage";

vi.mock("utif", () => ({
  default: {
    decode: () => [{ width: 2, height: 1 }],
    decodeImage: () => {},
    // pixel 1: fully transparent black; pixel 2: half-transparent black
    toRGBA8: () => new Uint8Array([0, 0, 0, 0, 0, 0, 0, 128]),
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("flattenOntoWhite", () => {
  it("turns transparent pixels white and keeps opaque ones", () => {
    expect(Array.from(flattenOntoWhite([0, 0, 0, 0, 10, 20, 30, 255]))).toEqual([255, 255, 255, 255, 10, 20, 30, 255]);
  });
  it("blends partial alpha onto white", () => {
    expect(Array.from(flattenOntoWhite([0, 0, 0, 128]))).toEqual([127, 127, 127, 255]);
  });
});

describe("decodeToJpeg — TIFF", () => {
  it("hands the canvas white-flattened pixels", async () => {
    let put: Uint8ClampedArray | null = null;
    vi.stubGlobal("ImageData", class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return realCreate(tag);
      return {
        width: 0, height: 0,
        getContext: () => ({ putImageData: (img: { data: Uint8ClampedArray }) => { put = img.data; } }),
        toBlob: (cb: (b: Blob) => void) => cb(new Blob(["j"], { type: "image/jpeg" })),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);

    const file = new File([new Uint8Array([0x49, 0x49, 0x2a, 0x00])], "scan.tif");
    await decodeToJpeg(file, "tiff");
    expect(Array.from(put!)).toEqual([255, 255, 255, 255, 127, 127, 127, 255]);
  });
});
