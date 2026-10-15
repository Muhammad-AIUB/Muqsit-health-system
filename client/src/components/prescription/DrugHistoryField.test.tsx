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
// "+ Add medicine" types into the ℞ pad's own rows, which search the medicines
// catalogue: "napa" finds one medicine here, anything else nothing, all off
// the network. The pad's learned suggestions are kept quiet too.
const NAPA = vi.hoisted(() => ({ id: "m1", brandName: "Napa", genericName: "Paracetamol", dosageForm: "Tablet", strength: "500 mg", company: null, priceRaw: null }));
vi.mock("@/hooks/useMedicineSearch", () => ({
  useMedicineSearch: (q: string) => ({ results: /napa/i.test(q ?? "") ? [NAPA] : [], isLoading: false }),
}));
vi.mock("@/hooks/useRxHabits", () => ({ useRxHabits: () => ({ groups: [], refresh: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));

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
  // ⚕️ Since the physician's sheet of 15/10/2026 (item 1: "2 jaigai e add
  // medicine er philosophy prescription er idea follow korbe") the row is the
  // ℞ pad itself: "Start typing a medicine…", the medicine list, dose / food /
  // duration that open on a medicine line and read the pad's shorthand, a
  // typed line that is a note until it is picked or treated as a medicine.
  const openWith = (items: string[]) => {
    const r = render(<DrugHistoryField items={items} />);
    openModal();
    return r;
  };
  const openAddRow = () => fireEvent.click(screen.getByText("+ Add medicine"));
  const typing = () => screen.getByPlaceholderText("Start typing a medicine or note…") as HTMLInputElement;
  const pickNapa = () => {
    fireEvent.focus(typing());
    fireEvent.change(typing(), { target: { value: "napa" } });
    fireEvent.mouseDown(screen.getByText("Tablet. Napa 500 mg"));
  };
  const cell = (placeholder: string) => screen.getAllByPlaceholderText(placeholder)[0] as HTMLTextAreaElement;
  const write = (placeholder: string, value: string) => {
    fireEvent.change(cell(placeholder), { target: { value } });
    fireEvent.blur(cell(placeholder));
  };
  const pressAdd = () => fireEvent.click(screen.getByRole("button", { name: "Add to Drug history" }));

  it("is the ℞ pad's typing line, not four plain boxes", () => {
    openWith(PAST);
    openAddRow();
    expect(typing()).toBeTruthy();
    expect(screen.queryByLabelText("Medicine name")).toBeNull();
    // Dose, food and duration open on a MEDICINE line, as on the prescription.
    expect(screen.queryByPlaceholderText("dose")).toBeNull();
  });

  it("renders its own + Add medicine row on each tab, independently", () => {
    openWith(PAST);
    openAddRow();
    fireEvent.change(typing(), { target: { value: "half typed" } });
    fireEvent.click(screen.getByText(/Distant past medication/));
    // Switching tabs remounts the row — Current's open draft is gone, and
    // Distant past's own copy is collapsed, same as on first open.
    expect(screen.queryByDisplayValue("half typed")).toBeNull();
    expect(screen.getByText("+ Add medicine")).toBeTruthy();
  });

  it("a medicine picked from the list takes the pad's shorthand, and is stamped with the visit date", () => {
    openWith(PAST);
    openAddRow();
    pickNapa();
    write("dose", "101");
    write("duration", "5d");
    expect(cell("dose").value).toBe("1+0+1");
    pressAdd();
    expect(addDrugHistoryEntry).toHaveBeenCalledTimes(1);
    expect(addDrugHistoryEntry).toHaveBeenCalledWith("07/09/2026: Tablet. Napa 500 mg — 1+0+1 —  — 5 days");
  });

  it("stamps a Distant-past addition with no date", () => {
    openWith(PAST);
    fireEvent.click(screen.getByText(/Distant past medication/));
    openAddRow();
    pickNapa();
    pressAdd();
    expect(addDrugHistoryEntry).toHaveBeenCalledWith("01/01/2000: Tablet. Napa 500 mg —  —  — ");
  });

  it("a hand-typed medicine is one only once treated as one — as on the ℞ pad", () => {
    openWith(PAST);
    openAddRow();
    fireEvent.focus(typing());
    fireEvent.change(typing(), { target: { value: "tab Seclo 20" } });
    fireEvent.mouseDown(screen.getByText(/Treat “tab Seclo 20” as medicine/));
    write("dose", "1+0+0");
    pressAdd();
    expect(addDrugHistoryEntry).toHaveBeenCalledWith("07/09/2026: tab Seclo 20 — 1+0+0 —  — ");
  });

  it("a line left as a note is written as a note", () => {
    openWith(PAST);
    openAddRow();
    fireEvent.change(typing(), { target: { value: "No regular medication" } });
    pressAdd();
    expect(addDrugHistoryEntry).toHaveBeenCalledWith("07/09/2026(note): No regular medication");
  });

  it("shows the newly added line immediately, in the right tab, and empties the pad", () => {
    let items = [...PAST];
    addDrugHistoryEntry.mockImplementation((entry: string) => { items = [...items, entry]; });
    const { rerender } = render(<DrugHistoryField items={items} />);
    openModal();
    openAddRow();
    pickNapa();
    pressAdd();
    rerender(<DrugHistoryField items={items} />);
    expect(screen.queryByDisplayValue("Tablet. Napa 500 mg")).toBeNull();
    fireEvent.click(screen.getByText(/Distant past medication/));
    expect(screen.getByText("Metformin 500mg")).toBeTruthy(); // still there
    fireEvent.click(screen.getByText(/Current medications/));
    expect(screen.getByText("Tablet. Napa 500 mg")).toBeTruthy();
  });

  it("refuses an exact duplicate already shown on the same tab", () => {
    const todaysNapa = "07/09/2026: Tablet. Napa 500 mg — 1+1+1 — After meal — 5 days";
    openWith([...PAST, todaysNapa]);
    openAddRow();
    pickNapa();
    write("dose", "1+1+1");
    write("food", "After meal");
    write("duration", "5 days");
    pressAdd();
    expect(addDrugHistoryEntry).not.toHaveBeenCalled();
    expect(screen.getByText("Already in Current medications: Tablet. Napa 500 mg")).toBeTruthy();
  });

  it("Add waits for something to add", () => {
    openWith(PAST);
    openAddRow();
    expect((screen.getByRole("button", { name: "Add to Drug history" }) as HTMLButtonElement).disabled).toBe(true);
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

// ⚕️ In BAN the three columns are SHOWN in Bangla wherever they appear, and in
// EN in English (physician's request, 2026-10-15). Display only.
describe("Drug history shows the dose / food / duration in the current language", () => {
  const text = (c: HTMLElement) => (c.textContent ?? "").replace(/\s+/g, " ");

  it("Current medications: BAN shows Bangla, EN shows English", () => {
    const rx: RxItem[] = [{ drug: "Tablet. Napa 500 mg", dose: "1+0+1", duration: "7 days", instruction: "Before meal" }];
    const { container } = render(<DrugHistoryField items={rxDrugHistoryEntries(rx, "07/09/2026")} />);
    openModal();
    act(() => setKbdLang("bn"));
    expect(text(container)).toContain("১+০+১");
    expect(text(container)).toContain("খাবারের আগে");
    expect(text(container)).toContain("৭ দিন");
    expect(text(container)).not.toContain("Before meal");
    expect(text(container)).toContain("Tablet. Napa 500 mg"); // the name is never touched
    act(() => setKbdLang("en"));
    expect(text(container)).toContain("Before meal");
    expect(text(container)).not.toContain("খাবারের আগে");
  });

  it("a line saved in Bangla is shown in English in EN", () => {
    const rx: RxItem[] = [{ drug: "Tablet. Napa 500 mg", dose: "১+০+১", duration: "৭ দিন", instruction: "খাবারের আগে" }];
    const { container } = render(<DrugHistoryField items={rxDrugHistoryEntries(rx, "07/09/2026")} />);
    openModal();
    expect(text(container)).toContain("1+0+1");
    expect(text(container)).toContain("Before meal");
    expect(text(container)).toContain("7 days");
  });

  it("Distant past: the cells in Bangla, the medicine's name and untranslated text as written", () => {
    const { container } = render(<DrugHistoryField items={PAST} />);
    openModal();
    fireEvent.click(screen.getByText(/Distant past medication/));
    act(() => setKbdLang("bn"));
    expect(text(container)).toContain("Metformin 500mg");
    expect(text(container)).toContain("১ মাস");
    expect(text(container)).toContain("after food"); // not in the physician's table
    // The tick is still named by the medicine as written.
    expect(screen.getByLabelText("Select Metformin 500mg")).toBeTruthy();
  });
});
