// @vitest-environment jsdom
//
// The OPD queue is booked by DAY (physician's sheet, 28/10/2026): the date is a
// button that opens a calendar; today's queue is worked as it always was; a LATER
// day can have patients added and put in order; a day that has PASSED is shown as
// it was, locked. Each patient is told a time, worked out from the day's saved
// schedule — start time, break, minutes each.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { patientsApi, type Patient } from "@/lib/api";
import { dayLabel, dhakaToday, shiftDay } from "@/lib/opdDay";

const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  asked: [] as (string | undefined)[],
  schedule: { startTime: "18:00", breakStart: null as string | null, breakEnd: null as string | null, minutesPerPatient: 10, saved: true },
  move: vi.fn(),
  save: vi.fn(),
  setStatus: vi.fn(),
  add: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ patientsApi: { byMobile: vi.fn(), relativesByMobile: () => Promise.resolve([]), create: vi.fn(), link: vi.fn(), get: vi.fn() } }));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    setPtName: vi.fn(), setPtAge: vi.fn(), setPtGender: vi.fn(), setPtPhone: vi.fn(), setActiveTab: vi.fn(),
    setRxItems: vi.fn(), setCurrentPatientId: vi.fn(), setPtInfo: vi.fn(), resetEditor: vi.fn(), flushEditorDraft: vi.fn(), loadPatientById: vi.fn(),
    activeWorkstationId: null,
  }),
}));
vi.mock("@/hooks/useOpd", () => ({
  useOpdQueue: (day?: string) => {
    mocks.asked.push(day);
    return { data: mocks.rows[day ?? ""] ?? [], isLoading: false, error: null, refetch: vi.fn(), isFetching: false };
  },
  useOpdSchedule: (day: string) => ({ data: { day, ...mocks.schedule }, isLoading: false, error: null, refetch: vi.fn(), isFetching: false }),
  useAddOpdVisit: () => ({ mutateAsync: mocks.add, isPending: false }),
  useSetOpdStatus: () => ({ mutate: mocks.setStatus }),
  useMoveOpdVisit: () => ({ mutate: mocks.move, isPending: false }),
  useSaveOpdSchedule: () => ({ mutateAsync: mocks.save }),
}));

import OpdView from "./OpdView";

vi.setConfig({ testTimeout: 30_000 });

const TODAY = dhakaToday();
const LATER = shiftDay(TODAY, 2);
const PAST = shiftDay(TODAY, -2);

const row = (id: string, name: string, token: string, status = "waiting", day = TODAY) => ({
  id, name, token, status, type: "New", phone: "01810101515", age: 34, gender: "Male", patientId: id, rxStatus: null, queueDate: day, position: null,
});
const queueOf = (day: string, ...names: [string, string?][]) =>
  names.map(([n, status], i) => row(`${day}-${i}`, n, `T-0${i + 1}`, status ?? "waiting", day));

beforeEach(() => {
  mocks.rows = {};
  mocks.asked = [];
  mocks.schedule = { startTime: "18:00", breakStart: null, breakEnd: null, minutesPerPatient: 10, saved: true };
  mocks.move.mockReset(); mocks.save.mockReset(); mocks.setStatus.mockReset(); mocks.add.mockReset();
});
afterEach(cleanup);

const dateButton = () => screen.getByRole("button", { name: /^Date: / });
const rowsOf = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>(".queue-row"));
const pickDay = (day: string) => {
  fireEvent.click(dateButton());
  for (let i = 0; i < 3 && !document.querySelector(`[data-day="${day}"]`); i++) {
    fireEvent.click(screen.getByRole("button", { name: day > TODAY ? "Next month" : "Previous month" }));
  }
  fireEvent.click(document.querySelector(`[data-day="${day}"]`) as Element);
};

