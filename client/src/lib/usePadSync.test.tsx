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
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { usePadSync } from "./usePadSync";
import { rxItemsFromRows } from "./rxRows";
import { rxItemsIn, rxRowsIn } from "./rxLanguage";
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

// ⚕️ 19/10/2026: a line the pad cannot write (a dose with no medicine name, a
// >>> line with no named medicine above it) is never in `rxItems`. It lived in
// the pad's rows alone, and a pad drawn again — remounted, reloaded, mirrored,
// changed from elsewhere — was drawn without it, and nothing said so. The pad
// now HOLDS its rows beside `rxItems` while such a line is on it, and draws
// them back only while they still fit the `rxItems` they were taken with.
describe("usePadSync — a line the pad cannot write is held, not lost", () => {
  const NAPA = "Tablet. Napa 500 mg";
  const med = (drug: string, dose: string, duration = ""): Row => ({ drug, dose, food: "", duration, checked: true, isMedicine: true, continuation: false });
  const red = () => med("", "1+0+1", "7 days");
  const napaItem: RxItem = { drug: NAPA, dose: "1+1+1", instruction: "", duration: "5 days" };
  const bexItem: RxItem = { drug: "Capsule. Bexidol 20 mg", dose: "0+0+1", instruction: "", duration: "" };
  const shown = (rows: Row[]) => rows.map((r) => (r.continuation ? `>>>${r.dose}` : r.drug || (r.dose ? `(no name) ${r.dose}` : "")));
  type View = {
    rows: Row[]; rxItems: RxItem[]; held: Row[] | null;
    setRows: Dispatch<SetStateAction<Row[]>>; setRx: Dispatch<SetStateAction<RxItem[]>>;
    setHeld: Dispatch<SetStateAction<Row[] | null>>; setEpoch: Dispatch<SetStateAction<number>>;
    setShown: Dispatch<SetStateAction<boolean>>;
  };

  // The editor store as RightColumn sees it: rxItems, the hold, the visit — and
  // a pad that can be taken off the screen and put back (another tab, the phone
  // layout), which draws it afresh.
  function setupHold(start: { rxItems?: RxItem[]; held?: Row[] | null } = {}) {
    const onDropped = vi.fn();
    const view = {} as View;
    function Pad({ rxItems, setRx, held, setHeld, epoch }: { rxItems: RxItem[]; setRx: Dispatch<SetStateAction<RxItem[]>>; held: Row[] | null; setHeld: Dispatch<SetStateAction<Row[] | null>>; epoch: number }) {
      const [rows, setRows] = usePadSync(rxItems, setRx, epoch, { held, setHeld, onDropped });
      Object.assign(view, { rows, setRows });
      return null;
    }
    function Store() {
      const [rxItems, setRx] = useState<RxItem[]>(start.rxItems ?? []);
      const [held, setHeld] = useState<Row[] | null>(start.held ?? null);
      const [epoch, setEpoch] = useState(0);
      const [on, setShown] = useState(true);
      Object.assign(view, { rxItems, held, setRx, setHeld, setEpoch, setShown });
      return on ? <Pad rxItems={rxItems} setRx={setRx} held={held} setHeld={setHeld} epoch={epoch} /> : null;
    }
    render(<Store />);
    return { view, onDropped };
  }
  const typeRedLine = (view: View) => act(() => view.setRows([med(NAPA, "1+1+1", "5 days"), red(), blank()]));

  it("a pad edit that leaves a line it cannot write is held — and the hold goes once the line is put right", () => {
    const { view } = setupHold({ rxItems: [napaItem] });
    typeRedLine(view);
    expect(view.rxItems).toEqual(rxItemsFromRows(view.rows)); // rxItems: only what can be written
    expect(view.rxItems).toHaveLength(1);
    expect(view.held).toBe(view.rows);
    act(() => view.setRows([med(NAPA, "1+1+1", "5 days"), med("Tablet. Seclo 20 mg", "1+0+1", "7 days"), blank()]));
    expect(view.held).toBeNull();
  });

  it("taken off the screen and put back, the pad comes back with the line", () => {
    const { view, onDropped } = setupHold({ rxItems: [napaItem] });
    typeRedLine(view);
    act(() => view.setShown(false));
    act(() => view.setShown(true));
    expect(shown(view.rows)).toEqual([NAPA, "(no name) 1+0+1", ""]);
    expect(onDropped).not.toHaveBeenCalled();
  });

  it("a medicine appended elsewhere (a template, Add Bulk Medicine, Move to Rx) leaves the line where it stood", () => {
    const { view, onDropped } = setupHold({ rxItems: [napaItem] });
    typeRedLine(view);
    act(() => view.setRx((prev) => [...prev, bexItem]));
    expect(shown(view.rows)).toEqual([NAPA, "(no name) 1+0+1", bexItem.drug, ""]);
    expect(view.rxItems.map((it) => it.drug)).toEqual([NAPA, bexItem.drug]);
    expect(view.held).toBe(view.rows);
    expect(onDropped).not.toHaveBeenCalled();
  });

  it("the BAN / EN switch writes the held line too, and it stays", () => {
    const { view, onDropped } = setupHold({ rxItems: [napaItem] });
    typeRedLine(view);
    act(() => { view.setRx((prev) => rxItemsIn(prev, "bn")); view.setHeld((h) => (h ? rxRowsIn(h, "bn") : h)); });
    expect(view.rows[1].dose).toBe(rxRowsIn([red()], "bn")[0].dose);
    expect(view.rows[1].dose).not.toBe("1+0+1");
    expect(onDropped).not.toHaveBeenCalled();
  });

  it("a change made elsewhere that it no longer fits takes it off — and says so", () => {
    const { view, onDropped } = setupHold({ rxItems: [napaItem] });
    typeRedLine(view);
    act(() => view.setRx([bexItem]));
    expect(shown(view.rows)).toEqual([bexItem.drug, ""]);
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(onDropped.mock.calls[0][0]).toEqual([red()]);
    expect(view.held).toBeNull();
  });

  it("a hold that arrives from elsewhere (a mirrored device, a draft) is drawn, also when rxItems did not change", () => {
    const { view, onDropped } = setupHold({ rxItems: [napaItem] });
    const fromPeer = JSON.parse(JSON.stringify([med(NAPA, "1+1+1", "5 days"), red(), blank()])) as Row[];
    act(() => view.setHeld(fromPeer));
    expect(shown(view.rows)).toEqual([NAPA, "(no name) 1+0+1", ""]);
    expect(onDropped).not.toHaveBeenCalled();
  });

  it("the line given its name on another device is not said to be lost", () => {
    const { view, onDropped } = setupHold({ rxItems: [napaItem] });
    typeRedLine(view);
    const named: RxItem = { drug: "Tablet. Seclo 20 mg", dose: "1+0+1", instruction: "", duration: "7 days" };
    act(() => { view.setRx([napaItem, named]); view.setHeld(null); });
    expect(shown(view.rows)).toEqual([NAPA, named.drug, ""]);
    expect(onDropped).not.toHaveBeenCalled();
  });

  it("a STALE hold is not put back onto different rxItems when the pad is drawn — and is said", () => {
    const stale = [med(NAPA, "1+1+1", "5 days"), red(), blank()];
    const { view, onDropped } = setupHold({ rxItems: [bexItem], held: stale });
    expect(shown(view.rows)).toEqual([bexItem.drug, ""]);
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(view.held).toBeNull();
  });

  it("a STALE hold that arrives from elsewhere is not drawn — and is said, though this pad never showed it", () => {
    const { view, onDropped } = setupHold({ rxItems: [napaItem] });
    const stale = JSON.parse(JSON.stringify([med("Tablet. Seclo 20 mg", "1+1+1"), red(), blank()])) as Row[];
    act(() => view.setHeld(stale));
    expect(shown(view.rows)).toEqual([NAPA, ""]);
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(onDropped.mock.calls[0][0]).toEqual([red()]);
    expect(view.held).toBeNull();
  });

  it("a hold from elsewhere with the very rows on the pad leaves the pad's own lines in place", () => {
    const { view } = setupHold({ rxItems: [napaItem] });
    typeRedLine(view);
    const before = view.rows;
    act(() => view.setHeld(JSON.parse(JSON.stringify(before)) as Row[]));
    // The same lines: not drawn again, so a name being retyped keeps its place.
    expect(view.rows).toBe(before);
  });

  // Independent review, 19/10/2026: the red line taken off, or its dose cleared,
  // on device A arrived on device B as "a line was taken off … write it again".
  it("a red line removed on the other device is not said to be taken off here", () => {
    const { view, onDropped } = setupHold({ rxItems: [napaItem] });
    // B shows A's red line, as A's hold brought it.
    act(() => view.setHeld(JSON.parse(JSON.stringify([med(NAPA, "1+1+1", "5 days"), red(), blank()])) as Row[]));
    expect(shown(view.rows)).toEqual([NAPA, "(no name) 1+0+1", ""]);
    // A takes it off: its state arrives with no hold.
    act(() => { view.setRx([napaItem]); view.setHeld(null); });
    expect(shown(view.rows)).toEqual([NAPA, ""]);
    expect(onDropped).not.toHaveBeenCalled();
  });

  // Independent review, 19/10/2026, two passes: a >>> line appended after the
  // held lines (any device on a build without the hold sends one) was drawn as a
  // line of its own while rxItems kept it under the medicine above; at a new
  // visit, and with each snapshot from that build, it was drawn once more. It
  // is no append now: the pad shows the items as they read — as rxItems and
  // the printed sheet read them — says the held line went, and draws it once.
  const stray: RxItem = { drug: "", dose: "0+0+1", instruction: "", duration: "", isCont: true };
  it("an older build's >>> line after the held lines: no fit — the pad shows the items as they read, and says what went", () => {
    const held = [med(NAPA, "1+1+1", "5 days"), red(), blank()];
    const { view, onDropped } = setupHold({ rxItems: [napaItem, stray], held });
    expect(shown(view.rows)).toEqual([NAPA, ">>>0+0+1", ""]);
    expect(view.rxItems).toEqual(rxItemsFromRows(view.rows));
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(onDropped.mock.calls[0][0]).toEqual([red()]);
    expect(view.held).toBeNull();
  });

  it("the same at a new visit: drawn once, said once", () => {
    const { view, onDropped } = setupHold({ rxItems: [] });
    const held = [med(NAPA, "1+1+1", "5 days"), red(), blank()];
    act(() => { view.setRx([napaItem, stray]); view.setHeld(held); view.setEpoch((e) => e + 1); });
    expect(shown(view.rows)).toEqual([NAPA, ">>>0+0+1", ""]);
    expect(view.rxItems).toEqual(rxItemsFromRows(view.rows));
    expect(onDropped).toHaveBeenCalledTimes(1);
  });

  it("the same state arriving again from that build adds nothing", () => {
    const { view } = setupHold({ rxItems: [napaItem] });
    typeRedLine(view);
    // A build from before the hold sends no hold: what is held here stays.
    act(() => view.setRx([napaItem, stray]));
    act(() => view.setRx([napaItem, stray]));
    expect(shown(view.rows)).toEqual([NAPA, ">>>0+0+1", ""]);
  });

  it("a new visit whose OWN hold no longer fits is not drawn — and is said", () => {
    const { view, onDropped } = setupHold({ rxItems: [] });
    const stale = [med("Tablet. Seclo 20 mg", "1+1+1"), red(), blank()];
    act(() => { view.setRx([napaItem]); view.setHeld(stale); view.setEpoch((e) => e + 1); });
    expect(shown(view.rows)).toEqual([NAPA, ""]);
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(view.held).toBeNull();
  });

  it("a new visit draws the new visit's hold and says nothing of the last one's lines", () => {
    const { view, onDropped } = setupHold({ rxItems: [napaItem] });
    typeRedLine(view);
    const next = [med("", "0+1+0"), blank()];
    act(() => { view.setRx([]); view.setHeld(next); view.setEpoch((e) => e + 1); });
    expect(shown(view.rows)).toEqual(["(no name) 0+1+0", ""]);
    act(() => { view.setRx([]); view.setHeld(null); view.setEpoch((e) => e + 1); });
    expect(shown(view.rows)).toEqual([""]);
    expect(onDropped).not.toHaveBeenCalled();
  });

  it("settles: a red line edited in the same render as a change from elsewhere", () => {
    const { view } = setupHold({ rxItems: [napaItem] });
    typeRedLine(view);
    act(() => { view.setRx((prev) => [...prev, bexItem]); view.setRows((r) => r.map((x, i) => (i === 1 ? { ...x, food: "After meal" } : x))); });
    // The pad's own edit is the newest and wins (it always has); nothing loops.
    expect(view.rows[1].food).toBe("After meal");
    expect(view.held).toBe(view.rows);
  });
});

