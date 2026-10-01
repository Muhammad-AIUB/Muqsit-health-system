// @vitest-environment jsdom
//
// Regression for 82101b6 — "prescriptions/patient caches refresh on save".
//
// "Save & print" writes a new Prescription row and then PATCHes the patient's
// permanent history (investigation summary, on-examination summary, drug
// history). Three screens read those through React Query — Previous diagnosis /
// Previous complaints (["prescriptions", pid]) and Health monitoring
// (["patient", pid]) — and nothing told them: after a save they went on showing
// the history WITHOUT the visit that had just been completed, until the cache
// happened to go stale.
//
// Two rules are pinned, and the second is the subtle one:
//   1. both keys are invalidated for the patient that was saved;
//   2. the PATIENT record is re-read only AFTER its writes have landed — a
//      refetch racing them would bring the old record back and look "fresh".
//
// Same harness as MuqsitContext.test.tsx (the real provider, the API mocked at
// the module boundary, fake timers for the editor's debounces).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Patient } from "@/lib/api";
import { deferred } from "@/test/apiStub";

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
    prescriptionDraftApi: { get: api.draftGet, save: api.draftSave, clear: vi.fn(() => Promise.resolve({ ok: true })) },
    opdApi: { setRxStatus: api.setRxStatus },
    prescriptionsApi: { create: api.rxCreate },
    activityApi: { log: vi.fn(() => Promise.resolve()) },
  };
});
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "doc1" } }) }));
vi.mock("@/hooks/useDrugAdvice", () => ({ useDrugAdvice: () => ({ data: [], isSuccess: true }) }));

import { MuqsitProvider, useMuqsit } from "./MuqsitContext";

// A jsdom render of these screens takes seconds on the dev machine; the
// default 5 s is the failure mode there, not the code.
vi.setConfig({ testTimeout: 30_000 });

const patient = (over: Partial<Patient> = {}): Patient =>
  ({
    id: "X", doctorId: "doc1", name: "Patient X", sex: "", mobile: "", fullAddress: "",
    hospitalId: "", watched: false, drugHistory: [], incompleteRx: null,
    prescriptionImages: [], reportImages: [], investigationSummary: [], onExaminationSummary: [], ...over,
  }) as unknown as Patient;

async function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}><MuqsitProvider>{children}</MuqsitProvider></QueryClientProvider>
  );
  const r = renderHook(() => useMuqsit(), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  const invalidated = () => invalidate.mock.calls.map(([f]) => JSON.stringify((f as { queryKey?: unknown })?.queryKey));
  return { ...r, invalidated };
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

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

const PRESCRIPTIONS_X = JSON.stringify(["prescriptions", "X"]);
const PATIENT_X = JSON.stringify(["patient", "X"]);

describe("82101b6: completing a visit refreshes what other screens read about that patient", () => {
  it("invalidates the patient's prescriptions and the patient record", async () => {
    const { result, invalidated } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.setInvestigation(["01/09/2026:Hb:12"]));
    await act(async () => { await result.current.savePrescription(); });
    await tick(50);
    expect(api.rxCreate).toHaveBeenCalledTimes(1);
    expect(invalidated()).toContain(PRESCRIPTIONS_X);
    expect(invalidated()).toContain(PATIENT_X);
  });

  it("⚕️ re-reads the patient record only after the history writes have landed", async () => {
    const { result, invalidated } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    const gate = deferred();
    api.patientUpdate.mockImplementation(async (_id: string, body: object) => {
      if ("investigationSummary" in body) await gate.promise; // the history write is slow
      return {};
    });
    act(() => result.current.setInvestigation(["01/09/2026:Hb:12"]));
    await act(async () => { await result.current.savePrescription(); });
    await tick(50);

    // The prescription is on the record: its list is refreshed straight away…
    expect(invalidated()).toContain(PRESCRIPTIONS_X);
    // …but the patient record is NOT re-read while its own write is in flight.
    expect(api.patientUpdate.mock.calls.some(([, b]) => "investigationSummary" in (b as object))).toBe(true);
    expect(invalidated()).not.toContain(PATIENT_X);

    await act(async () => { gate.release(); await gate.promise; });
    await tick(50);
    expect(invalidated()).toContain(PATIENT_X);
  });

  it("does not refresh anything when there was nothing to save", async () => {
    const { result, invalidated } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    let ok = true;
    await act(async () => { ok = await result.current.savePrescription(); });
    expect(ok).toBe(false);
    expect(api.rxCreate).not.toHaveBeenCalled();
    expect(invalidated()).not.toContain(PRESCRIPTIONS_X);
    expect(invalidated()).not.toContain(PATIENT_X);
  });
});
