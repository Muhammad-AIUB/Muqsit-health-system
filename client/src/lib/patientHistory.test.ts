import { describe, expect, it } from "vitest";
import { hasHxEntry, hxLine, patientHistory, printableHistory, typedHxEntry } from "./patientHistory";
import { groupOeForRecords } from "./onExaminationSummary";

// ⚕️ The patient's Disease / Surgical history in the sidebar's History block
// (physician's sheet 28/10/2026, item 7).

const NOW = new Date(2026, 10, 2, 12); // 02/11/2026

describe("patientHistory — read from the shared history", () => {
  const findings = [
    { date: "20/10/2026", text: "BP: 120/80 mmHg" },
    { date: "20/10/2026", text: "Disease Hx: DM 01/01/2010" }, // the old popup's line, no author
    { date: "28/10/2026", text: "Surgical Hx: H/O cholecystectomy 15/10/2026", by: "Dr. Karim" },
    { date: "28/10/2026", text: "Disease Hx:  dm 01/01/2010 ", by: "Dr. Karim" }, // the same history again
    { date: "02/11/2026", text: "Disease Hx: HTN", by: "Rahim" },
  ];

  it("each kind in the order first written, one per text, with the visit it was first written at", () => {
    const hx = patientHistory(findings);
    expect(hx.disease).toEqual([
      { text: "DM 01/01/2010", date: "20/10/2026", by: null },
      { text: "HTN", date: "02/11/2026", by: "Rahim" },
    ]);
    expect(hx.surgical).toEqual([{ text: "H/O cholecystectomy 15/10/2026", date: "28/10/2026", by: "Dr. Karim" }]);
  });

  it("leaves out an entry taken off (soft), and what cannot be read", () => {
    const hx = patientHistory([
      ...findings.slice(0, 3),
      { date: "02/11/2026", text: "Disease Hx: HTN", removedAt: "2026-11-02T10:00:00.000Z" },
      null as never, { date: 5, text: 7 } as never, { date: "02/11/2026", text: "Disease Hx:   " },
    ]);
    expect(hx.disease.map((e) => e.text)).toEqual(["DM 01/01/2010"]);
    expect(patientHistory(undefined)).toEqual({ disease: [], surgical: [] });
  });

  it("an examination finding is never read as history", () => {
    expect(patientHistory([{ date: "20/10/2026", text: "Disease history note: none" }]).disease).toEqual([]);
  });
});

describe("typed entry — the On-examination popup's rule, unchanged", () => {
  it("text then the DDMMYY date written dd/mm/yyyy", () => {
    expect(typedHxEntry("  H/O   cholecystectomy ", "151026", NOW)).toEqual({ ok: true, value: "H/O cholecystectomy 15/10/2026" });
    expect(typedHxEntry("HTN", "", NOW)).toEqual({ ok: true, value: "HTN" });
  });
  it("no text, an unreadable date or a date to come writes nothing and says why", () => {
    expect(typedHxEntry("", "151026", NOW).ok).toBe(false);
    expect(typedHxEntry("DM", "321399", NOW)).toEqual({ ok: false, reason: "Not a valid date. Type DDMMYY (151026) or DD/MM/YYYY." });
    expect(typedHxEntry("DM", "011226", NOW)).toEqual({ ok: false, reason: "The date cannot be in the future." });
  });
  it("is stored as the line the popup wrote", () => {
    expect(hxLine("disease", "DM 01/01/2010")).toBe("Disease Hx: DM 01/01/2010");
    expect(hxLine("surgical", "RFA")).toBe("Surgical Hx: RFA");
  });
  it("a text already listed is found, case and spacing aside", () => {
    const list = patientHistory([{ date: "20/10/2026", text: "Disease Hx: DM 01/01/2010" }]).disease;
    expect(hasHxEntry(list, " dm 01/01/2010")).toBe(true);
    expect(hasHxEntry(list, "DM 02/01/2010")).toBe(false);
  });
});

describe("printableHistory — the History section of the printed sheet", () => {
  const hx = patientHistory([
    { date: "20/10/2026", text: "Disease Hx: DM 01/01/2010" },
    { date: "28/10/2026", text: "Surgical Hx: RFA" },
  ]);

  it("this visit's lines exactly as before, then the patient's history as On examination printed it", () => {
    expect(printableHistory(["H/O fever for 3 days"], hx, false)).toEqual([
      "H/O fever for 3 days", "Disease Hx: DM 01/01/2010", "Surgical Hx: RFA",
    ]);
  });
  it("a patient with no disease / surgical history prints exactly what History printed before", () => {
    expect(printableHistory(["H/O fever for 3 days"], { disease: [], surgical: [] }, false)).toEqual(["H/O fever for 3 days"]);
  });
  it("⊘ Hide keeps the whole section off the sheet", () => {
    expect(printableHistory(["H/O fever"], hx, true)).toEqual([]);
  });
});

describe("the records page's On-examination cards", () => {
  it("leave out an entry taken off in the sidebar", () => {
    const groups = groupOeForRecords([
      { date: "20/10/2026", text: "BP: 120/80 mmHg" },
      { date: "20/10/2026", text: "Disease Hx: HTN", removedAt: "2026-11-02T10:00:00.000Z" },
    ]);
    expect(groups.flatMap((g) => g.items.map((i) => i.text))).toEqual(["BP: 120/80 mmHg"]);
  });
});
