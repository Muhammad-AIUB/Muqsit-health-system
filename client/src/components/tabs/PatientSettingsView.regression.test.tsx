// @vitest-environment jsdom
//
// Regressions on Patient Settings for three review-pass fixes that shipped
// without a test of their own.
//
// 60b39bc — "religion no longer defaults to 'Islam' when unrecorded" (the FORM
//   half; `patientToPtInfo` is pinned in patientForm.test.ts). The Religion
//   <select> had no blank option, so an unrecorded religion DISPLAYED as the
//   first option, "Islam" — and the next Save wrote it onto the record. Same
//   rule as sex: what nobody recorded stays unrecorded.
//
// 60b39bc — the patient photo belongs to the patient it was picked for. An
//   upload that finished after the doctor switched patients put patient A's
//   photo on patient B's form (where B's next Save would store it) and PATCHed
//   whichever patient was current.
//
// 35e7039 — "family-tree removal confirms". × removed a relative on one click,
//   with a whole-list write and no way back.
//   2026-10-06: the question is the app's own box now (lib/dialogs.ts), not the
//   browser's `confirm()`, so these answer THAT box — what is asserted is the
//   same. Because the page stays live while it asks, two cases were added: the
//   answer is applied to the tree as it is then, and never to another patient.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { patientToPtInfo } from "@/lib/patientForm";
import { makePatient } from "@/test/fixtures";
import { deferred } from "@/test/apiStub";

