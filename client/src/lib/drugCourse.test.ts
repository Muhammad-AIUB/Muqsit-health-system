import { describe, expect, it } from "vitest";
import { NO_DATE } from "@/lib/drugHistoryAdd";
import { SEP } from "@/lib/rxDrugHistory";
import { ddmmyyyyMs } from "@/lib/dateInput";
import {
  NO_DATE_MARKER, CELL_SEP, addDays, collapseContinuing, coursesOf, formatTotal, isCurrentCourse, rewriteCourse, sortCourses,
} from "@/lib/drugCourse";

const TODAY = "07/11/2026";
const todayMs = ddmmyyyyMs(TODAY);
const one = (entry: string | string[], visit = TODAY) => coursesOf(Array.isArray(entry) ? entry : [entry], visit)[0];

describe("the two literals this module keeps for itself are the app's own", () => {
  // drugCourse is a leaf (drugHistorySummary → rxAlerts → … would otherwise
  // reach MedicinePad through drugHistoryAdd); these pin the copies.
  it("no-date marker and cell separator", () => {
    expect(NO_DATE_MARKER).toBe(NO_DATE);
    expect(CELL_SEP).toBe(SEP);
  });
});

describe("Start, End and Total — the physician's own sheet of 07/11/2026", () => {
  it("Paracetamol 1+1+1 for 10 days from 06/11: ends 16/11, 30 in all", () => {
    const c = one("06/11/2026: Tablet. Napa 500 mg — 1+1+1 — After meal — 10 days");
    expect(c.kind).toBe("med");
    expect(c.date).toBe("06/11/2026");
    expect(c.end).toBe("16/11/2026");
    expect(c.total).toBe(30);
  });

  it("Cefixime 1+0+1 for 7 days from 06/11: ends 13/11, 14 in all", () => {
    const c = one("06/11/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 7 days");
    expect(c.end).toBe("13/11/2026");
    expect(c.total).toBe(14);
  });

  it("the same generic twice is two courses, one for each brand and date", () => {
    const list = coursesOf([
      "06/11/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 7 days",
      "01/02/2025: Capsule. Cef 3 400 mg — 1+0+1 —  — 14 days",
    ], TODAY);
    expect(list.map((c) => [c.label, c.end, c.total])).toEqual([
      ["Capsule. Denvar 400 mg", "13/11/2026", 14],
      ["Capsule. Cef 3 400 mg", "15/02/2025", 28],
    ]);
  });

  it("weeks and months count as 7 and 30 days, as the monthly cost box counts them", () => {
    expect(one("01/11/2026: Tablet. A 5 mg — 1+0+0 —  — 2 weeks").end).toBe("15/11/2026");
    expect(one("01/11/2026: Tablet. A 5 mg — 1+0+0 —  — 1 month").end).toBe("01/12/2026");
    expect(one("01/11/2026: Tablet. A 5 mg — 1+0+0 —  — 1 month").total).toBe(30);
  });

  it("a half tablet is counted as a half, and the total is not rounded to a whole number", () => {
    const c = one("01/11/2026: Tablet. A 5 mg — 1/2+0+1/2 —  — 5 days");
    expect(c.total).toBe(5);
    const d = one("01/11/2026: Tablet. A 5 mg — 1/2+0+0 —  — 5 days");
    expect(d.total).toBe(2.5);
    expect(formatTotal(2.5)).toBe("2.5");
    expect(formatTotal(30)).toBe("30");
  });

  it("a Bangla dose and duration are read as their English", () => {
    const c = one("06/11/2026: Tablet. Napa 500 mg — ১+০+১ —  — ৭ দিন");
    expect(c.end).toBe("13/11/2026");
    expect(c.total).toBe(14);
  });
});

