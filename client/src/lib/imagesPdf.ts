// A minimal PDF writer for the patient galleries' "Download PDF": one image per
// page, in the order given, nothing else on the page but a small footer.
//
// ⚕️ These PDFs carry a patient's prescriptions and reports, so the rules are
// the print rules: every page is the WHOLE image, scaled down to fit and never
// cropped or stretched; the order is exactly the order passed in (the order on
// screen); and every page says which of how many it is, so a missing or
// shuffled page is visible to whoever reads the file.
//
// Pure and dependency-free on purpose: images arrive already encoded as
// baseline RGB JPEG (the browser's canvas encoder), which PDF embeds as-is with
// /DCTDecode — no library needed, and nothing new for the deploy to install.

export interface PdfImagePage {
  /** JPEG bytes, 3-component RGB (what `canvas.toBlob("image/jpeg")` writes). */
  jpeg: Uint8Array;
  width: number;
  height: number;
}

// A4 in PDF points (1/72 in).
const A4_SHORT = 595.28;
const A4_LONG = 841.89;
const MARGIN = 28;
const FOOTER = 20;

/** Where an image sits on its page: whole, centred, aspect kept, never enlarged past the box. */
export function placeImage(width: number, height: number): { pageW: number; pageH: number; x: number; y: number; w: number; h: number } {
  const landscape = width > height;
  const pageW = landscape ? A4_LONG : A4_SHORT;
  const pageH = landscape ? A4_SHORT : A4_LONG;
  const boxW = pageW - 2 * MARGIN;
  const boxH = pageH - 2 * MARGIN - FOOTER;
  const scale = Math.min(boxW / width, boxH / height);
  const w = width * scale;
  const h = height * scale;
  return { pageW, pageH, x: (pageW - w) / 2, y: MARGIN + FOOTER + (boxH - h) / 2, w, h };
}

// PDF string literal: printable ASCII only, with ( ) \ escaped. Anything else
// becomes "?" — the standard Helvetica font has no glyph for it anyway.
export function pdfText(s: string): string {
  const ascii = (s ?? "").replace(/[^\x20-\x7e]/g, "?");
  return `(${ascii.replace(/([\\()])/g, "\\$1")})`;
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** Build the PDF. `footer(i, total)` gives each page's footer text (1-based i). */
export function buildImagesPdf(pages: readonly PdfImagePage[], footer: (i: number, total: number) => string): Uint8Array {
  if (!pages.length) throw new Error("No pages to write");
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array) => { chunks.push(b); length += b.length; };
  const text = (s: string) => push(enc.encode(s));

  // Object numbers: 1 catalog, 2 page tree, 3 font, then 3 per page.
  const pageObj = (i: number) => 4 + i * 3;
  const total = pages.length;
  const beginObj = (num: number) => { offsets[num] = length; text(`${num} 0 obj\n`); };

  text("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  beginObj(1); text("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObj(2);
  text(`<< /Type /Pages /Count ${total} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] >>\nendobj\n`);
  beginObj(3); text("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  pages.forEach((p, i) => {
    const pg = pageObj(i);
    const content = pg + 1;
    const img = pg + 2;
    const at = placeImage(p.width, p.height);
    const label = footer(i + 1, total);
    const stream =
      `q ${n(at.w)} 0 0 ${n(at.h)} ${n(at.x)} ${n(at.y)} cm /Im0 Do Q\n` +
      `BT /F1 9 Tf 0.4 0.4 0.4 rg ${n(MARGIN)} ${n(MARGIN)} Td ${pdfText(label)} Tj ET\n`;
    const streamBytes = enc.encode(stream);

    beginObj(pg);
    text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(at.pageW)} ${n(at.pageH)}] ` +
      `/Resources << /Font << /F1 3 0 R >> /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>\nendobj\n`);
    beginObj(content);
    text(`<< /Length ${streamBytes.length} >>\nstream\n`); push(streamBytes); text("\nendstream\nendobj\n");
    beginObj(img);
    text(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB ` +
      `/BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    push(p.jpeg); text("\nendstream\nendobj\n");
  });

  const count = 4 + total * 3;
  const xrefAt = length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  text(xref);
  text(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
