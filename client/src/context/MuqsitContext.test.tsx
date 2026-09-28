// @vitest-environment jsdom
//
// ⚕️ The editor store's persistence rules around a loaded patient. Each case is
// a way one patient's clinical content used to reach the wrong record, or a
// patient who was never seen used to appear in today's OPD queue:
//   • an IPD detail borrowing `investigation`/`invImages` must not have the
//     admission's findings auto-saved into the loaded OPD patient's draft;
//   • opening a patient with stored medication is not "work" — no incompleteRx,
//     no OPD flag;
//   • re-opening the patient already loaded re-hydrates their drug history;
//   • an upload that finishes after a patient switch is not filed anywhere.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Patient } from "@/lib/api";

const api = vi.hoisted(() => ({
  patientGet: vi.fn(),
  patientUpdate: vi.fn(),
  draftGet: vi.fn(),
  draftSave: vi.fn(),
  setRxStatus: vi.fn(),
  rxCreate: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    setActiveWorkstationId: () => {},
    patientsApi: { get: api.patientGet, update: api.patientUpdate, create: vi.fn() },
    prescriptionDraftApi: { get: api.draftGet, save: api.draftSave },
    opdApi: { setRxStatus: api.setRxStatus },
    prescriptionsApi: { create: api.rxCreate },
    activityApi: { log: vi.fn(() => Promise.resolve()) },
  };
});
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "doc1" } }) }));
vi.mock("@/hooks/useDrugAdvice", () => ({ useDrugAdvice: () => ({ data: [], isSuccess: true }) }));

import { MuqsitProvider, useMuqsit } from "./MuqsitContext";

const STORED = ["01/01/2026: Tablet. Napa 500 mg — 1+0+1 — After meal — 5 days"];
const patient = (over: Partial<Patient> = {}): Patient =>
  ({
    id: "X", doctorId: "doc1", name: "Patient X", sex: "", mobile: "", fullAddress: "",
    hospitalId: "", watched: false, drugHistory: STORED, incompleteRx: null,
    prescriptionImages: [], reportImages: [], ...over,
  }) as unknown as Patient;

async function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}><MuqsitProvider>{children}</MuqsitProvider></QueryClientProvider>
  );
  const r = renderHook(() => useMuqsit(), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); }); // draft hydration → auto-save unlocked
  return r;
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const incompleteWrites = () => api.patientUpdate.mock.calls.filter(([, body]) => "incompleteRx" in (body as object));

beforeEach(() => {
  vi.useFakeTimers();
  for (const f of Object.values(api)) f.mockReset();
  api.draftGet.mockResolvedValue({ data: {} });
  api.draftSave.mockResolvedValue({});
  api.patientUpdate.mockResolvedValue({});
  api.setRxStatus.mockResolvedValue({});
  api.rxCreate.mockResolvedValue({});
  api.patientGet.mockImplementation(async (id: string) => patient({ id }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("opening a patient with stored medication (E5)", () => {
  it("is not visit content: no incompleteRx write, no OPD flag", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(3000);
    expect(result.current.drugHistory).toEqual(STORED);
    expect(result.current.hasRxContent).toBe(false);
    expect(incompleteWrites()).toHaveLength(0);
    expect(api.setRxStatus).not.toHaveBeenCalled();
  });

  it("still counts a drug-history change as work", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.setDrugHistory([...STORED, "29/09/2026: Tablet. Seclo 20 mg"]));
    expect(result.current.hasRxContent).toBe(true);
  });
});

describe("re-opening the patient already loaded (E4)", () => {
  it("re-hydrates their drug history instead of leaving it blank", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    expect(result.current.drugHistory).toEqual(STORED);
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    expect(result.current.drugHistory).toEqual(STORED);
    expect(incompleteWrites()).toHaveLength(0);
  });
});

describe("IPD detail borrowing the investigation fields (E1)", () => {
  it("never auto-saves the admission's findings into the OPD patient's draft, and restores theirs", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    const own = ["01/09/2026:Hb:12"];
    act(() => result.current.setInvestigation(own));
    await tick(1500);
    api.draftSave.mockClear();
    api.patientUpdate.mockClear();

    const admission = ["02/09/2026:Creatinine:3.1"];
    act(() => result.current.beginInvBorrow());
    act(() => { result.current.setInvestigation(admission); result.current.setInvImages({ "02/09/2026:Creatinine": "/u/y.jpg" }); });
    await tick(3000);
    const leaked = [...api.draftSave.mock.calls.map(([s]) => s), ...incompleteWrites().map(([, b]) => (b as { incompleteRx: unknown }).incompleteRx)]
      .some((s) => JSON.stringify(s).includes("Creatinine"));
    expect(leaked).toBe(false);
    expect(result.current.mirrorSnapshot.investigation).toEqual(own);

    act(() => result.current.endInvBorrow());
    expect(result.current.investigation).toEqual(own);
    expect(result.current.invImages).toEqual({});
  });

  it("does not hand the held findings to a patient opened during the loan", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.setInvestigation(["01/09/2026:Hb:12"]));
    act(() => result.current.beginInvBorrow());
    act(() => result.current.loadPatient(patient({ id: "Z", drugHistory: [] })));
    act(() => result.current.endInvBorrow());
    expect(result.current.investigation).toEqual([]);
  });
});

describe("gallery uploads that finish late (E7)", () => {
  it("are dropped when another patient was opened meanwhile", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.loadPatient(patient({ id: "Z", drugHistory: [] })));
    await tick(50);
    api.patientUpdate.mockClear();
    let filed = true;
    act(() => { filed = result.current.appendGalleryImages("rx", "X", ["/u/a.jpg"]); });
    expect(filed).toBe(false);
    expect(result.current.rxImages).toEqual([]);
    expect(api.patientUpdate).not.toHaveBeenCalled();
  });

  it("join the gallery as it is NOW, not as it was when the upload began", async () => {
    api.patientGet.mockImplementation(async (id: string) => patient({ id, prescriptionImages: ["/u/old.jpg", "/u/gone.jpg"] }));
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.saveRxImages(["/u/old.jpg"])); // removed while uploading
    act(() => { result.current.appendGalleryImages("rx", "X", ["/u/new.jpg"]); });
    expect(result.current.rxImages).toEqual(["/u/new.jpg", "/u/old.jpg"]);
    expect(api.patientUpdate).toHaveBeenLastCalledWith("X", { prescriptionImages: ["/u/new.jpg", "/u/old.jpg"] });
  });
});
