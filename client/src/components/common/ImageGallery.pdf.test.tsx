// @vitest-environment jsdom
//
// "Download PDF" on the patient's two document galleries. The PDF itself is
// pinned in lib/imagesPdf.test.ts; this pins the gallery's side: the button is
// opt-in, reading is never gated by edit rights, the FULL images go in the
// order shown, and a failure says so instead of downloading a partial file.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ImageGallery, { type GalleryItem } from "./ImageGallery";
import { pdfFileName } from "@/lib/galleryPdf";

const download = vi.fn();
vi.mock("@/lib/galleryPdf", async (orig) => ({
  ...(await orig<typeof import("@/lib/galleryPdf")>()),
  downloadGalleryPdf: (...a: unknown[]) => download(...a),
}));

afterEach(() => { cleanup(); download.mockReset(); });

const items: GalleryItem[] = [
  { id: "0", url: "/u/newest.jpg", thumbUrl: "/u/newest-t.jpg" },
  { id: "1", url: "/u/middle.jpg" },
  { id: "2", url: "/u/oldest.jpg" },
];
const base = {
  title: "All reports(image)", addLabel: "Add more reports", items, busy: false,
  onAddFiles: vi.fn(), onRemoveMany: vi.fn(), onOpen: vi.fn(),
  orientation: "portrait" as const, emptyText: "Nothing yet",
};
const pdf = { footerTitle: "All reports", fileName: () => "Rahim - All reports - 24-09-2026.pdf" };

describe("ImageGallery — Download PDF", () => {
  it("is offered only when the caller asks, and only when there is something to download", () => {
    const { rerender } = render(<ImageGallery {...base} />);
    expect(screen.queryByText("⤓ Download PDF")).toBeNull();
    rerender(<ImageGallery {...base} items={[]} pdf={pdf} />);
    expect(screen.queryByText("⤓ Download PDF")).toBeNull();
    rerender(<ImageGallery {...base} pdf={pdf} canEdit={false} />);
    expect(screen.getByText("⤓ Download PDF")).toBeTruthy(); // reading is not editing
  });

  it("sends the FULL images, in the order on screen", async () => {
    download.mockResolvedValue(undefined);
    render(<ImageGallery {...base} pdf={pdf} />);
    fireEvent.click(screen.getByText("⤓ Download PDF"));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(download.mock.calls[0][0]).toMatchObject({
      urls: ["/u/newest.jpg", "/u/middle.jpg", "/u/oldest.jpg"],
      footerTitle: "All reports",
      fileName: "Rahim - All reports - 24-09-2026.pdf",
    });
  });

  it("says the PDF was NOT downloaded when an image fails", async () => {
    const err = Object.assign(new Error("Image 2 could not be downloaded. Check the connection and try again."), { name: "GalleryPdfError" });
    download.mockRejectedValue(err);
    render(<ImageGallery {...base} pdf={pdf} />);
    fireEvent.click(screen.getByText("⤓ Download PDF"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("PDF NOT downloaded: Image 2 could not be downloaded");
  });
});

describe("pdfFileName", () => {
  it("keeps the patient's name, drops path characters, dates it dd-mm-yyyy", () => {
    expect(pdfFileName("Md. Rahim / Uddin", "All prescriptions", new Date(2026, 8, 4))).toBe("Md. Rahim Uddin - All prescriptions - 04-09-2026.pdf");
    expect(pdfFileName("", "All reports", new Date(2026, 8, 24))).toBe("All reports - 24-09-2026.pdf");
  });
});
