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
import { ApiError, type Patient } from "@/lib/api";

const api = vi.hoisted(() => ({
  patientGet: vi.fn(),
  patientUpdate: vi.fn(),
  draftGet: vi.fn(),
  draftSave: vi.fn(),
  setRxStatus: vi.fn(),
  rxCreate: vi.fn(),
  supervisedDraft: vi.fn(),
  activityLog: vi.fn(),
  dhAppend: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    setActiveWorkstationId: () => {},
    patientsApi: { get: api.patientGet, update: api.patientUpdate, create: vi.fn(), setSupervisedDraft: api.supervisedDraft, appendDrugHistory: api.dhAppend },
    prescriptionDraftApi: { get: api.draftGet, save: api.draftSave },
    opdApi: { setRxStatus: api.setRxStatus },
    prescriptionsApi: { create: api.rxCreate },
    activityApi: { log: api.activityLog },
  };
});
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "doc1" } }) }));
// A box the doctor has to read (lib/dialogs.ts). Watched, not drawn: there is
// no DialogHost here, and jsdom has no window.alert to fall back on.
const tell = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/lib/dialogs", async (original) => ({ ...(await original<typeof import("@/lib/dialogs")>()), tell }));
// The doctor's saved special advice. ONE array for the whole run of a test, as
// React Query hands out: a fresh array on every call would re-run the mirror for ever.
const savedAdvice = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/hooks/useDrugAdvice", () => ({ useDrugAdvice: () => ({ data: savedAdvice.list, isSuccess: true }) }));

import { MuqsitProvider, UNWRITABLE_PAD, useMuqsit } from "./MuqsitContext";
import { drugKeyOf } from "@/lib/rxDrugAdvice";
import { rxDrugHistoryEntries } from "@/lib/rxDrugHistory";
import { splitDrugHistory } from "@/lib/drugHistorySplit";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import type { RxItem } from "@/types";
import type { Row } from "@/components/prescription/MedicinePad";

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
/** Save & print, with time let run for the quiet re-sends of a lost answer (`lib/sendAgain.ts`). */
async function pressSave(result: { current: ReturnType<typeof useMuqsit> }): Promise<boolean> {
  let done!: Promise<boolean>;
  await act(async () => {
    done = result.current.savePrescription();
    await vi.advanceTimersByTimeAsync(10_000);
  });
  return done;
}
const incompleteWrites = () => api.patientUpdate.mock.calls.filter(([, body]) => "incompleteRx" in (body as object));
/** Every box raised so far, as it was asked for. */
const told = () => (tell.mock.calls as unknown as [{ title: string; body?: string; tone?: string }][]).map(([r]) => r);

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
// (Drug history) feature: a line added through `addDrugHistoryEntries` (the
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
    act(() => result.current.addDrugHistoryEntries([added]));
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
    act(() => result.current.addDrugHistoryEntries([added]));
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
    // In a box: after Save & print the print sheet covers the line under the
    // buttons, and a line there was never seen. It names only what failed —
    // here the investigation history; the drug history was written. The save
    // itself still is said.
    expect(told()).toEqual([{
      title: "Prescription saved, but the patient's history could not be updated.",
      body: "The investigation history kept in the patient's record was not updated. The prescription itself is saved, with everything written on it.",
      tone: "danger",
    }]);
    expect(result.current.savedMsg).toEqual({ kind: "ok", text: "Prescription saved!" });
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

  it("carries the completion marker, so local work that changes nothing printed never re-parks a printed visit", async () => {
    const { result } = await setup();
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", currentPatientId: "X", rxCompletedPid: "X", chiefComplaints: ["Fever"] }));
    await tick(500);
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown")); });
    act(() => result.current.setDrugHistory([...result.current.drugHistory, "01/01/2026: Tablet. Seclo 20 mg —  —  — "]));
    await tick(1500);
    expect(incompleteWrites()).toHaveLength(0);
    expect(api.setRxStatus).not.toHaveBeenCalled();
    // ⚕️ …while a real change to the printed visit is unprinted work, here as on
    // the device that printed it (19/10/2026: kept, never lost on a switch).
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    expect(incompleteWrites()).toHaveLength(1);
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

// ⚕️ Independent review of ab18cf1 (19/10/2026), older than that change: G6
// dropped a late draft only when the editor had been RESET while it was on its
// way. Another device's state arriving through the mirror moves the editor on
// too, and the draft was written over it — the patient that device had just
// brought, its visit, its held ℞ lines, and its open Investigation box with a
// result half typed (left open, now over the draft's patient).
describe("a draft that arrives after another device's state (G6b)", () => {
  const NAPA: RxItem = { drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "", duration: "5 days" };
  /** What device B sends through the mirror, after it opened patient Y and did `work`. */
  async function fromDeviceB(work: (s: ReturnType<typeof useMuqsit>) => unknown) {
    const b = await setup();
    act(() => b.result.current.loadPatient(patient({ id: "Y", name: "Patient Y", drugHistory: [] })));
    await tick(1500);
    await act(async () => { await work(b.result.current); await vi.advanceTimersByTimeAsync(50); });
    const sent = JSON.parse(JSON.stringify(b.result.current.mirrorSnapshot)) as Record<string, unknown>;
    b.unmount();
    for (const f of [api.draftSave, api.patientUpdate, api.setRxStatus, api.patientGet]) f.mockClear();
    return sent;
  }
  /** Device A reloading: its stored draft still on its way. */
  async function reloading() {
    const d = deferred<{ data: unknown }>();
    api.draftGet.mockReturnValue(d.promise);
    const a = await setup();
    const draftArrives = (data: Record<string, unknown>) =>
      act(async () => { d.resolve({ data }); await vi.advanceTimersByTimeAsync(50); });
    return { ...a, draftArrives };
  }
  /** The stored draft: patient X, as this device left it before the reload. */
  const DRAFT_X = { currentPatientId: "X", workstationId: "doc1", ptName: "Patient X", chiefComplaints: ["Fever"], rxItems: [], rxPadHeld: null };
  /** Every write of this device about `pid`: the draft, the patient's record, the OPD queue. */
  const wroteFor = (pid: string) => [
    ...api.draftSave.mock.calls.filter(([s]) => (s as { currentPatientId?: unknown }).currentPatientId === pid),
    ...api.patientUpdate.mock.calls.filter(([id]) => id === pid),
    ...api.setRxStatus.mock.calls.filter(([o]) => (o as { patientId?: unknown }).patientId === pid),
  ];

  it("is dropped instead of replacing the patient that device brought", async () => {
    const sent = await fromDeviceB((s) => {
      s.setChiefComplaints(["Cough"]);
      s.setRxItems([NAPA]);
      s.setRxPadHeld(redPad());
      s.setShowInvPopup(true);
      s.setInvFormData({ Hb: "11" });
    });
    const a = await reloading();
    act(() => a.result.current.applyMirrorSnapshot(sent));
    await tick(400); // past the mirror's echo guard
    await a.draftArrives(DRAFT_X);
    await tick(3000);
    const s = a.result.current;
    expect(s.currentPatientId).toBe("Y");
    expect(s.ptName).toBe("Patient Y");
    expect(s.chiefComplaints).toEqual(["Cough"]);
    expect(s.rxItems).toEqual([NAPA]);
    expect(s.rxPadHeld).toEqual(redPad());
    // The Investigation box stays Y's, with Y's half-typed result in it.
    expect(s.showInvPopup).toBe(true);
    expect(s.invFormData).toEqual({ Hb: "11" });
    // …and nothing of the old draft is written from here.
    expect(wroteFor("X")).toEqual([]);
  });

  it("is dropped when that state arrives while the draft's own patient is being fetched", async () => {
    const sent = await fromDeviceB((s) => s.setChiefComplaints(["Cough"]));
    const x = deferred<Patient>();
    api.patientGet.mockImplementation((id: string) => (id === "X" ? x.promise : Promise.resolve(patient({ id, name: "Patient Y", drugHistory: [] }))));
    const a = await reloading();
    await a.draftArrives(DRAFT_X); // the draft is here; its patient is not yet
    act(() => a.result.current.applyMirrorSnapshot(sent));
    await act(async () => { x.resolve(patient()); await vi.advanceTimersByTimeAsync(50); });
    expect(a.result.current.currentPatientId).toBe("Y");
    expect(a.result.current.chiefComplaints).toEqual(["Cough"]);
  });

  // The same patient: the draft is that device's own earlier save of it, and
  // put back it took back what was typed there since.
  it("is dropped for the same patient too: what arrived is the newer", async () => {
    const sent = await fromDeviceB((s) => s.setChiefComplaints(["Fever", "Cough"]));
    const a = await reloading();
    act(() => a.result.current.applyMirrorSnapshot(sent));
    await tick(400);
    await a.draftArrives({ ...DRAFT_X, currentPatientId: "Y", ptName: "Patient Y" });
    expect(a.result.current.currentPatientId).toBe("Y");
    expect(a.result.current.chiefComplaints).toEqual(["Fever", "Cough"]);
  });

  // No patient: device B saved its visit for later and its editor is empty. The
  // draft, read before that, would put the visit back here — unprinted, parked
  // again and flagged "Incomplete" from this device, while B shows nothing.
  it("is dropped when that device's editor is empty — its visit saved for later", async () => {
    const b = await setup();
    act(() => b.result.current.loadPatient(patient({ id: "Y", name: "Patient Y", drugHistory: [] })));
    await tick(1500);
    act(() => b.result.current.setChiefComplaints(["Cough"]));
    await tick(1500);
    await act(async () => { await b.result.current.saveDraftNow(); });
    await tick(50);
    const cleared = JSON.parse(JSON.stringify(b.result.current.mirrorSnapshot)) as Record<string, unknown>;
    b.unmount();
    for (const f of [api.draftSave, api.patientUpdate, api.setRxStatus, api.patientGet]) f.mockClear();
    expect(cleared.currentPatientId).toBeNull();
    const a = await reloading();
    act(() => a.result.current.applyMirrorSnapshot(cleared));
    await tick(400);
    await a.draftArrives({ ...DRAFT_X, currentPatientId: "Y", ptName: "Patient Y", chiefComplaints: ["Cough"] });
    await tick(3000);
    expect(a.result.current.currentPatientId).toBeNull();
    expect(a.result.current.chiefComplaints).toEqual([]);
    expect(wroteFor("Y")).toEqual([]);
  });

  it("a state refused as another practice's moves nothing on: the draft is restored", async () => {
    const a = await reloading();
    act(() => a.result.current.applyMirrorSnapshot({ workstationId: "W2", currentPatientId: "Q", chiefComplaints: ["Elsewhere"] }));
    await tick(400);
    await a.draftArrives(DRAFT_X);
    expect(a.result.current.currentPatientId).toBe("X");
    expect(a.result.current.chiefComplaints).toEqual(["Fever"]);
  });

  // G3 holds here as it does when the state arrives after the draft: what
  // arrived is that device's to persist, until something is done on this one.
  it("what arrived is not written from here until a local edit", async () => {
    const sent = await fromDeviceB((s) => s.setChiefComplaints(["Cough"]));
    const y = deferred<Patient>();
    api.patientGet.mockImplementation((id: string) => (id === "Y" ? y.promise : Promise.resolve(patient({ id }))));
    const a = await reloading();
    act(() => a.result.current.applyMirrorSnapshot(sent));
    await tick(400);
    await a.draftArrives(DRAFT_X);
    // Y's record lands after the draft, holding a line the state that arrived
    // did not: a change here that nobody typed.
    const later = "02/01/2026: Tablet. Seclo 20 mg — 1+0+0 — Before meal — 30 days";
    await act(async () => { y.resolve(patient({ id: "Y", name: "Patient Y", drugHistory: [...STORED, later] })); await vi.advanceTimersByTimeAsync(50); });
    expect(a.result.current.drugHistory).toContain(later);
    await tick(3000);
    expect(api.draftSave).not.toHaveBeenCalled();
    expect(incompleteWrites()).toHaveLength(0);
    expect(api.setRxStatus).not.toHaveBeenCalled();
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown")); });
    act(() => a.result.current.setChiefComplaints(["Cough", "Fever"]));
    await tick(1500);
    expect(wroteFor("Y").length).toBeGreaterThan(0);
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
    act(() => result.current.addDrugHistoryEntries([typed]));
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
// 18/10/2026: "dangerous bug"). The pad holds its rows while such a line is on
// it (`rxPadHeld`, lib/rxPadHold.ts), and the count is read from the hold.
const redPad = (): Row[] => [
  { drug: "Tablet. Napa 500 mg", dose: "1+1+1", food: "", duration: "5 days", checked: true, isMedicine: true, continuation: false },
  { drug: "", dose: "1+0+1", food: "", duration: "", checked: true, isMedicine: true, continuation: false },
  { drug: "", dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false },
];
describe("Save & print with a line the ℞ pad cannot write", () => {
  it("is refused, says why, and saves nothing", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => {
      result.current.setRxItems([{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "", duration: "5 days" }]);
      result.current.setRxPadHeld(redPad());
    });
    let ok = true;
    await act(async () => { ok = await result.current.savePrescription(); });
    expect(ok).toBe(false);
    expect(api.rxCreate).not.toHaveBeenCalled();
    expect(told()).toEqual([{ title: "The prescription was not saved.", body: UNWRITABLE_PAD, tone: "danger" }]);
    expect(result.current.savedMsg).toBeNull();
  });

  it("saves once the line is put right", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => {
      result.current.setRxItems([{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "", duration: "5 days" }]);
      result.current.setRxPadHeld(redPad());
    });
    act(() => result.current.setRxPadHeld(null));
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
    expect(told()).toEqual([{ title: "The prescription was not saved.", body: UNWRITABLE_PAD, tone: "danger" }]);
  });

  it("Save to complete later is refused too, and nothing is cleared", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => {
      result.current.setRxItems([{ drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "", duration: "" }]);
      result.current.setRxPadHeld(redPad());
    });
    await tick(1500);
    let ok = true;
    await act(async () => { ok = await result.current.saveDraftNow(); });
    expect(ok).toBe(false);
    expect(result.current.rxItems).toHaveLength(1); // nothing cleared
    expect(told()).toEqual([{ title: "The visit was not saved for later.", body: UNWRITABLE_PAD, tone: "danger" }]);
  });
});

