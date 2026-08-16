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
// leaves 438px for the Rx data columns.

// Stand-in for canvas metrics (vitest has no DOM). Linear in font size, like
// real text, near the ~0.47em/char DM Sans actually measures; bold a shade wider.
const fakeMeasure = (t: string, px: number, bold: boolean) => t.length * px * (bold ? 0.5 : 0.47);

const A4_INNER = 438;
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
    expect(lay.drugPx).toBe(13);
    expect(lay.midPx).toBe(12.5);
    // Widths still fill the row rather than leaving a ragged right edge.
    expect(lay.cols.reduce((a, b) => a + b, 0)).toBeGreaterThan(A4_INNER * 0.9);
  });

  it("shrinks every column by the same factor when the row is over-full", () => {
    const lay = layoutRxColumns(
      [line("Oral Solution. Avolac 3.35 gm/5 ml", "2-4tsf at night if constipation", "Continue")],
      A4_INNER, fakeMeasure,
    );
    expect(lay.drugPx).toBeLessThan(13);
    expect(lay.midPx).toBeLessThan(12.5);
    // Same factor, so the ratio of the two base sizes is preserved.
    expect(lay.drugPx / lay.midPx).toBeCloseTo(13 / 12.5, 1);
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
});

describe("printed Rx markup", () => {
  const doc = (rx: RxLine[]): PrescriptionDoc => ({
    doctorName: "Dr Test",
    patient: { name: "Patient", age: "39", gender: "Male", address: "", weight: "", date: "16/08/2026", phone: "01700000000" },
    clinical: [], rx, advice: [], adviceTest: [], followUp: "",
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

// ⚕️ Prescribing warnings on the printed sheet.
//
// The physician asked for the same warning the screen shows to appear against
// the medicine on the prescription itself, in red. These pin what must hold on
// a legal document: the wording is verbatim, it is attached to the RIGHT
// medicine, it never takes width from the medicine name, it wraps rather than
// truncating, and it stays off the public privacy copy.
describe("prescribing warnings on the printed sheet", () => {
  const WARN = "Entecavir is contraindicated in pregnancy and lactation. Use tenofovir disoproxil.";
  const withAlert = (): RxLine[] => [
    { ...line("Tablet. Barcavir 0.5 mg", "1+0+0", "Continue"), alerts: [WARN] },
    line("Tablet. Napa 500 mg", "1+1+1", "5 days"),
  ];
  const doc2 = (rx: RxLine[]): PrescriptionDoc => ({
    doctorName: "Dr Test",
    patient: { name: "Patient", age: "39", gender: "Male", address: "", weight: "", date: "16/08/2026", phone: "01700000000" },
    clinical: [], rx, advice: [], adviceTest: [], followUp: "",
  });

  it("prints the warning sentence verbatim", () => {
    expect(buildPrescriptionHtml(doc2(withAlert()))).toContain(WARN);
  });

  it("draws it as a red callout with a tail", () => {
    const html = buildPrescriptionHtml(doc2(withAlert()));
    expect(html).toContain('<div class="rx-alert-box">');
    expect(html).toContain('<span class="rx-alert-tail">');
    expect(html).toContain("#c0392b"); // the only red on the sheet
  });

  it("attaches it to the medicine that raised it, not the next one", () => {
    const html = buildPrescriptionHtml(doc2(withAlert()));
    const barcavir = html.indexOf("Tablet. Barcavir 0.5 mg");
    const alert = html.indexOf('<div class="rx-alert-box">');
    const napa = html.indexOf("Tablet. Napa 500 mg");
    expect(barcavir).toBeLessThan(alert);
    expect(alert).toBeLessThan(napa);
  });

  it("adds NO column — the medicine name keeps its measured width", () => {
    const plain = buildPrescriptionHtml(doc2([line("Tablet. Barcavir 0.5 mg", "1+0+0", "Continue"), line("Tablet. Napa 500 mg", "1+1+1", "5 days")]));
    const alerted = buildPrescriptionHtml(doc2(withAlert()));
    const cols = (h: string) => h.slice(h.indexOf("<colgroup>"), h.indexOf("</colgroup>"));
    expect(cols(alerted)).toBe(cols(plain));
  });

  it("wraps instead of truncating, even on a sheet that prints nowrap", () => {
    const html = buildPrescriptionHtml(doc2(withAlert()));
    expect(html).toContain("white-space:nowrap");           // the ℞ cells
    expect(html).toContain(".rx-alert-line { font-size");   // …but the warning
    expect(html).toContain("white-space: normal");          //    wraps
  });

  it("prints every warning a medicine raised, once each", () => {
    const two = [{ ...line("Tablet. X 5mg"), alerts: [WARN, "Second advice line."] }];
    const html = buildPrescriptionHtml(doc2(two));
    expect(html.match(/<div class="rx-alert-line">/g)).toHaveLength(2);
  });

  it("ignores blank or whitespace-only warnings", () => {
    const html = buildPrescriptionHtml(doc2([{ ...line("Tablet. X 5mg"), alerts: ["", "   "] }]));
    expect(html).not.toContain('<div class="rx-alert-box">');
  });

  it("changes nothing when no line carries a warning", () => {
    expect(buildPrescriptionHtml(doc2(REPORTED))).not.toContain('<div class="rx-alert-box">');
  });

  it("keeps the warning OFF the privacy copy — it is written to the doctor", () => {
    const html = buildPrescriptionHtml({ ...doc2(withAlert()), extraPrivacyPage: true });
    // One sheet carries it, the masked public copy does not.
    expect(html.match(/<div class="rx-alert-box">/g)).toHaveLength(1);
  });

  it("escapes the warning text — it is rendered into HTML", () => {
    const html = buildPrescriptionHtml(doc2([{ ...line("Tablet. X 5mg"), alerts: ["<script>alert(1)</script>"] }]));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("the warning row spans the whole table", () => {
  // A short row leaves a phantom column and squeezes the callout, so the
  // warning wraps onto more lines than it needs. It must span exactly the same
  // columns a free-typed note does.
  const WARN = "Entecavir is contraindicated in pregnancy and lactation.";
  const doc3 = (rx: RxLine[]): PrescriptionDoc => ({
    doctorName: "Dr Test",
    patient: { name: "P", age: "39", gender: "Male", address: "", weight: "", date: "16/08/2026", phone: "01700000000" },
    clinical: [], rx, advice: [], adviceTest: [], followUp: "",
  });

  it("uses the same colspan as a note when there is no food column", () => {
    const html = buildPrescriptionHtml(doc3([{ ...line("Tablet. X 5mg"), alerts: [WARN] }]));
    expect(html).toContain('class="rx-alert" colspan="3"');
  });

  it("widens with the food column", () => {
    const html = buildPrescriptionHtml(
      doc3([{ ...line("Tablet. X 5mg", "1+0+0", "5 days", "After meal"), alerts: [WARN] }]),
    );
    expect(html).toContain('class="rx-alert" colspan="4"');
  });

  it("matches the note row's span exactly", () => {
    const note: RxLine = { drug: "Rest", dose: "", duration: "", instruction: "", isNote: true };
    const html = buildPrescriptionHtml(doc3([{ ...line("Tablet. X 5mg"), alerts: [WARN] }, note]));
    const noteSpan = html.match(/class="rx-note" colspan="(\d)"/)?.[1];
    const alertSpan = html.match(/class="rx-alert" colspan="(\d)"/)?.[1];
    expect(alertSpan).toBe(noteSpan);
  });
});
