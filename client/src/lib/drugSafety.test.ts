import { describe, expect, it, vi } from "vitest";
import { brandShown, entryLines, linesForPrint, printLines, readDrugSafetyList } from "./drugSafety";

// ⚕️ The physician's own examples (sheet, 31/10/2026).
const napa = { kind: "drug" as const, brand: "Napa", generic: "Paracetamol", hypersensitive: false, highAlert: false, text: "" };

describe("drug-safety words", () => {
  it("Hypersensitive to NAPA(Paracetamol) / High-alert drug: NAPA(Paracetamol)", () => {
    expect(entryLines({ ...napa, hypersensitive: true })).toEqual(["Hypersensitive to NAPA(Paracetamol)"]);
    expect(entryLines({ ...napa, highAlert: true })).toEqual(["High-alert drug: NAPA(Paracetamol)"]);
    expect(entryLines({ ...napa, hypersensitive: true, highAlert: true })).toEqual([
      "Hypersensitive to NAPA(Paracetamol)",
      "High-alert drug: NAPA(Paracetamol)",
    ]);
  });
  it("no generic known ⇒ the brand alone; nothing guessed", () => {
    expect(entryLines({ ...napa, generic: null, hypersensitive: true })).toEqual(["Hypersensitive to NAPA"]);
  });
  it("capitals stop at the strength: a typed unit keeps its letters", () => {
    expect(brandShown("Napa Extra")).toBe("NAPA EXTRA");
    expect(brandShown("Napa 500 mg")).toBe("NAPA 500 mg");
    expect(brandShown("Insulin 100 IU/mL")).toBe("INSULIN 100 IU/mL");
  });
  it("a written line is printed exactly as typed", () => {
    const t = { ...napa, kind: "text" as const, text: "Patient is hypersensitive to sulphar containing drug" };
    expect(printLines([t])).toEqual(["Patient is hypersensitive to sulphar containing drug"]);
  });
});

describe("readDrugSafetyList", () => {
  it("reads a list, and refuses anything that is not one", () => {
    const row = { id: "e1", kind: "drug", brand: "Napa", generic: null, hypersensitive: true, highAlert: false, text: "", editable: true };
    expect(readDrugSafetyList([row])?.[0]).toMatchObject({ id: "e1", generic: null, editable: true });
    expect(readDrugSafetyList([])).toEqual([]);
    expect(readDrugSafetyList(null)).toBeNull();
    expect(readDrugSafetyList("<html>")).toBeNull();
    expect(readDrugSafetyList({ rows: [] })).toBeNull();
    expect(readDrugSafetyList([{ ...row, hypersensitive: "yes" }])).toBeNull();
    expect(readDrugSafetyList([{ ...row, kind: "other" }])).toBeNull();
  });
});

describe("linesForPrint — never 'none recorded' for a list that was not loaded", () => {
  it("prints the list it got, without asking", async () => {
    const ask = vi.fn(async () => true);
    expect(await linesForPrint(async () => ({ data: [{ ...napa, hypersensitive: true }] }), ask)).toEqual(["Hypersensitive to NAPA(Paracetamol)"]);
    expect(await linesForPrint(async () => ({ data: [] }), ask)).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
  });
  it("with no copy at all, asks; 'no' stops the print (null), 'yes' prints without it", async () => {
    const no = vi.fn(async () => false);
    expect(await linesForPrint(async () => ({ data: undefined }), no)).toBeNull();
    expect(no).toHaveBeenCalledTimes(1);
    expect(await linesForPrint(async () => { throw new Error("down"); }, async () => true)).toEqual([]);
  });
});
