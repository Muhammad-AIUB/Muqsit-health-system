// @vitest-environment jsdom
//
// ⚕️ Two things this file holds down.
//
// The seam the reported bug fell through: what `lib/rxDrugHistory.ts` writes has
// to be what `DrugHistoryField` reads back as a CURRENT medication. Two
// independent parsers of one stored format is exactly how a doctor ends up
// looking at "0 current" with two medicines on the sheet in front of them.
//
// And the surface itself: neither tab is EDITABLE (physician's decision,
// 2026-09-07, still in force). The ℞ pad owns Current medications and is where
// it is corrected, so this modal offers no input over a stored entry — a second
// writable surface over one list is how a typed correction silently loses to the
// mirror. Since 2026-09-21 the rows carry SELECTION ticks and the footer a
// "Move to Rx", which write to the ℞ pad and never to the history.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import DrugHistoryField from "./DrugHistoryField";
import { rxDrugHistoryEntries } from "@/lib/rxDrugHistory";
import { setKbdLang } from "@/lib/kbdLang";
import type { RxItem } from "@/types";

const setRxItems = vi.fn();
const addDrugHistoryEntry = vi.fn();
// What the ℞ pad is holding, and whether this user may write to it. Both are
// read at render time, so a test sets them before it opens the modal.
let padItems: RxItem[] = [];
let mayWriteRx = true;
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    setRxItems,
    get rxItems() { return padItems; },
    ptDate: "2026-09-07",
    can: (key: string) => (key === "rx.medicines" ? mayWriteRx : true),
    addDrugHistoryEntry,
  }),
}));
// "+ Add medicine" searches the real medicines catalogue; no test in this
// file needs real suggestions, so it is kept quiet and off the network.
vi.mock("@/hooks/useMedicineSearch", () => ({
  useMedicineSearch: () => ({ results: [], isLoading: false }),
}));

afterEach(() => { cleanup(); setRxItems.mockClear(); addDrugHistoryEntry.mockReset(); padItems = []; mayWriteRx = true; act(() => setKbdLang("en")); });

/** The array `setRxItems` would have produced, given the pad it was called on. */
const appended = (prev: RxItem[] = padItems): RxItem[] => {
  const next = setRxItems.mock.calls[0][0] as (p: RxItem[]) => RxItem[];
  return next(prev);
};

// The patient in the report: three medications from earlier visits, and today's
// two on the ℞ pad. The visit is 07/09/2026.
const PAST = [
  "10/01/2024: Losartan 50mg — 1+0+1 — after food — continuing",
  "27/06/2026: Losartan 50mg — 1+0+1 — after food — continuing",
  "20/07/2026: Metformin 500mg — 1+0+1 — after food — 1 month",
];
const TODAYS_RX: RxItem[] = [
  { drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "food", generic: "Paracetamol" },
  { drug: "Tablet. Napa One 1000 mg", dose: "", duration: "", instruction: "", generic: "Paracetamol" },
];
const mirrored = () => rxDrugHistoryEntries(TODAYS_RX, "07/09/2026");

const badge = () => screen.getAllByRole("button").find((b) => /current/.test(b.textContent ?? ""))!;
const badgeText = () => (badge().textContent ?? "").replace(/\s+/g, " ").trim();
const openModal = () => fireEvent.click(badge());

