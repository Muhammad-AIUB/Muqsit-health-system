import { describe, it, expect } from "vitest";
import { habitToRows, resolveGeneric } from "./rxHabitRows";
import { rxItemsFromRows } from "./rxRows";
import { checkRxAlerts, rxAlertsByLine } from "./rxAlerts";
import { fmtMedicine } from "./rxShorthand";
import type { MedicineHit, RxHabitItem } from "@/lib/api";

// ⚕️ SUGGESTION FIRST, THEN THE WARNING — the Barcavir case.
//
// Barcavir is the medicine where both halves of the ℞ pad fire at once: the
// doctor has a learned "Your usual" instruction for it, AND writing it raises a
// prescribing warning ("Entecavir is contraindicated in pregnancy and
// lactation. Use tenofovir disoproxil.") below the pad.
//
// The warning rule is written against the GENERIC (`entecavir`), while the ℞
// line carries the BRAND ("Tablet. Barcavir 0.5 mg"). `RxItem.generic` is what
// bridges them, and it is set only when the line comes from the medicines
// dropdown — a habit learned from history cannot carry one of its own.
//
// So the fast path is the dangerous one: a doctor who used to pick from the
// dropdown (generic set, warning fires) starts clicking the quicker suggestion,
// and the warning silently stops appearing. That is a safety feature lost
// because an unrelated flow got faster.
//
// These tests walk the whole chain the way the app does:
//   suggestion → resolveGeneric → Row → RxItem → checkRxAlerts
// and assert the warning still lands.

const BARCAVIR_HABIT: RxHabitItem = {
  id: "h_barcavir",
  // Exactly as learned from production: note the space in "0.5 mg".
  drugLabel: "Tablet. Barcavir 0.5 mg",
  dose: "1+0+0",
  food: "",
  duration: "Continue",
  contLines: [],
  patientCount: 1,
  lastUsedAt: "2026-08-10T00:00:00.000Z",
  pinned: false,
};

// Exactly as the `medicines` table holds it.
const BARCAVIR_MED: MedicineHit = {
  id: "m_barcavir",
  brandName: "Barcavir",
  genericName: "Entecavir",
  dosageForm: "Tablet",
  strength: "0.5 mg",
  company: "Incepta",
  priceRaw: null,
};

const PREGNANT_SIDEBAR = [{ label: "Chief complaints", items: ["Pregnant, 12 weeks"] }];
const CONTRAINDICATION =
  "Entecavir is contraindicated in pregnancy and lactation. Use tenofovir disoproxil.";

/** The whole chain: click a suggestion, then run the prescribing check. */
function alertsAfterClickingSuggestion(loadedMedicines: MedicineHit[]) {
  const generic = resolveGeneric(BARCAVIR_HABIT.drugLabel, loadedMedicines);
  const rows = habitToRows(BARCAVIR_HABIT, generic);
  const items = rxItemsFromRows(rows);
  return checkRxAlerts({
    rxDrugs: items.map((i) => ({ text: i.drug, generic: i.generic })),
    sidebar: PREGNANT_SIDEBAR,
  });
}

describe("Barcavir — the warning must survive the suggestion", () => {
  it("resolves Entecavir from the medicine results loaded for the same query", () => {
    expect(resolveGeneric(BARCAVIR_HABIT.drugLabel, [BARCAVIR_MED])).toBe("Entecavir");
  });

  it("matches despite the space in the strength — habit says '0.5 mg', key says '0.5mg'", () => {
    // A raw label comparison happens to work here; the normalised one is what
    // makes it survive the next spelling difference.
    expect(fmtMedicine(BARCAVIR_MED)).toBe("Tablet. Barcavir 0.5 mg");
    expect(resolveGeneric("Tablet. Barcavir 0.5mg", [BARCAVIR_MED])).toBe("Entecavir");
    expect(resolveGeneric("TABLET.  Barcavir   0.5 MG", [BARCAVIR_MED])).toBe("Entecavir");
  });

  it("STILL RAISES the contraindication after the suggestion is clicked", () => {
    const check = alertsAfterClickingSuggestion([BARCAVIR_MED]);
    expect(check.alerts.map((a) => a.message)).toContain(CONTRAINDICATION);
  });

  it("raises exactly the same warning as picking the medicine from the dropdown", () => {
    const viaSuggestion = alertsAfterClickingSuggestion([BARCAVIR_MED]);
    const viaDropdown = checkRxAlerts({
      rxDrugs: [{ text: fmtMedicine(BARCAVIR_MED), generic: BARCAVIR_MED.genericName ?? undefined }],
      sidebar: PREGNANT_SIDEBAR,
    });
    expect(viaSuggestion.alerts.map((a) => a.message)).toEqual(
      viaDropdown.alerts.map((a) => a.message),
    );
  });

  it("keeps the dose the doctor actually prescribed — the suggestion is verbatim", () => {
    const rows = habitToRows(BARCAVIR_HABIT, "Entecavir");
    expect(rows[0]).toMatchObject({ dose: "1+0+0", food: "", duration: "Continue" });
  });

  it("does NOT raise the warning when the patient has no such condition", () => {
    const generic = resolveGeneric(BARCAVIR_HABIT.drugLabel, [BARCAVIR_MED]);
    const items = rxItemsFromRows(habitToRows(BARCAVIR_HABIT, generic));
    const check = checkRxAlerts({
      rxDrugs: items.map((i) => ({ text: i.drug, generic: i.generic })),
      sidebar: [{ label: "Chief complaints", items: ["Fever for 3 days"] }],
    });
    expect(check.alerts.map((a) => a.message)).not.toContain(CONTRAINDICATION);
  });

  it("documents the known gap: with the medicine list empty, the brand carries no generic", () => {
    // This is the SAME state as a hand-typed brand — no new gap, and no
    // invented generic. It is why `resolveGeneric` reads the results already
    // loaded for the query rather than guessing.
    expect(resolveGeneric(BARCAVIR_HABIT.drugLabel, [])).toBeUndefined();
    const check = alertsAfterClickingSuggestion([]);
    expect(check.alerts.map((a) => a.message)).not.toContain(CONTRAINDICATION);
  });

  it("never lends another medicine's generic — 1 mg is not 0.5 mg", () => {
    const oneMg: MedicineHit = { ...BARCAVIR_MED, id: "m2", strength: "1 mg" };
    expect(resolveGeneric("Tablet. Barcavir 0.5 mg", [oneMg])).toBeUndefined();
  });
});

