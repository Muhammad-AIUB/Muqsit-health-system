// @vitest-environment jsdom
//
// The "Add Bulk Medicine" box. ⚕️ What it must hold: only what is ticked is
// added, in the order on screen, with nothing filled in for the doctor; a tick
// survives a search that hides its row; and a list that did not load says so —
// it is never shown as "you have no medicines". Every medicine, dose and count
// here is made up.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import BulkMedicineModal, { type BulkListState } from "./BulkMedicineModal";
import { ApiError } from "@/lib/api";
import { itKeepsTheKeyboard } from "@/test/dialogKeyboard";
import type { BulkList, BulkMedicine } from "@/lib/bulkMedicines";
import type { RxItem } from "@/types";

afterEach(cleanup);

const med = (over: Partial<BulkMedicine>): BulkMedicine => ({
  id: "h1", drugLabel: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days",
  contLines: [], patientCount: 30, ...over,
});
const NAPA = med({});
const SERGEL = med({ id: "h2", drugLabel: "Capsule. Sergel 20 mg", generic: "Esomeprazole", dose: "1+0+1", food: "Before meal", duration: "14 days", patientCount: 22 });
const DELTA = med({ id: "h3", drugLabel: "Tablet. Deltasone 5 mg", dose: "2+0+0", duration: "5 days", patientCount: 6, contLines: [{ dose: "1+0+0", food: "After meal", duration: "5 days" }] });
const ACE = med({ id: "h4", drugLabel: "Tablet. Ace 500 mg", dose: "", food: "", duration: "", patientCount: 1 });

const loaded = (medicines: BulkMedicine[], over: Partial<BulkList> = {}): BulkListState => ({
  data: { medicines, truncated: false, unreadable: 0, ...over }, isLoading: false, isError: false, refetch: vi.fn(),
});

const open = (list: BulkListState, existing: RxItem[] = []) => {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(<BulkMedicineModal open onClose={onClose} existing={existing} list={list} onAdd={onAdd} />);
  return { onAdd, onClose, box: screen.getByRole("dialog", { name: "Add Bulk Medicine" }) };
};
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rowNames = (box: HTMLElement) =>
  within(box).getAllByRole("checkbox").map((c) => c.closest("label")?.querySelector("[data-name]")?.textContent);
const tickBox = (box: HTMLElement, name: string) =>
  within(box).getByRole("checkbox", { name: new RegExp(escaped(name)) }) as HTMLInputElement;
const tick = (box: HTMLElement, name: string) => fireEvent.click(tickBox(box, name));
const addButton = (box: HTMLElement) => within(box).getByRole("button", { name: /^Add/ }) as HTMLButtonElement;
const searchBox = (box: HTMLElement) => within(box).getByRole("textbox", { name: "Search medicines" }) as HTMLInputElement;

