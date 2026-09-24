// Allowlist sanitiser for HTML written in the app's own rich-text editor
// (the personal patient note). Whatever is stored is rendered back into the
// page and into a print frame, so it is cleaned on the way OUT, every time:
// only formatting tags survive, every attribute but a filtered `style` is
// dropped (no on*, no href/src; the one exception is the fixed
// data-sensitive="1" mark on a span), and a style keeps only plain typographic
// properties with no url()/expression(). Browser-only (DOMParser).

const TAGS = new Set([
  "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup", "mark",
  "p", "div", "span", "br", "font", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote",
]);

// Elements whose CONTENT must go too, not just the tag.
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "svg", "math", "img", "video", "audio", "link", "meta"]);

const STYLE_PROPS = new Set([
  "font-weight", "font-style", "font-size", "font-family", "text-decoration", "text-decoration-line",
  "color", "background-color", "text-align", "margin-left", "padding-left", "line-height",
]);

function cleanStyle(style: string): string {
  const out: string[] = [];
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (!STYLE_PROPS.has(prop) || !val) continue;
    if (/url\s*\(|expression\s*\(|javascript:|[<>]/i.test(val)) continue;
    out.push(`${prop}: ${val}`);
  }
  return out.join("; ");
}

function cleanNode(node: Node, doc: Document): Node | null {
  // Zero-width spaces are the editor's caret anchors (sensitive typing), not text.
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode((node.textContent ?? "").replace(/​/g, ""));
  if (node.nodeType !== Node.ELEMENT_NODE) return null; // comments, etc.
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) return null;
  const kids = [...el.childNodes].map((c) => cleanNode(c, doc)).filter((c): c is Node => c !== null);
  if (!TAGS.has(tag)) {
    // Unknown wrapper (e.g. <a>, <table>): keep its text/children, lose the tag.
    const frag = doc.createDocumentFragment();
    kids.forEach((k) => frag.appendChild(k));
    return frag;
  }
  const out = doc.createElement(tag);
  const style = el.getAttribute("style");
  if (style) {
    const s = cleanStyle(style);
    if (s) out.setAttribute("style", s);
  }
  // The personal note's "sensitive information" mark (lib/sensitive.ts) — the one
  // data attribute kept, on a span only, with its value fixed to "1".
  if (tag === "span" && el.hasAttribute("data-sensitive")) out.setAttribute("data-sensitive", "1");
  // <font color/size> is what execCommand writes for colour and size.
  if (tag === "font") {
    const color = el.getAttribute("color");
    if (color && /^#?[0-9a-z]{1,20}$/i.test(color)) out.setAttribute("color", color);
    const size = el.getAttribute("size");
    if (size && /^[1-7]$/.test(size)) out.setAttribute("size", size);
  }
  kids.forEach((k) => out.appendChild(k));
  return out;
}

export function sanitizeHtml(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out = doc.createElement("div");
  [...doc.body.childNodes].forEach((c) => {
    const n = cleanNode(c, doc);
    if (n) out.appendChild(n);
  });
  return out.innerHTML;
}

/** True when the note has no visible text at all (an empty editor leaves `<br>`s). */
export function isBlankHtml(html: string): boolean {
  if (!html) return true;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  // U+200B (the editor's caret anchor) is not whitespace to trim().
  return !(doc.body.textContent ?? "").replace(/​/g, "").trim();
}
