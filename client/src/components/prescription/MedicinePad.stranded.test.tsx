// @vitest-environment jsdom
//
// ⚕️ Third review of the >>> fix (18/10/2026). A >>> line belongs to the line
// directly above it, so ANY edit that changes what stands above a >>> line with
// no medicine of its own hands its dose to another medicine. The review found
// two such edits on the pad (× tidying away a blank note, ▲ on a medicine), a
// name put back on the wrong line after the lines moved under the caret, and a
// notice left under the wrong medicine. Every medicine here is made up.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import MedicinePad, { type Row } from "./MedicinePad";
import { rowsFromRxItems, rxItemsFromRows, unwritableRows } from "@/lib/rxRows";
import type { RxItem } from "@/types";

const hits = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/hooks/useMedicineSearch", () => ({ useMedicineSearch: () => ({ results: hits.list }) }));
vi.mock("@/hooks/useRxHabits", () => ({ useRxHabits: () => ({ groups: [], refresh: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ rxHabitsApi: { setFlags: vi.fn() } }));

afterEach(() => { cleanup(); hits.list = []; });

const med = (drug: string, dose: string): Row => ({ drug, dose, food: "", duration: "", checked: true, isMedicine: true, continuation: false });
const taper = (dose: string): Row => ({ drug: "", dose, food: "", duration: "", checked: true, isMedicine: true, continuation: true });
const blank = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });
const item = (drug: string, dose = "1+0+1"): RxItem => ({ drug, dose, duration: "", instruction: "", isCont: false });
const contItem = (dose: string): RxItem => ({ drug: "", dose, duration: "", instruction: "", isCont: true });
const noteItem = (text: string): RxItem => ({ drug: text, dose: "", duration: "", instruction: "", isNote: true });

let latest: Row[] = [];
let setOutside: (rows: Row[]) => void = () => {};
function Pad({ start, reorderable }: { start: Row[]; reorderable?: boolean }) {
  const [rows, setRows] = useState<Row[]>(start);
  latest = rows;
  setOutside = setRows;
  return <MedicinePad rows={rows} setRows={setRows} showCheck={false} reorderable={reorderable} />;
}
const box = (row: number) => document.querySelector(`[data-rx-row="${row}"] input`) as HTMLInputElement;
const inRow = (row: number, label: string) => document.querySelector(`[data-rx-row="${row}"] [aria-label="${label}"]`) as HTMLButtonElement;
const said = () => screen.queryAllByRole("status").map((a) => a.textContent ?? "");
const order = () => latest.map((r) => (r.continuation ? `>>>${r.dose}` : r.drug || "(none)"));
// What the pad writes — what Save & print, the draft and Drug history are given.
const written = () => rxItemsFromRows(latest).map((i) => (i.isCont ? `>>>${i.dose}` : i.drug));

// Data saved before 18/10/2026 can hold a >>> line with no medicine line above
// it: at the top of the pad, or straight under a note.
describe("a >>> line saved with no medicine above it never becomes another medicine's", () => {
  it("× elsewhere tidies away a blank note above it — the dose is not written under the medicine before", () => {
    render(<Pad start={rowsFromRxItems([item("Tablet. Napa 500 mg"), item("Tablet. Bex 10 mg"), noteItem("Bed rest"), contItem("0+0+1")])} />);
    fireEvent.change(box(2), { target: { value: "" } });
    fireEvent.blur(box(2));
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(inRow(1, "Remove this line")); // Bex
    expect(written()).toEqual(["Tablet. Napa 500 mg"]);
    expect(unwritableRows(latest).length).toBeGreaterThan(0); // still marked, still refused at Save
  });

  it("▲ never takes a medicine above it at the top of the pad", () => {
    render(<Pad reorderable start={rowsFromRxItems([contItem("0+0+1"), item("Tablet. Napa 500 mg"), item("Tablet. Bex 10 mg")])} />);
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(inRow(2, "Move this line up")); // Bex above Napa
    const up = inRow(1, "Move this line up");
    if (up && !up.disabled) fireEvent.click(up); // and above the >>> dose, if it can
    expect(written().some((t) => t.startsWith(">>>"))).toBe(false);
    expect(unwritableRows(latest).length).toBeGreaterThan(0);
  });

  // The second guard, for rows that reach the pad without `rowsFromRxItems`.
  it("× elsewhere never tidies away the blank line straight above a >>> line", () => {
    const note = (text: string): Row => ({ ...blank(), drug: text });
    render(<Pad start={[med("Tablet. Napa 500 mg", "1+1+1"), med("Tablet. Bex 10 mg", "1+0+1"), note(""), taper("0+0+1"), blank()]} />);
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(inRow(1, "Remove this line")); // Bex
    expect(written()).toEqual(["Tablet. Napa 500 mg"]);
    expect(unwritableRows(latest).length).toBeGreaterThan(0);
  });

  it("× on the note above it does not hand it to the medicine before", () => {
    render(<Pad start={rowsFromRxItems([item("Tablet. Napa 500 mg"), noteItem("Bed rest"), contItem("0+0+1")])} />);
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(inRow(1, "Remove this line"));
    expect(written()).toEqual(["Tablet. Napa 500 mg"]);
  });
});

