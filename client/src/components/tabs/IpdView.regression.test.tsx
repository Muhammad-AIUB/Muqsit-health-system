// @vitest-environment jsdom
//
// Regression for 82101b6 — "admit/event failures are shown" (the Admit half).
//
// `submitAdmit` awaited the mutation with no catch: a refused admission (409
// "Bed B-3 is already occupied") became an unhandled rejection, nothing was
// said on screen, and the form sat there as if the click had not registered.
// The fix shows the server's own sentence beside the form and KEEPS the form
// filled, so the doctor only has to change the bed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import IpdView from "./IpdView";
import { ApiError } from "@/lib/api";

// A jsdom render of these screens takes seconds on the dev machine; the
// default 5 s is the failure mode there, not the code.
vi.setConfig({ testTimeout: 30_000 });

const admitMock = vi.fn();
vi.mock("@/hooks/useIpd", () => ({
  useIpdList: () => ({ data: [], isLoading: false, error: null }),
  useAdmitIpd: () => ({ mutateAsync: admitMock, isPending: false }),
  useSetIpdStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useWards", () => ({ useWards: () => ({ data: [] }) }));
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ({ loadPatientById: vi.fn(), setActiveTab: vi.fn() }) }));
vi.mock("@/components/ipd/IpdDetailView", () => ({ default: () => null }));
// The lookup is the only way to a patient since 18/10/2026 (item 5); this
// stand-in picks one at a press.
vi.mock("@/components/prescription/PatientMobileLookup", () => ({
  default: ({ onPick }: { onPick: (p: unknown) => void }) => (
    <button type="button" onClick={() => onPick({ id: "p1", name: "Patient", mobile: "01711111111" })}>pick patient</button>
  ),
}));

// Braces matter: a function RETURNED from beforeEach is run as its teardown.
beforeEach(() => { admitMock.mockReset(); });
afterEach(cleanup);

const fillAndAdmit = async () => {
  render(<IpdView />);
  fireEvent.click(screen.getByText("+ Admit patient"));
  fireEvent.click(screen.getByText("pick patient"));
  fireEvent.change(screen.getByPlaceholderText("Bed (e.g. B-3)"), { target: { value: "B-3" } });
  await act(async () => { fireEvent.click(screen.getByText("Admit")); });
};

describe("82101b6: a refused admission is shown, not swallowed", () => {
  it("shows the server's own reason and keeps the form filled", async () => {
    admitMock.mockRejectedValue(new ApiError(409, "Bed B-3 is already occupied"));
    await fillAndAdmit();
    expect(screen.getByRole("alert").textContent).toBe("Bed B-3 is already occupied");
    // The form is still open with what was typed — only the bed needs changing.
    expect(screen.getByLabelText("Patient").textContent).toBe("Patient");
    expect((screen.getByPlaceholderText("Bed (e.g. B-3)") as HTMLInputElement).value).toBe("B-3");
  });

  it("says the connection failed when the failure is not the server's", async () => {
    admitMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await fillAndAdmit();
    expect(screen.getByRole("alert").textContent).toMatch(/Could not admit/);
    expect(screen.getByLabelText("Patient").textContent).toBe("Patient");
  });

  it("clears the reason on the next attempt, and closes the form once the admission lands", async () => {
    admitMock.mockRejectedValueOnce(new ApiError(409, "Bed B-3 is already occupied")).mockResolvedValueOnce({});
    await fillAndAdmit();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Bed (e.g. B-3)"), { target: { value: "B-4" } });
    await act(async () => { fireEvent.click(screen.getByText("Admit")); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("pick patient")).toBeNull(); // form closed
    expect(admitMock.mock.calls[1][0]).toMatchObject({ bed: "B-4", name: "Patient" });
  });

  it("sends only what was typed — blank optional fields are left out, never sent as empty strings", async () => {
    admitMock.mockResolvedValue({});
    await fillAndAdmit();
    const sent = admitMock.mock.calls[0][0];
    // The chosen patient is always sent (18/10/2026, item 5); the rest only when typed.
    expect(sent).toMatchObject({ bed: "B-3", name: "Patient", patientId: "p1", mobile: "01711111111" });
    expect(sent).not.toHaveProperty("wardId");
    for (const k of ["hospitalId", "roomNo", "wardNo", "floorBuilding", "diagnosis"]) expect(sent[k], k).toBeUndefined();
  });
});
