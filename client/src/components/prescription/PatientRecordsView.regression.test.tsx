// @vitest-environment jsdom
//
// Regressions on the patient-records page for two review-pass fixes that
// shipped without a test of their own.
//
// 82101b6 — "× only on saved findings". The history list shows the patient's
//   SAVED findings merged with the ones in today's editor. × used to sit on
//   every row; pressing it on an editor-only row removed nothing from the saved
//   history, yet the bar still said "Removed …" — a doctor told a finding was
//   gone when it was not, and a whole-list PATCH fired for no change.
//
// 82101b6 — "Gallery uploads append to the latest list and are dropped if the
//   patient changed mid-upload" (the PAGE half; `appendGalleryImages` itself is
//   pinned in MuqsitContext.test.tsx, E7). The page used to build the new list
//   itself from the gallery it had read BEFORE the upload began and write it
//   whole — which brought back an image removed meanwhile, and filed patient
//   A's images into patient B's record when B had been opened by then.
//
// 35e7039 — "galleries key selection by URL". Gallery items were identified by
//   array INDEX. A selection made by index points at a different image once an
//   upload prepends to the list, so "Remove selected" could delete an image the
//   doctor never ticked — from "All prescriptions(Image)", which holds the
//   filed copies of printed prescriptions.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { InvFinding } from "@/lib/investigationSummary";
import { deferred } from "@/test/apiStub";

const uploadImage = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  uploadImage: (...a: unknown[]) => uploadImage(...a),
}));

import PatientRecordsView from "./PatientRecordsView";

// A jsdom render of these screens takes seconds on the dev machine; the
// default 5 s is the failure mode there, not the code.
vi.setConfig({ testTimeout: 30_000 });

const saved: InvFinding = { date: "01/09/2026", category: "Blood", test: "Hb", value: "11.2 g/dl" };

let ctx: Record<string, unknown>;
const fresh = (over: Record<string, unknown> = {}) => ({
  currentPatientId: "A", ptName: "Test",
  rxImages: [], saveRxImages: vi.fn(() => Promise.resolve()), reportImages: [], saveReportImages: vi.fn(() => Promise.resolve()),
  appendGalleryImages: vi.fn(), imageThumbs: {},
  investigation: [], investigationSummary: [saved], setInvestigationSummary: vi.fn(),
  saveInvestigationSummary: vi.fn(() => Promise.resolve()), openInvForSummary: vi.fn(),
  onExaminationSummary: [], setOnExaminationSummary: vi.fn(), saveOnExaminationSummary: vi.fn(() => Promise.resolve()),
  ...over,
});
vi.mock("@/context/MuqsitContext", () => ({ useMuqsit: () => ctx }));

// The gallery is a stand-in that records what it was handed, so the test can
// act as "Remove selected" / a drag-reorder would, by item id.
type GalleryProps = {
  title: string; items: { id: string; url: string }[];
  onAddFiles?: (files: File[]) => Promise<void>; onRemoveMany?: (ids: string[]) => void; onReorder?: (ids: string[]) => void;
};
const galleries: GalleryProps[] = [];
vi.mock("@/components/common/ImageGallery", () => ({
  default: (props: GalleryProps) => { galleries.push(props); return null; },
}));

beforeEach(() => { uploadImage.mockReset(); });
afterEach(() => { cleanup(); galleries.length = 0; vi.restoreAllMocks(); });

const lastGallery = (titlePart: RegExp) => [...galleries].reverse().find((g) => titlePart.test(g.title))!;

describe("82101b6: × is offered only on a finding that is in the SAVED history", () => {
  it("an editor-only finding gets no ×, the saved one does", () => {
    ctx = fresh({ investigation: ["01/09/2026:WBC:9000"] });
    render(<PatientRecordsView />);
    // Both rows are listed…
    expect(screen.getByText("11.2 g/dl")).toBeTruthy();
    expect(screen.getByText("9000")).toBeTruthy();
    fireEvent.click(screen.getByText("✎ Edit"));
    // …but only the saved one can be deleted from the saved history.
    const dels = screen.getAllByLabelText("Delete finding");
    expect(dels).toHaveLength(1);
    expect(dels[0].closest(".inv-row")!.textContent).toContain("Hb");
  });

  it("deleting the saved finding writes the history without it — and never touches the editor's", async () => {
    ctx = fresh({ investigation: ["01/09/2026:WBC:9000"] });
    render(<PatientRecordsView />);
    fireEvent.click(screen.getByText("✎ Edit"));
    await act(async () => { fireEvent.click(screen.getByLabelText("Delete finding")); });
    expect(ctx.saveInvestigationSummary).toHaveBeenCalledTimes(1);
    expect(ctx.saveInvestigationSummary).toHaveBeenCalledWith([]);
  });

  it("with nothing saved, Edit offers no × at all — so nothing can claim to have been removed", () => {
    ctx = fresh({ investigationSummary: [], investigation: ["01/09/2026:WBC:9000"] });
    render(<PatientRecordsView />);
    fireEvent.click(screen.getByText("✎ Edit"));
    expect(screen.queryByLabelText("Delete finding")).toBeNull();
    expect(ctx.saveInvestigationSummary).not.toHaveBeenCalled();
    expect(screen.queryByText(/Removed/)).toBeNull();
  });

  it("a finding that is both saved and in the editor is one row, with its ×", () => {
    ctx = fresh({ investigation: ["01/09/2026:Hb:11.2 g/dl"] });
    render(<PatientRecordsView />);
    fireEvent.click(screen.getByText("✎ Edit"));
    expect(screen.getAllByLabelText("Delete finding")).toHaveLength(1);
  });
});