describe("nothing is guessed: what cannot be read is left blank", () => {
  it("a duration with no unit gives no End and no Total", () => {
    const c = one("06/11/2026: Tablet. A 5 mg — 1+0+1 —  — 5");
    expect(c.end).toBeNull();
    expect(c.total).toBeNull();
  });

  it("a dose that is not counts joined by + gives an End but no Total", () => {
    const c = one("06/11/2026: Syrup. B 100 ml — 5 ml tds —  — 5 days");
    expect(c.end).toBe("11/11/2026");
    expect(c.total).toBeNull();
  });

  it("a food cell that says how often, not just when, gives no Total: once a week is not thirty tablets", () => {
    const c = one("06/11/2026: Tablet. A 5 mg — 1+0+0 — once a week — 30 days");
    expect(c.end).toBe("06/12/2026");
    expect(c.total).toBeNull();
  });

  it("a food cell that says only when, beside a meal, is fine", () => {
    expect(one("06/11/2026: Tablet. A 5 mg — 1+0+1 — 2 hr before meal — 3 days").total).toBe(6);
  });

  it("Continue has no End and no Total, and says it is open", () => {
    const c = one("01/01/2026: Tablet. Amlodipine 5 mg — 1+0+0 —  — Continue");
    expect(c.open).toBe(true);
    expect(c.end).toBeNull();
    expect(c.total).toBeNull();
  });

  it("no date: no End, whatever the duration", () => {
    const c = one(`${NO_DATE}: Tablet. A 5 mg — 1+0+1 —  — 7 days`);
    expect(c.hasDate).toBe(false);
    expect(c.end).toBeNull();
    expect(c.total).toBe(14);
  });

  it("a date that is not on the calendar gives no End", () => {
    const c = one("31/02/2026: Tablet. A 5 mg — 1+0+1 —  — 7 days");
    expect(c.hasDate).toBe(false);
    expect(c.end).toBeNull();
  });

  it("a blank cell stays blank", () => {
    const c = one("06/11/2026: Tablet. A 5 mg —  —  — ");
    expect(c.head).toEqual({ dose: "", food: "", duration: "" });
    expect(c.end).toBeNull();
    expect(c.total).toBeNull();
  });
});

describe("tapering lines belong to the medicine directly above them, and follow it in order", () => {
  const taper = (last = "5 days") => [
    "06/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 days",
    "06/11/2026(cont): 2+1+0 — After meal — 5 days",
    `06/11/2026(cont): 1+1+0 — After meal — ${last}`,
  ];

  it("one row for the whole regimen: End after the last line, Total the sum of the lines", () => {
    const list = coursesOf(taper(), TODAY);
    expect(list).toHaveLength(1);
    expect(list[0].tapers).toHaveLength(2);
    expect(list[0].end).toBe("21/11/2026"); // 06/11 + 15 days
    expect(list[0].total).toBe(4 * 5 + 3 * 5 + 2 * 5);
  });

  it("a taper whose duration cannot be read leaves End and Total blank, not half of them", () => {
    const [c] = coursesOf(taper("5"), TODAY);
    expect(c.end).toBeNull();
    expect(c.total).toBeNull();
  });

  it("a taper under a note, or with nothing above it, is not given to a medicine", () => {
    const list = coursesOf([
      "05/11/2026: Tablet. A 5 mg — 1+0+0 —  — 3 days",
      "05/11/2026(note): Insulin as before",
      "05/11/2026(cont): 0+0+1 —  — 3 days",
    ], TODAY);
    expect(list.map((c) => c.kind)).toEqual(["med", "note", "other"]);
    expect(list[0].tapers).toHaveLength(0);
    expect(list[2].editable).toBe(false);
  });
});

describe("what can be edited", () => {
  it("a dated medicine and its dated tapers can; a note, an orphan taper and a legacy line cannot", () => {
    expect(one("06/11/2026: Tablet. A 5 mg — 1+0+1 —  — 7 days").editable).toBe(true);
    expect(one("06/11/2026(note): free text").editable).toBe(false);
    expect(one("Current: Tablet. A 5 mg — 1+0+1 —  — 7 days").editable).toBe(false);
    expect(one("Past: Tablet. A 5 mg — 1+0+1 —  — 7 days").editable).toBe(false);
    expect(one("something nobody wrote in this format").editable).toBe(false);
  });

  it("a legacy Current: line is dated the visit; Past: has no date", () => {
    expect(one("Current: Tablet. A 5 mg — 1+0+1 —  — 7 days").date).toBe(TODAY);
    expect(one("Past: Tablet. A 5 mg — 1+0+1 —  — 7 days").date).toBe(NO_DATE);
  });
});

