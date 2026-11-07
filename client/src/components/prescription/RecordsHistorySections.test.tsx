// @vitest-environment jsdom
//
// The records page's read-only history (physician's sheet 31/10/2026, item 3):
// On examination with its author and a Download in place of Edit, and the
// sections after the Investigation summary — in the physician's order, each
// with a clear empty state, nothing made up.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({ list: vi.fn(), byBrand: vi.fn(), patientGet: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<object>()),
  prescriptionsApi: { listByPatient: api.list, create: vi.fn() },
  medicinesApi: { byBrand: api.byBrand },
  patientsApi: { get: api.patientGet },
  activityApi: { log: api.log },
}));
let ctx: Record<string, unknown>;
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));
vi.mock("@/components/common/ImageGallery", () => ({ default: () => null }));
vi.mock("./AddMedicineRow", () => ({
  default: (p: { date: string; onAdd: (e: string[]) => boolean }) => (
    <button type="button" onClick={() => p.onAdd([`${p.date}: Tablet. Seclo 20 mg — 1+0+0 —  — 3 days`])}>Add to Drug history</button>
  ),
}));

import PatientRecordsView from "./PatientRecordsView";
import { rxDrugHistoryEntries } from "@/lib/rxDrugHistory";

const fresh = (over: Record<string, unknown> = {}) => ({
  currentPatientId: "A", ptName: "Test Patient", ptAge: "40", ptGender: "Female", ptPhone: "01700000000", ptDate: "2026-11-01",
  rxImages: [], saveRxImages: vi.fn(), reportImages: [], saveReportImages: vi.fn(),
  appendGalleryImages: vi.fn(), imageThumbs: {},
  investigation: [], investigationSummary: [], setInvestigationSummary: vi.fn(),
  saveInvestigationSummary: vi.fn(), openInvForSummary: vi.fn(),
  onExaminationSummary: [], drugHistory: [],
  // Drug history's Edit / Add (physician's sheet 07/11/2026): off unless a test turns them on.
  rxItems: [], can: () => false, activeWorkstationId: null, authUserId: null,
  editDrugHistoryBlock: vi.fn(), addDrugHistoryEntries: vi.fn(),
  ...over,
});

const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });
const sectionOf = (name: string) => screen.getByRole("region", { name });