// ⚕️ The line under the Save buttons was drawn in the "saved" green for every
// message, failures included, and two of them ended "Is the API running?" — a
// question a doctor cannot answer about a server they cannot start (release
// review, 18/10/2026). The line now carries its KIND with its words, and a
// save that did not happen is never that line: it is a box the doctor has to
// read, saying what did not happen and what they can check.
describe("what the Save buttons say", () => {
  const NAPA_LINE: RxItem = { drug: "Tablet. Napa 500 mg", dose: "1+0+1", instruction: "", duration: "5 days" };
  async function opened() {
    const r = await setup();
    act(() => r.result.current.loadPatient(patient()));
    await tick(50);
    act(() => r.result.current.setRxItems([NAPA_LINE]));
    return r;
  }

  it("a saved prescription is said on the line, as done (ok)", async () => {
    const { result } = await opened();
    await act(async () => { await result.current.savePrescription(); });
    expect(result.current.savedMsg).toEqual({ kind: "ok", text: "Prescription saved!" });
    expect(tell).not.toHaveBeenCalled();
  });

  it("an empty form is refused on the line, as a warning (warn), and nothing is saved", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    await act(async () => { await result.current.savePrescription(); });
    expect(api.rxCreate).not.toHaveBeenCalled();
    expect(result.current.savedMsg).toEqual({ kind: "warn", text: "Add a medicine or some clinical detail before saving." });
    expect(tell).not.toHaveBeenCalled();
  });

  // The client cannot tell a request that never left from one whose answer was
  // lost after the server stored it: it sends the same request again a few
  // times (`lib/sendAgain.ts`), and when no answer comes, says what it knows.
  it("a save with no answer is sent again, then said in a box in the doctor's words — 'may not have been saved', never 'the API'", async () => {
    api.rxCreate.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = await opened();
    const ok = await pressSave(result);
    expect(ok).toBe(false);
    expect(api.rxCreate).toHaveBeenCalledTimes(4);
    expect(told()).toEqual([{
      title: "The prescription may not have been saved.",
      body: "Check your internet connection and try again. It may have reached the record all the same: if you press Save & print again within half an hour without changing anything, it will not be filed twice. Everything you wrote is still here.",
      tone: "danger",
    }]);
    expect(result.current.savedMsg).toBeNull();
    expect(result.current.rxItems).toEqual([NAPA_LINE]);
    await tick(10_000);
    expect(JSON.stringify([told(), result.current.savedMsg])).not.toMatch(/\bAPI\b|running|Failed to fetch/);
  });

  it("a refusal the server words for a person is shown as written", async () => {
    api.rxCreate.mockRejectedValue(new ApiError(403, "You do not have permission to save prescriptions"));
    const { result } = await opened();
    await act(async () => { await result.current.savePrescription(); });
    expect(told()).toEqual([expect.objectContaining({
      title: "The prescription was not saved.",
      body: "You do not have permission to save prescriptions. Everything you wrote is still here.",
    })]);
  });

  it("the framework's words are not shown: a server error says the server could not save it", async () => {
    api.rxCreate.mockRejectedValue(new ApiError(500, "Internal server error"));
    const { result } = await opened();
    await act(async () => { await result.current.savePrescription(); });
    expect(told()).toEqual([expect.objectContaining({
      title: "The prescription was not saved.",
      body: "The server could not save it just now. Please try again in a moment. Everything you wrote is still here.",
    })]);
    // An answer of the server's own says what happened: it is not sent again.
    expect(api.rxCreate).toHaveBeenCalledTimes(1);
  });

  // ⚕️ A Save & print the server STORED, whose answer was lost on the way back,
  // was said as "not saved" — the visit left "Incomplete" with a prescription on
  // the record, and a doctor who changed a word before pressing again filed it
  // twice. The very same request is sent again; the server answers it with the
  // one on record (`repeat: true`, server/src/prescriptions/repeat.ts).
  it("a save whose answer was lost is sent again — the very same request — and the one on record is taken as saved", async () => {
    api.rxCreate
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new ApiError(504, "Request failed (504)"))
      .mockResolvedValueOnce({ id: "rx1", repeat: true });
    const { result } = await opened();
    let done!: Promise<boolean>;
    act(() => { done = result.current.savePrescription(); });
    await tick(1000 + 2000); // the first two waits of `sendAgain.ts`
    expect(await done).toBe(true);
    expect(api.rxCreate).toHaveBeenCalledTimes(3);
    const [[first], [second], [third]] = api.rxCreate.mock.calls;
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(tell).not.toHaveBeenCalled();
    expect(result.current.savedMsg).toEqual({ kind: "ok", text: "Prescription saved!" });
    // …and the visit is complete, as for any saved prescription.
    expect(api.patientUpdate).toHaveBeenCalledWith("X", { incompleteRx: null });
    expect(api.setRxStatus).toHaveBeenCalledWith(expect.objectContaining({ patientId: "X", rxStatus: "complete" }));
  });

  it("an answer lost on every try: pressed again, unchanged, it is the one on record — the visit completes once", async () => {
    api.rxCreate.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = await opened();
    expect(await pressSave(result)).toBe(false);
    expect(told().map((t) => t.title)).toEqual(["The prescription may not have been saved."]);
    expect(api.setRxStatus).not.toHaveBeenCalledWith(expect.objectContaining({ rxStatus: "complete" }));
    const sent = api.rxCreate.mock.calls[0][0];
    api.rxCreate.mockReset();
    api.rxCreate.mockResolvedValue({ id: "rx1", repeat: true });
    expect(await pressSave(result)).toBe(true);
    expect(api.rxCreate).toHaveBeenCalledTimes(1);
    expect(api.rxCreate.mock.calls[0][0]).toEqual(sent);
    expect(told()).toHaveLength(1);
    expect(api.setRxStatus).toHaveBeenCalledWith(expect.objectContaining({ patientId: "X", rxStatus: "complete" }));
  });

  // A throw AFTER the prescription was created used to reach the same catch and
  // say "Save failed" of a visit that is on the record — the doctor presses
  // again, and the server stores a second prescription. And the visit must be
  // marked complete all the same: left "Incomplete", with the saved visit as
  // its draft, it is resumed and filed a second time (review, 18/10/2026).
  it("never says 'not saved' of a saved prescription when what came after it threw — and still completes the visit", async () => {
    const { result } = await opened();
    api.patientUpdate.mockImplementation((_id: string, body: object) => {
      if ("investigationSummary" in body) throw new Error("thrown, not rejected");
      return Promise.resolve({});
    });
    act(() => result.current.setInvestigation(["01/09/2026:Hb:12"]));
    let ok = false;
    await act(async () => { ok = await result.current.savePrescription(); });
    expect(ok).toBe(true);
    expect(api.rxCreate).toHaveBeenCalledTimes(1);
    expect(told()).toEqual([{
      title: "Prescription saved, but the patient's history could not be updated.",
      body: "The patient's record may not have been brought up to date with this visit. The prescription itself is saved, with everything written on it.",
      tone: "danger",
    }]);
    expect(result.current.savedMsg).toEqual({ kind: "ok", text: "Prescription saved!" });
    expect(api.patientUpdate).toHaveBeenCalledWith("X", { incompleteRx: null });
    expect(api.setRxStatus).toHaveBeenCalledWith(expect.objectContaining({ patientId: "X", rxStatus: "complete" }));
    // …and the visit is printed: a save after it that changes nothing written
    // does not park it again (a CHANGE to it would — unprinted work, 19/10/2026).
    api.patientUpdate.mockClear();
    act(() => result.current.setDrugHistory([...result.current.drugHistory, "01/01/2026: Tablet. Seclo 20 mg —  —  — "]));
    await tick(1500);
    expect(incompleteWrites()).toHaveLength(0);
  });

  it("a stored draft is said on the line, as done (ok)", async () => {
    const { result } = await opened();
    await tick(1500);
    await act(async () => { await result.current.saveDraftNow(); });
    expect(result.current.savedMsg).toEqual({ kind: "ok", text: "Draft saved — you can complete it later." });
    expect(tell).not.toHaveBeenCalled();
  });

  it("a draft that was not stored is a box too, and the editor is left exactly as it was", async () => {
    const { result } = await opened();
    await tick(1500);
    api.draftSave.mockRejectedValue(new TypeError("Failed to fetch"));
    let ok = true;
    await act(async () => { ok = await result.current.saveDraftNow(); });
    expect(ok).toBe(false);
    expect(told()).toEqual([{
      title: "The visit was not saved for later.",
      body: "Check your internet connection and try again. Everything you wrote is still here.",
      tone: "danger",
    }]);
    expect(result.current.savedMsg).toBeNull();
    expect(result.current.rxItems).toEqual([NAPA_LINE]);
    expect(result.current.currentPatientId).toBe("X");
  });

  // The timers were one per message and cleared whatever was on the line when
  // they ran: the warning's three seconds took "Prescription saved!" off one
  // second after it appeared.
  it("each line goes after its own time — an earlier line's timer does not take a later one off", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    await act(async () => { await result.current.savePrescription(); }); // empty → the warning, 3 s
    await tick(2000);
    act(() => result.current.setRxItems([NAPA_LINE]));
    await act(async () => { await result.current.savePrescription(); }); // saved, 3 s
    await tick(1500); // 3.5 s after the warning, 1.5 s after the save
    expect(result.current.savedMsg).toEqual({ kind: "ok", text: "Prescription saved!" });
    await tick(2000);
    expect(result.current.savedMsg).toBeNull();
  });
});

