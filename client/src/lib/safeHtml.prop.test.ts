// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { SENSITIVE_MARK_HREF, isBlankHtml, sanitizeHtml } from "./safeHtml";
import { configureProps, wellFormedText as anyText } from "@/test/fc";

// The personal patient note is stored HTML that is "rendered back into the page
// and into a print frame, so it is cleaned on the way OUT, every time: only
// formatting tags survive, every attribute but a filtered `style` is dropped
// (no on*, no href/src …)" (lib/safeHtml.ts). These throw HTML-ish junk at it
// and check what comes out, structurally — by re-parsing the output, the way
// the browser that renders it will.
configureProps(300);

// ── the allowlist, restated from the module's own header ───────────────────
const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup", "mark",
  "p", "div", "span", "br", "font", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote",
  "a", // only as the sensitive mark, checked below
]);

// ── HTML-ish input ─────────────────────────────────────────────────────────
const tag = fc.constantFrom(
  "b", "i", "u", "p", "div", "span", "font", "ul", "li", "h1", "blockquote", "mark", "br",
  "a", "script", "style", "img", "svg", "math", "iframe", "object", "embed", "template", "noscript",
  "table", "tr", "td", "form", "input", "button", "video", "audio", "link", "meta", "base", "body", "html",
  "SCRIPT", "ScRiPt", "A", "IMG", "x-custom", "textarea", "title", "plaintext", "xmp", "select", "option",
);
const attr = fc.constantFrom(
  "", ' onclick="alert(1)"', " onerror=alert(1)", ' ONLOAD="x()"', ' onmouseover=x', ' on="x"',
  ' href="javascript:alert(1)"', ' href="JaVaScRiPt:alert(1)"', ' href=" javascript:alert(1)"', ` href="${SENSITIVE_MARK_HREF}"`,
  ' href="https://example.test/"', ' src="x"', ' src="javascript:alert(1)"', ' srcdoc="<script>alert(1)</script>"',
  ' style="color: red"', ' style="background-color: url(javascript:alert(1))"', ' style="color: red; position: fixed"',
  ' style="font-size: 18px; background-color: rgb(255, 241, 118)"', ' style="color: expression(alert(1))"',
  ' style="color: red onclick=x"', ' style="font-family: &quot;javascript:x&quot;"',
  ' color="#c00"', ' color="javascript:x"', ' size="3"', ' size="99"', ' id="x"', ' class="y"', ' data-x="1"', ' formaction="javascript:x"',
  ' xlink:href="javascript:x"', ' action="javascript:x"',
);
const text = fc.oneof(
  fc.constantFrom(
    "BP", "K+", "Metformin 500 mg", "1+0+1", "ঠিক আছে", "খাবার পর", "​", "&lt;script&gt;", "&amp;", "<", ">", "&", '"', "'",
    "javascript:alert(1)", "<script>alert(1)</script>", "<!-- c -->", "<![CDATA[x]]>", "</", "<<", "onclick=x", " ",
  ),
  anyText(10),
);
const piece = fc.oneof(
  text,
  fc.tuple(tag, attr, attr).map(([t, a, b]) => `<${t}${a}${b}>`),
  tag.map((t) => `</${t}>`),
  fc.tuple(tag, attr, text).map(([t, a, x]) => `<${t}${a}>${x}</${t}>`),
  fc.tuple(tag, attr).map(([t, a]) => `<${t}${a}`), // unterminated
);
const htmlish = fc.array(piece, { maxLength: 14 }).map((p) => p.join(""));

const parse = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;

