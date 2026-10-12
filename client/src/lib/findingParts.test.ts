import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isOneValue, readFinding } from "./findingParts";
import { calculateANC } from "./calculators/anc";
import { INV_CATS } from "@/data/investigations";
import type { InvTest } from "@/types";
import { configureProps } from "@/test/fc";

// A stored finding is "dd/mm/yyyy:Test:value", and a test's value is its boxes
// joined by commas with no space ("Hb:13.5g/dL,WBC:12000"). The Investigation
// popup's "Added results" panel shows the value with a space after each comma,
// to be read.
//
// ⚕️ It put that space after EVERY comma — the one inside a number too. A
// calculator's "ANC 1,500 cells/µL" was shown as "ANC 1, 500 cells/µL", and a
// platelet count typed the way it is written here, "1,50,000", as
// "1, 50, 000": a number the doctor entered, shown as three.
//
// The string alone cannot say which comma is which. A first attempt kept
// whatever LOOKED like a grouped number together, and that fused two parts into
// one number: ETT's "METs:10" beside a report beginning "150 bpm" read
// "METs:10,150 bpm" (caught in the second review, before release). So the rule
// asks the catalog instead. Only a test that HAS several boxes can hold several
// parts; everything else — a calculator's sentence, a test with one box, the
// doctor's own free text — is one value, and is shown exactly as stored.
//
// Everything here goes through `readFinding`, the one function the panel
// calls: the first version of these tests exercised the rule beside the panel,
// and passed with the panel's own line broken (third review).
configureProps(200);

const ALL: InvTest[] = INV_CATS.flatMap((c) => c.tests);
const byName = (name: string) => {
  const t = ALL.find((x) => x.name === name);
  if (!t) throw new Error(`the catalog has no test called ${name}`);
  return t;
};
// The popup's own rule for which fields are stored without their label
// (VALUE_LABELS in InvestigationPopup.tsx).
const BARE = ["Value", "Result", "Report", "Finding", "Score", "Status", "Grade"];
/** A finding stored the way the popup stores it: label, value, unit — joined by commas. */
const stored = (test: InvTest, values: (string | undefined)[], date = "09/09/2026") =>
  `${date}:${test.name}:` +
  test.fields
    .map((f, i) => (values[i] ? (BARE.includes(f.l) ? "" : f.l + ":") + values[i] + (f.u1 ?? "") : null))
    .filter((p): p is string => p !== null)
    .join(",");

describe("readFinding — how a stored finding is taken apart", () => {
  it("date, test and value", () => {
    expect(readFinding("09/09/2026:CBC:Hb:12.5g/dL")).toEqual({ date: "09/09/2026", test: "CBC", raw: "Hb:12.5g/dL", shown: "Hb:12.5g/dL" });
  });

  it("free text has a date and no test", () => {
    expect(readFinding("09/09/2026:mild pallor")).toEqual({ date: "09/09/2026", test: "", raw: "mild pallor", shown: "mild pallor" });
  });

  it("a colon inside the value belongs to the value", () => {
    expect(readFinding("09/09/2026:Absolute Neutrophil Count (ANC):ANC: 1500 cells/µL").raw).toBe("ANC: 1500 cells/µL");
  });
});

