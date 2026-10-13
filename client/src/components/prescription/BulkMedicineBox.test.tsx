// @vitest-environment jsdom
//
// The "Add Bulk Medicine" box WITH its list: what it asks the server, and when.
// ⚕️ Every opening asks again and waits for the answer — a list that re-sorts
// itself under the doctor's finger is how a tick lands on the wrong medicine —
// and what comes back is read defensively before a row is drawn. The server is
// replaced here; every medicine is made up.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

const all = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  rxHabitsApi: { all, list: vi.fn(), setFlags: vi.fn() },
}));

import { ApiError } from "@/lib/api";
import { BulkMedicineBox } from "./BulkMedicineModal";
import type { RxItem } from "@/types";

const NAPA = { id: "h1", drugKey: "tablet. napa 500mg", drugLabel: "Tablet. Napa 500 mg", generic: "Paracetamol", dose: "1+1+1", food: "After meal", duration: "5 days", contLines: [], patientCount: 30, lastUsedAt: "2026-10-01T00:00:00.000Z" };
const ACE = { ...NAPA, id: "h4", drugKey: "tablet. ace 500mg", drugLabel: "Tablet. Ace 500 mg", patientCount: 2 };

// One client for a whole test, as the app has one for a session. `retryDelay`
// only shortens the wait before the hook's one quiet retry.
let qc: QueryClient;
beforeEach(() => {
  all.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
});
afterEach(cleanup);

const inApp = (ui: ReactElement) => <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
const box = (over: Partial<{ workstationId: string | null; onAdd: (items: RxItem[], summary: string) => void }> = {}) =>
  <BulkMedicineBox workstationId={over.workstationId ?? null} onClose={() => undefined} existing={[]} onAdd={over.onAdd ?? (() => undefined)} />;
const dialog = () => screen.getByRole("dialog", { name: "Add Bulk Medicine" });
const names = () => within(dialog()).getAllByRole("checkbox").map((c) => c.closest("label")?.querySelector("[data-name]")?.textContent);

describe("BulkMedicineBox — the box with its list", () => {
  it("says it is loading, then lists what the server sent", async () => {
    all.mockResolvedValue({ medicines: [NAPA, ACE], truncated: false });
    render(inApp(box()));
    expect(within(dialog()).getByRole("status").textContent).toContain("Loading your medicines");
    await waitFor(() => expect(names()).toEqual(["Tablet. Napa 500 mg", "Tablet. Ace 500 mg"]));
    expect(all).toHaveBeenCalledTimes(1);
  });

  it("⚕️ what the server sent is read before it is drawn: a row with half a taper is left out and counted", async () => {
    all.mockResolvedValue({ medicines: [NAPA, { ...ACE, contLines: [{ dose: "1+0+0" }] }], truncated: false });
    render(inApp(box()));
    await waitFor(() => expect(names()).toEqual(["Tablet. Napa 500 mg"]));
    expect(dialog().textContent).toContain("1 medicine could not be read and is not listed.");
  });

  it("an answer that is not a list at all is an empty box, never a crash", async () => {
    all.mockResolvedValue("<html>502 Bad Gateway</html>");
    render(inApp(box()));
    await waitFor(() => expect(dialog().textContent).toContain("No medicines yet"));
  });

  it("⚕️ a failure is said, after one quiet retry — and Try again asks the server again", async () => {
    all.mockRejectedValue(new ApiError(500, "Internal server error"));
    render(inApp(box()));
    await waitFor(() => expect(within(dialog()).queryByRole("alert")).not.toBeNull());
    expect(dialog().textContent).toContain("Your medicines could not be loaded.");
    expect(dialog().textContent).not.toContain("No medicines yet");
    expect(all).toHaveBeenCalledTimes(2); // the ask, and its one retry

    all.mockResolvedValue({ medicines: [NAPA], truncated: false });
    fireEvent.click(within(dialog()).getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(names()).toEqual(["Tablet. Napa 500 mg"]));
  });

  it("⚕️ every opening asks again and waits: last time's list is not shown while this time's is on its way", async () => {
    all.mockResolvedValue({ medicines: [NAPA], truncated: false });
    const view = render(inApp(box()));
    await waitFor(() => expect(names()).toEqual(["Tablet. Napa 500 mg"]));

    // Closed: the box is gone from the page, and nothing is kept.
    view.rerender(inApp(<></>));
    expect(screen.queryByRole("dialog")).toBeNull();

    // A prescription was saved meanwhile; the server now has another medicine.
    let answer: (v: unknown) => void = () => undefined;
    all.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    view.rerender(inApp(box()));
    expect(within(dialog()).getByRole("status").textContent).toContain("Loading your medicines");
    expect(within(dialog()).queryAllByRole("checkbox")).toHaveLength(0);
    expect(all).toHaveBeenCalledTimes(2);

    answer({ medicines: [ACE, NAPA], truncated: false });
    await waitFor(() => expect(names()).toEqual(["Tablet. Napa 500 mg", "Tablet. Ace 500 mg"]));
  });

  it("⚕️ another practice is another list: it is asked for, and the first one is not shown meanwhile", async () => {
    all.mockResolvedValue({ medicines: [NAPA], truncated: false });
    const view = render(inApp(box({ workstationId: "doctor_a" })));
    await waitFor(() => expect(names()).toEqual(["Tablet. Napa 500 mg"]));

    let answer: (v: unknown) => void = () => undefined;
    all.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    view.rerender(inApp(box({ workstationId: "doctor_b" })));
    expect(within(dialog()).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(dialog()).getByRole("status").textContent).toContain("Loading your medicines");

    answer({ medicines: [ACE], truncated: false });
    await waitFor(() => expect(names()).toEqual(["Tablet. Ace 500 mg"]));
  });

  it("⚕️ the generic the server sent reaches the pad line", async () => {
    all.mockResolvedValue({ medicines: [NAPA], truncated: false });
    const onAdd = vi.fn();
    render(inApp(box({ onAdd })));
    await waitFor(() => expect(names()).toEqual(["Tablet. Napa 500 mg"]));
    fireEvent.click(within(dialog()).getByRole("checkbox"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Add (1)" }));
    const [items, summary] = onAdd.mock.calls[0] as [RxItem[], string];
    expect(items).toEqual([
      { drug: "Tablet. Napa 500 mg", dose: "1+1+1", duration: "5 days", instruction: "After meal", isCont: false, generic: "Paracetamol" },
    ]);
    expect(summary).toBe("1 added");
  });
});
