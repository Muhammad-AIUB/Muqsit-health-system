// @vitest-environment jsdom
//
// Moving ℞ lines (physician's request, 2026-09-23). The block rules are pinned
// in lib/rxRowMove.test.ts; this pins the wiring: ▲ / ▼ appear only with
// ✎ Edit on and only on a pad that opted in, and a medicine carries its
// >>> tapering line with it.

import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    // Two medicines have a grip; the taper and the typing row do not.
    expect(container.querySelectorAll("[data-rx-grip]")).toHaveLength(2);
  });
});

// ── Dragging by the serial number ─────────────────────────────
// jsdom has no layout, so every pad row is laid out 40px tall from y=100 by
// its position. Rows are keyed by position, so this stays true across swaps.
const ROW = 40;
const TOP = 100;
const rowTop = (i: number) => TOP + i * ROW;
const rowMid = (i: number) => rowTop(i) + ROW / 2;
const realRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const i = this.getAttribute("data-rx-row");
    if (i == null) return realRect.call(this);
    const top = rowTop(Number(i));
    return { top, bottom: top + ROW, height: ROW, left: 0, right: 600, width: 600, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  };
});
afterEach(() => { HTMLElement.prototype.getBoundingClientRect = realRect; });

function DragPad({ start }: { start: Row[] }) {
  const [rows, setRows] = useState<Row[]>(start);
  latest = rows;
  return <MedicinePad rows={rows} setRows={setRows} showCheck={false} reorderable />;
}
const six = () => ["A", "B", "C", "D", "E", "F"].map((n) => med(n, "1+0+1")).concat(blank());
const names = () => latest.map((r) => (r.continuation ? `↳${r.dose}` : r.drug || "∅")).join(",");

// Pick up the line at `from`, move the pointer through `ys` (each a single
// pointermove, so one entry = one sweep the browser reported once), let go.
function dragLine(container: HTMLElement, from: number, ys: number[]) {
  const grip = container.querySelector(`[data-rx-grip="${from}"]`) as HTMLElement;
  fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientY: rowMid(from) });
  for (const y of ys) fireEvent.pointerMove(grip, { pointerId: 1, clientY: y });
  fireEvent.pointerUp(grip, { pointerId: 1 });
}

describe("MedicinePad — dragging a line (regression, 2026-09-23)", () => {
  it("one row up moves exactly one step", () => {
    const { container } = render(<DragPad start={six()} />);
    dragLine(container, 5, [rowMid(4) - 2]);
    expect(names()).toBe("A,B,C,D,F,E,∅");
  });

  it("one row down moves exactly one step", () => {
    const { container } = render(<DragPad start={six()} />);
    dragLine(container, 0, [rowMid(1) + 2]);
    expect(names()).toBe("B,A,C,D,E,F,∅");
  });

  it("stopping short of the neighbour's middle moves nothing, in both directions", () => {
    const { container } = render(<DragPad start={six()} />);
    dragLine(container, 3, [rowMid(2) + 2]);
    dragLine(container, 3, [rowMid(4) - 2]);
    expect(names()).toBe("A,B,C,D,E,F,∅");
  });

  it("a fast sweep reported as ONE pointer event still takes every step it crossed", () => {
    const { container } = render(<DragPad start={six()} />);
    dragLine(container, 5, [rowMid(2) - 2]); // three rows up in one event
    expect(names()).toBe("A,B,F,C,D,E,∅");
    dragLine(container, 0, [rowMid(3) + 2]); // three rows down in one event
    expect(names()).toBe("B,F,C,A,D,E,∅");
  });

  it("⚕️ a medicine drags WITH its tapering lines, and steps over another's as one block", () => {
    const start = [med("A", "1+0+1"), med("P", "2+0+0"), taper("1+0+0"), taper("1/2+0+0"), med("Z", "0+0+1"), blank()];
    const { container } = render(<DragPad start={start} />);
    // Z (row 4) up past the middle of P's whole block (rows 1-3, middle = row 2's middle).
    dragLine(container, 4, [rowMid(2) - 2]);
    expect(names()).toBe("A,Z,P,↳1+0+0,↳1/2+0+0,∅");
    // Now drag P (row 2) up past Z's middle: its two tapers must come with it.
    dragLine(container, 2, [rowMid(1) - 2]);
    expect(names()).toBe("A,P,↳1+0+0,↳1/2+0+0,Z,∅");
  });

  it("never lands below the typing line", () => {
    const { container } = render(<DragPad start={six()} />);
    dragLine(container, 4, [rowMid(9)]);
    expect(names()).toBe("A,B,C,D,F,E,∅");
  });
});
