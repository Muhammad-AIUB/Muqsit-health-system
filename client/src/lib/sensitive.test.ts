// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { hasSensitive, rangeIsSensitive, sensitiveRun, stripSensitive, SENSITIVE_HREF } from "./sensitive";
import { sanitizeHtml, SENSITIVE_MARK_HREF } from "./safeHtml";

const S = (t: string) => `<a href="${SENSITIVE_HREF}">${t}</a>`;

describe("the sensitive mark survives the sanitiser — and nothing else does", () => {
  it("keeps the mark exactly", () => {
    expect(sanitizeHtml(`a ${S("secret")} b`)).toBe(`a ${S("secret")} b`);
  });

  it("the sanitiser and the mark agree on the one href", () => {
    expect(SENSITIVE_MARK_HREF).toBe(SENSITIVE_HREF);
  });

  it("drops every other attribute on the mark", () => {
    expect(sanitizeHtml(`<a href="${SENSITIVE_HREF}" onclick="x()" style="color:red" target="_blank">s</a>`)).toBe(S("s"));
  });

  it("unwraps any other link, keeping only its text", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">s</a>')).toBe("s");
    expect(sanitizeHtml('<a href="https://x.test">s</a>')).toBe("s");
    expect(sanitizeHtml('<a href="MHS-SENSITIVE:1">s</a>')).toBe("s");
    expect(sanitizeHtml('<a href=" mhs-sensitive:1">s</a>')).toBe("s");
  });

  it("drops the zero-width spaces the editor uses to place the caret", () => {
    expect(sanitizeHtml(`a​b`)).toBe("ab");
  });
});

describe("stripSensitive", () => {
  it("removes the sensitive text entirely and keeps the rest", () => {
    expect(stripSensitive(`Watch K+ ${S("HIV positive")} next visit`)).toBe("Watch K+  next visit");
  });

  it("removes every marked line — the per-line marks createLink makes", () => {
    expect(stripSensitive(`<div>P ${S("aaa")}</div><div>${S("mid line")}</div><div>${S("bbb")} Q</div>`))
      .toBe("<div>P </div><div></div><div> Q</div>");
  });

  it("removes a mark holding a line break", () => {
    expect(stripSensitive(`keep ${S("one<br>two")}`)).toBe("keep ");
  });

  it("removes marks under other formatting, and leaves an unmarked note untouched", () => {
    expect(stripSensitive(`x<b>${S("y")}</b>z`)).toBe("x<b></b>z");
    expect(stripSensitive(`x${S("<b>y</b>")}z`)).toBe("xz");
    expect(stripSensitive("<b>plain</b> note")).toBe("<b>plain</b> note");
  });

  it("sanitises what it returns", () => {
    expect(stripSensitive(`ok<script>alert(1)</script>`)).toBe("ok");
  });
});

describe("hasSensitive", () => {
  it("is true only when a mark holds visible text", () => {
    expect(hasSensitive(`a ${S("b")}`)).toBe(true);
    expect(hasSensitive(`a ${S("​​")}`)).toBe(false);
    expect(hasSensitive("plain")).toBe(false);
    expect(hasSensitive('<a href="https://x.test">link</a>')).toBe(false);
    expect(hasSensitive("")).toBe(false);
  });
});

describe("rangeIsSensitive", () => {
  const root = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; return d; };
  it("is true only when every selected character is marked", () => {
    const all = root(`a ${S("secret")}`);
    const r1 = document.createRange(); r1.selectNodeContents(all.querySelector("a")!);
    expect(rangeIsSensitive(r1, all)).toBe(true);
    const r2 = document.createRange(); r2.selectNodeContents(all);
    expect(rangeIsSensitive(r2, all)).toBe(false);
  });

  it("is true across lines when each line's part is marked", () => {
    const el = root(`<div>${S("aaa")}</div><div>${S("bbb")}</div>`);
    const r = document.createRange(); r.selectNodeContents(el);
    expect(rangeIsSensitive(r, el)).toBe(true);
  });
});

describe("sensitiveRun", () => {
  it("finds the mark around a node, and stops at the editor", () => {
    const root = document.createElement("div");
    root.innerHTML = `a ${S("<b>b</b>")}`;
    const b = root.querySelector("b")!;
    expect(sensitiveRun(b.firstChild!, root)).toBe(root.querySelector("a"));
    expect(sensitiveRun(root.firstChild!, root)).toBeNull();
  });
});
