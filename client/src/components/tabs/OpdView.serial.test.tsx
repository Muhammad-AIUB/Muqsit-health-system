// @vitest-environment jsdom
//
// The OPD queue numbers its patients 1, 2, 3 … (physician's request, 18/10/2026:
// "ops tab a serial number give 1 2 3"), in the order the queue is shown, at
// the start of each row. The token (T-01 …) stays as it is: it is what the
// patient is called by, and a token is not renumbered when the queue changes.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const queue = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("@/lib/api", () => ({ patientsApi: { byMobile: vi.fn(), relativesByMobile: vi.fn(), create: vi.fn(), link: vi.fn(), get: vi.fn() } }));
vi.mock("@/context/MuqsitContext", () => ({
  useMuqsit: () => ({
    setPtName: vi.fn(), setPtAge: vi.fn(), setPtGender: vi.fn(), setPtPhone: vi.fn(), setActiveTab: vi.fn(),
    setRxItems: vi.fn(), setCurrentPatientId: vi.fn(), setPtInfo: vi.fn(), resetEditor: vi.fn(), loadPatientById: vi.fn(),
    activeWorkstationId: null,
  }),
}));
vi.mock("@/hooks/useOpd", () => ({
  useOpdQueue: () => ({ data: queue.rows, isLoading: false, error: null }),
  useAddOpdVisit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetOpdStatus: () => ({ mutate: vi.fn() }),
}));

import OpdView from "./OpdView";

afterEach(() => { cleanup(); queue.rows = []; });

const row = (id: string, name: string, token: string, status = "waiting") =>
  ({ id, name, token, status, type: "New", phone: "01810101515", age: 34, gender: "Male", patientId: id, rxStatus: null });

describe("OPD queue — serial numbers", () => {
  it("numbers the patients 1, 2, 3 in the order shown, each at the start of its row", () => {
    queue.rows = [row("a", "mr. samir", "T-01"), row("b", "mr test 5", "T-02"), row("c", "mr. abir", "T-03")];
    const { container } = render(<OpdView />);
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".queue-row"));
    expect(rows.map((r) => r.querySelector("[data-serial]")?.textContent)).toEqual(["1", "2", "3"]);
    // The first thing in the row.
    for (const r of rows) expect(r.firstElementChild?.hasAttribute("data-serial")).toBe(true);
    // Named for a screen reader with the patient it numbers.
    expect(screen.getByLabelText("Serial 2: mr test 5")).toBeTruthy();
  });

  it("keeps each patient's own token beside the serial", () => {
    queue.rows = [row("a", "mr. samir", "T-07"), row("b", "mr. abir", "T-03")];
    const { container } = render(<OpdView />);
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".queue-row"));
    expect(rows.map((r) => r.querySelector("[data-serial]")?.textContent)).toEqual(["1", "2"]);
    expect(rows[0].textContent).toContain("T-07");
    expect(rows[1].textContent).toContain("T-03");
  });

  it("a patient already seen keeps a number", () => {
    queue.rows = [row("a", "mr. samir", "T-01", "done"), row("b", "mr. abir", "T-02")];
    const { container } = render(<OpdView />);
    expect(Array.from(container.querySelectorAll("[data-serial]")).map((s) => s.textContent)).toEqual(["1", "2"]);
  });
});
