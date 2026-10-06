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

// Save goes through the hook so the print cache is updated; the mock forwards
// to `update` and records what the hook would write into that cache.
const cacheWrites: unknown[] = [];
vi.mock("@/hooks/usePrescriptionLayout", () => ({
  useUpdatePrescriptionLayout: () => ({
    mutate: vi.fn(),
    mutateAsync: async (input: unknown) => {
      const data = await update(input);
      cacheWrites.push(data);
      return data;
    },
  }),
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
  cacheWrites.length = 0;
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

  // ⚕️ The two bands above and below the printable area are "Top margin" and
  // "Bottom margin" (physician's wording, 2026-10-07). They read "Header
  // Height" / "Footer Height", which said the header PRINTS there; it prints
  // inside the printable area, under the top margin. The stored fields keep
  // their old names, so the value under the new caption is still headerHeight.
  it("calls the top and bottom bands margins, over the stored headerHeight / footerHeight", async () => {
    await openOpdWizard();
    expect(screen.getByText("Top margin (cm)")).toBeTruthy();
    expect(screen.getByText("Bottom margin (cm)")).toBeTruthy();
    expect(screen.queryByText(/Header Height/)).toBeNull();
    expect(screen.queryByText(/Footer Height/)).toBeNull();
    // The paper miniature names them the same way.
    expect(screen.getByText(/^Top margin: 4\.5/)).toBeTruthy();
    expect(screen.getByText(/^Bottom margin: 3/)).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue("4.5"), { target: { value: "2" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toMatchObject({ headerHeight: "2", footerHeight: "3" });
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

describe("Prescription settings — a failed load", () => {
  // ⚕️ If the GET fails the form holds built-in defaults and EMPTY header/footer
  // HTML. Saving that would overwrite the doctor's real print layout with blanks.
  it("locks Save and says why when the saved settings could not be loaded", async () => {
    get.mockRejectedValue(new Error("network down"));
    render(<PrescriptionSettingsView onBack={() => {}} />);
    fireEvent.click(screen.getByText("OPD prescription"));
    await waitFor(() => expect(screen.getByText(/Could not load your saved settings/i)).toBeTruthy());

    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(saveButton());
    expect(update).not.toHaveBeenCalled();
  });

  it("Retry re-runs the load and unlocks Save once it succeeds", async () => {
    get.mockRejectedValueOnce(new Error("network down"));
    render(<PrescriptionSettingsView onBack={() => {}} />);
    fireEvent.click(screen.getByText("OPD prescription"));
    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());

    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => expect(screen.getByDisplayValue("18.5")).toBeTruthy());
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Could not load your saved settings/i)).toBeNull();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Prescription settings — the print cache", () => {
  // The printed sheet reads ["prescription-layout"] from React Query; a save
  // that bypassed it printed the old header until the cache went stale.
  it("writes the saved layout through the layout hook (which updates the cache)", async () => {
    await openOpdWizard();
    fireEvent.click(saveButton());
    await waitFor(() => expect(cacheWrites).toHaveLength(1));
    expect(cacheWrites[0]).toMatchObject({ totalWidth: "18.5" });
  });
});
