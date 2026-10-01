import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { rxDrugHistoryEntries, sameEntries, syncRxDrugHistory } from "./rxDrugHistory";
import { anyText, configureProps } from "@/test/fc";
import { MESACOL_ENTRY, NAPA_ENTRY, STORED_DRUG_HISTORY, VISIT_DATE, rxItem } from "@/test/fixtures";
import type { RxItem } from "@/types";

// ⚕️ The ℞ → Drug-history mirror (client/CLAUDE.md, "The ℞ pad mirrors into it
// live"). Its rules are stated as invariants there, so they are checked as
// invariants here, over arbitrary histories and arbitrary pads:
//   • "It withdraws only what it added … A medication the doctor typed into the
//     modal by hand can never be deleted by editing the ℞."
//   • "An empty prevDerived — a reload, a patient switch — is always safe: it
//     withdraws nothing."
//   • "Idempotent. Re-running with the same inputs returns an equal array."
//   • "A taper never leaves its medicine."
// Patient.drugHistory is a permanent clinical record; a property failing here
// is a medication silently removed from it.
configureProps(300);

// Small pools so entries COLLIDE — same medicine twice, identical tapers under
// two medicines, the pad re-typing a stored line. Every literal comes from
// rxDrugHistory.test.ts; none is a dose invented here.
const drug = fc.constantFrom("Tablet. Napa 500 mg", "Mesacol 400 mg", "Capsule. Lenva 4 mg", "Losartan 50mg", "Metformin 500mg");
const dose = fc.constantFrom("", "1+1+1", "2+2+2", "0+0+1", "0+0+2", "1+0+1");
const food = fc.constantFrom("", "food", "after food");
const duration = fc.constantFrom("", "5 days", "7 week", "4 week", "7 days", "Continue");
const date = fc.constantFrom(VISIT_DATE, "10/01/2024", "20/07/2026");

// What a doctor's ℞ pad holds: medicines, each with 0–2 tapers, and notes.
const padBlock: fc.Arbitrary<RxItem[]> = fc.oneof(
  { weight: 4, arbitrary: fc.tuple(drug, dose, food, duration, fc.array(fc.tuple(dose, food, duration), { maxLength: 2 })).map(
      ([d, ds, f, du, tapers]) => [
        rxItem({ drug: d, dose: ds, instruction: f, duration: du, isCont: false }),
        ...tapers.map(([tds, tf, tdu]) => rxItem({ drug: "", dose: tds, instruction: tf, duration: tdu, isCont: true })),
      ],
    ) },
  { weight: 1, arbitrary: fc.constant(null).map((): RxItem[] => [rxItem({ drug: "Take rest for 2 weeks", isNote: true })]) },
);
const pad: fc.Arbitrary<RxItem[]> = fc.array(padBlock, { maxLength: 5 }).map((bs) => bs.flat());
/** What the mirror derives from a pad — the only thing the app ever passes in. */
const derived: fc.Arbitrary<string[]> = pad.map((p) => rxDrugHistoryEntries(p, VISIT_DATE));

// What a stored history holds: earlier visits, hand-typed lines, notes, legacy
// prefixes, tapers — and sometimes the very line today's pad produces.
const storedEntry = fc.oneof(
  fc.tuple(date, drug, dose, food, duration).map(([dt, d, ds, f, du]) => `${dt}: ${d} — ${ds} — ${f} — ${du}`),
  fc.tuple(date, dose, food, duration).map(([dt, ds, f, du]) => `${dt}(cont): ${ds} — ${f} — ${du}`),
  fc.tuple(date, anyText(12)).map(([dt, t]) => `${dt}(note): ${t}`),
  fc.constantFrom("Current: Losartan 50mg — 1+0+1 — after food — continuing", "Past: Losartan 50mg — 1+0+1 — after food — continuing", NAPA_ENTRY, MESACOL_ENTRY, ...STORED_DRUG_HISTORY()),
  anyText(16),
);
const stored: fc.Arbitrary<string[]> = fc.array(storedEntry, { maxLength: 10 });

