import { describe, expect, it } from "vitest";
import { resultBoxName } from "./resultBoxName";
import { INV_CATS } from "@/data/investigations";

// What a result box of the Investigation popup is called — for a screen reader,
// and for someone speaking to the computer.
//
// The number boxes had no name at all (only their unit as a placeholder, which
// goes at the first digit), and the lists and text boxes were named by their
// field alone: 671 boxes in the catalog are called "Result", 138 "Value", and
// "Organism" stands in six different cultures on one page.

describe("resultBoxName", () => {
  it("the words on screen first — field and unit, as the catalog writes them — then the test", () => {
    expect(resultBoxName("CBC", "Hb", "g/dL")).toBe("Hb (g/dL) — CBC");
    expect(resultBoxName("HBsAg", "Result")).toBe("Result — HBsAg");
    expect(resultBoxName("Blood Culture", "Organism", "")).toBe("Organism — Blood Culture");
    expect(resultBoxName("Fibrinogen", "Value", "mg/L")).toBe("Value (mg/L) — Fibrinogen");
  });

  it("changes nothing in what the catalog wrote: the unit keeps its case and its signs", () => {
    expect(resultBoxName("Absolute count", "WBC", "×10³/µL")).toBe("WBC (×10³/µL) — Absolute count");
  });

  it("⚕️ no two boxes of one category are ever called the same thing", () => {
    for (const cat of INV_CATS) {
      const names = cat.tests
        .filter((t) => !t.calc)
        .flatMap((t) => t.fields.flatMap((f) => (f.u2 ? [resultBoxName(t.name, f.l, f.u1), resultBoxName(t.name, f.l, f.u2)] : [resultBoxName(t.name, f.l, f.u1)])));
      const twice = names.filter((n, i) => names.indexOf(n) !== i);
      expect(twice, cat.cat).toEqual([]);
    }
  });

  it("every name starts with the words the box is captioned with", () => {
    for (const t of INV_CATS.flatMap((c) => c.tests)) {
      for (const f of t.fields) expect(resultBoxName(t.name, f.l, f.u1).startsWith(f.l), `${t.name} / ${f.l}`).toBe(true);
    }
  });
});
