// @vitest-environment jsdom
//
// The "Add Bulk Medicine" box. ⚕️ What it must hold: only what is ticked is
// added, in the order on screen, with nothing filled in for the doctor; a tick
// survives a search that hides its row; a medicine that is already on the
// prescription is seen to be; and a list that did not arrive says so — it is
// never shown as "No medicines yet". Every medicine, dose and count here is
// made up.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import BulkMedicineModal, { type BulkBoxState } from "./BulkMedicineModal";
import { ApiError } from "@/lib/api";
import { itKeepsTheKeyboard } from "@/test/dialogKeyboard";
import type { BulkList, BulkMedicine } from "@/lib/bulkMedicines";
import type { RxItem } from "@/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const med = (over: Partial<BulkMedicine>): BulkMedicine => ({
  id: "h1", drugLabel: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "5 days",
  contLines: [], patientCount: 30, ...over,
});
const NAPA = med({});
const SERGEL = med({ id: "h2", drugLabel: "Capsule. Sergel 20 mg", generic: "Esomeprazole", dose: "1+0+1", food: "Before meal", duration: "14 days", patientCount: 22 });
const DELTA = med({ id: "h3", drugLabel: "Tablet. Deltasone 5 mg", dose: "2+0+0", duration: "5 days", patientCount: 6, contLines: [{ dose: "1+0+0", food: "After meal", duration: "5 days" }] });
const ACE = med({ id: "h4", drugLabel: "Tablet. Ace 500 mg", dose: "", food: "", duration: "", patientCount: 1 });

const listed = (medicines: BulkMedicine[], over: Partial<BulkList> = {}): BulkBoxState =>
  ({ status: "list", list: { medicines, truncated: false, unreadable: 0, ...over } });

const open = (state: BulkBoxState, existing: RxItem[] = []) => {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(<BulkMedicineModal state={state} onClose={onClose} existing={existing} onAdd={onAdd} />);
  const box = screen.getByRole("dialog", { name: "Add Bulk Medicine" });
  return { onAdd, onClose, box, veil: box.parentElement as HTMLElement };
};
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ticks = (box: HTMLElement) => within(box).queryAllByRole("checkbox") as HTMLInputElement[];
const rowOf = (c: HTMLElement) => c.closest("label") as HTMLElement;
const rowNames = (box: HTMLElement) => ticks(box).map((c) => rowOf(c).querySelector("[data-name]")?.textContent);
const tickBox = (box: HTMLElement, name: string) =>
  within(box).getByRole("checkbox", { name: new RegExp(escaped(name)) }) as HTMLInputElement;
const tick = (box: HTMLElement, name: string) => fireEvent.click(tickBox(box, name));
const addButton = (box: HTMLElement) => within(box).getByRole("button", { name: /^Add/ }) as HTMLButtonElement;
const searchBox = (box: HTMLElement) => within(box).getByRole("textbox", { name: "Search medicines" }) as HTMLInputElement;
// A real press: the button goes down and comes up on the same thing.
const press = (el: HTMLElement) => { fireEvent.mouseDown(el); fireEvent.click(el); };
// What the last press did NOT do: the amber line above the buttons.
const noticeRegion = (box: HTMLElement) => within(box).getByRole("status", { name: "Notice" });
const notice = (box: HTMLElement) => noticeRegion(box).textContent;
const line = (drug: string, dose: string, instruction: string, duration: string, over: Partial<RxItem> = {}): RxItem =>
  ({ drug, dose, duration, instruction, isCont: false, ...over });

