// @vitest-environment jsdom
//
// ⚕️ Putting one medicine's start date and duration right in the patient's
// RECORD (Patient's Prescriptions & reports → Drug history → Edit, physician's
// sheet 07/11/2026), and adding a medicine there. Both are written to the
// record at once by the server — never a whole list built here — on the same
// queue as every other drug-history write, and neither says "saved" before the
// record has it. Each case is a way it could lose a line, write over another
// device's change, or tell the doctor the wrong thing about what is on the record.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError, type Patient } from "@/lib/api";

const api = vi.hoisted(() => ({
  patientGet: vi.fn(), patientUpdate: vi.fn(), draftGet: vi.fn(), draftSave: vi.fn(), setRxStatus: vi.fn(),
  rxCreate: vi.fn(), supervisedDraft: vi.fn(), activityLog: vi.fn(), dhAppend: vi.fn(), dhReplace: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    setActiveWorkstationId: () => {},
    patientsApi: {
      get: api.patientGet, update: api.patientUpdate, create: vi.fn(), setSupervisedDraft: api.supervisedDraft,
      appendDrugHistory: api.dhAppend, replaceDrugHistoryBlock: api.dhReplace, appendOnExamination: vi.fn(),
    },
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

const NAPA = "06/11/2026: Tablet. Napa 500 mg — 1+1+1 — After meal — 10 days";
const DENVAR = "06/11/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 7 days";
const DENVAR_LATER = "08/11/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 5 days";
const OLD = "01/02/2025: Capsule. Cef 3 400 mg — 1+0+1 —  — 14 days";
const SECLO = "07/11/2026: Tablet. Seclo 20 mg — 1+0+0 —  — 3 days";
const STORED = [OLD, NAPA, DENVAR];

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
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  return r;
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const open = async (over: Partial<Patient> = {}) => {
  const r = await setup();
  act(() => r.result.current.loadPatient(patient(over)));
  await tick(50);
  return r;
};
const told = () => (tell.mock.calls as unknown as [{ title: string; body?: string; tone?: string }][]).map(([x]) => x);
const wholeListWrites = () => api.patientUpdate.mock.calls.filter(([, b]) => "drugHistory" in (b as object));

beforeEach(() => {
  vi.useFakeTimers();
  tell.mockClear();
  for (const f of Object.values(api)) f.mockReset();
  api.draftGet.mockResolvedValue({ data: {} });
  api.draftSave.mockResolvedValue({});
  api.patientUpdate.mockResolvedValue({});
  api.setRxStatus.mockResolvedValue({});
  api.rxCreate.mockResolvedValue({});
  api.supervisedDraft.mockResolvedValue({ ok: true });
  api.activityLog.mockResolvedValue({});
  api.patientGet.mockImplementation(async (id: string) => patient({ id }));
  api.dhAppend.mockImplementation(async (_id: string, entries: string[]) => ({ drugHistory: [...STORED, ...entries] }));
  api.dhReplace.mockImplementation(async (_id: string, from: string[], to: string[]) => {
    const at = STORED.findIndex((_, i) => from.every((e, k) => STORED[i + k] === e));
    return { drugHistory: [...STORED.slice(0, at), ...to, ...STORED.slice(at + from.length)] };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("editDrugHistoryBlock", () => {
  it("asks the server to replace the block, and the editor's own list takes the same change — no whole list is written", async () => {
    const { result } = await open();
    expect(result.current.drugHistory).toEqual(STORED);
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.editDrugHistoryBlock([DENVAR], [DENVAR_LATER]); });
    expect(ok).toBe(true);
    expect(api.dhReplace.mock.calls).toEqual([["X", [DENVAR], [DENVAR_LATER]]]);
    expect(result.current.drugHistory).toEqual([OLD, NAPA, DENVAR_LATER]);
    expect(wholeListWrites()).toHaveLength(0);
    expect(tell).not.toHaveBeenCalled();
  });

  it("the old block does not stay beside the new one when the record answers", async () => {
    const { result } = await open();
    await act(async () => { await result.current.editDrugHistoryBlock([NAPA], ["07/11/2026: Tablet. Napa 500 mg — 1+1+1 — After meal — 5 days"]); });
    expect(result.current.drugHistory.filter((e) => e.includes("Napa"))).toEqual(["07/11/2026: Tablet. Napa 500 mg — 1+1+1 — After meal — 5 days"]);
    expect(result.current.drugHistory).toHaveLength(3);
  });

  it("a line another device changed first: said, nothing written over it, the list as it was", async () => {
    const { result } = await open();
    api.dhReplace.mockRejectedValueOnce(new ApiError(409, "This medicine's line has changed since the list was read, so nothing was changed. Open the list again and make the change once more."));
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.editDrugHistoryBlock([DENVAR], [DENVAR_LATER]); });
    expect(ok).toBe(false);
    expect(result.current.drugHistory).toEqual(STORED);
    expect(told().at(-1)).toMatchObject({ title: "The change was not saved.", tone: "danger" });
    expect(told().at(-1)?.body).toContain("Capsule. Denvar 400 mg");
    expect(told().at(-1)?.body).toContain("Open the patient again");
  });

  it("a refusal of the server is said in the doctor's words, not the framework's, and the list is as it was", async () => {
    const { result } = await open();
    api.dhReplace.mockRejectedValueOnce(new ApiError(500, "Internal server error"));
    await act(async () => { await result.current.editDrugHistoryBlock([DENVAR], [DENVAR_LATER]); });
    expect(result.current.drugHistory).toEqual(STORED);
    const said = told().at(-1);
    expect(said?.title).toBe("The change was not saved.");
    expect(said?.body).not.toContain("Internal server error");
    expect(said?.body).toContain("is as it was");
  });

  it("no answer, but the record HAS the change: kept, and nothing is said", async () => {
    const { result } = await open();
    api.dhReplace.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    api.patientGet.mockImplementation(async (id: string) => patient({ id, drugHistory: [OLD, NAPA, DENVAR_LATER] }));
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.editDrugHistoryBlock([DENVAR], [DENVAR_LATER]); });
    await tick(50);
    expect(ok).toBe(true);
    expect(result.current.drugHistory).toEqual([OLD, NAPA, DENVAR_LATER]);
    expect(tell).not.toHaveBeenCalled();
  });

  it("no answer and the record still holds the old line: it was not saved, and that is said", async () => {
    const { result } = await open();
    api.dhReplace.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.editDrugHistoryBlock([DENVAR], [DENVAR_LATER]); });
    await tick(50);
    expect(ok).toBe(false);
    expect(told().at(-1)?.title).toBe("The change was not saved.");
    expect(result.current.drugHistory).toEqual(STORED);
  });

  it("no answer and the record cannot be read either: it MAY not have been saved — never 'not saved'", async () => {
    const { result } = await open();
    api.dhReplace.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    api.patientGet.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => { await result.current.editDrugHistoryBlock([DENVAR], [DENVAR_LATER]); });
    await tick(50);
    expect(told().at(-1)?.title).toBe("The change may not have been saved.");
  });

  it("a supervising doctor cannot write the owner's record: said, nothing sent", async () => {
    const { result } = await open({ doctorId: "owner-elsewhere" });
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.editDrugHistoryBlock([DENVAR], [DENVAR_LATER]); });
    expect(ok).toBe(false);
    expect(api.dhReplace).not.toHaveBeenCalled();
    expect(told().at(-1)?.title).toBe("The change was not saved.");
  });

  it("goes after a drug-history write already on its way, never before it", async () => {
    const { result } = await open();
    let release = () => {};
    api.dhAppend.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ drugHistory: [...STORED, SECLO] }); }));
    await act(async () => { result.current.addDrugHistoryEntries([SECLO], { toRecord: true }); });
    let done: Promise<boolean> | undefined;
    await act(async () => { done = result.current.editDrugHistoryBlock([DENVAR], [DENVAR_LATER]); });
    expect(api.dhAppend).toHaveBeenCalledTimes(1);
    expect(api.dhReplace).not.toHaveBeenCalled(); // waits its turn
    await act(async () => { release(); await done; });
    expect(api.dhReplace).toHaveBeenCalledTimes(1);
  });

  it("an answer that lands after another patient was opened is not put into that patient's list", async () => {
    const { result } = await open();
    let release = () => {};
    api.dhReplace.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ drugHistory: [OLD, NAPA, DENVAR_LATER] }); }));
    let done: Promise<boolean> | undefined;
    await act(async () => { done = result.current.editDrugHistoryBlock([DENVAR], [DENVAR_LATER]); });
    const other = ["02/11/2026: Tablet. Other 5 mg — 1+0+0 —  — 3 days"];
    api.patientGet.mockImplementation(async (id: string) => patient({ id, drugHistory: id === "Y" ? other : STORED }));
    act(() => result.current.loadPatient(patient({ id: "Y", drugHistory: other })));
    await tick(50);
    await act(async () => { release(); await done; });
    expect(result.current.drugHistory).toEqual(other);
  });
});