describe("a value that can only be ONE part is shown exactly as it is stored", () => {
  it("⚕️ a calculator's sentence keeps its 1,500", () => {
    const { interpretation } = calculateANC({ neutrophilsPct: 50, bandsPct: 0, wbcCount: 3 });
    expect(interpretation).toContain("ANC 1,500 cells/µL");
    const raw = `ANC: 1500 cells/µL — ${interpretation}`;
    expect(byName("Absolute Neutrophil Count (ANC)").calc).toBeTruthy();
    expect(readFinding(`09/09/2026:Absolute Neutrophil Count (ANC):${raw}`).shown).toBe(raw);
  });

  it("⚕️ a test with one box: a count typed the lakh way stays one number", () => {
    const one = ALL.find((t) => !t.calc && t.fields.length === 1 && t.fields[0].t === "num") as InvTest;
    expect(one).toBeTruthy();
    for (const typed of ["1,50,000", "12,000", "1,234,567", "১,৫০,০০০"]) {
      const item = stored(one, [typed]);
      expect(readFinding(item).shown).toBe(readFinding(item).raw);
      expect(readFinding(item).shown).toContain(typed);
    }
  });

  it("a one-box result written in words keeps the doctor's own commas", () => {
    const one = ALL.find((t) => !t.calc && t.fields.length === 1 && t.fields[0].t === "text") as InvTest;
    expect(one).toBeTruthy();
    expect(readFinding(`09/09/2026:${one.name}:clear,no focal lesion`).shown).toBe("clear,no focal lesion");
  });

  it("⚕️ the doctor's own free text is theirs — with a colon in it or not", () => {
    expect(readFinding("09/09/2026:Platelets 1,50,000,Hb 9").shown).toBe("Platelets 1,50,000,Hb 9");
    // The most natural way to type a count. The words before the colon are
    // read as a test's name, and no test is called that.
    expect(readFinding("09/09/2026:Platelet: 1,50,000")).toMatchObject({ test: "Platelet", shown: " 1,50,000" });
    expect(readFinding("09/09/2026:WBC: 12,000/cmm").shown).toBe(" 12,000/cmm");
    expect(readFinding("09/09/2026:Platelet count: 1,50,000").shown).toBe(" 1,50,000");
  });

  it("⚕️ for EVERY calculator and every one-box test in the catalog, nothing is added", () => {
    // (GCS and Child-Pugh are calculators today and are NOT in this list: they
    // had boxes once, and their older values are still set apart — below.)
    const ones = ALL.filter((t) => (t.calc || t.fields.length <= 1) && !["GCS", "Child-Pugh"].includes(t.name));
    expect(ones.length).toBeGreaterThan(500);
    for (const t of ones) {
      for (const raw of ["1,500", "ANC 1,500 cells/µL — Normal. No risk.", "a,b,c", "12,34,567/cmm"]) {
        expect(readFinding(`09/09/2026:${t.name}:${raw}`).shown, t.name).toBe(raw);
      }
    }
  });

  it("a name that appears twice in the catalog gives one answer", () => {
    const seen = new Map<string, InvTest[]>();
    for (const t of ALL) seen.set(t.name, [...(seen.get(t.name) ?? []), t]);
    const twice = [...seen].filter(([, ts]) => ts.length > 1);
    expect(twice.map(([n]) => n).sort()).toEqual(["Beta-HCG", "ECG"]);
    for (const [, ts] of twice) expect(new Set(ts.map((t) => !!t.calc || t.fields.length <= 1)).size).toBe(1);
  });
});

