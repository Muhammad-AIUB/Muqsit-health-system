// @vitest-environment jsdom
//
// The physician's sheet of 15/10/2026, item 5: "OPD te patient add korte
// prothome number chabe … Add patient a sudhu number dia suru korbe." Adding a
// patient to the OPD queue starts with the mobile number and nothing else. The
// name / age / sex / visit-type boxes and their Add button were crossed out on
// the sheet. A patient saved on that number is offered as now; "Add New" opens
// the new-patient box the prescription header uses; whoever is chosen or
// created goes straight onto the queue, tied to their record.

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Patient } from "@/lib/api";
import { dhakaToday } from "@/lib/opdDay";

const byMobile = vi.fn();
const create = vi.fn();
vi.mock("@/lib/api", () => ({
  patientsApi: {
    byMobile: (...a: unknown[]) => byMobile(...a),
    relativesByMobile: () => Promise.resolve([]),
    create: (...a: unknown[]) => create(...a),
    link: vi.fn(),
    get: vi.fn(),
  },
}));

const ctx = {
  setPtName: vi.fn(), setPtAge: vi.fn(), setPtGender: vi.fn(), setPtPhone: vi.fn(), setActiveTab: vi.fn(),
  setRxItems: vi.fn(), setCurrentPatientId: vi.fn(), setPtInfo: vi.fn(), resetEditor: vi.fn(), flushEditorDraft: vi.fn(), loadPatientById: vi.fn(),
  activeWorkstationId: null,
};
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));

const addVisit = vi.fn();
vi.mock("@/hooks/useOpd", () => ({
  useOpdQueue: () => ({ data: [], isLoading: false, error: null }),
  useAddOpdVisit: () => ({ mutateAsync: addVisit, isPending: false }),
  useSetOpdStatus: () => ({ mutate: vi.fn() }),
  useOpdSchedule: () => ({ data: undefined, isLoading: false, error: null }),
  useMoveOpdVisit: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveOpdSchedule: () => ({ mutateAsync: vi.fn() }),
}));

import OpdView from "./OpdView";

vi.setConfig({ testTimeout: 30_000 });

// The day on show — a patient is added to it (the queue is booked by day).
const TODAY = dhakaToday();

afterEach(() => { cleanup(); byMobile.mockReset(); create.mockReset(); addVisit.mockReset(); });

const SAVED: Patient = { id: "p1", name: "mr shahariar", mobile: "01827115684", age: 38, ageAsOfYear: new Date().getFullYear(), sex: "Male" } as Patient;

const openForm = () => fireEvent.click(screen.getByRole("button", { name: "+ Add to queue" }));
const typeNumber = (n: string) => fireEvent.change(screen.getByRole("textbox", { name: "Mobile" }), { target: { value: n } });

describe("OPD — a patient is added by mobile number first", () => {
  it("the form asks for the mobile number and nothing else", () => {
    render(<OpdView />);
    openForm();
    expect(screen.getByRole("textbox", { name: "Mobile" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Patient name" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Age" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Sex" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Visit type" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });

  it("a patient saved on the number is offered, and choosing them puts them on the queue", async () => {
    byMobile.mockResolvedValue([SAVED]);
    addVisit.mockResolvedValue({});
    render(<OpdView />);
    openForm();
    typeNumber("01827115684");
    const row = await screen.findByText("mr shahariar", {}, { timeout: 3000 });
    await act(async () => { fireEvent.click(row); });
    expect(addVisit).toHaveBeenCalledTimes(1);
    expect(addVisit).toHaveBeenCalledWith({ name: "mr shahariar", patientId: "p1", phone: "01827115684", age: 38, gender: "Male", date: TODAY });
    // Done: the form closes, ready for the next patient.
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Mobile" })).toBeNull());
  });

  it("a sex or age that was never recorded is not sent", async () => {
    byMobile.mockResolvedValue([{ id: "p2", name: "Rahim", mobile: "01711111111", sex: null, age: null } as unknown as Patient]);
    addVisit.mockResolvedValue({});
    render(<OpdView />);
    openForm();
    typeNumber("01711111111");
    const row = await screen.findByText("Rahim", {}, { timeout: 3000 });
    await act(async () => { fireEvent.click(row); });
    expect(addVisit).toHaveBeenCalledWith({ name: "Rahim", patientId: "p2", phone: "01711111111", age: undefined, gender: undefined, date: TODAY });
  });

  it("no patient on the number: Add New opens the new-patient box, and the new patient joins the queue", async () => {
    byMobile.mockResolvedValue([]);
    create.mockResolvedValue({ id: "p9", name: "Karim", mobile: "01722222222", sex: "Male", age: null });
    addVisit.mockResolvedValue({});
    render(<OpdView />);
    openForm();
    typeNumber("01722222222");
    fireEvent.click(await screen.findByText("Add New", {}, { timeout: 3000 }));
    expect(screen.getByText("Add new patient")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Karim" } });
    await act(async () => { fireEvent.click(screen.getByText("Save")); });
    await waitFor(() => expect(addVisit).toHaveBeenCalledWith({ name: "Karim", patientId: "p9", phone: "01722222222", age: undefined, gender: "Male", date: TODAY }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "Karim", mobile: "01722222222" }));
  });

  // Found in the independent review before release (17/10/2026): a pick goes
  // straight to the queue, and the server gives a new token every time — so a
  // second pick while the first is on its way put one patient on the queue
  // twice. The old Add button was disabled while it was pending.
  it("⚕️ a second pick while the first is on its way adds the patient once", async () => {
    byMobile.mockResolvedValue([SAVED]);
    let land: (v: unknown) => void = () => undefined;
    addVisit.mockImplementation(() => new Promise((r) => { land = r; }));
    render(<OpdView />);
    openForm();
    typeNumber("01827115684");
    const row = await screen.findByText("mr shahariar", {}, { timeout: 3000 });
    act(() => { fireEvent.click(row); fireEvent.click(row); });
    expect(addVisit).toHaveBeenCalledTimes(1);
    await act(async () => { land({}); });
    expect(addVisit).toHaveBeenCalledTimes(1);
  });

  it("a failed add says so and keeps the number, so it can be tried again", async () => {
    byMobile.mockResolvedValue([SAVED]);
    addVisit.mockRejectedValueOnce(new Error("Network down"));
    render(<OpdView />);
    openForm();
    typeNumber("01827115684");
    const row = await screen.findByText("mr shahariar", {}, { timeout: 3000 });
    await act(async () => { fireEvent.click(row); });
    expect(await screen.findByText(/could not add mr shahariar to the queue/i)).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Mobile" }) as HTMLInputElement).value).toBe("01827115684");
  });
});
