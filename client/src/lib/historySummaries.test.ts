import { describe, expect, it } from "vitest";
import { groupOeByDate, mergeOe, oeEntriesForDate, type OeFinding } from "./onExaminationSummary";
import { drugMentionRanges, drugMentions } from "./drugHistorySummary";
import { symptomMentionRanges } from "./symptomSummary";
import { decodePc, encodePc, formatPc, PC_SEP } from "./previousComplaints";
import { formatActivityTime } from "./activityFormat";
import { CATEGORY_LABEL } from "./rxTemplates";

// The small read-only summaries behind the records page and the Health-trend
// chart: on-examination history, drug-history mentions, symptom ranges, the
// "previous complaints" pair encoding and the activity-feed timestamp. All are
// pure string/date transformations over the storage formats in client/CLAUDE.md.

// ── On-examination history ─────────────────────────────────────────────────
describe("onExaminationSummary", () => {
  const bp: OeFinding = { date: "01/09/2026", text: "BP: 120/60 mmHg" };

  it("turns this visit's lines into dated findings, dropping blank lines only", () => {
    expect(oeEntriesForDate(["  BP: 120/60 mmHg ", "", "   ", "Pulse: 80"], "01/09/2026")).toEqual([
      bp,
      { date: "01/09/2026", text: "Pulse: 80" },
    ]);
  });

  it("merges by date + text, case-insensitively, without storing a line twice", () => {
    expect(mergeOe([bp], [{ date: "01/09/2026", text: "bp: 120/60 MMHG " }, bp])).toEqual([bp]);
  });

  it("⚕️ keeps the same line written on another date, and a different value on the same date", () => {
    const later = { date: "08/09/2026", text: "BP: 120/60 mmHg" };
    const changed = { date: "01/09/2026", text: "BP: 130/80 mmHg" };
    expect(mergeOe([bp], [later, changed])).toEqual([bp, later, changed]);
  });

  it("never adds a blank line, and never drops or mutates what was stored", () => {
    const stored = [bp];
    expect(mergeOe(stored, [{ date: "01/09/2026", text: "   " }])).toEqual([bp]);
    expect(stored).toEqual([bp]);
  });

  it("groups by date, newest first, the written order kept inside a date", () => {
    const list: OeFinding[] = [
      { date: "03/06/2026", text: "a" }, { date: "25/07/2026", text: "b" }, { date: "03/06/2026", text: "c" },
    ];
    const groups = groupOeByDate(list);
    expect(groups.map((g) => g.date)).toEqual(["25/07/2026", "03/06/2026"]);
    expect(groups[1].items.map((x) => x.text)).toEqual(["a", "c"]);
  });
});

// ── Drug-history mentions (Health-trend bars) ──────────────────────────────
describe("drugHistorySummary", () => {
  const TODAY = "07/09/2026";

  it("reads the drug name off a dated medicine entry", () => {
    expect(drugMentions(["07/09/2026: Tablet. Napa 500 mg — 1+1+1 — food — 5 days"], TODAY)).toEqual([
      { name: "Tablet. Napa 500 mg", date: "07/09/2026" },
    ]);
  });

  it("skips notes and tapering (cont) lines — neither names a drug", () => {
    expect(drugMentions([
      "07/09/2026(note): Stopped warfarin — GI bleed",
      "07/09/2026(cont): 2+0+2 — food — 4 week",
      "Current(cont): 0+0+1 —  — 7 days",
      "Current(note): x",
    ], TODAY)).toEqual([]);
  });

  it("resolves a legacy Current: entry to today, and gives a legacy Past: entry no date at all", () => {
    expect(drugMentions([
      "Current: Losartan 50mg — 1+0+1 — after food — continuing",
      "Past: Losartan 50mg — 1+0+1 — after food — continuing",
    ], TODAY)).toEqual([{ name: "Losartan 50mg", date: TODAY }]);
  });

  it("leaves anything in neither format unparsed rather than guessing", () => {
    expect(drugMentions(["", "Losartan 50mg", "7/9/2026: Napa", "2026-09-07: Napa", "07/09/2026: "], TODAY)).toEqual([]);
  });

  it("ranges run from the earliest to the latest mention of the exact same name", () => {
    const entries = [
      "20/07/2026: Metformin 500mg — 1+0+1 — after food — 1 month",
      "10/01/2024: Losartan 50mg — 1+0+1 — after food — continuing",
      "07/09/2026: Losartan 50mg — 1+0+1 — after food — continuing",
      "03/06/2025: Losartan 50mg — 1+0+0 —  — ",
    ];
    expect(drugMentionRanges(entries, TODAY)).toEqual([
      { name: "Metformin 500mg", start: "20/07/2026", end: "20/07/2026" },
      { name: "Losartan 50mg", start: "10/01/2024", end: "07/09/2026" },
    ]);
  });

  // "Bar durations are derived and understate. A tapering (cont) drug-history
  // line carries no drug name, so it does not extend that drug's range … don't
  // 'fix' them by guessing" (client/CLAUDE.md, Health monitoring).
  it("a later (cont) line does NOT extend its medicine's range", () => {
    expect(drugMentionRanges([
      "01/09/2026: Mesacol 400 mg — 2+2+2 — food — 7 week",
      "07/09/2026(cont): 2+0+2 — food — 4 week",
    ], TODAY)).toEqual([{ name: "Mesacol 400 mg", start: "01/09/2026", end: "01/09/2026" }]);
  });

  it("two strengths are two tracks — names are never fuzzy-matched", () => {
    expect(drugMentionRanges(["01/09/2026: Napa 500mg — — — ", "02/09/2026: Napa 665mg — — — "], TODAY).map((r) => r.name)).toEqual(["Napa 500mg", "Napa 665mg"]);
  });
});