let written: string[];
beforeEach(() => {
  api.list.mockReset();
  api.list.mockResolvedValue([]);
  api.byBrand.mockReset();
  api.byBrand.mockResolvedValue({ rows: [] });
  api.patientGet.mockReset();
  api.patientGet.mockResolvedValue({ id: "A", doctorId: "doc1" });
  api.log.mockReset();
  api.log.mockResolvedValue({});
  written = [];
  vi.spyOn(window, "open").mockImplementation(() => ({ document: { write: (h: string) => written.push(h), close: () => {} } }) as unknown as Window);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("On examination on the records page", () => {
  it("each date says who wrote it; an old entry names nobody", async () => {
    ctx = fresh({ onExaminationSummary: [
      { date: "20/10/2026", text: "BP: 120/80 mmHg" },
      { date: "28/10/2026", text: "Pulse: 78 b/min", by: "shahariar" },
    ] });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    expect(screen.getByText("by Dr. shahariar")).toBeTruthy();
    expect(screen.queryAllByText(/^by /)).toHaveLength(1);
    expect(screen.getByText("BP: 120/80 mmHg")).toBeTruthy();
  });

  it("has no Edit and no delete — a Download in their place", async () => {
    ctx = fresh({ onExaminationSummary: [{ date: "28/10/2026", text: "Pulse: 78 b/min", by: "Dr. Karim" }] });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    expect(screen.queryByText("✎ Edit")).toBeNull(); // the investigation summary is empty here, so no Edit at all
    expect(screen.queryByLabelText("Delete finding")).toBeNull();
    fireEvent.click(screen.getByLabelText("Download On examination"));
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("28/10/2026 by Dr. Karim");
    expect(written[0]).toContain("Pulse: 78 b/min");
  });

  it("Download is off while there is nothing to download", async () => {
    ctx = fresh();
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    expect((screen.getByLabelText("Download On examination") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the history sections after the Investigation summary", () => {
  it("come in the physician's order", async () => {
    ctx = fresh();
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    const names = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(names).toEqual(["Drug history", "Patient's input", "Disease and surgical history", "Chief complaints history", "Diagnosis history"]);
  });

  it("each says plainly when it has nothing — Patient's input is not made up", async () => {
    ctx = fresh();
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    expect(within(sectionOf("Drug history")).getByText(/No drug history recorded/)).toBeTruthy();
    expect(within(sectionOf("Patient's input")).getByText(/Nothing is recorded as the patient's own input/)).toBeTruthy();
    expect(within(sectionOf("Disease and surgical history")).getByText(/No disease or surgical history yet/)).toBeTruthy();
    expect(within(sectionOf("Chief complaints history")).getByText(/No chief complaints history yet/)).toBeTruthy();
    expect(within(sectionOf("Diagnosis history")).getByText(/No diagnosis history yet/)).toBeTruthy();
  });

  it("drug history as a table with tapers under their medicine; disease/surgical from On examination", async () => {
    ctx = fresh({
      drugHistory: ["20/10/2026: Tablet. Napa 500 mg — 1+0+1 —  — 7 days", "20/10/2026(cont): 0+0+1 —  — 7 days"],
      onExaminationSummary: [{ date: "28/10/2026", text: "Disease Hx: DM 10/01/2020", by: "Rahim" }],
    });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    const dh = sectionOf("Drug history");
    expect(within(dh).getByText("20/10/2026")).toBeTruthy();
    expect(within(dh).getByText(/Tablet\. Napa 500 mg/)).toBeTruthy();
    expect(within(dh).getByText(/0\+0\+1/)).toBeTruthy();
    const hx = sectionOf("Disease and surgical history");
    expect(within(hx).getByText(/DM 10\/01\/2020/)).toBeTruthy();
    expect(within(hx).getByText(/recorded 28\/10\/2026 by Dr\. Rahim/)).toBeTruthy();
    fireEvent.click(within(dh).getByLabelText("Download Drug history"));
    // The printed page is the table as shown: same columns, the taper under its medicine.
    expect(written[0]).toContain("<th>Total number</th>");
    expect(written[0]).toContain("<td>then</td><td>0+0+1</td>");
  });

  // ⚕️ Regression (sheet 28/10/2026, item 7): the entries now written in the
  // sidebar's History block are the same lines, so the section still lists
  // them — and an entry taken off there (soft, `removedAt`) is listed nowhere,
  // neither here nor on the On-examination card of its date.
  it("lists what the sidebar wrote, and leaves out an entry taken off there", async () => {
    ctx = fresh({
      onExaminationSummary: [
        { date: "20/10/2026", text: "Disease Hx: DM 10/01/2020" },
        { date: "02/11/2026", text: "Surgical Hx: H/O cholecystectomy 15/10/2026", by: "Dr. Karim" },
        { date: "02/11/2026", text: "Disease Hx: HTN", by: "Dr. Karim", removedAt: "2026-11-02T10:00:00.000Z", removedBy: "Dr. Karim" },
      ],
    });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    const hx = sectionOf("Disease and surgical history");
    expect(within(hx).getByText(/DM 10\/01\/2020/)).toBeTruthy();
    expect(within(hx).getByText(/H\/O cholecystectomy 15\/10\/2026/)).toBeTruthy();
    expect(within(hx).queryByText(/HTN/)).toBeNull();
    expect(screen.queryByText(/HTN/)).toBeNull();
  });

  it("chief complaints and diagnoses per saved prescription, newest first", async () => {
    api.list.mockResolvedValue([
      { id: "1", doctorId: "d", patientId: "A", items: [], createdAt: "2026-10-20T04:00:00.000Z", chiefComplaints: ["Fever 3 days"], finalDiagnosis: ["Viral fever"] },
      { id: "2", doctorId: "d", patientId: "A", items: [], createdAt: "2026-10-28T04:00:00.000Z", chiefComplaints: ["Cough"], finalDiagnosis: ["Asthma"] },
    ]);
    ctx = fresh();
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    const cc = within(sectionOf("Chief complaints history")).getAllByText(/\d{2}\/\d{2}\/\d{4}/).map((n) => n.textContent);
    expect(cc).toEqual(["28/10/2026", "20/10/2026"]);
    expect(within(sectionOf("Diagnosis history")).getByText("Asthma")).toBeTruthy();
  });

  it("a list that did not load says so and offers Try again — never 'nothing yet'", async () => {
    api.list.mockRejectedValue(new Error("offline"));
    ctx = fresh();
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    expect(within(sectionOf("Diagnosis history")).getByText("Could not load the diagnosis history.")).toBeTruthy();
    expect(within(sectionOf("Diagnosis history")).queryByText(/No diagnosis history yet/)).toBeNull();
    api.list.mockResolvedValue([{ id: "1", doctorId: "d", patientId: "A", items: [], createdAt: "2026-10-20T04:00:00.000Z", finalDiagnosis: ["Asthma"] }]);
    fireEvent.click(within(sectionOf("Diagnosis history")).getByText("Try again"));
    await flush();
    expect(within(sectionOf("Diagnosis history")).getByText("Asthma")).toBeTruthy();
  });
});

// ⚕️ Drug history is READ by the generic here too (physician, 02/11/2026) —
// display only; the Download keeps the entries as stored. Since the physician's
// sheet of 07/11/2026 the table writes the generic with the brand as stored in
// brackets, as the sheet's own example does (`Paracetamol(Tab. Napa 500mg)`);
// the Drug history MODAL still shows the generic alone.
describe("Drug history on the records page shows the generic", () => {
  const HISTORY = [
    "20/10/2026: Tablet. Napa 500 mg — 1+0+1 —  — 7 days",
    "20/10/2026(cont): 0+0+1 —  — 7 days",
    "20/10/2026: Tablet. Handtyped 5 mg — 1+0+0 —  — 7 days",
  ];
  it("the generic with the stored brand in brackets, as stored where none is found; tapers and Download unchanged", async () => {
    api.byBrand.mockResolvedValue({ rows: [{ brandName: "Napa", genericName: "Paracetamol", dosageForm: "Tablet", strength: "500 mg", priceRaw: null }] });
    ctx = fresh({ drugHistory: HISTORY });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    const dh = sectionOf("Drug history");
    expect(api.byBrand).toHaveBeenCalledTimes(1);
    expect(dh.textContent).toContain("Paracetamol (Tablet. Napa 500 mg)");
    expect(dh.textContent).toContain("Tablet. Handtyped 5 mg(generic not found)");
    expect(within(dh).getByText(/0\+0\+1/)).toBeTruthy();
    fireEvent.click(within(dh).getByLabelText("Download Drug history"));
    expect(written[0]).toContain("Tablet. Napa 500 mg");
    expect(ctx.drugHistory).toEqual(HISTORY);
  });

  it("a failed lookup shows every entry as stored and says so once", async () => {
    api.byBrand.mockRejectedValue(new Error("Failed to fetch"));
    ctx = fresh({ drugHistory: HISTORY });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    const dh = sectionOf("Drug history");
    // After the hook's two quiet retries (about 3 s).
    expect(await within(dh).findByText(/Generic names could not be loaded/, undefined, { timeout: 8000 })).toBeTruthy();
    expect(dh.textContent).toContain("Tablet. Napa 500 mg");
    expect(dh.textContent).not.toContain("generic not found");
  });
});


// ⚕️ Drug history's Edit / Add (physician's sheet, 07/11/2026): offered only
// where the record may be written, wired to the store's writes, and a line on
// today's ℞ is the pad's to change.
describe("Drug history Edit and Add on the records page", () => {
  const DENVAR = "06/11/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 7 days";
  const own = (over: Record<string, unknown> = {}) => fresh({
    drugHistory: [DENVAR], can: () => true, authUserId: "doc1", activeWorkstationId: null, ...over,
  });
  const editButton = () => within(sectionOf("Drug history")).queryByText("✎ Edit");

  it("the owner's practice with the keys gets Edit", async () => {
    ctx = own();
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    expect(editButton()).toBeTruthy();
  });

  it("a supervising doctor does not: the patient's record belongs to another practice", async () => {
    api.patientGet.mockResolvedValue({ id: "A", doctorId: "the-owner" });
    ctx = own();
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    expect(editButton()).toBeNull();
  });

  it("an assistant acting for the owner is judged by the owner's id and by their keys", async () => {
    ctx = own({ authUserId: "assistant-1", activeWorkstationId: "doc1" });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    expect(editButton()).toBeTruthy();
    cleanup();
    ctx = own({ authUserId: "assistant-1", activeWorkstationId: "doc1", can: (k: string) => k !== "rx.drugHistory" && k !== "rx.medicines" });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    expect(editButton()).toBeNull();
  });

  it("while the patient's record has not loaded, or cannot be read, there is no Edit — the write is never offered on a guess", async () => {
    api.patientGet.mockRejectedValue(new Error("offline"));
    ctx = own();
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    expect(editButton()).toBeNull();
  });

  it("Save sends the block to the store as it is stored, and writes one activity line", async () => {
    const edit = vi.fn().mockResolvedValue(true);
    ctx = own({ editDrugHistoryBlock: edit });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    fireEvent.click(editButton()!);
    fireEvent.change(screen.getByLabelText(/Duration of Capsule. Denvar/), { target: { value: "5 days" } });
    fireEvent.click(screen.getByLabelText(/Save changes to Capsule. Denvar/));
    await flush();
    expect(edit).toHaveBeenCalledWith([DENVAR], ["06/11/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 5 days"]);
    expect(api.log).toHaveBeenCalledTimes(1);
    expect(api.log.mock.calls[0][0]).toMatchObject({ section: "Drug history", action: "saved", patientId: "A" });
    expect(api.log.mock.calls[0][0].detail).toContain("Capsule. Denvar 400 mg");
  });

  it("a save the record did not take writes no activity line", async () => {
    ctx = own({ editDrugHistoryBlock: vi.fn().mockResolvedValue(false) });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    fireEvent.click(editButton()!);
    fireEvent.change(screen.getByLabelText(/Duration of Capsule. Denvar/), { target: { value: "5 days" } });
    fireEvent.click(screen.getByLabelText(/Save changes to Capsule. Denvar/));
    await flush();
    expect(api.log).not.toHaveBeenCalled();
  });

  it("a medicine on today's ℞ is the pad's: its row cannot be edited here", async () => {
    // the line the ℞ mirror writes for this pad, as the store would hold it
    const item = { drug: "Capsule. Denvar 400 mg", dose: "1+0+1", instruction: "", duration: "7 days" };
    const mirrored = rxDrugHistoryEntries([item], "06/11/2026");
    expect(mirrored).toEqual([DENVAR]);
    ctx = own({ ptDate: "2026-11-06", rxItems: [item] });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    fireEvent.click(editButton()!);
    expect(screen.queryByLabelText(/Duration of/)).toBeNull();
    expect(screen.getByText(/On today's ℞/)).toBeTruthy();
  });

  // The pad itself (typing, the medicine list, shorthand) is AddMedicineRow's and
  // has its own tests; here it is a button that presses Add with one line, so
  // that what is checked is where that press goes.
  const LINE = "07/11/2026: Tablet. Seclo 20 mg — 1+0+0 —  — 3 days";

  it("a medicine added here goes to the RECORD at once — before Save & print too — and is logged once the store took it", async () => {
    const add = vi.fn().mockReturnValue(true);
    ctx = own({ addDrugHistoryEntries: add, ptDate: "2026-11-07" });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    fireEvent.click(editButton()!);
    expect(add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Add to Drug history"));
    expect(add).toHaveBeenCalledWith([LINE], { toRecord: true });
    await flush();
    expect(api.log).toHaveBeenCalledTimes(1);
    expect(api.log.mock.calls[0][0]).toMatchObject({ section: "Drug history", action: "added" });
    expect(api.log.mock.calls[0][0].detail).toBe("Added “Tablet. Seclo 20 mg” (start 07/11/2026)");
  });

  it("a press the store did not take writes no activity line", async () => {
    ctx = own({ addDrugHistoryEntries: vi.fn().mockReturnValue(false) });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    fireEvent.click(editButton()!);
    fireEvent.click(screen.getByText("Add to Drug history"));
    await flush();
    expect(api.log).not.toHaveBeenCalled();
  });

  it("no Add for someone who may put dates right but not write medicines", async () => {
    ctx = own({ can: (k: string) => k !== "rx.medicines" });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    fireEvent.click(editButton()!);
    expect(screen.queryByText("Add to Drug history")).toBeNull();
    expect(screen.getByLabelText(/Duration of Capsule. Denvar/)).toBeTruthy();
  });
});
