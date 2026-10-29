// @vitest-environment jsdom
//
// Regressions on the IPD admission sheet for three review-pass fixes that
// shipped without a test of their own. The sheet's Save sends the admission's
// WHOLE `clinical` object and the server writes it verbatim (client/CLAUDE.md,
// "The IPD clinical sheet is written WHOLESALE"), so what is — and is not — in
// that payload is the safety property.
//
// 82101b6 — "IPD detail never sends a stale analogueSheets copy". The pages of
//   the photographed paper order sheet are written through their own routes the
//   moment they change. The copy inside `admission.clinical` can be OLDER than
//   the server's (a page photographed on another device since this admission
//   was fetched), and the server treats a present key as authoritative — so
//   sending it erased that page on Save.
//
// 82101b6 — "admit/event failures are shown" (the event half). A ward note that
//   did not reach the server cleared the box and said nothing: it read as
//   recorded on a feed nurses act on.
//
// 35e7039 — "IPD sheet can clear age/sex". A cleared field sent `undefined`,
//   which is dropped from the PATCH, so the old value stayed stored while the
//   screen said "Saved!".
//
// 20/10/2026 — "what the IPD Save says". The sheet's Save line picked its
//   colour by comparing its text with "Saved!", said a failed save as "Save
//   failed" with no reason for 2.5 s, and the typed vitals were in the log —
//   looking recorded — before the server had them. The same fault the OPD Save
//   buttons had until 18/10/2026 (lib/saveNotice.ts).

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ApiError, type IpdAdmission, type IpdClinical } from "@/lib/api";
import { CHECK_CONNECTION, SERVER_COULD_NOT_SAVE, STILL_HERE } from "@/lib/saveNotice";
import { C } from "@/theme";
import DialogHost from "@/components/common/DialogHost";

const updateMock = vi.fn();
const addEventMock = vi.fn();
vi.mock("@/hooks/useIpd", () => ({
  useUpdateIpd: () => ({ mutateAsync: updateMock, isPending: false }),
  useIpdEvents: () => ({ data: [] }),
  useAddIpdEvent: () => ({ mutateAsync: addEventMock, isPending: false }),
}));
vi.mock("@/hooks/useWards", () => ({ useWards: () => ({ data: [] }) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "doc-test-1" } }) }));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    investigation: [], setInvestigation: vi.fn(), invImages: {}, setInvImages: vi.fn(),
    setShowInvPopup: vi.fn(), beginInvBorrow: vi.fn(), endInvBorrow: vi.fn(),
  }),
}));
// The panes are not under test. MedicinePad keeps its real named exports
// (`emptyRow` is what lib/rxRows builds the pad from).
vi.mock("@/components/prescription/MedicinePad", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/prescription/MedicinePad")>()),
  default: () => null,
}));
vi.mock("@/components/prescription/RxAlerts", () => ({ default: () => null }));
vi.mock("./AnalogueSheetPanel", () => ({ default: () => null }));
vi.mock("@/components/common/ExpandableField", () => ({ default: () => null }));
vi.mock("@/components/investigation/InvestigationFindingsField", () => ({ default: () => null }));

import IpdDetailView from "./IpdDetailView";

// A jsdom render of these screens takes seconds on the dev machine; the
// default 5 s is the failure mode there, not the code.
vi.setConfig({ testTimeout: 30_000 });

const STALE_SHEETS = [{ id: "s1", url: "/uploads/s1.jpg", label: "", addedAt: "2026-09-07T04:00:00.000Z", addedBy: "u1" }];
const admission = (over: Partial<IpdAdmission> = {}): IpdAdmission => ({
  id: "adm1", patientId: null, bed: "B-3", name: "Patient", hospitalId: null, roomNo: null, wardNo: null, wardId: null,
  floorBuilding: null, mobile: null, age: null, sex: null, diagnosis: null, status: "Stable",
  clinical: null, admittedAt: "2026-09-07T04:00:00.000Z", ...over,
});

// A box still open when a test ends goes to the browser's own box as its host
// leaves (lib/dialogs.ts), and jsdom has none.
let alertSpy: MockInstance;
beforeEach(() => {
  updateMock.mockReset(); addEventMock.mockReset(); updateMock.mockResolvedValue({});
  alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
});
afterEach(() => { cleanup(); alertSpy.mockRestore(); });

