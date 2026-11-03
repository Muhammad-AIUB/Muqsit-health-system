// @vitest-environment jsdom
//
// ⚕️ Physician's sheet 28/10/2026, item 7: the On-examination popup's Disease
// history / Surgical / intervention history, moved to the sidebar's History row
// in the same format, kept for the patient across visits, seen by every doctor
// of the patient, hidden from the print like Drug history. Pinned: Add writes
// the line to the server with its DDMMYY date, nothing is shown before the
// server has it, the previous patient's typing never reaches the next one, ×
// asks and Undo puts back, the visit's own History lines are untouched, and a
// record that did not load is said — never an empty list.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { OeFinding } from "@/lib/onExaminationSummary";

const store = vi.hoisted(() => ({
  currentPatientId: "A" as string | null,
  ptDate: "2026-11-02",
  onExaminationSummary: [] as unknown[],
  recordStatus: "ready" as "none" | "loading" | "ready" | "error",
  retryRecord: vi.fn(),
  patientIdRef: { current: "A" as string | null },
  hideHistory: false,
  setHideHistory: vi.fn(),
  setOnExaminationSummary: vi.fn(),
}));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => store }));

const api = vi.hoisted(() => ({ appendOnExamination: vi.fn(), removeHistoryEntry: vi.fn(), restoreHistoryEntry: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), patientsApi: api }));

const dialogs = vi.hoisted(() => ({ tell: vi.fn(async () => {}), confirmAction: vi.fn(async () => true) }));
vi.mock("@/lib/dialogs", () => dialogs);

import PatientHistoryField from "./PatientHistoryField";
import { ApiError } from "@/lib/api";

// The store really holds what the server answered, as the context does.
store.setOnExaminationSummary.mockImplementation((l: OeFinding[]) => { store.onExaminationSummary = l; });

const VISIT_LINE = "H/O fever for 3 days";
function ui(canEdit = true) {
  return <PatientHistoryField canEdit={canEdit}><div data-testid="visit-history">{VISIT_LINE}</div></PatientHistoryField>;
}
const mount = (canEdit = true) => {
  const r = render(ui(canEdit));
  return { ...r, again: () => r.rerender(ui(canEdit)) };
};
const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const listed = (kind: "disease" | "surgical") =>
  Array.from(screen.getByTestId(`hx-${kind}`).querySelectorAll("li")).map((li) => li.textContent?.replace(/×$/, "").replace(/^•/, ""));
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const answerWith = (list: unknown[]) => Promise.resolve({ onExaminationSummary: list });

beforeEach(() => {
  Object.assign(store, { currentPatientId: "A", ptDate: "2026-11-02", onExaminationSummary: [], recordStatus: "ready", hideHistory: false });
  store.patientIdRef.current = "A";
  for (const f of Object.values(api)) f.mockReset();
  dialogs.tell.mockClear();
  dialogs.confirmAction.mockReset();
  dialogs.confirmAction.mockResolvedValue(true);
  store.setHideHistory.mockClear();
  store.retryRecord.mockClear();
});
afterEach(cleanup);

