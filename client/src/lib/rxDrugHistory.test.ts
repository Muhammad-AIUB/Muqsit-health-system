import { describe, it, expect } from "vitest";
import { rxDrugHistoryEntries, syncRxDrugHistory, sameEntries } from "@/lib/rxDrugHistory";
import { drugMentions } from "@/lib/drugHistorySummary";
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
});

describe("sameEntries", () => {
  it("compares by value and order", () => {
    expect(sameEntries(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameEntries(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameEntries(["a"], ["a", "b"])).toBe(false);
  });
});