describe("Drug history — today's ℞ reaches Current medications", () => {
  it("counted 0 current before the mirror existed (the reported bug)", () => {
    render(<DrugHistoryField items={PAST} />);
    expect(badgeText()).toBe("💊 0 current · 3 past · view");
  });

  it("counts today's prescribed medicines as current", () => {
    render(<DrugHistoryField items={[...PAST, ...mirrored()]} />);
    expect(badgeText()).toBe("💊 2 current · 3 past · view");
  });

  it("shows each medicine with the dose, food and duration the doctor wrote", () => {
    const { container } = render(<DrugHistoryField items={[...PAST, ...mirrored()]} />);
    openModal();
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Tablet. Napa 500 mg");
    expect(text).toContain("1+1+1");
    expect(text).toContain("5 days");
    expect(text).toContain("Tablet. Napa One 1000 mg");
  });

  it("invents nothing for the line that has no dose yet", () => {
    const { container } = render(<DrugHistoryField items={mirrored()} />);
    openModal();
    const text = container.textContent ?? "";
    expect(text).not.toContain("1+0+1");     // the pad's default dose
    expect(text).not.toContain("After meal");
    expect(text).not.toContain("Continue");
  });

  it("leaves the earlier visits in Distant past, unmoved", () => {
    render(<DrugHistoryField items={[...PAST, ...mirrored()]} />);
    openModal();
    fireEvent.click(screen.getByText(/Distant past medication/));
    expect(screen.getByText("Metformin 500mg")).toBeTruthy();
    expect(screen.queryByText("Tablet. Napa 500 mg")).toBeNull();
  });

  // A taper belongs under its medicine, not beside it as a second drug.
  it("shows a tapering line under its medicine and does not count it", () => {
    const taper: RxItem[] = [
      { drug: "Tablet (Delayed Release). Mesacol 400 mg", dose: "2+2+2", duration: "7 week", instruction: "food" },
      { drug: "", dose: "2+0+2", duration: "4 week", instruction: "food", isCont: true },
    ];
    const { container } = render(<DrugHistoryField items={rxDrugHistoryEntries(taper, "07/09/2026")} />);
    expect(badgeText()).toBe("💊 1 current · view");
    openModal();
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("↳");
    expect(text).toContain("2+0+2");
  });

  it("stamps entries with the dd/mm/yyyy the field itself splits on", () => {
    const { container } = render(<DrugHistoryField items={mirrored()} />);
    openModal();
    expect(container.textContent).toContain("07/09/2026");
  });
});

describe("Drug history is a view, not an editor", () => {
  const openWith = (items: string[]) => {
    const r = render(<DrugHistoryField items={items} />);
    openModal();
    return r;
  };

  // The 2026-09-07 decision that still stands: a stored entry cannot be edited
  // here. Ticks select; they do not open a field over a patient's medication.
  it("offers nothing to type into, on either tab", () => {
    const { container } = openWith([...PAST, ...mirrored()]);
    const typeable = () => container.querySelectorAll('input:not([type="checkbox"]), textarea');
    expect(typeable()).toHaveLength(0);
    fireEvent.click(screen.getByText(/Distant past medication/));
    expect(typeable()).toHaveLength(0);
  });

  it("has dropped the per-row ↻ Rx button", () => {
    const { container } = openWith([...PAST, ...mirrored()]);
    fireEvent.click(screen.getByText(/Distant past medication/));
    expect(container.textContent).not.toContain("↻ Rx");
    expect(screen.queryByTitle("Add to current prescription")).toBeNull();
  });

  // Nothing is staged, so there is nothing to accept or abandon — one way out.
  it("closes with a single button, not Cancel/Done", () => {
    const { container } = openWith(mirrored());
    expect(screen.getByText("Close")).toBeTruthy();
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();
    fireEvent.click(screen.getByText("Close"));
    expect((container.textContent ?? "")).not.toContain("Distant past medication");
  });

});

