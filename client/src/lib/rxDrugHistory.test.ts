import { describe, it, expect } from "vitest";
import { rxDrugHistoryEntries, syncRxDrugHistory, sameEntries, mirrorClaims, withoutBlocksIn, mergeWithRecord } from "@/lib/rxDrugHistory";
import { drugMentions } from "@/lib/drugHistorySummary";
import { rowsFromRxItems, rxItemsFromRows } from "@/lib/rxRows";
import type { RxItem } from "@/types";

const TODAY = "07/09/2026";
const med = (p: Partial<RxItem>): RxItem => ({ drug: "", dose: "", duration: "", instruction: "", ...p });

describe("rxDrugHistoryEntries", () => {
  // ⚕️ The reported bug, verbatim: patient 555 on 07/09/2026 had these two
  // medicines on the sheet and "0 current" in Drug history.
  it("stamps today's ℞ medicines with the visit date", () => {
    const rx = [
      med({ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "food", generic: "Paracetamol" }),
      med({ drug: "Tablet. Napa One 1000 mg", generic: "Paracetamol" }),
    ];
    expect(rxDrugHistoryEntries(rx, TODAY)).toEqual([
      "07/09/2026: Tablet. Napa 500 mg — 1+1+1 — food — 5 days",
      "07/09/2026: Tablet. Napa One 1000 mg —  —  — ",
    ]);
  });

  it("records a medicine with no dose yet rather than inventing one", () => {
    const [entry] = rxDrugHistoryEntries([med({ drug: "Tablet. Napa One 1000 mg" })], TODAY);
    expect(entry).not.toMatch(/1\+0\+1|After meal|Continue/);
  });

  it("produces entries the drug-history reader parses back as current medicines", () => {
    const entries = rxDrugHistoryEntries([med({ drug: "Losartan 50mg", dose: "1+0+1", instruction: "after food", duration: "continuing" })], TODAY);
    expect(drugMentions(entries, TODAY)).toEqual([{ name: "Losartan 50mg", date: TODAY }]);
  });

  it("keeps a tapering line as a (cont) entry under its medicine", () => {
    const rx = [
      med({ drug: "Tablet (Delayed Release). Mesacol 400 mg", dose: "2+2+2", duration: "7 week", instruction: "food" }),
      med({ drug: "", dose: "2+0+2", duration: "4 week", instruction: "food", isCont: true }),
    ];
    expect(rxDrugHistoryEntries(rx, TODAY)).toEqual([
      "07/09/2026: Tablet (Delayed Release). Mesacol 400 mg — 2+2+2 — food — 7 week",
      "07/09/2026(cont): 2+0+2 — food — 4 week",
    ]);
  });

  it("treats a pre-2026-08-17 blank-drug line as a taper, not a nameless medicine", () => {
    const rx = [med({ drug: "Capsule. Lenva 4 mg", dose: "0+0+1", duration: "7 days" }), med({ drug: "", dose: "0+0+2", duration: "Continue" })];
    expect(rxDrugHistoryEntries(rx, TODAY)[1]).toBe("07/09/2026(cont): 0+0+2 —  — Continue");
  });

  it("skips free-typed ℞ notes — a note is not a medication", () => {
    expect(rxDrugHistoryEntries([med({ drug: "Take rest for 2 weeks", isNote: true })], TODAY)).toEqual([]);
  });

  it("skips empty lines and an empty taper", () => {
    expect(rxDrugHistoryEntries([med({}), med({ drug: "", isCont: true })], TODAY)).toEqual([]);
  });

  it("collapses two identical ℞ lines into one entry", () => {
    const line = med({ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "food" });
    expect(rxDrugHistoryEntries([line, { ...line }], TODAY)).toHaveLength(1);
  });

  // ⚕️ An entry stamped with a date the parser cannot read can never be matched
  // back out — it would be permanent junk in a patient's record.
  it.each([["", "empty"], ["2026-09-07", "ISO"], ["7/9/2026", "unpadded"], ["invalid", "text"]])(
    "records nothing when the visit date is %s (%s)",
    (visitDate) => expect(rxDrugHistoryEntries([med({ drug: "Napa" })], visitDate)).toEqual([]),
  );

  it("survives a null item list", () => {
    expect(rxDrugHistoryEntries(null as unknown as RxItem[], TODAY)).toEqual([]);
  });
});

