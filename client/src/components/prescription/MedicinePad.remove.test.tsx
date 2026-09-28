// @vitest-environment jsdom
//
// × and >>> on the ℞ pad treat a medicine and its tapering lines as one block,
// like moving does (lib/rxRowMove.ts). A taper row has no drug name of its own:
// left behind by ×, it silently becomes a taper of the medicine above it.

import { useState } from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MedicinePad, { type Row } from "./MedicinePad";

vi.mock("@/hooks/useMedicineSearch", () => ({ useMedicineSearch: () => ({ results: [] }) }));
vi.mock("@/hooks/useRxHabits", () => ({ useRxHabits: () => ({ groups: [], refresh: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ rxHabitsApi: { setFlags: vi.fn() } }));

afterEach(cleanup);

const med = (drug: string, dose: string, duration = ""): Row => ({ drug, dose, food: "", duration, checked: true, isMedicine: true, continuation: false });
const taper = (dose: string, duration = ""): Row => ({ drug: "", dose, food: "", duration, checked: true, isMedicine: true, continuation: true });
const blank = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });

let latest: Row[] = [];
function Pad({ start }: { start: Row[] }) {
  const [rows, setRows] = useState<Row[]>(start);
  latest = rows;
  return <MedicinePad rows={rows} setRows={setRows} showCheck={false} />;
}
const order = () => latest.map((r) => (r.continuation ? `↳${r.dose}` : r.drug || "∅"));
const removeButtons = () => screen.getAllByText("×");

describe("MedicinePad — × removes a medicine with its tapering lines", () => {
  it("⚕️ × on a medicine takes its taper with it, not onto the medicine above", () => {
    render(<Pad start={[med("Napa", "1+0+1"), med("Prednisolone", "4+0+0", "7 days"), taper("3+0+0", "7 days"), blank()]} />);
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(removeButtons()[1]); // Prednisolone
    expect(order()).toEqual(["Napa", "∅"]);
  });

  it("⚕️ × on the first medicine leaves no orphaned taper", () => {
    render(<Pad start={[med("Prednisolone", "4+0+0"), taper("3+0+0"), taper("2+0+0"), med("Napa", "1+0+1"), blank()]} />);
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(removeButtons()[0]);
    expect(order()).toEqual(["Napa", "∅"]);
  });

  it("× on a taper line removes only that line", () => {
    render(<Pad start={[med("Prednisolone", "4+0+0"), taper("3+0+0"), taper("2+0+0"), blank()]} />);
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(removeButtons()[1]); // the 3+0+0 taper
    expect(order()).toEqual(["Prednisolone", "↳2+0+0", "∅"]);
  });
});

describe("MedicinePad — >>> puts the caret on the NEW taper line", () => {
  it("does not land in an existing taper's dose", async () => {
    const { container } = render(<Pad start={[med("Prednisolone", "4+0+0"), taper("3+0+0"), blank()]} />);
    fireEvent.click(screen.getAllByTitle("Add subsequent dose and duration for this drug")[0]);
    await act(() => new Promise((r) => setTimeout(r, 60)));
    expect(order()).toEqual(["Prednisolone", "↳3+0+0", "↳", "∅"]);
    const newRow = container.querySelector('[data-rx-row="2"]');
    expect(newRow?.contains(document.activeElement)).toBe(true);
    const existing = container.querySelector('[data-rx-row="1"]');
    expect(existing?.contains(document.activeElement)).toBe(false);
  });
});