/** Everything in the output that could execute or load something. */
function hazards(out: string): string[] {
  const found: string[] = [];
  for (const el of parse(out).querySelectorAll("*")) {
    const name = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) found.push(`<${name}>`);
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith("on")) found.push(`${name}[${a.name}]`);
      if (/^\s*javascript:/i.test(a.value)) found.push(`${name}[${a.name}="${a.value}"]`);
      if (n === "href" && !(name === "a" && a.value === SENSITIVE_MARK_HREF)) found.push(`${name}[href="${a.value}"]`);
      if (n === "style" && /url\s*\(|expression\s*\(|javascript:|[<>]/i.test(a.value)) found.push(`${name}[style="${a.value}"]`);
      if (!["style", "color", "size", "href"].includes(n)) found.push(`${name}[${a.name}]`);
      if ((n === "color" || n === "size") && name !== "font") found.push(`${name}[${a.name}]`);
    }
  }
  return found;
}

describe("sanitizeHtml — nothing that can run survives", () => {
  it("the output never contains <script, an on*= attribute or a javascript: URL", () => {
    fc.assert(
      fc.property(htmlish, (html) => {
        const out = sanitizeHtml(html);
        // In the serialised output a literal "<" in text is "&lt;", so a
        // "<script" in the string can only be a real element.
        expect(out).not.toMatch(/<script/i);
        expect(out).not.toMatch(/<(style|iframe|object|embed|img|svg|math|link|meta|video|audio|template|noscript)\b/i);
        expect(hazards(out)).toEqual([]);
      }),
    );
  });

  it("the same holds for arbitrary text, not only HTML-shaped text", () => {
    fc.assert(
      fc.property(anyText(60), (html) => {
        const out = sanitizeHtml(html);
        expect(out).not.toMatch(/<script/i);
        expect(hazards(out)).toEqual([]);
      }),
    );
  });

  it("is total: any string in, a string out, never a throw", () => {
    fc.assert(
      fc.property(fc.oneof(htmlish, anyText(60)), (html) => {
        expect(typeof sanitizeHtml(html)).toBe("string");
        expect(typeof isBlankHtml(html)).toBe("boolean");
      }),
    );
  });
});

