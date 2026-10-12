// @vitest-environment jsdom
//
// The result boxes that take a value in EITHER of two units (forty in the
// catalog: creatinine, bilirubin, glucose, the lipid profile, HBV DNA…).
//
// Type in one and the other is filled in for you; the doctor's preferred unit
// (Settings → Favourite & unit settings; the first unit unless they chose the
// second) is the one that is recorded.
//
// ⚕️ The conversion read as much of what was typed as LOOKED like a number, and
// converted that. A viral load typed with its groups — "1,20,000" copies/mL —
// was converted from its first group: 1 copy/mL, recorded and printed as
// "HBV DNA: 0.18IU/mL". "120,000" was recorded as 21.48 IU/mL; "1.2 x 10^5" as
// 0.21. The number on the prescription was not the number typed, and nothing
// on the screen said so (found in the fifth review, 2026-10-12; in production
// until the release that carried this). Now only a whole, plain number is
// converted — and anything else is recorded exactly as it was typed, in the
// unit of the box it was typed in.
//
// Every conversion factor here is the catalog's own (`c12` / `c21` in
// data/investigations.ts), read from it — none is written into this file.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  uploadImage: vi.fn(),
}));
vi.mock("@/hooks/useActivity", () => ({ useActivityLog: () => vi.fn() }));
const prefs = vi.hoisted(() => ({ unitPrefs: {} as Record<string, string> }));
vi.mock("@/hooks/useInvestigationPrefs", () => ({ useInvestigationPrefs: () => ({ favourites: [], unitPrefs: prefs.unitPrefs }) }));
vi.mock("./CalcRenderer", () => ({ default: () => null }));

let ctx: Record<string, unknown>;
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));

import InvestigationPopup from "./InvestigationPopup";
import { INV_CATS } from "@/data/investigations";
import { resultBoxName } from "@/lib/resultBoxName";

vi.setConfig({ testTimeout: 30_000 });

const open = (cat: string, invFormData: Record<string, string> = {}) => ({
  showInvPopup: true, setShowInvPopup: vi.fn(),
  calDate: new Date(2026, 8, 9), setCalDate: vi.fn(), showMonthPicker: false, setShowMonthPicker: vi.fn(),
  invSearch: "", setInvSearch: vi.fn(), invActiveCat: cat, setInvActiveCat: vi.fn(),
  invFormData, setInvFormData: vi.fn(),
  investigation: [], setInvestigation: vi.fn(), invImages: {}, setInvImages: vi.fn(),
  setHiddenInvestigation: vi.fn(),
  reportImages: [], saveReportImages: vi.fn(),
});

afterEach(() => { cleanup(); prefs.unitPrefs = {}; });

// The catalog's own entry for a two-unit box.
const field = (cat: string, test: string, label = "Value") => {
  const f = INV_CATS.find((c) => c.cat === cat)!.tests.find((t) => t.name === test)!.fields.find((x) => x.l === label)!;
  if (!f.u1 || !f.u2 || !f.c12 || !f.c21) throw new Error(`${test} / ${label} is not a two-unit box with both factors`);
  return { u1: f.u1, u2: f.u2, c12: f.c12, c21: f.c21 };
};
const box = (test: string, unit: string, label = "Value") => {
  const el = document.querySelector<HTMLInputElement>(`[role="dialog"] input[aria-label="${resultBoxName(test, label, unit)}"]`);
  if (!el) throw new Error(`no box for ${test} in ${unit}`);
  return el;
};
/** What a state setter was asked to do, applied to `before`. */
const applied = <T,>(setter: string, before: T): T => {
  let v = before;
  for (const [arg] of (ctx[setter] as ReturnType<typeof vi.fn>).mock.calls) v = typeof arg === "function" ? (arg as (p: T) => T)(v) : (arg as T);
  return v;
};
const typeInto = (el: HTMLInputElement, value: string) => fireEvent.change(el, { target: { value } });
const round2 = (n: number) => (Math.round(n * 100) / 100).toString();

const HBV = { cat: "LFT / Liver", test: "HBV DNA" };
const CREAT = { cat: "RFT / Renal", test: "S. Creatinine" };