// ⚕️ Nothing typed is lost on a reload or a patient switch (physician,
// 19/10/2026: "If every saved data is gone after reloads that is not perfect
// for this app"). Three holes, each closed here:
//   • a visit PRINTED before a reload read as unprinted after it — parked again
//     and put back to "Incomplete" in OPD, ready to be filed a second time;
//   • a change made AFTER Save & print was parked nowhere: another patient
//     opened, and it was gone;
//   • a SUPERVISING doctor's visit was kept only in their one-slot editor draft,
//     which a reload threw away on purpose and another patient overwrote.
const OTHER_PRACTICE = "owner2";
const BEX = { drug: "Tablet. Bex 1 mg", dose: "1+0+0", duration: "", instruction: "", isCont: false };
const SECLO = "01/01/2000: Tablet. Seclo 20 mg —  —  — ";
// Every whole-list write of a patient's drug history, in order.
const dhWrites = (pid = "X") => api.patientUpdate.mock.calls
  .filter(([id, b]) => id === pid && "drugHistory" in (b as object))
  .map(([, b]) => (b as { drugHistory: string[] }).drugHistory);
const typeAndPrint = async (r: Awaited<ReturnType<typeof setup>>["result"], p = patient()) => {
  act(() => r.current.loadPatient(p));
  await tick(50);
  act(() => r.current.setChiefComplaints(["Fever"]));
  await tick(1500);
  await act(async () => { await r.current.savePrescription(); });
  await tick(50);
};

