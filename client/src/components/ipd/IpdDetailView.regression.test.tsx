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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ApiError, type IpdAdmission, type IpdClinical } from "@/lib/api";

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

beforeEach(() => { updateMock.mockReset(); addEventMock.mockReset(); updateMock.mockResolvedValue({}); });
afterEach(cleanup);

const pressSave = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); }); };
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