describe("a two-unit result box — what typing in one unit puts in the other", () => {
  it("a plain number is converted with the catalog's own factor, in both directions, as it always was", () => {
    const f = field(HBV.cat, HBV.test);
    ctx = open(HBV.cat);
    render(<InvestigationPopup />);
    typeInto(box(HBV.test, f.u2), "120000");
    expect(applied("setInvFormData", {})).toEqual({ "HBV DNA__Value_u2": "120000", "HBV DNA__Value": round2(120000 * f.c21) });
    cleanup();

    const g = field(CREAT.cat, CREAT.test);
    ctx = open(CREAT.cat);
    render(<InvestigationPopup />);
    typeInto(box(CREAT.test, g.u1), "1.2");
    expect(applied("setInvFormData", {})).toEqual({ "S. Creatinine__Value": "1.2", "S. Creatinine__Value_u2": round2(1.2 * g.c12) });
  });

  it("…also while it is still being typed: \"12.\" on the way to 12.5 is 12", () => {
    const g = field(CREAT.cat, CREAT.test);
    ctx = open(CREAT.cat);
    render(<InvestigationPopup />);
    typeInto(box(CREAT.test, g.u1), "12.");
    expect(applied<Record<string, string>>("setInvFormData", {})["S. Creatinine__Value_u2"]).toBe(round2(12 * g.c12));
  });

  it("⚕️ a number typed with a comma is NOT converted from the part before the comma: the other box is left empty", () => {
    const f = field(HBV.cat, HBV.test);
    for (const typed of ["1,20,000", "120,000", "1,2"]) {
      ctx = open(HBV.cat);
      render(<InvestigationPopup />);
      typeInto(box(HBV.test, f.u2), typed);
      expect(applied("setInvFormData", {}), typed).toEqual({ "HBV DNA__Value_u2": typed, "HBV DNA__Value": "" });
      cleanup();

      ctx = open(HBV.cat);
      render(<InvestigationPopup />);
      typeInto(box(HBV.test, f.u1), typed);
      expect(applied("setInvFormData", {}), typed).toEqual({ "HBV DNA__Value": typed, "HBV DNA__Value_u2": "" });
      cleanup();
    }
  });

  it("⚕️ nor is anything else that only BEGINS with a number: a power of ten, a remark, a range", () => {
    const f = field(HBV.cat, HBV.test);
    for (const typed of ["1.2 x 10^5", "1.2e5", "12.5 (haemolysed)", "20-30", ">2000", "12.5.1", "-5"]) {
      ctx = open(HBV.cat);
      render(<InvestigationPopup />);
      typeInto(box(HBV.test, f.u2), typed);
      expect(applied<Record<string, string>>("setInvFormData", {})["HBV DNA__Value"], typed).toBe("");
      cleanup();
    }
  });
});

describe("a two-unit result box — what is recorded", () => {
  const record = (cat: string, test: string, unit: string, invFormData: Record<string, string>, label = "Value") => {
    ctx = open(cat, invFormData);
    render(<InvestigationPopup />);
    fireEvent.keyDown(box(test, unit, label), { key: "Enter" });
    const stored = applied<string[]>("setInvestigation", []);
    cleanup();
    return stored;
  };

  it("a plain number is recorded in the doctor's preferred unit, as it always was", () => {
    const f = field(HBV.cat, HBV.test);
    const both = { "HBV DNA__Value_u2": "120000", "HBV DNA__Value": round2(120000 * f.c21) };
    expect(record(HBV.cat, HBV.test, f.u1, both)).toEqual([`09/09/2026:HBV DNA:${round2(120000 * f.c21)}${f.u1}`]);
    prefs.unitPrefs = { "HBV DNA__Value": "u2" };
    expect(record(HBV.cat, HBV.test, f.u1, both)).toEqual([`09/09/2026:HBV DNA:120000${f.u2}`]);
  });

  it("⚕️ what could not be converted is recorded exactly as it was typed, in the unit of the box it was typed in", () => {
    const f = field(HBV.cat, HBV.test);
    // Typed in the second unit's box; the first unit is the preferred one, and its box is empty.
    expect(record(HBV.cat, HBV.test, f.u1, { "HBV DNA__Value_u2": "1,20,000", "HBV DNA__Value": "" })).toEqual([`09/09/2026:HBV DNA:1,20,000${f.u2}`]);
    // Typed in the first unit's box; the second is the preferred one, and its box is empty.
    prefs.unitPrefs = { "HBV DNA__Value": "u2" };
    expect(record(HBV.cat, HBV.test, f.u1, { "HBV DNA__Value": "1,20,000", "HBV DNA__Value_u2": "" })).toEqual([`09/09/2026:HBV DNA:1,20,000${f.u1}`]);
  });

  it("⚕️ from the keys to the record: \"1,20,000\" typed in the second unit is never stored as a number of the first", () => {
    const f = field(HBV.cat, HBV.test);
    ctx = open(HBV.cat);
    render(<InvestigationPopup />);
    typeInto(box(HBV.test, f.u2), "1,20,000");
    const typed = applied<Record<string, string>>("setInvFormData", {});
    cleanup();
    const stored = record(HBV.cat, HBV.test, f.u1, typed);
    expect(stored).toEqual([`09/09/2026:HBV DNA:1,20,000${f.u2}`]);
    expect(stored.join()).not.toContain(f.u1);
  });

  it("a box of a test with several boxes is recorded the same way, under its own name", () => {
    const f = field("Cardiology", "Lipid Profile", "TC");
    const stored = record("Cardiology", "Lipid Profile", f.u1, { "Lipid Profile__TC_u2": "5,2", "Lipid Profile__TC": "" }, "TC");
    expect(stored).toEqual([`09/09/2026:Lipid Profile:TC:5,2${f.u2}`]);
  });

  it("nothing typed is nothing recorded", () => {
    const f = field(HBV.cat, HBV.test);
    expect(record(HBV.cat, HBV.test, f.u1, { "HBV DNA__Value": "", "HBV DNA__Value_u2": "" })).toEqual([]);
    expect(record(HBV.cat, HBV.test, f.u1, {})).toEqual([]);
  });

  // "S. Creatinine: umol/L" — a unit and no value — was recorded, and would
  // have been printed, where nothing was before (sixth review, before release).
  it("⚕️ a stray space in the box of the unit that is not preferred is not recorded as a result", () => {
    const g = field(CREAT.cat, CREAT.test);
    ctx = open(CREAT.cat);
    render(<InvestigationPopup />);
    typeInto(box(CREAT.test, g.u2), " ");
    const typed = applied<Record<string, string>>("setInvFormData", {});
    cleanup();
    expect(typed).toEqual({ "S. Creatinine__Value_u2": " ", "S. Creatinine__Value": "" });
    expect(record(CREAT.cat, CREAT.test, g.u1, typed)).toEqual([]);
  });
});
