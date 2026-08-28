// Where the ℞ pad's medicine dropdown is drawn.
//
// The pad itself scrolls once a prescription runs long, and an `overflow`
// ancestor clips an absolutely positioned child — so the dropdown is
// `position: fixed` and anchored here, against the viewport, from the row's
// measured rect. A doctor mid-search must never have the list of medicines cut
// off by the edge of the pad or by the edge of the screen.

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface DropdownAnchor {
  left: number;
  // Exactly one of these is set: `top` hangs the list below the row, `bottom`
  // flips it above when there is more room up there.
  top?: number;
  bottom?: number;
  maxHeight: number;
}

export const DD_MAX_H = 320; // the height it had before it could be flipped
export const DD_MIN_H = 160; // below this, opening downwards is not worth it
export const DD_FLOOR_H = 120; // never draw a list shorter than this
export const DD_GAP = 2;
export const DD_EDGE = 8; // breathing room against the viewport edges

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function anchorDropdown(rect: AnchorRect, vp: Viewport, maxWidth = 520): DropdownAnchor {
  const below = vp.height - rect.bottom - DD_EDGE;
  const above = rect.top - DD_EDGE;
  const flip = below < DD_MIN_H && above > below;

  // Keep the whole list on screen sideways. The width is content-driven between
  // 200px and `maxWidth`, so the worst case is what is guarded against.
  const width = Math.min(maxWidth, vp.width * 0.92);
  const rightMost = vp.width - DD_EDGE - width;
  const left = rightMost <= DD_EDGE ? DD_EDGE : clamp(rect.left, DD_EDGE, rightMost);

  const room = flip ? above : below;
  // Whole pixels: a measured rect is fractional, and a re-render that only
  // moves the list by a hundredth of a pixel is churn.
  const maxHeight = Math.round(Math.min(DD_MAX_H, Math.max(DD_FLOOR_H, room)));

  return flip
    ? { left: Math.round(left), bottom: Math.round(vp.height - rect.top + DD_GAP), maxHeight }
    : { left: Math.round(left), top: Math.round(rect.bottom + DD_GAP), maxHeight };
}

// Two anchors that resolve to the same pixels should not cost a re-render on
// every keystroke.
export function sameAnchor(a: DropdownAnchor | null, b: DropdownAnchor | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.left === b.left && a.top === b.top && a.bottom === b.bottom && a.maxHeight === b.maxHeight;
}
