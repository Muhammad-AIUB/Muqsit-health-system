import { describe, expect, it } from "vitest";
import {
  buildPrescriptionHtml,
  CELL_PAD_PX,
  DRUG_PX,
  layoutRxColumns,
  MAX_SCALE,
  MID_PX,
  ROW_MIN_PX,
  rxTableInnerPx,
  sheetContentPx,
  type PrescriptionDoc,
  type RxLine,
} from "./prescriptionDoc";

// ⚕️ The printed sheet is the legal record. These pin the rules a dispenser
// depends on: the whole sheet prints at ONE type size — 14px, the FLOOR since
// 2026-08-26, never scaled down to squeeze a long line onto one line — and
// where the row has the width, every cell still prints on ONE line. A medicine
// set smaller than its neighbour reads as emphasis nobody intended, and a
// medicine set smaller than 14px is simply harder to read at arm's length.
// Cross-checked against a real browser on 2026-08-16: an A4 sheet
// left 438px for the Rx data columns; 428px once RX_NO_PX widened to 32 so a
// two-digit serial fits beside its medicine at 14px (2026-08-23); 458px since
// the .body grid gave the Rx side 1.7fr of 2.4 and the cell padding came down
// to 8px, to stop the medicine names wrapping (physician's report, 2026-08-26).

// Stand-in for canvas metrics (vitest has no DOM). Linear in font size, like
// real text, near the ~0.47em/char DM Sans actually measures; bold a shade wider.
const fakeMeasure = (t: string, px: number, bold: boolean) => t.length * px * (bold ? 0.5 : 0.47);

const A4_INNER = 458;
const line = (drug: string, dose = "1+0+0", duration = "5 days", instruction = ""): RxLine =>
  ({ drug, dose, duration, instruction });

const REPORTED = [
  line("Tablet. Barcavir 0.5 mg", "1+0+0", "Continue"),
  line("Tablet. Napa 500 mg", "1+1+1", "5 days"),
  line("Oral Solution. Avolac 3.35 gm/5 ml", "2-4tsf at night if constipation", ""),
  line("Tablet. Bicozin N/A", "1+0+0", "Continue"),
  line("Capsule. Denvar 400 mg", "1+0+1", "7 days"),
];

describe("rxTableInnerPx", () => {
  it("matches the browser-measured A4 width", () => {
    expect(Math.round(rxTableInnerPx(undefined))).toBe(A4_INNER);
  });

  it("tracks a narrower page and wider margins", () => {
    const narrow = rxTableInnerPx({
      unit: "in", width: "6", height: "9",
      marginLeft: "0.75", marginRight: "0.75", headerHeight: "0.5", footerHeight: "0.5",
    });
    expect(narrow).toBeLessThan(A4_INNER);
    expect(narrow).toBeGreaterThan(160);
  });

  it("handles cm, and never returns an unusable width for junk settings", () => {
    expect(rxTableInnerPx({
      unit: "cm", width: "21", height: "29.7",
      marginLeft: "1", marginRight: "1", headerHeight: "1", footerHeight: "1",
    })).toBeGreaterThan(300);
    expect(rxTableInnerPx({
      unit: "in", width: "", height: "", marginLeft: "-3", marginRight: "abc",
      headerHeight: "", footerHeight: "",
    })).toBeGreaterThanOrEqual(160);
  });
});

