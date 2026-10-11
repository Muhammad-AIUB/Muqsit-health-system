// @vitest-environment jsdom
//
// Second jsdom file, same opt-in docblock as ImageGallery.test.tsx — the rest
// of the suite stays on the node environment it has always passed in.

import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ImageLightbox from "./ImageLightbox";
import { itKeepsTheKeyboard } from "@/test/dialogKeyboard";

// ⚕️ This viewer is how a doctor reads a photographed paper order sheet. The
// zoom exists because fitting an A4 page to the screen is not the same as being
// able to make out the handwriting on it — so what is pinned here is that the
// magnification never carries from one page onto the next, and that the
// pre-existing paging and Escape still work with the zoom bolted on.

afterEach(cleanup);

const urls = ["/u/a.jpg", "/u/b.jpg", "/u/c.jpg"];

const view = (over: Partial<ComponentProps<typeof ImageLightbox>> = {}) => {
  const props = {
    urls,
    index: 0,
    onIndex: vi.fn(),
    onClose: vi.fn(),
    alt: "Order sheet page",
    ...over,
  };
  const utils = render(<ImageLightbox {...props} />);
  return { ...utils, props };
};

const zoomLevel = () => screen.getByLabelText("Reset zoom").textContent;
const btn = (label: string) => screen.getByLabelText(label) as HTMLButtonElement;

describe("ImageLightbox — zoom", () => {
  it("opens at fit, not magnified", () => {
    view();
    expect(zoomLevel()).toBe("100%");
    expect(btn("Zoom out").disabled).toBe(true);
  });

  it("magnifies on Zoom in and comes back on Reset", () => {
    view();
    fireEvent.click(screen.getByLabelText("Zoom in"));
    expect(zoomLevel()).toBe("140%");
    fireEvent.click(screen.getByLabelText("Zoom in"));
    expect(zoomLevel()).toBe("196%");
    fireEvent.click(screen.getByLabelText("Reset zoom"));
    expect(zoomLevel()).toBe("100%");
  });

  it("double-clicking the page zooms in, and again fits it back", () => {
    view();
    const img = screen.getByAltText("Order sheet page");
    fireEvent.doubleClick(img);
    expect(zoomLevel()).toBe("250%");
    fireEvent.doubleClick(img);
    expect(zoomLevel()).toBe("100%");
  });

  it("drives the zoom from the keyboard (+ − 0)", () => {
    view();
    fireEvent.keyDown(window, { key: "+" });
    expect(zoomLevel()).toBe("140%");
    fireEvent.keyDown(window, { key: "-" });
    expect(zoomLevel()).toBe("100%");
    fireEvent.keyDown(window, { key: "+" });
    fireEvent.keyDown(window, { key: "0" });
    expect(zoomLevel()).toBe("100%");
  });

  it("never magnifies past 6×", () => {
    view();
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByLabelText("Zoom in"));
    expect(zoomLevel()).toBe("600%");
    expect(btn("Zoom in").disabled).toBe(true);
  });

  // ⚕️ The one that matters clinically: page 2 must open whole. Carrying page
  // 1's magnified corner over would show the doctor a crop of a document they
  // have never seen in full.
  it("resets the zoom when the caller moves to another page", () => {
    const { rerender, props } = view();
    fireEvent.click(screen.getByLabelText("Zoom in"));
    expect(zoomLevel()).toBe("140%");
    rerender(<ImageLightbox {...props} index={1} />);
    expect(zoomLevel()).toBe("100%");
    expect(screen.getByAltText("Order sheet page").getAttribute("src")).toBe("/u/b.jpg");
  });
});

