// @vitest-environment jsdom
//
// Moving ℞ lines (physician's request, 2026-09-23). The block rules are pinned
// in lib/rxRowMove.test.ts; this pins the wiring: ▲ / ▼ appear only with
// ✎ Edit on and only on a pad that opted in, and a medicine carries its
// >>> tapering line with it.

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
const blank = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });

let latest: Row[] = [];
function Pad({ reorderable }: { reorderable?: boolean }) {
  const [rows, setRows] = useState<Row[]>([med("Tablet. Napa 500 mg", "1+1+1"), med("Tablet. Pred 5 mg", "2+0+0"), taper("1+0+0"), blank()]);
  latest = rows;
  return <MedicinePad rows={rows} setRows={setRows} showCheck={false} reorderable={reorderable} />;
}
const order = () => latest.map((r) => (r.continuation ? `↳${r.dose}` : r.drug || "∅"));

describe("MedicinePad — moving lines", () => {
  it("shows ▲ / ▼ only while ✎ Edit is on", () => {
    render(<Pad reorderable />);
    expect(screen.queryAllByLabelText("Move this line up")).toHaveLength(0);
    fireEvent.click(screen.getByText("✎ Edit"));
    // One pair per medicine — the taper line and the typing line get none.
    expect(screen.getAllByLabelText("Move this line up")).toHaveLength(2);
  });

  it("⚕️ moves a medicine together with its tapering line", () => {
    render(<Pad reorderable />);
    fireEvent.click(screen.getByText("✎ Edit"));
    fireEvent.click(screen.getAllByLabelText("Move this line up")[1]);
    expect(order()).toEqual(["Tablet. Pred 5 mg", "↳1+0+0", "Tablet. Napa 500 mg", "∅"]);
  });

  it("disables ▲ on the first line and ▼ on the last", () => {
    render(<Pad reorderable />);
    fireEvent.click(screen.getByText("✎ Edit"));
    expect((screen.getAllByLabelText("Move this line up")[0] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByLabelText("Move this line down")[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("a pad that did not opt in offers no moving at all", () => {
    const { container } = render(<Pad />);
    fireEvent.click(screen.getByText("✎ Edit"));
    expect(screen.queryAllByLabelText("Move this line up")).toHaveLength(0);
    expect(container.querySelector('[draggable="true"]')).toBeNull();
  });

  it("the serial number is the drag handle on a pad that opted in", () => {
    const { container } = render(<Pad reorderable />);
    // Two medicines are draggable; the taper and the typing row are not.
    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(2);
  });
});