// ⚕️ The warning is drawn against the medicine that raised it, on BOTH surfaces.
// `rxAlertsByLine` is the one map the editor bubbles and the printed callouts
// both read — two independently-derived versions of a contraindication could
// disagree, and the printed one is the legal document.
describe("rxAlertsByLine — which medicine each warning belongs to", () => {
  it("attaches the Barcavir contraindication to the Barcavir line, not its neighbours", () => {
    const byLine = rxAlertsByLine({
      rxDrugs: [
        { text: "Tablet. Napa 500 mg" },
        { text: "Tablet. Barcavir 0.5 mg", generic: "Entecavir" },
        { text: "Capsule. Sergel 20 mg" },
      ],
      sidebar: PREGNANT_SIDEBAR,
    });
    expect(byLine.get(1)).toEqual([CONTRAINDICATION]);
    expect(byLine.get(0)).toBeUndefined();
    expect(byLine.get(2)).toBeUndefined();
  });

  it("tells two strengths of the same brand apart by position", () => {
    // Both are entecavir, so both are contraindicated — and each carries the
    // warning on its own line. Matching back by drug text could not do this.
    const byLine = rxAlertsByLine({
      rxDrugs: [
        { text: "Tablet. Barcavir 0.5 mg", generic: "Entecavir" },
        { text: "Tablet. Barcavir 1 mg", generic: "Entecavir" },
      ],
      sidebar: PREGNANT_SIDEBAR,
    });
    expect(byLine.get(0)).toEqual([CONTRAINDICATION]);
  });

  it("is empty when nothing fires", () => {
    const byLine = rxAlertsByLine({
      rxDrugs: [{ text: "Tablet. Barcavir 0.5 mg", generic: "Entecavir" }],
      sidebar: [{ label: "Chief complaints", items: ["Fever"] }],
    });
    expect(byLine.size).toBe(0);
  });

  it("indexes against the caller's array even when a line is blank", () => {
    // Empty rows are filtered out of the matcher's pool, but the index must
    // still point at the caller's own line — otherwise the warning shifts up.
    const byLine = rxAlertsByLine({
      rxDrugs: [
        { text: "" },
        { text: "" },
        { text: "Tablet. Barcavir 0.5 mg", generic: "Entecavir" },
      ],
      sidebar: PREGNANT_SIDEBAR,
    });
    expect(byLine.get(2)).toEqual([CONTRAINDICATION]);
    expect(byLine.get(0)).toBeUndefined();
  });

  it("never repeats the same sentence against one medicine", () => {
    const byLine = rxAlertsByLine({
      rxDrugs: [{ text: "Tablet. Barcavir 0.5 mg", generic: "Entecavir" }],
      sidebar: [{ label: "Chief complaints", items: ["Pregnant", "Lactating"] }],
    });
    expect(byLine.get(0)).toHaveLength(1);
  });

  it("lands on the line reached through a clicked suggestion", () => {
    // The whole point: the fast path must carry the warning too.
    const generic = resolveGeneric(BARCAVIR_HABIT.drugLabel, [BARCAVIR_MED]);
    const items = rxItemsFromRows(habitToRows(BARCAVIR_HABIT, generic));
    const byLine = rxAlertsByLine({
      rxDrugs: items.filter((i) => !i.isNote).map((i) => ({ text: i.drug, generic: i.generic })),
      sidebar: PREGNANT_SIDEBAR,
    });
    expect(byLine.get(0)).toEqual([CONTRAINDICATION]);
  });
});