describe("a printed visit stays printed through a reload", () => {
  it("the draft saved after Save & print carries the printed mark", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    act(() => result.current.setDrugHistory([...result.current.drugHistory])); // any save after the print
    await tick(1500);
    expect(api.draftSave.mock.calls.at(-1)?.[0]).toMatchObject({ rxCompletedPid: "X" });
  });

  it("restored after a reload, it is not parked again, nor put back to Incomplete", async () => {
    api.draftGet.mockResolvedValue({ data: { currentPatientId: "X", chiefComplaints: ["Fever"], workstationId: "doc1", rxCompletedPid: "X" } });
    const { result } = await setup();
    await tick(50);
    expect(result.current.currentPatientId).toBe("X");
    act(() => result.current.setDrugHistory([...result.current.drugHistory])); // the record's history landing
    await tick(3000);
    expect(incompleteWrites()).toHaveLength(0);
    expect(api.setRxStatus).not.toHaveBeenCalled();
  });

  it("a change parked before the reload and undone at once after it: the parked copy is taken back", async () => {
    const a = await setup();
    await typeAndPrint(a.result);
    act(() => a.result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    expect(incompleteWrites().at(-1)?.[1]).toMatchObject({ incompleteRx: expect.objectContaining({ chiefComplaints: ["Fever", "Cough"] }) });
    const draft = api.draftSave.mock.calls.at(-1)?.[0];
    a.unmount();
    api.draftGet.mockResolvedValue({ data: draft });
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    const b = await setup();
    await tick(50);
    expect(b.result.current.chiefComplaints).toEqual(["Fever", "Cough"]);
    act(() => b.result.current.setChiefComplaints(["Fever"])); // inside the auto-save's wait
    await tick(1500);
    expect(incompleteWrites().at(-1)?.[1]).toEqual({ incompleteRx: null });
    expect(api.setRxStatus).toHaveBeenLastCalledWith(expect.objectContaining({ patientId: "X", rxStatus: "complete" }));
  });
});

describe("a change made after Save & print is not lost", () => {
  it("is parked like any unprinted work, and the visit is Incomplete again", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    expect(incompleteWrites().at(-1)?.[1]).toMatchObject({ incompleteRx: expect.objectContaining({ chiefComplaints: ["Fever", "Cough"] }) });
    expect(api.setRxStatus).toHaveBeenCalledWith(expect.objectContaining({ patientId: "X", rxStatus: "incomplete" }));
    // and a reload after it reads as unprinted: the draft says what was SENT,
    // and the changed visit it carries is not that
    expect(api.draftSave.mock.calls.at(-1)?.[0]).toMatchObject({ rxCompletedPid: "X", rxPrintedSig: expect.any(String) });
  });

  it("a switch to another patient right after the change still parks it", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    api.patientUpdate.mockClear();
    act(() => result.current.setNote(["Review in a week"]));
    await tick(100); // inside the auto-save's wait
    act(() => result.current.loadPatient(patient({ id: "Y" })));
    expect(incompleteWrites().some(([pid, body]) => pid === "X" && (body as { incompleteRx: { note?: string[] } }).incompleteRx?.note?.[0] === "Review in a week")).toBe(true);
  });

  it("nothing the doctor changed parks nothing — not a drug history the record brings in", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    act(() => result.current.setDrugHistory([...result.current.drugHistory, "01/01/2026: Tablet. Seclo 20 mg —  —  — "]));
    await tick(3000);
    expect(incompleteWrites()).toHaveLength(0);
    expect(api.setRxStatus).not.toHaveBeenCalled();
  });
});

describe("a supervising doctor's unprinted visit is kept", () => {
  const supervised = (over: Partial<Patient> = {}) => patient({ id: "S", doctorId: OTHER_PRACTICE, ...over });

  it("comes back after a reload — written only to the practice's own place, never the owner's record or queue", async () => {
    api.draftGet.mockResolvedValue({ data: { currentPatientId: "S", chiefComplaints: ["Fever"], workstationId: "doc1" } });
    api.patientGet.mockImplementation(async (id: string) => supervised({ id }));
    const { result } = await setup();
    await tick(50);
    expect(result.current.currentPatientId).toBe("S");
    expect(result.current.chiefComplaints).toEqual(["Fever"]);
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    expect(incompleteWrites()).toHaveLength(0);
    expect(api.setRxStatus).not.toHaveBeenCalled();
    expect(api.supervisedDraft).toHaveBeenLastCalledWith("S", expect.objectContaining({ chiefComplaints: ["Fever", "Cough"] }));
  });

  it("opens with the patient: the practice's own parked visit, as the server gives it", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(supervised({ incompleteRx: { currentPatientId: "S", chiefComplaints: ["Fever"], workstationId: "doc1" } })));
    await tick(50);
    expect(result.current.chiefComplaints).toEqual(["Fever"]);
  });

  it("never opens a parked visit written in another practice — the owner's, should one ever arrive", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(supervised({ incompleteRx: { currentPatientId: "S", chiefComplaints: ["Owner's"], workstationId: OTHER_PRACTICE } })));
    await tick(50);
    expect(result.current.chiefComplaints).toEqual([]);
    act(() => result.current.loadPatient(supervised({ id: "S2", incompleteRx: { currentPatientId: "S2", chiefComplaints: ["No practice said"] } })));
    await tick(50);
    expect(result.current.chiefComplaints).toEqual([]);
  });

  it("a reloaded draft that does not say where it was written reloads the patient fresh, as before", async () => {
    api.draftGet.mockResolvedValue({ data: { currentPatientId: "S", chiefComplaints: ["Fever"] } });
    api.patientGet.mockImplementation(async (id: string) => supervised({ id }));
    const { result } = await setup();
    await tick(50);
    expect(result.current.currentPatientId).toBe("S");
    expect(result.current.chiefComplaints).toEqual([]);
  });

  it("another patient opened right after a change keeps it", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(supervised()));
    await tick(50);
    act(() => result.current.setChiefComplaints(["Fever"]));
    await tick(100); // inside the auto-save's wait
    act(() => result.current.loadPatient(patient({ id: "Y" })));
    expect(api.supervisedDraft).toHaveBeenCalledWith("S", expect.objectContaining({ chiefComplaints: ["Fever"] }));
    expect(incompleteWrites().filter(([pid]) => pid === "S")).toHaveLength(0);
  });

  it("Save & print takes it away — the visit is on the record", async () => {
    const { result } = await setup();
    await typeAndPrint(result, supervised());
    expect(api.supervisedDraft).toHaveBeenLastCalledWith("S", null);
    expect(incompleteWrites().filter(([pid]) => pid === "S")).toHaveLength(0);
  });

  it("Save to complete later parks it, and only then clears the editor", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(supervised()));
    await tick(50);
    act(() => result.current.setChiefComplaints(["Fever"]));
    await act(async () => { await result.current.saveDraftNow(); });
    expect(api.supervisedDraft).toHaveBeenCalledWith("S", expect.objectContaining({ chiefComplaints: ["Fever"] }));
    expect(result.current.chiefComplaints).toEqual([]);
  });

  it("a failed park is not called saved: Save to complete later keeps the editor", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(supervised()));
    await tick(50);
    act(() => result.current.setChiefComplaints(["Fever"]));
    api.supervisedDraft.mockRejectedValue(new Error("offline"));
    await act(async () => { await result.current.saveDraftNow(); });
    expect(result.current.chiefComplaints).toEqual(["Fever"]);
  });
});

