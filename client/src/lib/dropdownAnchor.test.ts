import { describe, expect, it } from "vitest";
import { anchorDropdown, sameAnchor, DD_MAX_H, DD_EDGE, DD_GAP } from "./dropdownAnchor";

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