const pressSave = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); }); };
const pressSaveFollowUp = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save follow up" })); }); };
// The sheet with the app's own box beside it, as Providers draws it.
const sheet = (a: IpdAdmission) => render(<><IpdDetailView admission={a} onBack={() => {}} /><DialogHost /></>);
const NOT_SAVED = "The changes to this admission were not saved.";
const notSavedBox = () => screen.getByRole("alertdialog", { name: NOT_SAVED });
const pressOk = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "OK" })); }); };
// The line beside the toolbar's Save — on the page from the start.
const saveLine = () => screen.getByRole("button", { name: /^(Save|Saving…)$/ }).parentElement!.querySelector<HTMLElement>('[role="status"]');
const bpBox = () => screen.getByLabelText("Blood pressure") as HTMLInputElement;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const sentInput = () => updateMock.mock.calls[0][0].input as { age?: number | null; sex?: string | null; clinical: IpdClinical & Record<string, unknown> };
const sexSelect = () => [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.textContent === "Female")) as HTMLSelectElement;
// The header label renders as "Age" + ":" in one <span>, the input beside it.
const ageInput = () =>
  screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "Age:").parentElement!.querySelector("input") as HTMLInputElement;

describe("82101b6: Save never sends the admission's copy of the photographed order sheet", () => {
  it("⚕️ leaves `analogueSheets` OUT of the clinical payload, so the server keeps the stored pages", async () => {
    render(<IpdDetailView admission={admission({ clinical: { analogueSheets: STALE_SHEETS, diagnosis: ["Dx"] } as unknown as IpdClinical })} onBack={() => {}} />);
    await pressSave();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0].id).toBe("adm1");
    expect("analogueSheets" in sentInput().clinical).toBe(false);
  });

  it("still carries every OTHER stored key forward — an unknown key is left alone, not deleted", async () => {
    render(<IpdDetailView admission={admission({ clinical: { analogueSheets: STALE_SHEETS, diagnosis: ["Dx"], aKeyFromANewerBuild: { kept: true } } as unknown as IpdClinical })} onBack={() => {}} />);
    await pressSave();
    expect(sentInput().clinical.aKeyFromANewerBuild).toEqual({ kept: true });
    expect(sentInput().clinical.diagnosis).toEqual(["Dx"]);
  });
});

describe("35e7039: clearing Age or Sex on the sheet actually clears the stored value", () => {
  it("⚕️ a cleared age and sex are sent as null, not dropped from the PATCH", async () => {
    render(<IpdDetailView admission={admission({ age: 40, sex: "Male" })} onBack={() => {}} />);
    fireEvent.change(ageInput(), { target: { value: "" } });
    fireEvent.change(sexSelect(), { target: { value: "" } });
    await pressSave();
    expect(sentInput().age).toBeNull();
    expect(sentInput().sex).toBeNull();
  });

  it("untouched values are sent as they are", async () => {
    render(<IpdDetailView admission={admission({ age: 40, sex: "Male" })} onBack={() => {}} />);
    await pressSave();
    expect(sentInput().age).toBe(40);
    expect(sentInput().sex).toBe("Male");
  });

  it("an age and sex that were never recorded stay out of the PATCH — never sent as 0, '' or a guess", async () => {
    render(<IpdDetailView admission={admission()} onBack={() => {}} />);
    await pressSave();
    expect(sentInput().age).toBeUndefined();
    expect(sentInput().sex).toBeUndefined();
  });
});

describe("82101b6: a ward note that did not reach the server says so and keeps the text", () => {
  const note = () => screen.getByPlaceholderText(/Add an event/) as HTMLTextAreaElement;
  const send = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send" })); }); };

  it("⚕️ shows the server's reason beside Send and does not clear what was typed", async () => {
    addEventMock.mockRejectedValue(new ApiError(500, "boom"));
    render(<IpdDetailView admission={admission()} onBack={() => {}} />);
    fireEvent.change(note(), { target: { value: "shifted to HDU" } });
    await send();
    expect(addEventMock).toHaveBeenCalledWith({ id: "adm1", note: "shifted to HDU" });
    expect(screen.getByRole("alert").textContent).toBe("Not sent: boom");
    expect(note().value).toBe("shifted to HDU");
  });

  it("says the connection failed when the failure is not the server's", async () => {
    addEventMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<IpdDetailView admission={admission()} onBack={() => {}} />);
    fireEvent.change(note(), { target: { value: "shifted to HDU" } });
    await send();
    expect(screen.getByRole("alert").textContent).toMatch(/Not sent/);
    expect(note().value).toBe("shifted to HDU");
  });

  it("clears the box, and any earlier error, once the note is recorded", async () => {
    addEventMock.mockRejectedValueOnce(new ApiError(500, "boom")).mockResolvedValueOnce({});
    render(<IpdDetailView admission={admission()} onBack={() => {}} />);
    fireEvent.change(note(), { target: { value: "shifted to HDU" } });
    await send();
    await send();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(note().value).toBe("");
  });
});

