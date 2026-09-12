// @vitest-environment jsdom
//
// ⚕️ Reported 2026-09-12: "when I click the save button nothing shows in the
// network tab". Static reading of the code found nothing wrong — the handler is
// bound, it calls the API, the API calls fetch, the route exists — so this file
// exists to answer the question the code could not: does pressing the real
// button actually reach the API?
//
// These tests drive the real component through Testing Library and assert on
// the API call, not on the markup. A green suite here means the client is
// sound and any remaining failure is environmental (stale build, filtered
// Network tab); a red one names the bug.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const update = vi.fn();
const get = vi.fn();

vi.mock("@/lib/api", () => ({
  prescriptionLayoutApi: {
    get: (...a: unknown[]) => get(...a),
    update: (...a: unknown[]) => update(...a),
  },
  // The component narrows on `instanceof ApiError` in its catch.
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));

vi.mock("@/hooks/usePrescriptionLayout", () => ({
  useUpdatePrescriptionLayout: () => ({ mutate: vi.fn() }),
}));

import PrescriptionSettingsView from "./PrescriptionSettingsView";

const SAVED = {
  rxType: "opd", opdLayout: "single", unit: "cm",
  totalHeight: "27", totalWidth: "18.5", leftMargin: "2", rightMargin: "",
  headerHeight: "4.5", footerHeight: "3",
  headerSplit: false, headerAlign: "left",
  headerHtml: "", headerLeftHtml: "", headerRightHtml: "", footerHtml: "",
  bodySplit: "", bodyLeftTopMargin: "0", bodyRightTopMargin: "0", bodyBottomLine: false,
};

afterEach(cleanup);
beforeEach(() => {
  update.mockReset();
  get.mockReset();
  get.mockResolvedValue({ ...SAVED });
  update.mockResolvedValue({ ...SAVED });
});

/** Chooser → OPD wizard, which is where the Save button lives. */
async function openOpdWizard() {
  render(<PrescriptionSettingsView onBack={() => {}} />);
  fireEvent.click(screen.getByText("OPD prescription"));
  // The page-setup fields only appear once the GET has resolved into state.
  await waitFor(() => expect(screen.getByDisplayValue("18.5")).toBeTruthy());
}

const saveButton = () =>
  screen.getAllByRole("button").find((b) => /save/i.test(b.textContent ?? ""))!;

describe("Prescription settings — the Save button", () => {
  // The reported symptom, stated as a test: press Save, something must go out.
  it("sends the layout to the API when pressed", async () => {
    await openOpdWizard();
    expect(update).not.toHaveBeenCalled();

    fireEvent.click(saveButton());

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toMatchObject({
      unit: "cm", totalHeight: "27", totalWidth: "18.5", leftMargin: "2", headerHeight: "4.5",
    });
  });

  // The button must not be disabled once the settings have loaded — a disabled
  // button was the leading theory for "nothing happens".
  it("is enabled once the settings have loaded", async () => {
    await openOpdWizard();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(false);
  });

  // A value the doctor typed has to be the value that is sent. This is the
  // "saved but nothing persisted" class of bug, caught on the client side.
  it("sends the edited value, not the loaded one", async () => {
    await openOpdWizard();
    fireEvent.change(screen.getByDisplayValue("2"), { target: { value: "5" } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toMatchObject({ leftMargin: "5" });
  });

  // ⚕️ The doctor must be TOLD the save landed. The confirmation used to render
  // at `left: 0` of a full-width footer — hundreds of px from the button, in
  // 12px type — which is why a working save could read as a dead button.
  it("confirms on screen that it saved", async () => {
    await openOpdWizard();
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText("Saved.")).toBeTruthy());
  });

  // …and must say so when it fails, rather than failing silently.
  it("reports a failure instead of going quiet", async () => {
    update.mockRejectedValue(new Error("network down"));
    await openOpdWizard();
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(/Save failed/i)).toBeTruthy());
  });
});
