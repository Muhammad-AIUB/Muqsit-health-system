// @vitest-environment jsdom
//
// The Drug history table of "Patient's Prescriptions & reports" (physician's
// sheet, 07/11/2026): the columns, Current medication first, the two sorts, End
// and Total worked out and never guessed, and the Edit / Add — what each may
// change, what is shown as saved only once the record has it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ddmmyyyyMs } from "@/lib/dateInput";
import type { DrugHistoryGenerics } from "@/hooks/useDrugHistoryGenerics";
import type { GenericAnswer } from "@/lib/drugHistoryGeneric";

const dialogs = vi.hoisted(() => ({ confirmAction: vi.fn() }));
vi.mock("@/lib/dialogs", async (orig) => ({ ...(await orig<object>()), confirmAction: dialogs.confirmAction }));
const addRow = vi.hoisted(() => ({ props: null as null | { existing: unknown[]; date: string; tabLabel: string; onAdd: (e: string[]) => boolean } }));
vi.mock("./AddMedicineRow", () => ({
  default: (p: { existing: unknown[]; date: string; tabLabel: string; onAdd: (e: string[]) => boolean }) => {
    addRow.props = p;
    return <button type="button" onClick={() => p.onAdd([`${p.date}: Tablet. Zed 5 mg — 1+0+0 —  — 3 days`])}>Add to Drug history</button>;
  },
}));

import DrugHistoryTable, { type DrugHistoryTableProps } from "./DrugHistoryTable";

const NAPA = "06/11/2026: Tablet. Napa 500 mg — 1+1+1 — After meal — 10 days";
const DENVAR = "06/11/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 7 days";
const OLD = "01/02/2025: Capsule. Cef 3 400 mg — 1+0+1 —  — 14 days";

const GENERIC: Record<string, string> = {
  "Tablet. Napa 500 mg": "Paracetamol", "Capsule. Denvar 400 mg": "Cefixime", "Capsule. Cef 3 400 mg": "Cefixime",
};
const generics = (over: Partial<DrugHistoryGenerics> = {}): DrugHistoryGenerics => ({
  state: "ready",
  answer: (label): GenericAnswer => GENERIC[label] ? { kind: "generic", generic: GENERIC[label], shown: label } : { kind: "none" },
  retry: () => {}, retrying: false, ...over,
});

let saved: Array<[string[], string[]]>;
let notes: string[];
const props = (over: Partial<DrugHistoryTableProps> = {}): DrugHistoryTableProps => ({
  entries: [NAPA, DENVAR, OLD],
  visitDate: "07/11/2026",
  todayMs: ddmmyyyyMs("07/11/2026"),
  newStartIso: "2026-11-07",
  generics: generics(),
  canEdit: true, canAdd: true,
  padLines: new Set<string>(),
  onSave: async (a, b) => { saved.push([a, b]); return true; },
  onAdd: () => true,
  onSaved: (n) => notes.push(n),
  renderActions: (actions) => <div data-testid="actions">{actions}</div>,
  ...over,
});
const cellsOf = (row: HTMLElement) => within(row).getAllByRole("cell").map((c) => c.textContent);
const dataRows = () => screen.getAllByRole("row").filter((r) => within(r).queryAllByRole("columnheader").length === 0);
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => { saved = []; notes = []; addRow.props = null; dialogs.confirmAction.mockReset(); });
afterEach(() => cleanup());

