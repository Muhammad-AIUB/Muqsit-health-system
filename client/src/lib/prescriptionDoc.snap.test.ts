import { describe, expect, it } from "vitest";
import { buildPrescriptionHtml, type PrescriptionDoc } from "./prescriptionDoc";
import { A4_PAGE, EIGHT_MEDICINE_RX, REPORTED_RX, makePrescriptionDoc, rxLine, rxNote } from "@/test/fixtures";

// ⚕️ The printed prescription is a legal document ("Print/PDF is a legal
// document. Fits the page, never truncates, shows exactly what was entered").
// prescriptionDoc.test.ts pins the rules one at a time; these snapshots pin the
// WHOLE document — markup, stylesheet and fitting script — for three sheets, so
// that ANY unintended change to what is handed to a patient shows up as a diff
// in review, including the changes nobody thought to write a rule for.
//
// A red snapshot is not a formality. Read the diff as the printed page: if the
// change was intended, update with `npx vitest run -u src/lib/prescriptionDoc.snap.test.ts`
// and check print preview (root CLAUDE.md, rule 4); if it was not, it is a
// regression on the legal document.
//
// DETERMINISM. `buildPrescriptionHtml` reads no clock and no random source: the
// date on the sheet is the `patient.date` string passed in. Two things in it
// depend on the environment, and both are fixed by running this file in
// vitest's default `node` environment (this file must never opt into a DOM one):
//   • `<base href="${window.location.origin}/">` — no `window` ⇒ `<base href="/" />`;
//   • text widths come from a <canvas> when a DOM exists, else from the
//     builder's own per-character estimate. No DOM ⇒ always the estimate.
// Nothing is normalised or stripped from the output; the first test proves the
// two assumptions instead of trusting them.
//
// Every value below is copied from prescriptionDoc.test.ts (via test/fixtures).

/** Sheet 1 — a short prescription: one medicine, nothing else. */
const SHORT = (): PrescriptionDoc => makePrescriptionDoc([rxLine("Tablet. Napa 500 mg", "1+1+1", "5 days")]);

/** Sheet 2 — the eight-medicine sheet reported on 2026-08-26, with a tapering
 *  line under Lenva, a free-typed note, both clinical-column shapes (verbatim
 *  History, name-only Drug history), an address and explicit A4 settings. */
const EIGHT = (): PrescriptionDoc => {
  const rx = EIGHT_MEDICINE_RX();
  rx.splice(3, 0, { drug: "", dose: "0+0+2", duration: "Continue", instruction: "" }); // ↳ under Capsule. Lenva 4 mg
  rx.push(rxNote("Take plenty of water"));
  return makePrescriptionDoc(rx, {
    patient: {
      name: "Patient", age: "39", gender: "Male", weight: "",
      address: "House 12/B, Road 5, Dhanmondi Residential Area, Dhaka 1209",
      date: "12/09/2026", phone: "01700000000",
    },
    clinical: [
      { label: "Final diagnosis", items: ["Chronic hepatitis B"] },
      { label: "History", items: ["Past: TB, treated", "Current: smoker"] },
      {
        label: "Drug history",
        items: [
          "Past: Losartan 50mg — 1+0+1 — after food — continuing",
          "Current(cont): 0+0+1 —  — 7 days",
          "05/03/2026(note): Stopped warfarin — GI bleed",
        ],
      },
    ],
    page: A4_PAGE(),
  });
};

/** Sheet 3 — OPD with the privacy copy: page 1 in full, page 2 with the name
 *  and mobile masked and the clinical column and advice left off. */
const PRIVACY = (): PrescriptionDoc =>
  makePrescriptionDoc(REPORTED_RX(), {
    clinical: [{ label: "Final diagnosis", items: ["Chronic hepatitis B"] }],
    advice: ["bed rest"],
    adviceTest: ["ALT/SGPT"],
    followUp: "12/09/2026",
    extraPrivacyPage: true,
  });

describe("printed prescription — deterministic", () => {
  it("builds byte-identical HTML every time, with no origin and no clock in it", () => {
    expect(typeof window).toBe("undefined");   // node environment: no canvas, no origin
    for (const make of [SHORT, EIGHT, PRIVACY]) {
      const html = buildPrescriptionHtml(make());
      expect(buildPrescriptionHtml(make())).toBe(html);
      expect(html).toContain('<base href="/" />');
      expect(html).not.toMatch(/https?:\/\//);
      // The only dates on the sheet are the ones passed in.
      const year = String(new Date().getFullYear());
      const dates = html.match(/\d{2}\/\d{2}\/\d{4}/g) ?? [];
      expect(dates.every((d) => ["16/08/2026", "12/09/2026"].includes(d)), `${dates} (run in ${year})`).toBe(true);
    }
  });
});

describe("printed prescription — the whole document", () => {
  it("a short prescription", () => {
    expect(buildPrescriptionHtml(SHORT())).toMatchSnapshot();
  });

  it("the eight-medicine sheet, with a taper and a note line", () => {
    const html = buildPrescriptionHtml(EIGHT());
    // What the snapshot is for, stated once in words so a careless `-u` still
    // has to get past these: nine numbered lines, one un-numbered taper.
    const serials = [...html.matchAll(/<td class="rx-no">([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(serials).toEqual(["1.", "2.", "3.", "", "4.", "5.", "6.", "7.", "8.", "9."]);
    expect(html).toMatchSnapshot();
  });

  it("the OPD privacy copy", () => {
    const html = buildPrescriptionHtml(PRIVACY());
    const sheets = html.split('<div class="sheet"').slice(1);
    expect(sheets).toHaveLength(2);
    // Page 2 carries neither the name, the full mobile, the diagnosis nor the advice.
    expect(sheets[0]).toContain("01700000000");
    expect(sheets[1]).not.toContain("01700000000");
    expect(sheets[1]).not.toContain("Chronic hepatitis B");
    expect(sheets[1]).not.toContain("bed rest");
    expect(html).toMatchSnapshot();
  });
});
