// @vitest-environment jsdom
//
// A day's chamber schedule (physician's sheet, 28/10/2026): Start time, Break,
// and the time for each patient. Three rules hold the box:
//   - what is typed stays in its box until the server has it, and Save clears
//     only what it SENT — the times shown on the rows come from the saved
//     schedule, never from a box half typed (a patient is told those times);
//   - what cannot be a schedule is said in words and not sent;
//   - a day that has passed is shown and cannot be changed.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { OpdScheduleAnswer } from "@/lib/api";
import OpdScheduleBar from "./OpdScheduleBar";

afterEach(cleanup);

const TODAY = "2026-10-28";
const SAVED: OpdScheduleAnswer = { day: "2026-10-29", startTime: "18:00", breakStart: "20:00", breakEnd: "21:00", minutesPerPatient: 10, saved: true };

const mount = (over: Partial<Parameters<typeof OpdScheduleBar>[0]> = {}) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<OpdScheduleBar day="2026-10-29" today={TODAY} schedule={SAVED} onSave={onSave} {...over} />);
  return { onSave };
};
const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const type = (name: string, value: string) => fireEvent.change(box(name), { target: { value } });
const saveButton = () => screen.getByRole("button", { name: "Save schedule" }) as HTMLButtonElement;

describe("OpdScheduleBar", () => {
  it("shows the day's schedule in boxes that each have a caption", () => {
    mount();
    expect(box("Start time").value).toBe("18:00");
    expect(box("Break from").value).toBe("20:00");
    expect(box("Break to").value).toBe("21:00");
    expect(box("Minutes per patient").value).toBe("10");
  });

  it("nothing changed: nothing to save", () => {
    mount();
    expect(saveButton().disabled).toBe(true);
  });

  it("a changed box can be saved, and sends the whole schedule for THIS day", async () => {
    const { onSave } = mount();
    type("Minutes per patient", "15");
    expect(saveButton().disabled).toBe(false);
    await act(async () => { fireEvent.click(saveButton()); });
    expect(onSave).toHaveBeenCalledWith({ date: "2026-10-29", startTime: "18:00", breakStart: "20:00", breakEnd: "21:00", minutesPerPatient: 15 });
  });

  it("a break can be taken off by emptying both of its boxes", async () => {
    const { onSave } = mount();
    type("Break from", "");
    type("Break to", "");
    await act(async () => { fireEvent.click(saveButton()); });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ breakStart: null, breakEnd: null }));
  });

  it("⚕️ what is not a schedule is said in words and NOT sent", async () => {
    const { onSave } = mount();
    type("Break to", "");
    await act(async () => { fireEvent.click(saveButton()); });
    expect(onSave).not.toHaveBeenCalled();
    expect((await screen.findByRole("alert")).textContent).toBe("A break needs both its start and its end.");
  });

  it("a break that ends before it starts is refused in the same way", async () => {
    const { onSave } = mount();
    type("Break from", "21:30");
    await act(async () => { fireEvent.click(saveButton()); });
    expect(onSave).not.toHaveBeenCalled();
    expect((await screen.findByRole("alert")).textContent).toBe("The break must end after it starts.");
  });

  it("minutes that are not a whole number from 1 to 120 are refused", async () => {
    const { onSave } = mount();
    for (const bad of ["0", "121", "2.5", ""]) {
      type("Minutes per patient", bad);
      await act(async () => { fireEvent.click(saveButton()); });
      expect(screen.getByRole("alert").textContent, bad).toMatch(/minutes/i);
    }
    expect(onSave).not.toHaveBeenCalled();
  });

  it("⚕️ a save clears only what it sent: words typed while it is on its way stay", async () => {
    let land: () => void = () => undefined;
    const onSave = vi.fn(() => new Promise<void>((r) => { land = r; }));
    mount({ onSave });
    type("Minutes per patient", "12");
    await act(async () => { fireEvent.click(saveButton()); });
    type("Start time", "17:30"); // typed while the first is on its way
    await act(async () => { land(); });
    expect(box("Start time").value).toBe("17:30");
    expect(saveButton().disabled).toBe(false); // still something to save
  });

  it("a save that failed says so, keeps what was typed, and can be pressed again", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValue(undefined);
    mount({ onSave });
    type("Minutes per patient", "12");
    await act(async () => { fireEvent.click(saveButton()); });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not save/i);
    expect(alert.textContent).not.toMatch(/socket hang up/); // never the raw error
    expect(box("Minutes per patient").value).toBe("12");
    await act(async () => { fireEvent.click(saveButton()); });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("the server's own sentence is shown when it is one written for a doctor (a 400)", async () => {
    const refused = Object.assign(new Error("The break must end after it starts."), { status: 400 });
    const onSave = vi.fn().mockRejectedValue(refused);
    mount({ onSave });
    type("Minutes per patient", "12");
    await act(async () => { fireEvent.click(saveButton()); });
    expect((await screen.findByRole("alert")).textContent).toBe("The break must end after it starts.");
  });

  it("a day that has passed is shown, and cannot be changed", () => {
    mount({ day: "2026-10-27", schedule: { ...SAVED, day: "2026-10-27" } });
    for (const name of ["Start time", "Break from", "Break to", "Minutes per patient"]) expect(box(name).disabled, name).toBe(true);
    expect(screen.queryByRole("button", { name: "Save schedule" })).toBeNull();
    expect(screen.getByText(/has passed/i)).toBeTruthy();
  });

  it("a day on an earlier day's schedule says so, and that it is saved with the first patient", () => {
    mount({ schedule: { ...SAVED, saved: false } });
    expect(screen.getByText(/schedule of an earlier day/i)).toBeTruthy();
  });

  it("a day with its own schedule says nothing of the sort", () => {
    mount();
    expect(screen.queryByText(/schedule of an earlier day/i)).toBeNull();
  });

  it("the boxes are those of the day on show: another day starts clean", () => {
    const { rerender } = render(<OpdScheduleBar day="2026-10-29" today={TODAY} schedule={SAVED} onSave={vi.fn()} />);
    type("Minutes per patient", "15");
    rerender(<OpdScheduleBar day="2026-10-30" today={TODAY} schedule={{ ...SAVED, day: "2026-10-30", minutesPerPatient: 20 }} onSave={vi.fn()} />);
    expect(box("Minutes per patient").value).toBe("20");
    expect(saveButton().disabled).toBe(true);
  });

  it("the Save button says it is saving while it is", async () => {
    let land: () => void = () => undefined;
    mount({ onSave: vi.fn(() => new Promise<void>((r) => { land = r; })) });
    type("Minutes per patient", "12");
    await act(async () => { fireEvent.click(saveButton()); });
    await waitFor(() => expect(screen.getByRole("button", { name: /saving/i })).toBeTruthy());
    await act(async () => { land(); });
  });
});