describe("the table", () => {
  it("has the sheet's six columns, and the sheet's own example: Start, End and Total worked out", () => {
    render(<DrugHistoryTable {...props({ entries: [NAPA, DENVAR] })} />);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Drug name", "Dose", "Duration", "Start date", "End date", "Total number"]);
    const rows = dataRows().filter((r) => within(r).queryAllByRole("cell").length > 1);
    const napa = rows.find((r) => r.textContent?.includes("Napa"))!;
    expect(cellsOf(napa)).toEqual(["Paracetamol (Tablet. Napa 500 mg)", "1+1+1", "10 days", "06/11/2026", "16/11/2026", "30"]);
    const denvar = rows.find((r) => r.textContent?.includes("Denvar"))!;
    expect(cellsOf(denvar)).toEqual(["Cefixime (Capsule. Denvar 400 mg)", "1+0+1", "7 days", "06/11/2026", "13/11/2026", "14"]);
  });

  it("the same generic twice is two rows, each with its own date and duration", () => {
    render(<DrugHistoryTable {...props({ entries: [DENVAR, OLD] })} />);
    const text = dataRows().map((r) => r.textContent).join("|");
    expect(text).toContain("Cefixime (Capsule. Denvar 400 mg)");
    expect(text).toContain("Cefixime (Capsule. Cef 3 400 mg)");
    expect(text).toContain("15/02/2025"); // 01/02/2025 + 14 days
    expect(text).toContain("28");
  });

  it("Current medication first, under its own heading; the rest under Earlier medication", () => {
    render(<DrugHistoryTable {...props()} />);
    const order = screen.getAllByRole("row").map((r) => r.textContent ?? "").filter((t) => /Current medication|Earlier medication|Napa|Denvar|Cef 3/.test(t));
    expect(order[0]).toContain("Current medication");
    const earlier = order.findIndex((t) => t.includes("Earlier medication"));
    expect(order.slice(1, earlier).join("|")).toMatch(/Napa|Denvar/);
    expect(order.slice(earlier + 1).join("|")).toContain("Cef 3");
  });

  it("a blank End and Total are a dash, never a number made up: a duration with no unit, Continue", () => {
    render(<DrugHistoryTable {...props({ entries: [
      "06/11/2026: Tablet. A 5 mg — 1+0+1 —  — 5",
      "06/11/2026: Tablet. B 5 mg — 1+0+0 —  — Continue",
    ] })} />);
    const rows = dataRows().filter((r) => within(r).queryAllByRole("cell").length > 1);
    const a = rows.find((r) => r.textContent?.includes("A 5 mg"))!;
    const b = rows.find((r) => r.textContent?.includes("B 5 mg"))!;
    expect(cellsOf(a).slice(3)).toEqual(["06/11/2026", "—", "—"]);
    expect(cellsOf(b).slice(3)).toEqual(["06/11/2026", "Continue", "—"]);
  });

  it("a tapering line is under its medicine; End and Total are of the whole regimen", () => {
    render(<DrugHistoryTable {...props({ entries: [
      "06/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 days",
      "06/11/2026(cont): 2+1+0 — After meal — 5 days",
      "06/11/2026(cont): 1+1+0 — After meal — 5 days",
    ] })} />);
    const rows = dataRows().filter((r) => within(r).queryAllByRole("cell").length > 0);
    expect(rows).toHaveLength(3 + 1); // the three lines and the "Current medication" heading
    expect(rows.map((r) => r.textContent).join("|")).toContain("21/11/2026");
    expect(rows.map((r) => r.textContent).join("|")).toContain("45");
    expect(rows[2].textContent).toContain("2+1+0");
  });

  it("a note keeps its words, and an empty history says so", () => {
    render(<DrugHistoryTable {...props({ entries: ["06/11/2026(note): Insulin as before"] })} />);
    expect(screen.getByText("Insulin as before")).toBeTruthy();
    cleanup();
    render(<DrugHistoryTable {...props({ entries: [] })} />);
    expect(screen.getByText("No drug history recorded for this patient.")).toBeTruthy();
  });

  it("while the generics are not known the medicine is shown as stored, and a medicine the chart does not hold says so", () => {
    render(<DrugHistoryTable {...props({ entries: [NAPA], generics: generics({ state: "asking", answer: () => null }) })} />);
    expect(screen.getByText("Tablet. Napa 500 mg")).toBeTruthy();
    cleanup();
    render(<DrugHistoryTable {...props({ entries: ["06/11/2026: Tablet. Handtyped 5 mg — 1+0+0 —  — 3 days"] })} />);
    expect(document.querySelector("[data-generic-note]")?.textContent).toBe("(generic not found)");
  });
});

