// @vitest-environment jsdom
//
// "Print Queue" (physician's sheet, 28/10/2026): the open day's serial list on a
// sheet, behind the same preview as a prescription. Any day can be printed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dhakaToday, shiftDay } from "@/lib/opdDay";

const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  schedule: { startTime: "18:00", breakStart: null as string | null, breakEnd: null as string | null, minutesPerPatient: 10, saved: true },
  scheduleLoading: false,
  queueLoading: false,
  workstation: { doctorId: "d1", name: "Dr. Rahim", role: "owner", permissions: [] } as { name: string } | null,
}));

vi.mock("@/lib/api", () => ({ patientsApi: { byMobile: vi.fn(), relativesByMobile: () => Promise.resolve([]), create: vi.fn(), link: vi.fn(), get: vi.fn() } }));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    setPtName: vi.fn(), setPtAge: vi.fn(), setPtGender: vi.fn(), setPtPhone: vi.fn(), setActiveTab: vi.fn(),
    setRxItems: vi.fn(), setCurrentPatientId: vi.fn(), setPtInfo: vi.fn(), resetEditor: vi.fn(), flushEditorDraft: vi.fn(), loadPatientById: vi.fn(),
    activeWorkstationId: null, activeWorkstation: mocks.workstation,
  }),
}));
vi.mock("@/hooks/useOpd", () => ({
  useOpdQueue: (day?: string) => ({ data: mocks.rows[day ?? ""] ?? [], isLoading: mocks.queueLoading, error: null, refetch: vi.fn(), isFetching: false }),
  useOpdSchedule: (day: string) => ({ data: mocks.scheduleLoading ? undefined : { day, ...mocks.schedule }, isLoading: mocks.scheduleLoading, error: null, refetch: vi.fn(), isFetching: false }),
  useAddOpdVisit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetOpdStatus: () => ({ mutate: vi.fn() }),
  useSetOpdPresence: () => ({ mutate: vi.fn() }),
  useMoveOpdVisit: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveOpdSchedule: () => ({ mutateAsync: vi.fn() }),
}));

import OpdView from "./OpdView";

vi.setConfig({ testTimeout: 30_000 });

const TODAY = dhakaToday();
const PAST = shiftDay(TODAY, -2);

const visit = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, token: "T-01", status: "waiting", type: "New", phone: "01810101515", age: 34, gender: "Male", patientId: id,
  rxStatus: null, queueDate: TODAY, position: null, presentAt: null, criticallyIll: false, urgent: false, ...over,
});

beforeEach(() => {
  mocks.rows = {};
  mocks.schedule = { startTime: "18:00", breakStart: null, breakEnd: null, minutesPerPatient: 10, saved: true };
  mocks.scheduleLoading = false;
  mocks.queueLoading = false;
  mocks.workstation = { name: "Dr. Rahim" };
});
afterEach(cleanup);

const printButton = () => screen.getByRole("button", { name: "Print Queue" }) as HTMLButtonElement;
const sheetText = () => (screen.getByTitle("OPD queue") as HTMLIFrameElement).contentDocument?.body.textContent ?? "";

describe("OPD queue — Print Queue", () => {
  it("is off while the day holds no one", () => {
    render(<OpdView />);
    expect(printButton().disabled).toBe(true);
  });

  it("is off while the day's schedule is loading, on once it has arrived", () => {
    mocks.rows[TODAY] = [visit("a", "Amy Khan")];
    mocks.scheduleLoading = true;
    const { rerender } = render(<OpdView />);
    expect(printButton().disabled).toBe(true);
    mocks.scheduleLoading = false;
    rerender(<OpdView />);
    expect(printButton().disabled).toBe(false);
  });

  it("opens a sheet of the day's patients with the workstation doctor's name and saved times", () => {
    mocks.rows[TODAY] = [visit("a", "Amy Khan"), visit("b", "Bob Roy", { age: null })];
    render(<OpdView />);
    expect(printButton().disabled).toBe(false);
    fireEvent.click(printButton());
    expect(screen.getByRole("dialog", { name: "OPD queue" })).toBeTruthy();
    const text = sheetText();
    expect(text).toContain("Dr. Rahim");
    expect(text).toContain("Amy Khan");
    expect(text).toContain("6:00 PM");
    expect(text).toContain("Bob Roy");
    expect(text).toContain("6:10 PM");
  });

  it("prints a day that has passed", () => {
    mocks.rows[PAST] = [visit("p", "Past Patient", { queueDate: PAST })];
    mocks.schedule = { ...mocks.schedule, saved: true };
    render(<OpdView />);
    fireEvent.click(screen.getByRole("button", { name: /^Date: / }));
    fireEvent.click(document.querySelector(`[data-day="${PAST}"]`) as Element);
    fireEvent.click(printButton());
    expect(sheetText()).toContain("Past Patient");
  });

  it("shows no time where the screen shows none (a past day never given a schedule)", () => {
    mocks.rows[PAST] = [visit("p", "Past Patient", { queueDate: PAST })];
    mocks.schedule = { ...mocks.schedule, saved: false };
    render(<OpdView />);
    fireEvent.click(screen.getByRole("button", { name: /^Date: / }));
    fireEvent.click(document.querySelector(`[data-day="${PAST}"]`) as Element);
    fireEvent.click(printButton());
    expect(sheetText()).not.toMatch(/\d:\d\d (AM|PM)/);
  });

  it("names no doctor when no workstation is chosen", () => {
    mocks.workstation = null;
    mocks.rows[TODAY] = [visit("a", "Amy Khan")];
    render(<OpdView />);
    fireEvent.click(printButton());
    expect(sheetText()).not.toContain("Dr.");
    expect(sheetText()).toContain("Amy Khan");
  });

  it("closes back to the queue", () => {
    mocks.rows[TODAY] = [visit("a", "Amy Khan")];
    render(<OpdView />);
    fireEvent.click(printButton());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "OPD queue" })).toBeNull();
  });
});
