// @vitest-environment jsdom
//
// The "Add Bulk Medicine" box WITH its list: what it asks the server, when, and
// which of its three faces it shows for what comes back. ⚕️ "No medicines yet"
// may be drawn only for a list that is here — a request on its way, a failure,
// and an answer that is not the list each end somewhere else. The server is
// replaced; every medicine is made up.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// The box is drawn after its list arrives, and under the whole suite on a busy
// machine that took 2.6 s once: the 1 s every `waitFor` gives by default ran out
// with nothing wrong in the code. A wait that depends on how busy the machine
// is makes a flaky suite (vitest.config.ts says the same of the test timeout).
configure({ asyncUtilTimeout: 10_000 });
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import type { ReactElement } from "react";

const all = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  rxHabitsApi: { all, list: vi.fn(), setFlags: vi.fn() },
}));

import { ApiError } from "@/lib/api";
import BulkMedicineBox, { bulkBoxState, type BulkQuery } from "./BulkMedicineBox";
import type { BulkList } from "@/lib/bulkMedicines";
import type { RxItem } from "@/types";

const NAPA = { id: "h1", drugKey: "tablet. napa 500mg", drugLabel: "Tablet. Napa 500 mg", generic: "Paracetamol", dose: "1+1+1", food: "After meal", duration: "5 days", contLines: [], patientCount: 30, lastUsedAt: "2026-10-01T00:00:00.000Z" };
const ACE = { ...NAPA, id: "h4", drugKey: "tablet. ace 500mg", drugLabel: "Tablet. Ace 500 mg", patientCount: 2 };

// ── Which face, for which state of the request ───────────────────────────────
describe("bulkBoxState — the list is on its way, did not arrive, or is here", () => {
  const LIST: BulkList = { medicines: [], truncated: false, unreadable: 0 };
  const q = (over: Partial<BulkQuery>): BulkQuery => ({ data: undefined, isFetching: false, isError: false, error: null, refetch: vi.fn(), ...over });

  it("a request on its way is 'asking'", () => {
    expect(bulkBoxState(q({ isFetching: true })).status).toBe("asking");
  });

  // A list replaced by a newer one while it is on screen re-sorts itself under
  // the doctor's finger: the tick lands on the medicine that moved in.
  it("⚕️ …also with an older list still held: it is not shown while a newer one is on its way", () => {
    expect(bulkBoxState(q({ isFetching: true, data: LIST })).status).toBe("asking");
    expect(bulkBoxState(q({ isFetching: true, isError: true, error: new Error("x") })).status).toBe("asking"); // trying again
  });

  it("a failure is 'failed', and its retry asks again", () => {
    const refetch = vi.fn();
    const error = new Error("x");
    const state = bulkBoxState(q({ isError: true, error, refetch }));
    expect(state).toMatchObject({ status: "failed", error });
    if (state.status === "failed") state.retry();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("⚕️ …also with an older list still held: what could not be asked for again is not offered", () => {
    expect(bulkBoxState(q({ isError: true, error: new Error("x"), data: LIST })).status).toBe("failed");
  });

  it("a list that is here is 'list' — empty or not", () => {
    expect(bulkBoxState(q({ data: LIST }))).toEqual({ status: "list", list: LIST });
  });

  // React Query holds a request back while the browser says it is offline:
  // nothing fetching, nothing failed, nothing there.
  it("⚕️ nothing here, nothing on its way and nothing failed is still 'asking' — never an empty list", () => {
    expect(bulkBoxState(q({})).status).toBe("asking");
  });
});

// ── The box, asking a (replaced) server ──────────────────────────────────────
// One client for a whole test, as the app has one for a session. `retryDelay`
// only shortens the wait before the hook's one quiet retry.
let qc: QueryClient;
beforeEach(() => {
  all.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
});
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
});