describe("addDays", () => {
  it("crosses month, year and leap day", () => {
    expect(addDays("28/02/2028", 1)).toBe("29/02/2028");
    expect(addDays("28/02/2027", 1)).toBe("01/03/2027");
    expect(addDays("31/12/2026", 1)).toBe("01/01/2027");
    expect(addDays("06/11/2026", 7)).toBe("13/11/2026");
  });
  it("refuses a date that is not real, and a result past the years the app accepts", () => {
    expect(addDays("31/02/2026", 1)).toBeNull();
    expect(addDays("", 1)).toBeNull();
    expect(addDays("01/01/2026", 10_000_000)).toBeNull();
  });
});

describe("Current: the End date is today or later", () => {
  const c = (end: string, start = "01/10/2026") => {
    const days = Math.round((ddmmyyyyMs(end) - ddmmyyyyMs(start)) / 86_400_000);
    return one(`${start}: Tablet. A 5 mg — 1+0+1 —  — ${days} days`);
  };
  it("ends today: current; ended yesterday: not", () => {
    expect(isCurrentCourse(c("07/11/2026"), todayMs)).toBe(true);
    expect(isCurrentCourse(c("08/11/2026"), todayMs)).toBe(true);
    expect(isCurrentCourse(c("06/11/2026"), todayMs)).toBe(false);
  });
  it("Continue is current; no readable End is not; a note never is", () => {
    expect(isCurrentCourse(one("01/01/2026: Tablet. A 5 mg — 1+0+0 —  — Continue"), todayMs)).toBe(true);
    expect(isCurrentCourse(one("01/11/2026: Tablet. A 5 mg — 1+0+0 —  — 5"), todayMs)).toBe(false);
    expect(isCurrentCourse(one(`${NO_DATE}: Tablet. A 5 mg — 1+0+0 —  — 5 days`), todayMs)).toBe(false);
    expect(isCurrentCourse(one("06/11/2026(note): Insulin as before"), todayMs)).toBe(false);
  });
});

describe("sorting: Current always first", () => {
  const entries = [
    "01/02/2025: Tablet. Zinc Brand 20 mg — 1+0+0 —  — 7 days",       // 0 past
    "06/11/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 7 days",          // 1 current (cefixime)
    "10/05/2026: Tablet. Beta 5 mg — 1+0+0 —  — 7 days",              // 2 past
    "06/11/2026: Tablet. Napa 500 mg — 1+1+1 —  — 10 days",            // 3 current (paracetamol)
    `${NO_DATE}: Tablet. Gamma 5 mg — 1+0+0 —  — 7 days`,              // 4 past, no date
    "03/09/2026: Tablet. Alpha 5 mg — 1+0+0 —  — 7 days",             // 5 past
  ];
  const generic: Record<string, string | null> = {
    "Capsule. Denvar 400 mg": "Cefixime", "Tablet. Napa 500 mg": "Paracetamol",
    "Tablet. Zinc Brand 20 mg": "Zinc", "Tablet. Beta 5 mg": "Betahistine",
    "Tablet. Alpha 5 mg": "Alprazolam", "Tablet. Gamma 5 mg": null,
  };
  const g = (label: string) => generic[label] ?? null;
  const labels = (mode: "generic" | "date") =>
    sortCourses(coursesOf(entries, TODAY), mode, todayMs, g).map((c) => c.label.replace(/^[^.]*\.\s*/, ""));

  it("by generic: Cefixime, Paracetamol (current), then the rest A to Z — a medicine with no generic by its brand name", () => {
    expect(labels("generic")).toEqual([
      "Denvar 400 mg", "Napa 500 mg",
      "Alpha 5 mg", "Beta 5 mg", "Gamma 5 mg", "Zinc Brand 20 mg",
    ]);
  });

  it("by date: the current ones, newest start first, then the rest by start date, no-date last", () => {
    // the two current ones start the same day: stored order keeps them
    expect(labels("date")).toEqual([
      "Denvar 400 mg", "Napa 500 mg",
      "Alpha 5 mg", "Beta 5 mg", "Zinc Brand 20 mg", "Gamma 5 mg", // 03/09/2026, 10/05/2026, 01/02/2025, no date
    ]);
  });

  it("does not change the list it was given", () => {
    const list = coursesOf(entries, TODAY);
    const keys = list.map((c) => c.key);
    sortCourses(list, "generic", todayMs, g);
    expect(list.map((c) => c.key)).toEqual(keys);
  });
});

