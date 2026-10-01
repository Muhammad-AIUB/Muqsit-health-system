// @vitest-environment jsdom
//
// Regressions on the Investigation popup for two review-pass fixes that shipped
// without a test of their own.
//
// 35e7039 — "Editing a hidden finding keeps it hidden". "Hide in Printed
//   Prescription" is keyed by the finding's EXACT stored string
//   (client/CLAUDE.md: "The mark is the exact stored string"). Correcting the
//   value of a hidden finding changed that string, so the mark no longer matched
//   — and a finding the doctor had deliberately kept off the paper printed.
//
// 82101b6 — "overlapping report uploads are blocked". Each batch numbers its
//   "Report N" keys and extends the gallery from the state it STARTED with, so a
//   second batch picked while the first was still uploading reused the same
//   numbers (overwriting the first batch's images) and dropped the first batch
//   from the patient's gallery.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { deferred } from "@/test/apiStub";

const uploadImage = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  uploadImage: (...a: unknown[]) => uploadImage(...a),
}));
vi.mock("@/hooks/useActivity", () => ({ useActivityLog: () => vi.fn() }));
vi.mock("@/hooks/useInvestigationPrefs", () => ({ useInvestigationPrefs: () => ({ favourites: [], unitPrefs: {} }) }));
vi.mock("./CalcRenderer", () => ({ default: () => null }));

let ctx: Record<string, unknown>;
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));

import InvestigationPopup from "./InvestigationPopup";

// A jsdom render of these screens takes seconds on the dev machine; the
// default 5 s is the failure mode there, not the code.
vi.setConfig({ testTimeout: 30_000 });

const HB = "01/09/2026:Hb:11.2 g/dl";
const WBC = "01/09/2026:WBC:9000";
const fresh = (over: Record<string, unknown> = {}) => ({
  showInvPopup: true, setShowInvPopup: vi.fn(),
  calDate: new Date(2026, 8, 1), setCalDate: vi.fn(), showMonthPicker: false, setShowMonthPicker: vi.fn(),
  invSearch: "", setInvSearch: vi.fn(), invActiveCat: "Hematology", setInvActiveCat: vi.fn(),
  invFormData: {}, setInvFormData: vi.fn(),
  investigation: [HB, WBC], setInvestigation: vi.fn(), invImages: {}, setInvImages: vi.fn(),
  setHiddenInvestigation: vi.fn(),
  reportImages: [], saveReportImages: vi.fn(),
  ...over,
});

beforeEach(() => { uploadImage.mockReset(); });
afterEach(cleanup);

describe("35e7039: correcting a finding that is hidden from print keeps it hidden", () => {
  const editFirstResultTo = (value: string) => {
    fireEvent.click(screen.getAllByText("✎ Edit")[0]);
    const box = screen.getByDisplayValue("11.2 g/dl");
    fireEvent.change(box, { target: { value } });
    fireEvent.keyDown(box, { key: "Enter" });
  };

  it("⚕️ moves the hide mark from the old string to the corrected one", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    editFirstResultTo("11.4 g/dl");

    // The finding itself is rewritten in place…
    expect(ctx.setInvestigation).toHaveBeenCalledWith(["01/09/2026:Hb:11.4 g/dl", WBC]);
    // …and the mark follows it.
    const setHidden = ctx.setHiddenInvestigation as ReturnType<typeof vi.fn>;
    expect(setHidden).toHaveBeenCalledTimes(1);
    const move = setHidden.mock.calls[0][0] as (h: string[]) => string[];
    expect(move([HB])).toEqual(["01/09/2026:Hb:11.4 g/dl"]);
    expect(move([WBC, HB])).toEqual([WBC, "01/09/2026:Hb:11.4 g/dl"]);
  });

  it("does not hide a finding that was not hidden, and leaves other marks alone", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    editFirstResultTo("11.4 g/dl");
    const move = (ctx.setHiddenInvestigation as ReturnType<typeof vi.fn>).mock.calls[0][0] as (h: string[]) => string[];
    const others = [WBC];
    expect(move(others)).toBe(others); // same array: nothing to move
    expect(move([])).toEqual([]);
  });

  it("an edit that changes nothing touches no mark", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    editFirstResultTo("11.2 g/dl");
    expect(ctx.setHiddenInvestigation).not.toHaveBeenCalled();
  });

  it("an edit emptied to nothing is abandoned — the finding and its mark stay as they were", () => {
    ctx = fresh();
    render(<InvestigationPopup />);
    editFirstResultTo("   ");
    expect(ctx.setInvestigation).not.toHaveBeenCalled();
    expect(ctx.setHiddenInvestigation).not.toHaveBeenCalled();
  });
});

describe("82101b6: one batch of report images at a time", () => {
  const picker = () => document.querySelector('input[type="file"][multiple]') as HTMLInputElement;
  const pick = async (...names: string[]) => {
    const files = names.map((n) => new File(["x"], n, { type: "image/jpeg" }));
    await act(async () => { fireEvent.change(picker(), { target: { files } }); });
  };

  it("⚕️ a second batch picked while the first is uploading is not started", async () => {
    const gate = deferred();
    uploadImage.mockImplementation((f: File) => gate.promise.then(() => `/uploads/${f.name}`));
    ctx = fresh({ investigation: [] });
    render(<InvestigationPopup />);

    await pick("a.jpg");
    expect(uploadImage).toHaveBeenCalledTimes(1);
    // The picker says so and is disabled while the batch is in flight.
    expect(screen.getByText(/Uploading reports…/)).toBeTruthy();
    expect(picker().disabled).toBe(true);

    await pick("b.jpg"); // e.g. a drop, or a click that beat the disable
    expect(uploadImage).toHaveBeenCalledTimes(1);

    await act(async () => { gate.release(); await gate.promise; await Promise.resolve(); await Promise.resolve(); });
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(picker().disabled).toBe(false);
    // Only the first batch was filed, as Report 1.
    const setInvImages = ctx.setInvImages as ReturnType<typeof vi.fn>;
    expect(setInvImages).toHaveBeenCalledTimes(1);
    expect((setInvImages.mock.calls[0][0] as (p: Record<string, string>) => Record<string, string>)({})).toEqual({ "01/09/2026:Report 1": "/uploads/a.jpg" });
    expect(ctx.saveReportImages).toHaveBeenCalledWith(["/uploads/a.jpg"]);
  });

  it("the next batch is accepted once the first has finished", async () => {
    uploadImage.mockImplementation(async (f: File) => `/uploads/${f.name}`);
    ctx = fresh({ investigation: [] });
    render(<InvestigationPopup />);
    await pick("a.jpg");
    await pick("b.jpg");
    expect(uploadImage).toHaveBeenCalledTimes(2);
  });

  it("the picker is released even when every upload in the batch fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    uploadImage.mockRejectedValue(new Error("offline"));
    ctx = fresh({ investigation: [] });
    render(<InvestigationPopup />);
    await pick("a.jpg");
    expect(picker().disabled).toBe(false);
    expect(ctx.saveReportImages).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
