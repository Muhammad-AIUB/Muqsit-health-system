import { describe, expect, it } from "vitest";
import {
  adviceLinesFor,
  diagnosisAdviceLines,
  diagnosisKey,
  diagnosisOwner,
  drugKeyOf,
  genericKey,
  savedAdviceForDiagnosis,
  offKey,
  padMedicines,
  rxAdviceLines,
  savedAdviceFor,
  syncRxAdvice,
  type DrugAdvice,
} from "./rxDrugAdvice";

const med = (label: string, lines: string[]): DrugAdvice => ({ id: label, scope: "medicine", key: drugKeyOf(label), label, lines });
const gen = (label: string, lines: string[]): DrugAdvice => ({ id: label, scope: "generic", key: genericKey(label), label, lines });
const dx = (label: string, lines: string[]): DrugAdvice => ({ id: `dx-${label}`, scope: "diagnosis", key: diagnosisKey(label), label, lines });

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
    expect(rxAdviceLines([napa], saved, []).map((d) => d.line)).toEqual(["Tablet. Napa 500 mg: Take after meal", "Tablet. Napa 500 mg: Do not exceed 8 tablets a day"]);
  });

  it("drops a line unticked for that medicine only", () => {
    const off = [offKey(drugKeyOf(napa.drug), "Do not exceed 8 tablets a day")];
    expect(rxAdviceLines([napa], saved, off).map((d) => d.line)).toEqual(["Tablet. Napa 500 mg: Take after meal"]);
    // Ace still asks for it through the group — under its own name.
    expect(rxAdviceLines([napa, ace], saved, off).map((d) => d.line)).toEqual([
      "Tablet. Napa 500 mg: Take after meal",
      "Tablet. Ace 500 mg: Do not exceed 8 tablets a day",
      "Tablet. Ace 500 mg: Take after meal",
    ]);
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

// ⚕️ Advice per FINAL DIAGNOSIS (physician's sheet, 15/10/2026, item 4): "Je je
// advice likhbe auto add hobe pregnant diagnosis a add korar sathe sathe … osudh
// er advice and final diagnosis er advice prescription er advice a por por
// thakbe." The doctor writes a diagnosis's advice once, in the same ••• box the
// medicines have; it joins the visit's Advice the moment that diagnosis is
// written, and the medicines' advice and the diagnoses' advice stand one after
// the other there. Every word is the doctor's own — nothing here writes advice.
describe("advice for a final diagnosis", () => {
  const pregnant = dx("Pregnant", ["Take folic acid daily", "Avoid raw papaya"]);

  it("is matched by the diagnosis as written, case and spacing aside", () => {
    expect(savedAdviceForDiagnosis("pregnant", [pregnant])).toBe(pregnant);
    expect(savedAdviceForDiagnosis("  PREGNANT ", [pregnant])).toBe(pregnant);
    // Another wording is another diagnosis: nothing is guessed from part of it.
    expect(savedAdviceForDiagnosis("Pregnant 32 weeks", [pregnant])).toBeNull();
    expect(savedAdviceForDiagnosis("Not pregnant", [pregnant])).toBeNull();
  });

  it("is never taken from a medicine's or a generic's advice of the same name", () => {
    expect(savedAdviceForDiagnosis("Paracetamol", [gen("Paracetamol", ["Max 4 g a day"])])).toBeNull();
    expect(savedAdviceFor({ drug: "Pregnant", generic: "Pregnant" }, [pregnant])).toEqual({ medicine: null, generic: null });
  });

  it("lists each diagnosis's lines in the order the diagnoses are written, each under its own name", () => {
    const cHB = dx("CHB", ["Avoid alcohol", "Take folic acid daily"]);
    expect(diagnosisAdviceLines(["Pregnant", "URTI", "CHB"], [pregnant, cHB], []).map((l) => l.line)).toEqual([
      "Pregnant: Take folic acid daily",
      "Pregnant: Avoid raw papaya",
      "CHB: Avoid alcohol",
      "CHB: Take folic acid daily",
    ]);
  });

  it("drops a line unticked for that diagnosis this visit", () => {
    const off = [offKey(diagnosisOwner("Pregnant"), "Avoid raw papaya")];
    expect(diagnosisAdviceLines(["Pregnant"], [pregnant], off).map((l) => l.line)).toEqual(["Pregnant: Take folic acid daily"]);
  });

  it("an unticked diagnosis line is not unticked for a medicine with the same line", () => {
    const off = [offKey(diagnosisOwner("Pregnant"), "Take folic acid daily")];
    const lines = adviceLinesFor([napa], ["Pregnant"], [med(napa.drug, ["Take folic acid daily"]), pregnant], off).map((l) => l.line);
    expect(lines).toContain("Tablet. Napa 500 mg: Take folic acid daily");
  });

  it("the medicines' advice comes first, then the diagnoses'", () => {
    const lines = adviceLinesFor([napa], ["Pregnant"], [pregnant, med(napa.drug, ["Take after meal"])], []);
    expect(lines.map((l) => l.line)).toEqual(["Tablet. Napa 500 mg: Take after meal", "Pregnant: Take folic acid daily", "Pregnant: Avoid raw papaya"]);
    expect(lines.map((l) => l.kind)).toEqual(["medicine", "diagnosis", "diagnosis"]);
  });

  it("a line both a medicine and a diagnosis ask for is written under each one's own name", () => {
    const lines = adviceLinesFor([napa], ["Pregnant"], [pregnant, med(napa.drug, ["Take folic acid daily"])], []);
    expect(lines.map((l) => [l.line, l.raw, l.kind])).toEqual([
      ["Tablet. Napa 500 mg: Take folic acid daily", "Take folic acid daily", "medicine"],
      ["Pregnant: Take folic acid daily", "Take folic acid daily", "diagnosis"],
      ["Pregnant: Avoid raw papaya", "Avoid raw papaya", "diagnosis"],
    ]);
  });

  it("joins Advice the moment the diagnosis is written, and leaves with it", () => {
    const added = syncRxAdvice(["Drink plenty of water"], [], adviceLinesFor([], ["Pregnant"], [pregnant], []));
    expect(added.advice).toEqual(["Drink plenty of water", "Pregnant: Take folic acid daily", "Pregnant: Avoid raw papaya"]);
    const gone = syncRxAdvice(added.advice, added.owned, adviceLinesFor([], [], [pregnant], []));
    expect(gone.advice).toEqual(["Drink plenty of water"]);
  });

  it("⚕️ a diagnosis written BEFORE the medicine still prints after the medicine's advice", () => {
    const saved = [pregnant, med(napa.drug, ["Take after meal"])];
    const first = syncRxAdvice([], [], adviceLinesFor([], ["Pregnant"], saved, []));
    expect(first.advice).toEqual(["Pregnant: Take folic acid daily", "Pregnant: Avoid raw papaya"]);
    const then = syncRxAdvice(first.advice, first.owned, adviceLinesFor([napa], ["Pregnant"], saved, []));
    expect(then.advice).toEqual(["Tablet. Napa 500 mg: Take after meal", "Pregnant: Take folic acid daily", "Pregnant: Avoid raw papaya"]);
  });

  it("⚕️ the doctor's own lines never move to make room", () => {
    const saved = [pregnant, med(napa.drug, ["Take after meal"])];
    const first = syncRxAdvice([], [], adviceLinesFor([], ["Pregnant"], saved, []));
    const typed = [...first.advice.slice(0, 1), "Rest for 3 days", ...first.advice.slice(1)];
    const then = syncRxAdvice(typed, first.owned, adviceLinesFor([napa], ["Pregnant"], saved, []));
    // The typed line keeps its place; the mirror's lines are ordered among their own places.
    expect(then.advice).toEqual(["Tablet. Napa 500 mg: Take after meal", "Rest for 3 days", "Pregnant: Take folic acid daily", "Pregnant: Avoid raw papaya"]);
  });

  it("is idempotent with both kinds", () => {
    const saved = [pregnant, med(napa.drug, ["Take after meal"])];
    const derived = adviceLinesFor([napa], ["Pregnant"], saved, []);
    const once = syncRxAdvice(["a"], [], derived);
    expect(syncRxAdvice(once.advice, once.owned, derived)).toEqual({ ...once, newlyOff: [] });
  });

  it("a diagnosis line deleted from Advice by hand is unticked for that diagnosis, not put back", () => {
    const derived = adviceLinesFor([], ["Pregnant"], [pregnant], []);
    const first = syncRxAdvice([], [], derived);
    const r = syncRxAdvice(["Pregnant: Take folic acid daily"], first.owned, derived);
    expect(r.advice).toEqual(["Pregnant: Take folic acid daily"]);
    expect(r.newlyOff).toEqual([offKey(diagnosisOwner("Pregnant"), "Avoid raw papaya")]);
  });
});

// ⚕️ Physician, 24/11/2026: advice that came from a diagnosis or a medicine is
// written into Advice after that name and a colon — "PUO: ঠাণ্ডা লাগাবেন না",
// "Tablet. Unifarin 1 mg: রক্তক্ষরন হলে জানাবেন". Advice saved for a GROUP is
// written with the brand that is on the pad, so Farin shows "Farin", not Unifarin.
describe("a mirrored line is written after the name it is advice for", () => {
  it("a diagnosis: PUO: ঠাণ্ডা লাগাবেন না", () => {
    const lines = adviceLinesFor([], ["PUO"], [dx("PUO", ["ঠাণ্ডা লাগাবেন না"])], []);
    expect(lines.map((l) => l.line)).toEqual(["PUO: ঠাণ্ডা লাগাবেন না"]);
    expect(syncRxAdvice([], [], lines).advice).toEqual(["PUO: ঠাণ্ডা লাগাবেন না"]);
  });

  it("a medicine: only for this one, under its own name", () => {
    const saved = [med("Tablet. Unifarin 1 mg", ["রক্তক্ষরন হলে জানাবেন"])];
    expect(adviceLinesFor([{ drug: "Tablet. Unifarin 1 mg" }], [], saved, []).map((l) => l.line)).toEqual([
      "Tablet. Unifarin 1 mg: রক্তক্ষরন হলে জানাবেন",
    ]);
    // Another brand of the same generic gets nothing from a medicine-only note.
    expect(adviceLinesFor([{ drug: "Tablet. Farin 1 mg", generic: "Warfarin Sodium" }], [], saved, [])).toEqual([]);
  });

  it("a group: every brand on the pad, each under the brand written", () => {
    const saved = [gen("Warfarin Sodium", ["রক্তক্ষরন হলে জানাবেন"])];
    const pad = [
      { drug: "Tablet. Unifarin 1 mg", generic: "Warfarin Sodium" },
      { drug: "Tablet. Farin 1 mg", generic: "Warfarin Sodium" },
    ];
    expect(adviceLinesFor([pad[1]], [], saved, []).map((l) => l.line)).toEqual(["Tablet. Farin 1 mg: রক্তক্ষরন হলে জানাবেন"]);
    expect(adviceLinesFor(pad, [], saved, []).map((l) => l.line)).toEqual([
      "Tablet. Unifarin 1 mg: রক্তক্ষরন হলে জানাবেন",
      "Tablet. Farin 1 mg: রক্তক্ষরন হলে জানাবেন",
    ]);
  });

  it("a line deleted from Advice by hand is unticked under the doctor's saved words, not the written ones", () => {
    const derived = adviceLinesFor([], ["PUO"], [dx("PUO", ["ঠাণ্ডা লাগাবেন না"])], []);
    const first = syncRxAdvice([], [], derived);
    const r = syncRxAdvice([], first.owned, derived);
    expect(r.newlyOff).toEqual([offKey(diagnosisOwner("PUO"), "ঠাণ্ডা লাগাবেন না")]);
    // …and once unticked it is not asked for again.
    expect(adviceLinesFor([], ["PUO"], [dx("PUO", ["ঠাণ্ডা লাগাবেন না"])], r.newlyOff)).toEqual([]);
  });
});