describe("History — the patient's Disease / Surgical history", () => {
  it("Add writes the disease line with its DDMMYY date to the patient's history, at this visit's date", async () => {
    const after = [{ date: "02/11/2026", text: "Disease Hx: DM 01/01/2010", by: "Dr. A" }];
    api.appendOnExamination.mockReturnValue(answerWith(after));
    const { again } = mount();
    fireEvent.change(box("Disease history"), { target: { value: "DM" } });
    fireEvent.change(box("Disease history"), { target: { value: " DM  " } });
    fireEvent.change(box("Disease history date"), { target: { value: "010110" } });
    // Nothing is listed before the server has it.
    expect(screen.getByTestId("hx-disease").querySelectorAll("li")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Add disease history" }));
    await flush();
    expect(api.appendOnExamination).toHaveBeenCalledWith("A", [{ date: "02/11/2026", text: "Disease Hx: DM 01/01/2010" }]);
    again();
    expect(listed("disease")).toEqual(["DM 01/01/2010"]);
    expect(box("Disease history").value).toBe("");
    expect(box("Disease history date").value).toBe("");
  });

  it("Add a surgical line — Enter in the box adds too, the date is optional", async () => {
    api.appendOnExamination.mockReturnValue(answerWith([{ date: "02/11/2026", text: "Surgical Hx: H/O cholecystectomy" }]));
    const { again } = mount();
    fireEvent.change(box("Surgical / intervention history"), { target: { value: "H/O cholecystectomy" } });
    fireEvent.keyDown(box("Surgical / intervention history"), { key: "Enter" });
    await flush();
    expect(api.appendOnExamination).toHaveBeenCalledWith("A", [{ date: "02/11/2026", text: "Surgical Hx: H/O cholecystectomy" }]);
    again();
    expect(listed("surgical")).toEqual(["H/O cholecystectomy"]);
    expect(listed("disease")).toEqual([]);
  });

  it("a date it cannot read, a date to come, an empty box or a repeat writes nothing and says why", async () => {
    store.onExaminationSummary = [{ date: "20/10/2026", text: "Disease Hx: HTN" }];
    mount();
    fireEvent.change(box("Disease history"), { target: { value: "DM" } });
    fireEvent.change(box("Disease history date"), { target: { value: "321399" } });
    fireEvent.click(screen.getByRole("button", { name: "Add disease history" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Not a valid date/);
    fireEvent.change(box("Disease history date"), { target: { value: "010199" } });
    fireEvent.change(box("Disease history"), { target: { value: " htn " } });
    fireEvent.change(box("Disease history date"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Add disease history" }));
    expect(screen.getByRole("alert").textContent).toMatch(/in the list already/);
    fireEvent.change(box("Surgical / intervention history"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Add surgical / intervention history" }));
    expect(api.appendOnExamination).not.toHaveBeenCalled();
    // What was typed stays in its box.
    expect(box("Disease history").value).toBe(" htn ");
  });

  it("a failed Add says so in a box and keeps what was typed", async () => {
    api.appendOnExamination.mockRejectedValue(new TypeError("Failed to fetch"));
    mount();
    fireEvent.change(box("Disease history"), { target: { value: "DM" } });
    fireEvent.click(screen.getByRole("button", { name: "Add disease history" }));
    await flush();
    expect(dialogs.tell).toHaveBeenCalledWith(expect.objectContaining({ title: "The history was not added.", tone: "danger" }));
    expect(box("Disease history").value).toBe("DM");
    expect(screen.getByTestId("hx-disease").querySelectorAll("li")).toHaveLength(0);
  });

  it("the answer for a patient no longer loaded is not laid on the next one", async () => {
    let resolve!: (v: unknown) => void;
    api.appendOnExamination.mockReturnValue(new Promise((r) => { resolve = r; }));
    mount();
    fireEvent.change(box("Disease history"), { target: { value: "DM" } });
    fireEvent.click(screen.getByRole("button", { name: "Add disease history" }));
    store.patientIdRef.current = "B";
    store.setOnExaminationSummary.mockClear();
    resolve({ onExaminationSummary: [{ date: "02/11/2026", text: "Disease Hx: DM" }] });
    await flush();
    expect(store.setOnExaminationSummary).not.toHaveBeenCalled();
  });

  it("stays with the patient: switched away and back, the list is the patient's; another patient's typing is never carried", () => {
    const A = [{ date: "20/10/2026", text: "Disease Hx: DM 01/01/2010" }];
    store.onExaminationSummary = A;
    const { rerender } = render(ui());
    fireEvent.change(box("Disease history"), { target: { value: "half typed for A" } });
    // Patient B is opened.
    Object.assign(store, { currentPatientId: "B", onExaminationSummary: [] });
    store.patientIdRef.current = "B";
    rerender(ui());
    expect(box("Disease history").value).toBe("");
    expect(listed("disease")).toEqual([]);
    // …and A again: the record's list, the earlier typing gone.
    Object.assign(store, { currentPatientId: "A", onExaminationSummary: A });
    store.patientIdRef.current = "A";
    rerender(ui());
    expect(listed("disease")).toEqual(["DM 01/01/2010"]);
    expect(box("Disease history").value).toBe("");
  });

  it("× asks, takes the entry off (softly, on the server) and offers Undo, which puts it back", async () => {
    const DM = { date: "20/10/2026", text: "Disease Hx: DM 01/01/2010" };
    store.onExaminationSummary = [DM];
    api.removeHistoryEntry.mockReturnValue(answerWith([{ ...DM, removedAt: "2026-11-02T10:00:00Z" }]));
    api.restoreHistoryEntry.mockReturnValue(answerWith([DM]));
    const { again } = mount();
    fireEvent.click(screen.getByRole("button", { name: 'Remove "DM 01/01/2010"' }));
    await flush();
    expect(dialogs.confirmAction).toHaveBeenCalledWith(expect.objectContaining({ danger: true, confirmLabel: "Remove" }));
    expect(api.removeHistoryEntry).toHaveBeenCalledWith("A", "disease", "DM 01/01/2010");
    again();
    expect(listed("disease")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await flush();
    expect(api.restoreHistoryEntry).toHaveBeenCalledWith("A", "disease", "DM 01/01/2010");
    again();
    expect(listed("disease")).toEqual(["DM 01/01/2010"]);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("× answered no removes nothing", async () => {
    store.onExaminationSummary = [{ date: "20/10/2026", text: "Surgical Hx: RFA" }];
    dialogs.confirmAction.mockResolvedValue(false);
    mount();
    fireEvent.click(screen.getByRole("button", { name: 'Remove "RFA"' }));
    await flush();
    expect(api.removeHistoryEntry).not.toHaveBeenCalled();
    expect(listed("surgical")).toEqual(["RFA"]);
  });

  it("a removal refused by the server is said in its words", async () => {
    store.onExaminationSummary = [{ date: "20/10/2026", text: "Surgical Hx: RFA" }];
    api.removeHistoryEntry.mockRejectedValue(new ApiError(409, "This entry is no longer in the patient's history — it may have been removed on another screen."));
    mount();
    fireEvent.click(screen.getByRole("button", { name: 'Remove "RFA"' }));
    await flush();
    expect(dialogs.tell).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringMatching(/removed on another screen/) }));
  });

  it("the visit's own History lines are shown exactly as before", () => {
    mount();
    expect(screen.getByTestId("visit-history").textContent).toBe(VISIT_LINE);
  });

  it("a record still loading says so; one that did not load is said, with Try again — never an empty list", () => {
    store.recordStatus = "loading";
    const { again } = mount();
    expect(screen.getByRole("status").textContent).toMatch(/Loading/);
    expect(screen.queryByLabelText("Disease history")).toBeNull();
    store.recordStatus = "error";
    again();
    expect(screen.getByRole("alert").textContent).toMatch(/Could not load this patient's disease and surgical history/);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(store.retryRecord).toHaveBeenCalled();
    expect(screen.queryByLabelText("Disease history")).toBeNull();
  });

  it("without History's key: read only — the list, no boxes, no ×, no ⊘", () => {
    store.onExaminationSummary = [{ date: "20/10/2026", text: "Disease Hx: DM" }];
    mount(false);
    expect(listed("disease")).toEqual(["DM"]);
    expect(screen.queryByLabelText("Disease history")).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /in printed prescription/ })).toBeNull();
    expect(screen.getByTestId("hx-surgical").textContent).toMatch(/None recorded/);
  });

  it("⊘ Hide is the shared toggle, shown off by default, and presses the visit's hideHistory", () => {
    mount();
    const t = screen.getByRole("button", { name: "Hide History in printed prescription" });
    expect(t.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(t);
    expect(store.setHideHistory).toHaveBeenCalled();
  });
});
