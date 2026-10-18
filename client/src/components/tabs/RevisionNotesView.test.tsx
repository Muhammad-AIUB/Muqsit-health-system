// @vitest-environment jsdom
//
// "Revision Notes" (physician's sheet, 18/10/2026, item 4): "oikhane ami word
// file er moto amr ja ja dorkar likhe rakhte parbo, bold highlight korte parbo,
// proyojon a print korte parbo. Page Microsoft word er moto likhe likhe page add
// hobe, just plus control F dia search korte parbo keyword". The doctor's own
// notebook: what is typed is saved and never lost, a save from an older copy
// is refused and the typing kept, Ctrl+F searches it, Print prints it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

const api = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  revisionNotesApi: { get: api.get, save: api.save },
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "doc-1" } }) }));

import RevisionNotesView, { REVISION_NOTES_MAX, forgetHeldRevisionNotes } from "./RevisionNotesView";

vi.setConfig({ testTimeout: 30_000 });

const T1 = "2026-10-18T10:00:00.000Z";
const T2 = "2026-10-18T10:05:00.000Z";

// Testing Library waits 1 s by default; under the whole suite's load the first
// render of the editor can take longer (it failed once in a full run).
const until = (fn: () => void) => waitFor(fn, { timeout: 5000 });
const view = (qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => {
  return render(<QueryClientProvider client={qc}><RevisionNotesView /></QueryClientProvider>);
};
const surface = () => document.querySelector(".rte-surface") as HTMLDivElement;
const type = (html: string) => { surface().innerHTML = html; fireEvent.input(surface()); };
const saveBtn = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
const status = () => screen.getByRole("status", { name: "Save status" }).textContent ?? "";

beforeEach(() => {
  forgetHeldRevisionNotes();
  api.get.mockReset(); api.save.mockReset();
  api.get.mockResolvedValue({ html: "<p>HBV notes. hbv DNA.</p>", updatedAt: T1 });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Revision Notes", () => {
  it("opens the doctor's notebook", async () => {
    view();
    expect(screen.getByText("Revision Notes", { selector: "h1, [data-title]" })).toBeTruthy();
    await until(() => expect(surface().innerHTML).toBe("<p>HBV notes. hbv DNA.</p>"));
  });

  it("offers bold and highlight", async () => {
    view();
    await until(() => expect(surface()).toBeTruthy());
    expect(screen.getByTitle(/bold/i)).toBeTruthy();
    expect(screen.getByTitle(/highlight/i)).toBeTruthy();
  });

  it("a notebook that did not load says so and offers Try again — never an empty page", async () => {
    api.get.mockRejectedValue(new TypeError("Failed to fetch"));
    view();
    expect(await screen.findByText("Your Revision Notes could not be loaded.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(document.querySelector(".rte-surface")).toBeNull();
  });

  it("Save sends what was typed over the copy it was written from", async () => {
    api.save.mockResolvedValue({ html: "<p>new</p>", updatedAt: T2 });
    view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    type("<p>new</p>");
    expect(status()).toMatch(/Unsaved/);
    await act(async () => { fireEvent.click(saveBtn()); });
    expect(api.save).toHaveBeenCalledWith({ html: "<p>new</p>", baseUpdatedAt: T1 });
    await until(() => expect(status()).toMatch(/^Saved/));
  });

  it("saves by itself a moment after typing stops", async () => {
    api.save.mockResolvedValue({ html: "<p>auto</p>", updatedAt: T2 });
    view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    vi.useFakeTimers();
    type("<p>auto</p>");
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(api.save).toHaveBeenCalledWith({ html: "<p>auto</p>", baseUpdatedAt: T1 });
  });

  it("the first save of a new notebook says it saw none", async () => {
    api.get.mockResolvedValue(null);
    api.save.mockResolvedValue({ html: "<p>first</p>", updatedAt: T2 });
    view();
    await until(() => expect(surface()).toBeTruthy());
    type("<p>first</p>");
    await act(async () => { fireEvent.click(saveBtn()); });
    expect(api.save).toHaveBeenCalledWith({ html: "<p>first</p>", baseUpdatedAt: null });
  });

  it("what is typed while a save is on its way stays unsaved, and is saved next over the NEW copy", async () => {
    let land: (v: unknown) => void = () => {};
    api.save.mockImplementationOnce(() => new Promise((r) => { land = r; }));
    view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    type("<p>a</p>");
    await act(async () => { fireEvent.click(saveBtn()); });
    type("<p>ab</p>");
    await act(async () => { land({ html: "<p>a</p>", updatedAt: T2 }); });
    expect(status()).toMatch(/Unsaved/);
    expect(surface().innerHTML).toBe("<p>ab</p>");
    api.save.mockResolvedValueOnce({ html: "<p>ab</p>", updatedAt: "2026-10-18T10:06:00.000Z" });
    await act(async () => { fireEvent.click(saveBtn()); });
    expect(api.save).toHaveBeenLastCalledWith({ html: "<p>ab</p>", baseUpdatedAt: T2 });
  });

  it("a save refused because another screen changed it keeps the typing and says so", async () => {
    api.save.mockRejectedValue(new ApiError(409, "Your Revision Notes were changed on another screen. Reload them to see that version before saving — what you typed here stays on this screen."));
    view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    type("<p>mine</p>");
    await act(async () => { fireEvent.click(saveBtn()); });
    expect(screen.getByRole("alert").textContent).toMatch(/changed on another screen/);
    expect(surface().innerHTML).toBe("<p>mine</p>");
    expect(status()).toMatch(/Unsaved/);
  });

  it("Ctrl+F puts the cursor in the search box, and the matches are counted", async () => {
    view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    fireEvent.keyDown(document, { key: "f", ctrlKey: true });
    const box = screen.getByRole("searchbox", { name: "Search in Revision Notes" }) as HTMLInputElement;
    expect(document.activeElement).toBe(box);
    fireEvent.change(box, { target: { value: "hbv" } });
    expect(screen.getByText("1 of 2")).toBeTruthy();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByText("2 of 2")).toBeTruthy();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByText("1 of 2")).toBeTruthy();
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No match")).toBeTruthy();
  });

  it("Print prints the notebook, cleaned of anything that is not text formatting", async () => {
    api.get.mockResolvedValue({ html: '<p><b>Bold</b> <img src=x onerror="alert(1)">text</p>', updatedAt: T1 });
    view();
    await until(() => expect(surface().innerHTML).toContain("Bold"));
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    const printed = frame.contentDocument?.body.innerHTML ?? "";
    expect(printed).toContain("<b>Bold</b>");
    expect(printed).not.toContain("onerror");
    expect(printed).not.toContain("<img");
  });

  it("says how many pages the notebook takes", async () => {
    view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    expect(screen.getByText(/1 page\b/)).toBeTruthy();
  });

  // ⚕️ Review, 18/10/2026: leaving the tab unmounts the notebook. Typing still
  // unsaved then — a save already on its way, or one that then fails — was lost
  // without a word.
  it("typing still unsaved when the tab is left is saved after the save on its way", async () => {
    let land: (v: unknown) => void = () => {};
    api.save.mockImplementationOnce(() => new Promise((r) => { land = r; }));
    api.save.mockResolvedValueOnce({ html: "<p>ab</p>", updatedAt: "2026-10-18T10:06:00.000Z" });
    const { unmount } = view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    type("<p>a</p>");
    await act(async () => { fireEvent.click(saveBtn()); });
    type("<p>ab</p>");
    unmount();
    await act(async () => { land({ html: "<p>a</p>", updatedAt: T2 }); });
    await until(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save).toHaveBeenLastCalledWith({ html: "<p>ab</p>", baseUpdatedAt: T2 });
  });

  it("…and when that save fails, the text is back on the page on return", async () => {
    api.save.mockRejectedValue(new TypeError("Failed to fetch"));
    const first = view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    type("<p>kept</p>");
    first.unmount();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    cleanup();
    view();
    await until(() => expect(surface().innerHTML).toBe("<p>kept</p>"));
    expect(status()).toMatch(/Unsaved/);
  });

  it("Show that version says so when it cannot be loaded, and keeps the typing", async () => {
    api.save.mockRejectedValue(new ApiError(409, "Your Revision Notes were changed on another screen."));
    view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    type("<p>mine</p>");
    await act(async () => { fireEvent.click(saveBtn()); });
    api.get.mockRejectedValue(new TypeError("Failed to fetch"));
    vi.spyOn(await import("@/lib/dialogs"), "confirmAction").mockResolvedValue(true);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show that version" })); });
    await until(() => expect(screen.getByRole("alert").textContent).toMatch(/could not be loaded/i));
    expect(surface().innerHTML).toBe("<p>mine</p>");
  });

  it("a notebook too long to send is refused on the screen, not sent again and again", async () => {
    view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    type(`<p>${"x".repeat(REVISION_NOTES_MAX)}</p>`);
    await act(async () => { fireEvent.click(saveBtn()); });
    expect(api.save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/too long/i);
  });

  // Seen in the browser, 18/10/2026: text typed straight into the page has the
  // whole 1123px page as its element, and bringing THAT into view scrolled to
  // the middle of an empty page with the match above the screen.
  it("the search scrolls to the match itself, not to the page it stands on", async () => {
    const proto = Range.prototype as unknown as { getBoundingClientRect?: () => DOMRect };
    const had = proto.getBoundingClientRect;
    proto.getBoundingClientRect = () => ({ top: -214, bottom: -195, height: 19, left: 100, right: 130, width: 30, x: 100, y: -214, toJSON: () => ({}) }) as DOMRect;
    const by = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    try {
      view();
      await until(() => expect(surface().innerHTML).toContain("HBV"));
      const box = screen.getByRole("searchbox", { name: "Search in Revision Notes" });
      fireEvent.change(box, { target: { value: "hbv" } });
      expect(by).toHaveBeenCalled();
      const top = (by.mock.calls.at(-1)?.[0] as ScrollToOptions).top ?? 0;
      expect(top).toBeCloseTo(-214 + 19 / 2 - window.innerHeight / 2, 5);
    } finally {
      proto.getBoundingClientRect = had;
      by.mockRestore();
    }
  });

  // Seen in the browser, 18/10/2026: a dashed line across the page at each page
  // end ran through a line of writing, which then read as struck out. The mark
  // stands in the margins only.
  it("marks where a page ends in the margins, never across the writing", async () => {
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) { return this.classList.contains("rte-surface") ? 2500 : 0; },
    });
    try {
      view();
      await until(() => expect(surface().innerHTML).toContain("HBV"));
      expect(screen.getByText(/3 pages/)).toBeTruthy();
      const marks = Array.from(document.querySelectorAll<HTMLElement>("[data-page-end]"));
      expect(marks.map((m) => m.dataset.pageEnd)).toEqual(["2", "3"]);
      for (const m of marks) {
        // Nothing visible of the mark spans the text column: no line of its
        // own, and two short ticks, one at each edge.
        expect(m.style.borderTop).toBe("");
        const ticks = Array.from(m.querySelectorAll<HTMLElement>("[data-tick]"));
        expect(ticks).toHaveLength(2);
        for (const tick of ticks) expect(parseFloat(tick.style.width)).toBeLessThanOrEqual(12);
      }
    } finally {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", d);
    }
  });

  // Seen in the browser, 18/10/2026: the screen changed from desktop to phone
  // width, the notebook was drawn again — and showed "Nothing written yet" over
  // a full notebook: the answer cached when it was first opened (empty) was
  // still in the cache and never asked for again.
  it("opened again, it shows the notebook as saved since — never an older answer", async () => {
    api.get.mockResolvedValueOnce(null);
    api.save.mockResolvedValue({ html: "<p>written</p>", updatedAt: T2 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = view(qc);
    await until(() => expect(surface()).toBeTruthy());
    type("<p>written</p>");
    await act(async () => { fireEvent.click(saveBtn()); });
    await until(() => expect(status()).toMatch(/^Saved/));
    api.get.mockResolvedValue({ html: "<p>written</p>", updatedAt: T2 });
    first.unmount();
    view(qc);
    await until(() => expect(surface().innerHTML).toBe("<p>written</p>"));
    expect(status()).toMatch(/^Saved/);
  });

  // ⚕️ Second review, 18/10/2026: a save refused because another screen saved
  // first, then the tab left and opened again — the held text came back as an
  // ordinary unsaved edit, and the next autosave wrote over the other screen's.
  it("a refusal is still a refusal after leaving the tab and coming back", async () => {
    api.save.mockRejectedValue(new ApiError(409, "Your Revision Notes were changed on another screen."));
    const first = view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    type("<p>mine</p>");
    await act(async () => { fireEvent.click(saveBtn()); });
    expect(screen.getByRole("alert").textContent).toMatch(/another screen/);
    first.unmount();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    cleanup();
    api.get.mockResolvedValue({ html: "<p>theirs</p>", updatedAt: T2 });
    api.save.mockClear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    view();
    await until(() => expect(surface().innerHTML).toBe("<p>mine</p>"));
    expect(screen.getByRole("alert").textContent).toMatch(/another screen/);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(api.save).not.toHaveBeenCalled();
  });

  it("…and so is a copy that another screen replaced while the tab was away", async () => {
    api.save.mockRejectedValue(new TypeError("Failed to fetch"));
    const first = view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    type("<p>mine</p>");
    first.unmount();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    cleanup();
    api.get.mockResolvedValue({ html: "<p>theirs</p>", updatedAt: T2 }); // saved elsewhere meanwhile
    api.save.mockClear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    view();
    await until(() => expect(surface().innerHTML).toBe("<p>mine</p>"));
    expect(screen.getByRole("alert").textContent).toMatch(/another screen/);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(api.save).not.toHaveBeenCalled();
  });

  it("text held after the tab is left keeps a warning on leaving the page", async () => {
    api.save.mockRejectedValue(new TypeError("Failed to fetch"));
    const first = view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    type("<p>held</p>");
    first.unmount();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("text held after the tab is left is saved before logging out", async () => {
    api.save.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const first = view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    type("<p>held</p>");
    first.unmount();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    api.save.mockResolvedValueOnce({ html: "<p>held</p>", updatedAt: T2 });
    const { runBeforeLogout } = await import("@/lib/beforeLogout");
    await act(async () => { await runBeforeLogout(); });
    expect(api.save).toHaveBeenLastCalledWith({ html: "<p>held</p>", baseUpdatedAt: T1 });
  });

  it("text held after the tab is left is tried again when the connection comes back", async () => {
    api.save.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const first = view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    type("<p>held</p>");
    first.unmount();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    api.save.mockResolvedValueOnce({ html: "<p>held</p>", updatedAt: T2 });
    await act(async () => { window.dispatchEvent(new Event("online")); await new Promise((r) => setTimeout(r, 0)); });
    await until(() => expect(api.save).toHaveBeenLastCalledWith({ html: "<p>held</p>", baseUpdatedAt: T1 }));
  });

  // Second review: a failing server was asked again every two seconds, for ever.
  it("saving by itself backs off while the server keeps failing", async () => {
    api.save.mockRejectedValue(new ApiError(503, "Service Unavailable"));
    view();
    await until(() => expect(surface().innerHTML).toContain("HBV"));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    type("<p>x</p>");
    // A second at a time, each in its own act(): inside ONE act React renders
    // (and sets the next try's timer) only at its very end.
    for (let i = 0; i < 30; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    // 2 s, then 4, 8, 16: four tries in thirty seconds, not fifteen.
    expect(api.save.mock.calls.length).toBeLessThanOrEqual(5);
    expect(api.save.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