// ── Symptom ranges ─────────────────────────────────────────────────────────
describe("symptomSummary", () => {
  const rx = (createdAt: string, chiefComplaints?: string[]) => ({ createdAt, chiefComplaints });

  it("spans a complaint from its first visit to its last, whatever order the visits arrive in", () => {
    expect(symptomMentionRanges([
      rx("2026-07-01T04:00:00.000Z", ["Abdominal pain"]),
      rx("2026-05-01T04:00:00.000Z", ["Abdominal pain", "Fever"]),
      rx("2026-09-01T04:00:00.000Z", [" Abdominal pain "]),
    ])).toEqual([
      { name: "Abdominal pain", start: "2026-05-01T04:00:00.000Z", end: "2026-09-01T04:00:00.000Z" },
      { name: "Fever", start: "2026-05-01T04:00:00.000Z", end: "2026-05-01T04:00:00.000Z" },
    ]);
  });

  it("keeps differently-cased complaints as separate tracks — free text is never silently merged", () => {
    expect(symptomMentionRanges([rx("2026-05-01T04:00:00.000Z", ["Abdominal pain", "abdominal pain"])]).map((r) => r.name)).toEqual(["Abdominal pain", "abdominal pain"]);
  });

  it("ignores blank complaints and a visit with none", () => {
    expect(symptomMentionRanges([rx("2026-05-01T04:00:00.000Z", ["", "   "]), rx("2026-06-01T04:00:00.000Z")])).toEqual([]);
  });
});

// ── Previous complaints: complaint + note in one stored string ─────────────
describe("previousComplaints", () => {
  it("round-trips a complaint and its note", () => {
    expect(decodePc(encodePc("Headache", "since 3 days"))).toEqual({ complaint: "Headache", note: "since 3 days" });
    expect(decodePc(encodePc("Headache", ""))).toEqual({ complaint: "Headache", note: "" });
  });

  it("reads an entry stored before notes existed as a complaint with no note", () => {
    expect(decodePc("Headache")).toEqual({ complaint: "Headache", note: "" });
  });

  it("splits on the FIRST separator only, so nothing typed in the note is lost", () => {
    expect(decodePc(`a${PC_SEP}b${PC_SEP}c`)).toEqual({ complaint: "a", note: `b${PC_SEP}c` });
  });

  it("prints 'complaint — note', and the complaint alone when the note is blank", () => {
    expect(formatPc(encodePc("Headache", "since 3 days"))).toBe("Headache — since 3 days");
    expect(formatPc(encodePc("Headache", "   "))).toBe("Headache");
    expect(formatPc("Headache")).toBe("Headache");
  });

  it("the separator is a control character no keyboard types", () => {
    expect(PC_SEP).toBe("\u0001");
  });
});

// ── Activity feed timestamp ────────────────────────────────────────────────
describe("formatActivityTime", () => {
  // Built from LOCAL parts so the expectation holds in any time zone.
  const at = (h: number, min: number) => new Date(2026, 8, 7, h, min).toISOString();

  it("prints DD.MM.YYYY · h.mm on a 12-hour clock (1.48 pm, not 13.48)", () => {
    expect(formatActivityTime(at(13, 48))).toBe("07.09.2026 · 1.48 pm");
    expect(formatActivityTime(at(9, 5))).toBe("07.09.2026 · 9.05 am");
  });

  it("calls midnight 12 am and noon 12 pm", () => {
    expect(formatActivityTime(at(0, 0))).toBe("07.09.2026 · 12.00 am");
    expect(formatActivityTime(at(12, 0))).toBe("07.09.2026 · 12.00 pm");
    expect(formatActivityTime(at(23, 59))).toBe("07.09.2026 · 11.59 pm");
  });

  it("prints nothing for a timestamp it cannot read — never 'Invalid Date'", () => {
    expect(formatActivityTime("")).toBe("");
    expect(formatActivityTime("not a date")).toBe("");
  });
});

describe("rxTemplates", () => {
  it("labels all three template categories", () => {
    expect(Object.keys(CATEGORY_LABEL).sort()).toEqual(["custom", "ipd", "opd"]);
    for (const label of Object.values(CATEGORY_LABEL)) expect(label.trim()).not.toBe("");
  });
});
