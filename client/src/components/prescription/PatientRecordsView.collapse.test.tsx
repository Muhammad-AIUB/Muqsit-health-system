// @vitest-environment jsdom
//
// Physician's sheet 07/11/2026: every section of "Patient's Prescriptions &
// reports" starts COLLAPSED; the arrow opens it, a second press closes it. And
// "Total summary of this patient" is for premium accounts: the others see it
// blurred and can press nothing on it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({ list: vi.fn(), patientGet: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<object>()),
  prescriptionsApi: { listByPatient: api.list, create: vi.fn() },
  patientsApi: { get: api.patientGet },
  medicinesApi: { byBrand: vi.fn().mockResolvedValue({ rows: [] }) },
  activityApi: { log: vi.fn() },
}));
let ctx: Record<string, unknown>;
let tier = "premium";
vi.mock("./PermissionsSection", () => ({ default: () => null }));
vi.mock("./DicomSection", () => ({ default: () => null }));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { accountTier: tier } }) }));
vi.mock("@/components/common/ImageGallery", () => ({
  default: (p: { title: string; collapsed?: boolean; onToggleCollapsed?: () => void }) => (
    <div><button aria-expanded={!p.collapsed} onClick={p.onToggleCollapsed}>{p.title}</button>{!p.collapsed && <div>{p.title} body</div>}</div>
  ),
}));

import PatientRecordsView from "./PatientRecordsView";

const fresh = () => ({
  currentPatientId: "A", ptName: "Test Patient", ptAge: "40", ptGender: "Female", ptPhone: "017", ptDate: "2026-11-07",
  rxImages: [], saveRxImages: vi.fn(), reportImages: [], saveReportImages: vi.fn(),
  appendGalleryImages: vi.fn(), imageThumbs: {},
  investigation: [], investigationSummary: [{ date: "05/09/2026", category: "LFT", test: "SGPT", value: "1120 U/L" }],
  setInvestigationSummary: vi.fn(), saveInvestigationSummary: vi.fn(), openInvForSummary: vi.fn(),
  onExaminationSummary: [{ date: "02/02/2026", text: "BP: 120/80", by: null }],
  drugHistory: [], rxItems: [], can: () => false, activeWorkstationId: null, authUserId: null,
  editDrugHistoryBlock: vi.fn(), addDrugHistoryEntries: vi.fn(),
});
const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });
const arrow = (title: string) => screen.getByRole("button", { name: new RegExp(`^(Expand|Collapse) ${title}$`) });

beforeEach(() => {
  tier = "premium";
  ctx = fresh();
  api.list.mockReset();
  api.list.mockResolvedValue([{ createdAt: "2026-09-05T05:00:00Z", chiefComplaints: ["Jaundice"], finalDiagnosis: ["AVH"] }]);
  api.patientGet.mockReset();
  api.patientGet.mockResolvedValue({ id: "A", doctorId: "doc1" });
});
afterEach(cleanup);

const SECTIONS = ["On examination", "Investigation reports summary", "Drug history", "Patient's input", "Disease and surgical history", "Chief complaints history", "Diagnosis history", "Total summary of this patient"];

describe("collapsible sections", () => {
  it("every section starts collapsed, and the two galleries too", async () => {
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    for (const t of SECTIONS) expect(arrow(t).getAttribute("aria-expanded"), t).toBe("false");
    for (const t of ["All prescriptions(Image)", "All reports(image)"]) expect(screen.getByRole("button", { name: t }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("BP: 120/80")).toBeNull();
    expect(screen.queryByText(/SGPT/)).toBeNull();
    expect(screen.queryByText("Jaundice")).toBeNull();
    expect(screen.queryByText("All prescriptions(Image) body")).toBeNull();
  });

  it("the arrow opens a section and a second press closes it; the others are left alone", async () => {
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    fireEvent.click(arrow("On examination"));
    expect(screen.getByText("BP: 120/80")).toBeTruthy();
    expect(arrow("On examination").getAttribute("aria-expanded")).toBe("true");
    expect(arrow("Investigation reports summary").getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(arrow("On examination"));
    expect(screen.queryByText("BP: 120/80")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All reports(image)" }));
    expect(screen.getByText("All reports(image) body")).toBeTruthy();
  });

  it("a collapsed section keeps its own buttons (Download stays where it was drawn)", async () => {
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    expect(screen.getByRole("button", { name: "Download On examination" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add/ })).toBeTruthy();
  });
});

describe("Total summary of this patient", () => {
  it("premium: filters by kind and lists the days in order", async () => {
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    fireEvent.click(arrow("Total summary of this patient"));
    await flush();
    expect(screen.getByText("Jaundice")).toBeTruthy();
    expect(screen.getByText("SGPT: 1120 U/L")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Final diagnosis" }));
    expect(screen.getByText("AVH")).toBeTruthy();
    expect(screen.queryByText("Jaundice")).toBeNull();
    expect((screen.getByRole("button", { name: "Download Total summary" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("not premium: the list is there but blurred, and nothing on it can be pressed", async () => {
    tier = "primary";
    render(<PatientRecordsView />, { wrapper: wrap });
    await flush();
    fireEvent.click(arrow("Total summary of this patient"));
    await flush();
    expect(screen.getByRole("note").textContent).toMatch(/for premium accounts/);
    expect((screen.getByRole("button", { name: "Download Total summary" }) as HTMLButtonElement).disabled).toBe(true);
    const chip = screen.getAllByText("Final diagnosis").map((e) => e.closest("button")).find(Boolean) as HTMLButtonElement;
    expect(chip.disabled).toBe(true);
    const blurred = chip.closest("[aria-hidden]") as HTMLElement;
    expect(blurred.style.filter).toContain("blur");
    expect(blurred.style.pointerEvents).toBe("none");
  });
});
