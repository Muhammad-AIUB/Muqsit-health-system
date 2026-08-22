import { describe, expect, it } from "vitest";
import { splitDrugLabel } from "./rxShorthand";

// ⚕️ This decides which part of a medicine on the PRINTED prescription is set
// in bold. It must never change the text itself — only where the emphasis
// falls — so every case below also asserts the round-trip.
describe("splitDrugLabel", () => {
  const parts = (s: string) => {
    const { before, name, after } = splitDrugLabel(s);
    // The guarantee that makes this safe on a legal document.
    expect(before + name + after).toBe(s);
    return [before, name, after];
  };

  it("puts the brand name between the dosage form and the strength", () => {
    expect(parts("Tablet. Napa 500 mg")).toEqual(["Tablet. ", "Napa", " 500 mg"]);
    expect(parts("Capsule. Denvar 400 mg")).toEqual(["Capsule. ", "Denvar", " 400 mg"]);
    expect(parts("Tablet. Barcavir 0.5 mg")).toEqual(["Tablet. ", "Barcavir", " 0.5 mg"]);
  });

  it("keeps a multi-word dosage form, qualifier and all, out of the name", () => {
    // Enteric-coated is not plain and SC is not IV — the qualifier belongs to
    // the form, never to the name.
    expect(parts("Tablet (Enteric Coated). Pantonix 40 mg")).toEqual(["Tablet (Enteric Coated). ", "Pantonix", " 40 mg"]);
    expect(parts("SC Injection. Diasulin")).toEqual(["SC Injection. ", "Diasulin", ""]);
    expect(parts("Oral Solution. Avolac 3.35 gm/5 ml")).toEqual(["Oral Solution. ", "Avolac", " 3.35 gm/5 ml"]);
  });

  it("reads a compound strength as one trailing run", () => {
    expect(parts("Suspension. Fimoxyl 125 mg/5 ml")).toEqual(["Suspension. ", "Fimoxyl", " 125 mg/5 ml"]);
  });

  it("treats a trailing N/A as the strength, not part of the name", () => {
    // The medicines table writes N/A when no strength is recorded.
    expect(parts("Tablet. Bicozin N/A")).toEqual(["Tablet. ", "Bicozin", " N/A"]);
  });

  it("keeps a trailing letter that is part of the name", () => {
    // "Osteocal D" is the brand — there is no strength to peel off.
    expect(parts("Tablet. Osteocal D")).toEqual(["Tablet. ", "Osteocal D", ""]);
    expect(parts("Syrup. Tuscolic")).toEqual(["Syrup. ", "Tuscolic", ""]);
  });

  it("never eats the name when the brand itself starts with a digit", () => {
    // A medicine always keeps a name: the first token after the form can never
    // be read as the strength.
    expect(parts("Tablet. 5-FU 500 mg")).toEqual(["Tablet. ", "5-FU", " 500 mg"]);
  });

  it("handles the dot-less abbreviations doctors free-type", () => {
    expect(parts("tab Seclo 20 mg")).toEqual(["tab ", "Seclo", " 20 mg"]);
    expect(parts("inj Halopid")).toEqual(["inj ", "Halopid", ""]);
  });

  it("takes no form when there is none to take", () => {
    expect(parts("Napa 500 mg")).toEqual(["", "Napa", " 500 mg"]);
    // A decimal strength must not be mistaken for a dosage form's full stop.
    expect(parts("Napa 0.5 mg")).toEqual(["", "Napa", " 0.5 mg"]);
  });

  it("does not swallow a long free-typed line as a dosage form", () => {
    const s = "Take one after every meal for as long as the cough lasts. Review";
    const [before] = parts(s);
    expect(before).toBe("");
  });

  it("reports no name rather than guessing one", () => {
    // The caller falls back to emphasising the whole label.
    expect(splitDrugLabel("Tablet.")).toEqual({ before: "Tablet.", name: "", after: "" });
    expect(splitDrugLabel("")).toEqual({ before: "", name: "", after: "" });
  });

  it("preserves odd spacing exactly", () => {
    expect(parts("Tablet.   Napa    500 mg")).toEqual(["Tablet.   ", "Napa", "    500 mg"]);
    expect(parts("  Tablet. Napa 500 mg  ")).toEqual(["  Tablet. ", "Napa", " 500 mg  "]);
  });
});
