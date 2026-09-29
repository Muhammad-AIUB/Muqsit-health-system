// @vitest-environment jsdom
//
// ⚕️ The records page's history deletes. This view stays mounted while the
// header lookup opens another patient, and its Undo holds a patient's WHOLE
// investigation history — so an Undo must never outlive the patient it was
// taken on, and neither the delete nor the Undo may pretend to have saved.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import PatientRecordsView from "./PatientRecordsView";
import type { InvFinding } from "@/lib/investigationSummary";

const f1: InvFinding = { date: "01/09/2026", category: "Blood", test: "Hb", value: "11.2 g/dl" };
const f2: InvFinding = { date: "01/09/2026", category: "Blood", test: "WBC", value: "9000" };

let ctx: Record<string, unknown>;
const fresh = () => ({
  currentPatientId: "A", ptName: "Test",
  rxImages: [], saveRxImages: vi.fn(() => Promise.resolve()), reportImages: [], saveReportImages: vi.fn(() => Promise.resolve()),
  appendGalleryImages: vi.fn(), imageThumbs: {},
  investigation: [], investigationSummary: [f1, f2], setInvestigationSummary: vi.fn(),
  saveInvestigationSummary: vi.fn(() => Promise.resolve()), openInvForSummary: vi.fn(),
  onExaminationSummary: [], setOnExaminationSummary: vi.fn(), saveOnExaminationSummary: vi.fn(() => Promise.resolve()),
});
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));

afterEach(cleanup);

const deleteHb = async () => {
  fireEvent.click(screen.getByText("✎ Edit"));
  await act(async () => { fireEvent.click(screen.getAllByLabelText("Delete finding")[0]); });
};

describe("PatientRecordsView — history delete and Undo", () => {
  it("⚕️ drops the Undo when another patient is opened", async () => {
    ctx = fresh();
    const { rerender } = render(<PatientRecordsView />);
    await deleteHb();
    expect(screen.getByText("↺ Undo")).toBeTruthy();
    ctx = { ...ctx, currentPatientId: "B", investigationSummary: [f2] };
    rerender(<PatientRecordsView />);
    expect(screen.queryByText("↺ Undo")).toBeNull();
    // Only the delete was ever written — patient A's list never reached B.
    expect(ctx.saveInvestigationSummary).toHaveBeenCalledTimes(1);
  });

  it("holds Undo until the delete has saved", async () => {
    ctx = fresh();
    let resolve!: () => void;
    ctx.saveInvestigationSummary = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    render(<PatientRecordsView />);
    await deleteHb();
    expect((screen.getByText("↺ Undo") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolve(); });
    expect((screen.getByText("↺ Undo") as HTMLButtonElement).disabled).toBe(false);
  });

  it("says so, and puts the finding back, when the delete did not save", async () => {
    ctx = fresh();
    ctx.saveInvestigationSummary = vi.fn(() => Promise.reject(new Error("offline")));
    render(<PatientRecordsView />);
    await deleteHb();
    expect(screen.getByText(/Could not remove/)).toBeTruthy();
    expect(screen.getByText(/offline/)).toBeTruthy();
    const restore = (ctx.setInvestigationSummary as ReturnType<typeof vi.fn>).mock.calls[0][0] as (cur: InvFinding[]) => InvFinding[];
    const written = (ctx.saveInvestigationSummary as ReturnType<typeof vi.fn>).mock.calls[0][0] as InvFinding[];
    expect(restore(written)).toEqual([f1, f2]);
  });

  it("keeps the Undo bar with the reason when the Undo did not save", async () => {
    ctx = fresh();
    ctx.saveInvestigationSummary = vi.fn()
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => Promise.reject(new Error("offline")));
    render(<PatientRecordsView />);
    await deleteHb();
    await act(async () => { fireEvent.click(screen.getByText("↺ Undo")); });
    expect(screen.getByText(/Undo did not save/)).toBeTruthy();
    expect(screen.getByText("↺ Undo")).toBeTruthy();
  });
});
