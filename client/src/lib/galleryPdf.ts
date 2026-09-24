// "Download PDF" for the patient's two document galleries (All prescriptions,
// All reports). Browser-only: fetches each stored image, draws it through a
// canvas and hands the pages to the pure writer in `imagesPdf.ts`.
//
// ⚕️ Three rules, each for a reason:
//  • ORDER IS THE SCREEN'S. Pages are written in exactly the order of the URLs
//    passed in, which is the gallery's order (newest first, or however the
//    doctor dragged it). Images are fetched one at a time, never raced.
//  • ALL OR NOTHING. If any image cannot be read, no PDF is made and the error
//    names its position. A file that silently skipped page 7 would be a
//    patient's record with a hole in it that nobody can see.
//  • WHAT THE SCREEN SHOWS. The image is drawn by the browser, so a phone
//    photo's EXIF rotation is baked in exactly as the gallery displays it —
//    embedding the original bytes would print it sideways in most PDF readers.

import { buildImagesPdf, type PdfImagePage } from "./imagesPdf";
import { needsDecode, sniffImageKind } from "./imageFormats";

/** Longest side, in pixels, a page image is kept at: sharp on A4, not 40 MB. */
const MAX_DIM = 2800;
const QUALITY = 0.9;

export class GalleryPdfError extends Error {
  constructor(readonly position: number, message: string) {
    super(message);
    this.name = "GalleryPdfError";
  }
}

async function toPage(url: string, position: number): Promise<PdfImagePage> {
  let blob: Blob;
  try {
    // no-store: a copy cached earlier by an <img> tag was fetched WITHOUT CORS and
    // may lack the header, so reusing it would fail. This is a rare, deliberate
    // download — one fresh request per image is the right price.
    const res = await fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    blob = await res.blob();
  } catch {
    throw new GalleryPdfError(position, `Image ${position} could not be downloaded. Check the connection and try again.`);
  }

  // HEIC / TIFF filed before uploads were converted cannot be drawn by the browser.
  const head = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  const kind = sniffImageKind(head);
  if (needsDecode(kind) && kind) {
    const { decodeToJpeg } = await import("./decodeImage");
    try {
      blob = await decodeToJpeg(new File([blob], `image-${position}`, { type: blob.type }), kind, QUALITY);
    } catch {
      throw new GalleryPdfError(position, `Image ${position} is in a format this browser cannot read.`);
    }
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new GalleryPdfError(position, `Image ${position} could not be read as an image.`);
  }
  try {
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    // A transparent PNG would otherwise turn black in JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const jpegBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!jpegBlob) throw new Error("encode failed");
    return { jpeg: new Uint8Array(await jpegBlob.arrayBuffer()), width, height };
  } catch {
    throw new GalleryPdfError(position, `Image ${position} could not be prepared for the PDF.`);
  } finally {
    bitmap.close();
  }
}

/** A filename the OS will accept; the patient's name is kept, only path characters go. */
export function pdfFileName(patientName: string, section: string, when: Date = new Date()): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim();
  const dd = String(when.getDate()).padStart(2, "0");
  const mm = String(when.getMonth() + 1).padStart(2, "0");
  const parts = [safe(patientName), safe(section), `${dd}-${mm}-${when.getFullYear()}`].filter(Boolean);
  return `${parts.join(" - ")}.pdf`;
}

/**
 * Build the PDF of `urls`, in order, and hand it to the browser as a download.
 * Throws `GalleryPdfError` (nothing is downloaded) if any image fails.
 */
export async function downloadGalleryPdf(opts: {
  urls: readonly string[];
  footerTitle: string;
  fileName: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const { urls, footerTitle, fileName, onProgress } = opts;
  const pages: PdfImagePage[] = [];
  for (let i = 0; i < urls.length; i++) {
    onProgress?.(i, urls.length);
    pages.push(await toPage(urls[i], i + 1));
  }
  onProgress?.(urls.length, urls.length);
  const bytes = buildImagesPdf(pages, (n, total) => `${footerTitle}  -  ${n} / ${total}`);
  const href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
