// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { highlightedRun, rangeIsHighlighted } from "./highlight";

function editor(html: string): HTMLDivElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}
const YELLOW = '<span style="background-color: rgb(255, 241, 118);">';

describe("rangeIsHighlighted", () => {
  it("is true when every selected character is highlighted", () => {
    const el = editor(`hello ${YELLOW}world</span>`);
    const r = document.createRange();
    r.selectNodeContents(el.querySelector("span")!);
    expect(rangeIsHighlighted(r, el)).toBe(true);
  });

  it("is false when part of the selection is plain", () => {
    const el = editor(`hello ${YELLOW}world</span>`);
    const r = document.createRange();
    r.selectNodeContents(el);
    expect(rangeIsHighlighted(r, el)).toBe(false);
  });

  it("is false for plain text", () => {
    const el = editor("hello world");
    const r = document.createRange();
    r.selectNodeContents(el);
    expect(rangeIsHighlighted(r, el)).toBe(false);
  });

  it("does not count a transparent background as a highlight", () => {
    const el = editor('<span style="background-color: transparent;">x</span>');
    const r = document.createRange();
    r.selectNodeContents(el);
    expect(rangeIsHighlighted(r, el)).toBe(false);
  });

  it("does not look past the editor for a background", () => {
    const outer = editor(`${YELLOW}<div>plain</div></span>`);
    const inner = outer.querySelector("div")!;
    const r = document.createRange();
    r.selectNodeContents(inner);
    expect(rangeIsHighlighted(r, inner)).toBe(false);
  });
});

describe("the nearest declared background wins", () => {
  it("text un-highlighted inside a highlight is NOT highlighted", () => {
    const el = editor(`${YELLOW}aa<span style="background-color: transparent;">bb</span>cc</span>`);
    const inner = el.querySelector("span span")!;
    expect(highlightedRun(inner.firstChild!, el)).toBeNull();
    const r = document.createRange();
    r.selectNodeContents(inner);
    expect(rangeIsHighlighted(r, el)).toBe(false);
  });
});

describe("highlightedRun", () => {
  it("returns the highlighted element around a caret", () => {
    const el = editor(`hello ${YELLOW}world</span>`);
    const span = el.querySelector("span")!;
    expect(highlightedRun(span.firstChild!, el)).toBe(span);
  });

  it("returns null for a caret in plain text", () => {
    const el = editor(`hello ${YELLOW}world</span>`);
    expect(highlightedRun(el.firstChild!, el)).toBeNull();
  });
});