describe("rewriteCourse: the start date and the durations, and nothing else", () => {
  const head = "06/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 days";
  const cont1 = "06/11/2026(cont): 2+1+0 — After meal — 5 days";
  const cont2 = "06/11/2026(cont): 1+1+0 — After meal — 5";

  it("moves every line of the block to the new date and sets each duration; dose and food stay byte for byte", () => {
    const c = one([head, cont1, cont2]);
    expect(rewriteCourse(c, { start: "08/11/2026", durations: ["5 days", "5 days", "5 days"] })).toEqual([
      "08/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 days",
      "08/11/2026(cont): 2+1+0 — After meal — 5 days",
      "08/11/2026(cont): 1+1+0 — After meal — 5 days",
    ]);
  });

  it("a duration changed alone leaves the date", () => {
    const c = one(head);
    expect(rewriteCourse(c, { start: "06/11/2026", durations: ["7 days"] })).toEqual([
      "06/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 7 days",
    ]);
  });

  it("a stored line with fewer cells than the full line gets the missing ones blank, then the duration", () => {
    const c = one("06/11/2026: Tablet. A 5 mg");
    expect(rewriteCourse(c, { start: "06/11/2026", durations: ["3 days"] })).toEqual([
      `06/11/2026: Tablet. A 5 mg${SEP}${SEP}${SEP}3 days`,
    ]);
  });

  it("the no-date marker can be given a real date", () => {
    const c = one(`${NO_DATE}: Tablet. A 5 mg — 1+0+1 —  — 7 days`);
    expect(rewriteCourse(c, { start: "03/11/2026", durations: ["7 days"] })?.[0]).toBe("03/11/2026: Tablet. A 5 mg — 1+0+1 —  — 7 days");
  });

  it("refuses what it cannot do safely: a date not on the calendar, a wrong number of durations, a duration with the separator or a line break, a note, a legacy line", () => {
    const c = one([head, cont1]);
    expect(rewriteCourse(c, { start: "31/02/2026", durations: ["5 days", "5 days"] })).toBeNull();
    expect(rewriteCourse(c, { start: "08/11/2026", durations: ["5 days"] })).toBeNull();
    expect(rewriteCourse(c, { start: "08/11/2026", durations: ["5 days", `5${SEP}days`] })).toBeNull();
    expect(rewriteCourse(c, { start: "08/11/2026", durations: ["5 days", "5\ndays"] })).toBeNull();
    expect(rewriteCourse(one("06/11/2026(note): x"), { start: "08/11/2026", durations: [] })).toBeNull();
    expect(rewriteCourse(one("Current: Tablet. A 5 mg — 1+0+1 —  — 7 days"), { start: "08/11/2026", durations: ["7 days"] })).toBeNull();
  });

  it("a duration is trimmed, and an empty one clears the cell", () => {
    const c = one(head);
    expect(rewriteCourse(c, { start: "06/11/2026", durations: ["  7 days "] })?.[0]).toMatch(/ — 7 days$/);
    expect(rewriteCourse(c, { start: "06/11/2026", durations: [""] })?.[0]).toBe("06/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — ");
  });

  it("the rewritten block reads back as the same medicine with the new End", () => {
    const c = one(head);
    const next = rewriteCourse(c, { start: "10/11/2026", durations: ["3 days"] })!;
    const back = one(next);
    expect(back.label).toBe(c.label);
    expect(back.end).toBe("13/11/2026");
    expect(back.total).toBe(12);
  });
});

describe("a course that goes on is counted up to today (physician's sheet, 07/11/2026, item 3)", () => {
  const total = (entries: string[]) => coursesOf(entries, TODAY, todayMs)[0].total;
  it("0+0+1 Continue from 09/09/2026 is 60 (both days counted, months of any length)", () => {
    expect(total(["09/09/2026: Capsule. Lenva 4 mg — 0+0+1 —  — Continue"])).toBe(60);
  });
  it("0+0+2 Continue from the same day is 120", () => {
    expect(total(["09/09/2026: Capsule. Lenva 4 mg — 0+0+2 —  — Continue"])).toBe(120);
  });
  it("0+0+1 for 7 days, then 0+0+2 Continue is 113", () => {
    expect(total([
      "09/09/2026: Capsule. Lenva 4 mg — 0+0+1 —  — 7 days",
      "09/09/2026(cont): 0+0+2 —  — Continue",
    ])).toBe(113);
  });
  it("a start six months back counts to today", () => {
    expect(total(["09/05/2026: Tablet. Monas 10 mg — 0+0+1 —  — Continue"])).toBe(183);
  });
  it("without a today it stays blank, as before; an unreadable dose stays blank", () => {
    expect(coursesOf(["09/09/2026: Tablet. X — 0+0+1 —  — Continue"], TODAY)[0].total).toBeNull();
    expect(total(["09/09/2026: Tablet. X — as needed —  — Continue"])).toBeNull();
  });
});

