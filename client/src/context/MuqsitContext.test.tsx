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
    act(() => { void result.current.saveRxImages(["/u/old.jpg"]); }); // removed while uploading
    act(() => { result.current.appendGalleryImages("rx", "X", ["/u/new.jpg"]); });
    expect(result.current.rxImages).toEqual(["/u/new.jpg", "/u/old.jpg"]);
    expect(api.patientUpdate).toHaveBeenLastCalledWith("X", { prescriptionImages: ["/u/new.jpg", "/u/old.jpg"] });
  });
});

// ── Review pass 2 ──────────────────────────────────────────────────────────
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
const writesOf = (key: string) => api.patientUpdate.mock.calls.filter(([, body]) => key in (body as object));
const never = () => new Promise<Patient>(() => {});

describe("switching patients never carries one record's collections into another (G1)", () => {
  it("clears the previous patient's collections at once, and refuses a whole-value write before hydration", async () => {
    api.patientGet.mockImplementation(async (id: string) =>
      id === "X"
        ? patient({ id, prescriptionImages: ["/u/x.jpg"], investigationSummary: [{ date: "01/01/2026", category: "H", test: "Hb", value: "12" }] } as never)
        : never());
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    expect(result.current.rxImages).toEqual(["/u/x.jpg"]);
    act(() => result.current.loadPatient(patient({ id: "Y", drugHistory: [] })));
    await tick(50);
    expect(result.current.rxImages).toEqual([]);
    expect(result.current.investigationSummary).toEqual([]);
    api.patientUpdate.mockClear();
    let err: unknown = null;
    await act(async () => { await result.current.saveInvestigationSummary([]).catch((e: unknown) => { err = e; }); });
    expect(err).toBeInstanceOf(Error);
    expect(api.patientUpdate).not.toHaveBeenCalled();
  });

  it("files a snapshot onto the STORED gallery when the record is not hydrated", async () => {
    let yCalls = 0;
    api.patientGet.mockImplementation(async (id: string) => {
      if (id === "Y" && yCalls++ < 3) throw new Error("offline"); // the record fetch and its 2 retries
      return patient({ id, prescriptionImages: ["/u/old.jpg"] });
    });
    const { result } = await setup();
    act(() => result.current.loadPatient(patient({ id: "Y" })));
    await tick(5000);
    act(() => result.current.saveRxSnapshot("/u/new.jpg", "k1"));
    await tick(50);
    expect(api.patientUpdate).toHaveBeenLastCalledWith("Y", { prescriptionImages: ["/u/new.jpg", "/u/old.jpg"], lastRxImageKey: "k1" });
  });

  it("retries a failed record fetch quietly", async () => {
    let n = 0;
    api.patientGet.mockImplementation(async (id: string) => {
      if (n++ < 2) throw new Error("flaky");
      return patient({ id, prescriptionImages: ["/u/x.jpg"] });
    });
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(5000);
    expect(result.current.rxImages).toEqual(["/u/x.jpg"]);
  });
});

describe("Save & print before the history has loaded (G2)", () => {
  it("saves the prescription with its findings but never overwrites the stored summaries", async () => {
    api.patientGet.mockImplementation(never); // the record never lands
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => { result.current.setInvestigation(["01/09/2026:Hb:12"]); result.current.setOnExamination(["BP 120/80"]); });
    await act(async () => { await result.current.savePrescription(); });
    await tick(50);
    expect(api.rxCreate).toHaveBeenCalledTimes(1);
    expect(api.rxCreate.mock.calls[0][0].investigation).toEqual(["01/09/2026:Hb:12"]);
    expect(writesOf("investigationSummary")).toHaveLength(0);
    expect(writesOf("onExaminationSummary")).toHaveLength(0);
  });

  it("says so when a history write fails after the prescription saved", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    api.patientUpdate.mockImplementation(async (_id: string, body: object) => {
      if ("investigationSummary" in body) throw new Error("500");
      return {};
    });
    act(() => result.current.setInvestigation(["01/09/2026:Hb:12"]));
    await act(async () => { await result.current.savePrescription(); });
    await tick(50);
    expect(result.current.savedMsg).toMatch(/could not be updated/);
  });
});

describe("a device receiving the mirror does not persist it (G3)", () => {
  it("writes no draft, incompleteRx or OPD flag for applied state until a local edit", async () => {
    const { result } = await setup();
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", currentPatientId: "X", chiefComplaints: ["Fever"] }));
    await tick(3000);
    expect(api.draftSave).not.toHaveBeenCalled();
    expect(incompleteWrites()).toHaveLength(0);
    expect(api.setRxStatus).not.toHaveBeenCalled();

    act(() => { document.dispatchEvent(new KeyboardEvent("keydown")); });
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    expect(api.draftSave).toHaveBeenCalled();
    expect(incompleteWrites()).toHaveLength(1);
  });

  it("carries the completion marker, so a local edit never re-parks a printed visit", async () => {
    const { result } = await setup();
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", currentPatientId: "X", rxCompletedPid: "X", chiefComplaints: ["Fever"] }));
    await tick(500);
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown")); });
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    expect(incompleteWrites()).toHaveLength(0);
    expect(api.setRxStatus).not.toHaveBeenCalled();
  });
});

