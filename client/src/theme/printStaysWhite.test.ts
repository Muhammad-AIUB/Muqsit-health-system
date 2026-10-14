// @vitest-environment jsdom
//
// ⚕️ A printout is a legal document on white paper (root CLAUDE.md, rule 4).
// Night mode darkens the APP; it must never reach what is printed. These build
// each printout with night mode ON and look for any trace of the palette.

import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPrescriptionHtml, type PrescriptionDoc } from "@/lib/prescriptionDoc";
import { personalNoteHtml } from "@/components/prescription/PersonalNote";
import { DARK } from "./palette";

const NIGHT_HEX = Object.values(DARK).flatMap((shades) => Object.values(shades)).map((h) => h.toLowerCase());
const traces = (html: string): string[] => {
  const low = html.toLowerCase();
  return [
    ...(low.includes("var(--c-") ? ["var(--c-"] : []),
    ...NIGHT_HEX.filter((h) => new RegExp(`${h}(?![0-9a-f])`).test(low)),
  ];
};

beforeEach(() => { document.documentElement.dataset.theme = "dark"; });
afterEach(() => { document.documentElement.removeAttribute("data-theme"); });

describe("night mode never reaches a printout", () => {
  it("the prescription", () => {
    const doc: PrescriptionDoc = {
      doctorName: "Dr Test",
      patient: { name: "Patient", age: "39", gender: "Male", address: "", weight: "", date: "16/08/2026", phone: "01700000000" },
      clinical: [], rx: [{ drug: "Tablet. Napa 500 mg", dose: "১+০+১", instruction: "খাবারের আগে", duration: "৭ দিন" }] as PrescriptionDoc["rx"],
      advice: [], adviceTest: [], followUp: "",
    };
    expect(traces(buildPrescriptionHtml(doc))).toEqual([]);
  });

  it("the prescription's builder takes nothing from the app's theme", () => {
    const src = readFileSync(join(__dirname, "..", "lib", "prescriptionDoc.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']@\/theme/);
  });

  it("the personal note", () => {
    const html = personalNoteHtml({ name: "Patient", age: "39", sex: "Male", mobile: "01700000000" } as Parameters<typeof personalNoteHtml>[0], "<p>Seen today</p>", "15/10/2026");
    expect(traces(html)).toEqual([]);
  });

  it("the investigation download writes its own colours, none of the app's", () => {
    const src = readFileSync(join(__dirname, "..", "components", "prescription", "InvestigationDownload.tsx"), "utf8");
    // The printable document is a template string; the app's palette would
    // appear in it as a `${C.` interpolation.
    const doc = src.slice(src.indexOf("<style>"), src.lastIndexOf("</html>"));
    expect(doc.length).toBeGreaterThan(100);
    expect(doc).not.toMatch(/\$\{C\./);
  });
});
