// @vitest-environment jsdom
//
// "Send SMS to all patients" beside Print Queue (physician's sheet, 28/10/2026):
// on for today or a later day with someone in the queue; "Buy SMS" opens
// Settings → Payment. The box itself is OpdSmsDialog.test.tsx.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dhakaToday, shiftDay } from "@/lib/opdDay";

const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  queueLoading: false,
  queueError: false,
  setActiveTab: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ patientsApi: { byMobile: vi.fn(), relativesByMobile: () => Promise.resolve([]), create: vi.fn(), link: vi.fn(), get: vi.fn() } }));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    setPtName: vi.fn(), setPtAge: vi.fn(), setPtGender: vi.fn(), setPtPhone: vi.fn(), setActiveTab: mocks.setActiveTab,
    setRxItems: vi.fn(), setCurrentPatientId: vi.fn(), setPtInfo: vi.fn(), resetEditor: vi.fn(), flushEditorDraft: vi.fn(), loadPatientById: vi.fn(),
    activeWorkstationId: null, activeWorkstation: { name: "Dr. Test" },
  }),
}));
vi.mock("@/hooks/useOpd", () => ({
  useOpdQueue: (day?: string) => ({ data: mocks.rows[day ?? ""] ?? [], isLoading: mocks.queueLoading, error: mocks.queueError ? new Error("x") : null, refetch: vi.fn(), isFetching: false }),
  useOpdSchedule: (day: string) => ({ data: { day, startTime: "18:00", breakStart: null, breakEnd: null, minutesPerPatient: 10, saved: true }, isLoading: false, error: null, refetch: vi.fn(), isFetching: false }),
  useAddOpdVisit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetOpdStatus: () => ({ mutate: vi.fn() }),
  useSetOpdPresence: () => ({ mutate: vi.fn() }),
  useMoveOpdVisit: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveOpdSchedule: () => ({ mutateAsync: vi.fn() }),
}));
// The box, as a stand-in that says which day it was opened for.
vi.mock("@/components/opd/OpdSmsDialog", () => ({
  default: ({ day, onBuy }: { day: string; onBuy: () => void }) => (
    <div role="dialog" aria-label="Send SMS to all patients">
      <span data-day={day} />
      <button type="button" onClick={onBuy}>Buy SMS</button>
    </div>
  ),
}));

import OpdView from "./OpdView";

vi.setConfig({ testTimeout: 30_000 });

const TODAY = dhakaToday();
const visit = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: `Patient ${id}`, token: "T-01", status: "waiting", type: "New", phone: "01711000000", age: 30, gender: "Male", patientId: id,
  rxStatus: null, queueDate: TODAY, position: 1, presentAt: null, criticallyIll: false, urgent: false, ...over,
});

beforeEach(() => {
  mocks.rows = {};
  mocks.queueLoading = false;
  mocks.queueError = false;
  mocks.setActiveTab.mockReset();
});
afterEach(cleanup);

const smsButton = () => screen.getByRole("button", { name: "Send SMS to all patients" }) as HTMLButtonElement;
const pickDay = (day: string) => {
  fireEvent.click(screen.getByRole("button", { name: /choose another date/ }));
  const cell = document.querySelector<HTMLButtonElement>(`[data-day="${day}"]`);
  if (!cell) {
    fireEvent.click(screen.getByRole("button", { name: day < TODAY ? "Previous month" : "Next month" }));
  }
  fireEvent.click(document.querySelector<HTMLButtonElement>(`[data-day="${day}"]`) as HTMLButtonElement);
};

describe("OPD queue — Send SMS to all patients", () => {
  it("stands beside Print Queue", () => {
    render(<OpdView />);
    const print = screen.getByRole("button", { name: "Print Queue" });
    expect(print.nextElementSibling).toBe(smsButton());
  });

  it("is off while the day holds no one, while it loads and when it failed", () => {
    const { rerender } = render(<OpdView />);
    expect(smsButton().disabled).toBe(true);
    mocks.rows[TODAY] = [visit("a")];
    mocks.queueLoading = true;
    rerender(<OpdView />);
    expect(smsButton().disabled).toBe(true);
    mocks.queueLoading = false;
    mocks.queueError = true;
    rerender(<OpdView />);
    expect(smsButton().disabled).toBe(true);
    mocks.queueError = false;
    rerender(<OpdView />);
    expect(smsButton().disabled).toBe(false);
  });

  it("⚕️ is off for a day that has passed", () => {
    const past = shiftDay(TODAY, -1);
    mocks.rows[past] = [visit("a", { queueDate: past })];
    render(<OpdView />);
    pickDay(past);
    expect(smsButton().disabled).toBe(true);
    expect(smsButton().title).toBe("SMS cannot be sent for a day that has passed");
  });

  it("opens for a later day, for that day", () => {
    const later = shiftDay(TODAY, 1);
    mocks.rows[later] = [visit("a", { queueDate: later })];
    render(<OpdView />);
    pickDay(later);
    fireEvent.click(smsButton());
    expect(document.querySelector("[data-day]:not(button)")?.getAttribute("data-day")).toBe(later);
  });

  it("'Buy SMS' closes the box and opens Settings → Payment", () => {
    mocks.rows[TODAY] = [visit("a")];
    render(<OpdView />);
    fireEvent.click(smsButton());
    fireEvent.click(screen.getByRole("button", { name: "Buy SMS" }));
    expect(mocks.setActiveTab).toHaveBeenCalledWith("settings", "/settings/payment");
    expect(screen.queryByRole("dialog", { name: "Send SMS to all patients" })).toBeNull();
  });
});