describe("syncRxDrugHistory", () => {
  const OLD = ["10/01/2024: Losartan 50mg — 1+0+1 — after food — continuing", "20/07/2026: Metformin 500mg — 1+0+1 — after food — 1 month"];
  const NAPA = "07/09/2026: Tablet. Napa 500 mg — 1+1+1 — food — 5 days";
  const MESACOL = "07/09/2026: Mesacol 400 mg — 2+2+2 — food — 7 week";

  it("appends today's ℞ without disturbing earlier visits", () => {
    expect(syncRxDrugHistory(OLD, [], [NAPA])).toEqual([...OLD, NAPA]);
  });

  it("is idempotent — a second pass with the same ℞ changes nothing", () => {
    const once = syncRxDrugHistory(OLD, [], [NAPA]);
    expect(syncRxDrugHistory(once, [NAPA], [NAPA])).toEqual(once);
  });

  it("withdraws an entry the doctor removed from the ℞", () => {
    const both = syncRxDrugHistory(OLD, [], [NAPA, MESACOL]);
    expect(syncRxDrugHistory(both, [NAPA, MESACOL], [NAPA])).toEqual([...OLD, NAPA]);
  });

  // ⚕️ The safety line: this function may only take back what it put there.
  it("never removes a medicine the doctor typed into Drug history by hand", () => {
    const manual = "07/09/2026: Insulin 30/70 — 10u+0+8u — before food — continuing";
    const stored = [...OLD, manual, NAPA];
    expect(syncRxDrugHistory(stored, [NAPA], [])).toEqual([...OLD, manual]);
  });

  it("keeps a hand-typed entry that happens to duplicate an ℞ line", () => {
    const stored = syncRxDrugHistory([...OLD, NAPA], [], [NAPA]);
    expect(stored.filter((e) => e === NAPA)).toHaveLength(1);
    expect(syncRxDrugHistory(stored, [NAPA], [NAPA])).toEqual(stored);
  });

  // A reload or a patient switch leaves the caller with no memory of the pad.
  it("withdraws nothing when it has no record of a previous ℞", () => {
    const stored = [...OLD, NAPA];
    expect(syncRxDrugHistory(stored, [], [])).toEqual(stored);
  });

  it("does not reorder an existing list", () => {
    const stored = [NAPA, ...OLD];
    expect(syncRxDrugHistory(stored, [NAPA], [NAPA, MESACOL])).toEqual([NAPA, ...OLD, MESACOL]);
  });

  it("survives null inputs", () => {
    expect(syncRxDrugHistory(null as unknown as string[], null as unknown as string[], [NAPA])).toEqual([NAPA]);
  });

  // ⚕️ A (cont) taper names no drug: it belongs to the entry directly above it.
  // Appending a changed taper at the END handed it to whichever medicine was
  // last — a dose for the wrong drug in the patient's record.
  describe("a taper stays under its own medicine", () => {
    const pad = (items: RxItem[]) => rxDrugHistoryEntries(items, TODAY);
    const napa = med({ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days" });
    const omep = med({ drug: "Capsule. Omeprazole 20 mg", dose: "1+0+1", duration: "14 days" });
    const taper = (dose: string) => med({ dose, duration: "7 days", isCont: true });
    const N = "07/09/2026: Tablet. Napa 500 mg — 1+1+1 —  — 5 days";
    const O = "07/09/2026: Capsule. Omeprazole 20 mg — 1+0+1 —  — 14 days";
    const cont = (dose: string) => `07/09/2026(cont): ${dose} —  — 7 days`;

    // Drive the sync the way MuqsitContext does: remember the last derived list.
    const run = (stored: string[], pads: RxItem[][]) => {
      let prev: string[] = [];
      for (const p of pads) {
        const next = pad(p);
        stored = syncRxDrugHistory(stored, prev, next);
        prev = next;
      }
      return stored;
    };

    it("keeps an edited taper under its medicine, not under the one after it", () => {
      const out = run(OLD, [[napa, taper("0+0+2"), omep], [napa, taper("0+0+1"), omep]]);
      expect(out).toEqual([...OLD, N, cont("0+0+1"), O]);
    });

    it("puts a taper added later directly under its medicine", () => {
      const out = run(OLD, [[napa, omep], [napa, taper("0+0+2"), omep]]);
      expect(out).toEqual([...OLD, N, cont("0+0+2"), O]);
    });

    it("withdraws a deleted taper without moving its medicine", () => {
      const out = run(OLD, [[napa, taper("0+0+2"), omep], [napa, omep]]);
      expect(out).toEqual([...OLD, N, O]);
    });

    it("moves an edited medicine together with its taper", () => {
      const napa2 = { ...napa, dose: "1+0+1" };
      const out = run(OLD, [[napa, taper("0+0+2"), omep], [napa2, taper("0+0+2"), omep]]);
      const N2 = "07/09/2026: Tablet. Napa 500 mg — 1+0+1 —  — 5 days";
      expect(out).toEqual([...OLD, O, N2, cont("0+0+2")]);
    });

    it("never touches or reorders older history while doing it", () => {
      const out = run(OLD, [[napa, taper("0+0+2"), omep], [napa, taper("0+0+1"), omep], [omep]]);
      expect(out.slice(0, OLD.length)).toEqual(OLD);
      expect(out).toEqual([...OLD, O]);
    });

    it("is idempotent once the blocks are in place", () => {
      const once = run(OLD, [[napa, taper("0+0+2"), omep]]);
      const next = pad([napa, taper("0+0+2"), omep]);
      expect(syncRxDrugHistory(once, next, next)).toEqual(once);
      // A reload (no memory of the pad) changes nothing either.
      expect(syncRxDrugHistory(once, [], next)).toEqual(once);
    });

    it("writes an identical taper under each of two different medicines", () => {
      const entries = pad([napa, taper("0+0+2"), omep, taper("0+0+2")]);
      expect(entries).toEqual([N, cont("0+0+2"), O, cont("0+0+2")]);
      expect(syncRxDrugHistory(OLD, [], entries)).toEqual([...OLD, N, cont("0+0+2"), O, cont("0+0+2")]);
    });

    it("does not count another medicine's identical taper as already present", () => {
      const stored = run(OLD, [[napa, taper("0+0+2"), omep]]);
      const out = syncRxDrugHistory(stored, pad([napa, taper("0+0+2"), omep]), pad([napa, taper("0+0+2"), omep, taper("0+0+2")]));
      expect(out).toEqual([...OLD, N, cont("0+0+2"), O, cont("0+0+2")]);
    });
  });

  // ⚕️ Independent review, 18/10/2026 (older than that day's release). The same
  // medicine written twice, the second time with a `>>>` line under it: the
  // second head was dropped as a repeat while its taper was kept, so the taper
  // stood under the line in between — Bex's dose, to anyone reading it, and
  // Move to Rx would have put it under Bex. A block is the fact: a medicine with
  // the tapering lines under it. Two IDENTICAL blocks are one fact; a repeated
  // medicine whose block differs keeps its own line, and its tapers stay under it.
  describe("a repeated medicine keeps its own tapers", () => {
    const pad = (items: RxItem[]) => rxDrugHistoryEntries(items, TODAY);
    const napa = med({ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days" });
    const bex = med({ drug: "Capsule. Bex 1 mg", dose: "0+0+1", duration: "1 month" });
    const taper = (dose: string) => med({ dose, duration: "7 days", isCont: true });
    const N = "07/09/2026: Tablet. Napa 500 mg — 1+1+1 —  — 5 days";
    const B = "07/09/2026: Capsule. Bex 1 mg — 0+0+1 —  — 1 month";
    const cont = (dose: string) => `07/09/2026(cont): ${dose} —  — 7 days`;

    it("the review's pad: the taper stays under the second Napa, never under Bex", () => {
      expect(pad([napa, bex, { ...napa }, taper("0+0+1")])).toEqual([N, B, N, cont("0+0+1")]);
    });

    it("two different tapers of one medicine are never chained into one regimen", () => {
      expect(pad([napa, taper("0+0+2"), bex, { ...napa }, taper("0+0+1")])).toEqual([N, cont("0+0+2"), B, N, cont("0+0+1")]);
    });

    it("a block written twice, taper and all, is still one fact", () => {
      expect(pad([napa, taper("0+0+1"), bex, { ...napa }, taper("0+0+1")])).toEqual([N, cont("0+0+1"), B]);
      expect(pad([napa, bex, { ...napa }])).toEqual([N, B]);
    });

    // Driven as MuqsitContext drives it: the list the pad wrote last time is
    // what the sync may withdraw.
    const run = (stored: string[], pads: RxItem[][]) => {
      let prev: string[] = [];
      for (const p of pads) {
        const next = pad(p);
        stored = syncRxDrugHistory(stored, prev, next);
        prev = next;
      }
      return stored;
    };

    it("is written into the history with each taper under its own line", () => {
      expect(run(OLD, [[napa, bex, { ...napa }, taper("0+0+1")]])).toEqual([...OLD, N, B, N, cont("0+0+1")]);
    });

    it("taking the plain Napa off withdraws that line alone, never the head of the other block", () => {
      const out = run(OLD, [[napa, bex, { ...napa }, taper("0+0+1")], [bex, { ...napa }, taper("0+0+1")]]);
      expect(out).toEqual([...OLD, B, N, cont("0+0+1")]);
    });

    it("taking the tapered Napa off withdraws it with its taper and leaves the plain one", () => {
      const out = run(OLD, [[napa, bex, { ...napa }, taper("0+0+1")], [napa, bex]]);
      expect(out).toEqual([...OLD, N, B]);
    });

    // ⚕️ Release review of 551a120, 18/10/2026. A medicine line whose name is
    // cleared on the pad is dropped by the pad's own reading (`rxItemsFromRows`)
    // while its `>>>` lines are kept. Written as they stood, such a taper went
    // under whatever entry the history held above it — and the merge then wrote
    // that entry twice. A taper with no medicine directly above it in its own
    // block is not written: it names no drug, and nothing says whose it is.
    it("writes no taper that has no medicine above it", () => {
      expect(pad([taper("0+0+1"), napa])).toEqual([N]);
    });

    // The pad gives a note no `>>>` button, so a taper straight under a note is a
    // cleared medicine's too — and a note may itself be a medicine typed by hand
    // ("Insulin as before"). Under the medicine above the note it would be a dose
    // for the wrong drug. "+ Add medicine" (`unwritableLines`) and Move to Rx
    // (`blocksFromRows`) read it the same way.
    it("writes no taper that stands straight under a note", () => {
      const note = med({ drug: "Insulin as before", isNote: true });
      expect(pad([napa, note, taper("0+0+1")])).toEqual([N]);
    });

    // Under another medicine too, since 18/10/2026: the pad's own reading
    // (`rxItemsFromRows`) no longer hands a cleared medicine's >>> lines to the
    // medicine above it (lib/rxRows.ts, `unwritableRows`).
    // Through the pad's own reading, with ANOTHER medicine above the cleared one
    // (the physician's report): Bex, then Clarith with a >>> line, then Napa.
    it("clearing a medicine's name withdraws its taper; nothing goes under the medicine above it", () => {
      const clarith = med({ drug: "Tablet. Clarith 500 mg", dose: "1+0+1", duration: "7 days" });
      const before = rowsFromRxItems([bex, clarith, taper("0+0+1"), napa]);
      const cleared = before.map((r, i) => (i === 1 ? { ...r, drug: "" } : r));
      const out = run(OLD, [rxItemsFromRows(before), rxItemsFromRows(cleared)]);
      expect(out).toEqual([...OLD, B, N]);
    });

    // The review's own case, through the real functions: the record holds Bex, the
    // pad a taper whose medicine was cleared, then Napa. Merged with the record
    // after a reload, Bex was written twice: [Bex, Bex, (cont), Napa].
    it("…and merged with the record after a reload, the record's last line is not written twice", () => {
      const live = syncRxDrugHistory([B], [], pad([taper("0+0+1"), napa]));
      expect(mergeWithRecord([B], live)).toEqual([B, N]);
    });

    it("is idempotent once in place", () => {
      const next = pad([napa, bex, { ...napa }, taper("0+0+1")]);
      const once = run(OLD, [[napa, bex, { ...napa }, taper("0+0+1")]]);
      expect(syncRxDrugHistory(once, next, next)).toEqual(once);
      expect(syncRxDrugHistory(once, [], next)).toEqual(once);
    });
  });
});

describe("sameEntries", () => {
  it("compares by value and order", () => {
    expect(sameEntries(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameEntries(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameEntries(["a"], ["a", "b"])).toBe(false);
  });
});

// ⚕️ What the mirror may later WITHDRAW is what it INSERTED (independent review,
// 18/10/2026). It used to remember what today's ℞ would write, so a line the
// doctor typed into Drug history by hand that read exactly like a ℞ line — the
// ℞ line moved there with Move to Rx — was claimed as the mirror's, and taking
// the medicine off the pad deleted the hand-typed record.
describe("mirrorClaims", () => {
  const X = "18/10/2026: Seclo 20 mg — 1+0+0 —  — ";
  const Y = "18/10/2026: Napa 500 mg — 1+1+1 —  — 5 days";

  it("with no baseline for this patient yet (a reload), claims what the pad writes, as before", () => {
    expect(mirrorClaims([X], [], [X], false)).toEqual([X]);
  });

  it("does not claim a line that was already there and was not its own", () => {
    expect(mirrorClaims([X], [], [X], true)).toEqual([]);
  });

  it("claims a line it is about to insert", () => {
    expect(mirrorClaims([X], [], [X, Y], true)).toEqual([Y]);
  });

  it("keeps claiming a line it inserted earlier", () => {
    expect(mirrorClaims([X, Y], [Y], [X, Y], true)).toEqual([Y]);
  });

  it("claims a taper with its medicine, as one block", () => {
    const head = "18/10/2026: Mesacol 400 mg — 2+2+2 —  — 7 week";
    const cont = "18/10/2026(cont): 2+0+2 —  — 4 week";
    expect(mirrorClaims([], [], [head, cont], true)).toEqual([head, cont]);
  });

  it("a hand-typed line survives its ℞ twin leaving the pad", () => {
    // Typed by hand; then the same line goes on the pad; then it comes off.
    let stored = [X];
    let claimed = mirrorClaims(stored, [], [X], true);
    stored = syncRxDrugHistory(stored, [], [X]);
    const prev = claimed;
    claimed = mirrorClaims(stored, prev, [], true);
    stored = syncRxDrugHistory(stored, prev, []);
    expect(stored).toEqual([X]);
    expect(claimed).toEqual([]);
  });

  // ⚕️ Release review, 18/10/2026: what the mirror owns is decided AFTER it
  // withdraws what left the pad. Decided before, a medicine whose taper was
  // deleted matched its own old line, was taken for one already there, and was
  // never claimed again — taken off the pad, it stayed in the history for good.
  it("a medicine whose taper was taken off is still the mirror's, and leaves with it", () => {
    const H = "18/10/2026: Tablet. Napa 500 mg — 1+0+1 —  — 7 days";
    const T = "18/10/2026(cont): 0+0+1 —  — 7 days";
    let stored: string[] = [];
    let owned: string[] = [];
    const step = (next: string[]) => {
      const claims = mirrorClaims(stored, owned, next, true);
      stored = syncRxDrugHistory(stored, owned, next);
      owned = claims;
    };
    step([H, T]);
    expect(stored).toEqual([H, T]);
    step([H]);
    expect(stored).toEqual([H]);
    expect(owned).toEqual([H]);
    step([]);
    expect(stored).toEqual([]);
  });

  it("…and a taper taken off and put back is not written twice", () => {
    const H = "18/10/2026: Tablet. Napa 500 mg — 1+0+1 —  — 7 days";
    const T = "18/10/2026(cont): 0+0+1 —  — 7 days";
    let stored: string[] = [];
    let owned: string[] = [];
    const step = (next: string[]) => {
      const claims = mirrorClaims(stored, owned, next, true);
      stored = syncRxDrugHistory(stored, owned, next);
      owned = claims;
    };
    step([H, T]); step([H]); step([H, T]);
    expect(stored).toEqual([H, T]);
    step([]);
    expect(stored).toEqual([]);
  });
});

// ⚕️ The background patient fetch lays the RECORD under what the editor holds
// live (MuqsitContext). Merged line by line, Clarith's taper — written exactly
// like Napa's, which the record had — was dropped as "already there", and the
// mirror then put Clarith in a second time (independent review, 18/10/2026).
describe("mergeWithRecord", () => {
  const N = "18/10/2026: Tablet. Napa 500 mg — 1+0+1 —  — 5 days";
  const C = "18/10/2026: Tablet. Clarith 500 mg — 1+0+1 —  — 7 days";
  const T = "18/10/2026(cont): 0+0+1 —  — 7 days";
  const OLD = "01/10/2026: Tablet. Famotack 20 mg — 1+0+1 — Before meal — 1 month";

  it("keeps a live medicine's taper that reads like one on the record", () => {
    expect(mergeWithRecord([N, T], [N, T, C, T])).toEqual([N, T, C, T]);
  });

  it("puts the record's own order first and appends what is live beyond it", () => {
    expect(mergeWithRecord([OLD, N, T], [C, T, OLD, N, T])).toEqual([OLD, N, T, C, T]);
  });

  it("writes nothing twice once the record has caught up", () => {
    expect(mergeWithRecord([OLD, N, T, C, T], [OLD, N, T, C, T])).toEqual([OLD, N, T, C, T]);
  });

  it("drops nothing of the record that the live list does not hold", () => {
    expect(mergeWithRecord([OLD, N, T], [])).toEqual([OLD, N, T]);
  });

  // A block is the medicine with ALL its tapers. Taken for the record's because
  // it starts like it, a taper added since would be lost; the record's block is
  // kept too, since nothing here can tell it was replaced rather than added.
  it("never takes a live block for the record's because it starts the same", () => {
    expect(mergeWithRecord([N], [N, T])).toEqual([N, N, T]);
  });

  it("counts: a block the live list holds more often than the record is kept", () => {
    expect(mergeWithRecord([N, T], [N, T, OLD, N, T])).toEqual([N, T, OLD, N, T]);
  });

  it("survives null inputs", () => {
    expect(mergeWithRecord(null as unknown as string[], [N])).toEqual([N]);
    expect(mergeWithRecord([N], null as unknown as string[])).toEqual([N]);
  });
});

describe("withoutBlocksIn", () => {
  const H = "17/10/2026: Tablet. Napa 500 mg — 1+0+1 —  — 7 days";
  const T = "17/10/2026(cont): 0+0+1 —  — 7 days";
  const C = "17/10/2026: Tablet. Clarith 500 mg — 1+0+1 —  — 7 days";
  it("drops the owned blocks the record already holds, whole", () => {
    expect(withoutBlocksIn([H, T, C], [H, T])).toEqual([C]);
  });
  it("keeps a block the record holds only in part", () => {
    expect(withoutBlocksIn([H, T], [H])).toEqual([H, T]);
  });
  it("keeps everything against an empty record", () => {
    expect(withoutBlocksIn([H, T, C], [])).toEqual([H, T, C]);
  });
});

