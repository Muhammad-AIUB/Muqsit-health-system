import { describe, it, expect } from "vitest";
import {
  sniffImageKind,
  kindFromNameOrType,
  detectImageKind,
  needsDecode,
  imageUrlIsRenderable,
  IMAGE_ACCEPT,
  BROWSER_RENDERABLE,
  NEEDS_DECODE,
  ALL_KINDS,
  type ImageKind,
} from "./imageFormats";

// ⚕️ THE FORMAT TABLE.
//
// This is the shared table the server's `sniff()` mirrors
// (`server/src/uploads/upload.service.ts`, pinned in `upload.service.spec.ts`).
// The two sides are deliberate copies; these literals are what keeps them
// honest. A format accepted on one side and refused on the other is how a
// doctor's report gets rejected on one screen and filed on another.

const bytes = (b: number[], len = 32): Uint8Array => {
  const out = new Uint8Array(len);
  out.set(b.slice(0, len));
  return out;
};
const ascii = (s: string, len = 32): Uint8Array => {
  const out = new Uint8Array(len);
  for (let i = 0; i < s.length && i < len; i++) out[i] = s.charCodeAt(i);
  return out;
};
/** An ISO-BMFF header: 4 size bytes, "ftyp", then the 4-char brand. */
const ftyp = (brand: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set([0, 0, 0, 0x18]);
  out.set(ascii("ftyp", 4).slice(0, 4), 4);
  out.set(ascii(brand, 4).slice(0, 4), 8);
  return out;
};

const SIGNATURES: Array<[string, Uint8Array, ImageKind]> = [
  ["JPEG", bytes([0xff, 0xd8, 0xff, 0xe0]), "jpeg"],
  ["JPEG (JFIF variant)", bytes([0xff, 0xd8, 0xff, 0xdb]), "jpeg"],
  ["PNG", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "png"],
  ["GIF87a", ascii("GIF87a"), "gif"],
  ["GIF89a", ascii("GIF89a"), "gif"],
  ["BMP", bytes([0x42, 0x4d]), "bmp"],
  ["WEBP", (() => { const o = new Uint8Array(32); o.set(ascii("RIFF", 4).slice(0, 4), 0); o.set(ascii("WEBP", 4).slice(0, 4), 8); return o; })(), "webp"],
  ["AVIF", ftyp("avif"), "avif"],
  ["AVIF sequence", ftyp("avis"), "avif"],
  ["TIFF little-endian", bytes([0x49, 0x49, 0x2a, 0x00]), "tiff"],
  ["TIFF big-endian", bytes([0x4d, 0x4d, 0x00, 0x2a]), "tiff"],
];

// Every HEIF still-image brand a real iPhone emits. `hevx`, `heim`, `heis`,
// `hevm` and `hevs` were MISSING from the server check until 2026-09-20 — a
// photo in one of those read to the doctor as a corrupt file.
const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "heif", "mif1", "msf1"];