describe("collapseContinuing — a medicine that goes on is one row from the day it began", () => {
  const rows = (entries: string[]) => collapseContinuing(coursesOf(entries, TODAY, todayMs));
  const cont = (d: string, dose = "1+0+1") => `${d}: Tablet. Doxiva 200 mg — ${dose} —  — Continue`;
  it("the same medicine and dose continued at every visit is ONE row, from the earliest date", () => {
    const r = rows([cont("24/09/2026"), cont("21/09/2026"), cont("19/09/2026")]);
    expect(r).toHaveLength(1);
    expect(r[0].date).toBe("19/09/2026");
    expect(r[0].extraLines).toHaveLength(2);
  });
  it("a visit between WITHOUT it is a break: two rows", () => {
    const r = rows([cont("06/11/2026"), "13/10/2026: Capsule. Lenva 4 mg — 0+0+1 —  — 7 days", cont("24/09/2026")]);
    expect(r.filter((c) => c.label.includes("Doxiva")).map((c) => c.date).sort()).toEqual(["06/11/2026", "24/09/2026"]);
  });
  it("another dose is another row; a course with an end is never joined", () => {
    expect(rows([cont("24/09/2026"), cont("21/09/2026", "1+1+1")])).toHaveLength(2);
    expect(rows([cont("24/09/2026"), "21/09/2026: Tablet. Doxiva 200 mg — 1+0+1 —  — 5 days"])).toHaveLength(2);
  });
  it("nothing is dropped from the record: every stored line is carried", () => {
    const r = rows([cont("24/09/2026"), cont("21/09/2026")]);
    expect([...r[0].lines, ...(r[0].extraLines ?? [])].sort()).toEqual([cont("21/09/2026"), cont("24/09/2026")].sort());
  });
});

describe("collapseContinuing with the days a prescription was written (physician's Entecavir case, 07/11/2026)", () => {
  const D = (d: string) => ddmmyyyyMs(d);
  const bar = (d: string) => `${d}: Tablet. Barcavir 0.5 mg — 1+0+0 — Before meal — Continue`;
  const entries = [
    bar("06/11/2026"), bar("02/11/2026"), bar("24/09/2026"), bar("21/09/2026"), bar("19/09/2026"), bar("12/09/2026"),
    // a medicine ADDED by hand with a start date of its own: not a visit
    "15/09/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 7 days",
    "13/10/2026: Capsule. Lenva 4 mg — 0+0+1 —  — 7 days",
  ];
  const visits = ["12/09/2026", "19/09/2026", "21/09/2026", "24/09/2026", "13/10/2026", "02/11/2026", "06/11/2026"].map(D);
  const barRows = (days?: number[]) => collapseContinuing(coursesOf(entries, TODAY, todayMs), days).filter((c) => c.label.includes("Barcavir"));

  it("a hand-added course on a day with no prescription is not a break: from 12/09 to the 13/10 break is ONE row", () => {
    const r = barRows(visits).sort((a, b) => ddmmyyyyMs(a.date) - ddmmyyyyMs(b.date));
    expect(r.map((c) => c.date)).toEqual(["12/09/2026", "02/11/2026"]);
  });
  it("the run a visit did not carry on has stopped: End the day before it, Total counted to it", () => {
    const r = barRows(visits).sort((a, b) => ddmmyyyyMs(a.date) - ddmmyyyyMs(b.date));
    expect(r[0].open).toBe(false);
    expect(r[0].end).toBe("12/10/2026"); // 12/09 .. 12/10 = 31 days
    expect(r[0].total).toBe(31);
    expect(r[1].open).toBe(true);
    expect(r[1].end).toBeNull();
    expect(r[1].total).toBe(6); // 02/11 .. 07/11
  });
  it("without the list of prescription days nothing is ended (old reading)", () => {
    expect(barRows(undefined).every((c) => c.open)).toBe(true);
  });
});
