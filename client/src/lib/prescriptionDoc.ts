// Builds a clean, printable A4 prescription as an HTML string. Opened in a new
// window so the doctor can review and "Save as PDF" / print from the browser.

import { maskMobile, maskName } from "./rxPrivacy";
import { splitDrugLabel } from "./rxShorthand";

export interface RxLine {
  drug: string;
  dose: string;
  duration: string;
  instruction: string;
  // A free-typed instruction line — printed across the full width, no number.
  isNote?: boolean;
}

// ⚕️ NO prescribing warning is printed. The "MHS is suggesting" advice is a
// live aid to the doctor while they write, and the physician's decision
// (2026-08-17) is that it must not survive onto the document: the printed
// prescription and the saved copy show exactly what the doctor entered and
// nothing the system inferred. A red callout under the medicine WAS printed
// earlier the same day; `prescriptionDoc.test.ts` pins its absence so it cannot
// come back as a tidy-up. Restoring it is a product decision.

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

// ── Rx table: every cell on ONE line, one type size for the whole sheet ──────
// A doctor reads "Tablet. Barcavir 0.5 mg" as a single phrase and a dispenser
// reads the printed sheet the same way; broken across three lines it reads as
// three separate things, which on a legal medical document is a misread risk,
// not a cosmetic one. The same is true of a dose like "2-4tsf at night if
// constipation".
//
// So the columns are not fixed percentages. Each one is measured against the
// widest thing it actually has to carry and given exactly that share of the
// row, which is what stops an empty "food" column from holding width the dose
// column needs. When the four together do not fit, the dose / food / duration
// columns are capped at an equal share of the row (never below their own
// longest word) and every remaining pixel goes to the drug names — see
// `fitColumns`.
//
// THE SHEET IS SIZED TO FILL THE PAGE (physician's decision, 2026-08-28,
// superseding the fixed-14px rule of 2026-08-26). A prescription with six
// medicines printed at 14px on A4 left two thirds of the page blank and came
// back "so small it is not readable". So 14px is now the FLOOR, not the size:
// the whole sheet is scaled up by one factor `--k` until it fills the printable
// page, and `--k` is chosen inside the document itself, where the browser can
// measure what it actually rendered rather than a builder guessing at it.
//
// Two things bound `--k`, and both are hard bounds:
//   · the page height — the sheet must never spill onto a second page it did
//     not need, and
//   · this table's own width — every ℞ cell stays on ONE line, so `--k` can
//     never exceed the room the widest line has left over (`maxScale` below).
//
// A row that cannot be held to one line even at the base size is set SMALLER,
// on its own (`rowPx`), rather than wrapping or dragging the whole sheet down
// with it — again the physician's decision, 2026-08-28. There is a floor
// (`ROW_MIN_PX`); under it the row wraps, because unreadable type is worse than
// a second line. Nothing is ever truncated or allowed past the printable width.
const RX_COL_SHARE = 1.7 / 2.4;   // .body grid is 0.7fr / 0.5px / 1.7fr
const RIGHT_PAD_PX = 18;          // .right padding-left
// .rx-no fixed width. Wide enough for a TWO-digit serial: a 10-medicine
// prescription is ordinary, and "10." measures 19.5px in 14px DM Sans
// (Chrome, 2026-08-23) against a content box of RX_NO_PX - CELL_PAD_PX.
// Too narrow and the number breaks onto its own second line beside the
// medicine it belongs to.
const RX_NO_PX = 32;
export const CELL_PAD_PX = 8;     // td padding, both sides
const DRUG_PX = 14;
const MID_PX = 14;
// How far the whole sheet may be scaled up to fill the page. 14 -> 22.4px is
// already large print; past that a three-line prescription starts to read as a
// poster rather than a medical document.
export const MAX_SCALE = 1.6;
// The smallest a single over-long row may be set to keep its one line. Below
// this it wraps instead — a dispenser reading 9px type at arm's length is the
// failure this whole table exists to avoid.
export const ROW_MIN_PX = 11;
// Leave a sliver for the printer's own rounding and font hinting.
const FIT_SAFETY = 0.98;
// Fallback only, for when canvas text metrics are unavailable: mean advance per
// character of DM Sans / Arial, in em. Deliberately generous — overestimating
// costs a slightly smaller sheet, underestimating costs an overflow off the
// edge of the page.
const EM_PER_CHAR = 0.58;

