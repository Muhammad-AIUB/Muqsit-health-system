// @vitest-environment jsdom
//
// A test's report thumbnail opens the image viewer BESIDE the form
// (physician's request, 2026-10-15) — it used to open a new browser tab. The
// viewer closes on its own; the popup, and whatever is half typed in it, stay.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  uploadImage: vi.fn(),
}));
vi.mock("@/hooks/useActivity", () => ({ useActivityLog: () => vi.fn() }));
vi.mock("@/hooks/useInvestigationPrefs", () => ({ useInvestigationPrefs: () => ({ favourites: [], unitPrefs: {} }) }));
vi.mock("./CalcRenderer", () => ({ default: () => null }));

let ctx: Record<string, unknown>;
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));

import InvestigationPopup from "./InvestigationPopup";

vi.setConfig({ testTimeout: 30_000 });

const D = "09/09/2026";
const fresh = () => ({
  showInvPopup: true, setShowInvPopup: vi.fn(),
  calDate: new Date(2026, 8, 9), setCalDate: vi.fn(), showMonthPicker: false, setShowMonthPicker: vi.fn(),
  invSearch: "", setInvSearch: vi.fn(), invActiveCat: "Hematology", setInvActiveCat: vi.fn(),
  invFormData: {}, setInvFormData: vi.fn(),
  investigation: [`${D}:CBC:[image attached]`, `${D}:ESR:[image attached]`],
  setInvestigation: vi.fn(),
  invImages: { [`${D}:CBC`]: "/u/cbc.jpg", [`${D}:ESR`]: "/u/esr.jpg" },
  setInvImages: vi.fn(),
  setHiddenInvestigation: vi.fn(),
  reportImages: [], saveReportImages: vi.fn(),
});

afterEach(cleanup);

const viewer = () => screen.queryByRole("region", { name: "Report image viewer" });

describe("Investigation popup — the image viewer beside the form", () => {
  it("a test's thumbnail opens its image beside the form, not in a new tab", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    expect(viewer()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View CBC report image" }));
    expect(viewer()).not.toBeNull();
    expect(screen.getByText("CBC · image 1 of 1")).toBeTruthy();
    // The form is still there beside it.
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("› goes on to the next test's image of the same day", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    fireEvent.click(screen.getByRole("button", { name: "View CBC report image" }));
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByText("ESR · image 1 of 1")).toBeTruthy();
  });

  it("Escape closes the viewer and leaves the popup open", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    fireEvent.click(screen.getByRole("button", { name: "View CBC report image" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(viewer()).toBeNull();
    expect(ctx.setShowInvPopup as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("its own × closes it", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    fireEvent.click(screen.getByRole("button", { name: "View CBC report image" }));
    fireEvent.click(screen.getByRole("button", { name: "Close the image viewer" }));
    expect(viewer()).toBeNull();
  });
});
