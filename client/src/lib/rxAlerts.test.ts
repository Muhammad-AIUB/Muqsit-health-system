import { describe, expect, it } from "vitest";
import { checkRxAlerts, findRxAlerts, rxAlertsByLine, type RxAlertInput } from "./rxAlerts";

// ⚕️ These assertions pin the exact wording the physician supplied. A failure
// here means the advice a doctor reads has changed — treat it as a clinical
// regression, not a broken test, and check the source sheet before editing.

const PREGNANCY_MSG = "Entecavir is contraindicated in pregnancy and lactation. Use tenofovir disoproxil.";
const PPI_MSG = "Sofosbuvir/Velpatasvir dose must have atleast 4 hours gap before taking Proton Pump Inhibitor";
const H2_MSG = "Sofosbuvir/Velpatasvir dose must have atleast 12 hours gap before taking your H2 blocker";

const input = (rx: string[], sidebar: Record<string, string[]> = {}): RxAlertInput => ({
  rxDrugs: rx.map((text) => ({ text })),
  sidebar: Object.entries(sidebar).map(([label, items]) => ({ label, items })),
});

const messages = (i: RxAlertInput) => findRxAlerts(i).map((a) => a.message);

describe("entecavir + pregnancy", () => {
  it("fires the contraindication verbatim", () => {
    expect(messages(input(["Tab. Entecavir 0.5mg"], { History: ["Pregnant"] }))).toEqual([PREGNANCY_MSG]);
  });

  it("finds the condition in any sidebar clinical field", () => {
    for (const field of ["Chief complaints", "Provisional diagnosis", "Associated illness", "Final diagnosis", "On examination"]) {
      expect(messages(input(["entecavir"], { [field]: ["Pregnancy, 2nd trimester"] }))).toEqual([PREGNANCY_MSG]);
    }
  });

  it("covers lactation, which the advice text also names", () => {
    expect(messages(input(["entecavir"], { History: ["Lactating mother"] }))).toEqual([PREGNANCY_MSG]);
  });

  it("stays silent without both halves", () => {
    expect(messages(input(["entecavir"], { History: ["Diabetic"] }))).toEqual([]);
    expect(messages(input(["Tab. Napa 500mg"], { History: ["Pregnant"] }))).toEqual([]);
  });

  it("does not fire on an explicit negation", () => {
    expect(messages(input(["entecavir"], { History: ["Not pregnant"] }))).toEqual([]);
    expect(messages(input(["entecavir"], { History: ["no pregnancy"] }))).toEqual([]);
  });

  it("matches on word boundaries only", () => {
    expect(messages(input(["entecavir"], { History: ["prepregnant weight 60kg"] }))).toEqual([]);
  });

  it("reads the IPD order sheet's field labels too", () => {
    // IPD spells them "Diagnosis" / "Sign" / "Symptoms"; OPD uses
    // "Provisional diagnosis" / "Chief complaints". Both must work.
    expect(messages(input(["entecavir"], { Diagnosis: ["Chronic hepatitis B, pregnancy"] }))).toEqual([PREGNANCY_MSG]);
    expect(messages(input(["entecavir"], { Sign: ["Pregnant, 12 weeks"] }))).toEqual([PREGNANCY_MSG]);
    expect(messages(input(["entecavir"], { Symptoms: ["Nausea, pregnancy"] }))).toEqual([PREGNANCY_MSG]);
    expect(messages(input(["entecavir"], { Plan: ["Continue, patient pregnant"] }))).toEqual([PREGNANCY_MSG]);
  });

  it("still reads admissions written before the ward sheet renamed the field", () => {
    // "Sign" was called "Chief Complaints" on the IPD sheet until 2026-08-15.
    // The stored key never changed, so old admissions must keep firing.
    expect(messages(input(["entecavir"], { "Chief Complaints": ["Pregnant, 12 weeks"] }))).toEqual([PREGNANCY_MSG]);
  });

  it("ignores fields that are not clinical conditions", () => {
    // Drug history and investigation findings are not condition fields.
    expect(messages(input(["entecavir"], { "Drug history": ["01/02/2026: Pregnacare — 1+0+1"] }))).toEqual([]);
  });

  it("fires on a brand-name ℞ via the generic carried from the medicines table", () => {
    // Doctors here prescribe by brand. The pad stores "Tablet. <Brand> 0.5mg";
    // only the generic picked alongside it names entecavir.
    const i: RxAlertInput = {
      rxDrugs: [{ text: "Tablet. Entaliv 0.5mg", generic: "Entecavir" }],
      sidebar: [{ label: "History", items: ["Pregnant"] }],
    };
    expect(messages(i)).toEqual([PREGNANCY_MSG]);
  });

  it("shows the brand the doctor actually wrote as the evidence", () => {
    const [alert] = findRxAlerts({
      rxDrugs: [{ text: "Tablet. Entaliv 0.5mg", generic: "Entecavir" }],
      sidebar: [{ label: "History", items: ["Pregnant"] }],
    });
    expect(alert.evidence[0]).toEqual({ field: "℞", text: "Tablet. Entaliv 0.5mg", rxIndex: 0 });
  });

  it("reports the evidence that made it fire", () => {
    const [alert] = findRxAlerts(input(["Tab. Entecavir 0.5mg"], { History: ["28wk Pregnant"] }));
    expect(alert.evidence).toEqual([
      { field: "℞", text: "Tab. Entecavir 0.5mg", rxIndex: 0 },
      { field: "History", text: "28wk Pregnant" },
    ]);
  });
});