// ⚕️ What reaches a prescription when the doctor ticks a row. The mapping rules
// themselves are pinned in `lib/drugHistorySelect.test.ts`; this file holds the
// surface down — that the tick, the count and the button are wired to them.
describe("Moving ticked medicines onto today's ℞", () => {
  const openWith = (items: string[]) => {
    const r = render(<DrugHistoryField items={items} />);
    openModal();
    return r;
  };
  const past = (items: string[]) => {
    const r = openWith(items);
    fireEvent.click(screen.getByText(/Distant past medication/));
    return r;
  };
  const move = () => fireEvent.click(screen.getByText(/^Move to Rx/));

  it("sends one ticked medicine to the pad, exactly as it was recorded", () => {
    past(PAST);
    fireEvent.click(screen.getByLabelText("Select Metformin 500mg"));
    move();
    expect(setRxItems).toHaveBeenCalledTimes(1);
    expect(appended([])).toEqual([
      { drug: "Metformin 500mg", dose: "1+0+1", instruction: "after food", duration: "1 month", isCont: false },
    ]);
  });

  // ⚕️ The button this replaced substituted 1+0+1 / After meal / Continue for a
  // cell the doctor had left empty. One press of Select all would have written
  // those onto a dozen medicines at once.
  it("invents no dose for a medicine recorded without one", () => {
    past(["19/07/2026: Tablet. Edeloss 20 mg+50 mg —  —  — "]);
    fireEvent.click(screen.getByLabelText("Select Tablet. Edeloss 20 mg+50 mg"));
    move();
    expect(appended([])).toEqual([
      { drug: "Tablet. Edeloss 20 mg+50 mg", dose: "", instruction: "", duration: "", isCont: false },
    ]);
  });

  it("carries a tapering line with the medicine it belongs to", () => {
    past([
      "19/07/2026: Capsule. Lenva 4 mg — 0+0+1 —  — 7 days",
      "19/07/2026(cont): 0+0+2 —  — Continue",
    ]);
    fireEvent.click(screen.getByLabelText("Select Capsule. Lenva 4 mg"));
    move();
    const out = appended([]);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ drug: "", dose: "0+0+2", duration: "Continue", isCont: true });
  });

  it("Select all ticks the whole tab, and the button says how many", () => {
    past(PAST);
    fireEvent.click(screen.getByText("Select all"));
    expect(screen.getByText("Move to Rx (3)")).toBeTruthy();
    expect(screen.getByText("Clear")).toBeTruthy();
  });

  // Current medications is a mirror of the pad, so the honest answer there is
  // usually "they are all on it already" — and it is said out loud, not
  // swallowed as a no-op the doctor cannot tell from a failure.
  it("reports the medicines that were already on the pad", () => {
    padItems = TODAYS_RX;
    openWith([...PAST, ...mirrored()]);
    fireEvent.click(screen.getByText("Select all"));
    fireEvent.click(screen.getByText("Move to Rx (2)"));
    expect(screen.getByText("0 added · 2 already on ℞")).toBeTruthy();
  });

  // ⚕️ The pad's Napa was picked from the medicine list; the history's was
  // typed by hand at an earlier visit. One line — it went on the pad twice.
  it("does not write a line twice because its medicine is spaced or capitalised another way", () => {
    padItems = [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After meal" }];
    past(["20/07/2026: tab napa 500mg — 1+1+1 — After meal — 5 days", "20/07/2026: Metformin 500mg — 1+0+1 — after food — 1 month"]);
    fireEvent.click(screen.getByText("Select all"));
    fireEvent.click(screen.getByText("Move to Rx (2)"));
    expect(screen.getByText("1 added · 1 already on ℞")).toBeTruthy();
    expect(appended().map((it) => it.drug)).toEqual(["Tablet. Napa 500 mg", "Metformin 500mg"]);
  });

  it("clears the ticks after a move, so one press cannot become two", () => {
    past(PAST);
    fireEvent.click(screen.getByLabelText("Select Metformin 500mg"));
    move();
    expect(screen.queryByText(/Move to Rx \(/)).toBeNull();
  });

  // ⚕️ RightColumn locks the ℞ pad behind `rx.medicines`, while this modal sits
  // behind `rx.drugHistory`. Without this gate an assistant holding only the
  // second could write medicines from here — which the ↻ Rx button allowed.
  it("offers no tick and no button without rx.medicines", () => {
    mayWriteRx = false;
    const { container } = past(PAST);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(screen.queryByText("Select all")).toBeNull();
    expect(screen.queryByText(/Move to Rx/)).toBeNull();
  });
});