describe("sorting", () => {
  const entries = [
    "01/02/2025: Tablet. Zinc Brand 20 mg — 1+0+0 —  — 7 days",
    "10/05/2026: Tablet. Beta 5 mg — 1+0+0 —  — 7 days",
    "03/09/2026: Tablet. Alpha 5 mg — 1+0+0 —  — 7 days",
  ];
  const names = () => dataRows().filter((r) => within(r).queryAllByRole("cell").length > 1).map((r) => within(r).getAllByRole("cell")[0].textContent);
  const g = generics({ answer: (l) => ({ kind: "generic", generic: ({ "Tablet. Zinc Brand 20 mg": "Zinc", "Tablet. Beta 5 mg": "Betahistine", "Tablet. Alpha 5 mg": "Alprazolam" } as Record<string, string>)[l], shown: l }) });

  it("by Date (the default): newest start first; by Generic: A to Z — and the pressed one says so", () => {
    render(<DrugHistoryTable {...props({ entries, generics: g })} />);
    const bar = within(screen.getByTestId("actions"));
    expect(names()).toEqual(["Alprazolam (Tablet. Alpha 5 mg)", "Betahistine (Tablet. Beta 5 mg)", "Zinc (Tablet. Zinc Brand 20 mg)"]);
    expect(bar.getByText("Date").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(bar.getByText("Generic"));
    expect(bar.getByText("Generic").getAttribute("aria-pressed")).toBe("true");
    expect(names()).toEqual(["Alprazolam (Tablet. Alpha 5 mg)", "Betahistine (Tablet. Beta 5 mg)", "Zinc (Tablet. Zinc Brand 20 mg)"]);
  });

  it("Current medication stays first whichever sort is chosen", () => {
    render(<DrugHistoryTable {...props({ entries: [...entries, DENVAR], generics: g })} />);
    const bar = within(screen.getByTestId("actions"));
    for (const mode of ["Generic", "Date"]) {
      fireEvent.click(bar.getByText(mode));
      expect(names()[0]).toContain("Denvar");
    }
  });

  it("no sort buttons for a single medicine", () => {
    render(<DrugHistoryTable {...props({ entries: [NAPA] })} />);
    expect(within(screen.getByTestId("actions")).queryByText("Generic")).toBeNull();
  });
});

describe("Edit", () => {
  const press = (name: string) => fireEvent.click(within(screen.getByTestId("actions")).getByText(name));
  const durationBox = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;

  it("is offered only to whoever may write the record", () => {
    render(<DrugHistoryTable {...props({ canEdit: false, canAdd: false })} />);
    expect(within(screen.getByTestId("actions")).queryByText("✎ Edit")).toBeNull();
    cleanup();
    render(<DrugHistoryTable {...props({ canEdit: true, canAdd: false })} />);
    expect(within(screen.getByTestId("actions")).getByText("✎ Edit")).toBeTruthy();
  });

  it("a changed duration and start date go to the record as the whole block, the same text but for those two", async () => {
    render(<DrugHistoryTable {...props({ entries: [DENVAR] })} />);
    press("✎ Edit");
    const save = screen.getByLabelText(/Save changes to Capsule. Denvar/) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // nothing changed
    fireEvent.change(durationBox(/Duration of Capsule. Denvar/), { target: { value: "5 days" } });
    const dates = screen.getAllByPlaceholderText("DD/MM/YYYY");
    fireEvent.change(dates[0], { target: { value: "08/11/2026" } });
    fireEvent.blur(dates[0]);
    expect(save.disabled).toBe(false);
    // End and Total beside it are a preview, said to be unsaved.
    expect(screen.getByText("13/11/2026").getAttribute("title")).toBe("Not saved yet");
    expect(screen.getAllByText("Not saved yet").length).toBeGreaterThan(0);
    fireEvent.click(save);
    await flush();
    expect(saved).toEqual([[[DENVAR], ["08/11/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 5 days"]]]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("Capsule. Denvar 400 mg");
    expect(notes[0]).toContain("08/11/2026");
  });

  it("a duration typed as shorthand is written out: 7d is 7 days", () => {
    render(<DrugHistoryTable {...props({ entries: [DENVAR] })} />);
    press("✎ Edit");
    const box = durationBox(/Duration of Capsule. Denvar/);
    fireEvent.change(box, { target: { value: "10d" } });
    fireEvent.blur(box);
    expect(box.value).toBe("10 days");
  });

  it("a save the record did not take keeps what was typed — nothing is shown as recorded", async () => {
    render(<DrugHistoryTable {...props({ entries: [DENVAR], onSave: async () => false })} />);
    press("✎ Edit");
    fireEvent.change(durationBox(/Duration of Capsule. Denvar/), { target: { value: "5 days" } });
    fireEvent.click(screen.getByLabelText(/Save changes to Capsule. Denvar/));
    await flush();
    expect(durationBox(/Duration of Capsule. Denvar/).value).toBe("5 days");
    expect(notes).toHaveLength(0);
    expect((screen.getByLabelText(/Save changes to Capsule. Denvar/) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Undo puts the boxes back", () => {
    render(<DrugHistoryTable {...props({ entries: [DENVAR] })} />);
    press("✎ Edit");
    fireEvent.change(durationBox(/Duration of Capsule. Denvar/), { target: { value: "5 days" } });
    fireEvent.click(screen.getByLabelText(/Undo changes to Capsule. Denvar/));
    expect(durationBox(/Duration of Capsule. Denvar/).value).toBe("7 days");
  });

  it("each tapering line has a duration of its own, written back in order", async () => {
    const entries = [
      "06/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 days",
      "06/11/2026(cont): 2+1+0 — After meal — 5",
    ];
    render(<DrugHistoryTable {...props({ entries })} />);
    press("✎ Edit");
    fireEvent.change(screen.getByLabelText(/Duration of tapering line 1/), { target: { value: "5 days" } });
    fireEvent.click(screen.getByLabelText(/Save changes to Tablet. Prednisolone/));
    await flush();
    expect(saved[0][1]).toEqual([entries[0], "06/11/2026(cont): 2+1+0 — After meal — 5 days"]);
  });

  it("a line on today's ℞, a note and an older line cannot be changed here, and say why", () => {
    const old = "Current: Tablet. Legacy 5 mg — 1+0+1 —  — 7 days";
    render(<DrugHistoryTable {...props({ entries: [NAPA, "06/11/2026(note): Insulin as before", old], padLines: new Set([NAPA]) })} />);
    press("✎ Edit");
    expect(screen.queryByLabelText(/Duration of/)).toBeNull();
    expect(screen.getByText(/On today's ℞/)).toBeTruthy();
    expect(screen.getByText("Cannot be changed here")).toBeTruthy();
  });

  it("Done with changes not saved asks before dropping them; Keep editing keeps them", async () => {
    render(<DrugHistoryTable {...props({ entries: [DENVAR] })} />);
    press("✎ Edit");
    fireEvent.change(durationBox(/Duration of Capsule. Denvar/), { target: { value: "5 days" } });
    dialogs.confirmAction.mockResolvedValueOnce(false);
    press("Done");
    await flush();
    expect(dialogs.confirmAction).toHaveBeenCalledTimes(1);
    expect(durationBox(/Duration of Capsule. Denvar/).value).toBe("5 days");
    dialogs.confirmAction.mockResolvedValueOnce(true);
    press("Done");
    await flush();
    expect(screen.queryByLabelText(/Duration of/)).toBeNull();
  });

  it("Done with nothing changed does not ask", async () => {
    render(<DrugHistoryTable {...props({ entries: [DENVAR] })} />);
    press("✎ Edit");
    press("Done");
    await flush();
    expect(dialogs.confirmAction).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Duration of/)).toBeNull();
  });

  it("a box changed for a block the list no longer holds is dropped with it", async () => {
    const { rerender } = render(<DrugHistoryTable {...props({ entries: [DENVAR] })} />);
    press("✎ Edit");
    fireEvent.change(durationBox(/Duration of Capsule. Denvar/), { target: { value: "5 days" } });
    rerender(<DrugHistoryTable {...props({ entries: [DENVAR.replace("7 days", "9 days")] })} />);
    await flush();
    expect(durationBox(/Duration of Capsule. Denvar/).value).toBe("9 days");
  });
});

describe("Add", () => {
  const edit = () => fireEvent.click(within(screen.getByTestId("actions")).getByText("✎ Edit"));

  it("is offered in Edit only to whoever may add a medicine, and begins on the visit's date", () => {
    render(<DrugHistoryTable {...props({ canAdd: false })} />);
    edit();
    expect(addRow.props).toBeNull();
    cleanup();
    render(<DrugHistoryTable {...props()} />);
    expect(addRow.props).toBeNull(); // not in Edit yet
    edit();
    expect(addRow.props?.date).toBe("07/11/2026");
  });

  it("the duplicate check is against the medicines of the SAME start date: a repeat course on another day is not a duplicate", () => {
    render(<DrugHistoryTable {...props({ entries: [NAPA, OLD] })} />);
    edit();
    expect(addRow.props?.existing).toEqual([]); // nothing on 07/11/2026
    const date = screen.getAllByPlaceholderText("DD/MM/YYYY").at(-1)!;
    fireEvent.change(date, { target: { value: "06/11/2026" } });
    fireEvent.blur(date);
    expect(addRow.props?.date).toBe("06/11/2026");
    expect(addRow.props?.existing).toEqual([{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", food: "After meal", duration: "10 days" }]);
  });

  it("an empty history can still be added to", () => {
    render(<DrugHistoryTable {...props({ entries: [] })} />);
    edit();
    expect(addRow.props).not.toBeNull();
    expect(screen.queryByText("No drug history recorded for this patient.")).toBeNull();
  });

  it("hands the lines of one press to the caller", () => {
    const got: string[][] = [];
    render(<DrugHistoryTable {...props({ onAdd: (e) => { got.push(e); return true; } })} />);
    edit();
    fireEvent.click(screen.getByText("Add to Drug history"));
    expect(got).toEqual([["07/11/2026: Tablet. Zed 5 mg — 1+0+0 —  — 3 days"]]);
  });
});
