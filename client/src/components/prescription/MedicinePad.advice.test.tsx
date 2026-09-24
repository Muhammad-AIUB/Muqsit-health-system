// @vitest-environment jsdom
//
// ••• special advice on the ℞ pad (physician's design, 2026-09-24). Which
// advice reaches the Advice section is pinned in lib/rxDrugAdvice.test.ts; this
// pins the pad's side: the dots sit on a named medicine line only, on a pad that
// opted in, light up when advice is saved, and never start a line drag.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MedicinePad, { type Row } from "./MedicinePad";

vi.mock("@/hooks/useMedicineSearch", () => ({ useMedicineSearch: () => ({ results: [] }) }));
vi.mock("@/hooks/useRxHabits", () => ({ useRxHabits: () => ({ groups: [], refresh: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ rxHabitsApi: { setFlags: vi.fn() } }));

afterEach(cleanup);

const med = (drug: string): Row => ({ drug, dose: "1+0+1", food: "", duration: "", checked: true, isMedicine: true, continuation: false });
const taper = (): Row => ({ drug: "", dose: "1+0+0", food: "", duration: "", checked: true, isMedicine: true, continuation: true });
const note = (drug: string): Row => ({ drug, dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });
const blank = (): Row => note("");

function Pad({ advice, reorderable }: { advice?: { has: (r: Row) => boolean; open: (r: Row) => void }; reorderable?: boolean }) {
  const [rows, setRows] = useState<Row[]>([med("Tablet. Napa 500 mg"), taper(), note("bed rest"), med("capjubayer"), blank()]);
  return <MedicinePad rows={rows} setRows={setRows} showCheck={false} drugAdvice={advice} reorderable={reorderable} />;
}

describe("MedicinePad — special advice dots", () => {
  it("puts ••• on each named medicine line only — not a taper, a note or the typing line", () => {
    render(<Pad advice={{ has: () => false, open: vi.fn() }} />);
    const dots = screen.getAllByTitle("Add special advice to this drug");
    expect(dots.map((d) => d.getAttribute("aria-label"))).toEqual([
      "Special advice for Tablet. Napa 500 mg",
      "Special advice for capjubayer",
    ]);
  });

  it("shows nothing on a pad that did not opt in", () => {
    render(<Pad />);
    expect(screen.queryAllByTitle("Add special advice to this drug")).toHaveLength(0);
  });

  it("marks a line whose advice is saved, and opens the box for THAT medicine", () => {
    const open = vi.fn();
    render(<Pad advice={{ has: (r) => r.drug === "capjubayer", open }} />);
    const saved = screen.getByTitle("Special advice saved for this drug — click to view");
    expect(saved.getAttribute("data-has-advice")).toBe("yes");
    fireEvent.click(saved);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0].drug).toBe("capjubayer");
  });

  it("does not start a line drag from the dots on a reorderable pad", () => {
    const open = vi.fn();
    const { container } = render(<Pad advice={{ has: () => false, open }} reorderable />);
    const dots = screen.getAllByTitle("Add special advice to this drug")[0];
    fireEvent.pointerDown(dots, { button: 0, pointerId: 1, clientY: 10 });
    expect(container.querySelector(".rx-dragging")).toBeNull();
  });
});
