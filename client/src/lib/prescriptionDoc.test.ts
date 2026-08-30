import { describe, expect, it } from "vitest";
import {
  buildPrescriptionHtml,
  CELL_PAD_PX,
  layoutRxColumns,
  MAX_SCALE,
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
    expect(layoutRxColumns(REPORTED, A4_INNER, fakeMeasure)).toMatchObject({ hasFood: false });
    expect(layoutRxColumns(REPORTED, A4_INNER, fakeMeasure).cols).toHaveLength(3);

    const withFood = layoutRxColumns(
      [...REPORTED, line("Tablet. Napa 500 mg", "1+1+1", "5 days", "After food")],
      A4_INNER, fakeMeasure,
    );
    expect(withFood.hasFood).toBe(true);
    expect(withFood.cols).toHaveLength(4);
  });

  it("gives the reported prescription one size for every medicine, and it is 14px", () => {
    const lay = layoutRxColumns(REPORTED, A4_INNER, fakeMeasure);
    // Uniform by construction: one drugPx for the sheet, not one per row.
    expect(lay.drugPx).toBe(14);
    expect(lay.midPx).toBe(14);
  });

  it("hands the long dose the empty food column's width instead of a column of its own", () => {
    const lay = layoutRxColumns(REPORTED, A4_INNER, fakeMeasure);
    expect(lay.cols).toHaveLength(3);
    // "2-4tsf at night if constipation" is the widest dose on the sheet, so the
    // dose column takes more of the row than the duration beside it.
    expect(lay.cols[1]).toBeGreaterThan(lay.cols[2]);
  });

  it("never sets type larger than the base size when there is room to spare", () => {
    const lay = layoutRxColumns([line("Tab. A", "1", "1d")], A4_INNER, fakeMeasure);
    expect(lay.drugPx).toBe(14);
    expect(lay.midPx).toBe(14);
    // Widths still fill the row rather than leaving a ragged right edge.
    expect(lay.cols.reduce((a, b) => a + b, 0)).toBeGreaterThan(A4_INNER * 0.9);
  });

  // ⚕️ The over-full row SHRINKS, on its own, rather than wrapping
  // (physician's decision 2026-08-28, superseding the wrap rule of 2026-08-26).
  // The sheet's base stays 14px — one long medicine must not drag the rest of
  // the prescription down with it.
  it("sets an over-full row smaller instead of wrapping it", () => {
    const lay = layoutRxColumns(
      [line("Tablet (Delayed Release). Mesacol Extended Release 400 mg XR", "2+2+2", "7 week")],
      A4_INNER, fakeMeasure,
    );
    expect(lay.drugPx).toBe(14);
    expect(lay.midPx).toBe(14);
    expect(lay.rowPx[0]).toBeLessThan(14);
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
    expect(lay.rowPx).toEqual([14]);
    expect(lay.rowWrap).toEqual([false]);
  });

  // ⚕️ The width half of the page-fill bound. A sheet with room to spare may
  // grow; one whose widest line already fills its column may not, or the line
  // it was measured for would stop fitting.
  it("reports how far the sheet may grow, and never past the cap", () => {
    const roomy = layoutRxColumns([line("Tab. A", "1", "2d")], A4_INNER, fakeMeasure);
    expect(roomy.maxScale).toBe(MAX_SCALE);
    const full = layoutRxColumns(
      [line("Oral Solution. Avolac 3.35 gm/5 ml", "2-4tsf at night if constipation", "Continue")],
      A4_INNER, fakeMeasure,
    );
    expect(full.maxScale).toBe(1);
  });

  // ⚕️ A dose is the cell a dispenser cannot afford to misread, and `1+0+1`
  // broken over two lines is exactly that. When the row is over-full the short
  // columns are served in full and the shortfall falls on the drug names.
  it("starves the drug column, never the dose, when the row is over-full", () => {
    const rows = [
      line("Capsule (Enteric Coated). Esoral 20 mg", "1+0+1", "1 month", "Before meal"),
      line("Tablet (Delayed Release). Mesacol 400 mg", "2+2+2", "7 week", ""),
    ];
    const lay = layoutRxColumns(rows, A4_INNER, fakeMeasure);
    const fits = (pick: (r: RxLine) => string, col: number, bold = false) =>
      Math.max(...rows.map((r) => fakeMeasure(pick(r), 14, bold))) <= lay.cols[col] - CELL_PAD_PX;
    expect(fits((r) => r.dose, 1)).toBe(true);
    expect(fits((r) => r.instruction, 2)).toBe(true);
    expect(fits((r) => r.duration, 3)).toBe(true);
    // The drug column is the one that gave up the width — and the rows whose
    // names no longer fit are set smaller, still on one line.
    expect(fits((r) => r.drug, 0, true)).toBe(false);
    expect(lay.rowPx.every((px) => px < 14)).toBe(true);
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
    const fitsDrug = (label: string) => fakeMeasure(label, 14, true) <= room(0);

    // The size never moves — the fix buys the line back with width, not type.
    expect(lay.drugPx).toBe(14);
    expect(lay.midPx).toBe(14);

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
    // food and duration a dispenser reads beside it.
    expect(fakeMeasure("1+0+1", 14, false)).toBeLessThanOrEqual(room(1));
    expect(fakeMeasure("Before meal", 14, false)).toBeLessThanOrEqual(room(2));
    expect(fakeMeasure("if needed", 14, false)).toBeLessThanOrEqual(room(3));

    // The long dose is capped, never chopped mid-word.
    expect(fakeMeasure("constipation", 14, false)).toBeLessThanOrEqual(room(1));

    // Honest about what is still over-full: only the two longest labels wrap.
    expect(fitsDrug("Capsule (Enteric Coated). Sergel 40 mg")).toBe(false);
    expect(fitsDrug("Oral Solution. Avolac 3.35 gm/5 ml")).toBe(false);
    expect(lay.wrap).toBe(true);
  });

  it("still prints 14px for a line no sheet width could hold on one line", () => {
    const lay = layoutRxColumns(
      [line("Suspension. Amoxicillin + Clavulanic acid 457 mg/5 ml pediatric oral drops",
        "2-4 teaspoonful at night only if constipation persists after meals", "Continue until reviewed")],
      A4_INNER, fakeMeasure,
    );
    expect(lay.drugPx).toBe(14);
    expect(lay.midPx).toBe(14);
    expect(lay.wrap).toBe(true);
  });

  it("stays inside the row when canvas metrics are unavailable", () => {
    const lay = layoutRxColumns(REPORTED, A4_INNER, () => null);
    expect(lay.cols.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(A4_INNER);
    expect(lay.drugPx).toBe(14);
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
          const need = [
            fakeMeasure(r.drug, px, true),
            fakeMeasure(r.dose, px, false),
            ...(lay.hasFood ? [fakeMeasure(r.instruction, px, false)] : []),
            fakeMeasure(r.duration, px, false),
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
    // 5 medicines x 3 data cells, no empty fourth.
    expect(html.match(/<td class="rx-mid"/g)).toHaveLength(10);
  });

  it("spans a free-typed note across however many columns the sheet has", () => {
    const note: RxLine = { drug: "Take plenty of water", dose: "", duration: "", instruction: "", isNote: true };
    expect(buildPrescriptionHtml(doc([...REPORTED, note]))).toContain('colspan="3"');
    expect(
      buildPrescriptionHtml(doc([...REPORTED, note, line("X", "1", "2d", "After food")])),
    ).toContain('colspan="4"');
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
    expect(pcts).toHaveLength(4); // serial + drug + dose + duration
    expect(pcts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
    // Nothing on the Rx table is left at a fixed px, which would not grow with
    // the rest of the sheet.
    expect(html).not.toMatch(/class="rx-(?:drug|mid)" style="font-size:\d/);
    // 14px is the sheet's size. A row that could not be held to one line at it
    // prints smaller — on its own, and never under the floor.
    const sizes = [...html.matchAll(/class="rx-(?:drug|mid)" style="font-size:calc\(var\(--k, 1\) \* ([\d.]+)px/g)]
      .map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBe(14);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(ROW_MIN_PX);
    // A prescription with room to spare prints wholly at the sheet's size.
    const roomy = buildPrescriptionHtml(doc([line("Tablet. Napa 500 mg", "1+1+1", "5 days")]));
    const roomySizes = [...roomy.matchAll(/class="rx-(?:drug|mid)" style="font-size:calc\(var\(--k, 1\) \* ([\d.]+)px/g)]
      .map((m) => m[1]);
    expect([...new Set(roomySizes)]).toEqual(["14"]);
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
    const tight = buildPrescriptionHtml(
      doc([line("Oral Solution. Avolac 3.35 gm/5 ml", "2-4tsf at night if constipation", "Continue")]),
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
      const html = buildPrescriptionHtml(withDiagnosis());
      const kMax = Number(html.match(/data-kmax="([\d.]+)"/)![1]);
      // The column: 0.7/2.4 of A4's printable width, less .left and ul padding.
      const avail = (8.27 - 0.4 - 0.4) * 96 * (0.7 / 2.4) - 16 - 16;
      const word = "Cholagiocracinoma".length * 14 * 0.58; // the module's own fallback metric
      expect(kMax).toBeLessThanOrEqual(avail / word + 0.001);
      expect(kMax).toBeGreaterThan(1); // still allowed to fill the page
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
