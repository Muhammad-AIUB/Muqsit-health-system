// @vitest-environment jsdom
//
// The calendar the OPD queue's date opens (physician's sheet, 28/10/2026:
// "clicking on the date opens the calendar"). Every day can be LOOKED at; the
// ones that have passed are marked, because they are locked — kept as they were,
// not editable. The keys that MOVE along the days never CHOOSE one: choosing a
// day changes the whole screen under the doctor's hands, so only a click, Enter
// or Space does it.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { itKeepsTheKeyboard } from "@/test/dialogKeyboard";
import OpdDayPicker from "./OpdDayPicker";

afterEach(cleanup);

const TODAY = "2026-10-28";
const open = (over: Partial<Parameters<typeof OpdDayPicker>[0]> = {}) => {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(<OpdDayPicker value={TODAY} today={TODAY} onPick={onPick} onClose={onClose} {...over} />);
  return { onPick, onClose };
};
const day = (key: string) => document.querySelector<HTMLButtonElement>(`[data-day="${key}"]`) as HTMLButtonElement;

describe("OpdDayPicker", () => {
  it("shows the month of the chosen day, and says what it is", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Choose a date" })).toBeTruthy();
    expect(screen.getByText("October 2026")).toBeTruthy();
  });

  it("every day of the month is a button, named in full", () => {
    open();
    expect(document.querySelectorAll("[data-day]")).toHaveLength(31);
    expect(screen.getByRole("button", { name: /^28 October 2026/ })).toBeTruthy();
  });

  it("the chosen day, today, and the days that have passed are told apart — for a screen reader too", () => {
    open({ value: "2026-10-30" });
    expect(day("2026-10-30").getAttribute("aria-pressed")).toBe("true");
    expect(day("2026-10-28").getAttribute("data-relation")).toBe("today");
    expect(day("2026-10-28").getAttribute("aria-label")).toMatch(/today/i);
    expect(day("2026-10-27").getAttribute("data-relation")).toBe("past");
    expect(day("2026-10-27").getAttribute("aria-label")).toMatch(/locked/i);
    expect(day("2026-10-29").getAttribute("data-relation")).toBe("future");
    expect(day("2026-10-29").getAttribute("aria-label")).not.toMatch(/locked/i);
  });

  it("a click on a day chooses it — a later day, and a past one to look at", () => {
    const { onPick } = open();
    fireEvent.click(day("2026-10-31"));
    expect(onPick).toHaveBeenLastCalledWith("2026-10-31");
    fireEvent.click(day("2026-10-20"));
    expect(onPick).toHaveBeenLastCalledWith("2026-10-20");
  });

  it("the arrows go to the next and the previous month", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("November 2026")).toBeTruthy();
    expect(document.querySelectorAll("[data-day]")).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("September 2026")).toBeTruthy();
  });

  it("'Today' chooses today, wherever the calendar has been taken", () => {
    const { onPick } = open({ value: "2027-02-14" });
    expect(screen.getByText("February 2027")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onPick).toHaveBeenCalledWith(TODAY);
  });

  it("says that a past day is locked", () => {
    open();
    expect(screen.getByText(/days that have passed are locked/i)).toBeTruthy();
  });

  describe("keys that move do not choose", () => {
    // Starts from the state in which a bad rule WOULD choose: the focus is on a
    // day and a key is pressed.
    const press = (key: string) => fireEvent.keyDown(document.activeElement as Element, { key });

    it("the arrows move the focus along the days and across the weeks", () => {
      const { onPick } = open();
      day(TODAY).focus();
      press("ArrowRight");
      expect(document.activeElement).toBe(day("2026-10-29"));
      press("ArrowDown");
      expect(document.activeElement).toBe(day("2026-11-05"));
      expect(screen.getByText("November 2026")).toBeTruthy();
      press("ArrowLeft");
      expect(document.activeElement).toBe(day("2026-11-04"));
      press("ArrowUp");
      expect(document.activeElement).toBe(day("2026-10-28"));
      expect(onPick).not.toHaveBeenCalled();
    });

    it("the last day of a month goes on to the first of the next", () => {
      open({ value: "2026-10-31" });
      day("2026-10-31").focus();
      press("ArrowRight");
      expect(screen.getByText("November 2026")).toBeTruthy();
      expect(document.activeElement).toBe(day("2026-11-01"));
    });

    it("Page Down and Page Up go by months, never past the end of a shorter one", () => {
      const { onPick } = open({ value: "2026-10-31" });
      day("2026-10-31").focus();
      press("PageDown");
      expect(document.activeElement).toBe(day("2026-11-30"));
      press("PageUp");
      expect(screen.getByText("October 2026")).toBeTruthy();
      expect(onPick).not.toHaveBeenCalled();
    });

    it("ONE Tab stop in the grid: the day the focus is on", () => {
      open();
      const stops = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-day]")).filter((b) => b.tabIndex === 0);
      expect(stops.map((b) => b.dataset.day)).toEqual([TODAY]);
    });
  });
});

describe("OpdDayPicker is a popup like the others", () => {
  itKeepsTheKeyboard({
    label: "Choose a date",
    render: (onClose) => <OpdDayPicker value={TODAY} today={TODAY} onPick={() => undefined} onClose={onClose} />,
  });
});