describe("35e7039: gallery items are identified by URL, never by position", () => {
  const RX = ["/uploads/rx-1.jpg", "/uploads/rx-2.jpg", "/uploads/rx-3.jpg"];
  const REPORTS = ["/uploads/rep-1.jpg", "/uploads/rep-2.jpg"];

  it("hands each gallery items whose id IS the image URL", () => {
    ctx = fresh({ rxImages: RX, reportImages: REPORTS });
    render(<PatientRecordsView />);
    expect(lastGallery(/prescription/i).items.map((i) => i.id)).toEqual(RX);
    expect(lastGallery(/report/i).items.map((i) => i.id)).toEqual(REPORTS);
  });

  it("⚕️ Remove selected removes exactly the ticked prescription image", () => {
    ctx = fresh({ rxImages: RX, reportImages: REPORTS });
    render(<PatientRecordsView />);
    lastGallery(/prescription/i).onRemoveMany!(["/uploads/rx-2.jpg"]);
    expect(ctx.saveRxImages).toHaveBeenCalledWith(["/uploads/rx-1.jpg", "/uploads/rx-3.jpg"]);
    expect(ctx.saveReportImages).not.toHaveBeenCalled();
  });

  it("⚕️ a selection made before an upload landed still removes the image that was ticked", () => {
    ctx = fresh({ rxImages: RX });
    const { rerender } = render(<PatientRecordsView />);
    const ticked = lastGallery(/prescription/i).items[0].id; // the first tile
    // A new sheet is filed at the FRONT (newest first) while the tick stands.
    ctx = { ...ctx, rxImages: ["/uploads/rx-new.jpg", ...RX] };
    rerender(<PatientRecordsView />);
    lastGallery(/prescription/i).onRemoveMany!([ticked]);
    expect(ctx.saveRxImages).toHaveBeenCalledWith(["/uploads/rx-new.jpg", "/uploads/rx-2.jpg", "/uploads/rx-3.jpg"]);
  });

  it("removes exactly the ticked report image", () => {
    ctx = fresh({ rxImages: RX, reportImages: REPORTS });
    render(<PatientRecordsView />);
    lastGallery(/report/i).onRemoveMany!(["/uploads/rep-1.jpg"]);
    expect(ctx.saveReportImages).toHaveBeenCalledWith(["/uploads/rep-2.jpg"]);
    expect(ctx.saveRxImages).not.toHaveBeenCalled();
  });
});

describe("82101b6: an uploaded batch is handed to the context for the patient it was picked for", () => {
  const RX = ["/uploads/rx-1.jpg"];
  const file = () => new File(["x"], "sheet.jpg", { type: "image/jpeg" });

  it("⚕️ never writes the gallery itself from the list it read before the upload", async () => {
    uploadImage.mockResolvedValueOnce("/uploads/new.jpg").mockResolvedValueOnce("/uploads/new-thumb.jpg");
    ctx = fresh({ rxImages: RX, appendGalleryImages: vi.fn(() => true) });
    render(<PatientRecordsView />);
    await act(async () => { await lastGallery(/prescription/i).onAddFiles!([file()]); });
    expect(ctx.appendGalleryImages).toHaveBeenCalledWith("rx", "A", ["/uploads/new.jpg"], { "/uploads/new.jpg": "/uploads/new-thumb.jpg" });
    expect(ctx.saveRxImages).not.toHaveBeenCalled();
  });

  it("⚕️ names the patient the upload STARTED on, even if another is open when it lands — and says the images were not filed", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const gate = deferred();
    uploadImage.mockImplementation(() => gate.promise.then(() => "/uploads/new.jpg"));
    ctx = fresh({ rxImages: RX, appendGalleryImages: vi.fn(() => false) }); // the context refuses: wrong patient
    const { rerender } = render(<PatientRecordsView />);
    let done!: Promise<void>;
    act(() => { done = lastGallery(/prescription/i).onAddFiles!([file()]); });

    ctx = { ...ctx, currentPatientId: "B", rxImages: [] }; // the doctor opens patient B mid-upload
    rerender(<PatientRecordsView />);
    await act(async () => { gate.release(); await done; });

    const append = ctx.appendGalleryImages as ReturnType<typeof vi.fn>;
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0].slice(0, 3)).toEqual(["rx", "A", ["/uploads/new.jpg"]]);
    expect(ctx.saveRxImages).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(String(alert.mock.calls[0][0])).toMatch(/1 image was NOT added/);
  });

  it("reports go to the report gallery the same way", async () => {
    uploadImage.mockResolvedValue("/uploads/rep-new.jpg");
    ctx = fresh({ reportImages: ["/uploads/rep-1.jpg"], appendGalleryImages: vi.fn(() => true) });
    render(<PatientRecordsView />);
    await act(async () => { await lastGallery(/report/i).onAddFiles!([file()]); });
    expect((ctx.appendGalleryImages as ReturnType<typeof vi.fn>).mock.calls[0].slice(0, 3)).toEqual(["report", "A", ["/uploads/rep-new.jpg"]]);
    expect(ctx.saveReportImages).not.toHaveBeenCalled();
  });
});
