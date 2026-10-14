# Add medicine (Drug history) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "+ Add medicine" row to each Drug-history tab (Current medications, Distant past medication) that lets the doctor type a medicine name — with the same database-backed suggestions the ℞ pad's medicine box uses — plus dose/food/duration, and append it as a brand-new, date-stamped line in the patient's drug history.

**Architecture:** One new pure lib (`lib/drugHistoryAdd.ts`) builds the stored entry string and checks for an exact duplicate, reusing `rxDrugHistory.ts`'s own separator and no-date marker so the format can never drift. One new, self-contained component (`AddMedicineRow.tsx`) owns all the add-row's transient UI state and is instantiated once per tab inside `DrugHistoryField.tsx`, which wires its `onAdd` straight into `MuqsitContext`'s existing `setDrugHistory` — no new API route, no schema change, no new permission key.

**Tech Stack:** React + TypeScript (Next.js client), Vitest + Testing Library (jsdom) for tests.

## Global Constraints

- Add-only: never edit or remove an existing stored Drug-history row (`client/CLAUDE.md` standing rule).
- Nothing invented: a blank dose/food/duration at add-time is stored blank.
- No new permission key — gated exactly as the rest of the field already is (`rx.drugHistory`, via the existing `Lock` in `LeftColumn.tsx`).
- Reuse the existing `" — "` separator and the existing "no date" marker — do not hand-roll a second copy of either.
- Duplicate check: same medicine (`sameMedicine`/`MedicineMap` rules in `lib/medicineKey.ts`) **and** same dose/food/duration (`instructionsKey`) refuses the add; a different dose is always a new line.
- No `jest-dom` in this repo — assert on plain DOM properties (`el.disabled`, `el.value`), never `toBeDisabled()`/`toBeInTheDocument()`.
- Inline styles only, reusing `@/theme` / `@/theme/styles` tokens (`inputSm`, `btnPrimary`, `btnDisabled`, `btnClose`, `shadowMenu`) — no new hand-written paddings/shadows.

---

## Task 1: Export `SEP` from `rxDrugHistory.ts`

**Files:**
- Modify: `client/src/lib/rxDrugHistory.ts:28`

**Interfaces:**
- Produces: `SEP: string` (`" — "`), importable by `lib/drugHistoryAdd.ts` (Task 2).

- [ ] **Step 1: Export the existing constant**

Change line 28 from:

```ts
const SEP = " — ";
```

to:

```ts
export const SEP = " — ";
```

- [ ] **Step 2: Run the existing test file to confirm nothing broke**

Run: `cd client && npx vitest run src/lib/rxDrugHistory.test.ts`
Expected: all existing tests still PASS (a one-word export change cannot affect behaviour).

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/rxDrugHistory.ts
git commit -m "refactor(rx): export SEP from rxDrugHistory so a new writer can reuse it"
```

---

## Task 2: `lib/drugHistoryAdd.ts` — pure entry builder + duplicate check

**Files:**
- Create: `client/src/lib/drugHistoryAdd.ts`
- Test: `client/src/lib/drugHistoryAdd.test.ts`

**Interfaces:**
- Consumes: `SEP` from `@/lib/rxDrugHistory` (Task 1); `MedicineMap`, `instructionsKey` from `@/lib/medicineKey` (already exist).
- Produces: `DrugHistoryAddInput` (`{ drug: string; dose: string; food: string; duration: string }`), `NO_DATE: string`, `buildDrugHistoryEntry(date: string, input: DrugHistoryAddInput): string`, `isDuplicateDrugHistoryEntry(input: DrugHistoryAddInput, existing: DrugHistoryAddInput[]): boolean` — all consumed by `AddMedicineRow.tsx` (Task 3) and `DrugHistoryField.tsx` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/drugHistoryAdd.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDrugHistoryEntry, isDuplicateDrugHistoryEntry, NO_DATE, type DrugHistoryAddInput } from "./drugHistoryAdd";

describe("buildDrugHistoryEntry", () => {
  it("joins the four cells with the stored separator", () => {
    expect(buildDrugHistoryEntry("14/10/2026", { drug: "Tablet. Napa 500 mg", dose: "1+0+1", food: "After meal", duration: "5 days" }))
      .toBe("14/10/2026: Tablet. Napa 500 mg — 1+0+1 — After meal — 5 days");
  });

  it("keeps a blank cell blank — nothing is invented", () => {
    expect(buildDrugHistoryEntry("14/10/2026", { drug: "Tablet. Napa 500 mg", dose: "", food: "", duration: "" }))
      .toBe("14/10/2026: Tablet. Napa 500 mg —  —  — ");
  });

  it("trims surrounding whitespace from every cell", () => {
    expect(buildDrugHistoryEntry("14/10/2026", { drug: "  Tablet. Napa 500 mg  ", dose: " 1+0+1 ", food: " After meal ", duration: " 5 days " }))
      .toBe("14/10/2026: Tablet. Napa 500 mg — 1+0+1 — After meal — 5 days");
  });

  it("stamps the no-date marker for a Distant-past addition", () => {
    expect(buildDrugHistoryEntry(NO_DATE, { drug: "Metformin 500mg", dose: "", food: "", duration: "" }))
      .toBe("01/01/2000: Metformin 500mg —  —  — ");
  });
});

describe("isDuplicateDrugHistoryEntry", () => {
  const existing: DrugHistoryAddInput[] = [
    { drug: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days" },
  ];

  it("is a duplicate: same medicine, same instruction", () => {
    expect(isDuplicateDrugHistoryEntry({ drug: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days" }, existing)).toBe(true);
  });

  it("is a duplicate even when the medicine and instruction were typed another way", () => {
    expect(isDuplicateDrugHistoryEntry({ drug: "tab napa 500mg", dose: "1 + 1 + 1", food: "after meal", duration: "5 days" }, existing)).toBe(true);
  });

  it("is NOT a duplicate at a different dose — a different dose is always a new line", () => {
    expect(isDuplicateDrugHistoryEntry({ drug: "Tablet. Napa 500 mg", dose: "1+0+1", food: "After meal", duration: "5 days" }, existing)).toBe(false);
  });

  it("is NOT a duplicate for a different medicine", () => {
    expect(isDuplicateDrugHistoryEntry({ drug: "Tablet. Napa One 1000 mg", dose: "1+1+1", food: "After meal", duration: "5 days" }, existing)).toBe(false);
  });

  it("is never a duplicate against an empty tab", () => {
    expect(isDuplicateDrugHistoryEntry({ drug: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days" }, [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run src/lib/drugHistoryAdd.test.ts`
