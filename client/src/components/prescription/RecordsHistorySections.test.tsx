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

const api = vi.hoisted(() => ({ list: vi.fn(), byBrand: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<object>()),
  prescriptionsApi: { listByPatient: api.list, create: vi.fn() },
  medicinesApi: { byBrand: api.byBrand },
}));
let ctx: Record<string, unknown>;
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));
vi.mock("@/components/common/ImageGallery", () => ({ default: () => null }));

import PatientRecordsView from "./PatientRecordsView";

const fresh = (over: Record<string, unknown> = {}) => ({
  currentPatientId: "A", ptName: "Test Patient", ptAge: "40", ptGender: "Female", ptPhone: "01700000000", ptDate: "2026-11-01",
  rxImages: [], saveRxImages: vi.fn(), reportImages: [], saveReportImages: vi.fn(),
  appendGalleryImages: vi.fn(), imageThumbs: {},
  investigation: [], investigationSummary: [], setInvestigationSummary: vi.fn(),
  saveInvestigationSummary: vi.fn(), openInvForSummary: vi.fn(),
  onExaminationSummary: [], drugHistory: [],
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

  it("drug history by date with tapers under their medicine; disease/surgical from On examination", async () => {
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
    expect(written[0]).toContain("&gt;&gt;&gt; 0+0+1");
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
// display only; the Download keeps the entries as stored.
describe("Drug history on the records page shows the generic", () => {
  const HISTORY = [
    "20/10/2026: Tablet. Napa 500 mg — 1+0+1 —  — 7 days",
    "20/10/2026(cont): 0+0+1 —  — 7 days",
    "20/10/2026: Tablet. Handtyped 5 mg — 1+0+0 —  — 7 days",
  ];
  it("one generic in place of the brand, as stored where none is found; tapers and Download unchanged", async () => {
    api.byBrand.mockResolvedValue({ rows: [{ brandName: "Napa", genericName: "Paracetamol", dosageForm: "Tablet", strength: "500 mg", priceRaw: null }] });
    ctx = fresh({ drugHistory: HISTORY });
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    const dh = sectionOf("Drug history");
    expect(api.byBrand).toHaveBeenCalledTimes(1);
    expect(dh.textContent).toContain("Tablet. Paracetamol 500 mg — 1+0+1 —  — 7 days");
    expect(dh.textContent).not.toContain("Napa");
    expect(dh.textContent).toContain("Tablet. Handtyped 5 mg(generic not found) — 1+0+0");
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

