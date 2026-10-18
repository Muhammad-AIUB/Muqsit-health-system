// @vitest-environment jsdom
//
// ⚕️ Physician's sheet, 18/10/2026, item 6: above the medicines, a box headed
// "Your selected medicine names are:" names what is ticked — "noile ami vula
// jete pari ki ki add kora baki ase" (or I may forget what is left to add).
// It names what Add will add: every tick, also one a search has hidden, in the
// order Add puts them on the ℞. It never moves the list under a finger that is
// ticking, and it adds no Tab stop to the box. Every medicine here is made up.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import BulkMedicineModal, { type BulkBoxState } from "./BulkMedicineModal";
import type { BulkMedicine } from "@/lib/bulkMedicines";

afterEach(cleanup);

const med = (id: string, drugLabel: string, patientCount: number): BulkMedicine => ({ id, drugLabel, dose: "1+0+1", food: "", duration: "7 days", contLines: [], patientCount });
// Popular order — the order on screen and the order Add adds: Napa, Sergel, Febus.
const NAPA = med("h1", "Tablet. Napa 500 mg", 30);
const SERGEL = med("h2", "Capsule. Sergel 20 mg", 20);
const FEBUS = med("h3", "Tablet. Febus 40 mg", 10);
const state: BulkBoxState = { status: "list", list: { medicines: [NAPA, SERGEL, FEBUS], truncated: false, unreadable: 0 } };

const open = () => {
  render(<BulkMedicineModal state={state} onClose={vi.fn()} existing={[]} onAdd={vi.fn()} />);
  return screen.getByRole("dialog", { name: "Add Bulk Medicine" });
};
const tick = (box: HTMLElement, name: string) =>
  fireEvent.click(within(box).getByRole("checkbox", { name: new RegExp(name.replace(/[.]/g, "\.")) }));
const selectedBox = (box: HTMLElement) => within(box).getByRole("region", { name: "Your selected medicine names are:" });
const names = (box: HTMLElement) => within(selectedBox(box)).queryAllByRole("listitem").map((li) => li.getAttribute("data-name"));

describe("Add Bulk Medicine — the selected names", () => {
  it("is headed as the physician wrote it, and says nothing is ticked yet", () => {
    const box = open();
    expect(selectedBox(box).textContent).toContain("Your selected medicine names are:");
    expect(names(box)).toEqual([]);
    expect(selectedBox(box).textContent).toContain("None yet");
  });

  it("names each ticked medicine in the order Add puts them on the ℞", () => {
    const box = open();
    tick(box, "Tablet. Febus 40 mg");
    tick(box, "Tablet. Napa 500 mg");
    expect(names(box)).toEqual(["Tablet. Napa 500 mg", "Tablet. Febus 40 mg"]);
  });

  // ⚕️ Review, 18/10/2026: a box that grew with each wrapped line of names
  // pushed the chips down under the finger ticking them.
  it("keeps one height whatever is ticked, and scrolls inside itself", () => {
    const box = open();
    const h0 = selectedBox(box).style.height;
    expect(h0).toMatch(/px$/);
    for (const n of ["Tablet. Napa 500 mg", "Capsule. Sergel 20 mg", "Tablet. Febus 40 mg"]) tick(box, n);
    expect(selectedBox(box).style.height).toBe(h0);
    expect(selectedBox(box).style.overflowY).toBe("auto");
  });

  it("adds no Tab stop, and a press on × leaves the focus where it was", () => {
    const box = open();
    tick(box, "Tablet. Napa 500 mg");
    const x = within(selectedBox(box)).getByRole("button", { name: "Untick Tablet. Napa 500 mg" });
    expect(x.tabIndex).toBe(-1);
    expect(fireEvent.mouseDown(x)).toBe(false); // default prevented: the focus does not move to it
  });

  it("an untick takes the name off", () => {
    const box = open();
    tick(box, "Tablet. Napa 500 mg");
    tick(box, "Capsule. Sergel 20 mg");
    tick(box, "Tablet. Napa 500 mg");
    expect(names(box)).toEqual(["Capsule. Sergel 20 mg"]);
  });

  it("keeps a name whose chip a search has hidden — Add still adds it", () => {
    const box = open();
    tick(box, "Tablet. Napa 500 mg");
    fireEvent.change(within(box).getByRole("textbox", { name: "Search medicines" }), { target: { value: "sergel" } });
    expect(names(box)).toEqual(["Tablet. Napa 500 mg"]);
  });

  it("× beside a name unticks it", () => {
    const box = open();
    tick(box, "Tablet. Napa 500 mg");
    tick(box, "Tablet. Febus 40 mg");
    fireEvent.click(within(selectedBox(box)).getByRole("button", { name: "Untick Tablet. Napa 500 mg" }));
    expect(names(box)).toEqual(["Tablet. Febus 40 mg"]);
    expect((within(box).getByRole("checkbox", { name: /Tablet\. Napa 500 mg/ }) as HTMLInputElement).checked).toBe(false);
  });
});