describe("OPD queue — the day on show", () => {
  it("opens on today, named, and asks for today's queue", () => {
    render(<OpdView />);
    expect(dateButton().textContent).toContain(dayLabel(TODAY));
    expect(mocks.asked.at(-1)).toBe(TODAY);
    expect(screen.getByText("Total today")).toBeTruthy();
  });

  it("the date opens the calendar, and choosing a day closes it and shows that day's queue", () => {
    mocks.rows[LATER] = queueOf(LATER, ["Later Patient"]);
    render(<OpdView />);
    expect(screen.queryByRole("dialog", { name: "Choose a date" })).toBeNull();
    fireEvent.click(dateButton());
    expect(screen.getByRole("dialog", { name: "Choose a date" })).toBeTruthy();
    pickDay(LATER);
    expect(screen.queryByRole("dialog", { name: "Choose a date" })).toBeNull();
    expect(dateButton().textContent).toContain(dayLabel(LATER));
    expect(mocks.asked.at(-1)).toBe(LATER);
    expect(screen.getByText("Later Patient")).toBeTruthy();
    expect(screen.queryByText("Total today")).toBeNull();
    expect(screen.getByText("Total")).toBeTruthy();
  });
});

describe("OPD queue — today is worked as before", () => {
  it("a waiting patient can be prescribed for and marked done", () => {
    mocks.rows[TODAY] = queueOf(TODAY, ["Today Patient"]);
    render(<OpdView />);
    expect(screen.getByRole("button", { name: "Prescribe" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(mocks.setStatus).toHaveBeenCalledWith({ id: `${TODAY}-0`, status: "done" });
  });
});

describe("OPD queue — a later day is booked ahead", () => {
  beforeEach(() => { mocks.rows[LATER] = queueOf(LATER, ["Ahead One"], ["Ahead Two"]); });

  it("patients are not prescribed for or marked done before their day", () => {
    render(<OpdView />);
    pickDay(LATER);
    expect(screen.queryByRole("button", { name: "Prescribe" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("⚕️ a patient added there is added to THAT day — not to today", async () => {
    vi.mocked(patientsApi.byMobile).mockResolvedValue([{ id: "p1", name: "Booked Patient", mobile: "01827115684", age: 38, ageAsOfYear: new Date().getFullYear(), sex: "Male" } as Patient]);
    mocks.add.mockResolvedValue({});
    render(<OpdView />);
    pickDay(LATER);
    const add = screen.getByRole("button", { name: "+ Add to queue" }) as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    fireEvent.change(screen.getByRole("textbox", { name: "Mobile" }), { target: { value: "01827115684" } });
    const found = await screen.findByText("Booked Patient", {}, { timeout: 3000 });
    await act(async () => { fireEvent.click(found); });
    expect(mocks.add).toHaveBeenCalledTimes(1);
    expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ patientId: "p1", date: LATER }));
  });

  it("they can be put in order", () => {
    render(<OpdView />);
    pickDay(LATER);
    fireEvent.click(screen.getByRole("button", { name: "Move Ahead Two up" }));
    expect(mocks.move).toHaveBeenCalledWith({ id: `${LATER}-1`, direction: "up" });
  });
});

describe("OPD queue — a day that has passed is locked", () => {
  beforeEach(() => { mocks.rows[PAST] = queueOf(PAST, ["Old One"], ["Old Two", "done"]); });

  it("is shown as it was, and nothing on it can be changed", () => {
    render(<OpdView />);
    pickDay(PAST);
    expect(screen.getByText("Old One")).toBeTruthy();
    expect(screen.getByText("Old Two")).toBeTruthy();
    for (const name of ["Prescribe", "Done"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
    const add = screen.getByRole("button", { name: "+ Add to queue" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getAllByText(/has passed/i).length).toBeGreaterThan(0);
  });

  it("⚕️ opening the add form is not possible there — and a form left open on today is closed by moving to the past", () => {
    render(<OpdView />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add to queue" }));
    expect(screen.getByRole("textbox", { name: "Mobile" })).toBeTruthy();
    pickDay(PAST);
    expect(screen.queryByRole("textbox", { name: "Mobile" })).toBeNull();
  });
});

describe("OPD queue — the order", () => {
  it("the first cannot go up, the last cannot go down", () => {
    mocks.rows[TODAY] = queueOf(TODAY, ["First"], ["Second"], ["Third"]);
    render(<OpdView />);
    expect((screen.getByRole("button", { name: "Move First up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move First down" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Move Third down" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("someone already seen is not moved, and does not make the next one movable past them", () => {
    mocks.rows[TODAY] = queueOf(TODAY, ["Seen", "done"], ["Waiting A"], ["Waiting B"]);
    render(<OpdView />);
    expect(screen.queryByRole("button", { name: /^Move Seen / })).toBeNull();
    // Nobody WAITING above A: it is at the top, though a seen patient stands there.
    expect((screen.getByRole("button", { name: "Move Waiting A up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move Waiting B up" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("the serial follows the order shown and the token stays with the patient", () => {
    mocks.rows[TODAY] = [row("b", "Second Booked", "T-02"), row("a", "First Booked", "T-01")];
    const { container } = render(<OpdView />);
    const rows = rowsOf(container);
    expect(rows.map((r) => r.querySelector("[data-serial]")?.textContent)).toEqual(["1", "2"]);
    expect(rows[0].textContent).toContain("T-02");
    expect(rows[1].textContent).toContain("T-01");
  });
});

describe("OPD queue — the time each patient is told", () => {
  const timesOf = (c: HTMLElement) => rowsOf(c).map((r) => r.querySelector("[data-time]")?.textContent);

  it("the first at the start time, then every minutes-per-patient later", () => {
    mocks.rows[TODAY] = queueOf(TODAY, ["A"], ["B"], ["C"]);
    const { container } = render(<OpdView />);
    expect(timesOf(container)).toEqual(["6:00 PM", "6:10 PM", "6:20 PM"]);
  });

  it("⚕️ the physician's example: the 12th at 7:50 PM, the 13th after the break at 9:00 PM", () => {
    mocks.schedule = { ...mocks.schedule, breakStart: "20:00", breakEnd: "21:00" };
    mocks.rows[TODAY] = Array.from({ length: 13 }, (_, i) => row(`p${i}`, `Patient ${i + 1}`, `T-${i + 1}`));
    const { container } = render(<OpdView />);
    const t = timesOf(container);
    expect(t[0]).toBe("6:00 PM");
    expect(t[11]).toBe("7:50 PM");
    expect(t[12]).toBe("9:00 PM");
  });

  it("⚕️ the times are the SAVED schedule's — a box half typed changes none of them", () => {
    mocks.rows[TODAY] = queueOf(TODAY, ["A"], ["B"]);
    const { container } = render(<OpdView />);
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText("Minutes per patient"), { target: { value: "30" } });
    expect(timesOf(container)).toEqual(["6:00 PM", "6:10 PM"]);
  });

  it("a patient who has been seen keeps their time", () => {
    mocks.rows[TODAY] = queueOf(TODAY, ["Seen", "done"], ["Next"]);
    const { container } = render(<OpdView />);
    expect(timesOf(container)).toEqual(["6:00 PM", "6:10 PM"]);
  });

  it("the time is named for a screen reader", () => {
    mocks.rows[TODAY] = queueOf(TODAY, ["A"]);
    render(<OpdView />);
    expect(screen.getByLabelText("Time 6:00 PM")).toBeTruthy();
  });

  it("a day that has passed with no schedule of its own was never told a time: none is shown", () => {
    mocks.schedule = { ...mocks.schedule, saved: false };
    mocks.rows[PAST] = queueOf(PAST, ["Old"]);
    const { container } = render(<OpdView />);
    pickDay(PAST);
    expect(timesOf(container)).toEqual([undefined]);
  });

  it("a day that has passed WITH its own schedule shows what it was told", () => {
    mocks.rows[PAST] = queueOf(PAST, ["Old"]);
    const { container } = render(<OpdView />);
    pickDay(PAST);
    expect(timesOf(container)).toEqual(["6:00 PM"]);
  });
});

describe("OPD queue — the schedule bar is for the day on show", () => {
  it("is there, and is locked on a day that has passed", () => {
    render(<OpdView />);
    expect(within(document.body).getByLabelText("Start time")).toBeTruthy();
    expect((screen.getByLabelText("Start time") as HTMLInputElement).disabled).toBe(false);
    pickDay(PAST);
    expect((screen.getByLabelText("Start time") as HTMLInputElement).disabled).toBe(true);
  });
});