// ⚕️ Review of the above (19/10/2026): "printed" was a one-way latch. Anything
// that moved the editor off what was printed for a moment — an IPD admission's
// findings on loan, the records' "+ Add" box, a letter typed and deleted — put
// a printed patient back to "Incomplete" for good, their printed visit parked
// to be printed (and, after half an hour, filed) again. A visit is printed while
// what it says IS what was sent, read off the OPD editor's own findings.
describe("printed means: what the visit says is what was sent", () => {
  const noReparking = () => {
    expect(incompleteWrites()).toHaveLength(0);
    expect(api.setRxStatus).not.toHaveBeenCalledWith(expect.objectContaining({ rxStatus: "incomplete" }));
  };
  const printedThenQuiet = async () => {
    const r = await setup();
    await typeAndPrint(r.result);
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    return r;
  };

  it("lent to an IPD admission's detail and given back, it is still printed", async () => {
    const { result } = await printedThenQuiet();
    act(() => result.current.beginInvBorrow());
    act(() => result.current.setInvestigation(["01/10/2026:Hb:9"]));
    await tick(1500);
    act(() => result.current.endInvBorrow());
    await tick(3000);
    noReparking();
  });

  it("the records' + Add box (summary mode) neither parks it nor files its finding into the visit's draft", async () => {
    const { result } = await printedThenQuiet();
    act(() => result.current.openInvForSummary());
    act(() => result.current.setInvestigation((prev) => [...prev, "01/10/2026:Hb:9"]));
    await tick(1500);
    noReparking();
    expect(JSON.stringify(api.draftSave.mock.calls.at(-1)?.[0] ?? {})).not.toContain("01/10/2026:Hb:9");
    act(() => result.current.setShowInvPopup(false));
    await tick(3000);
    noReparking();
  });

  it("a letter typed and taken back again changes nothing", async () => {
    const { result } = await printedThenQuiet();
    act(() => result.current.setChiefComplaints(["Fever", "x"]));
    await tick(100);
    act(() => result.current.setChiefComplaints(["Fever"]));
    await tick(3000);
    noReparking();
  });

  it("a change parked and then undone is printed again: the parked copy goes, and OPD says complete", async () => {
    const { result } = await printedThenQuiet();
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    expect(incompleteWrites()).toHaveLength(1);
    act(() => result.current.setChiefComplaints(["Fever"]));
    await tick(1500);
    expect(incompleteWrites().at(-1)?.[1]).toEqual({ incompleteRx: null });
    expect(api.setRxStatus).toHaveBeenLastCalledWith(expect.objectContaining({ patientId: "X", rxStatus: "complete" }));
  });

  it("what is typed while Save & print is on its way is not printed: it is parked", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.setChiefComplaints(["Fever"]));
    await tick(1500);
    let land!: (v: unknown) => void;
    api.rxCreate.mockImplementation(() => new Promise((r) => { land = r; }));
    let saving!: Promise<boolean>;
    act(() => { saving = result.current.savePrescription(); });
    act(() => result.current.setNote(["Typed while saving"]));
    await act(async () => { land({}); await saving; });
    api.patientUpdate.mockClear();
    await tick(1500);
    expect(incompleteWrites().some(([, body]) => JSON.stringify(body).includes("Typed while saving"))).toBe(true);
  });

  it("read back after a reload with its keys in another order, it is still printed", async () => {
    const first = await setup();
    act(() => first.result.current.loadPatient(patient()));
    await tick(50);
    act(() => first.result.current.setRxItems([{ drug: "Tablet. Napa 500 mg", dose: "1+0+1", duration: "5 days", instruction: "After meal", isCont: false }]));
    await tick(1500);
    await act(async () => { await first.result.current.savePrescription(); });
    act(() => first.result.current.setDrugHistory([...first.result.current.drugHistory]));
    await tick(1500);
    const stored = api.draftSave.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(typeof stored.rxPrintedSig).toBe("string");
    const reorder = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).reverse());
    const reloaded = reorder({ ...stored, rxItems: (stored.rxItems as Record<string, unknown>[]).map(reorder) });
    first.unmount();
    api.draftGet.mockResolvedValue({ data: reloaded });
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    const second = await setup();
    await tick(50);
    act(() => second.result.current.setDrugHistory([...second.result.current.drugHistory]));
    await tick(3000);
    noReparking();
  });

  it("the same prescription answered by the server as a repeat writes its audit lines once", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.setRxItems([{ drug: "Tablet. Napa 500 mg", dose: "1+0+1", duration: "5 days", instruction: "", isCont: false, fromHabit: true }]));
    await tick(50);
    await act(async () => { await result.current.savePrescription(); });
    const habitLines = () => api.activityLog.mock.calls.filter(([e]) => (e as { section: string }).section === "Prescribing habits");
    expect(habitLines()).toHaveLength(1);
    api.rxCreate.mockResolvedValue({ repeat: true });
    await act(async () => { await result.current.savePrescription(); });
    expect(habitLines()).toHaveLength(1);
  });
});