// Real text metrics beat counting characters: "Tablet. Illlll 1 mg" and
// "Tablet. Wmmmmm 1 mg" are the same length and nowhere near the same width, and
// guessing wide shrinks a name that would have fitted. The sheet is built in the
// doctor's browser, so a canvas is there to ask. Cached — this runs per line on
// every rebuild of the preview.
let measureCtx: CanvasRenderingContext2D | null | undefined;
export function measureRxText(text: string, px: number, bold: boolean): number | null {
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
  measureCtx.font = `${bold ? 600 : 400} ${px}px "DM Sans", Arial, sans-serif`;
  const w = measureCtx.measureText(text).width;
  return Number.isFinite(w) && w > 0 ? w : null;
}

/** Width available to the Rx data columns (everything right of the number). */
export function rxTableInnerPx(page?: PrescriptionDoc["page"]): number {
  const perUnit = (page?.unit ?? "in") === "cm" ? 37.8 : 96;
  const num = (v: string | undefined, fallback: number) => {
    const n = parseFloat(v ?? "");
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const content = (num(page?.width, 8.27) - num(page?.marginLeft, 0.4) - num(page?.marginRight, 0.4)) * perUnit;
  return Math.max(160, content * RX_COL_SHARE - RIGHT_PAD_PX - RX_NO_PX);
}

/**
 * Height of the printable area, in CSS px — the page minus the letterhead
 * bands reserved top and bottom. The fitting script grows the sheet up to this
 * and not a pixel further: a prescription that spills onto a second page it did
 * not need is worse than one with white space at the foot.
 */
export function sheetContentPx(page?: PrescriptionDoc["page"]): number {
  const perUnit = (page?.unit ?? "in") === "cm" ? 37.8 : 96;
  const num = (v: string | undefined, fallback: number) => {
    const n = parseFloat(v ?? "");
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const h = num(page?.height, 11.69) - num(page?.headerHeight, 0.5) - num(page?.footerHeight, 0.5);
  return Math.round(Math.max(200, h * perUnit));
}

export interface RxColumnLayout {
  /** Column widths in px, in render order: drug, dose, [food], duration. */
  cols: number[];
  /** False when no line carries a food/instruction value — that column is dropped. */
  hasFood: boolean;
  /** One drug size for the whole sheet. */
  drugPx: number;
  /** One size for dose / food / duration. */
  midPx: number;
  /** True when any row still has to wrap — it could not be held to one line even at ROW_MIN_PX. */
  wrap: boolean;
  /** Per non-note row, in order: the size that row prints at (<= drugPx). */
  rowPx: number[];
  /** Per non-note row: that row may take a second line (only when shrinking was not enough). */
  rowWrap: boolean[];
  /**
   * The most the sheet may be scaled up before this table's widest line stops
   * fitting on one row. 1 when there is no room to grow. The fitting script in
   * the document never goes past it.
   */
  maxScale: number;
}

/**
 * Give each column what it needs, and hand every spare pixel to `priority`
 * (the drug names).
 *
 * When it all fits, every column is stretched by the same factor — a ragged
 * right edge on a prescription reads as an unfinished sheet.
 *
 * When it does not fit, the old rule here was max-min fair on the NATURAL
 * widths, and that is what printed the reported sheet with seven of its eight
 * medicine names broken (2026-08-26). Max-min fair reads a column's longest
 * value as a requirement, but a column that is going to wrap anyway cannot USE
 * the width it is handed: one free-typed dose ("2-4TSF at night if
 * constipation", 197px) made the dose column look as needy as the drug column,
 * so the two split the remainder evenly at 117px each — the dose still wrapped
 * at 117px, and the drug column, where all eight rows needed 134-266px, was
 * starved for nothing.
 *
 * So the shortfall is taken by need, not by rank:
 *   - Every column keeps its whole value on one line if that fits inside an
 *     equal share of the row. That is what protects `1+0+1`, `Before meal` and
 *     `Continue` absolutely — the cells a dispenser cannot afford to misread.
 *   - A column asking for more than an equal share is capped there, but never
 *     below its own longest WORD, so a value is never chopped mid-word.
 *   - Everything left over goes to the drug names, the one column where a
 *     second line reads as two medicines rather than one value on two lines.
 */
function fitColumns(nat: number[], floor: number[], avail: number, priority: number): number[] {
  const sum = nat.reduce((a, b) => a + b, 0);
  // Whole pixels: a column asked for 71.2px and given 71 wraps its widest line
  // for want of a fifth of a pixel, which is not a trade anyone would make.
  const want = nat.map((w) => Math.ceil(w));
  let out: number[];

  if (sum <= avail) {
    out = nat.map((w, i) => Math.max(want[i], Math.floor((w / sum) * avail)));
  } else {
    const fair = avail / nat.length;
    out = nat.map((w, i) =>
      i === priority ? 0 : Math.max(1, Math.min(want[i], Math.ceil(Math.max(floor[i], fair)))),
    );
    const rest = avail - out.reduce((a, b) => a + b, 0);
    out[priority] = Math.max(1, Math.min(want[priority], Math.floor(rest)));

    // The drug column can need less than the row had spare (a sheet of short
    // names beside one very long dose). Hand what is left back to whichever
    // columns are still short of their own value, rather than printing a
    // ragged right edge.
    let spare = Math.floor(avail) - out.reduce((a, b) => a + b, 0);
    while (spare > 0) {
      const short = out.map((_, i) => i).filter((i) => out[i] < want[i]);
      if (!short.length) break;
      const each = Math.max(1, Math.floor(spare / short.length));
      let moved = false;
      for (const i of short) {
        const add = Math.min(each, want[i] - out[i], spare);
        if (add > 0) {
          out[i] += add;
          spare -= add;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  // Rounding up to whole pixels can push the row a hair past the width it has.
  // The widest column pays it back — it is the one already carrying the wrap.
  const over = out.reduce((a, b) => a + b, 0) - Math.floor(avail);
  if (over > 0) {
    const i = out.indexOf(Math.max(...out));
    out[i] = Math.max(1, out[i] - over);
  }
  return out;
}

/**
 * Share the Rx row out by what each column actually has to carry.
 * `measure` is injectable so this stays testable without a DOM.
 */
export function layoutRxColumns(
  rows: RxLine[],
  innerPx: number,
  measure: (text: string, px: number, bold: boolean) => number | null = measureRxText,
): RxColumnLayout {
  const lines = rows.filter((r) => !r.isNote);
  const hasFood = lines.some((r) => r.instruction.trim());
  const nCols = hasFood ? 4 : 3;
  const avail = Math.max(60, innerPx - CELL_PAD_PX * nCols) * FIT_SAFETY;

  const width = (text: string, base: number, bold: boolean) => {
    const t = text.trim();
    if (!t) return 0;
    return measure(t, base, bold) ?? t.length * base * EM_PER_CHAR;
  };
  const widest = (pick: (r: RxLine) => string, base: number, bold: boolean) =>
    lines.reduce((mx, r) => Math.max(mx, width(pick(r), base, bold)), 0);
  // The narrowest a column can be set and still break only between words.
  // `td` carries `word-break: break-word`, so a narrower column does not spill
  // off the page — it splits a word in two, and "consti / pation" on a dose
  // line is not something a prescription should ever print.
  const widestWord = (pick: (r: RxLine) => string, base: number, bold: boolean) =>
    lines.reduce(
      (mx, r) => pick(r).trim().split(/\s+/).reduce((m, w) => Math.max(m, width(w, base, bold)), mx),
      0,
    );

  // What the widest line in each column actually needs, at the base size.
  const raw = [
    widest((r) => r.drug, DRUG_PX, true),
    widest((r) => r.dose, MID_PX, false),
    ...(hasFood ? [widest((r) => r.instruction, MID_PX, false)] : []),
    widest((r) => r.duration, MID_PX, false),
  ];
  const words = [
    widestWord((r) => r.drug, DRUG_PX, true),
    widestWord((r) => r.dose, MID_PX, false),
    ...(hasFood ? [widestWord((r) => r.instruction, MID_PX, false)] : []),
    widestWord((r) => r.duration, MID_PX, false),
  ];
  // A column with no content still needs a sliver, or the header row collapses
  // and the remaining columns jump around between prescriptions.
  const MIN = 24;
  const nat = raw.map((w) => Math.max(MIN, w));

  // Widths are whole px and never total more than the row. The drug column
  // (index 0) takes whatever the other columns genuinely cannot use — see
  // `fitColumns` for why an equal share, not the longest value, is what a
  // wrapping column is capped at.
  const inner = fitColumns(nat, words, avail, 0);

  // How much bigger the whole sheet could be set before the widest line in any
  // column stops fitting the width it was given. This is the width half of the
  // page-fill bound; the height half is measured in the document.
  const headroom = raw.map((w, i) => (w > 0 ? inner[i] / w : Infinity));
  const maxScale = Math.max(1, Math.min(MAX_SCALE, ...headroom));

  // A row that does not fit its columns at the base size is set smaller — just
  // that row. It is measured against every column it fills, and the tightest
  // one decides.
  const rowPx: number[] = [];
  const rowWrap: boolean[] = [];
  for (const r of lines) {
    const need = [
      width(r.drug, DRUG_PX, true) / inner[0],
      width(r.dose, MID_PX, false) / inner[1],
      ...(hasFood ? [width(r.instruction, MID_PX, false) / inner[2]] : []),
      width(r.duration, MID_PX, false) / inner[hasFood ? 3 : 2],
    ].filter((n) => Number.isFinite(n) && n > 0);
    const tightest = need.length ? Math.max(...need) : 0;
    if (tightest <= 1) {
      rowPx.push(DRUG_PX);
      rowWrap.push(false);
      continue;
    }
    // Rounded DOWN: a size rounded up is a size that does not fit.
    const fits = Math.floor(DRUG_PX / tightest);
    rowPx.push(Math.max(ROW_MIN_PX, fits));
    rowWrap.push(fits < ROW_MIN_PX);
  }

  return {
    cols: inner.map((w) => w + CELL_PAD_PX),
    hasFood,
    drugPx: DRUG_PX,
    midPx: MID_PX,
    wrap: rowWrap.some(Boolean),
    rowPx,
    rowWrap,
    maxScale,
  };
}

// Only the brand NAME is set in bold on the printed sheet (physician's
// decision, 2026-08-23): in `Tablet. Napa 500 mg` the reader's eye should land
// on `Napa`, not on the dosage form or the strength. `splitDrugLabel` returns
// index ranges of the label, so the three escaped pieces reassemble into
// exactly the text the doctor entered. A label whose name cannot be read
// (a bare dosage form, say) keeps the whole line bold — a medicine with no
// emphasis at all would be worse than one with too much.
const drugCell = (label: string): string => {
  const { before, name, after } = splitDrugLabel(label);
  return name ? `${esc(before)}<b>${esc(name)}</b>${esc(after)}` : `<b>${esc(label)}</b>`;
};

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

/**
 * A length that scales with the sheet's page-fill factor. Every font size, cell
 * padding and column width on the sheet is written this way, so ONE number set
 * by the fitting script grows the whole document evenly — and a column can
 * never be outgrown by the text inside it, because both scale together.
 */
export const SCALE_PX = (n: number) => `calc(var(--k, 1) * ${n}px)`;

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
  const rxLines = d.rx.filter((r) => r.drug.trim() || r.dose.trim() || r.duration.trim() || r.instruction.trim());
  const lay = layoutRxColumns(rxLines, rxTableInnerPx(d.page));
  const noteSpan = lay.hasFood ? 4 : 3;
  // Widths scale with the sheet's fit factor exactly as the text does, so a
  // column can never be outgrown by what it carries.
  const rxCols = `<colgroup><col style="width:${SCALE_PX(RX_NO_PX)}" />${lay.cols
    .map((w) => `<col style="width:${SCALE_PX(w)}" />`)
    .join("")}</colgroup>`;
  // The per-row size is a RATIO of the base, not a fixed px, so it still grows
  // when the sheet is scaled to fill the page.
  let rxRowNo = -1;
  const rxRows = rxLines
    .map((r) => {
      // Free-typed instruction line — span the whole width, italic, no number.
      // A note is not a medicine row and is not in `lay.rowPx` — it must not
      // advance the counter, or every row after it reads the wrong size.
      if (r.isNote) {
        return `
        <tr>
          <td class="rx-no"></td>
          <td class="rx-note" colspan="${noteSpan}">${esc(r.drug)}</td>
        </tr>`;
      }
      const isCont = !r.drug.trim();
      if (!isCont) rxNo += 1;
      rxRowNo += 1;
      // This row's own size: the base, unless the row had to be set smaller to
      // stay on one line. Only such a row is allowed to wrap, and only once
      // shrinking it to ROW_MIN_PX was still not enough.
      const size = lay.rowPx[rxRowNo] ?? lay.drugPx;
      const nowrap = lay.rowWrap[rxRowNo] ? "" : "white-space:nowrap;";
      const mid = ` style="font-size:${SCALE_PX(size)};${nowrap}"`;
      return `
        <tr>
          <td class="rx-no">${isCont ? "" : rxNo + "."}</td>
          <td class="rx-drug" style="font-size:${SCALE_PX(size)};${nowrap}">${isCont ? '<span style="color:#999;padding-left:14px">↳</span>' : drugCell(r.drug)}</td>
          <td class="rx-mid"${mid}>${esc(r.dose)}</td>
          ${lay.hasFood ? `<td class="rx-mid"${mid}>${esc(r.instruction)}</td>` : ""}
          <td class="rx-mid"${mid}>${esc(r.duration)}</td>
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
  <div class="sheet" data-avail-h="${sheetContentPx(d.page)}" data-kmax="${lay.maxScale.toFixed(3)}">
    <table class="pagegrid"><tbody><tr><td class="pagebody"><div class="pagecontent">
    <!-- No printed brand name here (2026-08-16). The top band is reserved for
         the practice's own pre-printed letterhead (headerHeight in Prescription
         settings), and a second name printed under it competed with it. What
         stays is the rule that separates the letterhead from the patient
         details. The footer brand bar is unaffected. -->
    <div class="head"></div>

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
        ${rxRows ? `<table>${rxCols}${rxRows}</table>` : `<p style="font-size:${SCALE_PX(14)};color:#999">No medicines added.</p>`}
        ${adviceBlock}
        ${listBlock("Advised tests / investigation", d.adviceTest)}
        ${d.followUp ? `<div class="followup">Follow-up: <b>${esc(d.followUp)}</b></div>` : ""}
        <div class="sign"><span class="line">${esc(d.doctorName || "Signature")}</span></div>
      </div>
    </div>
    </div></td></tr></tbody>
    <tfoot><tr><td class="pagefoot">
      <div class="brandbar">
        <span class="bb-mhs">MHS</span>
        <span class="bb-by">By <img class="bb-exhort" src="exort-logo.png" alt="EXHORT" /></span>
      </div>
    </td></tr></tfoot></table>
  </div>`;
}

// ⚕️ Page fill, decided inside the document.
//
// A builder cannot know how tall a sheet came out — how many lines a diagnosis
// wrapped to, how tall the fonts that actually loaded are — so the sheet is
// written at its floor size and this script, running in the print document
// itself, finds the largest scale at which it still fits ONE page. Every length
// on the sheet is `calc(var(--k) * Npx)`, so setting `--k` grows the type, the
// cell padding and the column widths together.
//
// Three rules it must not break, in this order:
//   1. never shrink — `--k` starts at 1, which is the sheet exactly as it
//      printed before this existed;
//   2. never spill onto a page the prescription did not need;
//   3. never let an ℞ cell run past its own column — checked by measuring the
//      table, so it holds even if the printer resolves a different font from
//      the one the widths were measured against.
// If anything here throws, `--k` stays unset and the sheet prints at its floor.
const FIT_SCRIPT = `(function(){
  function fits(sheet, availH){
    var c = sheet.querySelector('.pagecontent');
    var f = sheet.querySelector('.pagefoot');
    if (!c) return false;
    var h = c.getBoundingClientRect().height + (f ? f.getBoundingClientRect().height : 0);
    if (h > availH) return false;
    var tables = sheet.querySelectorAll('.pagecontent table');
    for (var i = 0; i < tables.length; i++) {
      if (tables[i].scrollWidth > tables[i].clientWidth + 1) return false;
    }
    return true;
  }
  function fit(sheet){
    var availH = parseFloat(sheet.getAttribute('data-avail-h'));
    var kMax = parseFloat(sheet.getAttribute('data-kmax'));
    if (!(availH > 0) || !(kMax > 1)) return;
    sheet.style.setProperty('--k', '1');
    if (!fits(sheet, availH)) return;
    var lo = 1, hi = kMax;
    for (var i = 0; i < 9; i++) {
      var mid = (lo + hi) / 2;
      sheet.style.setProperty('--k', String(mid));
      if (fits(sheet, availH)) lo = mid; else hi = mid;
    }
    sheet.style.setProperty('--k', String(lo));
  }
  function run(){
    try {
      var sheets = document.querySelectorAll('.sheet');
      for (var i = 0; i < sheets.length; i++) fit(sheets[i]);
    } catch (e) { /* the sheet prints at its floor size */ }
  }
  run();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  window.addEventListener('load', run);
  window.addEventListener('beforeprint', run);
})();`;

// The sheet carries NO toolbar of its own. It is displayed inside the app's own
// print modal (`PrintSheetModal`), which owns the Print / Close buttons — the
// document is the medical page and nothing else, which is also what the gallery
// snapshot captures and what the printer receives.
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
  /* Empty by design — the rule under the (pre-printed) letterhead band. The
     brand/logo/doctor rules that used to fill it went with the printed name. */
  .head { border-bottom: 2px solid #1d9e75; }
  .pt { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: ${SCALE_PX(14)}; margin: 14px 0 6px; }
  .pt span { color: #6b6b6b; }
  .body { display: grid; grid-template-columns: 0.7fr 0.5px 1.7fr; gap: 0; margin-top: 10px; }
  .left { padding-right: 16px; }
  .divider { background: #e5e5e3; }
  .right { padding-left: 18px; }
  .rx-symbol { font-size: ${SCALE_PX(26)}; font-style: italic; color: #1d9e75; font-weight: 600; margin-bottom: 6px; }
  .block { margin-bottom: 12px; }
  .block-title { font-size: ${SCALE_PX(11)}; font-weight: 700; color: #0f6e56; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 3px; }
  ul { margin: 0; padding-left: 16px; }
  li { font-size: ${SCALE_PX(14)}; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td { padding: ${SCALE_PX(7)} ${SCALE_PX(4)}; border-bottom: 0.5px solid #eee; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
  .rx-no { width: ${SCALE_PX(RX_NO_PX)}; color: #999; font-size: ${SCALE_PX(14)}; }
  /* Column widths and the two font sizes are computed per sheet and emitted as
     a <colgroup> plus inline styles (see layoutRxColumns) — measured against
     what each column actually carries, so an empty "food" column holds no width
     the dose column needs. Do not put percentage widths back here. */
  /* The cell is regular; only the brand name inside it is bold. Note that
     layoutRxColumns still MEASURES the whole label as bold — an
     over-estimate by a couple of percent, which can only ever hand the
     column more room than it needs. Measuring the parts separately
     would print a shade larger and is not worth risking the one
     guarantee this table has: no cell past its own column. */
  .rx-drug { font-weight: 400; }
  .rx-drug b { font-weight: 600; }
  .rx-mid { color: #333; }
  .rx-note { font-size: ${SCALE_PX(14)}; color: #444; font-style: italic; }
  .followup { margin-top: 18px; font-size: ${SCALE_PX(14)}; }
  .followup b { color: #0f6e56; }
  .sign { margin-top: 56px; text-align: right; font-size: ${SCALE_PX(14)}; color: #333; }
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
  @media print { body { background: #fff; } .sheet { box-shadow: none; margin: 0; width: auto; min-height: 0; padding: 0; } }
</style></head>
<body>
  ${fullPage}
  ${privacyPage}
<script>${FIT_SCRIPT}</script>
</body></html>`;
}
