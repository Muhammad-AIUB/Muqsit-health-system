// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isBlankHtml, sanitizeHtml } from "./safeHtml";

describe("sanitizeHtml", () => {
  it("keeps the editor's formatting: bold, size, colour, highlight", () => {
    const html = '<b>BP</b> <span style="font-size: 18px; background-color: rgb(255, 241, 118)">watch</span> <font color="#c00">K+</font>';
    const out = sanitizeHtml(html);
    expect(out).toContain("<b>BP</b>");
    expect(out).toContain("font-size: 18px");
    expect(out).toContain("background-color: rgb(255, 241, 118)");
    expect(out).toContain('<font color="#c00">K+</font>');
  });

  it("drops scripts, event handlers and links, keeping the text", () => {
    const out = sanitizeHtml('<p onclick="x()">hi<script>alert(1)</script></p><a href="javascript:x">link</a><img src=x onerror=alert(1)>');
    expect(out).toBe("<p>hi</p>link");
  });

  it("drops a style that could load or run anything", () => {
    const out = sanitizeHtml('<span style="background-color: url(http://x); color: red; position: fixed">t</span>');
    expect(out).toBe('<span style="color: red">t</span>');
  });

  it("never changes the words themselves", () => {
    expect(sanitizeHtml("Metformin 500 mg <b>1+0+1</b> — ঠিক আছে")).toBe("Metformin 500 mg <b>1+0+1</b> — ঠিক আছে");
  });

  // The prescription header may carry the clinic's logo (2026-10-07). Only a
  // picture served over http(s) or from the app's own uploads, and only its
  // size and alt text — never a handler, never an inline data: image.
  describe("{ images: true } — the prescription header's logo", () => {
    it("keeps an uploaded picture with its size, and nothing else on it", () => {
      const out = sanitizeHtml(
        '<img src="https://muqsithealthsystem.com/uploads/logo.png" width="120" height="40" alt="Clinic" onerror="alert(1)" style="position:fixed" class="x">',
        { images: true },
      );
      expect(out).toBe('<img src="https://muqsithealthsystem.com/uploads/logo.png" width="120" height="40" alt="Clinic">');
      expect(sanitizeHtml('<img src="/uploads/abc.jpg">', { images: true })).toBe('<img src="/uploads/abc.jpg">');
    });

    it("drops a picture whose source is not a plain web address", () => {
      for (const src of ["data:image/png;base64,AAAA", "javascript:alert(1)", "blob:https://x/y", "/etc/passwd", "ftp://x/y.png", ""]) {
        expect(sanitizeHtml(`<b>Dr</b><img src="${src}">`, { images: true })).toBe("<b>Dr</b>");
      }
      // A size that is not a plain number is dropped, the picture kept.
      expect(sanitizeHtml('<img src="https://x/y.png" width="100%" height="1e9">', { images: true })).toBe('<img src="https://x/y.png">');
    });

    it("still drops every picture by default — the personal note never prints one", () => {
      expect(sanitizeHtml('<b>Dr</b><img src="https://x/y.png">')).toBe("<b>Dr</b>");
    });
  });
});

describe("isBlankHtml — the editor's zero-width caret anchor is not text", () => {
  it("a sensitive run holding only the anchor is blank", () => {
    expect(isBlankHtml('<a href="mhs-sensitive:1">​</a>')).toBe(true);
  });
});

describe("isBlankHtml", () => {
  it("treats an emptied editor as blank", () => {
    expect(isBlankHtml("<div><br></div>")).toBe(true);
    expect(isBlankHtml("<b>x</b>")).toBe(false);
  });
});