describe("ImageLightbox — paging still works with the zoom in place", () => {
  it("pages with the arrows and the ← → keys", () => {
    const onIndex = vi.fn();
    view({ index: 1, onIndex });
    fireEvent.click(screen.getByLabelText("Next image"));
    expect(onIndex).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByLabelText("Previous image"));
    expect(onIndex).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndex).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onIndex).toHaveBeenLastCalledWith(0);
  });

  it("clamps at both ends unless the caller asked to wrap", () => {
    view({ index: 0 });
    expect(btn("Previous image").disabled).toBe(true);
    cleanup();
    view({ index: urls.length - 1 });
    expect(btn("Next image").disabled).toBe(true);
    cleanup();
    view({ index: 0, wrap: true });
    expect(btn("Previous image").disabled).toBe(false);
  });

  it("closes on Escape and on the backdrop, but the zoom controls are not the backdrop", () => {
    const onClose = vi.fn();
    view({ onClose });
    fireEvent.click(screen.getByLabelText("Zoom in"));
    expect(onClose).not.toHaveBeenCalled();
    // On the body, where a real key press starts (it reaches document and window).
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("image-lightbox"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

// The whole app is drawn at `zoom: 1.12` (globals.css). A pointer travels in
// SCREEN px and `translate()` moves in the page's own, so without a division a
// dragged sheet ran 12% ahead of the finger and could be pulled 12% past its
// own edge. jsdom has no layout, so the two boxes the pan reads are given by
// hand: the veil laid out 1000 wide and drawn 1000 × zoom, and a picture
// fitted at 500 × 700 of the page's own px.
describe("ImageLightbox — a dragged page stays under the pointer", () => {
  const layout = (zoom: number) => {
    const veil = screen.getByTestId("image-lightbox");
    const img = screen.getByAltText("Order sheet page") as HTMLImageElement;
    Object.defineProperty(veil, "offsetWidth", { configurable: true, value: 1000 });
    veil.getBoundingClientRect = () => ({ width: 1000 * zoom }) as DOMRect;
    // As a browser reports it: fitted size × the picture's own scale × the zoom.
    img.getBoundingClientRect = () => {
      const s = Number(/scale\(([\d.]+)\)/.exec(img.style.transform)?.[1] ?? 1);
      return { width: 500 * s * zoom, height: 700 * s * zoom } as DOMRect;
    };
    return img;
  };

  const panX = (img: HTMLImageElement) => Number(/translate\((-?[\d.]+)px/.exec(img.style.transform)?.[1]);

  const drag = (img: HTMLImageElement, by: number) => {
    fireEvent.pointerDown(img, { pointerId: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(img, { pointerId: 1, clientX: 400 + by, clientY: 300 });
    fireEvent.pointerUp(img, { pointerId: 1 });
  };

  it("moves the page by the pointer's travel on screen, not 12% further", () => {
    view();
    const img = layout(1.12);
    fireEvent.doubleClick(img); // 2.5×
    drag(img, 56);
    // 56px on screen is 50 of the page's own px under a 1.12 zoom — which the
    // browser then draws as 50 × 1.12 = 56px: exactly with the pointer.
    expect(panX(img)).toBeCloseTo(50, 5);
  });

  it("stops at the page's own edge, measured in the page's own px", () => {
    view();
    const img = layout(1.12);
    fireEvent.doubleClick(img); // at 2.5× a 500px page overflows by 750: 375 each way
    drag(img, 5000);
    expect(panX(img)).toBeCloseTo(375, 5);
  });

  it("is unchanged where the page is not zoomed", () => {
    view();
    const img = layout(1);
    fireEvent.doubleClick(img);
    drag(img, 56);
    expect(panX(img)).toBeCloseTo(56, 5);
  });

  it("at fit there is nothing to drag", () => {
    view();
    const img = layout(1.12);
    drag(img, 56);
    expect(panX(img)).toBe(0);
  });
});

// The viewer covers the whole screen, and until 2026-10-12 Tab walked out from
// under it: a doctor reading an order sheet could tab onto — and press — the
// gallery controls behind it ("Remove selected") without seeing them.
describe("ImageLightbox — the keyboard stays in the viewer", () => {
  itKeepsTheKeyboard({
    label: "Image viewer",
    render: (onClose) => <ImageLightbox urls={urls} index={1} onIndex={() => {}} onClose={onClose} alt="Order sheet page" />,
  });
});
