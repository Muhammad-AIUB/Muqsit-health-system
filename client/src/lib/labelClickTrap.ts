// Detects the "label click trap": a <label> carrying its own onClick while
// containing a form control.
//
// ⚕️ WHY THIS EXISTS. The "Keep eye on this patient" toggle was written that way
// and did nothing at all — for every user click the browser fires TWO trusted
// click events at the label: the real one, and the activation click it
// dispatches at the labelled control, which bubbles back up. React flushes
// between them, so the second handler reads the state the first just set and
// toggles it straight back. Net zero. Nothing throws, nothing logs, and the
// control simply looks broken.
//
// The trap is invisible in review — the markup reads perfectly — so it is
// pinned here as a rule over the source rather than left to be noticed again.
// A patient flagged for follow-up is a clinical intent; a toggle that silently
// refuses to record it is a lost one.
//
// Fix shape: put the handler on a <button> (no form control inside), or leave
// the label alone and handle `onChange` on the input. Never both.

export interface LabelClickTrap {
  /** 1-based line of the offending `<label` tag. */
  line: number;
  /** The opening tag, trimmed, for the failure message. */
  snippet: string;
}

const CONTROL = /<(input|select|textarea)\b/i;

/**
 * Scan JSX/TSX source for labels that both handle their own click AND wrap a
 * form control.
 *
 * Deliberately simple: it walks `<label` … `</label>` spans textually rather
 * than parsing JSX. The rule only needs to be right about this one shape, and a
 * parser would be a dependency for a check that has to stay cheap enough to run
 * over every file in the suite.
 */
export function detectLabelClickTraps(source: string): LabelClickTrap[] {
  const out: LabelClickTrap[] = [];
  const text = source ?? "";
  const open = /<label\b/gi;
  let m: RegExpExecArray | null;

  while ((m = open.exec(text)) !== null) {
    const start = m.index;
    const close = text.toLowerCase().indexOf("</label>", start);
    // An unclosed label is malformed source, not this rule's business.
    if (close === -1) continue;
    const block = text.slice(start, close);

    // The opening tag only, so an onClick on a CHILD button does not count.
    const tagEnd = block.indexOf(">");
    const openingTag = tagEnd === -1 ? block : block.slice(0, tagEnd + 1);
    if (!/\bonClick\s*=/.test(openingTag)) continue;
    if (!CONTROL.test(block)) continue;

    out.push({
      line: text.slice(0, start).split("\n").length,
      snippet: openingTag.replace(/\s+/g, " ").slice(0, 120),
    });
  }
  return out;
}
