// @vitest-environment jsdom
//
// ⚕️ The "+ Add medicine" row (physician's decision, 2026-10-14). Collapsed
// by default — nothing here is typeable until the doctor presses it, which
// is what lets DrugHistoryField.test.tsx's "offers nothing to type into, on
// either tab" keep passing unchanged: this row is the ONE typeable thing in
// the modal, and it is opt-in.
//
// Since the physician's sheet of 15/10/2026 (item 1) it is the ℞ pad itself:
// the same typing line and medicine list, dose / food / duration that open on
// a medicine line and read the pad's shorthand. Add writes what was typed as
// history entries under the tab's date.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AddMedicineRow from "./AddMedicineRow";
import type { MedicineHit } from "@/lib/api";

const HITS: MedicineHit[] = [
  { id: "1", brandName: "Napa", genericName: "Paracetamol", dosageForm: "Tablet", strength: "500 mg", company: null, priceRaw: null },
  { id: "2", brandName: "Napa Extra", genericName: "Paracetamol+Caffeine", dosageForm: "Tablet", strength: "500 mg+65 mg", company: null, priceRaw: null },
];
vi.mock("@/hooks/useMedicineSearch", () => ({
  useMedicineSearch: (q: string) => ({ results: (q ?? "").trim().length >= 2 ? HITS : [], isLoading: false }),
}));
vi.mock("@/hooks/useRxHabits", () => ({ useRxHabits: () => ({ groups: [], refresh: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));

afterEach(() => cleanup());

const DATE = "15/10/2026";
const openRow = (existing: { drug: string; dose: string; food: string; duration: string }[] = []) => {
  const onAdd = vi.fn();
  render(<AddMedicineRow existing={existing} tabLabel="Current medications" date={DATE} onAdd={onAdd} />);
  fireEvent.click(screen.getByText("+ Add medicine"));
  return { onAdd };
};
const typing = () => screen.getByPlaceholderText("Start typing a medicine or note…") as HTMLInputElement;
const type = (v: string) => { fireEvent.focus(typing()); fireEvent.change(typing(), { target: { value: v } }); };
const pick = (label: string) => fireEvent.mouseDown(screen.getByText(label));
const cell = (placeholder: string) => screen.getAllByPlaceholderText(placeholder)[0] as HTMLTextAreaElement;
const write = (placeholder: string, value: string) => { fireEvent.change(cell(placeholder), { target: { value } }); fireEvent.blur(cell(placeholder)); };
const addBtn = () => screen.getByRole("button", { name: "Add to Drug history" }) as HTMLButtonElement;

describe("AddMedicineRow — collapsed by default", () => {
  it("shows only the + Add medicine button, nothing typeable", () => {
    render(<AddMedicineRow existing={[]} tabLabel="Current medications" date={DATE} onAdd={vi.fn()} />);
    expect(screen.getByText("+ Add medicine")).toBeTruthy();
    expect(document.querySelectorAll("input, textarea")).toHaveLength(0);
  });
});

describe("AddMedicineRow — opened, it types like the ℞ pad", () => {
  it("offers the pad's typing line; dose, food and duration open on a medicine line", () => {
    openRow();
    expect(typing()).toBeTruthy();
    expect(screen.queryByPlaceholderText("dose")).toBeNull();
    type("na");
    pick("Tablet. Napa 500 mg");
    expect(cell("dose")).toBeTruthy();
    expect(cell("food")).toBeTruthy();
    expect(cell("duration")).toBeTruthy();
  });

  it("shows the medicine list, with each generic, once two letters are typed", () => {
    openRow();
    type("na");
    expect(screen.getByText("Tablet. Napa 500 mg")).toBeTruthy();
    expect(screen.getByText("Tablet. Napa Extra 500 mg+65 mg")).toBeTruthy();
    expect(screen.getByText("Paracetamol+Caffeine")).toBeTruthy();
  });

  it("shows no list under two letters", () => {
    openRow();
    type("n");
    expect(screen.queryByText("Tablet. Napa 500 mg")).toBeNull();
  });

  it("Add waits until something is typed", () => {
    openRow();
    expect(addBtn().disabled).toBe(true);
    type("na");
    pick("Tablet. Napa 500 mg");
    expect(addBtn().disabled).toBe(false);
  });

  it("adds with blanks kept blank — nothing invented", () => {
    const { onAdd } = openRow();
    type("na");
    pick("Tablet. Napa 500 mg");
    fireEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalledWith("15/10/2026: Tablet. Napa 500 mg —  —  — ");
  });

  it("reads the pad's shorthand in dose, food and duration", () => {
    const { onAdd } = openRow();
    type("na");
    pick("Tablet. Napa 500 mg");
    write("dose", "101");
    write("duration", "5d");
    fireEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalledWith("15/10/2026: Tablet. Napa 500 mg — 1+0+1 —  — 5 days");
  });

  it("empties the pad and stays open after an add", () => {
    const { onAdd } = openRow();
    type("na");
    pick("Tablet. Napa 500 mg");
    fireEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(typing().value).toBe("");
    expect(screen.queryByText("+ Add medicine")).toBeNull(); // still open
  });

  it("refuses an exact duplicate, names it, and does not call onAdd", () => {
    const existing = [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days" }];
    const { onAdd } = openRow(existing);
    type("na");
    pick("Tablet. Napa 500 mg");
    write("dose", "1+1+1");
    write("food", "After meal");
    write("duration", "5 days");
    fireEvent.click(addBtn());
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText("Already in Current medications: Tablet. Napa 500 mg")).toBeTruthy();
  });

  it("allows the same medicine at a different dose", () => {
    const existing = [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days" }];
    const { onAdd } = openRow(existing);
    type("na");
    pick("Tablet. Napa 500 mg");
    write("dose", "1+0+1");
    fireEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalledWith("15/10/2026: Tablet. Napa 500 mg — 1+0+1 —  — ");
  });

  it("Cancel collapses the row and clears what was typed", () => {
    openRow();
    type("Tablet. Napa 500 mg");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByPlaceholderText("Start typing a medicine or note…")).toBeNull();
    fireEvent.click(screen.getByText("+ Add medicine"));
    expect(typing().value).toBe("");
  });
});
