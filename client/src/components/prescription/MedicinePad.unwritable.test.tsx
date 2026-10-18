// @vitest-environment jsdom
//
// ⚕️ A >>> line belongs to the line directly above it. With that line's medicine
// name cleared (or under a note), the line has no medicine; before 18/10/2026
// it was saved and printed under the medicine before — a dose for the wrong
// drug. Save & print now refuses such a pad, and the pad says, on the line
// itself, what is wrong and what to do. Every medicine here is made up.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MedicinePad, { type Row } from "./MedicinePad";

vi.mock("@/hooks/useMedicineSearch", () => ({ useMedicineSearch: () => ({ results: [] }) }));
vi.mock("@/hooks/useRxHabits", () => ({ useRxHabits: () => ({ groups: [], refresh: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ rxHabitsApi: { setFlags: vi.fn() } }));

afterEach(cleanup);

const med = (drug: string, dose: string): Row => ({ drug, dose, food: "", duration: "", checked: true, isMedicine: true, continuation: false });
const taper = (dose: string): Row => ({ drug: "", dose, food: "", duration: "", checked: true, isMedicine: true, continuation: true });
const note = (text: string): Row => ({ drug: text, dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });
const blank = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });

let latest: Row[] = [];
function Pad({ start }: { start: Row[] }) {
  const [rows, setRows] = useState<Row[]>(start);
  latest = rows;
  return <MedicinePad rows={rows} setRows={setRows} showCheck={false} />;
}
// Said politely (a status, not an alert): it appears while a name is retyped.
const warnings = () => screen.queryAllByRole("status").map((a) => a.textContent ?? "").filter((t) => /medicine/i.test(t));
const order = () => latest.map((r) => (r.continuation ? `>>>${r.dose}` : r.drug || "(none)"));

describe("MedicinePad — a line it cannot write is marked on the line", () => {
  it("a >>> line under a medicine whose name was cleared", () => {
    render(<Pad start={[med("Tablet. Napa 500 mg", "1+1+1"), med("", "1+0+1"), taper("0+0+1"), blank()]} />);
    const w = warnings();
    expect(w.some((t) => /no medicine name/i.test(t))).toBe(true);
    expect(w.some((t) => /no medicine above it/i.test(t))).toBe(true);
  });

  it("a >>> line under a note", () => {
    render(<Pad start={[med("Tablet. Napa 500 mg", "1+1+1"), note("Bed rest"), taper("0+0+1"), blank()]} />);
    expect(warnings().some((t) => /no medicine above it/i.test(t))).toBe(true);
  });

  it("nothing is marked on a pad that can be written", () => {
    render(<Pad start={[med("Tablet. Napa 500 mg", "1+1+1"), taper("0+0+1"), note("Bed rest"), blank()]} />);
    expect(warnings()).toEqual([]);
  });
});

// ⚕️ Review of the first fix (18/10/2026): stopped at the SOURCE. A medicine
// that has >>> lines keeps its name — emptied and left, the name comes back,
// and the pad says how to take the medicine off (× takes its >>> lines with it)
// or change it (type the new name). A blank line with >>> lines under it is
// never tidied away by ×, which would put its >>> lines under the medicine above.
describe("MedicinePad — a medicine with >>> lines keeps its name", () => {
  it("emptied and left, the name comes back and the pad says why", () => {
    render(<Pad start={[med("Tablet. Napa 500 mg", "1+1+1"), med("Tablet. Barcavir 0.5 mg", "1+0+0"), taper("0+0+1"), blank()]} />);
    const name = document.querySelector('[data-rx-row="1"] input') as HTMLInputElement;
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.blur(name);
    expect(latest[1].drug).toBe("Tablet. Barcavir 0.5 mg");
    expect(warnings().some((t) => /keeps its name/i.test(t))).toBe(true);
  });

  it("a NEW name typed in its place is taken", () => {
    render(<Pad start={[med("Tablet. Barcavir 0.5 mg", "1+0+0"), taper("0+0+1"), blank()]} />);
    const name = document.querySelector('[data-rx-row="0"] input') as HTMLInputElement;
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: "Tablet. Entaliv 0.5 mg" } });
    fireEvent.blur(name);
    expect(latest[0].drug).toBe("Tablet. Entaliv 0.5 mg");
  });

  it("a medicine with no >>> lines may still be emptied", () => {
    render(<Pad start={[med("Tablet. Napa 500 mg", "1+1+1"), blank()]} />);
    const name = document.querySelector('[data-rx-row="0"] input') as HTMLInputElement;
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.blur(name);
    expect(latest[0].drug).toBe("");
  });

  it("× on a >>> line never strands the next one under the medicine above", () => {
    // A line whose name was cleared before this release, its doses in its tapers.
    render(<Pad start={[med("Tablet. Napa 500 mg", "1+1+1"), med("", ""), taper("1+0+1"), taper("0+0+1"), blank()]} />);
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(screen.getAllByText("×")[2]); // the 1+0+1 line (Napa, the cleared line, then it)
    expect(order()).toEqual(["Tablet. Napa 500 mg", "(none)", ">>>0+0+1", "(none)"]);
    expect(warnings().some((t) => /no medicine above it|no medicine name/i.test(t))).toBe(true);
  });

  it("the cleared line has a × of its own, which takes its >>> lines with it", () => {
    // Two >>> lines: × on the first of them (all the old pad offered) left the
    // second under Napa.
    render(<Pad start={[med("Tablet. Napa 500 mg", "1+1+1"), med("", ""), taper("1+0+1"), taper("0+0+1"), blank()]} />);
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(screen.getAllByText("×")[1]);
    expect(order()).toEqual(["Tablet. Napa 500 mg", "(none)"]);
  });
});