describe("sanitizeHtml — cleaning what is already clean", () => {
  // The note is cleaned on the way out EVERY time it is rendered, so a second
  // pass over its own output must still be safe, and must not lose a word.
  it("a second pass is still safe and keeps every word the first pass kept", () => {
    fc.assert(
      fc.property(htmlish, (html) => {
        const once = sanitizeHtml(html);
        const twice = sanitizeHtml(once);
        expect(hazards(twice)).toEqual([]);
        expect(parse(twice).textContent).toBe(parse(once).textContent);
      }),
    );
  });

  // Idempotence holds for everything EXCEPT the two shapes of DEFECT-D4, just
  // below — both a tree the sanitiser builds by unwrapping a tag, and that
  // cannot be written as HTML:
  //   • markup nested inside an element the HTML parser treats as a scope
  //     boundary (a pasted <table>, a <button>);
  //   • a heading left directly inside a heading. The parser only lets a
  //     heading stand in a heading when some other tag is between them, and
  //     the sanitiser takes that tag away (<a>, <form>, an unknown one).
  // The second was not set aside until 2026-10-12, and the property failed
  // about one run of the whole suite in twenty — whenever the random input
  // happened to hold it. A test whose outcome varies is telling the truth:
  // the shape is real, and it is pinned below instead of left to chance.
  const BOUNDARY = /<\/?(table|tr|td|button)\b/i;
  const HEADING_IN_HEADING = /<(h[1-4])\b[^>]*>(?:(?!<\/\1>)[\s\S])*?<h[1-4]\b/i;
  it("is idempotent: sanitising sanitised HTML returns it unchanged", () => {
    fc.assert(
      fc.property(htmlish.filter((h) => !BOUNDARY.test(h)), (html) => {
        const once = sanitizeHtml(html);
        fc.pre(!HEADING_IN_HEADING.test(once));
        expect(sanitizeHtml(once)).toBe(once);
      }),
    );
  });

  it("the shape set aside above is exactly a heading opened inside an open heading", () => {
    expect(HEADING_IN_HEADING.test("<h1>a<h1>b</h1>c</h1>")).toBe(true);
    expect(HEADING_IN_HEADING.test("<h2>a<b><h1>b</h1></b></h2>")).toBe(true);
    expect(HEADING_IN_HEADING.test("<h1>a</h1><h1>b</h1>")).toBe(false);
    expect(HEADING_IN_HEADING.test("<h1>a</h1><p>b</p><h2>c</h2>")).toBe(false);
    expect(HEADING_IN_HEADING.test("<p>a<b>b</b></p>")).toBe(false);
  });

  // DEFECT-D4 (low — layout only, nothing unsafe and no word lost): sanitizeHtml is not idempotent when it unwraps a table/button that held a block inside a <p>.
  // Minimal counter-example:
  //   sanitizeHtml("<p>a<table><tr><td><p>b</p></td></tr></table>c</p>")  === "<p>a<p>b</p>c</p>"
  //   sanitizeHtml("<p>a<p>b</p>c</p>")                                   === "<p>a</p><p>b</p>c<p></p>"
  // Source: src/lib/safeHtml.ts:57-62 — an unknown wrapper is replaced by its children,
  // which can leave a <p> directly inside a <p>; that tree cannot be written as HTML, so
  // the stored note re-parses into a different one (an extra empty paragraph) the next
  // time it is cleaned "on the way OUT, every time". Not a rule in client/CLAUDE.md —
  // it contradicts the idempotence this suite was asked to check. Reachable by pasting
  // a table into the personal note.
  it.fails("DEFECT-D4: a pasted table inside a paragraph cleans to the same HTML every time", () => {
    const once = sanitizeHtml("<p>a<table><tr><td><p>b</p></td></tr></table>c</p>");
    expect(sanitizeHtml(once)).toBe(once);
  });
  // The same defect by its other door (found 2026-10-12, by the property above
  // failing on one run in about twenty):
  //   sanitizeHtml('<h1>a<a href="x"><h1>b</h1></a>c</h1>')  === "<h1>a<h1>b</h1>c</h1>"
  //   sanitizeHtml("<h1>a<h1>b</h1>c</h1>")                    === "<h1>a</h1><h1>b</h1>c"
  // Layout only, again: no word is lost and nothing unsafe comes out.
  it.fails("DEFECT-D4: a heading inside a link inside a heading cleans to the same HTML every time", () => {
    const once = sanitizeHtml('<h1>a<a href="x"><h1>b</h1></a>c</h1>');
    expect(sanitizeHtml(once)).toBe(once);
  });
  it.fails("DEFECT-D4 (property): the same for any block inside a table cell or button inside a <p>", () => {
    const blockTag = fc.constantFrom("p", "div", "ul", "h1", "blockquote");
    const wrapper = fc.constantFrom(["<table><tr><td>", "</td></tr></table>"], ["<button>", "</button>"]);
    fc.assert(
      fc.property(blockTag, wrapper, (b, [open, close]) => {
        const once = sanitizeHtml(`<p>a${open}<${b}>b</${b}>${close}c</p>`);
        expect(sanitizeHtml(once)).toBe(once);
      }),
    );
  });

  it("reaches a fixed point: a third pass never differs from the second", () => {
    fc.assert(
      fc.property(htmlish, (html) => {
        const twice = sanitizeHtml(sanitizeHtml(html));
        expect(sanitizeHtml(twice)).toBe(twice);
      }),
    );
  });
});

describe("sanitizeHtml — the words themselves", () => {
  // "never changes the words themselves" (safeHtml.test.ts): plain text — a
  // dose, a Bangla instruction — comes back as the same text.
  it("plain text with no markup reads back as exactly the same text", () => {
    const plain = fc.oneof(
      fc.string({ unit: fc.constantFrom(..."abcXYZ 0123456789+/-.,:()%"), maxLength: 40 }),
      fc.constantFrom("Metformin 500 mg 1+0+1 — ঠিক আছে", "খাবার পর", "1/2+0+1/2", "0.5"),
    );
    fc.assert(
      fc.property(plain, (s) => {
        expect(parse(sanitizeHtml(s)).textContent).toBe(s);
      }),
    );
  });
});