// ⚕️ Rows 2 and 3 of the entecavir sheet (entecavir.xlsx, 2026-08-28). The
// CKD advice is a CrCl dosing TABLE: its four bands and two closing sentences
// are asserted line by line, because a line lost or re-flowed here is a wrong
// dose on a doctor's screen. Check the spreadsheet, never clinical memory,
// before editing one of these expectations.
describe("entecavir + CKD", () => {
  const ckd = () => findRxAlerts(input(["entecavir"], { "Final diagnosis": ["CKD"] }))[0];

  it("fires from the final diagnosis", () => {
    expect(ckd()).toBeTruthy();
  });

  it("opens by naming what has to be adjusted", () => {
    expect(ckd().message.split("\n")[0]).toBe("In case of CKD patient entecavir dose should be adjusted to CrCL.");
  });

  it("carries all four CrCl bands, each on its own line", () => {
    expect(ckd().message.split("\n").slice(1, 5)).toEqual([
      "CrCl at least 50 mL/min: 0.5 mg orally once a day",
      "CrCl 30 to less than 50 mL/min: 0.25 mg orally once a day or 0.5 mg orally every 48 hours",
      "CrCl 10 to less than 30 mL/min: 0.15 mg orally once a day or 0.5 mg orally every 72 hours",
      "CrCl less than 10 mL/min: 0.05 mg orally once a day or 0.5 mg orally every 7 days",
    ]);
  });

  it("keeps the doubling note and the alternative drug", () => {
    expect(ckd().message).toContain("In case of decompensated case above dose will be doubled to be used.");
    expect(ckd().message).toContain("Or you can switch to tenofovir alafenamide which is kidney friendly.");
  });

  it("reads the abbreviation written out in full", () => {
    expect(messages(input(["entecavir"], { "Final diagnosis": ["Chronic kidney disease, stage 3"] })))
      .toEqual([ckd().message]);
  });

  it("does not fire on a negation, or without the drug", () => {
    expect(messages(input(["entecavir"], { "Final diagnosis": ["No CKD"] }))).toEqual([]);
    expect(messages(input(["Tab. Napa 500mg"], { "Final diagnosis": ["CKD"] }))).toEqual([]);
  });
});

describe("entecavir + decompensated liver cirrhosis", () => {
  const DECOMP_MSG = "use entecavir -double of usual dose ";

  it("fires the sheet's own wording from the final diagnosis", () => {
    expect(messages(input(["entecavir"], { "Final diagnosis": ["Decompensated liver cirrhosis"] })))
      .toEqual([DECOMP_MSG]);
  });

  it("also reads it written without the word liver", () => {
    expect(messages(input(["entecavir"], { "Final diagnosis": ["Decompensated cirrhosis"] })))
      .toEqual([DECOMP_MSG]);
  });

  it("does not fire on a compensated cirrhosis, or on bare decompensation", () => {
    // "Decompensated" alone belongs to heart failure just as readily.
    expect(messages(input(["entecavir"], { "Final diagnosis": ["Liver cirrhosis, compensated"] }))).toEqual([]);
    expect(messages(input(["entecavir"], { "Final diagnosis": ["Decompensated heart failure"] }))).toEqual([]);
  });
});

