// @vitest-environment jsdom
//
// ⚕️ Physician's sheet, 18/10/2026, item 5: "IPD teo patient a mobile number
// first a dia patient add korte hobe, jar data already ase oita to name show
// korbe". Admitting starts with the mobile number, as the OPD queue does since
// 15/10/2026: a patient saved on the number is chosen and their name is shown;
// "Add New" opens the lookup's own new-patient box. The admission is always
// tied to a patient record — the name is not typed by hand.

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Patient } from "@/lib/api";

const byMobile = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  patientsApi: {
    byMobile: (...a: unknown[]) => byMobile(...a),
    relativesByMobile: () => Promise.resolve([]),
    create: vi.fn(), link: vi.fn(), get: vi.fn(),
  },
}));
const admitMock = vi.fn();
vi.mock("@/hooks/useIpd", () => ({
  useIpdList: () => ({ data: [], isLoading: false, error: null }),
  useAdmitIpd: () => ({ mutateAsync: admitMock, isPending: false }),
  useSetIpdStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useWards", () => ({ useWards: () => ({ data: [] }) }));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ loadPatientById: vi.fn(), setActiveTab: vi.fn(), activeWorkstationId: null }) }));
vi.mock("@/components/ipd/IpdDetailView", () => ({ default: () => null }));

import IpdView from "./IpdView";

vi.setConfig({ testTimeout: 30_000 });
afterEach(() => { cleanup(); byMobile.mockReset(); admitMock.mockReset(); });

const SAVED = { id: "p1", name: "srii nornob", mobile: "01827115684", hospitalId: "H-77" } as Patient;
const openForm = () => fireEvent.click(screen.getByText("+ Admit patient"));
const mobileBox = () => screen.getByRole("textbox", { name: "Mobile" });
const bedBox = () => screen.getByRole("textbox", { name: "Bed" });
const admitBtn = () => screen.getByRole("button", { name: "Admit" }) as HTMLButtonElement;

describe("IPD — a patient is admitted by mobile number first", () => {
  it("the mobile number is the first box, and the name cannot be typed", () => {
    render(<IpdView />);
    openForm();
    const boxes = screen.getAllByRole("textbox");
    expect(boxes[0]).toBe(mobileBox());
    expect(screen.queryByRole("textbox", { name: "Patient name" })).toBeNull();
  });

  it("a patient saved on the number is chosen, and their name is shown", async () => {
    byMobile.mockResolvedValue([SAVED]);
    render(<IpdView />);
    openForm();
    fireEvent.change(mobileBox(), { target: { value: "01827115684" } });
    const row = await screen.findByText("srii nornob", {}, { timeout: 3000 });
    await act(async () => { fireEvent.mouseDown(row); fireEvent.click(row); });
    expect(screen.getByLabelText("Patient").textContent).toContain("srii nornob");
    fireEvent.change(bedBox(), { target: { value: "B-3" } });
    await act(async () => { fireEvent.click(admitBtn()); });
    expect(admitMock).toHaveBeenCalledWith(expect.objectContaining({ name: "srii nornob", patientId: "p1", mobile: "01827115684", hospitalId: "H-77", bed: "B-3" }));
  });

  it("Admit waits for a chosen patient, and says so", () => {
    render(<IpdView />);
    openForm();
    fireEvent.change(mobileBox(), { target: { value: "01827115684" } });
    fireEvent.change(bedBox(), { target: { value: "B-3" } });
    expect(admitBtn().disabled).toBe(true);
    expect(admitBtn().title).toMatch(/mobile number/i);
  });

  it("changing the number after choosing lets go of the patient", async () => {
    byMobile.mockResolvedValue([SAVED]);
    render(<IpdView />);
    openForm();
    fireEvent.change(mobileBox(), { target: { value: "01827115684" } });
    const row = await screen.findByText("srii nornob", {}, { timeout: 3000 });
    await act(async () => { fireEvent.mouseDown(row); fireEvent.click(row); });
    fireEvent.change(mobileBox(), { target: { value: "0182711568" } });
    fireEvent.change(bedBox(), { target: { value: "B-3" } });
    expect(admitBtn().disabled).toBe(true);
    expect(screen.queryByText("srii nornob")).toBeNull();
  });
});

// Review, 18/10/2026: the Hospital ID belongs to the chosen patient.
describe("IPD — the Hospital ID follows the chosen patient", () => {
  const pick = async (name: string) => {
    const row = await screen.findByText(name, {}, { timeout: 3000 });
    await act(async () => { fireEvent.mouseDown(row); fireEvent.click(row); });
  };
  const hospital = () => screen.getByRole("textbox", { name: "Hospital ID" }) as HTMLInputElement;

  it("is taken back when the number changes, and not carried to a patient without one", async () => {
    byMobile.mockResolvedValueOnce([SAVED]).mockResolvedValueOnce([{ id: "p2", name: "Karim", mobile: "01711111111" } as Patient]);
    render(<IpdView />);
    openForm();
    fireEvent.change(mobileBox(), { target: { value: "01827115684" } });
    await pick("srii nornob");
    expect(hospital().value).toBe("H-77");
    fireEvent.change(mobileBox(), { target: { value: "01711111111" } });
    expect(hospital().value).toBe("");
    await pick("Karim");
    fireEvent.change(bedBox(), { target: { value: "B-4" } });
    await act(async () => { fireEvent.click(admitBtn()); });
    expect(admitMock.mock.calls[0][0].hospitalId).toBeUndefined();
  });

  it("a chosen record with no name says why Admit waits", async () => {
    byMobile.mockResolvedValue([{ id: "p3", name: "", mobile: "01827115684" } as Patient]);
    render(<IpdView />);
    openForm();
    fireEvent.change(mobileBox(), { target: { value: "01827115684" } });
    // The record's row: its name is empty, so it reads as its number.
    const row = (await screen.findAllByRole("button", { name: /^\s*01827115684/ }, { timeout: 3000 }))[0];
    await act(async () => { fireEvent.mouseDown(row); fireEvent.click(row); });
    fireEvent.change(bedBox(), { target: { value: "B-4" } });
    expect(admitBtn().disabled).toBe(true);
    expect(admitBtn().title).toMatch(/no name/i);
  });
});
