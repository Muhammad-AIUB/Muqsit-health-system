// Highlight detection for RichTextEditor's toggle. document.queryCommandValue
// ("hiliteColor") returns "" in Chrome, so the button cannot ask the browser
// whether text is already marked — it reads the inline backgrounds instead.

/** The highlight a caret or character sits in: the NEAREST element (up to, not
 *  including, `root`) that declares an inline background colour, or null when
 *  that nearest declaration is transparent — text un-highlighted inside a
 *  highlight is not highlighted. */
export function highlightedRun(node: Node, root: Node): HTMLElement | null {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) {
    if (n.nodeType === 1) {
      const bg = (n as HTMLElement).style?.backgroundColor;
      if (!bg) continue;
      return bg === "transparent" || bg === "rgba(0, 0, 0, 0)" ? null : (n as HTMLElement);
    }
  }
  return null;
}

/** True when every non-empty text node the range touches is highlighted, so
 *  pressing Highlight again should take the highlight off. */
export function rangeIsHighlighted(range: Range, root: Node): boolean {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  const texts: Node[] = [];
  if (range.commonAncestorContainer.nodeType === 3) texts.push(range.commonAncestorContainer);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (range.intersectsNode(n)) texts.push(n);
  }
  const visible = texts.filter((t) => (t.textContent ?? "").trim() !== "");
  return visible.length > 0 && visible.every((t) => highlightedRun(t, root) !== null);
}