// The name kept on a medicine with >>> lines is put back only on the lines it
// was taken from.
describe("MedicinePad — the name it keeps is that line's own", () => {
  const B1 = med("Tablet. Barcavir 1 mg", "1+0+0");
  const B05 = med("Tablet. Barcavir 0.5 mg", "1+0+0");

  it("lines redrawn under the caret (another device, a move) — no name is put back on another medicine's >>> line", () => {
    render(<Pad start={[B1, taper("1+0+1"), B05, taper("0+0+1"), blank()]} />);
    fireEvent.focus(box(2));
    // The pad is drawn again while the caret stays in row 2, which now holds 1 mg.
    act(() => setOutside([{ ...B05 }, taper("0+0+1"), { ...B1 }, taper("1+0+1"), blank()]));
    fireEvent.change(box(2), { target: { value: "" } });
    fireEvent.blur(box(2));
    expect(order()).toEqual(["Tablet. Barcavir 0.5 mg", ">>>0+0+1", "(none)", ">>>1+0+1", "(none)"]);
    expect(said().some((t) => /no medicine above it/i.test(t))).toBe(true);
  });

  it("picking a line up to drag it leaves the name box first", () => {
    render(<Pad reorderable start={[B1, taper("1+0+1"), B05, taper("0+0+1"), blank()]} />);
    box(2).focus();
    expect(document.activeElement).toBe(box(2));
    fireEvent.pointerDown(document.querySelector('[data-rx-grip="2"]')!, { button: 0, pointerId: 1, clientY: 0 });
    expect(document.activeElement).not.toBe(box(2));
  });

  it("a name emptied and the line dragged at once keeps the name", () => {
    render(<Pad reorderable start={[B1, taper("1+0+1"), B05, taper("0+0+1"), blank()]} />);
    box(2).focus();
    fireEvent.change(box(2), { target: { value: "" } });
    const grip = document.querySelector('[data-rx-grip="2"]')!;
    fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: 0 });
    fireEvent.pointerUp(grip, { pointerId: 1 });
    expect(order().filter((t) => t !== "(none)")).toContain("Tablet. Barcavir 0.5 mg");
    const at = latest.findIndex((r) => r.drug === "Tablet. Barcavir 0.5 mg");
    expect(latest[at + 1]).toMatchObject({ continuation: true, dose: "0+0+1" });
  });

  it("× on the medicine takes its notice with it — never left under the line that took its place", () => {
    render(<Pad start={[med("Tablet. Napa 500 mg", "1+1+1"), med("Tablet. Barcavir 0.5 mg", "1+0+0"), taper("0+0+1"), med("Tablet. Sergel 20 mg", "1+0+1"), blank()]} />);
    fireEvent.focus(box(1));
    fireEvent.change(box(1), { target: { value: "" } });
    fireEvent.blur(box(1));
    expect(said().some((t) => /keeps its name/i.test(t))).toBe(true);
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(inRow(1, "Remove this line"));
    expect(order()).toEqual(["Tablet. Napa 500 mg", "Tablet. Sergel 20 mg", "(none)"]);
    expect(said().some((t) => /keeps its name/i.test(t))).toBe(false);
  });

  it("× after the name came back takes the medicine with its >>> lines", () => {
    render(<Pad start={[med("Tablet. Napa 500 mg", "1+1+1"), med("Tablet. Barcavir 0.5 mg", "1+0+0"), taper("0+0+1"), blank()]} />);
    fireEvent.focus(box(1));
    fireEvent.change(box(1), { target: { value: "" } });
    fireEvent.blur(box(1));
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(inRow(1, "Remove this line"));
    expect(order()).toEqual(["Tablet. Napa 500 mg", "(none)"]);
  });

  it("a medicine picked from the list in its place is taken, its >>> lines under it", () => {
    hits.list = [{ id: "m1", brandName: "Entaliv", dosageForm: "Tablet", strength: "0.5 mg", genericName: "Entecavir" }];
    render(<Pad start={[med("Tablet. Barcavir 0.5 mg", "1+0+0"), taper("0+0+1"), blank()]} />);
    fireEvent.focus(box(0));
    fireEvent.change(box(0), { target: { value: "Enta" } });
    fireEvent.mouseDown(screen.getByText("Tablet. Entaliv 0.5 mg"));
    fireEvent.blur(box(0));
    expect(order()).toEqual(["Tablet. Entaliv 0.5 mg", ">>>0+0+1", "(none)"]);
    expect(said().some((t) => /keeps its name/i.test(t))).toBe(false);
  });
});
