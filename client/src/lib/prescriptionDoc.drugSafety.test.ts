import { describe, expect, it } from "vitest";
import { buildPrescriptionHtml } from "./prescriptionDoc";
import { printLines } from "./drugSafety";
import { makePrescriptionDoc, rxLine } from "@/test/fixtures";

// ⚕️ "H/O drug hypersensitivity and High-Alert Medication" on the printed sheet
// (physician's sheet, 31/10/2026: "Aita hide kora jabe na … ja likhbe airokom
// mark kora thakbe"). Printed in the clinical column right after Drug
// history's place, marked in red, every line whole; a sheet with no entry is
// byte-for-byte what it was (prescriptionDoc.snap.test.ts holds that too).

const NAPA = rxLine("Tablet. Napa 500 mg", "1+1+1", "5 days");
const block = (html: string) => {
  const at = html.indexOf('data-block="drug-safety"');
  return at < 0 ? "" : html.slice(at, html.indexOf("</ul>", at));
};
const kmax = (html: string) => Number(html.match(/data-kmax="([\d.]+)"/)![1]);

describe("prescriptionDoc — drug hypersensitivity / high-alert block", () => {
  it("is not there without an entry, and the sheet is then exactly as before", () => {
    const before = buildPrescriptionHtml(makePrescriptionDoc([NAPA]));
    expect(buildPrescriptionHtml(makePrescriptionDoc([NAPA], { drugSafety: [] }))).toBe(before);
    expect(buildPrescriptionHtml(makePrescriptionDoc([NAPA], { drugSafety: ["  "] }))).toBe(before);
    expect(before).not.toContain("drug-safety");
    expect(before).not.toContain("hypersensitivity");
  });

  it("prints every line, whole and escaped, under its title", () => {
    const lines = printLines([
      { kind: "drug", brand: "Napa", generic: "Paracetamol", hypersensitive: true, highAlert: true, text: "" },
      { kind: "text", brand: "", generic: null, hypersensitive: false, highAlert: false, text: "Patient is hypersensitive to sulphar <containing> drug" },
    ]);
    const html = buildPrescriptionHtml(makePrescriptionDoc([NAPA], { drugSafety: lines }));
    const b = block(html);
    expect(b).toContain("H/O drug hypersensitivity and High-Alert Medication");
    expect(b).toContain(">Hypersensitive to NAPA(Paracetamol)</li>");
    expect(b).toContain(">High-alert drug: NAPA(Paracetamol)</li>");
    expect(b).toContain(">Patient is hypersensitive to sulphar &lt;containing&gt; drug</li>");
  });

  it("is marked (red rule and ink) and wraps rather than cutting a line", () => {
    const html = buildPrescriptionHtml(makePrescriptionDoc([NAPA], { drugSafety: ["Hypersensitive to NAPA(Paracetamol)"] }));
    const b = block(html);
    expect(b).toMatch(/border:1px solid #b42318/);
    expect(b).toContain("overflow-wrap:anywhere");
    expect(b).not.toMatch(/text-overflow|white-space:nowrap|overflow:hidden/);
  });

  it("a very long line prints every character", () => {
    const long = `Patient is hypersensitive to ${"sulphonamide-containing ".repeat(30).trim()} drugs`;
    const html = buildPrescriptionHtml(makePrescriptionDoc([NAPA], { drugSafety: [long] }));
    expect(block(html)).toContain(long);
  });

  it("stands directly after Drug history's place — whether or not Drug history prints", () => {
    const clinical = [
      { label: "Chief complaints", items: ["Fever"] },
      { label: "Drug history", items: [] as string[] }, // ⊘ hidden
      { label: "Final diagnosis", items: ["URTI"] },
    ];
    const html = buildPrescriptionHtml(makePrescriptionDoc([NAPA], { clinical, drugSafety: ["Hypersensitive to NAPA(Paracetamol)"] }));
    const cc = html.indexOf(">Chief complaints<");
    const safety = html.indexOf('data-block="drug-safety"');
    const fd = html.indexOf(">Final diagnosis<");
    expect(cc).toBeGreaterThan(0);
    expect(safety).toBeGreaterThan(cc);
    expect(fd).toBeGreaterThan(safety);

    const shown = buildPrescriptionHtml(makePrescriptionDoc([NAPA], {
      clinical: [clinical[0], { label: "Drug history", items: ["10/01/2024: Losartan 50mg — 1+0+1 —  — "] }, clinical[2]],
      drugSafety: ["Hypersensitive to NAPA(Paracetamol)"],
    }));
    expect(shown.indexOf('data-block="drug-safety"')).toBeGreaterThan(shown.indexOf(">Drug history<"));
    expect(shown.indexOf(">Final diagnosis<")).toBeGreaterThan(shown.indexOf('data-block="drug-safety"'));
  });

  it("stands in the column on its own when nothing else clinical is written", () => {
    const html = buildPrescriptionHtml(makePrescriptionDoc([NAPA], { drugSafety: ["High-alert drug: INSULIN(Insulin)"] }));
    expect(block(html)).toContain("High-alert drug: INSULIN(Insulin)");
    expect(html).not.toContain(">Clinical<");
  });

  it("is not on the privacy copy, which carries no clinical column", () => {
    const html = buildPrescriptionHtml(makePrescriptionDoc([NAPA], { drugSafety: ["Hypersensitive to NAPA(Paracetamol)"], extraPrivacyPage: true }));
    expect(html.split('data-block="drug-safety"').length - 1).toBe(1);
  });

  it("its words bound the page-fill factor — the type never grows past a word of it", () => {
    const plain = buildPrescriptionHtml(makePrescriptionDoc([NAPA]));
    const word = "Hypersensitive to " + "X".repeat(28) + "(Paracetamol)";
    const bounded = buildPrescriptionHtml(makePrescriptionDoc([NAPA], { drugSafety: [word] }));
    expect(kmax(bounded)).toBeLessThan(kmax(plain));
    expect(kmax(bounded)).toBeGreaterThanOrEqual(1);
  });
});