const count = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};
const CONT = /^\d{2}\/\d{2}\/\d{4}\(cont\):/;
const blocks = (list: string[]) => {
  const out: string[][] = [];
  for (const e of list) (CONT.test(e) && out.length ? out[out.length - 1] : (out.push([]), out[out.length - 1])).push(e);
  return out;
};
const containsRun = (list: string[], run: string[]) =>
  list.some((_, i) => i + run.length <= list.length && run.every((e, j) => list[i + j] === e));

describe("syncRxDrugHistory — an empty prevDerived withdraws nothing", () => {
  it("⚕️ never removes or moves a stored entry: the stored list is a prefix of the result", () => {
    fc.assert(
      fc.property(stored, derived, (s, next) => {
        const before = [...s];
        const out = syncRxDrugHistory(s, [], next);
        expect(out.slice(0, s.length)).toEqual(before);
        expect(s).toEqual(before); // the caller's array is not mutated
      }),
    );
  });

  it("only ever adds entries that today's ℞ derived", () => {
    fc.assert(
      fc.property(stored, derived, (s, next) => {
        const added = syncRxDrugHistory(s, [], next).slice(s.length);
        for (const e of added) expect(next).toContain(e);
      }),
    );
  });

  it("holds for prevDerived null / undefined too (a caller with no memory at all)", () => {
    fc.assert(
      fc.property(stored, derived, (s, next) => {
        const expected = syncRxDrugHistory(s, [], next);
        expect(syncRxDrugHistory(s, null as unknown as string[], next)).toEqual(expected);
        expect(syncRxDrugHistory(s, undefined as unknown as string[], next)).toEqual(expected);
      }),
    );
  });
});

describe("syncRxDrugHistory — idempotent", () => {
  it("applying the same derived set twice equals applying it once", () => {
    fc.assert(
      fc.property(stored, derived, derived, (s, prev, next) => {
        const once = syncRxDrugHistory(s, prev, next);
        // The effect's next tick: the pad has not changed, so prev === next.
        expect(syncRxDrugHistory(once, next, next)).toEqual(once);
        // A reload in between: the caller has lost its memory of the pad.
        expect(syncRxDrugHistory(once, [], next)).toEqual(once);
        expect(sameEntries(syncRxDrugHistory(once, next, next), once)).toBe(true);
      }),
    );
  });

  it("is a pure function of its inputs", () => {
    fc.assert(
      fc.property(stored, derived, derived, (s, prev, next) => {
        expect(syncRxDrugHistory([...s], [...prev], [...next])).toEqual(syncRxDrugHistory(s, prev, next));
      }),
    );
  });
});

