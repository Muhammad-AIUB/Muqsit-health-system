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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("⚕️ does nothing when the doctor cancels", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    ctx = fresh({ ptSettingsTab: "family", familyMembers: FAMILY });
    render(<PatientSettingsView />);
    fireEvent.click(screen.getAllByTitle("Remove from family tree")[0]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain("Relative One");
    expect(confirm.mock.calls[0][0]).toContain("Mother");
    expect(ctx.saveFamilyMembers).not.toHaveBeenCalled();
  });

  it("removes exactly that relative once confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    ctx = fresh({ ptSettingsTab: "family", familyMembers: FAMILY });
    render(<PatientSettingsView />);
    fireEvent.click(screen.getAllByTitle("Remove from family tree")[0]);
    expect(ctx.saveFamilyMembers).toHaveBeenCalledTimes(1);
    expect(ctx.saveFamilyMembers).toHaveBeenCalledWith([FAMILY[1]]);
  });
});