describe("sniffImageKind — the format table", () => {
  it.each(SIGNATURES)("recognises %s", (_name, buf, kind) => {
    expect(sniffImageKind(buf)).toBe(kind);
  });

  it.each(HEIF_BRANDS)("recognises the HEIF brand %s as heic", (brand) => {
    expect(sniffImageKind(ftyp(brand))).toBe("heic");
  });

  it("covers every kind the app declares", () => {
    const covered = new Set<ImageKind>([...SIGNATURES.map(([, , k]) => k), "heic"]);
    for (const kind of ALL_KINDS) expect(covered.has(kind)).toBe(true);
  });

  // ⚕️ SVG must never be storable: it is a script-bearing document, and this
  // app renders stored images inline. This is a security boundary, not a gap.
  it("refuses SVG", () => {
    expect(sniffImageKind(ascii('<svg xmlns="http://www.w3.org/2000/svg">', 48))).toBeNull();
    expect(sniffImageKind(ascii("<?xml version=\"1.0\"?><svg>", 48))).toBeNull();
  });

  it("refuses things that are not images", () => {
    expect(sniffImageKind(bytes([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBeNull(); // PDF
    expect(sniffImageKind(bytes([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // ZIP / docx
    expect(sniffImageKind(bytes([0x4d, 0x5a]))).toBeNull(); // Windows .exe
    expect(sniffImageKind(ascii("#!/bin/sh\nrm -rf /"))).toBeNull();
  });

  it("refuses a buffer too short to identify rather than guessing", () => {
    expect(sniffImageKind(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(sniffImageKind(new Uint8Array(0))).toBeNull();
  });

  it("does not mistake an unknown ftyp brand for an image", () => {
    expect(sniffImageKind(ftyp("mp42"))).toBeNull(); // a video
    expect(sniffImageKind(ftyp("qt  "))).toBeNull();
  });
});

describe("kindFromNameOrType — the fallback when bytes cannot be read", () => {
  it.each([
    ["photo.JPG", "", "jpeg"],
    ["photo.jpeg", "", "jpeg"],
    ["scan.TIF", "", "tiff"],
    ["scan.tiff", "", "tiff"],
    ["IMG_0001.HEIC", "", "heic"],
    ["IMG_0001.heif", "", "heic"],
    ["IMG_0001.hif", "", "heic"],
    ["x.png", "", "png"],
    ["x.webp", "", "webp"],
    ["x.avif", "", "avif"],
    ["x.bmp", "", "bmp"],
    ["x.gif", "", "gif"],
  ] as const)("reads %s by extension", (name, type, kind) => {
    expect(kindFromNameOrType(name, type)).toBe(kind);
  });

  // The case that made this necessary: Windows has no MIME registration for
  // HEIC, so the browser sends application/octet-stream. The old IPD panel
  // matched on `file.type` alone and called the doctor's photo "not an image".
  it("falls back to the extension when the browser sends octet-stream", () => {
    expect(kindFromNameOrType("IMG_0001.HEIC", "application/octet-stream")).toBe("heic");
    expect(kindFromNameOrType("report.tif", "application/octet-stream")).toBe("tiff");
  });

  it("uses the MIME type when the name has no usable extension", () => {
    expect(kindFromNameOrType("blob", "image/png")).toBe("png");
    expect(kindFromNameOrType("", "image/heic")).toBe("heic");
    expect(kindFromNameOrType("pasted", "image/tiff")).toBe("tiff");
  });

  it("returns null for a non-image, and for SVG", () => {
    expect(kindFromNameOrType("report.pdf", "application/pdf")).toBeNull();
    expect(kindFromNameOrType("x.svg", "image/svg+xml")).toBeNull();
    expect(kindFromNameOrType("notes.docx", "")).toBeNull();
    expect(kindFromNameOrType("", "")).toBeNull();
  });
});

describe("detectImageKind — content wins over the filename", () => {
  const fileOf = (b: Uint8Array, name: string, type = "") =>
    ({
      name,
      type,
      slice: () => ({ arrayBuffer: async () => b.buffer }),
    }) as unknown as File;

  it("reads HEIC bytes hiding under a .jpg name", async () => {
    // Ordinary: phones and chat apps rename freely. Believing the name would
    // store HEIC as .jpg and serve it as image/jpeg — undrawable.
    expect(await detectImageKind(fileOf(ftyp("heic"), "photo.jpg", "image/jpeg"))).toBe("heic");
  });

  it("reads JPEG bytes under a wrong .png name", async () => {
    expect(await detectImageKind(fileOf(bytes([0xff, 0xd8, 0xff, 0xe0]), "x.png", "image/png"))).toBe("jpeg");
  });

  it("falls back to the name when the bytes cannot be read", async () => {
    const unreadable = {
      name: "IMG_1.HEIC",
      type: "",
      slice: () => ({ arrayBuffer: async () => { throw new Error("nope"); } }),
    } as unknown as File;
    expect(await detectImageKind(unreadable)).toBe("heic");
  });
});

describe("what must be converted before upload", () => {
  it("marks exactly HEIC and TIFF as needing a decoder", () => {
    expect([...NEEDS_DECODE].sort()).toEqual(["heic", "tiff"]);
    for (const k of NEEDS_DECODE) expect(needsDecode(k)).toBe(true);
    for (const k of BROWSER_RENDERABLE) expect(needsDecode(k)).toBe(false);
    expect(needsDecode(null)).toBe(false);
  });

  it("never lists a format as both renderable and needing a decoder", () => {
    for (const k of BROWSER_RENDERABLE) expect(NEEDS_DECODE).not.toContain(k);
  });
});

describe("IMAGE_ACCEPT", () => {
  // `image/*` alone greys out .heic and .tif in the Windows file picker, so the
  // doctor cannot select their own scan at all. The extensions put them back.
  it.each([".heic", ".heif", ".tif", ".tiff"])("names %s explicitly", (ext) => {
    expect(IMAGE_ACCEPT).toContain(ext);
  });

  it("still accepts every ordinary image via image/*", () => {
    expect(IMAGE_ACCEPT).toContain("image/*");
  });
});

describe("imageUrlIsRenderable — what the chat may draw inline", () => {
  it.each([
    "https://api.example.com/uploads/a.jpg",
    "https://api.example.com/uploads/a.jpeg",
    "https://api.example.com/uploads/a.PNG",
    "https://api.example.com/uploads/a.gif",
    "https://api.example.com/uploads/a.bmp",
    "https://api.example.com/uploads/a.webp",
    "https://api.example.com/uploads/a.avif",
    "https://api.example.com/uploads/a.jpg?mhsRetry=1",
  ])("draws %s", (u) => expect(imageUrlIsRenderable(u)).toBe(true));

  // AVIF was missing from the chat's own regex, so an AVIF attachment rendered
  // as a bare link on a screen where every other image showed.
  it("draws AVIF, which the old chat regex did not", () => {
    expect(imageUrlIsRenderable("https://x/uploads/a.avif")).toBe(true);
  });

  it("refuses SVG — it carries script and must never render inline", () => {
    expect(imageUrlIsRenderable("https://x/uploads/a.svg")).toBe(false);
  });

  it.each([".pdf", ".docx", ".heic", ".tiff", ".txt", ""])(
    "does not try to draw %s",
    (ext) => expect(imageUrlIsRenderable(`https://x/uploads/a${ext}`)).toBe(false),
  );
});
