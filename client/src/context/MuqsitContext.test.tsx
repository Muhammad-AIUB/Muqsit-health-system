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
// The doctor's saved special advice. ONE array for the whole run of a test, as
// React Query hands out: a fresh array on every call would re-run the mirror for ever.
const savedAdvice = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/hooks/useDrugAdvice", () => ({ useDrugAdvice: () => ({ data: savedAdvice.list, isSuccess: true }) }));

import { MuqsitProvider, useMuqsit } from "./MuqsitContext";
import { drugKeyOf } from "@/lib/rxDrugAdvice";
import { rxDrugHistoryEntries } from "@/lib/rxDrugHistory";
import type { RxItem } from "@/types";

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

// ⚕️ Regression, 2026-10-14 — found in the browser pass of the "Add medicine"
// (Drug history) feature: a line added through `addDrugHistoryEntry` (the
// "+ Add medicine" row), or already restored from an `incompleteRx` draft,
// on a patient whose background `patientsApi.get` was still in flight was
// silently wiped the instant that fetch landed, because its handler used to
// overwrite `drugHistory` with `p.drugHistory` outright. Nothing reconstructs
// such a line afterward — unlike an ℞-mirrored entry, which the mirror effect
// re-derives from `rxItems` on its own. Fixed by merging the fetch's answer
// against whatever is LIVE at the moment it resolves, whichever of the two
// paths put it there, rather than tracking one path specifically.
describe("a manually added Drug-history line survives a slow patient fetch", () => {
  it("is merged into the record's own list, not overwritten by it", async () => {
    const { result } = await setup();
    let resolveFetch!: (p: Patient) => void;
    api.patientGet.mockImplementation(() => new Promise<Patient>((resolve) => { resolveFetch = resolve; }));
    act(() => result.current.loadPatient(patient({ drugHistory: STORED })));
    // The fetch is still in flight — add a brand-new line now, exactly as
    // "+ Add medicine" does.
    const added = "01/01/2000: Tablet. Barcavir 0.5 mg —  —  — ";
    act(() => result.current.addDrugHistoryEntry(added));
    // The fetch now lands, with the record's own (older) drugHistory — it
    // must not discard the line just added while it was in flight.
    await act(async () => { resolveFetch(patient({ drugHistory: STORED })); await Promise.resolve(); });
    expect(result.current.drugHistory).toEqual([...STORED, added]);
  });

  it("does not duplicate the line once the fetch's own record has caught up with it", async () => {
    const { result } = await setup();
    let resolveFetch!: (p: Patient) => void;
    api.patientGet.mockImplementation(() => new Promise<Patient>((resolve) => { resolveFetch = resolve; }));
    act(() => result.current.loadPatient(patient({ drugHistory: STORED })));
    const added = "01/01/2000: Tablet. Barcavir 0.5 mg —  —  — ";
    act(() => result.current.addDrugHistoryEntry(added));
    // This time the save beat the fetch: the record itself already carries it.
    await act(async () => { resolveFetch(patient({ drugHistory: [...STORED, added] })); await Promise.resolve(); });
    expect(result.current.drugHistory).toEqual([...STORED, added]);
  });

  // The exact shape of the browser-caught bug: a reload restores the line
  // from the parked draft (`applyEditorSnapshot`, inside `loadPatient`)
  // synchronously, well before the background record fetch — which still
  // holds the pre-save, older history — resolves.
  it("preserves a line already restored from an incomplete-prescription draft", async () => {
    const { result } = await setup();
    let resolveFetch!: (p: Patient) => void;
    api.patientGet.mockImplementation(() => new Promise<Patient>((resolve) => { resolveFetch = resolve; }));
    const added = "01/01/2000: Tablet. Barcavir 0.5 mg —  —  — ";
    act(() => result.current.loadPatient(patient({
      drugHistory: STORED, // the bare record's own, not-yet-caught-up copy
      incompleteRx: { drugHistory: [...STORED, added] },
    })));
    // Restored synchronously from the draft — before the fetch resolves at all.
    expect(result.current.drugHistory).toEqual([...STORED, added]);
    await act(async () => { resolveFetch(patient({ drugHistory: STORED })); await Promise.resolve(); });
    expect(result.current.drugHistory).toEqual([...STORED, added]);
  });

  // ⚕️ Independent review, 18/10/2026 (older than that day's release). The
  // merge went LINE by line, and a `(cont)` line names no medicine: Clarith's
  // taper, written exactly like Napa's, was taken for one the record already
  // had and dropped. A medicine is merged with its tapers, as one block.
  describe("a medicine and its tapers are merged as one block", () => {
    const TODAY = "18/10/2026";
    const napa: RxItem = { drug: "Tablet. Napa 500 mg", dose: "1+0+1", instruction: "", duration: "5 days" };
    const clarith: RxItem = { drug: "Tablet. Clarith 500 mg", dose: "1+0+1", instruction: "", duration: "7 days" };
    const taper: RxItem = { drug: "", dose: "0+0+1", instruction: "", duration: "7 days", isCont: true };
    const printed = () => rxDrugHistoryEntries([napa, taper], TODAY); // on the record since Save & print
    const live = () => rxDrugHistoryEntries([napa, taper, clarith, taper], TODAY);

    // The review's steps: print Napa with a taper; add Clarith with the same
    // taper text; reload the same day.
    it("Clarith keeps its taper after a reload, and is listed once", async () => {
      vi.setSystemTime(new Date(2026, 9, 18, 12));
      const pt = patient({
        drugHistory: printed(),
        incompleteRx: { ptDate: "2026-10-18", rxItems: [napa, taper, clarith, taper], drugHistory: live(), rxMirrorOwned: live() },
      });
      api.patientGet.mockResolvedValue(pt);
      const { result } = await setup();
      act(() => result.current.loadPatient(pt));
      await tick(50);
      expect(result.current.drugHistory).toEqual(live());
    });

    // The same merge with no ℞ line to re-derive it: Clarith was added by hand
    // ("+ Add medicine"), so nothing would ever put its taper back.
    it("a hand-added medicine's taper is not dropped as the record's", async () => {
      vi.setSystemTime(new Date(2026, 9, 18, 12));
      const pt = patient({
        drugHistory: printed(),
        incompleteRx: { ptDate: "2026-10-18", rxItems: [napa, taper], drugHistory: live(), rxMirrorOwned: printed() },
      });
      api.patientGet.mockResolvedValue(pt);
      const { result } = await setup();
      act(() => result.current.loadPatient(pt));
      await tick(50);
      expect(result.current.drugHistory).toEqual(live());
    });

    it("once the record holds the block, it is not written twice", async () => {
      vi.setSystemTime(new Date(2026, 9, 18, 12));
      const pt = patient({
        drugHistory: live(),
        incompleteRx: { ptDate: "2026-10-18", rxItems: [napa, taper], drugHistory: live(), rxMirrorOwned: printed() },
      });
      api.patientGet.mockResolvedValue(pt);
      const { result } = await setup();
      act(() => result.current.loadPatient(pt));
      await tick(50);
      expect(result.current.drugHistory).toEqual(live());
    });
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

// ⚕️ Third review of the >>> fix (18/10/2026): another patient arriving through
// the device mirror is a new visit, like `resetEditor`'s, and redraws the ℞ pad
// (`editorEpoch` → lib/usePadSync.ts). It did not: a pad holding only lines it
// cannot write kept them on the next patient, whose `rxItems` were [] as well.
describe("a visit received through the mirror redraws the ℞ pad", () => {
  it("another patient moves the editor epoch on; the same patient does not", async () => {
    const { result } = await setup();
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", currentPatientId: "X", rxItems: [] }));
    await tick(50);
    const before = result.current.editorEpoch;
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", currentPatientId: "X", rxItems: [] }));
    await tick(50);
    expect(result.current.editorEpoch).toBe(before);
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", currentPatientId: "Y", rxItems: [] }));
    await tick(50);
    expect(result.current.editorEpoch).not.toBe(before);
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

// ⚕️ The legacy drug picker — an 18-item list kept in the app itself — put a
// medicine on the pad with `1+0+1 · After meal · 5 days` beside it, a dose
// nobody wrote; the static "templates" beside it put whole regimens there
// (`Cap. Amoxicillin 500mg` 1+1+1 for 7 days). No screen could open either;
// the picker's one way left was a snapshot mirrored from another device
// carrying `showDrugPicker: true`. Both are gone (2026-10-14). An older build
// on another device may still send the picker's two keys: they are read by nothing.
describe("the legacy drug picker and the static templates are gone", () => {
  it("the store offers no way to put a medicine on the pad with a dose nobody wrote", async () => {
    const { result } = await setup();
    for (const gone of ["addDrug", "loadTemplate", "filteredDrugs", "showDrugPicker", "setShowDrugPicker", "drugSearch", "setDrugSearch", "activeTemplate"]) {
      expect(result.current, gone).not.toHaveProperty(gone);
    }
  });

  it("a snapshot from an older build that carries the picker's keys is applied — and the keys are read by nothing", async () => {
    const { result } = await setup();
    act(() => result.current.applyMirrorSnapshot({
      workstationId: "doc1", currentPatientId: "X", rxItems: [], chiefComplaints: ["Fever"],
      showDrugPicker: true, drugSearch: "para",
    }));
    await tick(400);
    expect(result.current.chiefComplaints).toEqual(["Fever"]); // the rest of it is applied
    expect(result.current).not.toHaveProperty("showDrugPicker");
  });

  it("the snapshot sent to other devices carries neither of the picker's keys", async () => {
    const { result } = await setup();
    expect(result.current.mirrorSnapshot).not.toHaveProperty("showDrugPicker");
    expect(result.current.mirrorSnapshot).not.toHaveProperty("drugSearch");
  });
});

// ⚕️ Physician's sheet of 15/10/2026, item 4: the advice a doctor saved for a
// FINAL DIAGNOSIS joins the visit's Advice the moment the diagnosis is written,
// after the medicines' advice, and leaves with the diagnosis.
describe("advice saved for a final diagnosis", () => {
  afterEach(() => { savedAdvice.list = []; });

  it("joins Advice when the diagnosis is written, after the medicines' advice, and leaves with it", async () => {
    savedAdvice.list = [
      { id: "d1", scope: "diagnosis", key: "pregnant", label: "Pregnant", lines: ["Take folic acid daily"] },
      { id: "m1", scope: "medicine", key: drugKeyOf("Tablet. Napa 500 mg"), label: "Tablet. Napa 500 mg", lines: ["Take after meal"] },
    ];
    const r = await setup();
    act(() => r.result.current.setAdvice(["Drink plenty of water"]));
    act(() => r.result.current.setFinalDiagnosis(["pregnant"]));
    expect(r.result.current.advice).toEqual(["Drink plenty of water", "Take folic acid daily"]);
    act(() => r.result.current.setRxItems([{ drug: "Tablet. Napa 500 mg", dose: "1+0+1", instruction: "", duration: "5 days" }]));
    expect(r.result.current.advice).toEqual(["Drink plenty of water", "Take after meal", "Take folic acid daily"]);
    act(() => r.result.current.setFinalDiagnosis([]));
    expect(r.result.current.advice).toEqual(["Drink plenty of water", "Take after meal"]);
  });
});

// ⚕️ Physician's sheet, 18/10/2026, item 1: "Drug history hidden default
// thakbe". A new visit starts with the whole Drug-history section OFF the
// printed sheet; the doctor presses ⊘ to print it. The entries are untouched.
describe("Drug history is kept off the printed sheet by default", () => {
  it("starts hidden", async () => {
    const { result } = await setup();
    expect(result.current.hideDrugHistory).toBe(true);
  });

  it("a new visit (patient opened) starts hidden again after the doctor showed it", async () => {
    const { result } = await setup();
    act(() => result.current.setHideDrugHistory(false));
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    expect(result.current.hideDrugHistory).toBe(true);
    expect(result.current.drugHistory).toEqual(STORED);
  });
});

// ⚕️ Independent review, 18/10/2026 — two ways the ℞ → Drug-history mirror
// mis-read whose line was whose.
describe("the ℞ mirror withdraws only what it inserted", () => {
  const TODAY = "18/10/2026";
  const napa: RxItem = { drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "", duration: "5 days" };

  // A line typed by hand into Drug history today, then put on the pad with
  // Move to Rx (which writes the very same text), then taken off the pad: the
  // hand-typed record must still be there.
  it("a hand-typed line survives its twin leaving the pad", async () => {
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    const pt = patient({ drugHistory: [] });
    api.patientGet.mockResolvedValue(pt);
    const { result } = await setup();
    act(() => result.current.loadPatient(pt));
    await tick(50);
    const typed = rxDrugHistoryEntries([napa], TODAY)[0];
    act(() => result.current.addDrugHistoryEntry(typed));
    act(() => result.current.setRxItems([napa]));
    await tick(10);
    expect(result.current.drugHistory).toEqual([typed]);
    act(() => result.current.setRxItems([]));
    await tick(10);
    expect(result.current.drugHistory).toEqual([typed]);
  });

  // A visit parked yesterday and resumed today: its ℞ lines are today's now.
  // Left at yesterday's date, they read as "the previous visit" in Current
  // medications — a visit that was never printed — and pushed the real previous
  // visit out to Distant past.
  it("a draft resumed on a later day re-stamps its own ℞ lines to today", async () => {
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    const realPrevious = "01/10/2026: Tablet. Famotack 20 mg — 1+0+1 — Before meal — 1 month";
    const parked = rxDrugHistoryEntries([napa], "17/10/2026");
    const pt = patient({
      drugHistory: [realPrevious],
      incompleteRx: { ptDate: "2026-10-17", rxItems: [napa], drugHistory: [realPrevious, ...parked] },
    });
    api.patientGet.mockResolvedValue(pt);
    const { result } = await setup();
    act(() => result.current.loadPatient(pt));
    await tick(50);
    expect(result.current.ptDate).toBe("2026-10-18");
    expect(result.current.drugHistory).toEqual([realPrevious, ...rxDrugHistoryEntries([napa], TODAY)]);
  });
});

// ⚕️ Second review, 18/10/2026: what the mirror owns is PART OF THE VISIT. Kept
// in one device's memory, it was lost on a reload and never known to a second,
// mirrored device — which then could not withdraw a line it took off the pad.
// It rides the draft and the device mirror as `rxMirrorOwned`.
describe("what the ℞ mirror owns travels with the visit", () => {
  const TODAY = "18/10/2026";
  const napa: RxItem = { drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "", duration: "5 days" };
  const napaLine = () => rxDrugHistoryEntries([napa], TODAY);

  it("a second device that takes the medicine off the pad withdraws the mirror's line", async () => {
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    const pt = patient({ drugHistory: [] });
    api.patientGet.mockResolvedValue(pt);
    const a = await setup();
    act(() => a.result.current.loadPatient(pt));
    await tick(50);
    act(() => a.result.current.setRxItems([napa]));
    await tick(10);
    expect(a.result.current.drugHistory).toEqual(napaLine());
    const fromA = a.result.current.mirrorSnapshot as unknown as Record<string, unknown>;

    const b = await setup();
    act(() => b.result.current.loadPatient(pt));
    await tick(50);
    act(() => b.result.current.applyMirrorSnapshot(fromA));
    await tick(10);
    expect(b.result.current.drugHistory).toEqual(napaLine());
    act(() => b.result.current.setRxItems([]));
    await tick(10);
    expect(b.result.current.drugHistory).toEqual([]);
  });

  it("after a reload, a hand-typed line is still never the mirror's to withdraw", async () => {
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    const typed = napaLine()[0];
    const pt = patient({
      drugHistory: [],
      incompleteRx: { ptDate: "2026-10-18", rxItems: [napa], drugHistory: [typed], rxMirrorOwned: [] },
    });
    api.patientGet.mockResolvedValue(pt);
    const { result } = await setup();
    act(() => result.current.loadPatient(pt));
    await tick(50);
    act(() => result.current.setRxItems([]));
    await tick(10);
    expect(result.current.drugHistory).toEqual([typed]);
  });

  it("a draft saved before this record existed behaves as it always did", async () => {
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    const pt = patient({
      drugHistory: [],
      incompleteRx: { ptDate: "2026-10-18", rxItems: [napa], drugHistory: napaLine() },
    });
    api.patientGet.mockResolvedValue(pt);
    const { result } = await setup();
    act(() => result.current.loadPatient(pt));
    await tick(50);
    act(() => result.current.setRxItems([]));
    await tick(10);
    expect(result.current.drugHistory).toEqual([]);
  });

  it("is carried in the draft and the device mirror", async () => {
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    const pt = patient({ drugHistory: [] });
    api.patientGet.mockResolvedValue(pt);
    const { result } = await setup();
    act(() => result.current.loadPatient(pt));
    await tick(50);
    act(() => result.current.setRxItems([napa]));
    await tick(10);
    expect((result.current.mirrorSnapshot as unknown as Record<string, unknown>).rxMirrorOwned).toEqual(napaLine());
  });
});

// ⚕️ Release review, 18/10/2026, twice. Print, correct the pad, print again is
// an ordinary visit: what the doctor took off before the second print must not
// stay in the history (the first fix — "owns nothing after Save & print" —
// left it there for good). And a draft resumed on a LATER day must not take
// back out of the history a line its earlier save put on the record.
describe("the ℞ mirror around Save & print", () => {
  const napa: RxItem = { drug: "Tablet. Napa 500 mg", dose: "1+0+1", instruction: "", duration: "5 days" };
  const clarith: RxItem = { drug: "Tablet. Clarith 500 mg", dose: "1+0+1", instruction: "", duration: "7 days" };

  it("print, correct, print again: only what the second print holds stays", async () => {
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    const pt = patient({ drugHistory: [] });
    api.patientGet.mockResolvedValue(pt);
    const { result } = await setup();
    act(() => result.current.loadPatient(pt));
    await tick(50);
    act(() => result.current.setRxItems([napa, clarith]));
    await tick(10);
    await act(async () => { await result.current.savePrescription(); });
    await tick(50);
    const corrected = { ...napa, dose: "1+1+1" };
    act(() => result.current.setRxItems([corrected]));
    await tick(10);
    expect(result.current.drugHistory).toEqual(rxDrugHistoryEntries([corrected], "18/10/2026"));
  });

  it("a draft resumed the next day keeps on the record what its earlier save put there", async () => {
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    const saved = rxDrugHistoryEntries([napa], "17/10/2026");
    const pt = patient({
      drugHistory: saved, // on the record since yesterday's Save & print
      incompleteRx: { ptDate: "2026-10-17", rxItems: [napa], drugHistory: saved, rxMirrorOwned: saved },
    });
    api.patientGet.mockImplementation(never); // the record's own fetch never lands to put it back
    const { result } = await setup();
    act(() => result.current.loadPatient(pt));
    await tick(50);
    expect(result.current.drugHistory).toContain(saved[0]);
  });
});

// ⚕️ Release review, 18/10/2026: a visit printed at 23:58 and mirrored to a
// second device after midnight. The receiving device moved the visit's date to
// today, took the PRINTED line out of Drug history as "the mirror's" and wrote
// it back under today's date; its Save & print then stored only that copy. The
// medicine was kept — its real date was lost.
describe("a visit mirrored to another device across midnight", () => {
  const napa: RxItem = { drug: "Tablet. Napa 500 mg", dose: "1+0+1", instruction: "", duration: "5 days" };

  it("printed before midnight: keeps its date, and the printed line keeps its date", async () => {
    vi.setSystemTime(new Date(2026, 9, 17, 23, 58));
    const pt = patient({ drugHistory: [] });
    api.patientGet.mockResolvedValue(pt);
    const a = await setup();
    act(() => a.result.current.loadPatient(pt));
    await tick(50);
    act(() => a.result.current.setRxItems([napa]));
    await tick(10);
    await act(async () => { await a.result.current.savePrescription(); });
    await tick(50);
    const printed = rxDrugHistoryEntries([napa], "17/10/2026");
    expect(a.result.current.drugHistory).toEqual(printed);
    const fromA = a.result.current.mirrorSnapshot as unknown as Record<string, unknown>;
    const record = patient({ drugHistory: printed }); // on the record since 23:58

    vi.setSystemTime(new Date(2026, 9, 18, 0, 1));
    api.patientGet.mockResolvedValue(record);
    const b = await setup();
    act(() => b.result.current.loadPatient(record));
    await tick(50);
    act(() => b.result.current.applyMirrorSnapshot(fromA));
    await tick(10);
    expect(b.result.current.drugHistory).toEqual(printed);
    expect(b.result.current.ptDate).toBe("2026-10-17");

    // A Save & print from this device stores the line under its real date.
    api.patientUpdate.mockClear();
    await act(async () => { await b.result.current.savePrescription(); });
    await tick(50);
    const writes = api.patientUpdate.mock.calls.map(([, body]) => body as { drugHistory?: string[] });
    expect(writes.find((w) => w.drugHistory)?.drugHistory).toEqual(printed);
  });

  // The guard's own purpose stands: an unfinished visit is today's visit.
  it("not printed: moves to today, its own ℞ lines with it", async () => {
    vi.setSystemTime(new Date(2026, 9, 17, 23, 58));
    const pt = patient({ drugHistory: [] });
    api.patientGet.mockResolvedValue(pt);
    const a = await setup();
    act(() => a.result.current.loadPatient(pt));
    await tick(50);
    act(() => a.result.current.setRxItems([napa]));
    await tick(10);
    const fromA = a.result.current.mirrorSnapshot as unknown as Record<string, unknown>;

    vi.setSystemTime(new Date(2026, 9, 18, 0, 1));
    const b = await setup();
    act(() => b.result.current.loadPatient(pt));
    await tick(50);
    act(() => b.result.current.applyMirrorSnapshot(fromA));
    await tick(10);
    expect(b.result.current.ptDate).toBe("2026-10-18");
    expect(b.result.current.drugHistory).toEqual(rxDrugHistoryEntries([napa], "18/10/2026"));
  });

  // "No patient" and "no completion marker" are not the same patient.
  it("a snapshot with no patient and no completion marker still moves to today", async () => {
    vi.setSystemTime(new Date(2026, 9, 18, 0, 1));
    const { result } = await setup();
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", ptDate: "2026-10-17" }));
    await tick(10);
    expect(result.current.ptDate).toBe("2026-10-18");
  });
});

// ⚕️ Save & print refuses while the ℞ pad has a line it cannot write — a >>>
// line with no medicine directly above it, or a dose with no medicine name —
// rather than print the dose under another medicine, or not at all (physician,
// 18/10/2026: "dangerous bug"). The pad reports the count (RightColumn).
describe("Save & print with a line the ℞ pad cannot write", () => {
  it("is refused, says why, and saves nothing", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => {
      result.current.setRxItems([{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "", duration: "5 days" }]);
      result.current.setRxPadUnwritable(1);
    });
    let ok = true;
    await act(async () => { ok = await result.current.savePrescription(); });
    expect(ok).toBe(false);
    expect(api.rxCreate).not.toHaveBeenCalled();
    expect(result.current.savedMsg).toMatch(/no medicine/i);
  });

  it("saves once the line is put right", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => {
      result.current.setRxItems([{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "", duration: "5 days" }]);
      result.current.setRxPadUnwritable(1);
    });
    act(() => result.current.setRxPadUnwritable(0));
    await act(async () => { await result.current.savePrescription(); });
    expect(api.rxCreate).toHaveBeenCalledTimes(1);
  });
});

// Review, 18/10/2026: two more ways a line that cannot be written reached the
// record, or was lost.
describe("the ℞ items themselves are checked at save", () => {
  it("a >>> line with no medicine above it in the items (an old draft) is refused, never filled with the medicine before", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.setRxItems([
      { drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "", duration: "", isCont: false },
      { drug: "Bed rest", dose: "", instruction: "", duration: "", isNote: true },
      { drug: "", dose: "0+0+1", instruction: "", duration: "", isCont: true },
    ]));
    await act(async () => { await result.current.savePrescription(); });
    expect(api.rxCreate).not.toHaveBeenCalled();
    expect(result.current.savedMsg).toMatch(/no medicine/i);
  });

  it("Save to complete later is refused too — it would clear the pad and lose the line", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => {
      result.current.setRxItems([{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "", duration: "" }]);
      result.current.setRxPadUnwritable(1);
    });
    await tick(1500);
    let ok = true;
    await act(async () => { ok = await result.current.saveDraftNow(); });
    expect(ok).toBe(false);
    expect(result.current.rxItems).toHaveLength(1); // nothing cleared
    expect(result.current.savedMsg).toMatch(/no medicine/i);
  });
});