describe("BulkMedicineModal", () => {
  itKeepsTheKeyboard({
    label: "Add Bulk Medicine",
    render: (onClose) => (
      <BulkMedicineModal open onClose={onClose} existing={[]} list={loaded([NAPA, SERGEL])} onAdd={() => undefined} />
    ),
  });

  it("draws nothing while it is closed", () => {
    render(<BulkMedicineModal open={false} onClose={() => undefined} existing={[]} list={loaded([NAPA])} onAdd={() => undefined} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists each medicine with its instruction, its taper and how many patients", () => {
    const { box } = open(loaded([NAPA, DELTA, ACE]));
    expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg", "Tablet. Deltasone 5 mg", "Tablet. Ace 500 mg"]);
    expect(box.textContent).toContain("1+1+1 · After meal · 5 days");
    expect(box.textContent).toContain("30 patients");
    expect(box.textContent).toContain("↳ 1+0+0 · After meal · 5 days");
    expect(box.textContent).toContain("1 patient");
  });

  it("⚕️ a medicine saved with nothing beside it says so, and is not given a dose", () => {
    const { box } = open(loaded([ACE]));
    const row = tickBox(box, "Tablet. Ace 500 mg").closest("label") as HTMLElement;
    expect(row.textContent).toContain("No dose recorded");
    expect(row.textContent).not.toMatch(/\d\+\d/);
  });

  it("only the brand is in bold, as on the pad", () => {
    const { box } = open(loaded([NAPA]));
    const name = tickBox(box, "Tablet. Napa 500 mg").closest("label")?.querySelector("[data-name]") as HTMLElement;
    expect(name.querySelector("b")?.textContent).toBe("Napa");
    expect(name.textContent).toBe("Tablet. Napa 500 mg");
  });

  // A long name wraps. Wrapped anywhere, a combination's strength turned in
  // the middle — "… 10" at the end of one line and "mg+40 mg+25 mg" on the
  // next (seen on a phone-wide box, on made-up medicines). The strength is one
  // piece that goes to the next line WHOLE; nothing of the label is changed.
  it("⚕️ the strength is kept in one piece, and the name still reads exactly as written", () => {
    const LONG = "Tablet. Amlodipine + Olmesartan Medoxomil + Hydrochlorothiazide 10 mg+40 mg+25 mg";
    const { box } = open(loaded([med({ id: "x", drugLabel: LONG }), NAPA, med({ id: "y", drugLabel: "Zinc" })]));
    const nameOf = (label: string) => tickBox(box, label).closest("label")?.querySelector("[data-name]") as HTMLElement;
    expect(nameOf(LONG).textContent).toBe(LONG);
    expect(nameOf(LONG).querySelector("[data-strength]")?.textContent).toBe("10 mg+40 mg+25 mg");
    expect((nameOf(LONG).querySelector("[data-strength]") as HTMLElement).style.display).toBe("inline-block");
    expect(nameOf("Tablet. Napa 500 mg").querySelector("[data-strength]")?.textContent).toBe("500 mg");
    // A label with no strength has no such piece, and is still itself.
    expect(nameOf("Zinc").textContent).toBe("Zinc");
    expect(nameOf("Zinc").querySelector("[data-strength]")).toBeNull();
  });

  it("opens most-patients-first, and Alphabetical files by brand", () => {
    const { box } = open(loaded([ACE, SERGEL, NAPA]));
    expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg", "Capsule. Sergel 20 mg", "Tablet. Ace 500 mg"]);
    expect(within(box).getByRole("button", { name: "Popular" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(box).getByRole("button", { name: "Alphabetical" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(within(box).getByRole("button", { name: "Alphabetical" }));
    expect(rowNames(box)).toEqual(["Tablet. Ace 500 mg", "Tablet. Napa 500 mg", "Capsule. Sergel 20 mg"]);
    expect(within(box).getByRole("button", { name: "Alphabetical" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(box).getByRole("button", { name: "Popular" }));
    expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg", "Capsule. Sergel 20 mg", "Tablet. Ace 500 mg"]);
  });

  it("Add cannot be pressed with nothing ticked, and says how many are", () => {
    const { box, onAdd } = open(loaded([NAPA, SERGEL]));
    expect(addButton(box).disabled).toBe(true);
    expect(addButton(box).textContent).toBe("Add");
    tick(box, "Tablet. Napa 500 mg");
    expect(addButton(box).disabled).toBe(false);
    expect(addButton(box).textContent).toBe("Add (1)");
    expect(box.textContent).toContain("1 selected");
    tick(box, "Capsule. Sergel 20 mg");
    expect(addButton(box).textContent).toBe("Add (2)");
    tick(box, "Tablet. Napa 500 mg");
    tick(box, "Capsule. Sergel 20 mg");
    expect(addButton(box).disabled).toBe(true);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("⚕️ adds exactly the ticked medicines, in the order on screen, with what was written and nothing more", () => {
    const { box, onAdd, onClose } = open(loaded([NAPA, SERGEL, DELTA, ACE]));
    tick(box, "Tablet. Deltasone 5 mg"); // ticked first, listed third
    tick(box, "Tablet. Napa 500 mg");
    fireEvent.click(addButton(box));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const [items, summary] = onAdd.mock.calls[0] as [RxItem[], string];
    expect(items.map((it) => [it.drug, it.dose, it.instruction, it.duration, it.isCont])).toEqual([
      ["Tablet. Napa 500 mg", "1+1+1", "After meal", "5 days", false],
      ["Tablet. Deltasone 5 mg", "2+0+0", "After meal", "5 days", false],
      ["", "1+0+0", "After meal", "5 days", true],
    ]);
    expect(summary).toBe("2 added");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the order added is the order SHOWN: Alphabetical when that is what is on screen", () => {
    const { box, onAdd } = open(loaded([NAPA, SERGEL, ACE]));
    fireEvent.click(within(box).getByRole("button", { name: "Alphabetical" }));
    tick(box, "Capsule. Sergel 20 mg");
    tick(box, "Tablet. Ace 500 mg");
    fireEvent.click(addButton(box));
    expect((onAdd.mock.calls[0][0] as RxItem[]).map((it) => it.drug)).toEqual(["Tablet. Ace 500 mg", "Capsule. Sergel 20 mg"]);
  });

  it("⚕️ the generic goes to the pad with its medicine", () => {
    const { box, onAdd } = open(loaded([SERGEL]));
    tick(box, "Capsule. Sergel 20 mg");
    fireEvent.click(addButton(box));
    expect((onAdd.mock.calls[0][0] as RxItem[])[0].generic).toBe("Esomeprazole");
  });

  it("⚕️ a tick is kept while a search hides its row, and is still added", () => {
    const { box, onAdd } = open(loaded([NAPA, SERGEL]));
    tick(box, "Capsule. Sergel 20 mg");
    fireEvent.change(searchBox(box), { target: { value: "napa" } });
    expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg"]);
    expect(addButton(box).textContent).toBe("Add (1)");
    expect(box.textContent).toContain("1 selected");
    tick(box, "Tablet. Napa 500 mg");
    fireEvent.click(addButton(box));
    expect((onAdd.mock.calls[0][0] as RxItem[]).map((it) => it.drug)).toEqual(["Tablet. Napa 500 mg", "Capsule. Sergel 20 mg"]);
  });

  it("a search that matches nothing says so, and finds a medicine by its generic", () => {
    const { box } = open(loaded([NAPA, SERGEL]));
    fireEvent.change(searchBox(box), { target: { value: "zzz" } });
    expect(within(box).queryAllByRole("checkbox")).toHaveLength(0);
    expect(box.textContent).toContain("No medicine matches “zzz”.");
    expect(box.textContent).not.toContain("No medicines yet");
    fireEvent.change(searchBox(box), { target: { value: "esomep" } });
    expect(rowNames(box)).toEqual(["Capsule. Sergel 20 mg"]);
  });

  it("Escape in a search with something typed clears the search — the ticks are not thrown away with the box", () => {
    const { box, onClose } = open(loaded([NAPA, SERGEL]));
    tick(box, "Capsule. Sergel 20 mg");
    fireEvent.change(searchBox(box), { target: { value: "napa" } });
    fireEvent.keyDown(searchBox(box), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(searchBox(box).value).toBe("");
    expect(tickBox(box, "Capsule. Sergel 20 mg").checked).toBe(true);
    fireEvent.keyDown(searchBox(box), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a medicine already on the pad with the same instruction is skipped, and the summary says so", () => {
    const pad: RxItem[] = [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After meal" }];
    const { box, onAdd } = open(loaded([NAPA, SERGEL]), pad);
    tick(box, "Tablet. Napa 500 mg");
    tick(box, "Capsule. Sergel 20 mg");
    fireEvent.click(addButton(box));
    const [items, summary] = onAdd.mock.calls[0] as [RxItem[], string];
    expect(items.map((it) => it.drug)).toEqual(["Capsule. Sergel 20 mg"]);
    expect(summary).toBe("1 added · 1 already on ℞");
  });

  it("when everything ticked is already on the pad nothing is added, the box stays open and says why", () => {
    const pad: RxItem[] = [{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After meal" }];
    const { box, onAdd, onClose } = open(loaded([NAPA]), pad);
    tick(box, "Tablet. Napa 500 mg");
    fireEvent.click(addButton(box));
    expect(onAdd).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(box.textContent).toContain("already on ℞");
    // The note goes when the choice changes: it was about the last press.
    tick(box, "Tablet. Napa 500 mg");
    expect(box.textContent).not.toContain("already on ℞");
  });

  it("says it is loading", () => {
    const { box } = open({ isLoading: true, isError: false, refetch: vi.fn() });
    expect(within(box).getByRole("status").textContent).toContain("Loading your medicines");
    expect(within(box).queryAllByRole("checkbox")).toHaveLength(0);
    expect(box.textContent).not.toContain("No medicines yet");
  });

  it("⚕️ a list that did not load says so and offers Try again — never 'No medicines yet'", () => {
    const refetch = vi.fn();
    const { box } = open({ isLoading: false, isError: true, error: new Error("Failed to fetch"), refetch });
    expect(within(box).getByRole("alert").textContent).toContain("Your medicines could not be loaded.");
    expect(box.textContent).not.toContain("Failed to fetch");
    expect(box.textContent).not.toContain("No medicines yet");
    fireEvent.click(within(box).getByRole("button", { name: /Try again/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a refusal the server worded for a person is shown; its own words for a crash are not", () => {
    const refused = open({ isLoading: false, isError: true, error: new ApiError(403, "You are not an active assistant of this doctor."), refetch: vi.fn() });
    expect(refused.box.textContent).toContain("You are not an active assistant of this doctor.");
    cleanup();
    const crashed = open({ isLoading: false, isError: true, error: new ApiError(500, "Internal server error"), refetch: vi.fn() });
    expect(crashed.box.textContent).toContain("Your medicines could not be loaded.");
    expect(crashed.box.textContent).not.toContain("Internal server error");
    expect(crashed.box.textContent).toContain("Please try again in a moment.");
    expect(crashed.box.textContent).not.toContain("internet"); // the connection is not what failed
  });

  it("⚕️ a refresh that fails with nothing to show is a failure, not an empty history", () => {
    const { box } = open({ data: undefined, isLoading: false, isError: true, error: new Error("x"), refetch: vi.fn() });
    expect(within(box).queryByRole("alert")).not.toBeNull();
    expect(box.textContent).not.toContain("No medicines yet");
  });

  it("a doctor with no history is told how the list fills", () => {
    const { box } = open(loaded([]));
    expect(box.textContent).toContain("No medicines yet");
    expect(box.textContent).toContain("They appear here after you save prescriptions.");
    expect(addButton(box).disabled).toBe(true);
  });

  it("says when rows were left out, and when the list was cut at its cap", () => {
    const { box } = open(loaded([NAPA], { unreadable: 2, truncated: true }));
    expect(box.textContent).toContain("2 medicines could not be read and are not listed.");
    expect(box.textContent).toContain("Showing your 2,000 most used medicines.");
  });

  it("one row left out is written in the singular, and a whole list says neither", () => {
    expect(open(loaded([NAPA], { unreadable: 1 })).box.textContent).toContain("1 medicine could not be read and is not listed.");
    cleanup();
    const { box } = open(loaded([NAPA]));
    expect(box.textContent).not.toContain("could not be read");
    expect(box.textContent).not.toContain("most used medicines");
  });

  it("Cancel closes it and adds nothing", () => {
    const { box, onAdd, onClose } = open(loaded([NAPA]));
    tick(box, "Tablet. Napa 500 mg");
    fireEvent.click(within(box).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("the × closes it and adds nothing", () => {
    const { box, onAdd, onClose } = open(loaded([NAPA]));
    tick(box, "Tablet. Napa 500 mg");
    fireEvent.click(within(box).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("a press on the veil closes it; a press inside the box does not", () => {
    const { box, onClose } = open(loaded([NAPA]));
    fireEvent.click(box);
    tick(box, "Tablet. Napa 500 mg");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(box.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opened again, it starts with nothing ticked, most-patients-first and no search", () => {
    const list = loaded([NAPA, ACE]);
    const props = { onClose: () => undefined, existing: [] as RxItem[], list, onAdd: () => undefined };
    const { rerender } = render(<BulkMedicineModal open {...props} />);
    const first = screen.getByRole("dialog");
    tick(first, "Tablet. Napa 500 mg");
    fireEvent.click(within(first).getByRole("button", { name: "Alphabetical" }));
    fireEvent.change(searchBox(first), { target: { value: "napa" } });
    rerender(<BulkMedicineModal open={false} {...props} />);
    rerender(<BulkMedicineModal open {...props} />);
    const again = screen.getByRole("dialog");
    expect(rowNames(again)).toEqual(["Tablet. Napa 500 mg", "Tablet. Ace 500 mg"]);
    expect(tickBox(again, "Tablet. Napa 500 mg").checked).toBe(false);
    expect(searchBox(again).value).toBe("");
    expect(addButton(again).disabled).toBe(true);
  });

  it("⚕️ a ticked medicine that is no longer in the list is not added, and not counted", () => {
    // The list is fetched again on every opening; a refetch can drop a row
    // (a dose hidden on another device) while its tick is still held.
    const props = { onClose: () => undefined, existing: [] as RxItem[] };
    const onAdd = vi.fn();
    const { rerender } = render(<BulkMedicineModal open {...props} list={loaded([NAPA, SERGEL])} onAdd={onAdd} />);
    const box = screen.getByRole("dialog");
    tick(box, "Tablet. Napa 500 mg");
    tick(box, "Capsule. Sergel 20 mg");
    rerender(<BulkMedicineModal open {...props} list={loaded([NAPA])} onAdd={onAdd} />);
    expect(addButton(box).textContent).toBe("Add (1)");
    fireEvent.click(addButton(box));
    expect((onAdd.mock.calls[0][0] as RxItem[]).map((it) => it.drug)).toEqual(["Tablet. Napa 500 mg"]);
  });
});
