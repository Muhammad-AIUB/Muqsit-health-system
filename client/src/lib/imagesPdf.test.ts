import { describe, expect, it } from "vitest";
import { buildImagesPdf, pdfText, placeImage, type PdfImagePage } from "./imagesPdf";

// Fake "JPEG" bytes are fine: the writer embeds them verbatim and never decodes.
const page = (tag: string, width: number, height: number): PdfImagePage => ({ jpeg: new TextEncoder().encode(`JPEG-${tag}`), width, height });
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

describe("placing an image on its page", () => {
  it("shows the whole image, aspect kept, inside the margins", () => {
    const at = placeImage(1200, 1600); // portrait report
    expect(at.pageW).toBeLessThan(at.pageH);
    expect(at.w / at.h).toBeCloseTo(1200 / 1600, 5);
    expect(at.x).toBeGreaterThanOrEqual(28);
    expect(at.x + at.w).toBeLessThanOrEqual(at.pageW - 28 + 1e-6);
    expect(at.y + at.h).toBeLessThanOrEqual(at.pageH - 28 + 1e-6);
  });

  it("turns the page for a landscape prescription", () => {
    const at = placeImage(1600, 1100);
    expect(at.pageW).toBeGreaterThan(at.pageH);
    expect(at.w / at.h).toBeCloseTo(1600 / 1100, 5);
  });
});

describe("the PDF file", () => {
  const pdf = latin1(buildImagesPdf([page("A", 1200, 1600), page("B", 1600, 1100), page("C", 800, 800)], (i, t) => `Reports - page ${i} of ${t}`));

  it("is a PDF with one page per image", () => {
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Type /Pages /Count 3");
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(3);
  });

  it("keeps the order it was given — page n carries image n and says so", () => {
    expect(pdf.indexOf("JPEG-A")).toBeLessThan(pdf.indexOf("JPEG-B"));
    expect(pdf.indexOf("JPEG-B")).toBeLessThan(pdf.indexOf("JPEG-C"));
    expect(pdf.indexOf("(Reports - page 1 of 3)")).toBeLessThan(pdf.indexOf("(Reports - page 2 of 3)"));
    expect(pdf).toContain("(Reports - page 3 of 3)");
  });

  it("has a cross-reference table that points at every object", () => {
    const xref = pdf.slice(pdf.lastIndexOf("\nxref\n") + 1); // not the one inside "startxref"
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(3 + 3 * 3);
    offsets.forEach((o, i) => expect(pdf.slice(o, o + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    const startxref = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("refuses to write an empty file", () => {
    expect(() => buildImagesPdf([], () => "")).toThrow();
  });
});

describe("footer text", () => {
  it("escapes PDF delimiters and replaces what Helvetica cannot draw", () => {
    expect(pdfText("a (b) \\ c")).toBe("(a \\(b\\) \\\\ c)");
    expect(pdfText("রোগী 1")).toBe("(???? 1)");
  });
});
