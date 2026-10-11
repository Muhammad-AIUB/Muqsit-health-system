// @vitest-environment jsdom
//
// The Investigation popup's calendar, from the keyboard.
//
// ⚕️ The day chosen here is the date every finding typed below is stamped with,
// and changing it first files whatever is half typed under the OLD date. So the
// keyboard may move ALONG the days freely, but only Enter or Space — a
// deliberate press, the same as a click — may choose one.
//
// Until 2026-10-12 the days were plain clickable boxes with no keyboard route at
// all (the date box above them was the only way), and the month list could be
// opened from the keyboard but none of its months could then be chosen.

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

// 9 September 2026 is chosen: a 30-day month, with a day well inside it.
const fresh = (over: Record<string, unknown> = {}) => ({
  showInvPopup: true, setShowInvPopup: vi.fn(),
  calDate: new Date(2026, 8, 9), setCalDate: vi.fn(), showMonthPicker: false, setShowMonthPicker: vi.fn(),
  invSearch: "", setInvSearch: vi.fn(), invActiveCat: "Hematology", setInvActiveCat: vi.fn(),
  invFormData: {}, setInvFormData: vi.fn(),
  investigation: [], setInvestigation: vi.fn(), invImages: {}, setInvImages: vi.fn(),
  setHiddenInvestigation: vi.fn(),
  reportImages: [], saveReportImages: vi.fn(),
  ...over,
});

afterEach(cleanup);

const day = (n: number) => screen.getByRole("button", { name: new RegExp(`^${n} September 2026`) }) as HTMLButtonElement;
const press = (key: string) => fireEvent.keyDown(document.activeElement as Element, { key });
const chosen = () => (ctx.setCalDate as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as Date).getDate());

describe("Investigation calendar — the days from the keyboard", () => {
  it("every day of the month is a button that says its whole date", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    for (const n of [1, 9, 30]) expect(day(n).tagName).toBe("BUTTON");
    expect(screen.queryByRole("button", { name: /^31 September/ })).toBeNull();
  });

  it("the calendar is ONE Tab stop — the chosen day — not thirty", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    const stops = Array.from({ length: 30 }, (_, i) => day(i + 1)).filter((b) => b.tabIndex === 0);
    expect(stops).toEqual([day(9)]);
    expect(day(9).getAttribute("aria-pressed")).toBe("true");
    expect(day(10).getAttribute("aria-pressed")).toBe("false");
  });

  it("⚕️ the arrows move along the days WITHOUT choosing one", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    day(9).focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(day(10));
    press("ArrowDown"); // a week on
    expect(document.activeElement).toBe(day(17));
    press("ArrowLeft");
    expect(document.activeElement).toBe(day(16));
    press("ArrowUp"); // a week back
    expect(document.activeElement).toBe(day(9));
    press("End");
    expect(document.activeElement).toBe(day(30));
    press("Home");
    expect(document.activeElement).toBe(day(1));
    // Nothing was chosen, so nothing half typed was filed under another date.
    expect(ctx.setCalDate).not.toHaveBeenCalled();
  });

  it("the arrows stop at the ends of the month — a new month is a deliberate press on its own button", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    day(1).focus();
    press("ArrowLeft");
    expect(document.activeElement).toBe(day(1));
    press("ArrowUp");
    expect(document.activeElement).toBe(day(1));
    day(30).focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(day(30));
    day(27).focus();
    press("ArrowDown"); // the 34th does not exist
    expect(document.activeElement).toBe(day(27));
    expect(ctx.setCalDate).not.toHaveBeenCalled();
  });

  it("an arrow is the calendar's own key: it does not scroll the popup under it", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    day(9).focus();
    expect(press("ArrowDown")).toBe(false); // default prevented
  });

  it("pressing a day chooses it, exactly as a click always did", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    // Enter and Space on a real <button> ARE a click; the browser sees to that.
    fireEvent.click(day(17));
    expect(chosen()).toEqual([17]);
    const picked = (ctx.setCalDate as ReturnType<typeof vi.fn>).mock.calls[0][0] as Date;
    expect([picked.getFullYear(), picked.getMonth()]).toEqual([2026, 8]);
  });

  it("today is marked for a screen reader as well as by colour", () => {
    const now = new Date();
    ctx = fresh({ calDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()) });
    render(<InvestigationPopup />);
    const todays = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-current") === "date");
    expect(todays).toHaveLength(1);
    expect(todays[0].textContent).toBe(String(now.getDate()));
  });
});

describe("Investigation calendar — the month list from the keyboard", () => {
  it("each month in the open list is a button", () => {
    ctx = fresh({ showMonthPicker: true });
    render(<InvestigationPopup />);
    const march = screen.getByRole("button", { name: "March" });
    expect(march.tagName).toBe("BUTTON");
    fireEvent.click(march);
    const picked = (ctx.setCalDate as ReturnType<typeof vi.fn>).mock.calls[0][0] as Date;
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate()]).toEqual([2026, 2, 1]);
    expect(ctx.setShowMonthPicker).toHaveBeenCalledWith(false);
  });

  it("⚕️ Escape closes the month list only — not the popup and what is typed in it", () => {
    ctx = fresh({ showMonthPicker: true });
    render(<InvestigationPopup />);
    const march = screen.getByRole("button", { name: "March" });
    march.focus();
    fireEvent.keyDown(march, { key: "Escape" });
    expect(ctx.setShowMonthPicker).toHaveBeenCalledWith(false);
    expect(ctx.setShowInvPopup).not.toHaveBeenCalled();
  });

  it("the month's own name says whether its list is open", () => {
    ctx = fresh({ showMonthPicker: true });
    render(<InvestigationPopup />);
    const label = screen.getAllByRole("button", { name: "September" }).find((b) => b.hasAttribute("aria-expanded"));
    expect(label?.getAttribute("aria-expanded")).toBe("true");
  });
});
