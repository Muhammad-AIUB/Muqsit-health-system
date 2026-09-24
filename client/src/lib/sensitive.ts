// "Sensitive information" marks in the personal note (physician's request,
// 2026-09-25). Text written while the editor's Sensitive button is on is
// wrapped in <span data-sensitive="1">; at print the doctor chooses whether
// those runs go on the page. The mark is an ATTRIBUTE styled by CSS — never an
// inline background — so it can never be mistaken for, or toggled off by, the
// yellow highlighter.

import { sanitizeHtml } from "./safeHtml";

export const SENSITIVE_ATTR = "data-sensitive";
const SELECTOR = `span[${SENSITIVE_ATTR}]`;

/** One look everywhere (editor, saved view, printed copy). Scoped under the
 *  given selector so it never styles anything outside the note. */
export function sensitiveCss(scope: string): string {
  return `${scope} ${SELECTOR} { background: #EDE7F6; border-bottom: 2px dashed #7E57C2; border-radius: 3px; padding: 0 2px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${scope} ${SELECTOR}::before { content: "🔒"; font-size: 0.75em; margin-right: 2px; }
${scope} ${SELECTOR} ${SELECTOR} { border-bottom: none; padding: 0; }
${scope} ${SELECTOR} ${SELECTOR}::before { content: none; }`;
}

/** The sensitive span (up to, not including, `root`) that `node` sits in. */
export function sensitiveRun(node: Node, root: Node): HTMLElement | null {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) {
    if (n.nodeType === 1 && (n as Element).matches(SELECTOR)) return n as HTMLElement;
  }
  return null;
}

/** True when every non-empty text node the range touches is marked sensitive. */
export function rangeIsSensitive(range: Range, root: Node): boolean {
  const doc = root.ownerDocument ?? document;
  const texts: Node[] = [];
  if (range.commonAncestorContainer.nodeType === 3) texts.push(range.commonAncestorContainer);
  const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (range.intersectsNode(n)) texts.push(n);
  const visible = texts.filter((t) => (t.textContent ?? "").replace(/​/g, "").trim() !== "");
  return visible.length > 0 && visible.every((t) => sensitiveRun(t, root) !== null);
}

/** Sanitised HTML with every sensitive run removed, text and all. */
export function stripSensitive(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${sanitizeHtml(html)}</body>`, "text/html");
  doc.body.querySelectorAll(SELECTOR).forEach((el) => el.remove());
  return doc.body.innerHTML;
}

/** True when the note carries a sensitive run with visible text in it. */
export function hasSensitive(html: string): boolean {
  if (!html) return false;
  const doc = new DOMParser().parseFromString(`<body>${sanitizeHtml(html)}</body>`, "text/html");
  return [...doc.body.querySelectorAll(SELECTOR)].some((el) => (el.textContent ?? "").trim() !== "");
}
