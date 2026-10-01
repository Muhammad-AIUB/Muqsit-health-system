// @vitest-environment jsdom
//
// Regression for 35e7039 — "religion never defaults to 'Islam'" (the two list
// screens; the form and `patientToPtInfo` are pinned elsewhere).
//
// Two places built a blank patient form with `religion: "Islam"`:
//   • PatientsView's "+ New patient", and
//   • OpdView's "Prescribe" on a queue row that has no saved patient yet.
// The first Save from either wrote a religion nobody had recorded onto a
// patient's record. client/CLAUDE.md states the rule for sex — "Never default a
// missing sex … an unrecorded sex must stay unrecorded" — and the fix applies it
// to the rest of the identity block. These tests pin the whole blank form: every
// field the doctor did not fill arrives EMPTY.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { OpdVisit } from "@/lib/api";
import type { PtInfo } from "@/types";

let ctx: Record<string, ReturnType<typeof vi.fn> | null>;
const freshCtx = () => ({
  setPtName: vi.fn(), setPtAge: vi.fn(), setPtGender: vi.fn(), setPtPhone: vi.fn(), setActiveTab: vi.fn(),
  setRxItems: vi.fn(), setActiveTemplate: vi.fn(), setCurrentPatientId: vi.fn(), setPtInfo: vi.fn(),
  resetEditor: vi.fn(), loadPatientById: vi.fn(), loadPatient: vi.fn(), setPtSettingsTab: vi.fn(),
  activeWorkstationId: null,
});
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));

let queue: OpdVisit[] = [];
vi.mock("@/hooks/useOpd", () => ({
  useOpdQueue: () => ({ data: queue, isLoading: false, error: null }),
  useAddOpdVisit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetOpdStatus: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/usePatients", () => ({ usePatients: () => ({ data: [], isLoading: false, isError: false, error: null }) }));
vi.mock("@/components/prescription/PatientMobileLookup", () => ({ default: () => null }));

import OpdView from "./OpdView";
import PatientsView from "./PatientsView";

// A jsdom render of these screens takes seconds on the dev machine; the
// default 5 s is the failure mode there, not the code.
vi.setConfig({ testTimeout: 30_000 });

afterEach(cleanup);

const visit = (over: Partial<OpdVisit>): OpdVisit => ({
  id: "v1", patientId: null, name: "Patient", phone: "01700000000", age: null, gender: null,
  type: "New", token: "T-1", status: "waiting", rxStatus: null, createdAt: "2026-09-07T04:00:00.000Z", ...over,
});

/** Every identity field that must arrive blank unless the doctor typed it. */
const NEVER_DEFAULTED: (keyof PtInfo)[] = ["religion", "ethnicity", "bloodGroup", "dob", "district", "nid", "hospitalId", "monthlyIncome"];

describe("35e7039: PatientsView — '+ New patient' opens a form with nothing pre-filled", () => {
  it("⚕️ religion and sex are blank, like every other field", () => {
    ctx = freshCtx();
    render(<PatientsView />);
    fireEvent.click(screen.getByRole("button", { name: "+ New patient" }));
    const info = ctx.setPtInfo!.mock.calls[0][0] as PtInfo;
    expect(info.religion).toBe("");
    expect(info.sex).toBe("");
    expect(info.age).toBe("");
    for (const k of NEVER_DEFAULTED) expect(info[k], k).toBe("");
    // A new patient is a new editor: nothing of the previous one is kept.
    expect(ctx.resetEditor).toHaveBeenCalledTimes(1);
    expect(ctx.setCurrentPatientId).toHaveBeenCalledWith(null);
  });
});

describe("35e7039: OpdView — 'Prescribe' on a walk-in with no saved record", () => {
  const prescribe = (v: Partial<OpdVisit>) => {
    ctx = freshCtx();
    queue = [visit(v)];
    render(<OpdView />);
    fireEvent.click(screen.getByText("Prescribe"));
    return ctx.setPtInfo!.mock.calls[0][0] as PtInfo;
  };

  it("⚕️ fills only what the queue row holds — religion is blank, never 'Islam'", () => {
    const info = prescribe({});
    expect(info.name).toBe("Patient");
    expect(info.mobile).toBe("01700000000");
    expect(info.religion).toBe("");
    for (const k of NEVER_DEFAULTED) expect(info[k], k).toBe("");
  });

  it("an unrecorded sex and age stay unrecorded in the editor", () => {
    const info = prescribe({ gender: null, age: null });
    expect(info.sex).toBe("");
    expect(info.age).toBe("");
    expect(ctx.setPtGender).toHaveBeenCalledWith("");
    expect(ctx.setPtAge).toHaveBeenCalledWith("");
  });

  // The queue column holds both spellings (client/CLAUDE.md): read through
  // normaliseSex, a woman stored as "Female" is not loaded as Male.
  it.each([["Female", "Female"], ["F", "Female"], ["M", "Male"], ["Other", "Other"], ["x", ""]])(
    "loads queue sex %j into the editor as %j",
    (stored, expected) => {
      expect(prescribe({ gender: stored }).sex).toBe(expected);
      expect(ctx.setPtGender).toHaveBeenCalledWith(expected);
    },
  );

  it("a row that HAS a saved patient loads that record instead of a blank form", () => {
    ctx = freshCtx();
    queue = [visit({ patientId: "p9" })];
    render(<OpdView />);
    fireEvent.click(screen.getByText("Prescribe"));
    expect(ctx.loadPatientById).toHaveBeenCalledWith("p9");
    expect(ctx.setPtInfo).not.toHaveBeenCalled();
  });
});
