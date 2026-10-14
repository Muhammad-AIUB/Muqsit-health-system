// ⚕️ What lands on a prescription when the doctor ticks a row in Drug history.
// Every expectation here is a clinical fact, not a formatting nit: a red test
// means a dose, a taper or a whole medicine reaches the ℞ differently than the
// physician decided on 2026-09-21. Check the design note before touching one:
// docs/superpowers/specs/2026-09-21-drug-history-multi-select-design.md

import { describe, it, expect } from "vitest";
import { appendBlocks, blocksFromRows, moveSummary, type HistoryRow } from "@/lib/drugHistorySelect";
import type { RxItem } from "@/types";

const med = (body: string): HistoryRow => ({ kind: "med", body });
const cont = (body: string): HistoryRow => ({ kind: "cont", body });
const note = (body: string): HistoryRow => ({ kind: "note", body });

const rx = (p: Partial<RxItem>): RxItem => ({ drug: "", dose: "", duration: "", instruction: "", ...p });

describe("blocksFromRows", () => {
  it("maps the four cells onto the ℞ line, in the pad's own field order", () => {
    const b = blocksFromRows([med("Tablet. Napa 500 mg — 1+1+1 — With food — 5 days")], "19/09/2026");
    expect(b).toHaveLength(1);
    expect(b[0].drug).toBe("Tablet. Napa 500 mg");
    expect(b[0].items).toEqual([
      { drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "With food", duration: "5 days", isCont: false },
    ]);
  });

  // ⚕️ The rule the "↻ Rx" button broke: it substituted 1+0+1 / After meal /
  // Continue for whatever was missing. Select all would have written those onto
  // every medicine in one press.
  it("leaves a missing dose, food and duration BLANK — it invents nothing", () => {
    const b = blocksFromRows([med("Tablet. Edeloss 20 mg+50 mg —  —  — ")], "19/09/2026");
    expect(b[0].items[0]).toEqual({ drug: "Tablet. Edeloss 20 mg+50 mg", dose: "", instruction: "", duration: "", isCont: false });
  });

  it("keeps a medicine recorded with no cells at all", () => {
    const b = blocksFromRows([med("SC Injection. Actrapid 100 IU/ml")], "19/09/2026");
    expect(b).toHaveLength(1);
    expect(b[0].items[0]).toEqual({ drug: "SC Injection. Actrapid 100 IU/ml", dose: "", instruction: "", duration: "", isCont: false });
  });

  it("carries a tapering line inside its medicine's block, with an empty drug", () => {
    const b = blocksFromRows([
      med("Capsule. Lenva 4 mg — 0+0+1 —  — 7 days"),
      cont("0+0+2 —  — Continue"),
    ], "12/09/2026");
    expect(b).toHaveLength(1);
    expect(b[0].items).toEqual([
      { drug: "Capsule. Lenva 4 mg", dose: "0+0+1", instruction: "", duration: "7 days", isCont: false },
      { drug: "", dose: "0+0+2", instruction: "", duration: "Continue", isCont: true },
    ]);
    expect(b[0].rows).toEqual([0, 1]);
  });

  it("closes a block at the next medicine, so a taper never attaches to the wrong drug", () => {
    const b = blocksFromRows([
      med("Tablet. A 10 mg — 1+0+1 —  — 5 days"),
      med("Tablet. B 20 mg — 0+0+1 —  — 3 days"),
      cont("0+0+2 —  — Continue"),
    ], "12/09/2026");
    expect(b).toHaveLength(2);
    expect(b[0].items).toHaveLength(1);
    expect(b[1].items).toHaveLength(2);
    expect(b[1].items[1]).toMatchObject({ drug: "", dose: "0+0+2", isCont: true });
  });

  it("a note closes the block — a taper written after one is dropped, not misfiled", () => {
    const b = blocksFromRows([
      med("Tablet. A 10 mg — 1+0+1 —  — 5 days"),
      note("Take rest for 2 weeks"),
      cont("0+0+2 —  — Continue"),
    ], "12/09/2026");
    expect(b).toHaveLength(1);
    expect(b[0].items).toHaveLength(1);
  });

  it("drops a tapering line with no medicine above it", () => {
    expect(blocksFromRows([cont("0+0+2 —  — Continue")], "12/09/2026")).toEqual([]);
  });

  it("drops a tapering line that carries no instruction at all", () => {
    const b = blocksFromRows([med("Tablet. A 10 mg — 1+0+1 —  — 5 days"), cont(" —  — ")], "12/09/2026");
    expect(b[0].items).toHaveLength(1);
    expect(b[0].rows).toEqual([0]);
  });

  it("is not selectable when there is no medicine name to prescribe", () => {
    expect(blocksFromRows([med(" — 1+0+1 — After meal — 5 days")], "12/09/2026")).toEqual([]);
  });

  it("does not let a nameless row keep the previous medicine's block open", () => {
    const b = blocksFromRows([
      med("Tablet. A 10 mg — 1+0+1 —  — 5 days"),
      med(" —  —  — "),
      cont("0+0+2 —  — Continue"),
    ], "12/09/2026");
    expect(b).toHaveLength(1);
    expect(b[0].items).toHaveLength(1);
  });

  it("gives every block a key of its own, prefixed by the list it came from", () => {
    const b = blocksFromRows([med("Tablet. A 10 mg"), med("Tablet. B 20 mg")], "19/09/2026");
    expect(b.map((x) => x.key)).toEqual(["19/09/2026#0", "19/09/2026#1"]);
    const other = blocksFromRows([med("Tablet. A 10 mg")], "14/09/2026");
    expect(other[0].key).not.toBe(b[0].key);
  });

  it("survives an empty or absent list", () => {
    expect(blocksFromRows([], "current")).toEqual([]);
    expect(blocksFromRows(undefined as unknown as HistoryRow[], "current")).toEqual([]);
  });
});

