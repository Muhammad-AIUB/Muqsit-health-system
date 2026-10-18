// "Revision Notes" (physician's sheet, 18/10/2026, item 4): the signed-in
// doctor's own notebook — written like a Word page (bold, highlight), pages
// added as the writing runs on, printed when needed, searched with Ctrl+F.
// The rules here are pure; `components/tabs/RevisionNotesView.tsx` draws them.

/** An A4 page at 96 px per inch (297 mm), the height a page is drawn and counted at. */
export const PAGE_HEIGHT_PX = 1123;
/** An A4 page's width at 96 px per inch (210 mm). */
export const PAGE_WIDTH_PX = 794;

export interface Match { start: number; end: number }

/** Every place `query` stands in `text`, capitals aside, none counted twice. */
export function findMatches(text: string, query: string): Match[] {
  const q = String(query ?? "").toLowerCase();
  if (!q.trim()) return [];
  const t = String(text ?? "").toLowerCase();
  const out: Match[] = [];
  let at = t.indexOf(q);
  while (at !== -1) {
    out.push({ start: at, end: at + q.length });
    at = t.indexOf(q, at + q.length);
  }
  return out;
}

/** How many pages a notebook this tall takes — at least one. */
export function pageCount(contentHeight: number, pageHeight = PAGE_HEIGHT_PX): number {
  return Math.max(1, Math.ceil((Number(contentHeight) || 0) / pageHeight));
}

/**
 * What is still unsaved once a save of `sent` has landed: nothing when the
 * text is what was sent, else the text as it stands (typed while the save was
 * on its way). A save never clears more than it sent.
 */
export function afterSave(edited: string | null, sent: string): string | null {
  return edited === null || edited === sent ? null : edited;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The printed notebook. `bodyHtml` must already be sanitised by the caller
 * (`sanitizeHtml`) — this module has no DOM to do it with.
 */
export function revisionNotesPrintHtml(bodyHtml: string, printedOn: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Revision Notes</title><style>
  @page { size: A4; margin: 18mm 16mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "DM Sans", Arial, sans-serif; color: #111; font-size: 13px; line-height: 1.6; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .sub { font-size: 11px; color: #555; margin-bottom: 14px; }
  .notes { overflow-wrap: anywhere; }
</style></head><body>
<h1>Revision Notes</h1>
<div class="sub">Printed ${esc(printedOn)}</div>
<div class="notes">${bodyHtml}</div>
</body></html>`;
}
