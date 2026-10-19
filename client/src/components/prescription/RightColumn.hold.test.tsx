// @vitest-environment jsdom
//
// ⚕️ A line the OPD ℞ pad cannot write — here a medicine whose name was cleared
// with its dose left, the line the physician's report of 18/10/2026 began with —
// is never in `rxItems`, and until 19/10/2026 it lived in the pad's rows alone:
// the pad taken off the screen and drawn again, a reload, another patient and
// back, or a second, mirrored device drew the pad without it, and nothing said
// so. These run the real editor store, the real RightColumn and the real pad,
// and hold that the line now travels with the visit, refused at Save wherever
// it is, and is put back only where it still fits. Every medicine is made up.

import { useState } from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Patient } from "@/lib/api";
import type { RxItem } from "@/types";

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
    rxHabitsApi: { setFlags: vi.fn() },
  };
});
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "doc1" } }) }));
// One array for the whole run, as React Query hands out (see MuqsitContext.test.tsx).
const stable = vi.hoisted(() => ({ advice: [] as unknown[], templates: { data: [] as unknown[] } }));
vi.mock("@/hooks/useDrugAdvice", () => ({ useDrugAdvice: () => ({ data: stable.advice, isSuccess: true }) }));
vi.mock("@/hooks/useTemplates", () => ({ useTemplates: () => stable.templates }));
vi.mock("@/hooks/useMedicineSearch", () => ({ useMedicineSearch: () => ({ results: [] }) }));
vi.mock("@/hooks/useRxHabits", () => ({ useRxHabits: () => ({ groups: [], refresh: vi.fn() }) }));
vi.mock("@/hooks/useDoctorPhrases", () => ({ useDoctorPhrases: () => ({ phrases: [], refresh: vi.fn() }) }));
// The rest of the column is not what is under test.
vi.mock("@/components/common/ExpandableField", () => ({ default: () => null }));
vi.mock("@/components/investigation/InvestigationDirectory", () => ({ default: () => null }));
vi.mock("@/components/investigation/InvestigationGroups", () => ({ default: () => null }));
// Add Bulk Medicine's own box is tested elsewhere; here only what its Add hands the column.
const bulk = vi.hoisted(() => ({ onAppend: null as null | ((items: import("@/types").RxItem[]) => void) }));
vi.mock("@/components/prescription/BulkMedicineButton", () => ({
  default: (p: { onAppend: (items: import("@/types").RxItem[]) => void }) => { bulk.onAppend = p.onAppend; return null; },
}));
vi.mock("@/components/prescription/DrugAdviceBox", () => ({ default: () => null }));
const dialogs = vi.hoisted(() => ({ tell: vi.fn(() => Promise.resolve()), confirmAction: vi.fn(() => Promise.resolve(true)) }));
vi.mock("@/lib/dialogs", () => dialogs);

import { MuqsitProvider, useMuqsit } from "@/context/MuqsitContext";
import RightColumn from "./RightColumn";
import { LanguageToggle } from "@/components/layout/BanglaTyping";
import { setKbdLang } from "@/lib/kbdLang";
import { rxCellIn } from "@/lib/rxLanguage";

const NAPA: RxItem = { drug: "Tablet. Napa 500 mg", dose: "1+1+1", instruction: "", duration: "5 days" };
const SECLO: RxItem = { drug: "Capsule. Seclo 20 mg", dose: "1+0+1", instruction: "", duration: "7 days" };
const BEX: RxItem = { drug: "Capsule. Bexidol 20 mg", dose: "0+0+1", instruction: "", duration: "" };
const patient = (over: Partial<Patient> = {}): Patient =>
  ({
    id: "X", doctorId: "doc1", name: "Patient X", sex: "", mobile: "", fullAddress: "",
    hospitalId: "", watched: false, drugHistory: [], incompleteRx: null,
    prescriptionImages: [], reportImages: [], ...over,
  }) as unknown as Patient;

type Store = ReturnType<typeof useMuqsit>;
// One device: the editor store with the ℞ column on screen — or not, as when
// the doctor is on another tab, or the phone layout replaces the desktop one.
function device() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const d = {} as { store: Store; showPad: (on: boolean) => void; container: HTMLElement };
  function Probe() { d.store = useMuqsit(); return null; }
  function App({ children }: { children?: ReactNode }) {
    const [pad, setPad] = useState(true);
    d.showPad = setPad;
    return (
      <QueryClientProvider client={qc}>
        <MuqsitProvider><Probe /><LanguageToggle />{pad && <RightColumn />}{children}</MuqsitProvider>
      </QueryClientProvider>
    );
  }
  d.container = render(<App />).container;
  return d;
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
// Said on the line itself, politely (a status, not an alert).
const redLines = (c: HTMLElement) => within(c).queryAllByRole("status").filter((s) => /no medicine name/i.test(s.textContent ?? ""));
const nameBox = (c: HTMLElement, i: number) => c.querySelector(`[data-rx-row="${i}"] input`) as HTMLInputElement;
const drugs = (s: Store) => s.rxItems.map((it) => it.drug);
async function clearName(c: HTMLElement, i: number) {
  const box = nameBox(c, i);
  act(() => { fireEvent.focus(box); fireEvent.change(box, { target: { value: "" } }); fireEvent.blur(box); });
  await tick(10);
}
// Napa, then Seclo with its name cleared and its dose left: red, refused at Save.
async function withRedLine(d: ReturnType<typeof device>, items: RxItem[] = [NAPA, SECLO]) {
  act(() => d.store.loadPatient(patient()));
  await tick(50);
  act(() => d.store.setRxItems(items));
  await tick(10);
  await clearName(d.container, items.length - 1);
}
const incompleteSnapshots = () =>
  api.patientUpdate.mock.calls.map(([, body]) => (body as { incompleteRx?: Record<string, unknown> }).incompleteRx).filter(Boolean) as Record<string, unknown>[];

