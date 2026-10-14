// @vitest-environment jsdom
//
// The image viewer beside the Investigation popup (physician's request,
// 2026-10-15): a test's report image, large, with zoom, rotation, ‹ › through
// every test image of the day, and its own close.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReportViewerPane from "./ReportViewerPane";
import type { DayImage } from "@/lib/investigationImages";

afterEach(cleanup);

const ITEMS: DayImage[] = [
  { key: "15/10/2026:CBC", test: "CBC", n: 1, of: 2, url: "/u/cbc-1.jpg" },
  { key: "15/10/2026:CBC#2", test: "CBC", n: 2, of: 2, url: "/u/cbc-2.jpg" },
  { key: "15/10/2026:ESR", test: "ESR", n: 1, of: 1, url: "/u/esr.jpg" },
];

function setup(index = 0) {
  const onIndex = vi.fn();
  const onClose = vi.fn();
  render(<ReportViewerPane items={ITEMS} index={index} onIndex={onIndex} onClose={onClose} date="15/10/2026" />);
  return { onIndex, onClose };
}
const img = () => screen.getByRole("img") as HTMLImageElement;
const btn = (name: string | RegExp) => screen.getByRole("button", { name });

describe("ReportViewerPane", () => {
  it("shows the image large, says which test and which of its images it is", () => {
    setup(1);
    expect(img().getAttribute("src")).toBe("/u/cbc-2.jpg");
    expect(screen.getByText("CBC · image 2 of 2")).toBeTruthy();
    expect(screen.getByText("2 / 3")).toBeTruthy();
  });

  it("‹ › go through every image of the day, and stop at the ends", () => {
    const { onIndex } = setup(1);
    fireEvent.click(btn("Next image"));
    expect(onIndex).toHaveBeenLastCalledWith(2);
    fireEvent.click(btn("Previous image"));
    expect(onIndex).toHaveBeenLastCalledWith(0);
    cleanup();
    const first = setup(0);
    expect((btn("Previous image") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn("Next image"));
    expect(first.onIndex).toHaveBeenLastCalledWith(1);
  });

  it("the arrow keys move along too", () => {
    const { onIndex } = setup(1);
    const pane = screen.getByRole("region", { name: "Report image viewer" });
    fireEvent.keyDown(pane, { key: "ArrowRight" });
    expect(onIndex).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(pane, { key: "ArrowLeft" });
    expect(onIndex).toHaveBeenLastCalledWith(0);
  });

  it("zooms in and out, and back to fit", () => {
    setup(0);
    expect(screen.getByText("100%")).toBeTruthy();
    fireEvent.click(btn("Zoom in"));
    expect(screen.getByText("125%")).toBeTruthy();
    expect(img().style.width).toBe("125%");
    fireEvent.click(btn("Zoom out"));
    fireEvent.click(btn("Zoom out"));
    expect(screen.getByText("75%")).toBeTruthy();
    fireEvent.click(btn("Fit to the window"));
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("rotates left and right", () => {
    setup(0);
    fireEvent.click(btn("Rotate right"));
    expect(img().style.transform).toBe("rotate(90deg)");
    fireEvent.click(btn("Rotate left"));
    fireEvent.click(btn("Rotate left"));
    expect(img().style.transform).toBe("rotate(270deg)");
  });

  it("a new image starts at fit and upright", () => {
    const onIndex = vi.fn();
    const { rerender } = render(<ReportViewerPane items={ITEMS} index={0} onIndex={onIndex} onClose={vi.fn()} date="15/10/2026" />);
    fireEvent.click(btn("Zoom in"));
    fireEvent.click(btn("Rotate right"));
    rerender(<ReportViewerPane items={ITEMS} index={2} onIndex={onIndex} onClose={vi.fn()} date="15/10/2026" />);
    expect(screen.getByText("100%")).toBeTruthy();
    expect(img().style.transform).toBe("rotate(0deg)");
  });

  it("closes on its own ×", () => {
    const { onClose } = setup(0);
    fireEvent.click(btn("Close the image viewer"));
    expect(onClose).toHaveBeenCalled();
  });
});