// ⚕️ Third review (19/10/2026). What was sent was kept as the visit's own TEXT,
// and nothing but opening a patient cleared it: a fresh visit ("New
// Prescription", "+ New patient") then parked the printed patient's diagnosis
// and medicines inside the next patient's record — across practices too. And
// "changed after printing" lived in one device's memory.
describe("a printed visit and the next one", () => {
  it("a fresh visit after a print is not printed — also for the same patient (resetEditor)", async () => {
    const { result } = await setup();
    await typeAndPrint(result, patient({ id: "X" }));
    act(() => result.current.resetEditor());
    act(() => result.current.setCurrentPatientId("X"));
    act(() => result.current.setChiefComplaints(["Next visit"]));
    await tick(1500);
    const x = incompleteWrites().filter(([pid]) => pid === "X").map(([, b]) => JSON.stringify(b));
    expect(x.at(-1)).toContain("Next visit");
    expect(x.at(-1)).not.toContain("Fever");
    expect(x.at(-1)).toContain('"rxCompletedPid":null');
    expect(x.at(-1)).toContain('"rxPrintedSig":null');
  });

  it("the print mark rides only its own patient's draft and parked copy", async () => {
    const { result } = await setup();
    await typeAndPrint(result, patient({ id: "X" }));
    act(() => result.current.setCurrentPatientId("Z")); // no fresh visit in between
    act(() => result.current.setChiefComplaints(["Z's visit"]));
    await tick(1500);
    const z = incompleteWrites().filter(([pid]) => pid === "Z").map(([, b]) => JSON.stringify(b));
    expect(z.length).toBeGreaterThan(0);
    for (const body of z) {
      expect(body).toContain('"rxCompletedPid":null');
      expect(body).toContain('"rxPrintedSig":null');
    }
    expect(JSON.stringify(api.draftSave.mock.calls.at(-1)?.[0])).toContain('"rxCompletedPid":null');
  });

  it("what was sent is kept as a fingerprint, never as the visit's text", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    act(() => result.current.setDrugHistory([...result.current.drugHistory]));
    await tick(1500);
    const sig = (api.draftSave.mock.calls.at(-1)?.[0] as { rxPrintedSig: string }).rxPrintedSig;
    expect(typeof sig).toBe("string");
    expect(sig.length).toBeLessThan(40);
    expect(sig).not.toContain("Fever");
  });

  it("a save whose answer was lost writes its audit lines once, when its re-send is answered with the one on record", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.setRxItems([{ drug: "Tablet. Napa 500 mg", dose: "1+0+1", duration: "5 days", instruction: "", isCont: false, fromHabit: true }]));
    await tick(50);
    api.rxCreate
      .mockRejectedValueOnce(new TypeError("Failed to fetch")) // stored, answer lost
      .mockResolvedValueOnce({ repeat: true }); // the re-send
    expect(await pressSave(result)).toBe(true);
    const habitLines = api.activityLog.mock.calls.filter(([e]) => (e as { section: string }).section === "Prescribing habits");
    expect(habitLines).toHaveLength(1);
  });

  it("a save whose answer was lost on every try writes its audit lines when it is pressed again", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.setRxItems([{ drug: "Tablet. Napa 500 mg", dose: "1+0+1", duration: "5 days", instruction: "", isCont: false, fromHabit: true }]));
    await tick(50);
    api.rxCreate.mockRejectedValue(new TypeError("Failed to fetch")); // stored, every answer lost
    expect(await pressSave(result)).toBe(false);
    api.rxCreate.mockReset();
    api.rxCreate.mockResolvedValue({ repeat: true });
    expect(await pressSave(result)).toBe(true);
    const habitLines = api.activityLog.mock.calls.filter(([e]) => (e as { section: string }).section === "Prescribing habits");
    expect(habitLines).toHaveLength(1);
  });

  it("a change parked, the patient opened again, and the change undone: printed again", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    const parked = (incompleteWrites().at(-1)?.[1] as { incompleteRx: Record<string, unknown> }).incompleteRx;
    act(() => result.current.loadPatient(patient({ id: "Y" })));
    await tick(50);
    act(() => result.current.loadPatient(patient({ incompleteRx: parked })));
    await tick(50);
    expect(result.current.chiefComplaints).toEqual(["Fever", "Cough"]);
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    act(() => result.current.setChiefComplaints(["Fever"]));
    await tick(1500);
    expect(incompleteWrites().at(-1)?.[1]).toEqual({ incompleteRx: null });
    expect(api.setRxStatus).toHaveBeenLastCalledWith(expect.objectContaining({ patientId: "X", rxStatus: "complete" }));
  });

  it("a change parked on one device and undone on another: the other device takes it back", async () => {
    const a = await setup();
    await typeAndPrint(a.result);
    act(() => a.result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    const changed = { ...a.result.current.mirrorSnapshot };
    a.unmount();
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    const b = await setup();
    act(() => b.result.current.applyMirrorSnapshot(changed));
    await tick(500);
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown")); });
    act(() => b.result.current.setChiefComplaints(["Fever"]));
    await tick(1500);
    expect(incompleteWrites().at(-1)?.[1]).toEqual({ incompleteRx: null });
  });

  it("a parked copy from an earlier day's print opens as that day's unprinted visit", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    const parked = (incompleteWrites().at(-1)?.[1] as { incompleteRx: Record<string, unknown> }).incompleteRx;
    act(() => result.current.loadPatient(patient({ id: "Y" })));
    await tick(50);
    expect(parked.rxPrintedOn).toEqual(expect.any(String)); // the day rides with the mark
    act(() => result.current.loadPatient(patient({ incompleteRx: { ...parked, rxPrintedOn: "2026-01-05" } })));
    await tick(50);
    expect(result.current.visitPrinted).toBe(false);
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    act(() => result.current.setChiefComplaints(["Fever"])); // what was printed THAT day
    await tick(1500);
    expect(incompleteWrites().at(-1)?.[1]).toMatchObject({ incompleteRx: expect.objectContaining({ chiefComplaints: ["Fever"] }) });
    expect(api.setRxStatus).not.toHaveBeenCalledWith(expect.objectContaining({ rxStatus: "complete" }));
  });

  it("a back-dated visit printed today keeps its mark: the day is the print's, not the visit's", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    const parked = (incompleteWrites().at(-1)?.[1] as { incompleteRx: Record<string, unknown> }).incompleteRx;
    act(() => result.current.loadPatient(patient({ id: "Y" })));
    await tick(50);
    act(() => result.current.loadPatient(patient({ incompleteRx: { ...parked, ptDate: "2026-01-05" } })));
    await tick(50);
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    act(() => result.current.setChiefComplaints(["Fever"]));
    await tick(1500);
    expect(incompleteWrites().at(-1)?.[1]).toEqual({ incompleteRx: null });
  });

  it("printed on an earlier day and kept by a reload, it is that day's visit once changed: undone, nothing is marked complete", async () => {
    const a = await setup();
    await typeAndPrint(a.result);
    act(() => a.result.current.setDrugHistory([...a.result.current.drugHistory])); // a save after the print
    await tick(1500);
    const draft = { ...(api.draftSave.mock.calls.at(-1)?.[0] as Record<string, unknown>), rxPrintedOn: "2026-01-05" };
    a.unmount();
    api.draftGet.mockResolvedValue({ data: draft });
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    const b = await setup();
    await tick(50);
    expect(b.result.current.visitPrinted).toBe(true); // unchanged: still the printed visit, not parked again
    act(() => b.result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    act(() => b.result.current.setChiefComplaints(["Fever"]));
    await tick(1500);
    expect(incompleteWrites().at(-1)?.[1]).toMatchObject({ incompleteRx: expect.objectContaining({ chiefComplaints: ["Fever"] }) });
    expect(api.setRxStatus).not.toHaveBeenCalledWith(expect.objectContaining({ rxStatus: "complete" }));
  });

  it("a print mark from a device on an older build (no day) is today's: a change undone is printed again", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", currentPatientId: "X", rxCompletedPid: "X", chiefComplaints: ["Fever"] }));
    await tick(500);
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown")); });
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    expect(incompleteWrites().at(-1)?.[1]).toMatchObject({ incompleteRx: expect.objectContaining({ chiefComplaints: ["Fever", "Cough"] }) });
    act(() => result.current.setChiefComplaints(["Fever"]));
    await tick(1500);
    expect(incompleteWrites().at(-1)?.[1]).toEqual({ incompleteRx: null });
  });

  it("an OPD status write never sends an age the queue refuses", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    act(() => result.current.setPtAge("1.5"));
    act(() => result.current.setNote(["Review in a week"]));
    await tick(100); // inside the auto-save's wait
    api.setRxStatus.mockClear();
    act(() => result.current.loadPatient(patient({ id: "Y" })));
    const sent = api.setRxStatus.mock.calls.map(([b]) => b as Record<string, unknown>);
    expect(sent.some((b) => b.patientId === "X" && b.rxStatus === "incomplete")).toBe(true);
    for (const b of sent) expect(b.age).toBeUndefined();
  });

  it("Save to complete later straight after the undo takes the parked copy back, not parks it", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    api.patientUpdate.mockClear();
    act(() => result.current.setChiefComplaints(["Fever"]));
    await act(async () => { await result.current.saveDraftNow(); });
    expect(incompleteWrites().map(([, b]) => b)).toEqual([{ incompleteRx: null }]);
  });

  it("an IPD admission's detail open while another patient is opened does not park the printed visit", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    act(() => result.current.beginInvBorrow());
    act(() => result.current.setInvestigation(["01/10/2026:Hb:9"]));
    act(() => result.current.loadPatient(patient({ id: "Y" })));
    await tick(50);
    expect(incompleteWrites().filter(([pid]) => pid === "X")).toHaveLength(0);
    expect(api.setRxStatus).not.toHaveBeenCalledWith(expect.objectContaining({ patientId: "X", rxStatus: "incomplete" }));
  });

  it("a fresh visit ends the records' + Add box: nothing of the last patient reaches the next one", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.setInvestigation(["01/09/2026:Hb:12"])); // X's own finding
    act(() => result.current.openInvForSummary());
    act(() => result.current.setInvestigation((prev) => [...prev, "01/10/2026:Hb:9"]));
    act(() => result.current.loadPatient(patient({ id: "Y" })));
    await tick(50);
    act(() => result.current.setChiefComplaints(["Y's visit"]));
    await tick(1500);
    const y = incompleteWrites().filter(([pid]) => pid === "Y").map(([, body]) => JSON.stringify(body));
    expect(y.length).toBeGreaterThan(0);
    for (const body of y) expect(body).not.toContain("Hb:12");
    act(() => result.current.setShowInvPopup(false));
    await tick(50);
    const summaries = api.patientUpdate.mock.calls.filter(([, body]) => "investigationSummary" in (body as object));
    expect(summaries).toHaveLength(0);
  });

  // ⚕️ Reviews of dfdd1c4 and 409be0b: a whole list built in the editor — its
  // own list (which follows the ℞ pad), then its copy of the record (one
  // device's, behind the record) — erased printed medicines, or wrote an
  // unprinted one, or another patient's. The lines are APPENDED by the server.
  it("a Drug history line added after Save & print is appended by the server: the request carries the new lines alone", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    const line = "01/01/2000: Tablet. Barcavir 0.5 mg — 1+0+0 —  — ";
    const taper = "01/01/2000(cont): 0+0+1 —  — ";
    await act(async () => { expect(result.current.addDrugHistoryEntries([line, taper])).toBe(true); });
    expect(api.dhAppend.mock.calls).toEqual([["X", [line, taper]]]);
    expect(dhWrites()).toHaveLength(0); // no whole list
    expect(result.current.drugHistory).toEqual([...STORED, line, taper]);
    await tick(1500);
    // The prescription itself is still the one printed.
    expect(api.setRxStatus).not.toHaveBeenCalledWith(expect.objectContaining({ rxStatus: "incomplete" }));
  });

  it("an unprinted ℞ line on the pad is not sent with it", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    act(() => result.current.setRxItems([BEX]));
    await tick(50);
    expect(result.current.drugHistory.some((e) => e.includes("Bex"))).toBe(true); // the ℞ mirror, not printed
    api.patientUpdate.mockClear();
    await act(async () => { result.current.addDrugHistoryEntries([SECLO]); });
    expect(api.dhAppend.mock.calls).toEqual([["X", [SECLO]]]);
    expect(dhWrites()).toHaveLength(0);
  });

  it("on a device that received the print through the mirror, only the new line is sent", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", currentPatientId: "X", rxCompletedPid: "X", rxPrintedSig: "p", rxPrintedOn: "2026-10-19", chiefComplaints: ["Fever"] }));
    await tick(500);
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown")); });
    api.patientUpdate.mockClear();
    await act(async () => { result.current.addDrugHistoryEntries([SECLO]); });
    expect(api.dhAppend.mock.calls).toEqual([["X", [SECLO]]]);
    expect(dhWrites()).toHaveLength(0);
  });

  it("Save & print's own list is written first: a line added straight after it waits for it", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.setChiefComplaints(["Fever"]));
    await tick(1500);
    let release = () => {};
    api.patientUpdate.mockImplementation(async (_id: string, body: Record<string, unknown>) =>
      "drugHistory" in body ? new Promise((resolve) => { release = () => resolve({}); }) : {});
    await act(async () => { await result.current.savePrescription(); });
    expect(dhWrites()).toHaveLength(1); // the print's list, on its way
    await act(async () => { result.current.addDrugHistoryEntries([SECLO]); });
    expect(api.dhAppend).not.toHaveBeenCalled();
    await act(async () => { release(); });
    expect(api.dhAppend.mock.calls).toEqual([["X", [SECLO]]]);
  });

  it("two presses close together are sent one after the other", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    let release = () => {};
    api.dhAppend.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ drugHistory: [] }); }));
    const a = "01/01/2000: Tablet. Alpha 1 mg —  —  — ";
    const b = "01/01/2000: Tablet. Beta 1 mg —  —  — ";
    await act(async () => { result.current.addDrugHistoryEntries([a]); });
    await act(async () => { result.current.addDrugHistoryEntries([b]); });
    expect(api.dhAppend.mock.calls).toEqual([["X", [a]]]);
    await act(async () => { release(); });
    expect(api.dhAppend.mock.calls).toEqual([["X", [a]], ["X", [b]]]);
  });

  it("a write that fails is said, and the line is taken back off the screen", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    api.dhAppend.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => { result.current.addDrugHistoryEntries([SECLO]); });
    await act(async () => {});
    expect(result.current.drugHistory).toEqual(STORED);
    expect(tell).toHaveBeenLastCalledWith(expect.objectContaining({ title: "The medicine was not added.", tone: "danger" }));
    expect(JSON.stringify(tell.mock.calls.at(-1))).toContain("Tablet. Seclo 20 mg");
  });

  it("an add whose answer was lost but which IS on the record is kept, and nothing is said", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    api.dhAppend.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    api.patientGet.mockImplementation(async (id: string) => patient({ id, drugHistory: [...STORED, SECLO] }));
    tell.mockClear();
    await act(async () => { result.current.addDrugHistoryEntries([SECLO]); });
    await tick(50);
    expect(result.current.drugHistory).toEqual([...STORED, SECLO]);
    expect(tell).not.toHaveBeenCalled();
  });

  it("neither the add nor the check answers: the line stays, and the doctor is asked to look", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    api.dhAppend.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    api.patientGet.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => { result.current.addDrugHistoryEntries([SECLO]); });
    await tick(50);
    expect(result.current.drugHistory).toEqual([...STORED, SECLO]);
    expect(tell).toHaveBeenLastCalledWith(expect.objectContaining({ title: "The medicine may not have been added." }));
  });

  it("a re-print queued behind a line that was not added does not write it", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    let fail = () => {};
    api.dhAppend.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = () => reject(new TypeError("Failed to fetch")); }));
    await act(async () => { result.current.addDrugHistoryEntries([SECLO]); });
    act(() => result.current.setChiefComplaints(["Fever", "Cough"])); // a correction
    await tick(1500);
    api.patientUpdate.mockClear();
    await act(async () => { await result.current.savePrescription(); }); // its list is taken with the line
    await act(async () => { fail(); });
    await tick(50);
    expect(dhWrites()).toHaveLength(1);
    expect(dhWrites()[0]).not.toContain(SECLO);
  });

  it("…also a re-print pressed BEFORE the line failed, while its prescription was on its way", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    let fail = () => {};
    api.dhAppend.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = () => reject(new TypeError("Failed to fetch")); }));
    await act(async () => { result.current.addDrugHistoryEntries([SECLO]); });
    act(() => result.current.setChiefComplaints(["Fever", "Cough"])); // a correction
    await tick(1500);
    api.patientUpdate.mockClear();
    let answer = () => {};
    api.rxCreate.mockImplementationOnce(() => new Promise((resolve) => { answer = () => resolve({}); }));
    let saving: Promise<unknown> = Promise.resolve();
    act(() => { saving = result.current.savePrescription(); }); // its list is taken with the line
    await act(async () => { fail(); });
    await tick(50);
    await act(async () => { answer(); await saving; });
    await tick(50);
    expect(dhWrites()).toHaveLength(1);
    expect(dhWrites()[0]).not.toContain(SECLO);
  });

  it("opened again while the line was on its way, the editor takes the line back from the answer", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    let release = () => {};
    api.dhAppend.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ drugHistory: [...STORED, SECLO] }); }));
    await act(async () => { result.current.addDrugHistoryEntries([SECLO]); });
    act(() => result.current.loadPatient(patient())); // the record, read before the line landed
    await tick(50);
    expect(result.current.drugHistory).toEqual(STORED);
    await act(async () => { release(); });
    expect(result.current.drugHistory).toEqual([...STORED, SECLO]);
  });

  it("…and only its own lines: another medicine's identical taper stays under that medicine", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    const taper = "01/01/2000(cont): 0+0+1 —  — ";
    const mono = "01/01/2000: Tablet. Mono 1 mg — 1+0+0 —  — ";
    const bex = "20/10/2026: Tablet. Bexo 1 mg — 1+0+0 —  — ";
    let fail = () => {};
    api.dhAppend.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = () => reject(new TypeError("Failed to fetch")); }));
    await act(async () => { result.current.addDrugHistoryEntries([mono, taper]); });
    act(() => result.current.setDrugHistory((prev) => [...prev, bex, taper])); // the same taper under another medicine
    await act(async () => { fail(); });
    expect(result.current.drugHistory).toEqual([...STORED, bex, taper]);
  });

  it("a write that lands after another patient is opened leaves that patient untouched", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    let release = () => {};
    api.dhAppend.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ drugHistory: [...STORED, SECLO] }); }));
    await act(async () => { result.current.addDrugHistoryEntries([SECLO]); });
    act(() => result.current.loadPatient(patient({ id: "Y" })));
    await tick(50);
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    await act(async () => { release(); });
    act(() => result.current.setDrugHistory([...result.current.drugHistory])); // Y's next render, nothing changed
    await tick(3000);
    expect(incompleteWrites().filter(([pid]) => pid === "Y")).toHaveLength(0);
    expect(api.setRxStatus).not.toHaveBeenCalled();
    expect(result.current.drugHistory).toEqual(STORED);
  });

  it("a supervising doctor's line after Save & print is refused with the reason — nothing is sent, the box keeps it", async () => {
    api.patientGet.mockImplementation(async (id: string) => patient({ id, doctorId: OTHER_PRACTICE }));
    const { result } = await setup();
    await typeAndPrint(result, patient({ id: "S", doctorId: OTHER_PRACTICE }));
    api.patientUpdate.mockClear();
    let took = true;
    act(() => { took = result.current.addDrugHistoryEntries([SECLO]); });
    expect(took).toBe(false);
    expect(api.dhAppend).not.toHaveBeenCalled();
    expect(dhWrites("S")).toHaveLength(0);
    expect(tell).toHaveBeenLastCalledWith(expect.objectContaining({ title: "The medicine was not added." }));
  });

  it("before the record has loaded, the line is still appended by the server — nothing is written over a list not in hand", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    await tick(1500);
    const parked = (incompleteWrites().at(-1)?.[1] as { incompleteRx: Record<string, unknown> }).incompleteRx;
    act(() => result.current.loadPatient(patient({ id: "Y" })));
    await tick(50);
    api.patientGet.mockImplementation(() => new Promise<Patient>(() => {})); // X's record does not arrive
    act(() => result.current.loadPatient(patient({ incompleteRx: parked })));
    await tick(50);
    api.patientUpdate.mockClear();
    await act(async () => { expect(result.current.addDrugHistoryEntries([SECLO])).toBe(true); });
    expect(api.dhAppend.mock.calls).toEqual([["X", [SECLO]]]);
    expect(dhWrites()).toHaveLength(0);
  });

  it("a repeat answered after a reload writes no audit lines again: the print mark rides the draft", async () => {
    const habitLines = () => api.activityLog.mock.calls.filter(([e]) => (e as { section: string }).section === "Prescribing habits");
    const a = await setup();
    act(() => a.result.current.loadPatient(patient()));
    await tick(50);
    act(() => a.result.current.setRxItems([{ ...BEX, fromHabit: true }]));
    await tick(1500);
    await act(async () => { await a.result.current.savePrescription(); });
    await tick(1500);
    expect(habitLines()).toHaveLength(1);
    const draft = api.draftSave.mock.calls.at(-1)?.[0];
    expect(draft).toMatchObject({ rxCompletedPid: "X" });
    a.unmount();
    api.draftGet.mockResolvedValue({ data: draft });
    const b = await setup();
    await tick(50);
    api.rxCreate.mockResolvedValue({ repeat: true });
    await act(async () => { await b.result.current.savePrescription(); });
    expect(habitLines()).toHaveLength(1);
  });

  it("a corrected re-print whose answer was lost writes its own audit lines when its re-send is answered", async () => {
    const habitLines = () => api.activityLog.mock.calls.filter(([e]) => (e as { section: string }).section === "Prescribing habits");
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.setRxItems([{ ...BEX, fromHabit: true }]));
    await tick(1500);
    await act(async () => { await result.current.savePrescription(); });
    expect(habitLines()).toHaveLength(1);
    act(() => result.current.setRxItems([{ ...BEX, fromHabit: true }, { ...BEX, drug: "Tablet. Napa 500 mg", fromHabit: true }]));
    await tick(1500);
    api.rxCreate
      .mockRejectedValueOnce(new TypeError("Failed to fetch")) // stored, answer lost
      .mockResolvedValueOnce({ repeat: true }); // the re-send
    expect(await pressSave(result)).toBe(true);
    expect(habitLines()).toHaveLength(2);
  });

  it("another patient arriving through the device mirror ends the records' + Add box too", async () => {
    const { result } = await setup();
    act(() => result.current.loadPatient(patient()));
    await tick(50);
    act(() => result.current.setInvestigation(["01/09/2026:Hb:12"])); // X's own finding
    act(() => result.current.openInvForSummary());
    act(() => result.current.setInvestigation((prev) => [...prev, "01/10/2026:Hb:9"]));
    act(() => result.current.applyMirrorSnapshot({ workstationId: "doc1", currentPatientId: "Z", investigation: ["05/10/2026:Cr:1.1"] }));
    await tick(500);
    expect(result.current.showInvPopup).toBe(false); // the box went with its patient
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown")); });
    await tick(50);
    expect(result.current.investigation).toEqual(["05/10/2026:Cr:1.1"]);
    const summaries = api.patientUpdate.mock.calls.filter(([, body]) => "investigationSummary" in (body as object));
    expect(summaries).toHaveLength(0);
  });

  it("the editor says when the loaded visit is printed and unchanged (BAN / EN leaves it alone)", async () => {
    const { result } = await setup();
    await typeAndPrint(result);
    expect(result.current.visitPrinted).toBe(true);
    act(() => result.current.setChiefComplaints(["Fever", "Cough"]));
    expect(result.current.visitPrinted).toBe(false);
  });
});