describe("layoutRxColumns", () => {
  it("drops the food column when no line carries one, and keeps it when one does", () => {
    // Two columns without food, three with — the dose has no column of its own
    // since 2026-09-12; it prints under the medicine name.
    expect(layoutRxColumns(REPORTED, A4_INNER, fakeMeasure)).toMatchObject({ hasFood: false });
    expect(layoutRxColumns(REPORTED, A4_INNER, fakeMeasure).cols).toHaveLength(2);

    const withFood = layoutRxColumns(
      [...REPORTED, line("Tablet. Napa 500 mg", "1+1+1", "5 days", "After food")],
      A4_INNER, fakeMeasure,
    );
    expect(withFood.hasFood).toBe(true);
    expect(withFood.cols).toHaveLength(3);
  });

  it("gives the reported prescription one size for every medicine, and it is 14px", () => {
    const lay = layoutRxColumns(REPORTED, A4_INNER, fakeMeasure);
    // Uniform by construction: one drugPx for the sheet, not one per row.
    expect(lay.drugPx).toBe(DRUG_PX);
    expect(lay.midPx).toBe(MID_PX);
  });

  // ⚕️ The dose prints UNDER the medicine name, in the same cell (physician's
  // decision, 2026-09-12). So the drug column must hold whichever of the two is
  // WIDER — and they are separate lines, so it is a max, never a sum.
  it("sizes the drug column for the dose when the dose is the wider of the two", () => {
    const longDose = "2-4tsf at night if constipation";
    const lay = layoutRxColumns([line("Tab. A", longDose, "Continue")], A4_INNER, fakeMeasure);
    expect(lay.cols).toHaveLength(2);
    // The name is six characters; the column is still sized for the dose beneath.
    expect(fakeMeasure(longDose, 14, false)).toBeLessThanOrEqual(lay.cols[0] - CELL_PAD_PX);
  });

  // A tapering (`>>>`) row has no name for its dose to sit under, so the dose
  // prints beside the ↳ — and that row has to be measured with the indent.
  it("measures a tapering row's dose beside the ↳, not under a name", () => {
    const cont: RxLine = { drug: "", dose: "0+0+2", duration: "Continue", instruction: "" };
    const lay = layoutRxColumns([line("Capsule. Lenva 4 mg", "0+0+1", "7 days"), cont], A4_INNER, fakeMeasure);
    expect(fakeMeasure("0+0+2", 14, false) + 24).toBeLessThanOrEqual(lay.cols[0] - CELL_PAD_PX);
    expect(lay.rowWrap).toEqual([false, false]);
  });

  it("never sets type larger than the base size when there is room to spare", () => {
    const lay = layoutRxColumns([line("Tab. A", "1", "1d")], A4_INNER, fakeMeasure);
    expect(lay.drugPx).toBe(DRUG_PX);
    expect(lay.midPx).toBe(MID_PX);
    // Widths still fill the row rather than leaving a ragged right edge.
    expect(lay.cols.reduce((a, b) => a + b, 0)).toBeGreaterThan(A4_INNER * 0.9);
  });

  // ⚕️ The over-full row SHRINKS, on its own, rather than wrapping
  // (physician's decision 2026-08-28, superseding the wrap rule of 2026-08-26).
  // The sheet's base stays 14px — one long medicine must not drag the rest of
  // the prescription down with it.
  it("sets an over-full row smaller instead of wrapping it", () => {
    const lay = layoutRxColumns(
      [line("Tablet (Delayed Release). Mesacol Extended Release 400 mg XR forte", "2+2+2", "7 week")],
      A4_INNER, fakeMeasure,
    );
    expect(lay.drugPx).toBe(DRUG_PX);
    expect(lay.midPx).toBe(MID_PX);
    expect(lay.rowPx[0]).toBeLessThan(DRUG_PX);
    expect(lay.rowPx[0]).toBeGreaterThanOrEqual(ROW_MIN_PX);
    expect(lay.rowWrap[0]).toBe(false);
    expect(lay.wrap).toBe(false);
  });

  // The floor holds: under it the row takes a second line rather than print
  // type a dispenser cannot read at arm's length.
  it("wraps rather than going under the floor", () => {
    const lay = layoutRxColumns(
      [line("Tablet. " + "Verylongmedicinename".repeat(6) + " 500 mg", "1+0+1", "Continue")],
      A4_INNER, fakeMeasure,
    );
    expect(lay.rowPx[0]).toBe(ROW_MIN_PX);
    expect(lay.rowWrap[0]).toBe(true);
    expect(lay.wrap).toBe(true);
  });

  // A row that fits is left alone, at the sheet's own size.
  it("leaves a row that fits at the base size", () => {
    const lay = layoutRxColumns([line("Tablet. Napa 500 mg", "1+1+1", "5 days")], A4_INNER, fakeMeasure);
    expect(lay.rowPx).toEqual([DRUG_PX]);
    expect(lay.rowWrap).toEqual([false]);
  });

  // ⚕️ The width half of the page-fill bound. A sheet with room to spare may
  // grow; one whose widest line already fills its column may not, or the line
  // it was measured for would stop fitting.
  it("reports how far the sheet may grow, and never past the cap", () => {
    const roomy = layoutRxColumns([line("Tab. A", "1", "2d")], A4_INNER, fakeMeasure);
    expect(roomy.maxScale).toBe(MAX_SCALE);
    // A row that already fills the width it has may not be grown at all. It
    // takes a longer line to reach that than it did before 2026-09-12 — the
    // dose gave its column to the drug names, so there is genuinely more room.
    const full = layoutRxColumns(
      [line("Suspension. Amoxicillin + Clavulanic acid 457 mg/5 ml",
        "2-4 teaspoonful at night only if constipation persists", "Continue until reviewed")],
      A4_INNER, fakeMeasure,
    );
    expect(full.maxScale).toBe(1);
  });

  // ⚕️ The width the dose column used to hold went to the medicine names, and
  // this is the pair that proves it: both of these labels had to be SHRUNK to
  // stay on one line while the dose sat in a column of its own. At the same
  // sheet width they now print at the full 14px.
  it("spends the old dose column's width on the medicine names", () => {
    const rows = [
      line("Capsule (Enteric Coated). Esoral 20 mg", "1+0+1", "1 month", "Before meal"),
      line("Tablet (Delayed Release). Mesacol 400 mg", "2+2+2", "7 week", ""),
    ];
    const lay = layoutRxColumns(rows, A4_INNER, fakeMeasure);
    const room = (col: number) => lay.cols[col] - CELL_PAD_PX;
    expect(Math.max(...rows.map((r) => fakeMeasure(r.drug, 14, true)))).toBeLessThanOrEqual(room(0));
    expect(lay.rowPx).toEqual([DRUG_PX, DRUG_PX]);
    expect(lay.rowWrap).toEqual([false, false]);
  });

  // ⚕️ `1+0+1` broken over two lines is a dose a dispenser can misread, and the
  // dose no longer has a column of its own to protect it. It rides in the drug
  // column — the widest one on the sheet — so it still cannot break, even on a
  // row whose medicine name had to give width up.
  it("starves the drug column, never the food or duration, when the row is over-full", () => {
    const rows = [
      line("Suspension. Amoxicillin and Clavulanic acid 457 mg/5 ml", "1+0+1", "1 month", "Before meal"),
      line("Tablet (Delayed Release). Mesacol Extended Release 400 mg", "2+2+2", "7 week", ""),
    ];
    const lay = layoutRxColumns(rows, A4_INNER, fakeMeasure);
    // Each cell is measured at the size IT prints at: the name at DRUG_PX, and
    // the dose / food / duration at the smaller MID_PX (2026-09-12).
    const fits = (pick: (r: RxLine) => string, col: number, px = MID_PX, bold = false) =>
      Math.max(...rows.map((r) => fakeMeasure(pick(r), px, bold))) <= lay.cols[col] - CELL_PAD_PX;
    expect(fits((r) => r.instruction, 1)).toBe(true);
    expect(fits((r) => r.duration, 2)).toBe(true);
    // The dose shares the drug column and still fits — it is short.
    expect(fits((r) => r.dose, 0)).toBe(true);
    // The names are what gave the width up, and those rows are set smaller,
    // still on one line.
    expect(fits((r) => r.drug, 0, DRUG_PX, true)).toBe(false);
    expect(lay.rowPx.every((px) => px < DRUG_PX)).toBe(true);
    expect(lay.rowWrap).toEqual([false, false]);
  });

  // ⚕️ Reported from a printed sheet on 2026-08-26: seven of these eight
  // medicine names came off the printer broken across two and three lines.
  // The cause was not the type size — it was that ONE free-typed dose
  // ("2-4TSF at night if constipation") made the dose column look as needy as
  // the drug column, so max-min fair split the remainder evenly and handed the
  // dose 117px it could not use (it wrapped at that width anyway) while every
  // drug name was starved. An ordinary label must survive a sheet that also
  // carries one long dose.
  it("keeps ordinary medicine names on one line beside one long free-typed dose", () => {
    const rows = [
      line("Tablet. Xynovir 300 mg", "1+0+0", "Continue", "Before meal"),
      line("Tablet. Barcavir 0.5 mg", "0+0+1", "Continue", "Before meal"),
      line("Capsule. Lenva 4 mg", "0+0+2", "Continue", ""),
      line("Tablet. Carvista 3.125 mg", "1+0+1", "Continue", ""),
      line("Tablet. Bicozin", "0+0+1", "Continue", ""),
      line("Capsule (Enteric Coated). Sergel 40 mg", "1+0+1", "2 month", "Before meal"),
      line("Tablet. Deflux 10 mg", "1+0+1", "if needed", "Before meal"),
      line("Oral Solution. Avolac 3.35 gm/5 ml", "2-4TSF at night if constipation", "", ""),
    ];
    const lay = layoutRxColumns(rows, A4_INNER, fakeMeasure);
    const room = (col: number) => lay.cols[col] - CELL_PAD_PX;
    const fitsDrug = (label: string) => fakeMeasure(label, DRUG_PX, true) <= room(0);

    // The size never moves — the fix buys the line back with width, not type.
    expect(lay.drugPx).toBe(DRUG_PX);
    expect(lay.midPx).toBe(MID_PX);

    // Every ordinary label prints as one phrase.
    for (const label of [
      "Tablet. Xynovir 300 mg",
      "Tablet. Barcavir 0.5 mg",
      "Capsule. Lenva 4 mg",
      "Tablet. Carvista 3.125 mg",
      "Tablet. Bicozin",
      "Tablet. Deflux 10 mg",
    ]) {
      expect(fitsDrug(label), label).toBe(true);
    }

    // ⚕️ And not at the dose's expense: `1+0+1` must never break, nor may the
    // food and duration a dispenser reads beside it. The dose now prints under
    // the name, so it is column 0 that has to hold it.
    expect(fakeMeasure("1+0+1", MID_PX, false)).toBeLessThanOrEqual(room(0));
    expect(fakeMeasure("Before meal", MID_PX, false)).toBeLessThanOrEqual(room(1));
    expect(fakeMeasure("if needed", MID_PX, false)).toBeLessThanOrEqual(room(2));

    // The long dose is capped, never chopped mid-word.
    expect(fakeMeasure("constipation", MID_PX, false)).toBeLessThanOrEqual(room(0));

    // ⚕️ And since 2026-09-12 the two longest labels fit too. They were the
    // honest exceptions here — "a label past ~34 characters will take a second
    // line, and no sane page split fixes that". Moving the dose under the name
    // was the page split that fixed it: the whole sheet is now one line per
    // medicine, at 14px.
    expect(fitsDrug("Capsule (Enteric Coated). Sergel 40 mg")).toBe(true);
    expect(fitsDrug("Oral Solution. Avolac 3.35 gm/5 ml")).toBe(true);
    expect(lay.wrap).toBe(false);
    expect(lay.rowPx.every((px) => px === DRUG_PX)).toBe(true);
  });

  it("still prints 14px for a line no sheet width could hold on one line", () => {
    const lay = layoutRxColumns(
      [line("Suspension. Amoxicillin + Clavulanic acid 457 mg/5 ml pediatric oral drops",
        "2-4 teaspoonful at night only if constipation persists after meals", "Continue until reviewed")],
      A4_INNER, fakeMeasure,
    );
    expect(lay.drugPx).toBe(DRUG_PX);
    expect(lay.midPx).toBe(MID_PX);
    expect(lay.wrap).toBe(true);
  });

  it("stays inside the row when canvas metrics are unavailable", () => {
    const lay = layoutRxColumns(REPORTED, A4_INNER, () => null);
    expect(lay.cols.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(A4_INNER);
    expect(lay.drugPx).toBe(DRUG_PX);
  });

  it("never lets the columns overflow the row, for any of these shapes", () => {
    for (const rows of [REPORTED, [line("A")], [...REPORTED, line("X", "1", "2d", "After food")]]) {
      const lay = layoutRxColumns(rows, A4_INNER, fakeMeasure);
      expect(lay.cols.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(A4_INNER);
    }
  });

  // The row fitting is not enough on its own: the cells print `white-space:
  // nowrap`, so a cell sized a fraction wider than the column it was given
  // bleeds over the next one on paper. Rounding the shares down while sizing
  // the type off the un-rounded share is how that happens, and it only shows
  // up at particular width/size combinations — so pin it for every column of
  // every shape, at several sheet widths.
  it("never lets a cell overflow its own column, at any sheet width", () => {
    const shapes = [
      REPORTED,
      [line("A")],
      [...REPORTED, line("X", "1", "2d", "After food")],
      [line("Tablet. Napa 500 mg", "1+1+1", "5 days", "After food")],
      [line("Oral Solution. Avolac 3.35 gm/5 ml", "2-4tsf at night if constipation", "Continue")],
    ];
    for (const rows of shapes) {
      for (const innerPx of [320, 380, 400, 417, A4_INNER, 460, 520]) {
        const lay = layoutRxColumns(rows, innerPx, fakeMeasure);
        // Every row is measured at the size IT prints at — a row set smaller to
        // keep its one line must still fit the column it is set inside.
        rows.filter((r) => !r.isNote).forEach((r, ri) => {
          if (lay.rowWrap[ri]) return; // below the floor the row may wrap
          const px = lay.rowPx[ri];
          // The name prints at the row's size; the dose, food and duration
          // print at the SMALLER size, scaled by the same ratio and floored to
          // a tenth exactly as the builder does. Measuring them at `px` would
          // over-state them and this pin would fail on rows that are fine.
          const midPx = Math.floor(MID_PX * (px / DRUG_PX) * 10) / 10;
          // Column 0 carries the name and, on the line under it, the dose —
          // two lines, so the wider of the two is what must fit.
          const need = [
            Math.max(fakeMeasure(r.drug, px, true), fakeMeasure(r.dose, midPx, false)),
            ...(lay.hasFood ? [fakeMeasure(r.instruction, midPx, false)] : []),
            fakeMeasure(r.duration, midPx, false),
          ];
          need.forEach((w, i) => {
            expect(w, `row ${ri} col ${i} @ ${innerPx}px`).toBeLessThanOrEqual(lay.cols[i] - CELL_PAD_PX);
          });
        });
        const sheetNeed = [
          Math.max(...rows.map((r) => fakeMeasure(r.drug, lay.drugPx, true))),
        ];
        void sheetNeed;
      }
    }
  });
});

describe("printed Rx markup", () => {
  const doc = (rx: RxLine[]): PrescriptionDoc => ({
    doctorName: "Dr Test",
    patient: { name: "Patient", age: "39", gender: "Male", address: "", weight: "", date: "16/08/2026", phone: "01700000000" },
    clinical: [], rx, advice: [], adviceTest: [], followUp: "",
  });

  // A 10-medicine prescription is ordinary. "10." measures 19.5px in 14px DM
  // Sans, so a serial column narrower than that plus its cell padding drops the
  // number onto a second line beside the medicine it numbers. The column is a
  // SHARE of the table now (see below), so the share is what has to hold 32px.
  it("gives the serial column room for a two-digit number", () => {
    const html = buildPrescriptionHtml(doc(REPORTED));
    const first = html.match(/<colgroup><col style="width:(\d+(?:\.\d+)?)%"/);
    expect(first).not.toBeNull();
    const table = 32 + layoutRxColumns(REPORTED, rxTableInnerPx()).cols.reduce((a, b) => a + b, 0);
    expect((Number(first![1]) / 100) * table).toBeGreaterThanOrEqual(32);
  });

  // Physician's decision, 2026-08-23: on paper the eye should land on the
  // brand, not on "Tablet." or "500 mg".
  it("sets only the brand name in bold, leaving the label itself untouched", () => {
    const html = buildPrescriptionHtml(doc([line("Tablet. Napa 500 mg", "1+1+1", "5 days")]));
    expect(html).toContain("Tablet. <b>Napa</b> 500 mg");
    // The cell carries no weight of its own — the <b> is the only emphasis.
    expect(html).toContain(".rx-drug { font-weight: 400; }");
    expect(html).toContain(".rx-drug b { font-weight: 600; }");
  });

  it("still emphasises a label whose name cannot be read, rather than none of it", () => {
    const html = buildPrescriptionHtml(doc([line("Tablet.", "1+1+1", "5 days")]));
    expect(html).toContain("<b>Tablet.</b>");
  });

  it("escapes the medicine label on both sides of the bold name", () => {
    const html = buildPrescriptionHtml(doc([line("Tablet. A<B 5 mg & more", "1", "1d")]));
    expect(html).toContain("Tablet. <b>A&lt;B</b> 5 mg &amp; more");
    expect(html).not.toContain("A<B");
  });

  it("emits a measured colgroup instead of a stylesheet width per column", () => {
    const html = buildPrescriptionHtml(doc(REPORTED));
    expect(html).toContain("<colgroup>");
    expect(html).not.toContain(".rx-drug { width:");
  });

  it("omits the food cell entirely when the column was dropped", () => {
    const html = buildPrescriptionHtml(doc(REPORTED));
    // 5 medicines x ONE remaining mid cell (duration) — no food column, and no
    // dose column either: the dose prints under the medicine name.
    expect(html.match(/<td class="rx-mid"/g)).toHaveLength(5);
  });

  // ⚕️ The dose is the instruction for the medicine directly above it. It was a
  // column of its own until 2026-09-12, an inch away across white space.
  it("prints the dose on its own line under the medicine name", () => {
    const html = buildPrescriptionHtml(doc([line("Tablet. Napa 500 mg", "1+1+1", "5 days")]));
    expect(html).toContain(
      `<span class="rx-name">Tablet. <b>Napa</b> 500 mg</span>` +
      `<span class="rx-dose" style="font-size:calc(var(--k, 1) * ${MID_PX}px)">1+1+1</span>`,
    );
    // Blocks, so each is its own line; the cell's nowrap is inherited by both.
    expect(html).toContain(".rx-name { display: block; }");
    expect(html).toContain(".rx-dose { display: block;");
    // And the dose is no longer one of the table's columns.
    expect(html).not.toMatch(/<td class="rx-mid"[^>]*>1\+1\+1</);
    // ⚕️ The dose carries the SMALLER size itself — the cell's own font-size is
    // the medicine name's, and the name must be the bigger of the two.
    expect(MID_PX).toBeLessThan(DRUG_PX);
    expect(html).toContain(`<td class="rx-drug" style="font-size:calc(var(--k, 1) * ${DRUG_PX}px)`);
  });

  // A tapering row has no name for the dose to sit under, so it prints beside
  // the ↳ instead — never under an empty line.
  it("keeps a tapering row's dose beside the ↳", () => {
    const html = buildPrescriptionHtml(doc([
      line("Capsule. Lenva 4 mg", "0+0+1", "7 days"),
      { drug: "", dose: "0+0+2", duration: "Continue", instruction: "" },
    ]));
    expect(html).toContain(
      `<span class="rx-cont">↳</span>` +
      `<span class="rx-dose-inline" style="font-size:calc(var(--k, 1) * ${MID_PX}px)">0+0+2</span>`,
    );
  });

  // ⚕️ The ↳ is a SCREEN aid: on the print preview and in the gallery snapshot,
  // never on paper (physician's decision, 2026-09-12). A print-only rule is
  // invisible to every other check in this suite, so it is pinned here.
  it("hides the ↳ on paper but keeps the line indented under its medicine", () => {
    const html = buildPrescriptionHtml(doc([
      line("Capsule. Lenva 4 mg", "0+0+1", "7 days"),
      { drug: "", dose: "0+0+2", duration: "Continue", instruction: "" },
    ]));
    // The marker is still in the markup — it is hidden by the print stylesheet,
    // not dropped from the document, so the screen still shows it.
    expect(html).toContain('<span class="rx-cont">↳</span>');
    expect(html).toMatch(/@media print \{[\s\S]*\.rx-cont \{ visibility: hidden; \}[\s\S]*\}/);
    // ⚕️ visibility, NEVER display: none. The dose keeps the ↳'s space and stays
    // indented under the medicine it continues; flush left it would read as a
    // medicine of its own with no name. It also keeps the width maths honest —
    // drugLineNeed measures that row as CONT_INDENT_PX + the dose.
    expect(html).not.toMatch(/\.rx-cont \{[^}]*display:\s*none/);
  });

  // An empty dose prints nothing at all — not a blank second line that would
  // space the medicine below it away from its own row.
  it("adds no dose line when the doctor typed no dose", () => {
    const html = buildPrescriptionHtml(doc([line("Tablet. Napa One 1000 mg", "", "")]));
    expect(html).toContain('<span class="rx-name">');
    expect(html).not.toContain('<span class="rx-dose">');
  });

  it("spans a free-typed note across however many columns the sheet has", () => {
    const note: RxLine = { drug: "Take plenty of water", dose: "", duration: "", instruction: "", isNote: true };
    expect(buildPrescriptionHtml(doc([...REPORTED, note]))).toContain('colspan="2"');
    expect(
      buildPrescriptionHtml(doc([...REPORTED, note, line("X", "1", "2d", "After food")])),
    ).toContain('colspan="3"');
  });

  it("pins every Rx cell against wrapping when the row has the width for it", () => {
    expect(
      buildPrescriptionHtml(doc([line("Tablet. Napa 500 mg", "1+1+1", "5 days")])),
    ).toContain("white-space:nowrap");
  });

  // ⚕️ The size on the paper, not just in the layout object. 14px is the FLOOR
  // since 2026-08-28: every TYPE size is written through the sheet's fit factor,
  // so the page-fill script can grow the whole document evenly.
  //
  // The column widths are NOT, and must not be. They were, until 2026-08-30, on
  // the reasoning that text and column can never outgrow each other if they
  // scale together — but the paper does not scale with them. At --k = 1.19 the
  // table measured 573px inside a 490px grid track, the .body grid handed it the
  // overflow, and the clinical column collapsed from 209px to 87px: a whole
  // diagnosis printed one word per line down the left edge. As shares of the
  // table the columns are always exactly the track, at every fill factor.
  it("writes every Rx size through the fit factor and every column width as a share", () => {
    const html = buildPrescriptionHtml(doc(REPORTED));
    expect(html).toContain('class="rx-drug" style="font-size:calc(var(--k, 1) * ');
    expect(html).toContain('class="rx-mid" style="font-size:calc(var(--k, 1) * ');
    expect(html).not.toContain('<col style="width:calc(');
    const pcts = [...html.matchAll(/<col style="width:([\d.]+)%"/g)].map((m) => Number(m[1]));
    expect(pcts).toHaveLength(3); // serial + drug (dose lives under the name) + duration
    expect(pcts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
    // Nothing on the Rx table is left at a fixed px, which would not grow with
    // the rest of the sheet.
    expect(html).not.toMatch(/class="rx-(?:drug|mid)" style="font-size:\d/);
    // 14px is the sheet's size. A row that could not be held to one line at it
    // prints smaller — on its own, and never under the floor.
    const sizes = [...html.matchAll(/class="rx-(?:drug|mid)" style="font-size:calc\(var\(--k, 1\) \* ([\d.]+)px/g)]
      .map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    // The largest thing in the table is a medicine NAME, at the sheet's base.
    expect(Math.max(...sizes)).toBe(DRUG_PX);
    // A row set smaller shrinks its mid cells by the same ratio, so the smallest
    // size on the sheet can be under MID_PX — but never under the ratio the
    // row floor implies (ROW_MIN_PX/DRUG_PX of MID_PX).
    expect(Math.min(...sizes))
      .toBeGreaterThanOrEqual(Math.floor(MID_PX * (ROW_MIN_PX / DRUG_PX) * 10) / 10);
    // A prescription with room to spare prints wholly at the sheet's sizes —
    // the name at DRUG_PX, the dose and duration beside it at MID_PX.
    const roomy = buildPrescriptionHtml(doc([line("Tablet. Napa 500 mg", "1+1+1", "5 days")]));
    const roomySizes = [...roomy.matchAll(/class="rx-(?:drug|mid)" style="font-size:calc\(var\(--k, 1\) \* ([\d.]+)px/g)]
      .map((m) => m[1]);
    expect([...new Set(roomySizes)].sort()).toEqual([`${DRUG_PX}`, `${MID_PX}`].sort());
  });

  // ⚕️ The page-fill rule, on the paper. The sheet carries the two numbers the
  // in-document script needs, and the script itself.
  it("carries the printable height and the width headroom, and the fitting script", () => {
    const html = buildPrescriptionHtml(doc(REPORTED));
    // A4 minus the 0.5in letterhead bands, in CSS px.
    expect(html).toContain(`data-avail-h="${sheetContentPx()}"`);
    expect(html).toMatch(/data-kmax="[\d.]+"/);
    expect(html).toContain("beforeprint");
    // It may never shrink the sheet below what it prints today.
    expect(html).toContain("sheet.style.setProperty('--k', '1')");
  });

  it("never lets the fill factor exceed what the widest Rx line can take", () => {
    // It takes a longer line to fill the row than it did before 2026-09-12:
    // the dose gave its column up to the medicine names, so an ordinary sheet
    // genuinely has width to spare now.
    const tight = buildPrescriptionHtml(
      doc([line("Suspension. Amoxicillin + Clavulanic acid 457 mg/5 ml",
        "2-4 teaspoonful at night only if constipation persists", "Continue until reviewed")]),
    );
    expect(tight).toContain('data-kmax="1.000"');
    const roomy = buildPrescriptionHtml(doc([line("Tab. A", "1", "2d")]));
    expect(roomy).toContain(`data-kmax="${MAX_SCALE.toFixed(3)}"`);
  });

  // ⚕️ Reported 2026-08-30: a whole diagnosis printed one word per line down the
  // left edge of the sheet, some words broken mid-word ("multifoc / al HCC").
  // The page-fill factor had a width bound for the Rx table and none for the
  // prose, and the Rx table's own columns were scaled px, so at --k > 1 the
  // table grew past its grid track and took the clinical column's width with
  // it. Three rules hold it shut; all three are pinned here.
  describe("the clinical column keeps its share of the page", () => {
    const withDiagnosis = (page?: PrescriptionDoc["page"]): PrescriptionDoc => ({
      ...doc([line("Off Clopedogrel", "", ""), line("Correction of electrolyte", "", "")]),
      clinical: [
        { label: "Note / Plan", items: ["ERCP with metalic stenting"] },
        { label: "Final diagnosis", items: ["Hilar Cholagiocracinoma with liver Mets", "D/D: multifocal HCC"] },
      ],
      page,
    });

    // 1. The grid tracks are content-independent. A bare `fr` floors at the
    //    track's min-content, so anything too wide on the Rx side used to STEAL
    //    the clinical column's width instead of wrapping inside its own.
    it("sizes the two columns from the page, never from what they carry", () => {
      const html = buildPrescriptionHtml(withDiagnosis());
      expect(html).toContain("grid-template-columns: minmax(0, 0.7fr) 0.5px minmax(0, 1.7fr)");
    });

    // 2. The Rx cells' breaking rule is inherited — it used to reach the whole
    //    sheet through the page cell and split a diagnosis mid-word. Worse,
    //    `overflow-wrap: anywhere` drops an element's min-content to one
    //    character, which is what let the column be squeezed to nothing.
    it("keeps the Rx cells' word-breaking off the rest of the sheet", () => {
      const html = buildPrescriptionHtml(withDiagnosis());
      expect(html).toContain("td.pagebody { padding: 0; border: none; vertical-align: top; overflow-wrap: break-word; word-break: normal; }");
    });

    // 3. The fill factor stops before a word has to break. "Cholagiocracinoma"
    //    is the widest word here and the clinical column is 0.7/2.4 of the page,
    //    so the sheet may not be grown past the room that one word has.
    it("stops growing the sheet before a diagnosis word has to break", () => {
      // The column: 0.7/2.4 of A4's printable width, less .left and ul padding.
      const avail = (8.27 - 0.4 - 0.4) * 96 * (0.7 / 2.4) - 16 - 16;
      // Clinical lines print at PROSE_PX (12 since 2026-09-12), so that is the
      // size the bound has to be measured at — measuring it at the old 14 would
      // understate the room the word has and quietly cap the sheet too low.
      const wordPx = (w: string) => w.length * 12 * 0.58; // the module's own fallback metric
      const kOf = (d: PrescriptionDoc) =>
        Number(buildPrescriptionHtml(d).match(/data-kmax="([\d.]+)"/)![1]);

      expect(kOf(withDiagnosis())).toBeLessThanOrEqual(avail / wordPx("Cholagiocracinoma") + 0.001);
      expect(kOf(withDiagnosis())).toBeGreaterThan(1); // still allowed to fill the page

      // ⚕️ And the word bound must still BITE, not just sit above MAX_SCALE. A
      // long enough diagnosis word has to hold the sheet below the cap on its
      // own — otherwise this test would pass while measuring nothing.
      const long = withDiagnosis();
      long.clinical = [{ label: "Final diagnosis", items: ["Pancreaticoduodenectomy done"] }];
      const k = kOf(long);
      expect(k).toBeLessThan(MAX_SCALE);
      expect(k).toBeGreaterThan(1); // bitten by the word, not floored
      expect(k).toBeLessThanOrEqual(avail / wordPx("Pancreaticoduodenectomy") + 0.001);
    });

    // A narrow page has less room for the same word, so it must fill less.
    it("gives a narrow page a smaller fill factor than A4", () => {
      const narrow: PrescriptionDoc["page"] = {
        unit: "in", width: "5.8", height: "8.3", marginLeft: "0.4", marginRight: "0.4",
        headerHeight: "0.5", footerHeight: "0.5",
      };
      const k = (h: string) => Number(h.match(/data-kmax="([\d.]+)"/)![1]);
      expect(k(buildPrescriptionHtml(withDiagnosis(narrow))))
        .toBeLessThan(k(buildPrescriptionHtml(withDiagnosis())));
    });
  });

  // ⚕️ The patient header's right half — Date / Mobile / Address — starts PAST
  // the middle of the sheet (physician's ask, 2026-09-12). The offset is a
  // SHARE of the page, so it has to be the same fraction on every paper size
  // Prescription settings allow; a px indent would be a hair on A4 and a third
  // of the column on a narrow sheet.
  describe("the patient header's right half sits past the middle", () => {
    const withAddress = (page?: PrescriptionDoc["page"]): PrescriptionDoc => ({
      ...doc([line("Tablet. Napa 500 mg", "1+1+1", "5 days")]),
      patient: {
        name: "muhammad jubayer", age: "26", gender: "Male", weight: "",
        address: "south", date: "12/09/2026", phone: "01753710293",
      },
      page,
    });

    it("gives the left half the larger share, so the date starts right of centre", () => {
      const html = buildPrescriptionHtml(withAddress());
      expect(html).toContain("grid-template-columns: minmax(0, 0.56fr) minmax(0, 0.44fr)");
    });

    // minmax(0, …) for the same reason .body carries it: a bare fr track floors
    // at its content's min width, so one long name or address would shove the
    // date column to wherever it happened to fit — a different offset on every
    // patient, which is the opposite of "aligned for every paper size".
    it("holds the split whatever the two halves carry", () => {
      const long = withAddress();
      long.patient = {
        ...long.patient,
        name: "Mohammad Abdur Rahman Chowdhury Al-Mahmud",
        address: "House 12/B, Road 5, Dhanmondi Residential Area, Dhaka 1209",
      };
      expect(buildPrescriptionHtml(long))
        .toContain("grid-template-columns: minmax(0, 0.56fr) minmax(0, 0.44fr)");
    });

    // The gap is written from the same constant the width bound subtracts, so
    // the CSS and the maths cannot drift apart.
    it("uses one gap for both the CSS and the fill bound", () => {
      expect(buildPrescriptionHtml(withAddress())).toContain("gap: 4px 24px;");
    });

    // The right half is now the NARROWER one and carries the Address — the
    // longest value on that side. A bound averaged over both halves would let
    // the fill factor grow the type until an address word had to break.
    it("bounds the fill factor on the narrower right half", () => {
      const kOf = (address: string) => {
        const d = withAddress();
        const html = buildPrescriptionHtml({ ...d, patient: { ...d.patient, address } });
        return Number(html.match(/data-kmax="([\d.]+)"/)![1]);
      };
      // One unbroken 35-char token. It has to be long enough that the RIGHT
      // half's width — not MAX_SCALE — is what stops the sheet growing, or this
      // test would pass without measuring anything.
      const addr = "Chandanaish-Satkania-Lohagara-Ukhia";
      // A4 printable width, less the .pt gap, times the RIGHT half's share.
      const rightAvail = ((8.27 - 0.4 - 0.4) * 96 - 24) * 0.44;
      const word = addr.length * 14 * 0.58; // the module's own fallback metric
      expect(kOf(addr)).toBeLessThanOrEqual(rightAvail / word + 0.001);
      // …and the bound is a real one, not the 1.0 floor: a short address still
      // lets the sheet fill the page. If this ever stops holding, the right
      // half is being measured against more room than it has.
      expect(kOf(addr)).toBeGreaterThan(1);
      expect(kOf(addr)).toBeLessThan(kOf("south"));
    });

    // Same share, different paper: the date starts at the same fraction of the
    // sheet on a 5.8in page as it does on A4 — that is the whole point of
    // expressing the offset in fr rather than px.
    it("keeps the same split on every page size", () => {
      const narrow: PrescriptionDoc["page"] = {
        unit: "in", width: "5.8", height: "8.3", marginLeft: "0.4", marginRight: "0.4",
        headerHeight: "0.5", footerHeight: "0.5",
      };
      const wide: PrescriptionDoc["page"] = {
        unit: "cm", width: "21.6", height: "35.6", marginLeft: "1", marginRight: "1",
        headerHeight: "1", footerHeight: "1",
      };
      for (const page of [undefined, narrow, wide]) {
        expect(buildPrescriptionHtml(withAddress(page)))
          .toContain("grid-template-columns: minmax(0, 0.56fr) minmax(0, 0.44fr)");
      }
    });
  });

  it("prints no brand name in the header — the band is the practice's letterhead", () => {
    // Removed 2026-08-16 at the physician's request. Pinned so it cannot return.
    const html = buildPrescriptionHtml({ ...doc(REPORTED), extraPrivacyPage: true });
    expect(html).not.toContain("<h1>");
    // The rule that separates the letterhead band from the patient details stays.
    expect(html).toContain('<div class="head"></div>');
    // The footer brand bar is a separate thing and is unaffected.
    expect(html).toContain('class="bb-mhs"');
  });
});

// ⚕️ NO prescribing warning is printed.
//
// The "MHS is suggesting" advice is a live aid shown while the doctor writes.
// It was briefly printed as a red callout under the medicine, and the physician
// decided on 2026-08-17 that it must not survive onto the document: the printed
// sheet and the saved copy show what the doctor entered, not what the system
// inferred. These pin the absence in the printed HTML — the callout markup, its
// stylesheet and its only red — so it cannot return as a tidy-up. Bringing it
// back is a product decision, not a bug fix.
describe("prescribing warnings are NOT printed", () => {
  const doc2 = (rx: RxLine[]): PrescriptionDoc => ({
    doctorName: "Dr Test",
    patient: { name: "Patient", age: "39", gender: "Male", address: "", weight: "", date: "16/08/2026", phone: "01700000000" },
    clinical: [], rx, advice: [], adviceTest: [], followUp: "",
  });

  it("emits no callout markup for any medicine", () => {
    const html = buildPrescriptionHtml(doc2(REPORTED));
    expect(html).not.toContain("rx-alert");
  });

  it("carries no callout stylesheet, and no red", () => {
    const html = buildPrescriptionHtml(doc2(REPORTED));
    expect(html).not.toContain(".rx-alert-line");
    expect(html).not.toContain("#c0392b"); // was the only red on the sheet
  });

  it("prints nothing extra on the privacy copy either", () => {
    const html = buildPrescriptionHtml({ ...doc2(REPORTED), extraPrivacyPage: true });
    expect(html).not.toContain("rx-alert");
  });

  it("leaves one row per medicine — the callout row is gone", () => {
    const html = buildPrescriptionHtml(doc2(REPORTED));
    // Every ℞ row still opens with a number cell; five medicines, five rows.
    expect(html.match(/<td class="rx-no">/g)).toHaveLength(REPORTED.length);
  });
});
