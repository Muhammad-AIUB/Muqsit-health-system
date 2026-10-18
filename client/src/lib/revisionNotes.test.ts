// "Revision Notes" (physician's sheet, 18/10/2026, item 4): the rules under
// the notebook — search, pages, print, and what a save leaves unsaved.

import { describe, expect, it } from "vitest";
import { afterSave, findMatches, pageCount, revisionNotesPrintHtml, PAGE_HEIGHT_PX } from "./revisionNotes";

describe("findMatches", () => {
  it("finds every place a keyword stands, whatever its capitals", () => {
    expect(findMatches("HBV DNA, then hbv again; Hbv.", "hbv")).toEqual([
      { start: 0, end: 3 }, { start: 14, end: 17 }, { start: 25, end: 28 },
    ]);
  });
  it("does not count one place twice", () => {
    expect(findMatches("aaaa", "aa")).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  });
  it("finds nothing for nothing, or for spaces", () => {
    expect(findMatches("anything", "")).toEqual([]);
    expect(findMatches("anything", "   ")).toEqual([]);
  });
  it("takes the keyword as typed, inner spaces and all", () => {
    expect(findMatches("Child Pugh, ChildPugh", "child pugh")).toEqual([{ start: 0, end: 10 }]);
  });
  it("takes a pattern character as itself", () => {
    expect(findMatches("dose 1+0+1 and 1x0x1", "1+0")).toEqual([{ start: 5, end: 8 }]);
  });
});

describe("pageCount", () => {
  it("is at least one page", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
  });
  it("adds a page as the writing runs past one", () => {
    expect(pageCount(PAGE_HEIGHT_PX)).toBe(1);
    expect(pageCount(PAGE_HEIGHT_PX + 1)).toBe(2);
    expect(pageCount(PAGE_HEIGHT_PX * 3)).toBe(3);
  });
});

describe("afterSave", () => {
  it("what was sent is saved: nothing is left unsaved", () => {
    expect(afterSave("<p>a</p>", "<p>a</p>")).toBeNull();
  });
  it("what was typed while the save was on its way stays unsaved", () => {
    expect(afterSave("<p>ab</p>", "<p>a</p>")).toBe("<p>ab</p>");
  });
  it("nothing typed is nothing unsaved", () => {
    expect(afterSave(null, "<p>a</p>")).toBeNull();
  });
});

describe("revisionNotesPrintHtml", () => {
  const doc = revisionNotesPrintHtml("<p><b>Hepatitis</b> notes</p>", "18 Oct 2026 · 17:04");
  it("prints the notebook on A4, with its title and the time printed", () => {
    expect(doc).toContain("@page");
    expect(doc).toContain("A4");
    expect(doc).toContain("Revision Notes");
    expect(doc).toContain("18 Oct 2026 · 17:04");
    expect(doc).toContain("<p><b>Hepatitis</b> notes</p>");
  });
  it("keeps the highlight's colour on paper", () => {
    expect(doc).toContain("print-color-adjust: exact");
  });
  it("escapes the stamp", () => {
    expect(revisionNotesPrintHtml("", "<x>")).toContain("&lt;x&gt;");
  });
});
