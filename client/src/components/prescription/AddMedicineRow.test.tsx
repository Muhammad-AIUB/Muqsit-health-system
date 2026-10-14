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
