import { describe, expect, it } from "vitest";
import { anchorDropdown, sameAnchor, toLayoutPx, zoomScale, DD_MAX_H, DD_EDGE, DD_GAP } from "./dropdownAnchor";

// ⚕️ The ℞ pad scrolls once a prescription runs long, so the medicine dropdown
// is drawn against the viewport instead of inside the pad. What these pin is
// the one thing that matters clinically: the list of medicines is never cut off
// — not by the bottom of the screen, not by its right edge.

const vp = { width: 1440, height: 900 };
const row = (top: number, height = 40, left = 600) => ({ top, bottom: top + height, left });

describe("anchorDropdown", () => {
  it("hangs under the row when there is room", () => {
    const a = anchorDropdown(row(200), vp);
    expect(a.top).toBe(242); // row bottom + the 2px gap
    expect(a.bottom).toBeUndefined();
    expect(a.left).toBe(600);
    expect(a.maxHeight).toBe(DD_MAX_H);
  });

  it("flips above the row near the bottom of the screen", () => {
    const a = anchorDropdown(row(820), vp); // only ~40px left below
    expect(a.top).toBeUndefined();
    expect(a.bottom).toBe(vp.height - 820 + DD_GAP);
    expect(a.maxHeight).toBe(DD_MAX_H); // 812px of room above
  });

  it("does not flip when the room below is merely tight, but shortens the list", () => {
    // 620px down a 900px screen: 232px below, 612px above. Room below still
    // clears the 160px threshold, so the list stays where the doctor expects it.
    const a = anchorDropdown(row(620), vp);
    expect(a.top).toBe(662);
    expect(a.maxHeight).toBe(232);
  });

  it("never draws a list shorter than the floor, however cramped", () => {
    // A phone in landscape with the keyboard up: 112px below, 72px above, so
    // there is nowhere better to flip to.
    const a = anchorDropdown(row(80), { width: 640, height: 240 });
    expect(a.top).toBe(122);
    expect(a.maxHeight).toBe(120);
  });

  it("pulls the list back on screen at the right edge", () => {
    const a = anchorDropdown(row(200, 40, 1300), vp);
    // 520 wide, so the furthest left it may start is 1440 - 8 - 520.
    expect(a.left).toBe(912);
  });

  it("pulls it back on a narrow phone too, where the list is 92vw wide", () => {
    const a = anchorDropdown(row(200, 40, 40), { width: 360, height: 740 });
    expect(a.left).toBe(21); // 360 - 8 - 331.2, rounded
    expect(a.left).toBeGreaterThanOrEqual(DD_EDGE);
  });

  it("keeps a comfortably placed row exactly where it is", () => {
    expect(anchorDropdown(row(300, 40, 120), vp).left).toBe(120);
  });
});

describe("sameAnchor", () => {
  const a = { left: 10, top: 20, maxHeight: 320 };

  it("is true for the same pixels, so typing does not re-render the pad", () => {
    expect(sameAnchor(a, { left: 10, top: 20, maxHeight: 320 })).toBe(true);
  });

  it("is false when anything moved", () => {
    expect(sameAnchor(a, { left: 11, top: 20, maxHeight: 320 })).toBe(false);
    expect(sameAnchor(a, { left: 10, top: 21, maxHeight: 320 })).toBe(false);
    expect(sameAnchor(a, { left: 10, top: 20, maxHeight: 300 })).toBe(false);
    // Flipped above vs hanging below is a move, not a match.
    expect(sameAnchor(a, { left: 10, bottom: 20, maxHeight: 320 })).toBe(false);
  });

  it("handles the closed dropdown", () => {
    expect(sameAnchor(null, null)).toBe(true);
    expect(sameAnchor(null, a)).toBe(false);
    expect(sameAnchor(a, null)).toBe(false);
  });
});

// ⚕️ The app is drawn at `body { zoom: 1.12 }`. Measured in Chrome 152 on
// 2026-10-09: the row being typed in ended 433px down the screen and its list
// of medicines was drawn at 487px — under the NEXT line of the prescription.
// A rect is in screen pixels; a fixed box inside the zoomed page is placed in
// the page's own.
describe("the list is placed in the zoomed page's own pixels", () => {
  const el = (drawn: number, laidOut: number) => ({ offsetWidth: laidOut, getBoundingClientRect: () => ({ width: drawn }) });

  it("reads the zoom off the element: how wide it is drawn over how wide it is laid out", () => {
    expect(zoomScale(el(784.03125, 700))).toBe(1.12);
    expect(zoomScale(el(700, 700))).toBe(1);
    expect(zoomScale(el(1050, 700))).toBe(1.5);
  });

  it("is exactly 1 where there is nothing to measure — a test's DOM, a hidden row", () => {
    expect(zoomScale(el(0, 0))).toBe(1);
    expect(zoomScale(el(784, 0))).toBe(1);
    expect(zoomScale(el(NaN, 700))).toBe(1);
  });

  it("changes nothing on a page that is not zoomed", () => {
    const rect = { top: 388.5, bottom: 433.3, left: 430.2 };
    expect(toLayoutPx(rect, vp, 1)).toEqual({ rect, vp });
  });

  it("⚕️ hangs the list under the line being typed, not the one after it", () => {
    // The numbers measured in the browser.
    const screen = { width: 1280, height: 820 };
    const row = { top: 388.53125, bottom: 433.328125, left: 430.234375 };
    const k = 1.12;

    const { rect, vp: inPage } = toLayoutPx(row, screen, k);
    const a = anchorDropdown(rect, inPage);
    // Where that lands on the SCREEN: its own pixels times the zoom.
    const drawnTop = a.top! * k;
    const drawnLeft = a.left * k;
    expect(drawnTop - row.bottom).toBeGreaterThanOrEqual(0);
    expect(drawnTop - row.bottom).toBeLessThan(4); // was 54
    expect(Math.abs(drawnLeft - row.left)).toBeLessThan(1); // was 51 to the right

    // Without the conversion: the defect.
    const wrong = anchorDropdown(row, screen);
    expect(wrong.top! * k - row.bottom).toBeGreaterThan(50);
  });

  it("the flip near the foot of the screen is judged in the same pixels", () => {
    // 700px down an 820px screen: 120px of real room below, so it must flip.
    // Judged in screen pixels against page pixels it looked like more.
    const screen = { width: 1280, height: 820 };
    const row = { top: 660, bottom: 700, left: 430 };
    const { rect, vp: inPage } = toLayoutPx(row, screen, 1.12);
    const a = anchorDropdown(rect, inPage);
    expect(a.top).toBeUndefined();
    // Its bottom edge, back on the screen, sits just above the row.
    const drawnBottomEdge = screen.height - a.bottom! * 1.12;
    expect(row.top - drawnBottomEdge).toBeGreaterThanOrEqual(0);
    expect(row.top - drawnBottomEdge).toBeLessThan(4);
  });

  it("on a phone the list is kept inside the screen it is really drawn on", () => {
    const screen = { width: 375, height: 812 };
    const row = { top: 300, bottom: 340, left: 200 };
    const k = 1.12;
    const { rect, vp: inPage } = toLayoutPx(row, screen, k);
    const a = anchorDropdown(rect, inPage);
    const widest = Math.min(520, inPage.width * 0.92); // what MedicinePad allows it
    expect(a.left * k + widest * k).toBeLessThanOrEqual(screen.width);
    expect(a.left).toBeGreaterThanOrEqual(DD_EDGE);
  });
});