describe("addDrugHistoryEntries({ toRecord: true })", () => {
  it("goes to the record at once, before Save & print, by the server's append — and the editor's list takes it once", async () => {
    const { result } = await open();
    await act(async () => { expect(result.current.addDrugHistoryEntries([SECLO], { toRecord: true })).toBe(true); });
    expect(api.dhAppend.mock.calls).toEqual([["X", [SECLO]]]);
    expect(result.current.drugHistory).toEqual([...STORED, SECLO]);
    expect(wholeListWrites()).toHaveLength(0);
  });

  it("without it, before Save & print, a line stays with the visit and nothing is sent (the modal's own add, unchanged)", async () => {
    const { result } = await open();
    await act(async () => { expect(result.current.addDrugHistoryEntries([SECLO])).toBe(true); });
    expect(api.dhAppend).not.toHaveBeenCalled();
    expect(result.current.drugHistory).toEqual([...STORED, SECLO]);
  });

  it("a supervising doctor is told they cannot, in words that fit — the visit is not printed", async () => {
    const { result } = await open({ doctorId: "owner-elsewhere" });
    await act(async () => { expect(result.current.addDrugHistoryEntries([SECLO], { toRecord: true })).toBe(false); });
    expect(api.dhAppend).not.toHaveBeenCalled();
    expect(told().at(-1)?.body).not.toContain("already printed");
  });
});
