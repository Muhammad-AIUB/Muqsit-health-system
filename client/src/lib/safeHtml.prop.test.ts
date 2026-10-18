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

// A tree HTML cannot write (DEFECT-D4, below): read again, a tag in it closes an
// element that is still open, so the parser builds another tree. Walked over the
// output's own tags with the parser's rules for the tags the sanitiser keeps
// (none of its scope boundaries — table, button, object — survive it):
//   • a block (p, div, ul, ol, li, blockquote, h1-h4) opened while a <p> is open
//     closes the <p>;
//   • an <li> closes the nearest open <li> unless a list, a blockquote or a
//     heading stands between them;
//   • a heading opened while the CURRENT element is a heading closes it.
const BLOCK = new Set(["p", "div", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4"]);
const LI_STOP = new Set(["ul", "ol", "blockquote", "h1", "h2", "h3", "h4"]);
const HEADING = /^h[1-6]$/;
function unwritable(html: string): boolean {
  const open: string[] = [];
  const tags = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    const name = m[2].toLowerCase();
    if (m[1]) {
      const at = open.lastIndexOf(name);
      if (at >= 0) open.length = at;
      continue;
    }
    if (name === "br") continue;
    if (BLOCK.has(name) && open.includes("p")) return true;
    if (name === "li") {
      for (let i = open.length - 1; i >= 0 && !LI_STOP.has(open[i]); i--) if (open[i] === "li") return true;
    }
    if (HEADING.test(name) && HEADING.test(open[open.length - 1] ?? "")) return true;
    open.push(name);
  }
  return false;
}

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

  // Idempotence holds for everything EXCEPT DEFECT-D4, just below: a tree the
  // sanitiser builds by unwrapping a tag, and that cannot be written as HTML —
  // read again, a tag in it closes an element that is still open. Three doors
  // have been found, each by this property failing at random:
  //   • a block inside a <p>, through a scope boundary (a pasted <table>, a
  //     <button>, an <object>) that is unwrapped;
  //   • a heading directly inside a heading (12/10/2026), through an <a>, a
  //     <form> or an unknown tag;
  //   • a list item inside a list item with no list between them (18/10/2026,
  //     a release review: `<li><form on="x"</b><li …`), through a <form>.
  // A test whose outcome varies is telling the truth. So the shape is set
  // aside by the PARSER's rules (`unwritable`, held against the parser itself
  // below) rather than one pattern per door, and each door is pinned below.
  const BOUNDARY = /<\/?(table|tr|td|button)\b/i;
  it("is idempotent: sanitising sanitised HTML returns it unchanged", () => {
    fc.assert(
      fc.property(htmlish.filter((h) => !BOUNDARY.test(h)), (html) => {
        const once = sanitizeHtml(html);
        fc.pre(!unwritable(once));
        expect(sanitizeHtml(once)).toBe(once);
      }),
    );
  });

  it("what is set aside above is exactly what the parser reads back as another tree", () => {
    const cases = [
      "<p>a<p>b</p>c</p>", "<p>a<div>b</div>c</p>", "<p>a<ul><li>b</li></ul></p>",
      "<li>a<li>b</li>c</li>", "<li>a<b><li>b</li></b></li>", "<li>x<ul><li>a</li></ul><li>b</li></li>",
      "<h1>a<h1>b</h1>c</h1>",
      "<li>a<ul><li>b</li></ul></li>", "<ul><li>a</li><li>b</li></ul>", "<h1>a</h1><h1>b</h1>",
      "<h1>a</h1><p>b</p><h2>c</h2>", "<p>a<b>b</b></p>", "<blockquote><p>a</p></blockquote>",
      "<li>a<blockquote><li>b</li></blockquote></li>", "<div><p>a</p><div>b</div></div>",
    ];
    for (const html of cases) expect([html, unwritable(html)]).toEqual([html, parse(html).innerHTML !== html]);
    expect(cases.filter(unwritable)).toHaveLength(7);
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
  // Its third door (18/10/2026, found when the property failed in a release
  // review — FC_SEED=-712153131 replays it):
  //   sanitizeHtml('<li>a<form><li>b</li></form>c</li>')  === "<li>a<li>b</li>c</li>"
  //   sanitizeHtml("<li>a<li>b</li>c</li>")                === "<li>a</li><li>b</li>c"
  // Layout only: no word is lost and nothing unsafe comes out.
  it.fails("DEFECT-D4: a list item inside a form inside a list item cleans to the same HTML every time", () => {
    const once = sanitizeHtml("<li>a<form><li>b</li></form>c</li>");
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
