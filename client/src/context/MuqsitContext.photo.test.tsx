// @vitest-environment jsdom
//
// ⚕️ The header's photo belongs to the patient on screen (physician, 02/11/2026:
// "Prscrptn chng krle image dekhay jay previous image er"). The photo is
// `ptInfo.picture`, and `resetEditor` blanked every field but `ptInfo`: after
// "New Prescription" the last patient's face stood over an empty header — and a
// new patient saved from that screen was created WITH that photo (and the last
// patient's "watched" flag). A slow patient fetch could also land after the
// doctor had moved on, and put its patient (and face) back on the screen.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Patient } from "@/lib/api";

const api = vi.hoisted(() => ({
  patientGet: vi.fn(),
  patientUpdate: vi.fn(),
  patientCreate: vi.fn(),
  draftGet: vi.fn(),
  draftSave: vi.fn(),
  setRxStatus: vi.fn(),
  rxCreate: vi.fn(),
  supervisedDraft: vi.fn(),
  activityLog: vi.fn(),
  dhAppend: vi.fn(),
  oeAppend: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    setActiveWorkstationId: () => {},
    patientsApi: { get: api.patientGet, update: api.patientUpdate, create: api.patientCreate, setSupervisedDraft: api.supervisedDraft, appendDrugHistory: api.dhAppend, appendOnExamination: api.oeAppend },
    prescriptionDraftApi: { get: api.draftGet, save: api.draftSave },
    opdApi: { setRxStatus: api.setRxStatus },
    prescriptionsApi: { create: api.rxCreate },
    activityApi: { log: api.activityLog },
  };
});
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "doc1" } }) }));
const tell = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/lib/dialogs", async (original) => ({ ...(await original<typeof import("@/lib/dialogs")>()), tell }));
const savedAdvice = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/hooks/useDrugAdvice", () => ({ useDrugAdvice: () => ({ data: savedAdvice.list, isSuccess: true }) }));

import { MuqsitProvider, useMuqsit } from "./MuqsitContext";

const patient = (id: string, over: Partial<Patient> = {}): Patient =>
  ({
    id, doctorId: "doc1", name: `Patient ${id}`, sex: "Male", mobile: "01700000000", fullAddress: "",
    hospitalId: "", watched: false, drugHistory: [], incompleteRx: null,
    prescriptionImages: [], reportImages: [], pictureUrl: `https://img.example/${id}.jpg`, ...over,
  }) as unknown as Patient;

async function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}><MuqsitProvider>{children}</MuqsitProvider></QueryClientProvider>
  );
  const r = renderHook(() => useMuqsit(), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  return r;
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

/** A patient fetch that answers only when told to. */
function deferred() {
  let resolve!: (p: Patient) => void;
  const promise = new Promise<Patient>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const f of Object.values(api)) f.mockReset();
  api.draftGet.mockResolvedValue({ data: {} });
  api.draftSave.mockResolvedValue({});
  api.patientUpdate.mockResolvedValue({});
  api.setRxStatus.mockResolvedValue({});
  api.rxCreate.mockResolvedValue({});
  api.supervisedDraft.mockResolvedValue({ ok: true });
  api.activityLog.mockResolvedValue({});
  api.oeAppend.mockResolvedValue({ onExaminationSummary: [] });
  api.dhAppend.mockImplementation(async (_id: string, entries: string[]) => ({ drugHistory: entries }));
  api.patientGet.mockImplementation(async (id: string) => patient(id));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("the header photo always belongs to the patient on screen", () => {
  it("is cleared by New Prescription (resetEditor), with the watch flag", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient("A", { watched: true })));
    await tick(50);
    expect(result.current.ptInfo.picture).toBe("https://img.example/A.jpg");
    expect(result.current.watchPatient).toBe(true);
    // MobileLookupField's "New Prescription"
    act(() => { result.current.flushEditorDraft(); result.current.resetEditor(); result.current.setCurrentPatientId(null); });
    await tick(50);
    expect(result.current.ptName).toBe("");
    expect(result.current.ptInfo.picture).toBeNull();
    expect(result.current.ptInfo.name).toBe("");
    expect(result.current.watchPatient).toBe(false);
  });

  it("a new patient saved after New Prescription is not created with the last patient's photo", async () => {
    api.patientCreate.mockResolvedValue(patient("NEW", { pictureUrl: null }));
    const { result } = await setup();
    act(() => result.current.loadPatient(patient("A", { watched: true })));
    await tick(50);
    act(() => { result.current.resetEditor(); result.current.setCurrentPatientId(null); });
    act(() => { result.current.setPtName("Someone New"); result.current.setChiefComplaints(["Fever"]); });
    await act(async () => { void result.current.savePrescription(); await vi.advanceTimersByTimeAsync(10_000); });
    expect(api.patientCreate).toHaveBeenCalledTimes(1);
    const body = api.patientCreate.mock.calls[0][0] as { pictureUrl?: string };
    expect(body.pictureUrl).toBeUndefined();
    const carried = api.patientUpdate.mock.calls.filter(([id]) => id === "NEW").map(([, b]) => b as Record<string, unknown>);
    expect(carried.some((b) => b.watched === true)).toBe(false);
  });

  it("a slow fetch for patient A that lands after patient B was opened does not replace B", async () => {
    const { result } = await setup();
    const a = deferred();
    api.patientGet.mockImplementation(async (id: string) => (id === "A" ? a.promise : patient(id)));
    let pa!: Promise<Patient | null>;
    act(() => { pa = result.current.loadPatientById("A"); });
    await act(async () => { await result.current.loadPatientById("B"); });
    expect(result.current.currentPatientId).toBe("B");
    await act(async () => { a.resolve(patient("A")); await pa; await vi.advanceTimersByTimeAsync(50); });
    expect(result.current.currentPatientId).toBe("B");
    expect(result.current.ptName).toBe("Patient B");
    expect(result.current.ptInfo.picture).toBe("https://img.example/B.jpg");
  });

  it("a slow fetch that lands after New Prescription leaves the blank prescription blank", async () => {
    const { result } = await setup();
    const a = deferred();
    api.patientGet.mockImplementation(async (id: string) => (id === "A" ? a.promise : patient(id)));
    let pa!: Promise<Patient | null>;
    act(() => { pa = result.current.loadPatientById("A"); });
    act(() => { result.current.resetEditor(); result.current.setCurrentPatientId(null); });
    await act(async () => { a.resolve(patient("A")); await pa; await vi.advanceTimersByTimeAsync(50); });
    expect(result.current.currentPatientId).toBeNull();
    expect(result.current.ptName).toBe("");
    expect(result.current.ptInfo.picture).toBeNull();
  });

  it("an answer for the same patient opened twice still loads", async () => {
    const { result } = await setup();
    await act(async () => { await result.current.loadPatientById("A"); });
    await act(async () => { await result.current.loadPatientById("A"); });
    expect(result.current.currentPatientId).toBe("A");
    expect(result.current.ptInfo.picture).toBe("https://img.example/A.jpg");
  });

  it("another patient arriving through the device mirror without a ptInfo (older build) drops the photo", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient("A")));
    await tick(50);
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", currentPatientId: "B", ptName: "Patient B", rxItems: [] }));
    await tick(50);
    expect(result.current.currentPatientId).toBe("B");
    expect(result.current.ptInfo.picture).toBeNull();
  });

  it("the same patient through the mirror without a ptInfo keeps their photo", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient("A")));
    await tick(50);
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", currentPatientId: "A", rxItems: [] }));
    await tick(50);
    expect(result.current.ptInfo.picture).toBe("https://img.example/A.jpg");
  });
});