// ⚕️ The IPD prescription is written from the same pad: a >>> line with no
// medicine directly above it is refused there too, never filed under another
// medicine on the ward's order (18/10/2026).
describe("the IPD Save refuses a pad line it cannot write", () => {
  it("does not save, and says why", async () => {
    // A medicine line with its name cleared, and a >>> line under it.
    const clinical = { rxItems: [
      { drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "", isCont: false },
      { drug: "", dose: "1+0+1", duration: "", instruction: "", isCont: false },
      { drug: "", dose: "0+0+1", duration: "", instruction: "", isCont: true },
    ] } as unknown as IpdClinical;
    sheet(admission({ clinical }));
    await pressSave();
    expect(updateMock).not.toHaveBeenCalled();
    // In a box the doctor has to read — not a line that goes after 8 s, red or not.
    expect(notSavedBox().textContent).toMatch(/no medicine name/i);
    expect(saveLine()!.textContent).toBe("");
  });

  // ⚕️ Review, 18/10/2026: "Save follow up" moved the typed vitals into the log
  // and emptied the boxes BEFORE the refusal — shown as recorded, never sent.
  it("Save follow up refuses BEFORE it touches the typed vitals", async () => {
    const clinical = { rxItems: [
      { drug: "", dose: "", duration: "", instruction: "", isCont: false },
      { drug: "", dose: "0+0+1", duration: "", instruction: "", isCont: true },
    ] } as unknown as IpdClinical;
    sheet(admission({ clinical }));
    fireEvent.change(bpBox(), { target: { value: "90/60" } });
    await pressSaveFollowUp();
    expect(updateMock).not.toHaveBeenCalled();
    expect(bpBox().value).toBe("90/60");
    expect(document.body.textContent).not.toMatch(/BP 90\/60/);
    expect(notSavedBox().textContent).toMatch(/no medicine name/i);
    expect(notSavedBox().textContent).toMatch(/Nothing typed here is lost/);
  });

  it("the top Save keeps the typed vitals too", async () => {
    const clinical = { rxItems: [
      { drug: "", dose: "", duration: "", instruction: "", isCont: false },
      { drug: "", dose: "0+0+1", duration: "", instruction: "", isCont: true },
    ] } as unknown as IpdClinical;
    sheet(admission({ clinical }));
    fireEvent.change(bpBox(), { target: { value: "90/60" } });
    await pressSave();
    expect(updateMock).not.toHaveBeenCalled();
    expect(bpBox().value).toBe("90/60");
    expect(notSavedBox().textContent).toMatch(/no medicine name/i);
  });
});