const uploadImage = vi.fn();
const updatePatientApi = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  uploadImage: (...a: unknown[]) => uploadImage(...a),
  patientsApi: { update: (...a: unknown[]) => updatePatientApi(...a) },
}));
vi.mock("@/hooks/usePatients", () => ({
  useCreatePatient: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePatient: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("./SupervisingDoctors", () => ({ default: () => null }));

let ctx: Record<string, unknown>;
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));

import PatientSettingsView from "./PatientSettingsView";
import DialogHost from "@/components/common/DialogHost";

// A jsdom render of these screens takes seconds on the dev machine; the
// default 5 s is the failure mode there, not the code.
vi.setConfig({ testTimeout: 30_000 });

const fresh = (over: Record<string, unknown> = {}) => ({
  ptInfo: patientToPtInfo(makePatient({ id: "A" })),
  setPtInfo: vi.fn(),
  ptSettingsTab: "info", setPtSettingsTab: vi.fn(),
  familyMembers: [], saveFamilyMembers: vi.fn(), showFamilyForm: false, setShowFamilyForm: vi.fn(),
  familyRelation: "Spouse", setFamilyRelation: vi.fn(),
  familyForm: { name: "", mobile: "", nid: "", sex: "" }, setFamilyForm: vi.fn(),
  ptName: "Patient", ptGender: "", ptPhone: "", setPtName: vi.fn(), setPtAge: vi.fn(), setPtGender: vi.fn(), setPtPhone: vi.fn(),
  setPtAddress: vi.fn(), setPtHospitalId: vi.fn(),
  currentPatientId: "A", setCurrentPatientId: vi.fn(), hmDrugs: new Set<string>(), watchPatient: false, can: () => true,
  ptEditing: true, setPtEditing: vi.fn(),
  ...over,
});

beforeEach(() => { uploadImage.mockReset(); updatePatientApi.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const selectUnder = (label: string) => screen.getByText(label).parentElement!.querySelector("select") as HTMLSelectElement;

describe("60b39bc: an unrecorded religion is shown — and stays — blank", () => {
  it("the form shows '—', not the first religion in the list", () => {
    ctx = fresh(); // makePatient(): religion null
    render(<PatientSettingsView />);
    const religion = selectUnder("Religion");
    expect(religion.value).toBe("");
    expect(religion.options[0].value).toBe("");
    expect(religion.options[0].textContent).toBe("—");
    expect(religion.selectedOptions[0].textContent).toBe("—");
  });

  it("a recorded religion is shown as recorded", () => {
    ctx = fresh({ ptInfo: patientToPtInfo(makePatient({ religion: "Hinduism" })) });
    render(<PatientSettingsView />);
    expect(selectUnder("Religion").value).toBe("Hinduism");
  });

  it("the same holds for sex: an unrecorded sex is blank on the form", () => {
    ctx = fresh();
    render(<PatientSettingsView />);
    expect(selectUnder("Sex *").value).toBe("");
  });
});

describe("60b39bc: a photo upload that finishes after the patient changed", () => {
  const pick = async () => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
  };

  it("⚕️ is saved on the patient it was picked for, and never shown on the next patient's form", async () => {
    const gate = deferred();
    uploadImage.mockImplementation(() => gate.promise.then(() => "/uploads/photo-of-A.jpg"));
    updatePatientApi.mockResolvedValue({});
    ctx = fresh();
    const { rerender } = render(<PatientSettingsView />);
    await pick();

    // The doctor opens patient B while the upload is still in flight.
    const setPtInfoForB = vi.fn();
    ctx = { ...ctx, currentPatientId: "B", ptInfo: patientToPtInfo(makePatient({ id: "B" })), setPtInfo: setPtInfoForB };
    rerender(<PatientSettingsView />);
    await act(async () => { gate.release(); await gate.promise; await Promise.resolve(); });

    expect(updatePatientApi).toHaveBeenCalledTimes(1);
    expect(updatePatientApi).toHaveBeenCalledWith("A", { pictureUrl: "/uploads/photo-of-A.jpg" });
    expect(setPtInfoForB).not.toHaveBeenCalled();
  });

  it("with no switch, the photo goes onto the form and the same patient's record", async () => {
    uploadImage.mockResolvedValue("/uploads/photo-of-A.jpg");
    updatePatientApi.mockResolvedValue({});
    ctx = fresh();
    render(<PatientSettingsView />);
    await pick();
    const setPtInfo = ctx.setPtInfo as ReturnType<typeof vi.fn>;
    expect(setPtInfo).toHaveBeenCalledTimes(1);
    const update = setPtInfo.mock.calls[0][0] as (p: Record<string, unknown>) => Record<string, unknown>;
    expect(update({ name: "Patient", picture: null })).toEqual({ name: "Patient", picture: "/uploads/photo-of-A.jpg" });
    expect(updatePatientApi).toHaveBeenCalledWith("A", { pictureUrl: "/uploads/photo-of-A.jpg" });
  });
});

describe("35e7039: removing a relative from the family tree asks first", () => {
  const FAMILY = [
    { name: "Relative One", mobile: "", nid: "", sex: "Female", relation: "Mother" },
    { name: "Relative Two", mobile: "", nid: "", sex: "Male", relation: "Brother" },
  ];

  const view = () => <><PatientSettingsView /><DialogHost /></>;
  const ask = async (nth = 0) => {
    await act(async () => { fireEvent.click(screen.getAllByTitle("Remove from family tree")[nth]); });
    return screen.getByRole("alertdialog");
  };
  const answer = (label: string) => act(async () => { fireEvent.click(screen.getByRole("button", { name: label })); });

  it("⚕️ does nothing when the doctor cancels", async () => {
    ctx = fresh({ ptSettingsTab: "family", familyMembers: FAMILY });
    render(view());
    const box = await ask();
    expect(box.textContent).toContain("Relative One");
    expect(box.textContent).toContain("Mother");
    // Nothing is written while the question is still open.
    expect(ctx.saveFamilyMembers).not.toHaveBeenCalled();
    await answer("Cancel");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(ctx.saveFamilyMembers).not.toHaveBeenCalled();
  });

  it("removes exactly that relative once confirmed", async () => {
    ctx = fresh({ ptSettingsTab: "family", familyMembers: FAMILY });
    render(view());
    await ask();
    await answer("Remove");
    expect(ctx.saveFamilyMembers).toHaveBeenCalledTimes(1);
    expect(ctx.saveFamilyMembers).toHaveBeenCalledWith([FAMILY[1]]);
  });

  it("still asks — through the browser's own box — on a page with no dialog host", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    ctx = fresh({ ptSettingsTab: "family", familyMembers: FAMILY });
    render(<PatientSettingsView />);
    await act(async () => { fireEvent.click(screen.getAllByTitle("Remove from family tree")[0]); });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(String(confirm.mock.calls[0][0])).toContain("Relative One");
    expect(ctx.saveFamilyMembers).not.toHaveBeenCalled();
  });

  it("⚕️ a relative added while the question was open is kept: the answer is applied to the tree as it is THEN", async () => {
    ctx = fresh({ ptSettingsTab: "family", familyMembers: FAMILY });
    const { rerender } = render(view());
    await ask(1); // Relative Two (Brother)
    // Another device links a third relative; the list is rebuilt around them.
    const THREE = [{ ...FAMILY[0] }, { name: "Relative Three", mobile: "", nid: "", sex: "Female", relation: "Sister" }, { ...FAMILY[1] }];
    const saveNow = vi.fn();
    ctx = { ...ctx, familyMembers: THREE, saveFamilyMembers: saveNow };
    rerender(view());
    await answer("Remove");
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(saveNow).toHaveBeenCalledWith([THREE[0], THREE[1]]);
  });

  it("⚕️ removes nothing when another patient was opened while the question was on screen", async () => {
    ctx = fresh({ ptSettingsTab: "family", familyMembers: FAMILY });
    const { rerender } = render(view());
    await ask();
    const saveB = vi.fn();
    const saveA = ctx.saveFamilyMembers;
    ctx = { ...ctx, currentPatientId: "B", familyMembers: [{ ...FAMILY[0] }], saveFamilyMembers: saveB };
    rerender(view());
    await answer("Remove");
    expect(saveA).not.toHaveBeenCalled();
    expect(saveB).not.toHaveBeenCalled();
  });
});

// 2026-10-06 — the photo's × asks through the app's own box as well. The page
// stays live while it asks, so the answer has to be about the patient who was
// on screen when it was asked: the same rule the upload above follows.
describe("removing the patient's photo asks first, and only ever touches the patient it asked about", () => {
  const withPhoto = (id = "A") => ({ ...patientToPtInfo(makePatient({ id })), picture: `/uploads/photo-of-${id}.jpg` });
  const view = () => <><PatientSettingsView /><DialogHost /></>;
  const ask = async () => {
    await act(async () => { fireEvent.click(screen.getByTitle("Remove photo")); });
    return screen.getByRole("alertdialog");
  };
  const answer = (label: string) =>
    act(async () => { fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: label })); });

  it("cancelling leaves the photo where it is", async () => {
    ctx = fresh({ ptInfo: withPhoto() });
    render(view());
    expect((await ask()).textContent).toContain("Remove this patient's photo?");
    await answer("Cancel");
    expect(updatePatientApi).not.toHaveBeenCalled();
    expect(ctx.setPtInfo).not.toHaveBeenCalled();
  });

  it("confirming clears it on that patient's record and on the form", async () => {
    updatePatientApi.mockResolvedValue({});
    ctx = fresh({ ptInfo: withPhoto() });
    render(view());
    await ask();
    await answer("Remove photo");
    expect(updatePatientApi).toHaveBeenCalledTimes(1);
    expect(updatePatientApi).toHaveBeenCalledWith("A", { pictureUrl: null });
    const setPtInfo = ctx.setPtInfo as ReturnType<typeof vi.fn>;
    expect(setPtInfo).toHaveBeenCalledTimes(1);
    const update = setPtInfo.mock.calls[0][0] as (p: Record<string, unknown>) => Record<string, unknown>;
    expect(update({ name: "Patient", picture: "/uploads/photo-of-A.jpg" })).toEqual({ name: "Patient", picture: null });
  });

  it("⚕️ another patient opened while it asked: neither record is touched", async () => {
    ctx = fresh({ ptInfo: withPhoto("A") });
    const { rerender } = render(view());
    await ask();
    const setPtInfoForB = vi.fn();
    ctx = { ...ctx, currentPatientId: "B", ptInfo: withPhoto("B"), setPtInfo: setPtInfoForB };
    rerender(view());
    await answer("Remove photo");
    expect(updatePatientApi).not.toHaveBeenCalled();
    expect(setPtInfoForB).not.toHaveBeenCalled();
  });
});
