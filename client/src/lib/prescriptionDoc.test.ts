import { describe, expect, it } from "vitest";
import {
  buildPrescriptionHtml,
  layoutRxColumns,
  rxTableInnerPx,
  type PrescriptionDoc,
  type RxLine,
} from "./prescriptionDoc";

// ⚕️ The printed sheet is the legal record. These pin the two rules a dispenser
// depends on: every cell prints on ONE line, and the whole sheet prints at ONE
// type size (a medicine set smaller than its neighbour reads as emphasis nobody
// intended). Cross-checked against a real browser on 2026-08-16: an A4 sheet
// left 438px for the Rx data columns; 428px since RX_NO_PX widened to 32 so a
// two-digit serial fits beside its medicine at 14px (2026-08-23).

// Stand-in for canvas metrics (vitest has no DOM). Linear in font size, like
// real text, near the ~0.47em/char DM Sans actually measures; bold a shade wider.
const fakeMeasure = (t: string, px: number, bold: boolean) => t.length * px * (bold ? 0.5 : 0.47);

const A4_INNER = 428;
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

  it("gives the reported prescription one size for every medicine, on one line", () => {
    const lay = layoutRxColumns(REPORTED, A4_INNER, fakeMeasure);
    expect(lay.wrap).toBe(false);
    // Uniform by construction: one drugPx for the sheet, not one per row.
    expect(lay.drugPx).toBeGreaterThanOrEqual(8.5);
    // Widest drug fits its column.
    const widest = Math.max(...REPORTED.map((r) => fakeMeasure(r.drug, lay.drugPx, true)));
    expect(widest).toBeLessThanOrEqual(lay.cols[0] - 12);
  });

  it("fits the long dose on one line by giving it the empty food column's width", () => {
    const lay = layoutRxColumns(REPORTED, A4_INNER, fakeMeasure);
    const dose = fakeMeasure("2-4tsf at night if constipation", lay.midPx, false);
    expect(dose).toBeLessThanOrEqual(lay.cols[1] - 12);
  });

  it("never sets type larger than the base size when there is room to spare", () => {
    const lay = layoutRxColumns([line("Tab. A", "1", "1d")], A4_INNER, fakeMeasure);
    expect(lay.drugPx).toBe(14);
    expect(lay.midPx).toBe(14);
    // Widths still fill the row rather than leaving a ragged right edge.
    expect(lay.cols.reduce((a, b) => a + b, 0)).toBeGreaterThan(A4_INNER * 0.9);
  });

  it("shrinks every column by the same factor when the row is over-full", () => {
    const lay = layoutRxColumns(
      [line("Oral Solution. Avolac 3.35 gm/5 ml", "2-4tsf at night if constipation", "Continue")],
      A4_INNER, fakeMeasure,
    );
    expect(lay.drugPx).toBeLessThan(14);
    expect(lay.midPx).toBeLessThan(14);
    // Same factor, so the ratio of the two base sizes is preserved (both 14px).
    expect(lay.drugPx / lay.midPx).toBeCloseTo(1, 1);
  });

  it("stops at the legibility floor and wraps rather than printing unreadably", () => {
    const lay = layoutRxColumns(
      [line("Suspension. Amoxicillin + Clavulanic acid 457 mg/5 ml pediatric oral drops",
        "2-4 teaspoonful at night only if constipation persists after meals", "Continue until reviewed")],
      A4_INNER, fakeMeasure,
    );
    expect(lay.drugPx).toBe(8.5);
    expect(lay.wrap).toBe(true);
  });

  it("stays inside the row when canvas metrics are unavailable", () => {
    const lay = layoutRxColumns(REPORTED, A4_INNER, () => null);
    expect(lay.cols.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(A4_INNER);
    expect(lay.drugPx).toBeGreaterThanOrEqual(8.5);
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
        if (lay.wrap) continue; // below the floor cells are allowed to wrap
        const cell = (pick: (r: RxLine) => string, px: number, bold: boolean) =>
          Math.max(...rows.map((r) => fakeMeasure(pick(r), px, bold)));
        const need = [
          cell((r) => r.drug, lay.drugPx, true),
          cell((r) => r.dose, lay.midPx, false),
          ...(lay.hasFood ? [cell((r) => r.instruction, lay.midPx, false)] : []),
          cell((r) => r.duration, lay.midPx, false),
        ];
        need.forEach((w, i) => {
          expect(w, `col ${i} @ ${innerPx}px`).toBeLessThanOrEqual(lay.cols[i] - 12);
        });
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
  // Sans, so a serial column narrower than that plus its 12px padding drops the
  // number onto a second line beside the medicine it numbers.
  it("gives the serial column room for a two-digit number", () => {
    const html = buildPrescriptionHtml(doc(REPORTED));
    const first = html.match(/<colgroup><col style="width:(\d+(?:\.\d+)?)px"/);
    expect(first).not.toBeNull();
    expect(Number(first![1])).toBeGreaterThanOrEqual(32);
  });

  it("emits a colgroup instead of percentage widths", () => {
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

  it("pins every Rx cell against wrapping", () => {
    expect(buildPrescriptionHtml(doc(REPORTED))).toContain("white-space:nowrap");
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
