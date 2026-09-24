// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { hasSensitive, rangeIsSensitive, sensitiveRun, stripSensitive, SENSITIVE_ATTR } from "./sensitive";
import { sanitizeHtml } from "./safeHtml";

const S = (t: string) => `<span ${SENSITIVE_ATTR}="1">${t}</span>`;

describe("the sensitive marker survives the sanitiser", () => {
  it("keeps data-sensitive on a span", () => {
    expect(sanitizeHtml(`a ${S("secret")} b`)).toBe(`a ${S("secret")} b`);
  });

  it("normalises the value and ignores it on any other tag", () => {
    expect(sanitizeHtml(`<span ${SENSITIVE_ATTR}="x" onclick="y">s</span>`)).toBe(S("s"));
    expect(sanitizeHtml(`<b ${SENSITIVE_ATTR}="1">s</b>`)).toBe("<b>s</b>");
  });

  it("drops the zero-width spaces the editor uses to place the caret", () => {
    expect(sanitizeHtml(`a​b`)).toBe("ab");
  });
});

describe("stripSensitive", () => {
  it("removes the sensitive text entirely and keeps the rest", () => {
    expect(stripSensitive(`Watch K+ ${S("HIV positive")} next visit`)).toBe("Watch K+  next visit");
  });

  it("removes every marked line, including ones spread over line breaks", () => {
    expect(stripSensitive(`<div>keep</div><div>${S("one<br>two")}</div>`)).toBe("<div>keep</div><div></div>");
  });

  it("removes nested marks and leaves an unmarked note untouched", () => {
    expect(stripSensitive(`x<b>${S("y")}</b>z`)).toBe("x<b></b>z");
    expect(stripSensitive("<b>plain</b> note")).toBe("<b>plain</b> note");
  });

  it("sanitises what it returns", () => {
    expect(stripSensitive(`ok<script>alert(1)</script>`)).toBe("ok");
  });
});

describe("hasSensitive", () => {
  it("is true only when a mark holds visible text", () => {
    expect(hasSensitive(`a ${S("b")}`)).toBe(true);
    expect(hasSensitive(`a ${S("​")}`)).toBe(false);
    expect(hasSensitive("plain")).toBe(false);
    expect(hasSensitive("")).toBe(false);
  });
});

describe("rangeIsSensitive", () => {
  const root = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; return d; };
  it("is true only when every selected character is marked", () => {
    const all = root(`a ${S("secret")}`);
    const r1 = document.createRange(); r1.selectNodeContents(all.querySelector("span")!);
    expect(rangeIsSensitive(r1, all)).toBe(true);
    const r2 = document.createRange(); r2.selectNodeContents(all);
    expect(rangeIsSensitive(r2, all)).toBe(false);
  });
});

describe("sensitiveRun", () => {
  it("finds the mark around a node, and stops at the editor", () => {
    const root = document.createElement("div");
    root.innerHTML = `a ${S("<b>b</b>")}`;
    const b = root.querySelector("b")!;
    expect(sensitiveRun(b.firstChild!, root)).toBe(root.querySelector("span"));
    expect(sensitiveRun(root.firstChild!, root)).toBeNull();
  });
});