describe("practice boundaries (G4 / G5)", () => {
  it("ignores a mirror snapshot from another practice, and stamps its own", async () => {
    const { result } = await setup();
    act(() => result.current.applyMirrorSnapshot({ workstationId: "W2", currentPatientId: "X", chiefComplaints: ["Fever"] }));
    await tick(50);
    expect(result.current.currentPatientId).toBeNull();
    expect(result.current.chiefComplaints).toEqual([]);
    expect(result.current.mirrorSnapshot.workstationId).toBe("doc1");
  });

  it("does not restore a reloaded draft whose patient cannot be loaded, and keeps it stored", async () => {
    api.draftGet.mockResolvedValue({ data: { currentPatientId: "X", chiefComplaints: ["Fever"], workstationId: "doc1" } });
    api.patientGet.mockRejectedValue(new Error("403"));
    const { result } = await setup();
    await tick(3000);
    expect(result.current.currentPatientId).toBeNull();
    expect(result.current.chiefComplaints).toEqual([]);
    expect(api.draftSave).not.toHaveBeenCalled();
    expect(incompleteWrites()).toHaveLength(0);
  });

  it("does not restore a draft written in another practice", async () => {
    api.draftGet.mockResolvedValue({ data: { currentPatientId: "X", chiefComplaints: ["Fever"], workstationId: "W2" } });
    const { result } = await setup();
    await tick(3000);
    expect(result.current.chiefComplaints).toEqual([]);
    expect(api.draftSave).not.toHaveBeenCalled();
  });

  it("stamps the practice on the draft it saves", async () => {
    const { result } = await setup();
    act(() => result.current.setChiefComplaints(["Fever"]));
    await tick(1500);
    expect(api.draftSave.mock.calls.at(-1)?.[0]).toMatchObject({ workstationId: "doc1" });
  });
});

describe("a draft that arrives after the doctor opened a patient (G6)", () => {
  it("is dropped instead of overwriting that patient's editor", async () => {
    const d = deferred<{ data: unknown }>();
    api.draftGet.mockReturnValue(d.promise);
    const { result } = await setup();
    act(() => result.current.loadPatient(patient({ id: "Y", name: "Patient Y", drugHistory: [] })));
    await act(async () => {
      d.resolve({ data: { currentPatientId: "X", ptName: "Patient X", chiefComplaints: ["Fever"] } });
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(result.current.currentPatientId).toBe("Y");
    expect(result.current.ptName).toBe("Patient Y");
    expect(result.current.chiefComplaints).toEqual([]);
  });
});

describe("a mirror snapshot during an IPD loan (G7)", () => {
  it("goes into the held OPD copy, never the admission's live fields", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.beginInvBorrow());
    const admission = ["02/09/2026:Creatinine:3.1"];
    act(() => result.current.setInvestigation(admission));
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", currentPatientId: "X", investigation: ["03/09/2026:Hb:11"], invImages: {} }));
    expect(result.current.investigation).toEqual(admission);
    act(() => result.current.endInvBorrow());
    expect(result.current.investigation).toEqual(["03/09/2026:Hb:11"]);
  });
});

describe("the family tree is merged with the stored one (G9)", () => {
  const A = { name: "A", mobile: "", nid: "", sex: "", relation: "Father" };
  const B = { name: "B", mobile: "", nid: "", sex: "", relation: "Son", patientId: "PB" };
  const C = { name: "C", mobile: "", nid: "", sex: "", relation: "Wife" };

  it("keeps a relative the server linked meanwhile, and drops only what was removed here", async () => {
    let stored: unknown[] = [A];
    api.patientGet.mockImplementation(async (id: string) => patient({ id, familyMembers: stored } as never));
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    expect(result.current.familyMembers).toEqual([A]);
    stored = [A, B]; // linkNew appended B on the server
    await act(async () => { await result.current.saveFamilyMembers([A, C]); });
    expect(writesOf("familyMembers").at(-1)?.[1]).toEqual({ familyMembers: [A, C, B] });
    expect(result.current.familyMembers).toEqual([A, C, B]);

    stored = [A, C, B];
    await act(async () => { await result.current.saveFamilyMembers([C, B]); }); // A removed here
    expect(writesOf("familyMembers").at(-1)?.[1]).toEqual({ familyMembers: [C, B] });
  });
});