// ⚕️ What the IPD Save says (20/10/2026) — the rule the OPD Save buttons have
// kept since 18/10/2026 (client/CLAUDE.md, "What the Save buttons say"). The
// line holds its KIND with its words; a save that did not happen is a box in
// the doctor's words; and a follow-up is in the log only once the server has
// it. The PATCH writes the whole admission in one transaction
// (`ipd.service.ts#update`), so a failed one wrote nothing — "not saved" is true.
describe("what the IPD Save says", () => {
  // The error itself goes to the console; anything else written there still shows.
  let errorSpy: MockInstance;
  beforeEach(() => {
    const real = console.error;
    errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].startsWith("[ipd] the admission was not saved")) return;
      real(...args);
    });
  });
  afterEach(() => { errorSpy.mockRestore(); });

  it("⚕️ a save the server failed is a box in the doctor's words — not a line, not the server's words", async () => {
    updateMock.mockRejectedValue(new ApiError(500, "Internal server error"));
    sheet(admission());
    await pressSave();
    const box = notSavedBox();
    expect(box.textContent).toContain(SERVER_COULD_NOT_SAVE);
    expect(box.textContent).toContain(STILL_HERE);
    expect(box.textContent).not.toMatch(/Internal server error/);
    expect(document.body.textContent).not.toMatch(/Save failed|Saved!/);
    expect(errorSpy).toHaveBeenCalledWith("[ipd] the admission was not saved:", expect.any(ApiError));
  });

  it("no answer at all is said as the connection", async () => {
    updateMock.mockRejectedValue(new TypeError("Failed to fetch"));
    sheet(admission());
    await pressSave();
    expect(notSavedBox().textContent).toContain(CHECK_CONNECTION);
  });

  it("a saved sheet says so on its line, in the saved green — the line's KIND, never a reading of its words", async () => {
    sheet(admission());
    // A status region on the page from the start: one that arrives with its words is often not read out.
    expect(saveLine()).not.toBeNull();
    expect(saveLine()!.textContent).toBe("");
    await pressSave();
    expect(saveLine()!.textContent).toBe("Saved!");
    expect(saveLine()!.style.color).toBe(C.ok[600]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("each line takes only itself off: the first Save's timer does not clear the second's Saved!", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      sheet(admission());
      await pressSave();
      act(() => { vi.advanceTimersByTime(2000); });
      await pressSave();
      act(() => { vi.advanceTimersByTime(600); });   // the first one's 2.5 s are up
      expect(saveLine()!.textContent).toBe("Saved!");
      act(() => { vi.advanceTimersByTime(2000); });  // and now the second one's
      expect(saveLine()!.textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("⚕️ a follow-up the server did not take stays in its boxes, and is not in the log as if recorded", async () => {
    updateMock.mockRejectedValue(new TypeError("Failed to fetch"));
    sheet(admission());
    fireEvent.change(bpBox(), { target: { value: "90/60" } });
    await pressSaveFollowUp();
    expect(notSavedBox().textContent).toContain(STILL_HERE);
    expect(bpBox().value).toBe("90/60");
    expect(document.body.textContent).not.toMatch(/BP 90\/60/);

    // The connection is back: the same press records it, once.
    await pressOk();
    updateMock.mockReset();
    updateMock.mockResolvedValue({});
    await pressSaveFollowUp();
    expect(updateMock).toHaveBeenCalledTimes(1);
    const sent = sentInput().clinical.followUps as { bp?: string }[];
    expect(sent).toHaveLength(1);
    expect(sent[0].bp).toBe("90/60");
    expect(bpBox().value).toBe("");
    expect(document.body.textContent).toMatch(/BP 90\/60/);
  });

  it("the top Save that fails keeps the typed vitals in their boxes too", async () => {
    updateMock.mockRejectedValue(new ApiError(502, "Request failed (502)"));
    sheet(admission());
    fireEvent.change(bpBox(), { target: { value: "90/60" } });
    await pressSave();
    expect(notSavedBox()).toBeTruthy();
    expect(bpBox().value).toBe("90/60");
    expect(document.body.textContent).not.toMatch(/BP 90\/60/);
  });

  it("a follow-up joins the log when the server has it, and what was typed while it was on its way stays", async () => {
    const answer = deferred<unknown>();
    updateMock.mockReturnValue(answer.promise);
    sheet(admission());
    fireEvent.change(bpBox(), { target: { value: "90/60" } });
    await pressSaveFollowUp();
    // On its way: still in its box, not yet in the log.
    expect(bpBox().value).toBe("90/60");
    expect(document.body.textContent).not.toMatch(/BP 90\/60/);
    const hr = screen.getByLabelText("Heart Rate") as HTMLInputElement;
    fireEvent.change(hr, { target: { value: "88" } });
    await act(async () => { answer.resolve({}); });
    expect(document.body.textContent).toMatch(/BP 90\/60/);
    expect(bpBox().value).toBe("");
    // Typed after the press, so not sent: kept, never thrown away as "saved".
    expect(hr.value).toBe("88");
    expect(document.body.textContent).not.toMatch(/HR 88/);
  });

  it("one save at a time: a press while one is on its way sends nothing, and no follow-up is logged twice", async () => {
    const answer = deferred<unknown>();
    updateMock.mockReturnValue(answer.promise);
    sheet(admission());
    fireEvent.change(bpBox(), { target: { value: "90/60" } });
    await pressSaveFollowUp();
    await pressSave();
    expect(updateMock).toHaveBeenCalledTimes(1);
    await act(async () => { answer.resolve({}); });
    expect(document.body.textContent!.match(/BP 90\/60/g)).toHaveLength(1);
  });

  it("⚕️ a sheet closed before the answer came is not told that everything is still here", async () => {
    const answer = deferred<unknown>();
    updateMock.mockReturnValue(answer.promise);
    render(<DialogHost />);
    const { unmount } = render(<IpdDetailView admission={admission()} onBack={() => {}} />);
    await pressSave();
    unmount();   // "Back to ward", or another tab, while the save was on its way
    await act(async () => { answer.reject(new TypeError("Failed to fetch")); });
    const box = notSavedBox();
    expect(box.textContent).toContain(CHECK_CONNECTION);
    expect(box.textContent).not.toContain(STILL_HERE);
    expect(box.textContent).toMatch(/no longer on the screen/);
  });
});