describe("BulkMedicineModal", () => {
  itKeepsTheKeyboard({
    label: "Add Bulk Medicine",
    render: (onClose) => <BulkMedicineModal state={listed([NAPA, SERGEL])} onClose={onClose} existing={[]} onAdd={() => undefined} />,
  });

  // ── What a row shows ───────────────────────────────────────────────────────
  it("lists each medicine with its instruction, its taper and how many patients", () => {
    const { box } = open(listed([NAPA, DELTA, ACE]));
    expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg", "Tablet. Deltasone 5 mg", "Tablet. Ace 500 mg"]);
    expect(box.textContent).toContain("1+1+1 · After meal · 5 days");
    expect(box.textContent).toContain("30 patients");
    expect(box.textContent).toContain("↳ 1+0+0 · After meal · 5 days");
    expect(box.textContent).toContain("1 patient");
  });

  it("⚕️ a medicine saved with nothing beside it says so, and is not given a dose", () => {
    const { box } = open(listed([ACE]));
    const row = rowOf(tickBox(box, "Tablet. Ace 500 mg"));
    expect(row.textContent).toContain("No dose recorded");
    expect(row.textContent).not.toMatch(/\d\+\d/);
  });

  it("only the brand is in bold, as on the pad, and the name reads exactly as written", () => {
    const { box } = open(listed([NAPA]));
    const name = rowOf(tickBox(box, "Tablet. Napa 500 mg")).querySelector("[data-name]") as HTMLElement;
    expect(name.querySelector("b")?.textContent).toBe("Napa");
    expect(name.textContent).toBe("Tablet. Napa 500 mg");
  });

  // A long name wraps. Wrapped anywhere, a combination's strength turned in
  // its middle — "… 10" at the end of one line, "mg+40 mg+25 mg" on the next.
  // That it goes to the next line WHOLE is a browser's to show: the phone
  // journey holds it (e2e/tests/bulk-medicine.spec.ts). Here: that it is one
  // piece, and that nothing of the label is changed by making it one.
  it("⚕️ the strength is one piece of the name — and the label reads exactly as written", () => {
    const LONG = "Tablet. Amlodipine + Olmesartan Medoxomil + Hydrochlorothiazide 10 mg+40 mg+25 mg";
    const { box } = open(listed([med({ id: "x", drugLabel: LONG }), NAPA, med({ id: "y", drugLabel: "Zinc" })]));
    const nameOf = (label: string) => rowOf(tickBox(box, label)).querySelector("[data-name]") as HTMLElement;
    expect(nameOf(LONG).textContent).toBe(LONG);
    expect(nameOf(LONG).querySelector("[data-strength]")?.textContent).toBe("10 mg+40 mg+25 mg");
    expect((nameOf(LONG).querySelector("[data-strength]") as HTMLElement).style.display).toBe("inline-block");
    expect(nameOf("Tablet. Napa 500 mg").querySelector("[data-strength]")?.textContent).toBe("500 mg");
    expect(nameOf("Zinc").textContent).toBe("Zinc");
    expect(nameOf("Zinc").querySelector("[data-strength]")).toBeNull();
  });

  // The warnings are written against generics. A row with none is a medicine
  // they will not see — and that is visible before it is ticked.
  it("⚕️ shows the generic under the name — and nothing in its place where the medicine has none", () => {
    const { box } = open(listed([NAPA, SERGEL]));
    expect(rowOf(tickBox(box, "Capsule. Sergel 20 mg")).querySelector("[data-generic]")?.textContent).toBe("Esomeprazole");
    expect(rowOf(tickBox(box, "Tablet. Napa 500 mg")).querySelector("[data-generic]")).toBeNull();
  });

  it("⚕️ shows when the instruction was last written beside its count — with the year once it is not this one", () => {
    const thisYear = new Date().getFullYear();
    const { box } = open(listed([
      med({ id: "a", drugLabel: "Tablet. Recent 5 mg", lastUsedAt: `${thisYear}-01-15T06:00:00.000Z` }),
      med({ id: "b", drugLabel: "Tablet. Stale 5 mg", lastUsedAt: "2024-08-15T06:00:00.000Z" }),
      med({ id: "c", drugLabel: "Tablet. Undated 5 mg" }),
    ]));
    expect(rowOf(tickBox(box, "Tablet. Recent 5 mg")).textContent).toContain("last 15 Jan");
    expect(rowOf(tickBox(box, "Tablet. Recent 5 mg")).textContent).not.toContain(String(thisYear));
    expect(rowOf(tickBox(box, "Tablet. Stale 5 mg")).textContent).toContain("last 15 Aug 2024");
    expect(rowOf(tickBox(box, "Tablet. Undated 5 mg")).textContent).not.toContain("last");
  });

  // ── Order and search ───────────────────────────────────────────────────────
  it("opens most-patients-first, and Alphabetical files by brand", () => {
    const { box } = open(listed([ACE, SERGEL, NAPA]));
    expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg", "Capsule. Sergel 20 mg", "Tablet. Ace 500 mg"]);
    expect(within(box).getByRole("button", { name: "Popular" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(box).getByRole("button", { name: "Alphabetical" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(within(box).getByRole("button", { name: "Alphabetical" }));
    expect(rowNames(box)).toEqual(["Tablet. Ace 500 mg", "Tablet. Napa 500 mg", "Capsule. Sergel 20 mg"]);
    expect(within(box).getByRole("button", { name: "Alphabetical" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(box).getByRole("button", { name: "Popular" }));
    expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg", "Capsule. Sergel 20 mg", "Tablet. Ace 500 mg"]);
  });

  it("a search that matches nothing says so, and finds a medicine by its generic", () => {
    const { box } = open(listed([NAPA, SERGEL]));
    fireEvent.change(searchBox(box), { target: { value: "zzz" } });
    expect(ticks(box)).toHaveLength(0);
    expect(box.textContent).toContain("No medicine matches “zzz”.");
    expect(box.textContent).not.toContain("No medicines yet");
    fireEvent.change(searchBox(box), { target: { value: "esomep" } });
    expect(rowNames(box)).toEqual(["Capsule. Sergel 20 mg"]);
  });

  // A list the server has cut, made up (and short: the real one is 2,000 rows,
  // which a test has no need to draw). The number in the two
  // sentences below is the number of rows that are LISTED — not the cap
  // written out a second time on this side, where it would go on saying
  // 2,000 after the server's had changed.
  const MANY = Array.from({ length: 12 }, (_, i) => med({ id: `m${i}`, drugLabel: `Tablet. Made${i} 5 mg` }));

  it("with the list cut at its cap, no match is said of what is shown — the medicine may be among the rest", () => {
    const { box } = open(listed(MANY, { truncated: true }));
    fireEvent.change(searchBox(box), { target: { value: "zzz" } });
    expect(box.textContent).toContain("No medicine matches “zzz” among the 12 shown.");
  });

  it("Escape in a search with something typed clears the search and nothing else; with nothing typed and nothing ticked it closes the box", () => {
    const { box, onClose } = open(listed([NAPA, SERGEL]));
    fireEvent.change(searchBox(box), { target: { value: "sergel" } });
    expect(rowNames(box)).toEqual(["Capsule. Sergel 20 mg"]);
    fireEvent.keyDown(searchBox(box), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(searchBox(box).value).toBe("");
    expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg", "Capsule. Sergel 20 mg"]);
    fireEvent.keyDown(searchBox(box), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // The same key clears the search and closes the box: pressed once too often
  // it threw away every tick, without a word — as a press on the veil did.
  it("⚕️ with medicines ticked, Escape closes nothing — it says how to close, and the ticks stay", () => {
    const { box, onClose } = open(listed([NAPA, SERGEL]));
    tick(box, "Capsule. Sergel 20 mg");
    fireEvent.change(searchBox(box), { target: { value: "napa" } });
    fireEvent.keyDown(searchBox(box), { key: "Escape" }); // clears the search
    expect(notice(box)).toBe("");
    fireEvent.keyDown(searchBox(box), { key: "Escape" }); // …and the one too many
    expect(onClose).not.toHaveBeenCalled();
    expect(notice(box)).toBe("1 medicine is ticked. Press Add to add it, or Cancel to close without adding.");
    expect(tickBox(box, "Capsule. Sergel 20 mg").checked).toBe(true);
    // With the tick taken off, Escape closes the box again.
    tick(box, "Capsule. Sergel 20 mg");
    fireEvent.keyDown(searchBox(box), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Cancel and the × close the box with medicines ticked: they are the way out it names", () => {
    for (const way of ["Cancel", "Close"]) {
      const { box, onClose, onAdd } = open(listed([NAPA]));
      tick(box, "Tablet. Napa 500 mg");
      fireEvent.click(within(box).getByRole("button", { name: way }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onAdd).not.toHaveBeenCalled();
      cleanup();
    }
  });

  // A line put on the page with its words already in it is often not read out
  // by a screen reader: the region has to be there first.
  it("the line that says what a press did not do stands in a region that was on the page before it", () => {
    const { box, veil } = open(listed([NAPA]));
    const region = noticeRegion(box);
    expect(region.textContent).toBe("");
    tick(box, "Tablet. Napa 500 mg");
    press(veil);
    expect(noticeRegion(box)).toBe(region);
    expect(region.textContent).toContain("1 medicine is ticked");
  });

  it("someone with a keyboard at hand can type the search at once; a touch screen is not handed its keyboard", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(pointer: fine)", media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const withMouse = open(listed([NAPA]));
    expect(document.activeElement).toBe(searchBox(withMouse.box));
    cleanup();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const onTouch = open(listed([NAPA]));
    expect(document.activeElement).not.toBe(searchBox(onTouch.box));
  });

  // ── Ticking and adding ─────────────────────────────────────────────────────
  it("Add cannot be pressed with nothing ticked, and says how many are", () => {
    const { box, onAdd } = open(listed([NAPA, SERGEL]));
    expect(addButton(box).disabled).toBe(true);
    expect(addButton(box).textContent).toBe("Add");
    tick(box, "Tablet. Napa 500 mg");
    expect(addButton(box).disabled).toBe(false);
    expect(addButton(box).textContent).toBe("Add (1)");
    expect(box.textContent).toContain("1 selected");
    tick(box, "Capsule. Sergel 20 mg");
    expect(addButton(box).textContent).toBe("Add (2)");
    tick(box, "Tablet. Napa 500 mg");
    tick(box, "Capsule. Sergel 20 mg");
    expect(addButton(box).disabled).toBe(true);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("⚕️ adds exactly the ticked medicines, in the order on screen, with what was written and nothing more", () => {
    const { box, onAdd, onClose } = open(listed([NAPA, SERGEL, DELTA, ACE]));
    tick(box, "Tablet. Deltasone 5 mg"); // ticked first, listed third
    tick(box, "Tablet. Napa 500 mg");
    fireEvent.click(addButton(box));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const [items, summary] = onAdd.mock.calls[0] as [RxItem[], string];
    expect(items.map((it) => [it.drug, it.dose, it.instruction, it.duration, it.isCont])).toEqual([
      ["Tablet. Napa 500 mg", "1+1+1", "After meal", "5 days", false],
      ["Tablet. Deltasone 5 mg", "2+0+0", "After meal", "5 days", false],
      ["", "1+0+0", "After meal", "5 days", true],
    ]);
    expect(summary).toBe("2 added");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the order added is the order SHOWN: Alphabetical when that is what is on screen", () => {
    const { box, onAdd } = open(listed([NAPA, SERGEL, ACE]));
    fireEvent.click(within(box).getByRole("button", { name: "Alphabetical" }));
    tick(box, "Capsule. Sergel 20 mg");
    tick(box, "Tablet. Ace 500 mg");
    fireEvent.click(addButton(box));
    expect((onAdd.mock.calls[0][0] as RxItem[]).map((it) => it.drug)).toEqual(["Tablet. Ace 500 mg", "Capsule. Sergel 20 mg"]);
  });

  it("⚕️ the generic goes to the pad with its medicine", () => {
    const { box, onAdd } = open(listed([SERGEL]));
    tick(box, "Capsule. Sergel 20 mg");
    fireEvent.click(addButton(box));
    expect((onAdd.mock.calls[0][0] as RxItem[])[0].generic).toBe("Esomeprazole");
  });

  it("⚕️ a tick is kept while a search hides its row, is counted in the footer as out of sight, and is still added", () => {
    const { box, onAdd } = open(listed([NAPA, SERGEL, DELTA]));
    tick(box, "Capsule. Sergel 20 mg");
    tick(box, "Tablet. Deltasone 5 mg");
    expect(box.textContent).toContain("2 selected");
    expect(box.textContent).not.toContain("not shown");
    fireEvent.change(searchBox(box), { target: { value: "napa" } });
    expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg"]);
    expect(box.textContent).toContain("2 selected · 2 not shown by this search");
    tick(box, "Tablet. Napa 500 mg");
    expect(box.textContent).toContain("3 selected · 2 not shown by this search");
    fireEvent.click(addButton(box));
    expect((onAdd.mock.calls[0][0] as RxItem[]).filter((it) => !it.isCont).map((it) => it.drug)).toEqual([
      "Tablet. Napa 500 mg", "Capsule. Sergel 20 mg", "Tablet. Deltasone 5 mg",
    ]);
  });

  it("⚕️ a ticked medicine that is no longer in the list is not added, and not counted", () => {
    const onAdd = vi.fn();
    const props = { onClose: () => undefined, existing: [] as RxItem[], onAdd };
    const { rerender } = render(<BulkMedicineModal state={listed([NAPA, SERGEL])} {...props} />);
    const box = screen.getByRole("dialog");
    tick(box, "Tablet. Napa 500 mg");
    tick(box, "Capsule. Sergel 20 mg");
    rerender(<BulkMedicineModal state={listed([NAPA])} {...props} />);
    expect(addButton(box).textContent).toBe("Add (1)");
    fireEvent.click(addButton(box));
    expect((onAdd.mock.calls[0][0] as RxItem[]).map((it) => it.drug)).toEqual(["Tablet. Napa 500 mg"]);
  });

  // ── What is on the prescription already ────────────────────────────────────
  // A line is not written twice; the same medicine at another dose is another
  // line and is added. So a second line of a medicine can reach the pad — and
  // the box has to make that visible before the tick and say it after.
  describe("a medicine that is already on the prescription", () => {
    const marked = (box: HTMLElement) => ticks(box).filter((c) => rowOf(c).querySelector("[data-on-pad]")).map((c) => rowOf(c).querySelector("[data-name]")?.textContent);

    it("⚕️ is marked 'On ℞' in the list, at whatever dose it stands there — however it was written", () => {
      const pad = [line("tab napa 500MG", "1+0+1", "", "3 days"), line("Capsule. Sergel 40 mg", "1+0+1", "Before meal", "14 days")];
      const { box } = open(listed([NAPA, SERGEL, DELTA]), pad);
      expect(marked(box)).toEqual(["Tablet. Napa 500 mg"]); // Sergel 40 mg is another medicine than Sergel 20 mg
      expect(rowOf(tickBox(box, "Tablet. Napa 500 mg")).textContent).toContain("On ℞");
    });

    it("a note or a tapering line on the pad marks nothing", () => {
      const pad: RxItem[] = [{ drug: "Tablet. Napa 500 mg", dose: "", duration: "", instruction: "", isNote: true }];
      expect(marked(open(listed([NAPA]), pad).box)).toEqual([]);
    });

    // The marks are worked out when the list or the pad changes, not at every
    // tick (the list can be two thousand long) — so each of the two has to be
    // seen to move them.
    it("⚕️ the mark follows the pad while the box is open: another device may be writing on it", () => {
      const list = listed([NAPA, SERGEL]); // the same list throughout: only the pad changes
      const view = (existing: RxItem[]) =>
        <BulkMedicineModal state={list} onClose={() => undefined} existing={existing} onAdd={() => undefined} />;
      const { rerender } = render(view([]));
      const box = screen.getByRole("dialog", { name: "Add Bulk Medicine" });
      expect(marked(box)).toEqual([]);
      rerender(view([line("Capsule. Sergel 20 mg", "1+0+0", "", "7 days")]));
      expect(marked(box)).toEqual(["Capsule. Sergel 20 mg"]);
      rerender(view([]));
      expect(marked(box)).toEqual([]);
    });

    it("⚕️ …and it follows the list: a medicine that arrives with a newer list is marked too", () => {
      const pad = [line("Tablet. Deltasone 5 mg", "1+0+0", "", "3 days")];
      const view = (state: BulkBoxState) =>
        <BulkMedicineModal state={state} onClose={() => undefined} existing={pad} onAdd={() => undefined} />;
      const { rerender } = render(view(listed([NAPA])));
      const box = screen.getByRole("dialog", { name: "Add Bulk Medicine" });
      expect(marked(box)).toEqual([]);
      rerender(view(listed([NAPA, DELTA])));
      expect(marked(box)).toEqual(["Tablet. Deltasone 5 mg"]);
    });

    it("a tick does not move a mark", () => {
      const { box } = open(listed([NAPA, SERGEL]), [line("Tablet. Napa 500 mg", "1+0+1", "", "3 days")]);
      tick(box, "Capsule. Sergel 20 mg");
      tick(box, "Tablet. Napa 500 mg");
      expect(marked(box)).toEqual(["Tablet. Napa 500 mg"]);
    });

    it("⚕️ at ANOTHER dose it is added as a second line — and the result says it now stands there more than once", () => {
      const pad = [line("Tablet. Napa 500 mg", "1+1+1", "After meal", "3 days")];
      const { box, onAdd } = open(listed([NAPA, SERGEL]), pad);
      tick(box, "Tablet. Napa 500 mg");
      tick(box, "Capsule. Sergel 20 mg");
      fireEvent.click(addButton(box));
      const [items, summary] = onAdd.mock.calls[0] as [RxItem[], string];
      expect(items.map((it) => [it.drug, it.duration])).toEqual([["Tablet. Napa 500 mg", "5 days"], ["Capsule. Sergel 20 mg", "14 days"]]);
      expect(summary).toBe("2 added · “Tablet. Napa 500 mg” is now on ℞ more than once");
    });

    it("with the SAME instruction it is skipped, and the result says so", () => {
      const pad = [line("Tablet. Napa 500 mg", "1+1+1", "After meal", "5 days")];
      const { box, onAdd } = open(listed([NAPA, SERGEL]), pad);
      tick(box, "Tablet. Napa 500 mg");
      tick(box, "Capsule. Sergel 20 mg");
      fireEvent.click(addButton(box));
      const [items, summary] = onAdd.mock.calls[0] as [RxItem[], string];
      expect(items.map((it) => it.drug)).toEqual(["Capsule. Sergel 20 mg"]);
      expect(summary).toBe("1 added · 1 already on ℞");
    });

    it("when everything ticked is already there nothing is added, the box stays open and says why — where it will be seen", () => {
      const pad = [line("Tablet. Napa 500 mg", "1+1+1", "After meal", "5 days")];
      const { box, onAdd, onClose } = open(listed([NAPA]), pad);
      tick(box, "Tablet. Napa 500 mg");
      fireEvent.click(addButton(box));
      expect(onAdd).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(notice(box)).toContain("already on ℞ with the same instruction");
      // It was about the last press: it goes when the choice changes.
      tick(box, "Tablet. Napa 500 mg");
      expect(notice(box)).toBe("");
    });

    it("⚕️ a tapering medicine on the pad WITHOUT its taper: nothing is added, and the box does NOT say 'the same instruction'", () => {
      const { box, onAdd } = open(listed([DELTA]), [line("Tablet. Deltasone 5 mg", "2+0+0", "After meal", "5 days")]);
      tick(box, "Tablet. Deltasone 5 mg");
      fireEvent.click(addButton(box));
      expect(onAdd).not.toHaveBeenCalled();
      expect(notice(box)).toContain("its tapering lines there are not the ones shown here");
      expect(box.textContent).not.toContain("same instruction");
    });

    it("…and ticked with others, the result says its tapering lines differ", () => {
      const { box, onAdd } = open(listed([NAPA, DELTA]), [line("Tablet. Deltasone 5 mg", "2+0+0", "After meal", "5 days")]);
      tick(box, "Tablet. Napa 500 mg");
      tick(box, "Tablet. Deltasone 5 mg");
      fireEvent.click(addButton(box));
      expect(onAdd.mock.calls[0][1]).toBe("1 added · 1 already on ℞ — its tapering lines differ there");
    });
  });

  // ── The list is not here ───────────────────────────────────────────────────
  it("says it is loading — and offers nothing, not even to Add", () => {
    const { box } = open({ status: "asking" });
    expect(within(box).getByText(/Loading the medicine list/)).toBeTruthy();
    expect(ticks(box)).toHaveLength(0);
    expect(box.textContent).not.toContain("No medicines yet");
    expect(addButton(box).disabled).toBe(true);
  });

  it("⚕️ a list that did not arrive says so and offers Try again — never 'No medicines yet'", () => {
    const retry = vi.fn();
    const { box } = open({ status: "failed", error: new Error("Failed to fetch"), retry });
    expect(within(box).getByRole("alert").textContent).toContain("The medicine list could not be loaded.");
    expect(box.textContent).toContain("Check your internet connection and try again.");
    expect(box.textContent).not.toContain("Failed to fetch");
    expect(box.textContent).not.toContain("No medicines yet");
    expect(ticks(box)).toHaveLength(0);
    fireEvent.click(within(box).getByRole("button", { name: /Try again/ }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("a refusal the server worded for a person is shown; its own words for a crash are not", () => {
    const refused = open({ status: "failed", error: new ApiError(403, "You are not an active assistant of this doctor."), retry: vi.fn() });
    expect(refused.box.textContent).toContain("You are not an active assistant of this doctor.");
    cleanup();
    const crashed = open({ status: "failed", error: new ApiError(500, "Internal server error"), retry: vi.fn() });
    expect(crashed.box.textContent).not.toContain("Internal server error");
    expect(crashed.box.textContent).toContain("Please try again in a moment.");
    expect(crashed.box.textContent).not.toContain("internet"); // the connection is not what failed
  });

  it("⚕️ ticks made before the list went are not acted on while it is gone, and are there when it is back", () => {
    const onAdd = vi.fn();
    const props = { onClose: vi.fn(), existing: [] as RxItem[], onAdd };
    const { rerender } = render(<BulkMedicineModal state={listed([NAPA, SERGEL])} {...props} />);
    const box = screen.getByRole("dialog");
    tick(box, "Tablet. Napa 500 mg");
    expect(addButton(box).textContent).toBe("Add (1)");
    for (const gone of [{ status: "asking" }, { status: "failed", error: new Error("x"), retry: vi.fn() }] as BulkBoxState[]) {
      rerender(<BulkMedicineModal state={gone} {...props} />);
      expect(ticks(box)).toHaveLength(0);
      expect(addButton(box).disabled).toBe(true);
      fireEvent.click(addButton(box));
      expect(onAdd).not.toHaveBeenCalled();
    }
    rerender(<BulkMedicineModal state={listed([NAPA, SERGEL])} {...props} />);
    expect(tickBox(box, "Tablet. Napa 500 mg").checked).toBe(true);
    expect(addButton(box).textContent).toBe("Add (1)");
  });

  it("a doctor with no history is told how the list fills", () => {
    const { box } = open(listed([]));
    expect(box.textContent).toContain("No medicines yet");
    expect(box.textContent).toContain("They appear here after prescriptions are saved.");
    expect(addButton(box).disabled).toBe(true);
  });

  it("⚕️ a list whose every medicine was left out as unreadable is not an empty history", () => {
    const { box } = open(listed([], { unreadable: 3 }));
    expect(box.textContent).toContain("3 medicines could not be read and are not listed.");
    expect(box.textContent).not.toContain("No medicines yet");
    expect(box.textContent).not.toContain("No medicine matches");
  });

  it("says when rows were left out and when the list was cut at its cap — and neither of a whole list", () => {
    const cut = open(listed(MANY, { unreadable: 2, truncated: true }));
    expect(cut.box.textContent).toContain("2 medicines could not be read and are not listed.");
    expect(cut.box.textContent).toContain("Showing the 12 most used medicines.");
    cleanup();
    expect(open(listed([NAPA], { unreadable: 1 })).box.textContent).toContain("1 medicine could not be read and is not listed.");
    cleanup();
    const whole = open(listed([NAPA]));
    expect(whole.box.textContent).not.toContain("could not be read");
    expect(whole.box.textContent).not.toContain("most used medicines");
  });

  // ── Closing ────────────────────────────────────────────────────────────────
  it("Cancel and the × close it and add nothing", () => {
    for (const name of ["Cancel", "Close"]) {
      const { box, onAdd, onClose } = open(listed([NAPA]));
      tick(box, "Tablet. Napa 500 mg");
      fireEvent.click(within(box).getByRole("button", { name }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onAdd).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("a press on the veil closes it while nothing is ticked; a press inside the box never does", () => {
    const { box, veil, onClose } = open(listed([NAPA]));
    press(box);
    press(searchBox(box));
    expect(onClose).not.toHaveBeenCalled();
    press(veil);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // A stray press beside the box threw every tick away without a word.
  it("⚕️ with medicines ticked, a press on the veil closes nothing — and says how to close", () => {
    const { box, veil, onClose } = open(listed([NAPA, SERGEL]));
    tick(box, "Tablet. Napa 500 mg");
    tick(box, "Capsule. Sergel 20 mg");
    press(veil);
    expect(onClose).not.toHaveBeenCalled();
    expect(notice(box)).toBe("2 medicines are ticked. Press Add to add them, or Cancel to close without adding.");
    expect(tickBox(box, "Tablet. Napa 500 mg").checked).toBe(true);
  });

  it("a drag that began inside the box and was let go on the veil is not a press on the veil", () => {
    const { box, veil, onClose } = open(listed([NAPA]));
    fireEvent.mouseDown(searchBox(box)); // selecting text in the search…
    fireEvent.click(veil);               // …and letting go outside
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── The keyboard in the list ───────────────────────────────────────────────
  // The list is ONE Tab stop: with a stop on every row, two hundred presses of
  // Tab stood between the search and Add. Inside it the arrows MOVE and Space
  // ticks — a key that moves does not also choose.
  describe("the list from the keyboard", () => {
    const stops = (box: HTMLElement) => ticks(box).filter((c) => c.tabIndex === 0).map((c) => rowOf(c).querySelector("[data-name]")?.textContent);
    const focused = () => rowOf(document.activeElement as HTMLElement).querySelector("[data-name]")?.textContent;
    const key = (k: string) => fireEvent.keyDown(document.activeElement as HTMLElement, { key: k });

    // The rows follow the search box a moment behind, so that a long list is
    // re-drawn between key presses and not during one. Tab is the keyboard's
    // one way from the box to the rows — so before it lands, they are the
    // rows the box asks for. (Inside one `act`, React holds the rows back as
    // a slow machine would: without the rule, Tab found Sergel here.)
    it("⚕️ Tab from the search lands on the list the search ASKS for — never on a row it has already dismissed", () => {
      const { box } = open(listed([SERGEL, NAPA].map((m, i) => ({ ...m, patientCount: 9 - i }))));
      expect(rowNames(box)).toEqual(["Capsule. Sergel 20 mg", "Tablet. Napa 500 mg"]);
      act(() => {
        fireEvent.change(searchBox(box), { target: { value: "napa" } });
        fireEvent.keyDown(searchBox(box), { key: "Tab" });
        expect(rowNames(box)).toEqual(["Tablet. Napa 500 mg"]);
        expect(stops(box)).toEqual(["Tablet. Napa 500 mg"]);
      });
    });

    it("the list says what it is and how it is moved along — and shows it to someone with a keyboard", () => {
      vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(pointer: fine)" }));
      const withKeys = open(listed([NAPA, SERGEL]));
      const group = within(withKeys.box).getByRole("group", { name: /^Medicines/ });
      expect(group.getAttribute("aria-label")).toMatch(/arrow keys move.*Space ticks/i);
      expect(within(group).getAllByRole("checkbox")).toHaveLength(2);
      expect(withKeys.box.textContent).toContain("↑ ↓ move along the list, Space ticks");
      cleanup();
      vi.stubGlobal("matchMedia", () => ({ matches: false })); // a touch screen
      expect(open(listed([NAPA, SERGEL])).box.textContent).not.toContain("↑ ↓");
    });

    // A row out of sight is not laid out until it comes near, and it is drawn
    // a frame AFTER it does — taller than the space that was kept for it, so
    // it pushes the row the keyboard has just reached out of view again. One
    // ask a frame later came too early (seen in a browser with the page not
    // held still for it — scroll anchoring switched off). Here: that the row is asked
    // for on each of the next four frames and then left alone — what four
    // frames are worth is the browser journey's to show.
    it("⚕️ the row the keyboard reaches is asked into view on each of the next four frames, and no longer", () => {
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
      const frame = () => frames.splice(0).forEach((cb) => cb(0));
      const asked: string[] = [];
      const { box } = open(listed([NAPA, SERGEL, DELTA]));
      for (const c of ticks(box)) {
        const row = rowOf(c);
        row.scrollIntoView = (how) => { asked.push(`${row.querySelector("[data-name]")?.textContent} ${JSON.stringify(how)}`); };
      }
      act(() => tickBox(box, "Tablet. Napa 500 mg").focus());
      key("End");
      expect(focused()).toBe("Tablet. Deltasone 5 mg");
      expect(asked).toEqual([]); // the focus brings it into view in the key press itself
      for (let i = 0; i < 4; i++) frame();
      expect(asked).toEqual(Array(4).fill('Tablet. Deltasone 5 mg {"block":"nearest"}'));
      frame(); frame();
      expect(asked).toHaveLength(4); // then it is the doctor's to scroll
    });

    it("a key pressed meanwhile takes over: the row that was left is not pulled back into view", () => {
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
      const frame = () => frames.splice(0).forEach((cb) => cb(0));
      const asked: (string | null | undefined)[] = [];
      const { box } = open(listed([NAPA, SERGEL, DELTA]));
      for (const c of ticks(box)) {
        const row = rowOf(c);
        row.scrollIntoView = () => { asked.push(row.querySelector("[data-name]")?.textContent); };
      }
      act(() => tickBox(box, "Tablet. Deltasone 5 mg").focus());
      key("Home");
      frame();
      key("ArrowDown");
      for (let i = 0; i < 6; i++) frame();
      expect(asked).toEqual(["Tablet. Napa 500 mg", ...Array(4).fill("Capsule. Sergel 20 mg")]);
    });

    it("has one Tab stop — the first row, until another is reached", () => {
      const { box } = open(listed([NAPA, SERGEL, DELTA]));
      expect(stops(box)).toEqual(["Tablet. Napa 500 mg"]);
      act(() => tickBox(box, "Capsule. Sergel 20 mg").focus()); // a click on its row, say
      expect(stops(box)).toEqual(["Capsule. Sergel 20 mg"]);
    });

    it("the arrows, Home and End move along the rows and stop at the ends", () => {
      const { box } = open(listed([NAPA, SERGEL, DELTA]));
      tickBox(box, "Tablet. Napa 500 mg").focus();
      expect(key("ArrowDown")).toBe(false); // the page is not scrolled by it
      expect(focused()).toBe("Capsule. Sergel 20 mg");
      key("ArrowDown");
      key("ArrowDown"); // already on the last
      expect(focused()).toBe("Tablet. Deltasone 5 mg");
      key("Home");
      expect(focused()).toBe("Tablet. Napa 500 mg");
      key("ArrowUp"); // already on the first
      expect(focused()).toBe("Tablet. Napa 500 mg");
      key("End");
      expect(focused()).toBe("Tablet. Deltasone 5 mg");
      expect(stops(box)).toEqual(["Tablet. Deltasone 5 mg"]);
    });

    it("Page Down and Page Up move ten rows", () => {
      const many = Array.from({ length: 25 }, (_, i) => med({ id: `m${i}`, drugLabel: `Tablet. Row${String(i).padStart(2, "0")} 5 mg`, patientCount: 100 - i }));
      const { box } = open(listed(many));
      tickBox(box, "Tablet. Row00 5 mg").focus();
      key("PageDown");
      expect(focused()).toBe("Tablet. Row10 5 mg");
      key("PageDown");
      key("PageDown");
      expect(focused()).toBe("Tablet. Row24 5 mg");
      key("PageUp");
      expect(focused()).toBe("Tablet. Row14 5 mg");
    });

    it("⚕️ moving ticks nothing", () => {
      const { box } = open(listed([NAPA, SERGEL, DELTA]));
      tickBox(box, "Tablet. Napa 500 mg").focus();
      for (const k of ["ArrowDown", "ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp"]) key(k);
      expect(ticks(box).some((c) => c.checked)).toBe(false);
      expect(addButton(box).disabled).toBe(true);
    });

    it("other keys are left alone: Tab leaves the list, and typing is not swallowed", () => {
      const { box } = open(listed([NAPA, SERGEL]));
      tickBox(box, "Tablet. Napa 500 mg").focus();
      expect(key("a")).toBe(true);
      expect(key(" ")).toBe(true); // Space is the checkbox's own
      expect(focused()).toBe("Tablet. Napa 500 mg");
    });

    it("the arrows in the search box are the search box's own", () => {
      const { box } = open(listed([NAPA, SERGEL]));
      searchBox(box).focus();
      expect(fireEvent.keyDown(searchBox(box), { key: "ArrowDown" })).toBe(true);
      expect(document.activeElement).toBe(searchBox(box));
    });

    it("when a search hides the row that held the stop, the first row shown takes it", () => {
      const { box } = open(listed([NAPA, SERGEL, DELTA]));
      tickBox(box, "Tablet. Deltasone 5 mg").focus();
      fireEvent.change(searchBox(box), { target: { value: "napa" } });
      expect(stops(box)).toEqual(["Tablet. Napa 500 mg"]);
    });
  });
});
