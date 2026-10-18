// ⚕️ Disease history and Surgical / intervention history in On examination —
// physician's sheet, 18/10/2026, item 3: several entries, each with a date;
// "H/O cholecystectomy", date 151026 → 15/10/2026 (four-digit year, chosen in
// chat the same day), Add puts it under the ones before.
//
// Stored as ONE string per field, one entry per line, so a value saved before
// this (a single line) reads back as one entry, unchanged.

import { describe, expect, it } from "vitest";
import { historyEntries, addHistoryEntry, removeHistoryEntry, historyLines } from "./oeHistory";

const NOW = new Date(2026, 9, 18); // 18/10/2026

describe("historyEntries", () => {
  it("reads an old single value as one entry", () => {
    expect(historyEntries("Known DM for 5 years")).toEqual(["Known DM for 5 years"]);
  });
  it("reads one entry per line, blank lines dropped", () => {
    expect(historyEntries("H/O ERCP 16/10/2026\n\n  H/O cholecystectomy 15/10/2026 ")).toEqual(["H/O ERCP 16/10/2026", "H/O cholecystectomy 15/10/2026"]);
  });
  it("reads nothing from nothing", () => {
    expect(historyEntries("")).toEqual([]);
    expect(historyEntries(undefined as unknown as string)).toEqual([]);
  });
});

describe("addHistoryEntry", () => {
  it("writes the DDMMYY shorthand as dd/mm/yyyy after the text, below what was there", () => {
    const r = addHistoryEntry("H/O ERCP 16/10/2026", "H/O cholecystectomy", "151026", NOW);
    expect(r).toEqual({ ok: true, value: "H/O ERCP 16/10/2026\nH/O cholecystectomy 15/10/2026" });
  });
  it("takes a slashed date as typed", () => {
    expect(addHistoryEntry("", "H/O RFA", "03/02/2024", NOW)).toEqual({ ok: true, value: "H/O RFA 03/02/2024" });
  });
  it("the date is optional", () => {
    expect(addHistoryEntry("", "  Known HTN  ", "", NOW)).toEqual({ ok: true, value: "Known HTN" });
  });
  it("refuses an empty entry", () => {
    expect(addHistoryEntry("", "   ", "151026", NOW)).toEqual({ ok: false, reason: "Write the history first." });
  });
  // A past event cannot be dated after today; a two-digit year is never read as
  // a century out (the `past` policy of lib/dateInput.ts).
  it("refuses a date after today", () => {
    expect(addHistoryEntry("", "H/O ERCP", "011126", NOW)).toEqual({ ok: false, reason: "The date cannot be in the future." });
  });
  it("refuses a date it cannot read, and writes nothing", () => {
    expect(addHistoryEntry("", "H/O ERCP", "32/13", NOW)).toEqual({ ok: false, reason: "Not a valid date. Type DDMMYY (151026) or DD/MM/YYYY." });
  });
  it("keeps a typed line break out of the stored list", () => {
    expect(addHistoryEntry("", "H/O\nERCP", "", NOW)).toEqual({ ok: true, value: "H/O ERCP" });
  });
});

describe("removeHistoryEntry", () => {
  it("takes off the one entry at that place, a repeat elsewhere kept", () => {
    expect(removeHistoryEntry("A\nB\nA", 2)).toBe("A\nB");
    expect(removeHistoryEntry("A\nB\nA", 0)).toBe("B\nA");
  });
});

describe("historyLines — what On examination writes", () => {
  it("one line per entry, each with its label", () => {
    expect(historyLines("Disease Hx", "H/O ERCP 16/10/2026\nKnown DM")).toEqual(["Disease Hx: H/O ERCP 16/10/2026", "Disease Hx: Known DM"]);
  });
  it("an old single value is the same line as before", () => {
    expect(historyLines("Surgical Hx", "Cholecystectomy")).toEqual(["Surgical Hx: Cholecystectomy"]);
  });
  it("nothing for nothing", () => {
    expect(historyLines("Disease Hx", "")).toEqual([]);
  });
});