describe("syncRxDrugHistory — it withdraws only what it added", () => {
  it("⚕️ never removes a hand-typed stored entry, whatever the pad did", () => {
    fc.assert(
      fc.property(stored, derived, derived, (s, prev, next) => {
        const out = syncRxDrugHistory(s, prev, next);
        const mine = new Set(prev); // what the mirror contributed last time
        const kept = count(out);
        for (const [entry, n] of count(s.filter((e) => !mine.has(e)))) {
          expect(kept.get(entry) ?? 0, entry).toBeGreaterThanOrEqual(n);
        }
        // …and they keep their order relative to one another.
        const handTyped = s.filter((e) => !mine.has(e));
        let at = -1;
        for (const e of handTyped) {
          at = out.indexOf(e, at + 1);
          expect(at, e).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it("never removes anything the ℞ still carries", () => {
    fc.assert(
      fc.property(stored, derived, derived, (s, prev, next) => {
        const out = syncRxDrugHistory(s, prev, next);
        for (const e of next) expect(out).toContain(e);
      }),
    );
  });

  it("removes at most what the ℞ dropped: every lost entry was in prevDerived and left the pad as a block", () => {
    fc.assert(
      fc.property(stored, derived, derived, (s, prev, next) => {
        const out = count(syncRxDrugHistory(s, prev, next));
        const nextKeys = new Set(blocks(next).map((b) => b.join("\n")));
        const withdrawable = new Set(blocks(prev).filter((b) => !nextKeys.has(b.join("\n"))).flat());
        for (const [entry, n] of count(s)) {
          if ((out.get(entry) ?? 0) < n) expect(withdrawable.has(entry), entry).toBe(true);
        }
      }),
    );
  });
});

describe("syncRxDrugHistory — a taper never leaves its medicine", () => {
  it("⚕️ every medicine on the ℞ is in the history with its own tapers directly under it", () => {
    fc.assert(
      fc.property(stored, derived, derived, (s, prev, next) => {
        const out = syncRxDrugHistory(s, prev, next);
        for (const b of blocks(next)) expect(containsRun(out, b), b.join(" | ")).toBe(true);
      }),
    );
  });

  // The live sequence: the doctor edits the pad step by step and the effect
  // runs after each edit, remembering what it derived the time before.
  it("holds across a whole editing session, and hand-typed history is untouched at the end of it", () => {
    fc.assert(
      fc.property(stored, fc.array(derived, { minLength: 1, maxLength: 6 }), (s, session) => {
        // Hand-typed = nothing the mirror could have produced for today's visit.
        const handTyped = s.filter((e) => !e.startsWith(VISIT_DATE));
        let list = handTyped;
        let prev: string[] = [];
        for (const next of session) {
          list = syncRxDrugHistory(list, prev, next);
          for (const b of blocks(next)) expect(containsRun(list, b)).toBe(true);
          prev = next;
        }
        expect(list.filter((e) => !e.startsWith(VISIT_DATE))).toEqual(handTyped);
        // Clearing the pad withdraws every line it wrote and nothing else.
        expect(syncRxDrugHistory(list, prev, [])).toEqual(handTyped);
      }),
    );
  });
});

describe("rxDrugHistoryEntries — a taper is recorded under its own medicine", () => {
  /** For each (cont) entry, the medicine entry it sits under in the output. */
  const headsInEntries = (entries: string[]) => {
    const out: [string, string][] = [];
    let head = "";
    for (const e of entries) {
      if (CONT.test(e)) out.push([e, head]);
      else head = e;
    }
    return out;
  };
  /** The same pairs, read off the pad the doctor wrote. */
  const headsOnPad = (p: RxItem[]) => {
    const out: [string, string][] = [];
    const seen = new Set<string>();
    let head = "";
    for (const i of p) {
      if (i.isNote) continue;
      if (!i.isCont) { head = `${VISIT_DATE}: ${i.drug.trim()} — ${i.dose.trim()} — ${i.instruction.trim()} — ${i.duration.trim()}`; continue; }
      if (!i.dose.trim() && !i.instruction.trim() && !i.duration.trim()) continue;
      const entry = `${VISIT_DATE}(cont): ${i.dose.trim()} — ${i.instruction.trim()} — ${i.duration.trim()}`;
      if (seen.has(`${head}\n${entry}`)) continue; // "two identical lines carry one fact"
      seen.add(`${head}\n${entry}`);
      out.push([entry, head]);
    }
    return out;
  };
  const headLine = (i: RxItem) => [i.drug, i.dose, i.instruction, i.duration].join("|");

  it("⚕️ every (cont) entry sits under the medicine it was written under (no medicine line written twice)", () => {
    fc.assert(
      fc.property(pad, (p) => {
        const heads = p.filter((i) => !i.isNote && !i.isCont).map(headLine);
        fc.pre(new Set(heads).size === heads.length);
        const sort = (xs: [string, string][]) => xs.map((x) => x.join(" ⇐ ")).sort();
        expect(sort(headsInEntries(rxDrugHistoryEntries(p, VISIT_DATE)))).toEqual(sort(headsOnPad(p)));
      }),
    );
  });

  // DEFECT-D3: when the SAME medicine line is on the pad twice and the second copy has a taper, the taper is recorded under whichever medicine sits between them.
  // Minimal counter-example (rxItems → entries):
  //   Pred 2+0+0 · 5 days | Napa 1+1+1 | Pred 2+0+0 · 5 days | ↳ 1+0+0 · 3 days
  //   ⇒ ["…: Pred — 2+0+0 —  — 5 days", "…: Napa — 1+1+1 —  — ", "…(cont): 1+0+0 —  — 3 days"]
  //   The (cont) line is Pred's taper; in the history it now reads as Napa's.
  // Source: src/lib/rxDrugHistory.ts:55-74 — the duplicate head is dropped by `seen`
  // (line 71) but its taper is still pushed (line 73), at the END of the list, so it
  // attaches by position to the last medicine emitted. client/CLAUDE.md: "A taper never
  // leaves its medicine … a dose for the wrong drug."
  it.fails("DEFECT-D3: a taper under a repeated medicine line stays with that medicine", () => {
    const entries = rxDrugHistoryEntries([
      rxItem({ drug: "Pred", dose: "2+0+0", duration: "5 days", isCont: false }),
      rxItem({ drug: "Napa", dose: "1+1+1", isCont: false }),
      rxItem({ drug: "Pred", dose: "2+0+0", duration: "5 days", isCont: false }),
      rxItem({ drug: "", dose: "1+0+0", duration: "3 days", isCont: true }),
    ], VISIT_DATE);
    expect(headsInEntries(entries)).toEqual([[`${VISIT_DATE}(cont): 1+0+0 —  — 3 days`, `${VISIT_DATE}: Pred — 2+0+0 —  — 5 days`]]);
  });
  it.fails("DEFECT-D3 (property): the same, for any repeated line with a taper and any medicine between", () => {
    const twoDrugs = fc.tuple(drug, drug).filter(([a, b]) => a !== b);
    const taper = fc.tuple(dose, food, duration).filter((t) => t.some((c) => c !== ""));
    fc.assert(
      fc.property(twoDrugs, dose, food, duration, taper, ([a, b], ds, f, du, [tds, tf, tdu]) => {
        const repeated = rxItem({ drug: a, dose: ds, instruction: f, duration: du, isCont: false });
        const p = [repeated, rxItem({ drug: b, isCont: false }), { ...repeated }, rxItem({ dose: tds, instruction: tf, duration: tdu, isCont: true })];
        expect(headsInEntries(rxDrugHistoryEntries(p, VISIT_DATE))).toEqual(headsOnPad(p));
      }),
    );
  });
});

describe("rxDrugHistoryEntries — total, and echoes only what was typed", () => {
  it("never throws, and records nothing under a visit date that is not dd/mm/yyyy", () => {
    fc.assert(
      fc.property(pad, anyText(12), (p, junkDate) => {
        fc.pre(!/^\d{2}\/\d{2}\/\d{4}$/.test(junkDate));
        expect(rxDrugHistoryEntries(p, junkDate)).toEqual([]);
      }),
    );
  });

  it("every entry is stamped with the visit date and built only from that pad's own text", () => {
    fc.assert(
      fc.property(pad, (p) => {
        const typed = p.flatMap((i) => [i.drug, i.dose, i.instruction, i.duration]).map((t) => t.trim());
        for (const e of rxDrugHistoryEntries(p, VISIT_DATE)) {
          expect(e.startsWith(`${VISIT_DATE}: `) || e.startsWith(`${VISIT_DATE}(cont): `)).toBe(true);
          const cells = e.replace(/^\d{2}\/\d{2}\/\d{4}(\(cont\))?: /, "").split(" — ");
          for (const c of cells) expect(typed).toContain(c);
        }
      }),
    );
  });

  it("never records a note as a medication", () => {
    fc.assert(
      fc.property(pad, (p) => {
        const notes = p.filter((i) => i.isNote).map((i) => i.drug);
        for (const e of rxDrugHistoryEntries(p, VISIT_DATE)) for (const n of notes) expect(e).not.toContain(n);
      }),
    );
  });
});