describe("appendBlocks", () => {
  const blocks = (rows: HistoryRow[], prefix = "19/09/2026") => blocksFromRows(rows, prefix);

  it("appends the ticked medicines to an empty pad, in tick order", () => {
    const b = blocks([med("Tablet. A 10 mg — 1+0+1 —  — 5 days"), med("Tablet. B 20 mg — 0+0+1 —  — 3 days")]);
    const r = appendBlocks(b, []);
    expect(r.added).toBe(2);
    expect(r.skipped).toBe(0);
    expect(r.items.map((i) => i.drug)).toEqual(["Tablet. A 10 mg", "Tablet. B 20 mg"]);
  });

  // ⚕️ Physician's decision: no dedupe between ticked rows. The same medicine on
  // two visit dates, at two doses, is two facts — which one to keep is a
  // clinical judgement and it is the doctor's, not the system's.
  it("sends the same medicine twice when it is ticked at two different doses", () => {
    const r = appendBlocks(
      [...blocks([med("Tablet. Edeloss 20 mg+50 mg —  —  — ")], "19/09/2026"),
       ...blocks([med("Tablet. Edeloss 20 mg+50 mg — 1/2+0+1/2 — cf — ")], "12/09/2026")],
      [],
    );
    expect(r.added).toBe(2);
    expect(r.items).toHaveLength(2);
  });

  it("counts a medicine and its taper as ONE added block, and sends both lines", () => {
    const b = blocks([med("Capsule. Lenva 4 mg — 0+0+1 —  — 7 days"), cont("0+0+2 —  — Continue")]);
    const r = appendBlocks(b, []);
    expect(r.added).toBe(1);
    expect(r.items).toHaveLength(2);
    expect(r.items[1].isCont).toBe(true);
  });

  it("skips a medicine already on the pad and reports it", () => {
    const b = blocks([med("Tablet. Napa 500 mg — 1+1+1 — With food — 5 days")]);
    const r = appendBlocks(b, [rx({ drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "With food", duration: "5 days" })]);
    expect(r.added).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.items).toEqual([]);
  });

  // The old button compared drug|dose|duration and would have called these one
  // line. "With food" and nothing are two different instructions to a patient.
  it("does NOT call two lines the same when only the food instruction differs", () => {
    const b = blocks([med("Tablet. Napa 500 mg — 1+1+1 — With food — 5 days")]);
    const r = appendBlocks(b, [rx({ drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "", duration: "5 days" })]);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(0);
  });

  it("adds a byte-identical row ticked on two dates only once", () => {
    const line = "Tablet. Napa 500 mg — 1+1+1 — With food — 5 days";
    const r = appendBlocks([...blocks([med(line)], "19/09/2026"), ...blocks([med(line)], "14/09/2026")], []);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.items).toHaveLength(1);
  });

  // ⚕️ The history holds a medicine as it was WRITTEN on an earlier visit —
  // typed by hand, say — and today's pad may hold the same one picked from the
  // medicine list. Compared letter for letter, `Tablet. Napa 500mg` went on
  // the pad beside `Tablet. Napa 500 mg` at the same dose: one line, written
  // twice (in production until the release that carried this). The medicine is
  // compared as the app compares medicines everywhere else.
  describe("the same line, with its medicine written another way", () => {
    const NAPA = { dose: "1+1+1", instruction: "With food", duration: "5 days" };
    const WAYS = ["Tablet. Napa 500mg", "tablet. napa 500 MG", "Tablet.   Napa  500 mg", "Tab Napa 500 mg", "TAB. NAPA 500MG"];

    it.each(WAYS)("⚕️ is skipped when the pad has it as picked from the list — history: %s", (written) => {
      const b = blocks([med(`${written} — 1+1+1 — With food — 5 days`)]);
      const r = appendBlocks(b, [rx({ drug: "Tablet. Napa 500 mg", ...NAPA })]);
      expect([r.added, r.skipped, r.items]).toEqual([0, 1, []]);
    });

    it.each(WAYS)("⚕️ …and the other way round — pad: %s", (written) => {
      const b = blocks([med("Tablet. Napa 500 mg — 1+1+1 — With food — 5 days")]);
      const r = appendBlocks(b, [rx({ drug: written, ...NAPA })]);
      expect([r.added, r.skipped, r.items]).toEqual([0, 1, []]);
    });

    // Which of two doses is right is the doctor's judgement: another dose,
    // food or duration is another line, however the medicine is written.
    it("⚕️ at another dose, food or duration it is another line, and is added — as the history has it", () => {
      for (const other of [{ dose: "1+0+1" }, { instruction: "" }, { duration: "3 days" }]) {
        const b = blocks([med("Tablet. Napa 500mg — 1+1+1 — With food — 5 days")]);
        const r = appendBlocks(b, [rx({ drug: "Tablet. Napa 500 mg", ...NAPA, ...other })]);
        expect([r.added, r.skipped]).toEqual([1, 0]);
        expect(r.items).toEqual([{ drug: "Tablet. Napa 500mg", ...NAPA, isCont: false }]);
      }
    });

    // What the comparison sets aside is how a label is typed — never what it
    // says. A strength, a form, a qualifier or a brand of its own is another
    // medicine, and a medicine that is not on the pad must not be reported as
    // being there.
    it("⚕️ another strength, another form or another brand is another medicine: added", () => {
      for (const other of ["Tablet. Napa 665 mg", "Syrup. Napa 500 mg", "Tablet. Napa Extra 500 mg", "Tablet (Extended Release). Napa 500 mg", "Tablet. Napa 500 mcg", "Tablet. Napa 5000 mg"]) {
        const b = blocks([med("Tablet. Napa 500 mg — 1+1+1 — With food — 5 days")]);
        const r = appendBlocks(b, [rx({ drug: other, ...NAPA })]);
        expect([other, r.added, r.skipped]).toEqual([other, 1, 0]);
      }
    });

    it("two ticked rows that are one line in two spellings are added once — as the first was written", () => {
      const r = appendBlocks(
        [...blocks([med("Tablet. Napa 500mg — 1+1+1 — With food — 5 days")], "19/09/2026"),
         ...blocks([med("Tablet. Napa 500 mg — 1+1+1 — With food — 5 days")], "14/09/2026")],
        [],
      );
      expect([r.added, r.skipped]).toEqual([1, 1]);
      expect(r.items.map((i) => i.drug)).toEqual(["Tablet. Napa 500mg"]);
    });

    it("…and at two doses they are still two lines, each as it was written", () => {
      const r = appendBlocks(
        [...blocks([med("Tablet. Napa 500mg — 1+1+1 — With food — 5 days")], "19/09/2026"),
         ...blocks([med("Tablet. Napa 500 mg — 1+0+1 — With food — 5 days")], "14/09/2026")],
        [],
      );
      expect([r.added, r.skipped]).toEqual([2, 0]);
      expect(r.items.map((i) => [i.drug, i.dose])).toEqual([["Tablet. Napa 500mg", "1+1+1"], ["Tablet. Napa 500 mg", "1+0+1"]]);
    });

    it("a taper is not sent when its medicine, written another way, was skipped", () => {
      const b = blocks([med("capsule. lenva 4mg — 0+0+1 —  — 7 days"), cont("0+0+2 —  — Continue")]);
      const r = appendBlocks(b, [rx({ drug: "Capsule. Lenva 4 mg", dose: "0+0+1", instruction: "", duration: "7 days" })]);
      expect([r.added, r.skipped, r.items]).toEqual([0, 1, []]);
    });

    it("a name with no form and no strength is compared the same way — without its capitals and outer spaces", () => {
      const b = blocks([med("ORS —  —  — ")]);
      expect(appendBlocks(b, [rx({ drug: " ors " })]).skipped).toBe(1);
      expect(appendBlocks(b, [rx({ drug: "ORS-N" })]).added).toBe(1);
    });
  });

  // The dose, the food and the duration are the doctor's own words: they are
  // compared as written, less the spaces round them. (Only the MEDICINE is
  // compared more loosely than that — see the block above.)
  it("compares the dose, the food and the duration as written, less their outer spaces", () => {
    const b = blocks([med("Tablet. Napa 500 mg — 1+1+1 — With food — 5 days")]);
    const r = appendBlocks(b, [rx({ drug: "Tablet. Napa 500 mg", dose: " 1+1+1 ", instruction: "With food ", duration: " 5 days" })]);
    expect([r.added, r.skipped]).toEqual([0, 1]);
  });

  // A tapering line read back from the server carries its medicine's name.
  // Put on the pad so, it would still not be that medicine's FIRST line — and
  // the history's `0+0+1` would have been reported as already on ℞.
  it("a tapering line on the pad that carries its medicine's name is not that medicine's first line", () => {
    const pad = [
      rx({ drug: "Tablet. Prednisolone 5 mg", dose: "1+0+0", instruction: "", duration: "7 days" }),
      rx({ drug: "Tablet. Prednisolone 5 mg", dose: "0+0+1", instruction: "", duration: "7 days", isCont: true }),
    ];
    const r = appendBlocks(blocks([med("Tablet. Prednisolone 5 mg — 0+0+1 —  — 7 days")]), pad);
    expect([r.added, r.skipped]).toEqual([1, 0]);
  });

  // A note on the pad is a line of words, not a medicine: one that reads like
  // a medicine's name must not make Move to Rx say the medicine is on ℞ and
  // leave it off. (A tapering line has no medicine name, and matches nothing.)
  it("⚕️ a note on the pad that reads like the medicine is not the medicine", () => {
    const b = blocks([med("Napa —  —  — ")]);
    for (const written of ["Napa", "napa"]) {
      const r = appendBlocks(b, [rx({ drug: written, isNote: true })]);
      expect([written, r.added, r.skipped]).toEqual([written, 1, 0]);
    }
  });

  // ⚕️ A taper with no medicine above it is an unreadable instruction on a
  // prescription. A skipped block takes its tapering lines with it.
  it("never sends a taper when its medicine was skipped", () => {
    const b = blocks([med("Capsule. Lenva 4 mg — 0+0+1 —  — 7 days"), cont("0+0+2 —  — Continue")]);
    const r = appendBlocks(b, [rx({ drug: "Capsule. Lenva 4 mg", dose: "0+0+1", instruction: "", duration: "7 days" })]);
    expect(r.added).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.items).toEqual([]);
  });

  it("ignores a null row on the pad rather than throwing mid-click", () => {
    const b = blocks([med("Tablet. A 10 mg — 1+0+1 —  — 5 days")]);
    expect(() => appendBlocks(b, [null as unknown as RxItem])).not.toThrow();
    expect(appendBlocks(b, [null as unknown as RxItem]).added).toBe(1);
  });

  it("adds nothing when nothing is ticked", () => {
    expect(appendBlocks([], [rx({ drug: "Tablet. A 10 mg" })])).toEqual({ items: [], added: 0, skipped: 0 });
  });
});

describe("moveSummary", () => {
  it("says only what happened when nothing was skipped", () => {
    expect(moveSummary(3, 0)).toBe("3 added");
  });

  it("names the skipped ones, so a silent no-op is never silent", () => {
    expect(moveSummary(0, 6)).toBe("0 added · 6 already on ℞");
    expect(moveSummary(4, 2)).toBe("4 added · 2 already on ℞");
  });
});
