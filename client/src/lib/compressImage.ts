// ── Client-side image compression ─────────────────────────────
// Phone photos are 3–8 MB; documents/NID don't need that resolution.
// Shrinking to ≤1600px JPEG before upload makes uploads ~10x faster
// and saves server storage. Falls back to the original file if
// anything fails or compression wouldn't help.
//
// ⚕️ The fallback is NOT unconditional, and that is the safety rule here.
// Handing the original back is only safe for a format the browser can draw. For
// HEIC (every iPhone's default) and TIFF (most scanners) `createImageBitmap`
// throws, and the old blanket `catch { return file }` filed bytes into a
// patient's record that no desktop browser could ever render — a blank tile
// saying "Did not load", discovered whenever someone next needed that report.
// Those two are converted first (`lib/decodeImage.ts`), and a conversion that
// fails THROWS, so the doctor is told at upload time instead of years later.

import { detectImageKind, needsDecode, type ImageKind } from "./imageFormats";
import { decodeToJpeg } from "./decodeImage";

export async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<File> {
  const kind = await detectImageKind(file);

  // Not an image we know at all — hand it to the server, which has the final
  // say (magic bytes). Refusing here on a format the server would have taken is
  // how a working upload path quietly narrows.
  if (kind === null) return file;

  // GIFs pass through untouched: re-encoding one to JPEG keeps the first frame
  // and throws away the animation.
  if (kind === "gif") return file;

  // HEIC / TIFF: decode to JPEG first, or fail loudly. No silent pass-through.
  if (needsDecode(kind)) {
    const jpeg = await decodeToJpeg(file, kind, Math.max(quality, 0.9));
    const converted = new File([jpeg], renameTo(file.name, "jpg"), { type: "image/jpeg" });
    // Now shrink it like any other JPEG. If that step fails the CONVERTED file
    // is still a perfectly good upload, so this fallback is the safe kind.
    return (await shrink(converted, maxDim, quality)) ?? converted;
  }

  return (await shrink(file, maxDim, quality)) ?? file;
}

/** Re-encode to a JPEG no larger than `maxDim` on its long side, or null. */
async function shrink(file: File, maxDim: number, quality: number): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    // Only use the compressed version if it's actually smaller.
    if (!blob || blob.size >= file.size) return null;

    return new File([blob], renameTo(file.name, "jpg"), { type: "image/jpeg" });
  } catch {
    return null;
  }
}

/** `scan.TIFF` -> `scan.jpg`, and a name with no extension simply gains one. */
function renameTo(name: string, ext: string): string {
  const base = (name || "image").replace(/\.[^./\\]+$/, "");
  return `${base || "image"}.${ext}`;
}

export type { ImageKind };
