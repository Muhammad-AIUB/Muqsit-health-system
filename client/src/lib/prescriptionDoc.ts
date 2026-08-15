// Builds a clean, printable A4 prescription as an HTML string. Opened in a new
// window so the doctor can review and "Save as PDF" / print from the browser.

import { maskMobile, maskName } from "./rxPrivacy";

export interface RxLine {
  drug: string;
  dose: string;
  duration: string;
  instruction: string;
  // A free-typed instruction line — printed across the full width, no number.
  isNote?: boolean;
}

export interface PrescriptionDoc {
  doctorName: string;
  patient: {
    name: string;
    age: string;
    gender: string;
    address: string;
    weight: string;
    date: string;
    phone: string;
  };
  clinical: { label: string; items: string[] }[];
  rx: RxLine[];
  advice: string[];
  adviceTest: string[];
  followUp: string;
  // OPD only: print a second "privacy" page after the full one. On that page the
  // patient's identity (name + mobile) is masked and the clinical assessment is
  // hidden, so it can be handed to a pharmacy/lab without exposing who/what.
  extraPrivacyPage?: boolean;
  // Page size + margins from Prescription settings (in/cm). When omitted the
  // sheet falls back to A4. headerHeight/footerHeight reserve the top/bottom
  // bands (for a pre-printed letterhead pad).
  page?: {
    unit: "in" | "cm";
    width: string;
    height: string;
    marginLeft: string;
    marginRight: string;
    headerHeight: string;
    footerHeight: string;
  };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── The drug cell must print "form + name + strength" on ONE line ────────────
// A doctor reads "Tablet. Barcavir 0.5 mg" as a single phrase, and a dispenser
// reads the printed sheet the same way; broken across three lines it reads as
// three separate things, which on a legal medical document is a real misread
// risk, not a cosmetic one. The column is a fixed share of the page, so a long
// name is fitted by stepping the font DOWN rather than wrapping.
//
// Below FLOOR_PX the line stops being legible, and an unreadable single line is
// worse than two readable ones — so there, and only there, the cell wraps.
// Nothing is ever truncated or allowed to overflow the printable width.
const DRUG_COL_SHARE = 0.44;      // .rx-drug width, below
const RX_COL_SHARE = 1.6 / 2.4;   // .body grid is 0.8fr / 0.5px / 1.6fr
const RIGHT_PAD_PX = 18;          // .right padding-left
const RX_NO_PX = 22;              // .rx-no fixed width
const CELL_PAD_PX = 12;           // td padding, both sides
const BASE_PX = 13;
const FLOOR_PX = 8.5;
// Leave a sliver for the printer's own rounding and font hinting.
const FIT_SAFETY = 0.98;
// Fallback only, for when canvas text metrics are unavailable: mean advance per
// character of DM Sans / Arial bold, in em. Deliberately generous —
// overestimating costs a slightly smaller font, underestimating costs an
// overflow off the edge of the page.
const EM_PER_CHAR = 0.58;

// Real text metrics beat counting characters: "Tablet. Illlll 1 mg" and
// "Tablet. Wmmmmm 1 mg" are the same length and nowhere near the same width, and
// guessing wide shrinks a name that would have fitted. The sheet is built in the
// doctor's browser, so a canvas is there to ask. Cached — this runs per drug
// line, on every keystroke that rebuilds the preview.
let measureCtx: CanvasRenderingContext2D | null | undefined;
export function measureDrugWidth(text: string, px: number): number | null {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return null;
  measureCtx.font = `600 ${px}px "DM Sans", Arial, sans-serif`;
  const w = measureCtx.measureText(text).width;
  return Number.isFinite(w) && w > 0 ? w : null;
}

/** Usable width of the drug cell for this page setup, in CSS px. */
export function drugCellWidthPx(page?: PrescriptionDoc["page"]): number {
  const perUnit = (page?.unit ?? "in") === "cm" ? 37.8 : 96;
  const num = (v: string | undefined, fallback: number) => {
    const n = parseFloat(v ?? "");
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const content = (num(page?.width, 8.27) - num(page?.marginLeft, 0.4) - num(page?.marginRight, 0.4)) * perUnit;
  const table = content * RX_COL_SHARE - RIGHT_PAD_PX - RX_NO_PX;
  return Math.max(60, table * DRUG_COL_SHARE - CELL_PAD_PX);
}

/**
 * The font size that keeps `drug` on one line in a cell `cellPx` wide, and
 * whether that cell may wrap (only when even FLOOR_PX cannot fit it).
 * `measure` is injectable so this stays testable without a DOM.
 */
export function drugTextFit(
  drug: string,
  cellPx: number,
  measure: (text: string, px: number) => number | null = measureDrugWidth,
): { px: number; wrap: boolean } {
  const text = drug.trim();
  if (!text) return { px: BASE_PX, wrap: false };
  const atBase = measure(text, BASE_PX);
  // Text width scales linearly with font size within one family, so the size
  // that just fits is BASE × (available / width-at-BASE).
  const needed = atBase
    ? (BASE_PX * cellPx * FIT_SAFETY) / atBase
    : (cellPx * FIT_SAFETY) / (text.length * EM_PER_CHAR);
  if (needed >= BASE_PX) return { px: BASE_PX, wrap: false };
  if (needed < FLOOR_PX) return { px: FLOOR_PX, wrap: true };
  // Round DOWN — rounding up is what puts the last character on line two.
  return { px: Math.floor(needed * 10) / 10, wrap: false };
}

// Drug-history items carry storage prefixes — strip them for display.
const cleanItem = (s: string) =>
  esc(s.replace(/^(Current|Past)(\(note\)|\(cont\))?:\s*/, "").replace(/\s+—\s+/g, "  ·  "));

// Drug history on the printout: show only the medicine name (no date/dose/food/
// duration). Entries are date-stamped ("dd/mm/yyyy: Drug — …") — legacy
// "Current:/Past:" entries are handled too. Tapering continuation lines carry no
// name and are dropped.
const drugNameOnly = (s: string): string => {
  if (/^(\d{2}\/\d{2}\/\d{4}|Current|Past)\(cont\):/.test(s)) return "";
  const body = s.replace(/^(\d{2}\/\d{2}\/\d{4}|Current|Past)(\(note\)|\(cont\))?:\s*/, "");
  return esc(body.split(" — ")[0].trim());
};

// One A4 sheet. `privacyCopy` produces the public-safe copy: masked identity,
// no clinical assessment, no personal advice — only the medicines + tests the
// patient needs to act on.
function buildSheet(d: PrescriptionDoc, privacyCopy: boolean): string {
  const p = d.patient;
  const ptName = privacyCopy ? maskName(p.name) : p.name;
  const ptPhone = privacyCopy ? maskMobile(p.phone) : p.phone;

  const clinicalBlocks = privacyCopy
    ? ""
    : d.clinical
        .filter((c) => c.items.length > 0)
        .map(
          (c) => `
        <div class="block">
          <div class="block-title">${esc(c.label)}</div>
          <ul>${(c.label === "Drug history"
            ? [...new Set(c.items.map(drugNameOnly).filter(Boolean))].map((n) => `<li>${n}</li>`)
            : c.items.map((it) => `<li>${cleanItem(it)}</li>`)).join("")}</ul>
        </div>`,
        )
        .join("");

  let rxNo = 0;
  const drugCellPx = drugCellWidthPx(d.page);
  const rxRows = d.rx
    .filter((r) => r.drug.trim() || r.dose.trim() || r.duration.trim() || r.instruction.trim())
    .map((r) => {
      // Free-typed instruction line — span the whole width, italic, no number.
      if (r.isNote) {
        return `
        <tr>
          <td class="rx-no"></td>
          <td class="rx-note" colspan="4">${esc(r.drug)}</td>
        </tr>`;
      }
      const isCont = !r.drug.trim();
      if (!isCont) rxNo += 1;
      const fit = drugTextFit(r.drug, drugCellPx);
      const drugStyle = isCont
        ? ""
        : ` style="font-size:${fit.px}px${fit.wrap ? "" : ";white-space:nowrap"}"`;
      return `
        <tr>
          <td class="rx-no">${isCont ? "" : rxNo + "."}</td>
          <td class="rx-drug"${drugStyle}>${isCont ? '<span style="color:#999;padding-left:14px">↳</span>' : esc(r.drug)}</td>
          <td class="rx-mid rx-dose">${esc(r.dose)}</td>
          <td class="rx-mid rx-food">${esc(r.instruction)}</td>
          <td class="rx-mid rx-dur">${esc(r.duration)}</td>
        </tr>`;
    })
    .join("");

  const listBlock = (title: string, items: string[]) =>
    items.length
      ? `<div class="block"><div class="block-title">${esc(title)}</div><ul>${items
          .map((it) => `<li>${esc(it)}</li>`)
          .join("")}</ul></div>`
      : "";

  // On the privacy copy we drop personal advice; advised tests stay (the patient
  // needs them to get investigations done).
  const adviceBlock = privacyCopy ? "" : listBlock("Advice", d.advice);

  // The sheet is a single-cell table so the brand bar can live in <tfoot>:
  // a tfoot repeats at the bottom of EVERY printed page and the browser reserves
  // its height in the flow, so it can never overprint a medicine row or the
  // signature. A `position: fixed` bar would sit lower but is free to overlay
  // content on a full page — not acceptable on a prescription.
  return `
  <div class="sheet">
    <table class="pagegrid"><tbody><tr><td class="pagebody">
    <div class="head">
      <div class="brand">
        <div><h1>Muqsit Health System</h1></div>
      </div>
    </div>

    <div class="pt">
      <div><span>Name:</span> <b>${esc(ptName || "—")}</b></div>
      <div><span>Date:</span> ${esc(p.date || "—")}</div>
      <div><span>Age / Sex:</span> ${esc(p.age || "—")} / ${esc(p.gender || "—")}</div>
      <div><span>Mobile:</span> ${esc(ptPhone || "—")}</div>
      <div><span>Weight:</span> ${esc(p.weight || "—")} kg</div>
      <div><span>Address:</span> ${esc(p.address || "—")}</div>
    </div>

    <div class="body">
      <div class="left">${privacyCopy ? "" : clinicalBlocks || '<div class="block"><div class="block-title">Clinical</div><ul><li>—</li></ul></div>'}</div>
      <div class="divider"></div>
      <div class="right">
        <div class="rx-symbol">℞</div>
        ${rxRows ? `<table>${rxRows}</table>` : '<p style="font-size:12.5px;color:#999">No medicines added.</p>'}
        ${adviceBlock}
        ${listBlock("Advised tests / investigation", d.adviceTest)}
        ${d.followUp ? `<div class="followup">Follow-up: <b>${esc(d.followUp)}</b></div>` : ""}
        <div class="sign"><span class="line">${esc(d.doctorName || "Signature")}</span></div>
      </div>
    </div>
    </td></tr></tbody>
    <tfoot><tr><td class="pagefoot">
      <div class="brandbar">
        <span class="bb-mhs">MHS</span>
        <span class="bb-by">By <img class="bb-exhort" src="exort-logo.png" alt="EXHORT" /></span>
      </div>
    </td></tr></tfoot></table>
  </div>`;
}

export function buildPrescriptionHtml(d: PrescriptionDoc): string {
  // Page 1 is always the full prescription (real name, full clinical). When the
  // OPD "extra page" option is on, append a masked privacy copy as page 2.
  const fullPage = buildSheet(d, false);
  const privacyPage = d.extraPrivacyPage ? buildSheet(d, true) : "";

  // Page size + margins from Prescription settings, applied to the sheet and the
  // printed @page. Falls back to A4 with sensible margins.
  const pg = d.page;
  const u = pg?.unit ?? "in";
  const pageW = `${pg?.width || "8.27"}${u}`;
  const pageH = `${pg?.height || "11.69"}${u}`;
  const padT = `${pg?.headerHeight || "0.5"}${u}`;
  const padR = `${pg?.marginRight || "0.4"}${u}`;
  const padB = `${pg?.footerHeight || "0.5"}${u}`;
  const padL = `${pg?.marginLeft || "0.4"}${u}`;

  // The document is written into an about:blank window / off-screen iframe, so a
  // relative image src has no reliable base to resolve against. Pin one.
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<base href="${origin}/" />
<title>Prescription — ${esc(d.patient.name || "Patient")}</title>
<style>
  * { box-sizing: border-box; }
  /* Reserve the pre-printed letterhead header/footer band as a PAGE margin, so
     it is kept clear on every physical page of a multi-page prescription — not
     just page 1 (a one-time .sheet padding would be overprinted on overflow
     pages). The on-screen preview keeps the padding for WYSIWYG. */
  @page { size: ${pageW} ${pageH}; margin: ${padT} ${padR} ${padB} ${padL}; }
  body { font-family: "DM Sans", Arial, sans-serif; color: #1a1a1a; margin: 0; background: #f0f0f0; }
  .sheet { background: #fff; width: ${pageW}; min-height: ${pageH}; margin: 16px auto; padding: ${padT} ${padR} ${padB} ${padL}; box-shadow: 0 2px 12px rgba(0,0,0,.15); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1d9e75; padding-bottom: 12px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .logo { width: 40px; height: 40px; border-radius: 9px; background: #1d9e75; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
  .brand h1 { font-size: 12px; margin: 0; color: #0f6e56; }
  .brand p { margin: 4px 0 0; font-size: 10px; color: #6b6b6b; }
  .byline { display: flex; align-items: center; gap: 6px; }
  .exort { height: 26px; width: auto; display: block; }
  .doctor { text-align: right; font-size: 12px; color: #333; }
  .doctor b { font-size: 14px; color: #0f6e56; }
  .pt { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 12.5px; margin: 14px 0 6px; }
  .pt span { color: #6b6b6b; }
  .body { display: grid; grid-template-columns: 0.8fr 0.5px 1.6fr; gap: 0; margin-top: 10px; }
  .left { padding-right: 16px; }
  .divider { background: #e5e5e3; }
  .right { padding-left: 18px; }
  .rx-symbol { font-size: 26px; font-style: italic; color: #1d9e75; font-weight: 600; margin-bottom: 6px; }
  .block { margin-bottom: 12px; }
  .block-title { font-size: 11px; font-weight: 700; color: #0f6e56; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 3px; }
  ul { margin: 0; padding-left: 16px; }
  li { font-size: 12.5px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td { padding: 7px 6px; border-bottom: 0.5px solid #eee; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
  .rx-no { width: 22px; color: #999; font-size: 12px; }
  /* The drug column takes the lion's share: form + name + strength is one
     phrase and must print as one line (see drugTextFit). The other three carry
     short values ("1+0+1", "After food", "7 days") and wrap harmlessly. Keep
     these four adding up to 100% — table-layout is fixed. */
  .rx-drug { width: 44%; font-weight: 600; font-size: 13px; }
  .rx-mid { font-size: 12.5px; color: #333; white-space: normal; }
  .rx-dose { width: 21%; }
  .rx-food { width: 16%; }
  .rx-dur { width: 19%; }
  .rx-note { font-size: 12.5px; color: #444; font-style: italic; }
  .followup { margin-top: 18px; font-size: 12.5px; }
  .followup b { color: #0f6e56; }
  .sign { margin-top: 56px; text-align: right; font-size: 12px; color: #333; }
  .sign .line { display: inline-block; border-top: 1px solid #333; padding-top: 4px; min-width: 200px; }
  /* Sheet-as-table so the brand bar can live in <tfoot>. Scoped resets: the
     global table/td rules above belong to the Rx table and must not leak in
     (the child combinators keep them off the nested Rx table too). */
  .pagegrid { width: 100%; border-collapse: collapse; table-layout: auto; }
  .pagegrid > tbody > tr > td.pagebody { padding: 0; border: none; vertical-align: top; }
  .pagegrid > tfoot > tr > td.pagefoot { padding: 0; border: none; vertical-align: bottom; }
  .brandbar { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; border-top: 0.5px solid #e5e5e3; margin-top: 14px; padding-top: 7px; }
  .bb-mhs { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 30px; border-radius: 7px; background: #1d9e75; color: #fff; font-size: 13px; font-weight: 700; letter-spacing: .04em; }
  .bb-by { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #6b6b6b; }
  .bb-exhort { height: 19px; width: auto; display: block; }
  .toolbar { position: sticky; top: 0; background: #1d9e75; padding: 10px; text-align: center; z-index: 10; }
  .toolbar button { background: #fff; color: #0f6e56; border: none; padding: 8px 22px; border-radius: 7px; font-size: 13px; font-weight: 600; cursor: pointer; margin: 0 4px; }
  /* Each sheet starts on its own printed page. */
  .sheet + .sheet { page-break-before: always; }
  /* In print the header/footer band is reserved by the @page margin, so the
     sheet fills the margined content box with no padding of its own (padding
     would double-reserve and clip content on overflow pages). */
  /* On screen a sheet is a full page tall, so stretch the table and let the
     tfoot fall to the bottom of it — that is the bar the doctor sees in Preview.
     Screen only: making .sheet a flex container in print risks breaking how the
     table fragments across pages, and in print the tfoot repeats per fragment
     anyway (page bottom on a full page, under the content on a short one). */
  @media screen { .sheet { display: flex; flex-direction: column; } .pagegrid { flex: 1 1 auto; height: 100%; } }
  @media print { .toolbar { display: none; } body { background: #fff; } .sheet { box-shadow: none; margin: 0; width: auto; min-height: 0; padding: 0; } }
</style></head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button onclick="window.close()">Close</button>
  </div>
  ${fullPage}
  ${privacyPage}
</body></html>`;
}