// ⚕️ Found by reading (20/10/2026), after the device mirror stopped moving a
// PRINTED visit to today (6e4cbbf): does a page reload after midnight do what
// the mirror did? The draft carries the print mark (5de1eef), so the visit is
// not parked again. But the reload's `applyEditorSnapshot` still moves its date
// to today, and the ℞ mirror then writes the printed medicine into Drug history
// a second time, under today's date.
describe("a printed visit reloaded after midnight", () => {
  const napa: RxItem = { drug: "Tablet. Napa 500 mg", dose: "1+0+1", instruction: "", duration: "5 days" };
  const printed = () => rxDrugHistoryEntries([napa], "17/10/2026");
  /** Save & print at `at`, then reload at `reloadAt`, with the print on the record. */
  const printThenReload = async (at: Date, reloadAt: Date, printedOn: string) => {
    vi.setSystemTime(at);
    const pt = patient({ drugHistory: [] });
    api.patientGet.mockResolvedValue(pt);
    const a = await setup();
    act(() => a.result.current.loadPatient(pt));
    await tick(50);
    act(() => a.result.current.setRxItems([napa]));
    await tick(10);
    await act(async () => { await a.result.current.savePrescription(); });
    await tick(1500); // the draft the auto-save writes after the print
    const draft = api.draftSave.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(draft).toMatchObject({ rxCompletedPid: "X", rxPrintedOn: printedOn });
    a.unmount();
    vi.setSystemTime(reloadAt);
    api.draftGet.mockResolvedValue({ data: draft });
    api.patientGet.mockResolvedValue(patient({ drugHistory: rxDrugHistoryEntries([napa], isoToDdmmyyyy(printedOn)) }));
    api.patientUpdate.mockClear();
    api.setRxStatus.mockClear();
    const b = await setup();
    await tick(3000);
    return b;
  };
  const sentDrugHistory = () => api.rxCreate.mock.calls.map(([d]) => (d as { drugHistory: string[] }).drugHistory);
  const printAgain = async (b: Awaited<ReturnType<typeof setup>>) => {
    await act(async () => { await b.result.current.savePrescription(); });
    await tick(50);
  };

  it("is not parked again, nor put back to Incomplete", async () => {
    const b = await printThenReload(new Date(2026, 9, 17, 23, 58), new Date(2026, 9, 18, 0, 5), "2026-10-17");
    expect(b.result.current.currentPatientId).toBe("X");
    expect(incompleteWrites()).toHaveLength(0);
    expect(api.setRxStatus).not.toHaveBeenCalled();
  });

  // The same day: Save & print again sends what was printed, so the server can
  // answer it with the prescription on record (repeat.ts compares every field).
  it("on the same day, Save & print again sends exactly what was printed", async () => {
    const b = await printThenReload(new Date(2026, 9, 17, 12), new Date(2026, 9, 17, 12, 7), "2026-10-17");
    expect(b.result.current.ptDate).toBe("2026-10-17");
    expect(b.result.current.drugHistory).toEqual(printed());
    await printAgain(b);
    expect(sentDrugHistory()).toEqual([printed(), printed()]);
  });

  // What a reload after midnight does today — written down beside the defect
  // below, and expected to change with its fix.
  it("after midnight, today: the date moves on and the printed medicine is in Drug history twice", async () => {
    const b = await printThenReload(new Date(2026, 9, 17, 23, 58), new Date(2026, 9, 18, 0, 5), "2026-10-17");
    const s = b.result.current;
    expect(s.ptDate).toBe("2026-10-18");
    const again = rxDrugHistoryEntries([napa], "18/10/2026");
    expect(s.drugHistory).toEqual([...printed(), ...again]); // the printed line is kept (withoutBlocksIn), a copy is added
    // Current medications: the visit on the pad reads as its own "previous visit".
    const split = splitDrugHistory(s.drugHistory, "18/10/2026", again);
    expect(split.previousDate).toBe("17/10/2026");
    expect(split.current.map((r) => r.raw)).toEqual(printed());
    // Save & print again, seven minutes after the print: not what was printed,
    // so the server files a second prescription, and the record gets the copy.
    await printAgain(b);
    expect(sentDrugHistory()).toEqual([printed(), [...printed(), ...again]]);
    expect(dhWrites().at(-1)).toEqual([...printed(), ...again]);
  });

  // DEFECT-RELOAD-MIDNIGHT: a printed, unchanged visit restored by a reload
  // after midnight is no longer what was printed. Which fix is the physician's
  // to choose (keep the visit's date as the device mirror does, or open the
  // patient as a new visit on a later day); either way these hold.
  it.fails("DEFECT-RELOAD-MIDNIGHT: after midnight, nothing printed is written again under another date", async () => {
    const b = await printThenReload(new Date(2026, 9, 17, 23, 58), new Date(2026, 9, 18, 0, 5), "2026-10-17");
    expect(b.result.current.drugHistory).toEqual(printed());
    await printAgain(b);
    for (const sent of sentDrugHistory().slice(1)) expect(sent).toEqual(printed());
  });
});