const inApp = (ui: ReactElement) => <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
const box = (over: Partial<{ workstationId: string | null; onAdd: (items: RxItem[], summary: string) => void }> = {}) =>
  <BulkMedicineBox workstationId={over.workstationId ?? null} onClose={() => undefined} existing={[]} onAdd={over.onAdd ?? (() => undefined)} />;
const dialog = () => screen.getByRole("dialog", { name: "Add Bulk Medicine" });
const names = () => within(dialog()).getAllByRole("checkbox").map((c) => c.closest("label")?.querySelector("[data-name]")?.textContent);
const failed = () => waitFor(() => expect(within(dialog()).queryByRole("alert")).not.toBeNull());

describe("BulkMedicineBox — the box with its list", () => {
  it("says it is loading, then lists what the server sent", async () => {
    all.mockResolvedValue({ medicines: [NAPA, ACE], truncated: false });
    render(inApp(box()));
    expect(within(dialog()).getByText(/Loading the medicine list/)).toBeTruthy();
    await waitFor(() => expect(names()).toEqual(["Tablet. Napa 500 mg", "Tablet. Ace 500 mg"]));
    expect(all).toHaveBeenCalledTimes(1);
  });

  it("⚕️ what the server sent is read before it is drawn: a row with half a taper is left out and counted — with the rows the server left out", async () => {
    all.mockResolvedValue({ medicines: [NAPA, { ...ACE, contLines: [{ dose: "1+0+0" }] }], truncated: false, unreadable: 2 });
    render(inApp(box()));
    await waitFor(() => expect(names()).toEqual(["Tablet. Napa 500 mg"]));
    expect(dialog().textContent).toContain("3 medicines could not be read and are not listed.");
  });

  it.each([
    ["nothing at all (an empty answer)", undefined],
    ["something that is not the list", { message: "ok" }],
    ["a list that is not a list", { medicines: null }],
    ["a page in place of an answer", "<html>Sign in to the network</html>"],
  ])("⚕️ an answer that is %s is a failure to load — said, never an empty history", async (_what, answer) => {
    all.mockResolvedValue(answer);
    render(inApp(box()));
    await failed();
    expect(dialog().textContent).toContain("The medicine list could not be loaded.");
    expect(dialog().textContent).not.toContain("No medicines yet");
  });

  it("⚕️ a failure is said, after one quiet retry — and Try again asks the server again", async () => {
    all.mockRejectedValue(new ApiError(500, "Internal server error"));
    render(inApp(box()));
    await failed();
    expect(dialog().textContent).toContain("The medicine list could not be loaded.");
    expect(dialog().textContent).not.toContain("No medicines yet");
    expect(all).toHaveBeenCalledTimes(2); // the ask, and its one retry

    all.mockResolvedValue({ medicines: [NAPA], truncated: false });
    fireEvent.click(within(dialog()).getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(names()).toEqual(["Tablet. Napa 500 mg"]));
  });

  it.each([
    ["a request that was dropped", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a server that stumbled", () => Promise.reject(new ApiError(503, "Service Unavailable"))],
    ["a session that was being renewed", () => Promise.reject(new ApiError(401, "Unauthorized"))],
    ["an API one deploy behind the page", () => Promise.reject(new ApiError(404, "Cannot GET /api/rx-habits/all"))],
    ["an answer that could not be read", () => Promise.resolve("<html>Sign in to the network</html>")],
  ])("%s is asked for once more, quietly: when that comes back the list is simply there", async (_what, first) => {
    all.mockImplementationOnce(first).mockResolvedValue({ medicines: [NAPA], truncated: false });
    render(inApp(box()));
    await waitFor(() => expect(names()).toEqual(["Tablet. Napa 500 mg"]));
    expect(all).toHaveBeenCalledTimes(2);
    expect(within(dialog()).queryByRole("alert")).toBeNull();
  });

  // The quiet retry is for whatever may be different the second time. A 403
  // is the one answer that will not be: the server has looked at who is
  // asking and said no, in words written for a person.
  it("a refusal (403) is said at once, in the server's own words — it is not asked for a second time", async () => {
    all.mockRejectedValue(new ApiError(403, "You are not an active assistant of this doctor."));
    render(inApp(box()));
    await failed();
    expect(dialog().textContent).toContain("You are not an active assistant of this doctor.");
    expect(dialog().textContent).not.toContain("No medicines yet");
    expect(all).toHaveBeenCalledTimes(1);
  });

  // Every other answer below 500 may well be different a moment later — a
  // session being renewed, an API one deploy behind the page, too many
  // requests — and what the framework says of it is not written for a doctor.
  it.each([
    [401, "Unauthorized"],
    [404, "Cannot GET /api/rx-habits/all"],
    [429, "ThrottlerException: Too Many Requests"],
  ])("an answer of %i is asked for once more, and the framework's words for it are not shown", async (status, words) => {
    all.mockRejectedValue(new ApiError(status, words));
    render(inApp(box()));
    await failed();
    expect(all).toHaveBeenCalledTimes(2);
    expect(dialog().textContent).toContain("The medicine list could not be loaded.");
    expect(dialog().textContent).toContain("The server could not answer. Please try again in a moment.");
    expect(dialog().textContent).not.toContain(words);
    expect(dialog().textContent).not.toContain("internet"); // the connection is not what failed
  });

  it("⚕️ with the connection gone the box still ASKS, and says it could not load — it does not sit as an empty history", async () => {
    onlineManager.setOnline(false);
    all.mockRejectedValue(new TypeError("Failed to fetch"));
    render(inApp(box()));
    expect(dialog().textContent).not.toContain("No medicines yet");
    await failed();
    expect(all).toHaveBeenCalled();
    expect(dialog().textContent).toContain("Check your internet connection and try again.");
    expect(dialog().textContent).not.toContain("Failed to fetch");
    expect(dialog().textContent).not.toContain("No medicines yet");
  });

  it("⚕️ Try again pressed with the connection still gone ends on 'could not be loaded' again", async () => {
    all.mockRejectedValue(new TypeError("Failed to fetch"));
    render(inApp(box()));
    await failed();
    onlineManager.setOnline(false);
    const asked = all.mock.calls.length;
    fireEvent.click(within(dialog()).getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(all.mock.calls.length).toBeGreaterThan(asked));
    await failed();
    expect(dialog().textContent).not.toContain("No medicines yet");
  });

  it("⚕️ every opening asks again and waits: last time's list is not shown while this time's is on its way", async () => {
    all.mockResolvedValue({ medicines: [NAPA], truncated: false });
    const view = render(inApp(box()));
    await waitFor(() => expect(names()).toEqual(["Tablet. Napa 500 mg"]));

    view.rerender(inApp(<></>)); // closed
    expect(screen.queryByRole("dialog")).toBeNull();

    // A prescription was saved meanwhile; the server now has another medicine.
    let answer: (v: unknown) => void = () => undefined;
    all.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    view.rerender(inApp(box()));
    expect(within(dialog()).getByText(/Loading the medicine list/)).toBeTruthy();
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
    expect(within(dialog()).getByText(/Loading the medicine list/)).toBeTruthy();

    answer({ medicines: [ACE], truncated: false });
    await waitFor(() => expect(names()).toEqual(["Tablet. Ace 500 mg"]));
  });

  it("a box closed before the answer came lets the request go", async () => {
    all.mockReturnValue(new Promise(() => undefined)); // never answers
    const view = render(inApp(box()));
    await waitFor(() => expect(all).toHaveBeenCalledTimes(1));
    const signal = all.mock.calls[0][0] as AbortSignal;
    expect(signal.aborted).toBe(false);
    view.rerender(inApp(<></>));
    await waitFor(() => expect(signal.aborted).toBe(true));
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