describe("a test with several boxes keeps the space after every comma, as it always has", () => {
  it("puts a space after the comma between two parts", () => {
    expect(readFinding("09/09/2026:CBC:Hb:13.5g/dL,WBC:12000cells/uL").shown).toBe("Hb:13.5g/dL, WBC:12000cells/uL");
  });

  it("leaves a comma that already has its space, and one that ends the text", () => {
    expect(readFinding("09/09/2026:USG:Region:Abdomen,clear, no focal lesion").shown).toBe("Region:Abdomen, clear, no focal lesion");
    expect(readFinding("09/09/2026:USG:normal,").shown).toBe("normal,");
    expect(readFinding("09/09/2026:USG:").shown).toBe("");
  });

  // The cases the first attempt got wrong: a box with no unit, then a box with
  // no label whose text begins with a number.
  it("⚕️ ETT: the METs and a report that begins with a number never read as one number", () => {
    const item = stored(byName("ETT (Treadmill)"), ["Positive", "10", "150 bpm at peak"]);
    expect(item).toBe("09/09/2026:ETT (Treadmill):Positive,METs:10,150 bpm at peak");
    expect(readFinding(item).shown).toBe("Positive, METs:10, 150 bpm at peak");
  });

  it("⚕️ Mammography: BIRADS and a measurement after it stay two values", () => {
    const item = stored(byName("Mammography"), ["Left", "4", "120 mm from nipple"]);
    expect(readFinding(item).shown).toContain("BIRADS:4, 120 mm");
  });

  it("⚕️ for EVERY test in the catalog with more than one box: no two parts are ever shown without a space between them", () => {
    const many = ALL.filter((t) => !t.calc && t.fields.length > 1);
    expect(many.length).toBeGreaterThan(40);
    for (const t of many) {
      // Every box filled with something that starts AND ends in digits — the
      // values most able to run into their neighbours. (Not all of these can be
      // typed: a list offers only its own choices. It is the joining that is
      // under test.)
      const item = stored(t, t.fields.map((_, i) => String(100 + i * 50)));
      const { raw, shown } = readFinding(item);
      const parts = raw.split(",");
      expect(parts).toHaveLength(t.fields.length);
      expect(shown, t.name).toBe(parts.join(", "));
    }
  });

  // Every test that has EVER had several boxes, in any revision of the catalog
  // (checked against all twelve in git on 2026-10-12). A stored value of one of
  // these may be box-joined parts, so none of them may ever be read as "one
  // value" — not after it is renamed, removed or turned into a calculator, as
  // GCS and Child-Pugh were on 2026-06-17. If this fails because a test left
  // this list, add its OLD name to ONCE_SEVERAL_BOXES in findingParts.ts; when
  // a new several-box test is added to the catalog, add it here.
  const EVER_SEVERAL_BOXES = [
    "ANA", "Anti-CCP", "Anti-HBs", "Anti-HCV", "Anti-dsDNA", "Anticardiolipin Ab", "Ascites Fluid", "Barium Study",
    "Beta-2 Glycoprotein-1", "Blood Culture", "Blood Group & Rh", "CBC", "COVID-19 RT-PCR", "CSF", "CT Scan",
    "Color Doppler USG", "Coombs Test", "DEXA Scan", "Dengue IgM/IgG", "ETT (Treadmill)", "Echo", "Electrolytes",
    "FibroScan", "Free PSA", "G6PD", "H. pylori", "HBsAg", "Hb Electrophoresis", "Histopathology", "IOP",
    "Immunoglobulins", "Lipid Profile", "MRI", "Malaria", "Mammography", "OGTT (75g)", "PET-CT", "Prothrombin Time",
    "Refraction", "Semen Analysis", "Slit Skin Smear", "Spirometry / PFT", "Sputum C/S", "Stool C/S", "Stool R/E",
    "TB GeneXpert", "Throat Swab C/S", "Toxoplasma", "USG", "Urine Culture", "Urine R/E", "VDRL / RPR",
    "Visual Acuity", "Visual Field (Perimetry)", "Widal", "Wound Swab C/S", "X-ray",
    // several boxes until 2026-06-17, calculators since
    "GCS", "Child-Pugh",
  ];
  it("⚕️ no test that ever had several boxes is read as one value", () => {
    for (const name of EVER_SEVERAL_BOXES) expect(isOneValue(name), name).toBe(false);
    const today = ALL.filter((t) => !t.calc && t.fields.length > 1).map((t) => t.name);
    for (const name of today) expect(EVER_SEVERAL_BOXES, `${name} has several boxes and is not in the list above`).toContain(name);
  });

  it("the older values of GCS and Child-Pugh, from when they had boxes, are set apart as they were", () => {
    expect(readFinding("09/09/2025:GCS:Eye:4/4,Verbal:5/5,Motor:6/6").shown).toBe("Eye:4/4, Verbal:5/5, Motor:6/6");
    expect(readFinding("09/09/2025:Child-Pugh:7,Class:B").shown).toBe("7, Class:B");
  });

  // DEFECT-INV-GROUPED (open, older than this file, never made worse by it):
  // in a test with SEVERAL boxes the string cannot say whether "12,000" is one
  // count or the values of two boxes, so a number typed with its groups is
  // still set apart at its commas in the "Added results" panel. The same for
  // free text that begins with such a test's exact name and a colon. The
  // record, the sidebar and the printed sheet show it as typed. Closing this
  // needs the parts to be stored apart, not a cleverer guess — see
  // FUNCTIONAL-AUDIT.md.
  it.fails("DEFECT-INV-GROUPED: a grouped number typed into a test of several boxes is shown whole", () => {
    expect(readFinding("09/09/2026:CBC:WBC:12,000cells/uL,Hb:9g/dL").shown).toBe("WBC:12,000cells/uL, Hb:9g/dL");
  });
  it.fails("DEFECT-INV-GROUPED: free text that starts with a several-box test's name keeps its numbers whole", () => {
    expect(readFinding("09/09/2026:CBC: Hb 9.5, TC 12,000, PLT 1,50,000").shown).toBe(" Hb 9.5, TC 12,000, PLT 1,50,000");
  });
});

describe("whatever it is given", () => {
  it("⚕️ it only ever ADDS spaces — no character is changed, dropped or moved", () => {
    const piece = fc.stringMatching(/^[A-Za-z0-9:.,/ %µ-]{0,24}$/);
    const name = fc.constantFrom("", "CBC", "ESR", "ETT (Treadmill)", "Absolute Neutrophil Count (ANC)", "No such test", "GCS");
    fc.assert(
      fc.property(piece, name, (value, test) => {
        const item = test ? `09/09/2026:${test}:${value}` : `09/09/2026:${value}`;
        const { date, raw, shown } = readFinding(item);
        expect(date).toBe("09/09/2026");
        expect(shown.replace(/ /g, "")).toBe(raw.replace(/ /g, ""));
        expect(shown.length).toBeGreaterThanOrEqual(raw.length);
      }),
    );
  });
});
