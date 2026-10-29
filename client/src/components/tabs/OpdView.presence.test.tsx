// @vitest-environment jsdom
//
// The OPD queue row carries reception's three marks (Present with its time,
// Critically ill, Pt needs urgent attention), a colour by priority, the status
// the visit has reached and the patient's photo; the cards are Total Serial,
// Present, Completed, Waiting (physician's sheet, 29/10/2026).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const h = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], presence: vi.fn(), day: "" }));
vi.mock("@/lib/api", () => ({ patientsApi: { byMobile: vi.fn(), relativesByMobile: vi.fn(), create: vi.fn(), link: vi.fn(), get: vi.fn() } }));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    setPtName: vi.fn(), setPtAge: vi.fn(), setPtGender: vi.fn(), setPtPhone: vi.fn(), setActiveTab: vi.fn(),
    setRxItems: vi.fn(), setCurrentPatientId: vi.fn(), setPtInfo: vi.fn(), resetEditor: vi.fn(), flushEditorDraft: vi.fn(), loadPatientById: vi.fn(),
    activeWorkstationId: null,
  }),
}));
vi.mock("@/hooks/useOpd", () => ({
  useOpdQueue: (day?: string) => { h.day = day ?? ""; return { data: h.rows, isLoading: false, error: null }; },
  useAddOpdVisit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetOpdStatus: () => ({ mutate: vi.fn() }),
  useSetOpdPresence: () => ({ mutate: h.presence }),
  useOpdSchedule: () => ({ data: undefined, isLoading: false, error: null }),
  useMoveOpdVisit: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveOpdSchedule: () => ({ mutateAsync: vi.fn() }),
}));

import OpdView from "./OpdView";

afterEach(() => { cleanup(); h.rows = []; h.presence.mockClear(); });

const AT = "2026-10-29T12:00:00.000Z"; // 6.00pm in Dhaka
const row = (over: Record<string, unknown> = {}) => ({
  id: "a", name: "mr test 5", token: "T-01", status: "waiting", type: "New", phone: "01780000000", age: 65, gender: "Male",
  patientId: "p1", rxStatus: null, presentAt: null, criticallyIll: false, urgent: false, padStage: null, pictureUrl: null, ...over,
});
const rowEl = (c: HTMLElement) => c.querySelector(".queue-row") as HTMLElement;

describe("OPD queue — the row", () => {
  it("shows no token and no Incomplete chip", () => {
    h.rows = [row({ rxStatus: "incomplete" })];
    const { container } = render(<OpdView />);
    expect(rowEl(container).textContent).not.toContain("T-01");
    expect(rowEl(container).textContent).not.toContain("Incomplete");
  });

  it("has the three boxes, each named for the patient, and ticking one sends only it", () => {
    h.rows = [row()];
    render(<OpdView />);
    fireEvent.click(screen.getByLabelText("Present: mr test 5"));
    expect(h.presence).toHaveBeenLastCalledWith({ id: "a", present: true });
    fireEvent.click(screen.getByLabelText("Critically ill: mr test 5"));
    expect(h.presence).toHaveBeenLastCalledWith({ id: "a", criticallyIll: true });
    fireEvent.click(screen.getByLabelText("Pt needs urgent attention: mr test 5"));
    expect(h.presence).toHaveBeenLastCalledWith({ id: "a", urgent: true });
  });

  it("writes the third mark in the physician's own words, in full", () => {
    h.rows = [row()];
    const { container } = render(<OpdView />);
    expect(within(rowEl(container)).getByText("Pt needs urgent attention")).toBeTruthy();
  });

  it("a ticked box is shown ticked and unticking sends false", () => {
    h.rows = [row({ presentAt: AT })];
    render(<OpdView />);
    const box = screen.getByLabelText("Present: mr test 5") as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(h.presence).toHaveBeenLastCalledWith({ id: "a", present: false });
  });

  it("writes the time Present was marked, under the box", () => {
    h.rows = [row({ presentAt: AT })];
    const { container } = render(<OpdView />);
    expect(within(rowEl(container)).getByText("6.00pm")).toBeTruthy();
  });

  it("colours the row by priority: urgent, then critically ill, then present", () => {
    h.rows = [row({ id: "1", presentAt: AT }), row({ id: "2", presentAt: AT, criticallyIll: true }), row({ id: "3", presentAt: AT, criticallyIll: true, urgent: true }), row({ id: "4" })];
    const { container } = render(<OpdView />);
    const tones = Array.from(container.querySelectorAll<HTMLElement>(".queue-row")).map((r) => r.getAttribute("data-tone"));
    expect(tones).toEqual(["ok", "warn", "danger", null]);
  });

  it("shows the status the visit has reached", () => {
    h.rows = [row({ id: "1" }), row({ id: "2", presentAt: AT }), row({ id: "3", presentAt: AT, padStage: "history" }),
      row({ id: "4", presentAt: AT, padStage: "pending" }), row({ id: "5", presentAt: AT, rxStatus: "complete" })];
    const { container } = render(<OpdView />);
    const st = Array.from(container.querySelectorAll(".queue-row")).map((r) => r.querySelector("[data-status]")?.textContent ?? "");
    expect(st).toEqual(["", "Waiting", "History taken", "Prescription pending", "Completed"]);
  });

  it("shows the patient's picture when there is one", () => {
    h.rows = [row({ pictureUrl: "https://example.test/a.jpg" })];
    const { container } = render(<OpdView />);
    expect(container.querySelector(".queue-row img")?.getAttribute("src")).toBe("https://example.test/a.jpg");
  });
});

describe("OPD queue — the cards", () => {
  it("are Total Serial, Present, Completed, Waiting, counted from the rows", () => {
    h.rows = [row({ id: "1", presentAt: AT }), row({ id: "2", presentAt: AT, rxStatus: "complete" }), row({ id: "3" })];
    const { container } = render(<OpdView />);
    // Each card is found by its own hook: the words "Present", "Completed" and
    // "Waiting" also stand in every row.
    const value = (label: string) => container.querySelector(`[data-card="${label}"] [data-card-value]`)?.textContent;
    expect([value("Total Serial"), value("Present"), value("Completed"), value("Waiting")]).toEqual(["3", "2", "1", "1"]);
  });
});