Expected: FAIL — `Cannot find module './drugHistoryAdd'` (file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `client/src/lib/drugHistoryAdd.ts`:

```ts
// ⚕️ Builds and checks ONE new, typed-in Drug-history entry — the
// "+ Add medicine" row on either tab of DrugHistoryField (physician's
// decision, 2026-10-14). This is an ADD, never a correction: it never reads
// or rewrites an existing stored line, so the ℞ mirror's own "withdraws
// only what it added" rule (lib/rxDrugHistory.ts#syncRxDrugHistory) keeps
// protecting it exactly as it already protects a doctor's hand-typed note
// — pinned by rxDrugHistory.test.ts's "never removes a medicine the doctor
// typed into Drug history by hand", which this function's output matches
// byte-for-byte.
//
// Deliberately does not import DrugHistoryField's own parser — the same
// independence lib/rxDrugHistory.ts and lib/drugHistorySummary.ts already
// keep, so the entry format is read in exactly one place.

import { SEP } from "@/lib/rxDrugHistory";
import { MedicineMap, instructionsKey } from "@/lib/medicineKey";

export interface DrugHistoryAddInput {
  drug: string;
  dose: string;
  food: string;
  duration: string;
}

/** The marker DrugHistoryField groups under "Earlier (no date)". */
export const NO_DATE = "01/01/2000";

/**
 * "dd/mm/yyyy: Drug — dose — food — duration" — nothing invented. A cell
 * left blank at add-time is stored blank, exactly like a stored entry with
 * no dose that `drugHistorySelect.ts` already carries unchanged.
 */
export function buildDrugHistoryEntry(date: string, input: DrugHistoryAddInput): string {
  return `${date}: ${input.drug.trim()}${SEP}${input.dose.trim()}${SEP}${input.food.trim()}${SEP}${input.duration.trim()}`;
}

/**
 * True only when `existing` already holds the SAME medicine (`MedicineMap`'s
 * own matching — spacing, capitals and `Tab` for `Tablet.` are typing, not
 * meaning) at the SAME dose, food and duration (`instructionsKey`,
 * capitals/spacing set aside). A different dose of the same medicine is
 * always a new line — which dose is right is the doctor's judgement, never
 * this function's.
 */
export function isDuplicateDrugHistoryEntry(input: DrugHistoryAddInput, existing: DrugHistoryAddInput[]): boolean {
  const map = new MedicineMap<true>();
  for (const e of existing) map.add(e.drug, true, instructionsKey(e.dose, e.food, e.duration));
  return map.has(input.drug, instructionsKey(input.dose, input.food, input.duration));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd client && npx vitest run src/lib/drugHistoryAdd.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/drugHistoryAdd.ts client/src/lib/drugHistoryAdd.test.ts
git commit -m "feat(rx): pure builder + duplicate check for a typed Drug-history entry"
```

---

## Task 3: `AddMedicineRow.tsx` — the self-contained add-row component

**Files:**
- Create: `client/src/components/prescription/AddMedicineRow.tsx`
- Test: `client/src/components/prescription/AddMedicineRow.test.tsx`

**Interfaces:**
- Consumes: `useMedicineSearch(query: string): { results: MedicineHit[]; isLoading: boolean }` from `@/hooks/useMedicineSearch` (existing); `fmtMedicine` from `@/lib/rxShorthand` (existing); `buildDrugHistoryEntry`/`isDuplicateDrugHistoryEntry`/`DrugHistoryAddInput` from `@/lib/drugHistoryAdd` (Task 2, though this component only needs `isDuplicateDrugHistoryEntry` and the type — `buildDrugHistoryEntry` is called by the parent, Task 4); `inputSm`, `btnPrimary`, `btnDisabled`, `btnClose`, `shadowMenu` from `@/theme/styles`; `C`, `font` from `@/theme`.
- Produces: `export default function AddMedicineRow(props: { existing: DrugHistoryAddInput[]; tabLabel: string; onAdd: (entry: DrugHistoryAddInput) => void }): JSX.Element` — consumed by `DrugHistoryField.tsx` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `client/src/components/prescription/AddMedicineRow.test.tsx`:

```tsx
// @vitest-environment jsdom
//
// ⚕️ The "+ Add medicine" row (physician's decision, 2026-10-14). Collapsed
// by default — nothing here is typeable until the doctor presses it, which
// is what lets DrugHistoryField.test.tsx's "offers nothing to type into, on
// either tab" keep passing unchanged: this row is the ONE typeable thing in
// the modal, and it is opt-in.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AddMedicineRow from "./AddMedicineRow";
import type { MedicineHit } from "@/lib/api";

const HITS: MedicineHit[] = [
  { id: "1", brandName: "Napa", genericName: "Paracetamol", dosageForm: "Tablet", strength: "500 mg", company: null, priceRaw: null },
  { id: "2", brandName: "Napa Extra", genericName: "Paracetamol+Caffeine", dosageForm: "Tablet", strength: "500 mg+65 mg", company: null, priceRaw: null },
];
vi.mock("@/hooks/useMedicineSearch", () => ({
  useMedicineSearch: (q: string) => ({ results: q.trim().length >= 2 ? HITS : [], isLoading: false }),
}));

afterEach(() => cleanup());

const openRow = (existing: { drug: string; dose: string; food: string; duration: string }[] = []) => {
  const onAdd = vi.fn();
  render(<AddMedicineRow existing={existing} tabLabel="Current medications" onAdd={onAdd} />);
  fireEvent.click(screen.getByText("+ Add medicine"));
  return { onAdd };
};

describe("AddMedicineRow — collapsed by default", () => {
  it("shows only the + Add medicine button, nothing typeable", () => {
    render(<AddMedicineRow existing={[]} tabLabel="Current medications" onAdd={vi.fn()} />);
    expect(screen.getByText("+ Add medicine")).toBeTruthy();
    expect(document.querySelectorAll("input")).toHaveLength(0);
  });
});

describe("AddMedicineRow — opened", () => {
  it("offers four boxes: medicine name, dose, food, duration", () => {
    openRow();
    expect(screen.getByLabelText("Medicine name")).toBeTruthy();
    expect(screen.getByLabelText("Dose")).toBeTruthy();
    expect(screen.getByLabelText("Food")).toBeTruthy();
    expect(screen.getByLabelText("Duration")).toBeTruthy();
  });

  it("shows database suggestions once two letters are typed", () => {
    openRow();
    fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: "na" } });
    expect(screen.getByText("Tablet. Napa 500 mg")).toBeTruthy();
    expect(screen.getByText("Tablet. Napa Extra 500 mg+65 mg")).toBeTruthy();
  });

  it("shows no suggestions under two letters", () => {
    openRow();
    fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: "n" } });
    expect(screen.queryByText("Tablet. Napa 500 mg")).toBeNull();
  });

  it("picking a suggestion fills the medicine name box", () => {
    openRow();
    fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: "na" } });
    fireEvent.click(screen.getByText("Tablet. Napa 500 mg"));
    expect((screen.getByLabelText("Medicine name") as HTMLInputElement).value).toBe("Tablet. Napa 500 mg");
  });

  it("Add is disabled until a medicine name is typed", () => {
    openRow();
    expect((screen.getByText("Add") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: "Tablet. Napa 500 mg" } });
    expect((screen.getByText("Add") as HTMLButtonElement).disabled).toBe(false);
  });

  it("adds with blanks kept blank — nothing invented", () => {
    const { onAdd } = openRow();
    fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: "Tablet. Napa 500 mg" } });
    fireEvent.click(screen.getByText("Add"));
    expect(onAdd).toHaveBeenCalledWith({ drug: "Tablet. Napa 500 mg", dose: "", food: "", duration: "" });
  });

  it("adds with dose, food and duration filled in", () => {
    const { onAdd } = openRow();
    fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: "Tablet. Napa 500 mg" } });
    fireEvent.change(screen.getByLabelText("Dose"), { target: { value: "1+0+1" } });
    fireEvent.change(screen.getByLabelText("Food"), { target: { value: "After meal" } });
    fireEvent.change(screen.getByLabelText("Duration"), { target: { value: "5 days" } });
    fireEvent.click(screen.getByText("Add"));
    expect(onAdd).toHaveBeenCalledWith({ drug: "Tablet. Napa 500 mg", dose: "1+0+1", food: "After meal", duration: "5 days" });
  });

  it("clears the boxes and keeps the row open after a successful add", () => {
    const { onAdd } = openRow();
    fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: "Tablet. Napa 500 mg" } });
    fireEvent.click(screen.getByText("Add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Medicine name") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("+ Add medicine")).toBeNull(); // still open
  });

  it("refuses an exact duplicate and does not call onAdd", () => {
    const existing = [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days" }];
    const { onAdd } = openRow(existing);
    fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: "Tablet. Napa 500 mg" } });
    fireEvent.change(screen.getByLabelText("Dose"), { target: { value: "1+1+1" } });
    fireEvent.change(screen.getByLabelText("Food"), { target: { value: "After meal" } });
    fireEvent.change(screen.getByLabelText("Duration"), { target: { value: "5 days" } });
    fireEvent.click(screen.getByText("Add"));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText("Already in Current medications")).toBeTruthy();
  });

  it("allows the same medicine at a different dose", () => {
    const existing = [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days" }];
    const { onAdd } = openRow(existing);
    fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: "Tablet. Napa 500 mg" } });
    fireEvent.change(screen.getByLabelText("Dose"), { target: { value: "1+0+1" } });
    fireEvent.click(screen.getByText("Add"));
    expect(onAdd).toHaveBeenCalledWith({ drug: "Tablet. Napa 500 mg", dose: "1+0+1", food: "", duration: "" });
  });

  it("✕ collapses the row and clears what was typed", () => {
    openRow();
    fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: "Tablet. Napa 500 mg" } });
    fireEvent.click(screen.getByLabelText("Cancel adding a medicine"));
    expect(screen.queryByLabelText("Medicine name")).toBeNull();
    expect(screen.getByText("+ Add medicine")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run src/components/prescription/AddMedicineRow.test.tsx`
Expected: FAIL — `Cannot find module './AddMedicineRow'`.

- [ ] **Step 3: Write the implementation**

Create `client/src/components/prescription/AddMedicineRow.tsx`:

```tsx
"use client";

import { useState } from "react";
import { C, font } from "@/theme";
import { inputSm, btnPrimary, btnDisabled, btnClose, shadowMenu } from "@/theme/styles";
import { useMedicineSearch } from "@/hooks/useMedicineSearch";
import { fmtMedicine } from "@/lib/rxShorthand";
import { isDuplicateDrugHistoryEntry, type DrugHistoryAddInput } from "@/lib/drugHistoryAdd";

// ⚕️ The "+ Add medicine" row on one Drug-history tab (physician's decision,
// 2026-10-14). Collapsed by default — nothing here is typeable until the
// doctor presses it, so the standing "offers nothing to type into" rule for
// an EXISTING stored row still holds: this row never reads or edits one, it
// only ever produces a brand-new line (client/CLAUDE.md, Drug history). Two
// instances render, one per tab (DrugHistoryField.tsx), each owning its own
// state; switching tabs drops whatever was mid-type here, same as any other
// draft in a popup that was closed rather than confirmed.

interface Props {
  /** Medicine-kind entries already in THIS tab, for the duplicate check. */
  existing: DrugHistoryAddInput[];
  /** The tab's own visible name, used only in the duplicate message. */
  tabLabel: string;
  onAdd: (entry: DrugHistoryAddInput) => void;
}

export default function AddMedicineRow({ existing, tabLabel, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [drug, setDrug] = useState("");
  const [dose, setDose] = useState("");
  const [food, setFood] = useState("");
  const [duration, setDuration] = useState("");
  const [dupMsg, setDupMsg] = useState("");
  const { results } = useMedicineSearch(drug);
  const showDropdown = results.length > 0 && drug.trim().length >= 2;

  const close = () => {
    setOpen(false);
    setDrug(""); setDose(""); setFood(""); setDuration(""); setDupMsg("");
  };

  const add = () => {
    const input: DrugHistoryAddInput = { drug, dose, food, duration };
    if (isDuplicateDrugHistoryEntry(input, existing)) {
      setDupMsg(`Already in ${tabLabel}`);
      return;
    }
    onAdd(input);
    setDrug(""); setDose(""); setFood(""); setDuration(""); setDupMsg("");
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ height: 22, borderRadius: 999, border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 11, padding: "0 10px", cursor: "pointer", fontFamily: font, marginBottom: 8 }}>
        + Add medicine
      </button>
    );
  }

  return (
    <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 8, padding: 10, marginBottom: 10, background: C.n[50] }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ position: "relative", flex: "1 1 180px" }}>
          <input aria-label="Medicine name" value={drug}
            onChange={(e) => { setDrug(e.target.value); setDupMsg(""); }}
            placeholder="Medicine name" style={inputSm} />
          {showDropdown && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 6, marginTop: 2, maxHeight: 160, overflowY: "auto", boxShadow: shadowMenu }}>
              {results.map((m) => (
                <button key={m.id} type="button" onClick={() => { setDrug(fmtMedicine(m)); setDupMsg(""); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, color: C.n[900], fontFamily: font }}>
                  {fmtMedicine(m)}
                </button>
              ))}
            </div>
          )}
        </div>
        <input aria-label="Dose" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="dose" style={{ ...inputSm, flex: "1 1 90px" }} />
        <input aria-label="Food" value={food} onChange={(e) => setFood(e.target.value)} placeholder="food" style={{ ...inputSm, flex: "1 1 90px" }} />
        <input aria-label="Duration" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="duration" style={{ ...inputSm, flex: "1 1 90px" }} />
        <button aria-label="Cancel adding a medicine" onClick={close} style={btnClose}>×</button>
      </div>
      {dupMsg && <div style={{ fontSize: 11, color: C.warn[600], marginTop: 6 }}>{dupMsg}</div>}
      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={add} disabled={!drug.trim()}
          style={{ ...btnPrimary("sm"), ...(drug.trim() ? null : { ...btnDisabled, cursor: "default" }) }}>
          Add
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd client && npx vitest run src/components/prescription/AddMedicineRow.test.tsx`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/prescription/AddMedicineRow.tsx client/src/components/prescription/AddMedicineRow.test.tsx
git commit -m "feat(rx): AddMedicineRow — typed, DB-suggested add for Drug history"
```

---

## Task 4: Wire `AddMedicineRow` into `DrugHistoryField.tsx`

**Files:**
- Modify: `client/src/components/prescription/DrugHistoryField.tsx`
- Modify: `client/src/components/prescription/DrugHistoryField.test.tsx`

**Interfaces:**
- Consumes: `AddMedicineRow` (Task 3); `buildDrugHistoryEntry`, `NO_DATE`, `DrugHistoryAddInput` from `@/lib/drugHistoryAdd` (Task 2); `setDrugHistory` from `useMuqsit()` (already exists in `MuqsitContext`, exported at `MuqsitContext.tsx:1547`).

- [ ] **Step 1: Replace the local `PAST_MARKER` with the shared `NO_DATE`**

In `DrugHistoryField.tsx`, find:

```ts
const PAST_MARKER = "01/01/2000";
```

Replace it with an import at the top of the file (add to the existing import block, do not duplicate the constant):

```ts
import { NO_DATE as PAST_MARKER, buildDrugHistoryEntry, type DrugHistoryAddInput } from "@/lib/drugHistoryAdd";
```

and delete the `const PAST_MARKER = "01/01/2000";` line entirely. Every existing use of `PAST_MARKER` in the file stays unchanged (same name, same value, now imported instead of declared).

- [ ] **Step 2: Add the new import and pull `setDrugHistory` from context**

Add to the imports:

```ts
import AddMedicineRow from "./AddMedicineRow";
```

Change:

```ts
export default function DrugHistoryField({ items, hidden, onHidden }: Props) {
  const { setRxItems, rxItems, ptDate, can } = useMuqsit();
```

to:

```ts
export default function DrugHistoryField({ items, hidden, onHidden }: Props) {
  const { setRxItems, rxItems, ptDate, can, setDrugHistory } = useMuqsit();
```

- [ ] **Step 3: Build the medicine-only entry lists for the duplicate check, and the two add handlers**

Immediately after the existing lines

```ts
  const todays = parsed.filter((p) => p.date === cd && p.body.trim());
  const currentMeds = todays.filter((p) => p.kind === "med");
  const pastParsed = parsed.filter((p) => p.date !== cd);
```

add:

```ts
  // What "+ Add medicine" checks a typed entry against, per tab — the same
  // four cells `buildDrugHistoryEntry` produces, read back out with the
  // field's own `cells()` splitter so the duplicate check sees exactly what
  // the screen shows.
  const toAddInput = (p: Parsed): DrugHistoryAddInput => {
    const parts = cells(p.body);
    return { drug: parts[0] ?? "", dose: parts[1] ?? "", food: parts[2] ?? "", duration: parts[3] ?? "" };
  };
  const currentMedEntries = currentMeds.map(toAddInput);
  const pastMedEntries = pastParsed.filter((p) => p.kind === "med").map(toAddInput);

  const addCurrentMedicine = (input: DrugHistoryAddInput) =>
    setDrugHistory((prev) => [...prev, buildDrugHistoryEntry(cd, input)]);
  const addPastMedicine = (input: DrugHistoryAddInput) =>
    setDrugHistory((prev) => [...prev, buildDrugHistoryEntry(PAST_MARKER, input)]);
```

- [ ] **Step 4: Render the row at the top of each tab**

Find the tab content block:

```tsx
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 20px" }}>
              {tab === "current" ? (
                todays.length === 0 ? (
                  <>
                    <div style={{ fontSize: 12.5, color: C.n[500], padding: "14px 4px 6px" }}>
                      Nothing on today&apos;s prescription yet. Every medicine written on the ℞ appears here.
                    </div>
                    {/* Only when the most-recent past entry is from within the last
                        3 days — i.e. a resumed stale draft whose entries have just
                        moved to Distant past. A normal returning patient (last visit
                        weeks ago) would otherwise see it on every new visit. */}
                    {pastGroups.length > 0 && pastGroups[0].date !== PAST_MARKER &&
                      ddmmyyyyMs(pastGroups[0].date) > Date.now() - 3 * 86_400_000 && (
                      <div style={{ fontSize: 12, color: C.n[500], padding: "0 4px 6px", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>Previous visit&apos;s medications are in</span>
                        <button onClick={() => setTab("past")} style={{ color: C.pri[500], background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: font, padding: 0, textDecoration: "underline" }}>Distant Past →</button>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ paddingTop: 8 }}>
                    {todays.map((p, i) => {
```

Replace the opening of that block — from `{tab === "current" ? (` up to just before `todays.length === 0 ? (` — so the Current branch wraps its existing content in a fragment with the add-row first:

```tsx
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 20px" }}>
              {tab === "current" ? (
                <>
                  <AddMedicineRow existing={currentMedEntries} tabLabel="Current medications" onAdd={addCurrentMedicine} />
                  {todays.length === 0 ? (
                    <>
                      <div style={{ fontSize: 12.5, color: C.n[500], padding: "14px 4px 6px" }}>
                        Nothing on today&apos;s prescription yet. Every medicine written on the ℞ appears here.
                      </div>
                      {/* Only when the most-recent past entry is from within the last
                          3 days — i.e. a resumed stale draft whose entries have just
                          moved to Distant past. A normal returning patient (last visit
                          weeks ago) would otherwise see it on every new visit. */}
                      {pastGroups.length > 0 && pastGroups[0].date !== PAST_MARKER &&
                        ddmmyyyyMs(pastGroups[0].date) > Date.now() - 3 * 86_400_000 && (
                        <div style={{ fontSize: 12, color: C.n[500], padding: "0 4px 6px", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>Previous visit&apos;s medications are in</span>
                          <button onClick={() => setTab("past")} style={{ color: C.pri[500], background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: font, padding: 0, textDecoration: "underline" }}>Distant Past →</button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ paddingTop: 8 }}>
                      {todays.map((p, i) => {
```

The rest of the `todays.map` body, and the row/cells rendering inside it, is unchanged.

Then find where the Current branch closes and the Distant-past branch begins:

```tsx
                    })}
                  </div>
                )
              ) : pastGroups.length === 0 ? (
                <div style={{ fontSize: 12.5, color: C.n[500], padding: "14px 4px" }}>No earlier-visit medications yet. Whatever is prescribed today moves here on the patient&apos;s next visit.</div>
              ) : (
                <div style={{ paddingTop: 8 }}>
                  {pastGroups.map((g, gi) => (
```

Replace it with (closing the new fragment, and opening a matching one for Distant past):

```tsx
                    })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <AddMedicineRow existing={pastMedEntries} tabLabel="Distant past medication" onAdd={addPastMedicine} />
                  {pastGroups.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: C.n[500], padding: "14px 4px" }}>No earlier-visit medications yet. Whatever is prescribed today moves here on the patient&apos;s next visit.</div>
                  ) : (
                    <div style={{ paddingTop: 8 }}>
                      {pastGroups.map((g, gi) => (
```

And where the Distant-past branch currently closes:

```tsx
                  ))}
                </div>
              )}
            </div>
```

Replace with (closing the extra `<div>` and the new fragment):

```tsx
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
```

Nothing inside `todays.map(...)` or `pastGroups.map(...)` changes — only the wrapping fragments and indentation around them.

- [ ] **Step 5: Run the existing test file to confirm no regression**

Run: `cd client && npx vitest run src/components/prescription/DrugHistoryField.test.tsx`
Expected: all existing tests still PASS, including "offers nothing to type into, on either tab" — the add-row renders collapsed (just a button) until clicked, so `container.querySelectorAll('input:not([type="checkbox"]), textarea')` is still empty.

- [ ] **Step 6: Extend the mock and add integration tests**

In `DrugHistoryField.test.tsx`, change the mock to add `setDrugHistory`:

```ts
const setRxItems = vi.fn();
const setDrugHistory = vi.fn();
let padItems: RxItem[] = [];
let mayWriteRx = true;
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    setRxItems,
    get rxItems() { return padItems; },
    ptDate: "2026-09-07",
    can: (key: string) => (key === "rx.medicines" ? mayWriteRx : true),
    setDrugHistory,
  }),
}));

afterEach(() => { cleanup(); setRxItems.mockClear(); setDrugHistory.mockClear(); padItems = []; mayWriteRx = true; });
```

(This replaces the existing `vi.mock` block and `afterEach` — same file, same lines, with `setDrugHistory` added to both.)

Also mock the medicine search so these tests never hit the network — add near the top of the file, alongside the context mock:

```ts
vi.mock("@/hooks/useMedicineSearch", () => ({
  useMedicineSearch: () => ({ results: [], isLoading: false }),
}));
```

Then append this new `describe` block at the end of the file:

```ts
// ⚕️ The physician's 2026-10-14 addition: a typed, DB-suggested way to add a
// brand-new line to either tab. This does NOT reopen "two writable surfaces
// over one list" — it never edits or removes a stored row, so "offers
// nothing to type into" above still holds with the add-row collapsed; these
// tests open it on purpose.
describe("+ Add medicine — a new line, never a correction", () => {
  const openWith = (items: string[]) => {
    const r = render(<DrugHistoryField items={items} />);
    openModal();
    return r;
  };
  const openAddRow = () => fireEvent.click(screen.getByText("+ Add medicine"));
  const fillName = (v: string) => fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: v } });
  const pressAdd = () => fireEvent.click(screen.getByText("Add"));

  it("renders its own + Add medicine row on each tab, independently", () => {
    openWith(PAST);
    expect(screen.getByText("+ Add medicine")).toBeTruthy();
    openAddRow();
    expect(screen.getByLabelText("Medicine name")).toBeTruthy();
    fireEvent.click(screen.getByText(/Distant past medication/));
    // Switching tabs remounts the row — Current's open draft is gone, and
    // Distant past's own copy is collapsed, same as on first open.
    expect(screen.queryByLabelText("Medicine name")).toBeNull();
    expect(screen.getByText("+ Add medicine")).toBeTruthy();
  });

  it("stamps a Current-medications addition with the visit date", () => {
    openWith(PAST);
    openAddRow();
    fillName("Tablet. Napa 500 mg");
    pressAdd();
    expect(setDrugHistory).toHaveBeenCalledTimes(1);
    const next = (setDrugHistory.mock.calls[0][0] as (p: string[]) => string[])(PAST);
    expect(next).toEqual([...PAST, "07/09/2026: Tablet. Napa 500 mg —  —  — "]);
  });

  it("stamps a Distant-past addition with no date", () => {
    openWith(PAST);
    fireEvent.click(screen.getByText(/Distant past medication/));
    openAddRow();
    fillName("Tablet. Napa 500 mg");
    pressAdd();
    const next = (setDrugHistory.mock.calls[0][0] as (p: string[]) => string[])(PAST);
    expect(next).toEqual([...PAST, "01/01/2000: Tablet. Napa 500 mg —  —  — "]);
  });

  it("shows the newly added line immediately, in the right tab", () => {
    let items = [...PAST];
    setDrugHistory.mockImplementation((updater: (p: string[]) => string[]) => { items = updater(items); });
    const { rerender } = render(<DrugHistoryField items={items} />);
    openModal();
    openAddRow();
    fillName("Tablet. Napa 500 mg");
    pressAdd();
    rerender(<DrugHistoryField items={items} />);
    fireEvent.click(screen.getByText(/Distant past medication/));
    expect(screen.getByText("Metformin 500mg")).toBeTruthy(); // still there
    fireEvent.click(screen.getByText(/Current medications/));
    expect(screen.getByText("Tablet. Napa 500 mg")).toBeTruthy();
  });

  it("refuses an exact duplicate already shown on the same tab", () => {
    const todaysNapa = "07/09/2026: Tablet. Napa 500 mg — 1+1+1 — After meal — 5 days";
    openWith([...PAST, todaysNapa]);
    openAddRow();
    fillName("Tablet. Napa 500 mg");
    fireEvent.change(screen.getByLabelText("Dose"), { target: { value: "1+1+1" } });
    fireEvent.change(screen.getByLabelText("Food"), { target: { value: "After meal" } });
    fireEvent.change(screen.getByLabelText("Duration"), { target: { value: "5 days" } });
    pressAdd();
    expect(setDrugHistory).not.toHaveBeenCalled();
    expect(screen.getByText("Already in Current medications")).toBeTruthy();
  });
});
```

- [ ] **Step 7: Run the whole file to verify it passes**

Run: `cd client && npx vitest run src/components/prescription/DrugHistoryField.test.tsx`
Expected: PASS — all previous tests plus the 5 new ones.

- [ ] **Step 8: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/prescription/DrugHistoryField.tsx client/src/components/prescription/DrugHistoryField.test.tsx
git commit -m "feat(rx): wire + Add medicine into Drug history, both tabs"
```

---

## Task 5: Update documentation in the same commit (PRIME DIRECTIVE rule 7)

**Files:**
- Modify: `client/CLAUDE.md`
- Modify: `docs/DOMAIN.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update the "modal is NOT EDITABLE" paragraph in `client/CLAUDE.md`**

Find (in the Drug history section):

```
This replaced the editable pad because the two surfaces disagreed: a correction typed over an ℞-mirrored row lost to the mirror on the next keystroke, which reads as "I can't write in here". **Do not re-add an editor without asking.**
```

Append immediately after it, still inside the same bullet:

```
  **An ADD-only exception closes half that gap (physician's decision, 2026-10-14): "+ Add medicine" on each tab.** It writes one brand-new, date-stamped line straight to `drugHistory` (`lib/drugHistoryAdd.ts#buildDrugHistoryEntry`, reusing `rxDrugHistory.ts`'s own separator and the no-date marker Distant past already groups under) — never an edit of a stored row, so the hazard above does not reopen: the ℞ mirror only ever withdraws what it itself added (`rxDrugHistory.ts`'s `rxDerivedRef`), and a typed addition was never in that set — the same property `rxDrugHistory.test.ts`'s "never removes a medicine the doctor typed into Drug history by hand" already pins. A medicine name is matched against the real medicines catalogue (`useMedicineSearch`, the same lookup the ℞ pad's own box uses); dose/food/duration are free text, invented at nobody's hand but the doctor's. An exact duplicate — same medicine AND same dose/food/duration, by `lib/medicineKey.ts`'s own rules — is refused in place; a different dose is always a new line. It still reaches today's ℞ only through the existing **Move to Rx**, same as any other row.
```

- [ ] **Step 2: Update the "Consequence the physician accepted" paragraph**

Find:

```
**Consequence the physician accepted:** there is still no way in the app to hand-record a medication the patient takes that is not on today's ℞, and no way to correct or remove an entry from an earlier visit. Prescribe it (with `Continue`) so the mirror records it — Move to Rx makes re-prescribing a past visit's list one press, but it cannot author an entry that was never prescribed. If that gap needs closing, it needs a deliberate add/remove affordance, not a re-editable pad.
```

Replace with:

```
**Consequence the physician accepted, now partly closed (2026-10-14):** "+ Add medicine" lets the doctor hand-record a medication that was never on today's ℞ — but there is still no way to correct or remove an entry once it is stored, on either tab. A mistake is a new line added at the correct dose, not a fix in place; Move to Rx still only moves what the history already has, unedited.
```

- [ ] **Step 3: Add a domain-concept bullet to `docs/DOMAIN.md`**

Find the existing bullet (it starts with `- **℞ → Drug history mirror (2026-09-07):**` and ends `...see \`client/CLAUDE.md\`.`). Immediately after it, insert a new bullet:

```
- **Add medicine, Drug history (2026-10-14):** a "+ Add medicine" row on each Drug-history tab — Current medications and Distant past — writes one brand-new, date-stamped line to `Patient.drugHistory` (name matched against the real medicines catalogue, the same lookup the ℞ pad's own box uses; dose/food/duration free text). It is strictly an ADD: neither tab becomes editable, and an existing stored row still cannot be changed or removed from this modal — the mirror above withdraws only what it itself added, and a typed addition was never in that set. A Current addition is stamped with the visit date; a Distant-past one carries no date and groups under "Earlier (no date)". An exact duplicate (same medicine *and* same dose/food/duration) is refused; the same medicine at a different dose is always a new line. It reaches today's ℞ only through the existing Move to Rx. `client/src/lib/drugHistoryAdd.ts`; see `client/CLAUDE.md`.
```

- [ ] **Step 4: Commit**

```bash
git add client/CLAUDE.md docs/DOMAIN.md
git commit -m "docs: Add medicine (Drug history) — client/CLAUDE.md and DOMAIN.md"
```

---

## Task 6: Full verification pass

**Files:** none modified — verification only.

- [ ] **Step 1: Typecheck the whole client**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run the full client test suite**

Run: `cd client && npx vitest run`
Expected: all tests PASS, including the pre-existing `rxDrugHistory.test.ts` ("never removes a medicine the doctor typed into Drug history by hand") — this is the test that proves Task 4's new writer is safe from the ℞ mirror, and it needs no changes to already cover it.

- [ ] **Step 3: Verify in the browser against the throwaway sandbox (never `localhost:3000`)**

```bash
docker compose -f docker-compose.test.yml up -d
cd server && npm run test:db
cd server && TEST_DB_NAME=muqsit_e2e_test TEST_PORT=4200 npx ts-node --transpile-only test/seed-e2e.ts
```

Start `api-e2e` and `web-e2e` from `.claude/launch.json`, sign in as any doctor from `e2e/.seed.json`, create a test patient, open Drug history:

- On **Current medications**, press "+ Add medicine", type a medicine name, confirm suggestions appear from the real medicines table, pick one, fill dose/food/duration, press Add — confirm the new line appears under Current medications immediately.
- Reload the page — confirm the added line survives (it rides the draft auto-save, same as any other `drugHistory` entry).
- Tick the newly added line and press "Move to Rx" — confirm it lands on today's ℞ pad.
- On **Distant past medication**, press "+ Add medicine", add one with no dose/food/duration — confirm it appears under "Earlier (no date)" with those cells blank, not invented.
- Try adding the exact same medicine and instruction already on the Current tab — confirm it is refused with "Already in Current medications" and does not create a second line.

Stop the servers; revert `client/tsconfig.json` if the sandbox rewrote it (`git checkout -- client/tsconfig.json`).

- [ ] **Step 4: Final commit (if the browser pass needed any fixes)**

Only if Step 3 surfaced something — fix it, re-run Steps 1–2, then:

```bash
git add -A
git commit -m "fix(rx): address browser-verification findings for Add medicine"
```

If Step 3 found nothing to fix, no commit is needed here — Tasks 1–5 already carry everything.
