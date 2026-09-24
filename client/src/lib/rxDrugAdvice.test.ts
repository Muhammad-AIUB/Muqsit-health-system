import { describe, expect, it } from "vitest";
import {
  drugKeyOf,
  genericKey,
  offKey,
  padMedicines,
  rxAdviceLines,
  savedAdviceFor,
  syncRxAdvice,
  type DrugAdvice,
} from "./rxDrugAdvice";

const med = (label: string, lines: string[]): DrugAdvice => ({ id: label, scope: "medicine", key: drugKeyOf(label), label, lines });
const gen = (label: string, lines: string[]): DrugAdvice => ({ id: label, scope: "generic", key: genericKey(label), label, lines });

const napa = { drug: "Tablet. Napa 500 mg", generic: "Paracetamol" };
const ace = { drug: "Tablet. Ace 500 mg", generic: "Paracetamol" };

describe("which saved advice applies to a medicine", () => {
  it("matches the medicine through typography, never across a strength", () => {
    const saved = [med("tab napa 500mg", ["Take after meal"])];
    expect(savedAdviceFor(napa, saved).medicine?.lines).toEqual(["Take after meal"]);
    expect(savedAdviceFor({ drug: "Tablet. Napa 665 mg", generic: "Paracetamol" }, saved).medicine).toBeNull();
  });

  it("applies group advice to every brand of the generic", () => {
    const saved = [gen("Paracetamol", ["Do not exceed 8 tablets a day"])];
    expect(savedAdviceFor(ace, saved).generic?.label).toBe("Paracetamol");
  });

  it("gives a hand-typed medicine with no generic no group advice", () => {
    const saved = [gen("Paracetamol", ["x"])];
    expect(savedAdviceFor({ drug: "capjubayer" }, saved).generic).toBeNull();
  });

  it("ignores advice whose lines were cleared", () => {
    expect(savedAdviceFor(napa, [med("Tablet. Napa 500 mg", [" "])]).medicine).toBeNull();
  });
});

describe("the lines today's pad asks for", () => {
  const saved = [med("Tablet. Napa 500 mg", ["Take after meal"]), gen("Paracetamol", ["Do not exceed 8 tablets a day", "Take after meal"])];

  it("lists the medicine's own advice, then its generic's, once each", () => {
    expect(rxAdviceLines([napa], saved, []).map((d) => d.line)).toEqual(["Take after meal", "Do not exceed 8 tablets a day"]);
  });

  it("drops a line unticked for that medicine only", () => {
    const off = [offKey(drugKeyOf(napa.drug), "Do not exceed 8 tablets a day")];
    expect(rxAdviceLines([napa], saved, off).map((d) => d.line)).toEqual(["Take after meal"]);
    // Ace still asks for it through the group.
    expect(rxAdviceLines([napa, ace], saved, off).map((d) => d.line)).toEqual(["Take after meal", "Do not exceed 8 tablets a day"]);
  });

  it("reads only head medicines from the pad — no notes, no taper lines", () => {
    const meds = padMedicines([
      { drug: "bed rest", dose: "", duration: "", instruction: "", isNote: true },
      { drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "", generic: "Paracetamol" },
      { drug: "", dose: "1+0+0", duration: "3 days", instruction: "", isCont: true },
    ]);
    expect(meds).toEqual([{ drug: "Tablet. Napa 500 mg", generic: "Paracetamol" }]);
  });
});

describe("folding advice into the Advice section", () => {
  const d = (line: string, ...keys: string[]) => ({ line, drugKeys: keys.length ? keys : ["k"] });

  it("appends the pad's lines after the doctor's own and owns only those", () => {
    const r = syncRxAdvice(["Drink plenty of water"], [], [d("Take after meal")]);
    expect(r.advice).toEqual(["Drink plenty of water", "Take after meal"]);
    expect(r.owned).toEqual(["Take after meal"]);
  });

  it("withdraws its own line when the medicine leaves the pad", () => {
    const r = syncRxAdvice(["Drink plenty of water", "Take after meal"], ["Take after meal"], []);
    expect(r.advice).toEqual(["Drink plenty of water"]);
    expect(r.owned).toEqual([]);
  });

  it("NEVER removes a line the doctor typed by hand, even one that reads the same", () => {
    const first = syncRxAdvice(["Take after meal"], [], [d("Take after meal")]);
    expect(first.advice).toEqual(["Take after meal"]);
    expect(first.owned).toEqual([]); // already there by hand — not claimed
    const after = syncRxAdvice(first.advice, first.owned, []);
    expect(after.advice).toEqual(["Take after meal"]);
  });

  it("keeps a line the doctor deleted from Advice deleted, and unticks it", () => {
    const r = syncRxAdvice(["Drink plenty of water"], ["Take after meal"], [d("Take after meal", "napa", "ace")]);
    expect(r.advice).toEqual(["Drink plenty of water"]);
    expect(r.newlyOff).toEqual([offKey("napa", "Take after meal"), offKey("ace", "Take after meal")]);
  });

  it("is idempotent", () => {
    const once = syncRxAdvice(["a"], [], [d("b"), d("c")]);
    const twice = syncRxAdvice(once.advice, once.owned, [d("b"), d("c")]);
    expect(twice).toEqual({ ...once, newlyOff: [] });
  });
});
