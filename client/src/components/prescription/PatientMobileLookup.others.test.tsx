// @vitest-environment jsdom
//
// Other doctors' patients on a number (physician's sheet, 16/11/2026): the lookup
// lists them apart from the doctor's own, shows enough to tell them apart and
// nothing of the record, and opens them only through the patient's own code. An
// isolated practice looks for none.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  byMobile: vi.fn(),
  search: vi.fn(),
  workstation: { current: null as null | { doctorId: string; isolated?: boolean } },
}));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  patientsApi: {
    byMobile: mocks.byMobile,
    relativesByMobile: () => Promise.resolve([]),
    create: vi.fn(),
    link: vi.fn(),
    get: vi.fn(),
  },
  patientAccessApi: { search: mocks.search, requestCode: vi.fn(), verify: vi.fn() },
}));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({ activeWorkstationId: mocks.workstation.current?.doctorId ?? null, activeWorkstation: mocks.workstation.current }),
}));

import PatientMobileLookup from "./PatientMobileLookup";

const OTHER = { id: "o1", name: "Rahima Begum", sex: "Female", age: 34 };
const NUMBER = "01712345678";

const mount = () => render(<PatientMobileLookup value={NUMBER} onChange={() => {}} onPick={vi.fn()} />);

beforeEach(() => {
  mocks.workstation.current = null;
  mocks.byMobile.mockResolvedValue([]);
  mocks.search.mockResolvedValue({ isolated: false, patients: [OTHER] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("PatientMobileLookup — other doctors' patients on the number", () => {
  it("lists them apart, with name, age and sex, and says they need the patient's code", async () => {
    mount();
    const group = await screen.findByRole("group", { name: "Other doctors' patients on this number" }, { timeout: 3000 });
    expect(group.textContent).toContain("Rahima Begum");
    expect(group.textContent).toContain("34y · Female");
    expect(group.textContent).toContain("Needs the patient's code");
  });

  it("asks the server about THIS number only (no other)", async () => {
    mount();
    await screen.findByRole("group", { name: "Other doctors' patients on this number" }, { timeout: 3000 });
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(mocks.search).toHaveBeenCalledWith(NUMBER);
  });

  it("a click does not load the patient: it opens the code box for that patient", async () => {
    const onPick = vi.fn();
    render(<PatientMobileLookup value={NUMBER} onChange={() => {}} onPick={onPick} />);
    fireEvent.click(await screen.findByText("Rahima Begum", {}, { timeout: 3000 }));
    expect(await screen.findByRole("dialog", { name: "Open Rahima Begum with the patient's code" })).toBeTruthy();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("⚕️ the doctor's own patients are still listed first and are not mixed with the others", async () => {
    mocks.byMobile.mockResolvedValue([{ id: "own1", name: "Karim Uddin", mobile: NUMBER, doctorId: "d1" }]);
    mount();
    const group = await screen.findByRole("group", { name: "Other doctors' patients on this number" }, { timeout: 3000 });
    const own = screen.getByText("Karim Uddin");
    expect(group.contains(own)).toBe(false);
    expect(own.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no other practice's patient: no heading, nothing extra — Add New is there as before", async () => {
    mocks.search.mockResolvedValue({ isolated: false, patients: [] });
    mount();
    await screen.findByText("Add New", {}, { timeout: 3000 });
    expect(screen.queryByRole("group", { name: "Other doctors' patients on this number" })).toBeNull();
  });

  it("a search that fails shows NOTHING extra and never an error over the doctor's own list", async () => {
    mocks.search.mockRejectedValue(new Error("boom"));
    mount();
    await screen.findByText("Add New", {}, { timeout: 3000 });
    expect(screen.queryByRole("group", { name: "Other doctors' patients on this number" })).toBeNull();
    expect(screen.queryByText(/boom/)).toBeNull();
  });

  it("a server that says this practice is isolated lists none, even if it sent some", async () => {
    mocks.search.mockResolvedValue({ isolated: true, patients: [OTHER] });
    mount();
    await screen.findByText("Add New", {}, { timeout: 3000 });
    expect(screen.queryByText("Rahima Begum")).toBeNull();
  });

  it("⚕️ an isolated practice does not even ask the server", async () => {
    mocks.workstation.current = { doctorId: "d1", isolated: true };
    mount();
    await screen.findByText("Add New", {}, { timeout: 3000 });
    expect(mocks.search).not.toHaveBeenCalled();
    expect(screen.queryByText("Rahima Begum")).toBeNull();
  });

  it("fewer than eleven digits asks nobody", async () => {
    render(<PatientMobileLookup value="0171234" onChange={() => {}} onPick={vi.fn()} />);
    await waitFor(() => expect(mocks.byMobile).not.toHaveBeenCalled());
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