beforeEach(() => {
  vi.useFakeTimers();
  for (const f of Object.values(api)) f.mockReset();
  dialogs.tell.mockClear();
  api.draftGet.mockResolvedValue({ data: {} });
  api.draftSave.mockResolvedValue({});
  api.patientUpdate.mockResolvedValue({});
  api.setRxStatus.mockResolvedValue({});
  api.rxCreate.mockResolvedValue({});
  api.patientGet.mockImplementation(async (id: string) => patient({ id }));
});
afterEach(() => { cleanup(); act(() => setKbdLang("en", "doc1")); vi.useRealTimers(); });

describe("a line the ℞ pad cannot write travels with the visit", () => {
  it("is red on the pad and in no rxItems", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    expect(redLines(a.container)).toHaveLength(1);
    expect(drugs(a.store)).toEqual([NAPA.drug]);
    expect(a.store.rxPadUnwritable).toBe(1);
  });

  it("survives the ℞ column being taken off the screen and put back", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    act(() => a.showPad(false));
    await tick(10);
    act(() => a.showPad(true));
    await tick(10);
    expect(redLines(a.container)).toHaveLength(1);
    expect(nameBox(a.container, 1).value).toBe("");
    expect(a.store.rxPadHeld?.[1]).toMatchObject({ drug: "", dose: "1+0+1", duration: "7 days" });
    expect(dialogs.tell).not.toHaveBeenCalled();
  });

  it("is still refused at Save & print while the ℞ column is off the screen", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    act(() => a.showPad(false));
    await tick(10);
    let ok = true;
    await act(async () => { ok = await a.store.savePrescription(); });
    expect(ok).toBe(false);
    expect(api.rxCreate).not.toHaveBeenCalled();
  });

  it("survives a reload through the draft", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    await tick(1500); // the auto-save
    const draft = api.draftSave.mock.calls[api.draftSave.mock.calls.length - 1][0] as Record<string, unknown>;
    expect(draft.rxPadHeld).toBeTruthy();
    cleanup();

    api.draftGet.mockResolvedValue({ data: JSON.parse(JSON.stringify(draft)) });
    const b = device();
    await tick(50);
    expect(b.store.currentPatientId).toBe("X");
    expect(redLines(b.container)).toHaveLength(1);
    expect(drugs(b.store)).toEqual([NAPA.drug]);
    expect(b.store.rxPadUnwritable).toBe(1);
    expect(dialogs.tell).not.toHaveBeenCalled();
  });

  it("is parked with the patient: another patient opened, then this one again", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    await tick(1500);
    const parked = incompleteSnapshots().pop();
    expect(parked?.rxPadHeld).toBeTruthy();

    act(() => a.store.loadPatient(patient({ id: "Y", name: "Patient Y" })));
    await tick(50);
    expect(redLines(a.container)).toHaveLength(0);
    expect(a.store.rxPadUnwritable).toBe(0);

    act(() => a.store.loadPatient(patient({ incompleteRx: JSON.parse(JSON.stringify(parked)) })));
    await tick(50);
    expect(redLines(a.container)).toHaveLength(1);
    expect(drugs(a.store)).toEqual([NAPA.drug]);
    expect(dialogs.tell).not.toHaveBeenCalled();
  });

  it("a pad holding ONLY such a line is work to park, not an empty visit", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a, [SECLO]);
    expect(a.store.rxItems).toEqual([]);
    expect(a.store.hasRxContent).toBe(true);
    await tick(1500);
    expect(incompleteSnapshots().pop()?.rxPadHeld).toBeTruthy();
  });

  it("reaches a mirrored device, which shows it and refuses to save without it", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    const fromA = JSON.parse(JSON.stringify(a.store.mirrorSnapshot)) as Record<string, unknown>;

    const b = device();
    await tick(10);
    act(() => b.store.loadPatient(patient()));
    await tick(50);
    act(() => b.store.applyMirrorSnapshot(fromA));
    await tick(10);
    expect(redLines(b.container)).toHaveLength(1);
    expect(b.store.rxPadUnwritable).toBe(1);
    let ok = true;
    await act(async () => { ok = await b.store.savePrescription(); });
    expect(ok).toBe(false);
    expect(api.rxCreate).not.toHaveBeenCalled();
  });

  it("a STALE hold is not put back onto different rxItems — and the pad says what went", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    const fromA = JSON.parse(JSON.stringify(a.store.mirrorSnapshot)) as Record<string, unknown>;

    const b = device();
    await tick(10);
    act(() => b.store.loadPatient(patient()));
    await tick(50);
    act(() => b.store.applyMirrorSnapshot({ ...fromA, rxItems: [BEX] }));
    await tick(10);
    expect(redLines(b.container)).toHaveLength(0);
    expect(drugs(b.store)).toEqual([BEX.drug]);
    expect(nameBox(b.container, 0).value).toBe(BEX.drug);
    expect(b.store.rxPadHeld).toBeNull();
    expect(b.store.rxPadUnwritable).toBe(0);
    expect(dialogs.tell).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(dialogs.tell.mock.calls[0])).toMatch(/1\+0\+1/);
  });

  it("a device on an older build, which sends no hold, does not take it off", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    const { rxPadHeld: _none, ...older } = JSON.parse(JSON.stringify(a.store.mirrorSnapshot)) as Record<string, unknown>;
    act(() => a.store.applyMirrorSnapshot(older));
    await tick(10);
    expect(redLines(a.container)).toHaveLength(1);
    expect(a.store.rxPadUnwritable).toBe(1);
    expect(dialogs.tell).not.toHaveBeenCalled();
  });

  it("— but another patient from it is a new visit, with none, also with the ℞ column off the screen", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    const { rxPadHeld: _none, ...older } = JSON.parse(JSON.stringify(a.store.mirrorSnapshot)) as Record<string, unknown>;
    act(() => a.showPad(false));
    await tick(10);
    act(() => a.store.applyMirrorSnapshot({ ...older, currentPatientId: "Y", rxItems: [] }));
    await tick(10);
    expect(a.store.rxPadHeld).toBeNull();
    expect(a.store.rxPadUnwritable).toBe(0);
    act(() => a.showPad(true));
    await tick(10);
    expect(redLines(a.container)).toHaveLength(0);
    expect(dialogs.tell).not.toHaveBeenCalled();
  });

  it("stays where it stood when a medicine is appended from elsewhere", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    act(() => a.store.setRxItems((prev) => [...prev, BEX]));
    await tick(10);
    expect(redLines(a.container)).toHaveLength(1);
    expect(nameBox(a.container, 0).value).toBe(NAPA.drug);
    expect(nameBox(a.container, 1).value).toBe("");
    expect(nameBox(a.container, 2).value).toBe(BEX.drug);
    expect(dialogs.tell).not.toHaveBeenCalled();
  });

  it("Add Bulk Medicine brings into view the medicine it added, not the red line above it", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    const scrolled: string[] = [];
    const before = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.getAttribute("data-rx-row") ?? "?"); };
    try {
      act(() => bulk.onAppend?.([BEX]));
      await tick(10);
    } finally {
      Element.prototype.scrollIntoView = before;
    }
    expect(nameBox(a.container, 2).value).toBe(BEX.drug);
    expect(scrolled.length).toBeGreaterThan(0);
    expect(new Set(scrolled)).toEqual(new Set(["2"]));
  });

  it("a stored hold that cannot be read is said, not dropped without a word", async () => {
    api.draftGet.mockResolvedValue({ data: {
      currentPatientId: "X", workstationId: "doc1", ptDate: "2026-10-19",
      rxItems: [NAPA], rxPadHeld: [{ drug: "", dose: 5 }],
    } });
    const b = device();
    await tick(50);
    expect(b.store.currentPatientId).toBe("X");
    expect(b.store.rxPadHeld).toBeNull();
    expect(dialogs.tell).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(dialogs.tell.mock.calls[0])).toMatch(/could not be read/i);
  });

  it("is written in Bangla with every other line when BAN is pressed, and stays", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    act(() => { fireEvent.click(within(a.container).getByRole("button", { name: "BAN" })); });
    await tick(10);
    expect(a.store.rxItems[0].dose).toBe(rxCellIn("1+1+1", "bn"));
    expect(redLines(a.container)).toHaveLength(1);
    expect(a.store.rxPadHeld?.[1].dose).toBe(rxCellIn("1+0+1", "bn"));
    expect(a.store.rxPadHeld?.[1].dose).not.toBe("1+0+1");
    expect(dialogs.tell).not.toHaveBeenCalled();
  });

  it("goes with the visit: a new prescription starts with none, also with the ℞ column off the screen", async () => {
    const a = device();
    await tick(10);
    await withRedLine(a);
    act(() => a.showPad(false));
    await tick(10);
    act(() => a.store.resetEditor());
    await tick(10);
    expect(a.store.rxPadHeld).toBeNull();
    expect(a.store.rxPadUnwritable).toBe(0);
    act(() => a.showPad(true));
    await tick(10);
    expect(redLines(a.container)).toHaveLength(0);
    expect(dialogs.tell).not.toHaveBeenCalled();
  });
});
