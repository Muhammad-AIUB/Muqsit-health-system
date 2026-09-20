// ⚕️ What appears on the printed prescription. Every expectation here decides
// whether a real investigation finding reaches the paper a patient carries to
// another doctor — a red test is a clinical regression, not a formatting nit.

import { describe, it, expect } from "vitest";
import {
  allPrintable,
  isPrintableFinding,
  printableInvestigation,
  pruneHidden,
  toggleHidden,
} from "@/lib/investigationHidden";

const FINDINGS = [
  "19/09/2026:CBC:Hb 11.2 g/dL",
  "19/09/2026:CBC:[image attached]",
  "19/09/2026:Report 2",
  "19/09/2026:S. Creatinine:1.4 mg/dL",
  "21/09/2026:HbA1c:7.8 %",
];

describe("isPrintableFinding", () => {
  it("prints a real dated finding", () => {
    expect(isPrintableFinding("19/09/2026:CBC:Hb 11.2 g/dL")).toBe(true);
  });

  it("prints a finding with no date stamp", () => {
    expect(isPrintableFinding("Urine R/E normal")).toBe(true);
  });

  // An attached report is a pointer to an image, not a result. It has never
  // printed, and the hide feature must not be what starts printing it.
  it("never prints an [image attached] marker", () => {
    expect(isPrintableFinding("19/09/2026:CBC:[image attached]")).toBe(false);
    expect(isPrintableFinding("19/09/2026:CBC#2:[image attached]")).toBe(false);
  });

  it("never prints a report-pool staging row", () => {
    expect(isPrintableFinding("19/09/2026:Report 2")).toBe(false);
    expect(isPrintableFinding("19/09/2026:Report 11:something")).toBe(false);
  });

  // "Reporter's note" starts with the same letters; only `Report <n>` is pool.
  it("still prints a finding whose test name merely starts with Report", () => {
    expect(isPrintableFinding("19/09/2026:Reported by lab:normal")).toBe(true);
  });

  it("refuses blanks and non-strings rather than printing an empty bullet", () => {
    expect(isPrintableFinding("")).toBe(false);
    expect(isPrintableFinding("   ")).toBe(false);
    expect(isPrintableFinding(null)).toBe(false);
    expect(isPrintableFinding(undefined)).toBe(false);
  });
});

describe("printableInvestigation", () => {
  it("drops image markers and pool rows, exactly as the sheet always has", () => {
    expect(printableInvestigation(FINDINGS)).toEqual([
      "19/09/2026:CBC:Hb 11.2 g/dL",
      "19/09/2026:S. Creatinine:1.4 mg/dL",
      "21/09/2026:HbA1c:7.8 %",
    ]);
  });

  it("drops a hidden finding and keeps the rest, in order", () => {
    expect(printableInvestigation(FINDINGS, ["19/09/2026:S. Creatinine:1.4 mg/dL"])).toEqual([
      "19/09/2026:CBC:Hb 11.2 g/dL",
      "21/09/2026:HbA1c:7.8 %",
    ]);
  });

  // ⚕️ The mark is the exact stored string. Two findings on the same test, or
  // the same value on two dates, are separate lines and separate decisions.
  it("hides only the line it was put on, never a look-alike", () => {
    const items = ["19/09/2026:HbA1c:7.8 %", "21/09/2026:HbA1c:7.8 %"];
    expect(printableInvestigation(items, ["19/09/2026:HbA1c:7.8 %"])).toEqual(["21/09/2026:HbA1c:7.8 %"]);
  });

  it("prints everything when nothing is hidden", () => {
    expect(printableInvestigation(FINDINGS, [])).toHaveLength(3);
    expect(printableInvestigation(FINDINGS, undefined as unknown as string[])).toHaveLength(3);
  });

  it("can hide the whole field, leaving the printed block empty", () => {
    expect(printableInvestigation(FINDINGS, allPrintable(FINDINGS))).toEqual([]);
  });

  it("survives an empty or absent list", () => {
    expect(printableInvestigation([], [])).toEqual([]);
    expect(printableInvestigation(undefined as unknown as string[])).toEqual([]);
  });
});

describe("allPrintable — what the ⊘ Hide master switch marks", () => {
  it("marks every printable finding and nothing else", () => {
    expect(allPrintable(FINDINGS)).toEqual([
      "19/09/2026:CBC:Hb 11.2 g/dL",
      "19/09/2026:S. Creatinine:1.4 mg/dL",
      "21/09/2026:HbA1c:7.8 %",
    ]);
  });
});

describe("toggleHidden", () => {
  it("marks a finding, then unmarks it", () => {
    const one = toggleHidden([], "21/09/2026:HbA1c:7.8 %");
    expect(one).toEqual(["21/09/2026:HbA1c:7.8 %"]);
    expect(toggleHidden(one, "21/09/2026:HbA1c:7.8 %")).toEqual([]);
  });

  it("leaves the other marks alone", () => {
    expect(toggleHidden(["a-line"], "21/09/2026:HbA1c:7.8 %")).toEqual(["a-line", "21/09/2026:HbA1c:7.8 %"]);
  });

  // A line that never prints cannot be "hidden" — marking it would put a tick on
  // screen that changes nothing on paper.
  it("refuses to mark a line that never prints", () => {
    expect(toggleHidden([], "19/09/2026:CBC:[image attached]")).toEqual([]);
    expect(toggleHidden([], "19/09/2026:Report 2")).toEqual([]);
  });
});

describe("pruneHidden", () => {
  // ⚕️ A mark must not outlive its finding: re-adding the same words at a later
  // visit is a new clinical moment and must start visible.
  it("drops a mark whose finding was deleted", () => {
    expect(pruneHidden(["19/09/2026:S. Creatinine:1.4 mg/dL"], ["21/09/2026:HbA1c:7.8 %"])).toEqual([]);
  });

  it("keeps a mark whose finding is still listed", () => {
    expect(pruneHidden(["21/09/2026:HbA1c:7.8 %"], FINDINGS)).toEqual(["21/09/2026:HbA1c:7.8 %"]);
  });

  it("survives empty inputs", () => {
    expect(pruneHidden([], FINDINGS)).toEqual([]);
    expect(pruneHidden(undefined as unknown as string[], FINDINGS)).toEqual([]);
  });
});