// ⚕️ The whole Drug history section, on or off the printed sheet (physician's
// decision, 2026-09-21). No per-line ticks here on purpose: the medicines are
// behind the modal, so a tick on this row would mark something the doctor
// cannot see. The entries are untouched either way — this changes the document.
describe("⊘ Hide — keeping Drug history off the printed sheet", () => {
  const HIDE_BTN = /in printed prescription$/i;
  const toggle = () => screen.getByRole("button", { name: HIDE_BTN });

  it("is absent unless the screen opts in", () => {
    render(<DrugHistoryField items={PAST} />);
    expect(screen.queryByRole("button", { name: HIDE_BTN })).toBeNull();
  });

  it("carries the physician's own wording as its tooltip", () => {
    render(<DrugHistoryField items={PAST} hidden={false} onHidden={vi.fn()} />);
    expect(toggle().getAttribute("title")).toBe("Hide in Printed Prescription");
  });

  it("turns the section off, then back on", () => {
    const onHidden = vi.fn();
    const { rerender } = render(<DrugHistoryField items={PAST} hidden={false} onHidden={onHidden} />);
    fireEvent.click(toggle());
    expect(onHidden).toHaveBeenCalledWith(true);
    rerender(<DrugHistoryField items={PAST} hidden onHidden={onHidden} />);
    fireEvent.click(toggle());
    expect(onHidden).toHaveBeenLastCalledWith(false);
  });

  it("says it is hidden and marks itself pressed", () => {
    render(<DrugHistoryField items={PAST} hidden onHidden={vi.fn()} />);
    expect(toggle().textContent).toContain("Hidden");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
  });

  // Nothing to count: this is the whole section, not a line at a time.
  it("shows no count beside Hidden", () => {
    render(<DrugHistoryField items={PAST} hidden onHidden={vi.fn()} />);
    expect(toggle().textContent).not.toMatch(/\(\d+\)/);
  });

  // ⚕️ Hiding changes the printed sheet, never the screen: the badge still
  // reports the same medicines, and the modal still opens on all of them.
  it("keeps the medicines readable on screen while hidden", () => {
    const { container } = render(<DrugHistoryField items={PAST} hidden onHidden={vi.fn()} />);
    expect(badgeText()).toBe("💊 0 current · 3 past · view");
    openModal();
    fireEvent.click(screen.getByText(/Distant past medication/));
    expect(container.textContent).toContain("Metformin 500mg");
  });

  it("offers nothing to hide when the patient has no drug history", () => {
    render(<DrugHistoryField items={[]} hidden={false} onHidden={vi.fn()} />);
    expect(screen.queryByRole("button", { name: HIDE_BTN })).toBeNull();
  });
});

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
    expect(addDrugHistoryEntry).toHaveBeenCalledTimes(1);
    expect(addDrugHistoryEntry).toHaveBeenCalledWith("07/09/2026: Tablet. Napa 500 mg —  —  — ");
  });

  it("stamps a Distant-past addition with no date", () => {
    openWith(PAST);
    fireEvent.click(screen.getByText(/Distant past medication/));
    openAddRow();
    fillName("Tablet. Napa 500 mg");
    pressAdd();
    expect(addDrugHistoryEntry).toHaveBeenCalledWith("01/01/2000: Tablet. Napa 500 mg —  —  — ");
  });

  it("shows the newly added line immediately, in the right tab", () => {
    let items = [...PAST];
    addDrugHistoryEntry.mockImplementation((entry: string) => { items = [...items, entry]; });
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
    expect(addDrugHistoryEntry).not.toHaveBeenCalled();
    expect(screen.getByText("Already in Current medications")).toBeTruthy();
  });
});

// ⚕️ BAN writes the ℞ pad's dose / food / duration in Bangla (physician's
// decision, 2026-10-14) — a line moved from the history lands that way too.
describe("Move to Rx in BAN", () => {
  it("writes the moved line in Bangla, the record left as it was", () => {
    render(<DrugHistoryField items={PAST} />);
    openModal();
    fireEvent.click(screen.getByText(/Distant past medication/));
    act(() => setKbdLang("bn"));
    fireEvent.click(screen.getByLabelText("Select Metformin 500mg"));
    fireEvent.click(screen.getByText(/^Move to Rx/));
    // "after food" is not in the physician's table, so it stays as recorded.
    expect(appended([])).toEqual([
      { drug: "Metformin 500mg", dose: "১+০+১", instruction: "after food", duration: "১ মাস", isCont: false },
    ]);
  });

  it("does not write the line twice when the pad already holds it in Bangla", () => {
    padItems = [{ drug: "Metformin 500mg", dose: "১+০+১", instruction: "after food", duration: "১ মাস" }];
    render(<DrugHistoryField items={PAST} />);
    openModal();
    fireEvent.click(screen.getByText(/Distant past medication/));
    act(() => setKbdLang("bn"));
    fireEvent.click(screen.getByLabelText("Select Metformin 500mg"));
    fireEvent.click(screen.getByText(/^Move to Rx/));
    // One line — "already on ℞" reads the two languages as one instruction.
    expect(screen.getByText("0 added · 1 already on ℞")).toBeTruthy();
  });
});
