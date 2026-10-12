// @vitest-environment jsdom
//
// The "Added results" panel of the Investigation popup — the rule tested WHERE
// IT IS APPLIED.
//
// The rule itself (which stored values are one part, which are several) is
// `readFinding` in lib/findingParts.ts and has its own tests. Twice, though,
// the defect was on the panel's own line — first a pattern that fused two
// values, then a call that passed the wrong thing — and the rule's tests passed
// both times with that line broken (third review, 2026-10-12). These render the
// real popup with stored findings and read what the panel shows.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  uploadImage: vi.fn(),
}));
vi.mock("@/hooks/useActivity", () => ({ useActivityLog: () => vi.fn() }));
vi.mock("@/hooks/useInvestigationPrefs", () => ({ useInvestigationPrefs: () => ({ favourites: [], unitPrefs: {} }) }));
vi.mock("./CalcRenderer", () => ({ default: () => null }));

let ctx: Record<string, unknown>;
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));

import InvestigationPopup from "./InvestigationPopup";

vi.setConfig({ testTimeout: 30_000 });

const withFindings = (investigation: string[], over: Record<string, unknown> = {}) => ({
  showInvPopup: true, setShowInvPopup: vi.fn(),
  calDate: new Date(2026, 8, 9), setCalDate: vi.fn(), showMonthPicker: false, setShowMonthPicker: vi.fn(),
  invSearch: "", setInvSearch: vi.fn(), invActiveCat: "Hematology", setInvActiveCat: vi.fn(),
  invFormData: {}, setInvFormData: vi.fn(),
  investigation, setInvestigation: vi.fn(), invImages: {}, setInvImages: vi.fn(),
  setHiddenInvestigation: vi.fn(),
  reportImages: [], saveReportImages: vi.fn(),
  ...over,
});

afterEach(cleanup);

/** The text of each card in the panel, in order. */
const cards = () =>
  Array.from(document.querySelectorAll<HTMLElement>(".invResults > div:last-child > div")).map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim());

describe("Investigation popup — the Added results panel", () => {
  it("⚕️ shows a calculator's number, a one-box count and free text exactly as they were stored", () => {
    ctx = withFindings([
      "09/09/2026:Absolute Neutrophil Count (ANC):ANC: 1500 cells/µL — ANC 1,500 cells/µL — Normal. No significant increased risk.",
      "09/09/2026:ESR:1,50,000mm/1st hr",
      "09/09/2026:Platelet: 1,50,000",
      "09/09/2026:Platelets 1,50,000,Hb 9",
    ]);
    render(<InvestigationPopup />);
    const text = cards().join(" || ");
    expect(text).toContain("ANC 1,500 cells/µL");
    expect(text).toContain("1,50,000mm/1st hr");
    expect(text).toContain("Platelets 1,50,000,Hb 9");
    // …and never a number taken apart at its commas.
    expect(text).not.toMatch(/\d, \d{2,3}\b/);
    expect(cards()).toHaveLength(4);
  });

  it("⚕️ sets apart the parts of a test with several boxes — two values never read as one number", () => {
    ctx = withFindings([
      "09/09/2026:ETT (Treadmill):Positive,METs:10,150 bpm at peak",
      "09/09/2026:CBC:Hb:13.5g/dL,WBC:12000cells/uL",
    ]);
    render(<InvestigationPopup />);
    const text = cards().join(" || ");
    expect(text).toContain("Positive, METs:10, 150 bpm at peak");
    expect(text).toContain("Hb:13.5g/dL, WBC:12000cells/uL");
    expect(text).not.toContain("10,150");
  });

  it("the test's name stands over its value, and the date over both", () => {
    ctx = withFindings(["09/09/2026:ETT (Treadmill):Positive,METs:10"]);
    render(<InvestigationPopup />);
    const [card] = cards();
    expect(card).toMatch(/^09\/09\/2026.*ETT \(Treadmill\).*Positive, METs:10$/);
  });

  it("editing a line starts from the value as it is STORED, not as it is shown", () => {
    ctx = withFindings(["09/09/2026:ETT (Treadmill):Positive,METs:10,150 bpm at peak"]);
    render(<InvestigationPopup />);
    const edit = Array.from(document.querySelectorAll<HTMLButtonElement>(".invResults button")).find((b) => /Edit/.test(b.textContent ?? ""));
    expect(edit).toBeTruthy();
    fireEvent.click(edit as HTMLButtonElement);
    const box = document.querySelector<HTMLInputElement>(".invResults input");
    // The spaces are for reading; typed back in, they would be stored.
    expect(box?.value).toBe("Positive,METs:10,150 bpm at peak");
  });
});

describe("Investigation popup — closed from somewhere else", () => {
  // Device mirroring sets `showInvPopup` directly; the popup's own close never
  // runs. The month list's open flag lives in the store beside it.
  it("the month list does not stay open behind a popup that another device closed", () => {
    ctx = withFindings([], { showInvPopup: false, showMonthPicker: true });
    render(<InvestigationPopup />);
    expect(ctx.setShowMonthPicker).toHaveBeenCalledWith(false);
  });

  it("…and nothing is touched when there is nothing to close", () => {
    ctx = withFindings([], { showInvPopup: false, showMonthPicker: false });
    render(<InvestigationPopup />);
    expect(ctx.setShowMonthPicker).not.toHaveBeenCalled();
  });
});
