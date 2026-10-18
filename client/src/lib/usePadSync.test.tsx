// @vitest-environment jsdom
//
// ⚕️ The OPD ℞ pad keeps its own rows and copies them into the prescription
// (`rxItems`), and copies a change made elsewhere (a template, the BAN/EN
// switch, Move to Rx) back onto the pad. Two edits can land in ONE render
// before the first one's copy has reached `rxItems`: seen in a browser on
// 2026-10-15 by typing "b", "m" in the food cell in BAN — the pad took the
// stale copy for a change made elsewhere, put the older text back, and the two
// copies chased each other until React stopped the screen ("This screen
// stopped working"), a prescription half written.

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { usePadSync } from "./usePadSync";
import type { Row } from "@/components/prescription/MedicinePad";
import type { RxItem } from "@/types";

afterEach(cleanup);

const napa = (food: string): Row => ({ drug: "Tablet. Napa 500 mg", dose: "১+০+১", food, duration: "৭ দিন", checked: true, isMedicine: true, continuation: false });
const blank = (): Row => ({ drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false });
const item = (instruction: string): RxItem => ({ drug: "Tablet. Napa 500 mg", dose: "১+০+১", instruction, duration: "৭ দিন" });

// The prescription's own store, with its updates held back until the test
// lets them land — which is how a render can see the pad's newest rows beside
// an older copy of them.
function setup(initial: RxItem[]) {
  const held: SetStateAction<RxItem[]>[] = [];
  const view: { rows: Row[]; rxItems: RxItem[]; setRows: Dispatch<SetStateAction<Row[]>>; setRx: Dispatch<SetStateAction<RxItem[]>> } = {} as never;
  function Harness() {
    const [rxItems, setRx] = useState<RxItem[]>(initial);
    const setRxItems = useCallback((u: SetStateAction<RxItem[]>) => { held.push(u); }, []);
    const [rows, setRows] = usePadSync(rxItems, setRxItems);
    Object.assign(view, { rows, rxItems, setRows, setRx });
    return null;
  }
  render(<Harness />);
  const release = () => { const next = held.splice(0); for (const u of next) view.setRx(u); };
  // Lets the held copies land until nothing more is sent, or gives up.
  const settle = () => { for (let i = 0; i < 20 && held.length; i++) act(release); return held.length; };
  return { view, held, release, settle };
}

const foodOf = (rows: Row[]) => rows[0]?.food;

describe("usePadSync — two edits in one render", () => {
  it("keeps the newest edit when its first copy lands in the same render as the second edit", () => {
    const { view, release, settle } = setup([item("")]);
    act(() => view.setRows([napa("ব"), blank()]));
    // The copy of "ব" lands in the same render as the next letter.
    act(() => { release(); view.setRows([napa("বম"), blank()]); });
    expect(foodOf(view.rows)).toBe("বম");
    expect(settle()).toBe(0);
    expect(foodOf(view.rows)).toBe("বম");
    expect(view.rxItems[0]?.instruction).toBe("বম");
  });

  it("still copies a change made elsewhere onto the pad", () => {
    const { view, settle } = setup([item("Before meal")]);
    act(() => view.setRx([item("খাবারের আগে")]));
    expect(foodOf(view.rows)).toBe("খাবারের আগে");
    expect(settle()).toBe(0);
    expect(view.rxItems[0]?.instruction).toBe("খাবারের আগে");
  });

  it("copies a pad edit into the prescription", () => {
    const { view, settle } = setup([item("")]);
    act(() => view.setRows([napa("After meal"), blank()]));
    expect(settle()).toBe(0);
    expect(view.rxItems[0]?.instruction).toBe("After meal");
  });
});

// ⚕️ Review, 18/10/2026: a pad holding ONLY lines it cannot write (a >>> line
// whose medicine name was cleared) gives `rxItems` = [] — and so does a new
// visit's reset. The pad saw no change, kept the lines, and one patient's dose
// stood on the next patient's pad. A new visit (`epoch`) always redraws it.
describe("usePadSync — a new visit always redraws the pad", () => {
  const nameless: Row = { drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: true, continuation: false };
  const taperRow: Row = { drug: "", dose: "0+0+1", food: "", duration: "", checked: true, isMedicine: true, continuation: true };

  function setupEpoch() {
    const view: { rows: Row[]; setRows: Dispatch<SetStateAction<Row[]>>; setRx: Dispatch<SetStateAction<RxItem[]>>; setEpoch: Dispatch<SetStateAction<number>> } = {} as never;
    function Harness() {
      const [rxItems, setRx] = useState<RxItem[]>([]);
      const [epoch, setEpoch] = useState(0);
      const [rows, setRows] = usePadSync(rxItems, setRx, epoch);
      Object.assign(view, { rows, setRows, setRx, setEpoch });
      return null;
    }
    render(<Harness />);
    return view;
  }

  it("clears lines that never reached rxItems when the editor is reset", () => {
    const view = setupEpoch();
    act(() => view.setRows([nameless, taperRow, blank()]));
    expect(view.rows).toHaveLength(3);
    act(() => { view.setRx([]); view.setEpoch((e) => e + 1); });
    expect(view.rows.map((r) => r.dose)).toEqual([""]);
  });

  it("an edit on the same visit is left alone", () => {
    const view = setupEpoch();
    act(() => view.setRows([nameless, taperRow, blank()]));
    act(() => view.setRx([]));
    expect(view.rows).toHaveLength(3);
  });
});

