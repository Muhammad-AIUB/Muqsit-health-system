import { describe, expect, it } from "vitest";
import { makePrescriptionDoc } from "@/test/fixtures";
import { buildPrescriptionHtml } from "./prescriptionDoc";

// ⚕️ "Remove MHS logo" (admin Profile settings, physician's sheet 16/11/2026):
// "even prescription theke muqsit er logo chola jabe, print hobe na … developed by
// exhort thakbe". The printed sheet is a legal document, so this pins exactly what
// the setting changes — the MHS mark at the foot of every page — and what it does
// not: "By EXHORT", the signature, and every byte of the sheet when it is off.

const rx = [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "" }];
const sheet = (over: Record<string, unknown> = {}) =>
  buildPrescriptionHtml(makePrescriptionDoc(rx, { doctorName: "Dr Test", extraPrivacyPage: true, ...over }));

const MARK = '<span class="bb-mhs">MHS</span>';
const BY = '<span class="bb-by">By <img class="bb-exhort" src="exort-logo.png" alt="EXHORT" /></span>';
const count = (html: string, part: string) => html.split(part).length - 1;

describe("the MHS mark at the foot of the printed sheet", () => {
  it("is printed by default — on both pages when there is a privacy copy", () => {
    const html = sheet();
    expect(count(html, MARK)).toBe(2);
    expect(count(html, BY)).toBe(2);
  });

  it("hideMhsLogo: true takes the mark off EVERY page and leaves 'By EXHORT' on every page", () => {
    const html = sheet({ hideMhsLogo: true });
    expect(count(html, MARK)).toBe(0);
    expect(count(html, BY)).toBe(2);
    // the foot is still one block with the signature in it (a wrapped foot is not repeated)
    const foots = html.match(/<td class="pagefoot">[\s\S]*?<\/td>/g) ?? [];
    expect(foots).toHaveLength(2);
    for (const f of foots) {
      expect(f).toContain('<div class="brandbar">');
      expect(f).toContain(BY);
      expect(f).toContain('<div class="sign"><span class="line">Dr Test</span></div>');
    }
  });

  it("a single page (no privacy copy) loses its one mark too", () => {
    const html = sheet({ extraPrivacyPage: false, hideMhsLogo: true });
    expect(count(html, MARK)).toBe(0);
    expect(count(html, BY)).toBe(1);
  });

  it.each([[false], [undefined], ["true"], [1], [null]])(
    "%p is NOT a request to remove it — only the boolean true is",
    (value) => {
      const html = sheet({ hideMhsLogo: value });
      expect(count(html, MARK)).toBe(2);
    },
  );

  it("with the setting off (or never sent) the sheet is byte-for-byte what it always was", () => {
    expect(sheet({ hideMhsLogo: false })).toBe(sheet());
    expect(sheet({ hideMhsLogo: undefined })).toBe(sheet());
  });

  it("the only difference the setting makes is the mark itself (nothing else on the sheet moves)", () => {
    const off = sheet({ hideMhsLogo: true });
    const on = sheet();
    // Put the mark back into the hidden sheet at both brand bars: it is the default sheet again.
    const restored = off.split('<div class="brandbar">').join(`<div class="brandbar">\n          ${MARK}`);
    expect(restored).toBe(on);
  });

  it("the page's styles are unchanged (the .bb-mhs rule stays defined; the sheet still fits as it did)", () => {
    expect(sheet({ hideMhsLogo: true })).toContain(".bb-mhs {");
    expect(sheet({ hideMhsLogo: true })).toMatch(/\.brandbar \{[^}]*flex: 1 0 auto;/);
  });
});