describe("entecavir: more than one condition at once", () => {
  it("says the shared pregnancy/lactation sentence once for a lactating mother", () => {
    const alerts = findRxAlerts(input(["entecavir"], { "Final diagnosis": ["Pregnant", "Lactating mother"] }));
    expect(alerts.map((a) => a.message)).toEqual([PREGNANCY_MSG]);
  });

  it("gives a CKD patient in pregnancy both pieces of advice", () => {
    const msgs = messages(input(["entecavir"], { "Final diagnosis": ["Pregnant", "CKD"] }));
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toBe(PREGNANCY_MSG);
    expect(msgs[1]).toContain("CrCl at least 50 mL/min: 0.5 mg orally once a day");
  });

  it("attaches every one of them to the medicine line that raised them", () => {
    const i = input(["Tablet. Barcavir 0.5 mg"], { "Final diagnosis": ["CKD", "Decompensated liver cirrhosis"] });
    i.rxDrugs[0].generic = "Entecavir";
    expect(rxAlertsByLine(i).get(0)).toHaveLength(2);
  });
});

describe("sofosbuvir/velpatasvir co-prescribing", () => {
  it("warns at 4 hours for every proton pump inhibitor on the sheet", () => {
    for (const ppi of ["Omeprazole", "Esomeprazole", "Lansoprazole", "Dexlansoprazole", "Pantoprazole", "Rabeprazole"]) {
      expect(messages(input(["Sofosbuvir + Velpatasvir", `Tab. ${ppi} 20mg`]))).toEqual([PPI_MSG]);
    }
  });

  it("warns at 12 hours for every H2 blocker on the sheet", () => {
    for (const h2 of ["Famotidine", "Cimetidine", "Ranitidine"]) {
      expect(messages(input(["Sofosbuvir + Velpatasvir", `Tab. ${h2} 20mg`]))).toEqual([H2_MSG]);
    }
  });

  it("says each sentence once and names every drug that triggered it", () => {
    const alerts = findRxAlerts(input(["Velpatasvir/Sofosbuvir", "Tab. Omeprazole 20mg", "Tab. Pantoprazole 40mg"]));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].evidence.map((e) => e.text)).toEqual([
      "Velpatasvir/Sofosbuvir",
      "Tab. Omeprazole 20mg",
      "Tab. Pantoprazole 40mg",
    ]);
  });

  it("raises both sentences when a PPI and an H2 blocker are on the same sheet", () => {
    expect(messages(input(["Velpatasvir", "Omeprazole", "Famotidine"])).sort()).toEqual([PPI_MSG, H2_MSG].sort());
  });

  it("does not fire on sofosbuvir without velpatasvir", () => {
    // Sofosbuvir also ships with ledipasvir and daclatasvir; this advice names
    // the velpatasvir combination, so it must not be shown for those.
    expect(messages(input(["Sofosbuvir + Ledipasvir", "Tab. Omeprazole 20mg"]))).toEqual([]);
  });

  it("does not fire on either drug alone", () => {
    expect(messages(input(["Sofosbuvir + Velpatasvir"]))).toEqual([]);
    expect(messages(input(["Tab. Omeprazole 20mg"]))).toEqual([]);
  });

  it("fires when the patient is already on the PPI and the antiviral is added today", () => {
    // The real-world case: Omeprazole is an existing current medication, the
    // doctor adds Sofosbuvir/Velpatasvir at this visit.
    const alerts = findRxAlerts({
      rxDrugs: [{ text: "Sofosbuvir + Velpatasvir" }],
      sidebar: [],
      drugHistory: { entries: ["12/07/2026: Omeprazole — 1+0+1 — before food — 1 month"], visitDate: "12/07/2026" },
    });
    expect(alerts.map((a) => a.message)).toEqual([PPI_MSG]);
    expect(alerts[0].evidence).toEqual([
      { field: "℞", text: "Sofosbuvir + Velpatasvir", rxIndex: 0 },
      { field: "Drug history", text: "Omeprazole" },
    ]);
  });

  it("ignores a drug stopped at an earlier visit", () => {
    expect(
      messages({
        rxDrugs: [{ text: "Sofosbuvir + Velpatasvir" }],
        sidebar: [],
        drugHistory: { entries: ["03/01/2024: Omeprazole — 1+0+1 — before food — 1 month"], visitDate: "12/07/2026" },
      }),
    ).toEqual([]);
  });

  it("stays silent when neither drug is on today's prescription", () => {
    // Both already current: nothing changed this visit, so repeating the
    // advice every time the patient is opened would be pure noise.
    expect(
      messages({
        rxDrugs: [],
        sidebar: [],
        drugHistory: {
          entries: [
            "12/07/2026: Velpatasvir — 1+0+0 — after food — 12 weeks",
            "12/07/2026: Omeprazole — 1+0+1 — before food — 1 month",
          ],
          visitDate: "12/07/2026",
        },
      }),
    ).toEqual([]);
  });

  it("ignores free-typed note lines", () => {
    const i: RxAlertInput = {
      rxDrugs: [{ text: "Velpatasvir" }],
      sidebar: [],
    };
    // A note mentioning omeprazole is not a prescribed medicine, and
    // PrescriptionView filters notes out before calling this.
    expect(messages(i)).toEqual([]);
  });
});

