// @vitest-environment jsdom
//
// ⚕️ A >>> line belongs to the line directly above it. With that line's medicine
// name cleared (or under a note), the line has no medicine; before 18/10/2026
// it was saved and printed under the medicine before — a dose for the wrong
// drug. Save & print now refuses such a pad, and the pad says, on the line
// itself, what is wrong and what to do. Every medicine here is made up.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

function Pad({ start }: { start: Row[] }) {
  const [rows, setRows] = useState<Row[]>(start);
  return <MedicinePad rows={rows} setRows={setRows} showCheck={false} />;
}
const warnings = () => screen.queryAllByRole("alert").map((a) => a.textContent ?? "");

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
