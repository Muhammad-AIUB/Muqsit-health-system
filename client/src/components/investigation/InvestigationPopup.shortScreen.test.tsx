// @vitest-environment jsdom
//
// On a short screen (a 1366×768 laptop) the calendar's month of days took so
// much height that the tests below showed one row of boxes (physician's report,
// 2026-10-15). There the days fold away behind a "Days" button; the date, the
// typed-date box and the ±M / ±Y / Today buttons stay. A tall screen is as it was.

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

const fresh = () => ({
  showInvPopup: true, setShowInvPopup: vi.fn(),
  calDate: new Date(2026, 8, 9), setCalDate: vi.fn(), showMonthPicker: false, setShowMonthPicker: vi.fn(),
  invSearch: "", setInvSearch: vi.fn(), invActiveCat: "Hematology", setInvActiveCat: vi.fn(),
  invFormData: {}, setInvFormData: vi.fn(),
  investigation: [], setInvestigation: vi.fn(), invImages: {}, setInvImages: vi.fn(),
  setHiddenInvestigation: vi.fn(),
  reportImages: [], saveReportImages: vi.fn(),
});

// The window is short or tall, as the browser would say.
const screenIs = (short: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: short && q.includes("max-height"), media: q,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const dayButton = (n: number) => document.querySelector(`button[aria-label^="${n} September 2026"]`);
const toggle = () => screen.queryByRole("button", { name: /Days/ });

describe("Investigation popup — the calendar on a short screen", () => {
  it("a tall screen shows the month's days, with no fold", () => {
    screenIs(false);
    ctx = fresh();
    render(<InvestigationPopup />);
    expect(dayButton(9)).not.toBeNull();
    expect(toggle()).toBeNull();
  });

  it("a short screen folds the days away, and keeps the date and the jumps", () => {
    screenIs(true);
    ctx = fresh();
    render(<InvestigationPopup />);
    expect(dayButton(9)).toBeNull();
    expect(toggle()!.getAttribute("aria-expanded")).toBe("false");
    // The chosen date is still in view, and still changeable without the grid.
    expect(screen.getByText("Wednesday")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+1M" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "-1Y" })).toBeTruthy();
  });

  it("the Days button opens the month, and closes it again", () => {
    screenIs(true);
    ctx = fresh();
    render(<InvestigationPopup />);
    fireEvent.click(toggle()!);
    expect(toggle()!.getAttribute("aria-expanded")).toBe("true");
    expect(dayButton(9)).not.toBeNull();
    fireEvent.click(dayButton(12)!);
    expect((ctx.setCalDate as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    fireEvent.click(toggle()!);
    expect(dayButton(9)).toBeNull();
  });
});