// ⚕️ These values are typed `string` but arrive from JSON columns and drafts
// written by older builds, cast rather than validated. This matcher renders
// inside the prescription editor, so a throw here does not lose an alert — it
// blanks the whole screen a doctor prescribes through. Every case below must
// return a result, and must ADMIT what it could not read.
describe("malformed stored data", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const check = (i: unknown) => checkRxAlerts(i as any);

  const malformed: [string, unknown][] = [
    ["rxDrugs missing", { sidebar: [] }],
    ["rxDrugs not an array", { rxDrugs: "entecavir", sidebar: [] }],
    ["an rx line that is null", { rxDrugs: [null], sidebar: [] }],
    ["an rx line with no drug text", { rxDrugs: [{ dose: "1+0+1" }], sidebar: [] }],
    ["an rx line whose drug text is null", { rxDrugs: [{ text: null }], sidebar: [] }],
    ["a non-string generic", { rxDrugs: [{ text: "entecavir", generic: 5 }], sidebar: [] }],
    ["sidebar missing", { rxDrugs: [{ text: "entecavir" }] }],
    ["a sidebar field that is null", { rxDrugs: [{ text: "entecavir" }], sidebar: [null] }],
    ["a sidebar field with no label", { rxDrugs: [{ text: "entecavir" }], sidebar: [{ items: ["Pregnant"] }] }],
    ["sidebar items missing", { rxDrugs: [{ text: "entecavir" }], sidebar: [{ label: "History" }] }],
    ["a null sidebar entry", { rxDrugs: [{ text: "entecavir" }], sidebar: [{ label: "History", items: [null] }] }],
    ["drugHistory entries null", { rxDrugs: [{ text: "velpatasvir" }], sidebar: [], drugHistory: { entries: null, visitDate: "01/08/2026" } }],
    ["a null drug-history entry", { rxDrugs: [{ text: "velpatasvir" }], sidebar: [], drugHistory: { entries: [null], visitDate: "01/08/2026" } }],
    ["a missing visit date", { rxDrugs: [{ text: "velpatasvir" }], sidebar: [], drugHistory: { entries: ["01/08/2026: Omeprazole — 1+0+1"] } }],
    ["an entirely empty input", {}],
  ];

  for (const [label, input] of malformed) {
    it(`survives ${label}`, () => {
      expect(() => check(input)).not.toThrow();
      expect(Array.isArray(check(input).alerts)).toBe(true);
    });
  }

  it("counts what it could not read so the banner can say the check was partial", () => {
    // A silent empty result would read as "no contraindication found" — the one
    // wrong message a prescribing alert must never send.
    expect(check({ rxDrugs: [{ text: null }], sidebar: [] }).unreadable).toBe(1);
    expect(check({ rxDrugs: [], sidebar: [{ label: "History", items: [null, "Pregnant", 7] }] }).unreadable).toBe(2);
    expect(check({ rxDrugs: [], sidebar: [], drugHistory: { entries: [null], visitDate: "01/08/2026" } }).unreadable).toBe(1);
  });

  it("reports nothing unreadable for well-formed data", () => {
    expect(check(input(["entecavir"], { History: ["Pregnant"] })).unreadable).toBe(0);
    expect(check({ rxDrugs: [], sidebar: [] }).unreadable).toBe(0);
  });

  it("still fires on the readable rows beside a broken one", () => {
    // One unreadable line must not cost the patient the rest of the check.
    const out = check({
      rxDrugs: [{ text: null }, { text: "Tab. Entecavir 0.5mg" }],
      sidebar: [{ label: "History", items: [null, "Pregnant"] }],
    });
    expect(out.alerts.map((a) => a.message)).toEqual([PREGNANCY_MSG]);
    expect(out.unreadable).toBe(2);
  });

  it("matches through the generic when the brand text is unreadable", () => {
    // Both halves of a line are read independently, so a broken brand string
    // does not hide a drug the medicines table already named.
    const out = check({
      rxDrugs: [{ text: null, generic: "Entecavir" }],
      sidebar: [{ label: "History", items: ["Pregnant"] }],
    });
    expect(out.alerts.map((a) => a.message)).toEqual([PREGNANCY_MSG]);
    expect(out.unreadable).toBe(1);
  });
});
