// @vitest-environment jsdom
//
// Regression for 35e7039 — "partial order-sheet removal keeps Undo".
//
// Removing several photographed pages runs one soft-delete per page. The loop
// used to sit in ONE try/catch: when the third call failed, the two pages
// already removed got no Undo bar and the message read "Could not remove", as
// if nothing had gone. On a medico-legal document that is two pages gone with
// no way back on screen. The fix keeps Undo for exactly the pages that went and
// says how many did.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import AnalogueSheetPanel from "./AnalogueSheetPanel";
import type { IpdAnalogueSheet } from "@/lib/api";

// A jsdom render of these screens takes seconds on the dev machine; the
// default 5 s is the failure mode there, not the code.
vi.setConfig({ testTimeout: 30_000 });

const removeMock = vi.fn();
const restoreMock = vi.fn();
vi.mock("@/hooks/useIpd", () => ({
  useAddAnalogueSheets: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLabelAnalogueSheet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveAnalogueSheet: () => ({ mutateAsync: removeMock, isPending: false }),
  useRestoreAnalogueSheet: () => ({ mutateAsync: restoreMock, isPending: false }),
}));

// The gallery is not under test: a stand-in that asks for the removal of every
// page it was given, the way "Remove selected" does.
vi.mock("@/components/common/ImageGallery", () => ({
  default: ({ items, onRemoveMany }: { items: { id: string }[]; onRemoveMany: (ids: string[]) => void }) => (
    <button onClick={() => onRemoveMany(items.map((i) => i.id))}>remove all {items.length}</button>
  ),
}));
vi.mock("@/components/common/ImageLightbox", () => ({ default: () => null }));

const sheet = (id: string): IpdAnalogueSheet =>
  ({ id, url: `/uploads/${id}.jpg`, label: "", addedAt: "2026-09-07T04:00:00.000Z", addedBy: "u1" }) as IpdAnalogueSheet;
const SHEETS = [sheet("a"), sheet("b"), sheet("c")];

beforeEach(() => {
  removeMock.mockReset();
  restoreMock.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const removeAll = async () => {
  render(<AnalogueSheetPanel admissionId="adm1" sheets={SHEETS} />);
  await act(async () => { fireEvent.click(screen.getByText("remove all 3")); });
};

describe("35e7039: removing several order-sheet pages when one fails", () => {
  it("⚕️ keeps Undo for the pages that WERE removed, and says how many went", async () => {
    removeMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({});
    await removeAll();

    // Every page was attempted — a failure in the middle does not abandon the rest.
    expect(removeMock.mock.calls.map((c) => c[0].sheetId)).toEqual(["a", "b", "c"]);
    expect(screen.getByText("Removed 2 of 3")).toBeTruthy();
    expect(screen.getByText("Removed 2 of 3; 1 could not be removed: offline")).toBeTruthy();

    // Undo restores exactly the two that went — never the one that is still there.
    restoreMock.mockResolvedValue({});
    await act(async () => { fireEvent.click(screen.getByText(/Undo/)); });
    expect(restoreMock.mock.calls.map((c) => c[0].sheetId)).toEqual(["a", "c"]);
    expect(restoreMock.mock.calls.every((c) => c[0].id === "adm1")).toBe(true);
  });

  it("offers no Undo and says so plainly when NOTHING could be removed", async () => {
    removeMock.mockRejectedValue(new Error("offline"));
    await removeAll();
    expect(screen.getByText("Could not remove: offline")).toBeTruthy();
    expect(screen.queryByText(/Undo/)).toBeNull();
  });

  it("when every page goes, the bar counts them all and Undo covers them all", async () => {
    removeMock.mockResolvedValue({});
    await removeAll();
    expect(screen.getByText("Removed 3 pages")).toBeTruthy();
    restoreMock.mockResolvedValue({});
    await act(async () => { fireEvent.click(screen.getByText(/Undo/)); });
    expect(restoreMock.mock.calls.map((c) => c[0].sheetId)).toEqual(["a", "b", "c"]);
  });

  it("removes nothing when the doctor cancels the confirm", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
    await removeAll();
    expect(removeMock).not.toHaveBeenCalled();
  });
});
