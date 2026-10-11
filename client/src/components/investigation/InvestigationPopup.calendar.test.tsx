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

// By the day's own aria-label, read straight off the element: asking the test
// library to work out the name of every button in the popup, for each day
// looked up, made these tests seconds long.
const day = (n: number) => {
  const el = document.querySelector<HTMLButtonElement>(`button[aria-label^="${n} September 2026"]`);
  if (!el) throw new Error(`no button for ${n} September 2026`);
  return el;
};
const box = (name: string) => document.querySelector<HTMLInputElement>(`[role="dialog"] input[aria-label="${name}"]`);
const press = (key: string) => fireEvent.keyDown(document.activeElement as Element, { key });
const chosen = () => (ctx.setCalDate as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as Date).getDate());
const mock = (name: string) => ctx[name] as ReturnType<typeof vi.fn>;

// A haemoglobin typed into the CBC card and not yet added: "CBC" and its "Hb"
// field are the catalog's own (data/investigations.ts), the number is a
// stand-in for whatever the doctor was in the middle of typing.
const HALF_TYPED = { CBC__Hb: "12.5" };
/** What a state setter was asked to do, applied to `before`. */
const applied = <T,>(setter: string, before: T): T => {
  let v = before;
  for (const [arg] of mock(setter).mock.calls) v = typeof arg === "function" ? (arg as (p: T) => T)(v) : (arg as T);
  return v;
};

describe("Investigation calendar — the days from the keyboard", () => {
  it("every day of the month is a button that says its whole date", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    for (const n of [1, 9, 30]) expect(day(n).tagName).toBe("BUTTON");
    // Once through the accessibility tree itself: a button, named by its date.
    expect(screen.getByRole("button", { name: "9 September 2026" })).toBe(day(9));
    expect(document.querySelector('button[aria-label^="31 September"]')).toBeNull();
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

  // The rule the arrows exist to keep. With nothing typed, "the date was not
  // changed" proves little: what must not happen is the FILING — a result the
  // doctor has not finished, written into the record under a date, because a
  // key was pressed to look along the calendar.
  it("⚕️ with a result half typed, the arrows file nothing, clear nothing and change no date", () => {
    ctx = fresh({ invFormData: HALF_TYPED });
    render(<InvestigationPopup />);
    day(9).focus();
    for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "End", "Home", "ArrowRight"]) press(key);
    expect(document.activeElement).toBe(day(2));
    expect(ctx.setInvestigation).not.toHaveBeenCalled(); // nothing written to the findings
    expect(ctx.setInvFormData).not.toHaveBeenCalled(); // the half-typed value is still in its box
    expect(ctx.setCalDate).not.toHaveBeenCalled();
    expect(ctx.setShowInvPopup).not.toHaveBeenCalled();
  });

  it("⚕️ choosing a day files what is half typed under the OLD date first, and only then changes the date", () => {
    ctx = fresh({ invFormData: HALF_TYPED });
    render(<InvestigationPopup />);
    fireEvent.click(day(17));
    // Filed under the 9th — the date it was being typed for — never the 17th.
    expect(applied<string[]>("setInvestigation", [])).toEqual(["09/09/2026:CBC:Hb:12.5g/dL"]);
    // …its box emptied, so it cannot be filed a second time under the new date…
    expect(applied<Record<string, string>>("setInvFormData", HALF_TYPED)).toEqual({});
    // …and all of that BEFORE the date moved.
    expect(chosen()).toEqual([17]);
    const filedAt = Math.min(...mock("setInvestigation").mock.invocationCallOrder);
    const movedAt = Math.min(...mock("setCalDate").mock.invocationCallOrder);
    expect(filedAt).toBeLessThan(movedAt);
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

  // Enter on the month's name opens the list and leaves the focus ON the
  // name. Escape there went past the list to the popup: it closed the whole
  // Investigation popup, which files whatever is half typed on the way out.
  it("⚕️ Escape with the focus still on the month's name closes the list — not the popup", () => {
    ctx = fresh({ showMonthPicker: true, invFormData: HALF_TYPED });
    render(<InvestigationPopup />);
    const label = screen.getAllByRole("button", { name: "September" }).find((b) => b.hasAttribute("aria-expanded")) as HTMLElement;
    label.focus();
    expect(fireEvent.keyDown(label, { key: "Escape" })).toBe(false); // the key did its one job
    expect(ctx.setShowMonthPicker).toHaveBeenCalledWith(false);
    expect(ctx.setShowInvPopup).not.toHaveBeenCalled();
    expect(ctx.setInvestigation).not.toHaveBeenCalled();
  });

  it("with the list closed, Escape on the month's name is the popup's own again", () => {
    ctx = fresh({ showMonthPicker: false });
    render(<InvestigationPopup />);
    const label = screen.getAllByRole("button", { name: "September" }).find((b) => b.hasAttribute("aria-expanded")) as HTMLElement;
    label.focus();
    fireEvent.keyDown(label, { key: "Escape" });
    expect(ctx.setShowInvPopup).toHaveBeenCalledWith(false);
  });

  it("the month's own name says whether its list is open", () => {
    ctx = fresh({ showMonthPicker: true });
    render(<InvestigationPopup />);
    const label = screen.getAllByRole("button", { name: "September" }).find((b) => b.hasAttribute("aria-expanded"));
    expect(label?.getAttribute("aria-expanded")).toBe("true");
  });
});

// A number box showed its unit as a placeholder and had no name of its own:
// "g/dL, edit text" to a screen reader, on a card of sixteen boxes — and the
// placeholder goes the moment a digit is typed. The words are the catalog's.
describe("Investigation popup — a result box says which value it takes", () => {
  it("a box with one unit is named by its field and unit", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    expect(box("Hb (g/dL)")?.placeholder).toBe("g/dL");
    expect(box("RBC (million/uL)")?.placeholder).toBe("million/uL");
  });

  it("a box whose field is only called 'Value' is named by its test, once for each unit", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    // Fibrinogen: one value, two units, converted as it is typed.
    expect(box("Fibrinogen (g/L)")?.placeholder).toBe("g/L");
    expect(box("Fibrinogen (mg/L)")?.placeholder).toBe("mg/L");
  });

  it("no result box on the page is left without a name", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    const unnamed = Array.from(document.querySelectorAll<HTMLInputElement>('[role="dialog"] input:not([type="file"]):not([type="checkbox"])'))
      .filter((el) => !el.getAttribute("aria-label") && !el.closest("label"))
      // the search box and the free-text line carry their words as a placeholder; they are not results
      .filter((el) => !/Search test name|Type any investigation finding|DDMMYY/i.test(el.placeholder));
    expect(unnamed.map((el) => el.placeholder)).toEqual([]);
  });
});
