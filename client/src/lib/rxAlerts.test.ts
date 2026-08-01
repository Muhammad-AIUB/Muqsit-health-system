import { describe, expect, it } from "vitest";
import { findRxAlerts, type RxAlertInput } from "./rxAlerts";

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
    // IPD spells them "Diagnosis" / "Chief Complaints"; OPD uses
    // "Provisional diagnosis" / "Chief complaints". Both must work.
    expect(messages(input(["entecavir"], { Diagnosis: ["Chronic hepatitis B, pregnancy"] }))).toEqual([PREGNANCY_MSG]);
    expect(messages(input(["entecavir"], { "Chief Complaints": ["Pregnant, 12 weeks"] }))).toEqual([PREGNANCY_MSG]);
    expect(messages(input(["entecavir"], { Plan: ["Continue, patient pregnant"] }))).toEqual([PREGNANCY_MSG]);
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
    expect(alert.evidence[0]).toEqual({ field: "℞", text: "Tablet. Entaliv 0.5mg" });
  });

  it("reports the evidence that made it fire", () => {
    const [alert] = findRxAlerts(input(["Tab. Entecavir 0.5mg"], { History: ["28wk Pregnant"] }));
    expect(alert.evidence).toEqual([
      { field: "℞", text: "Tab. Entecavir 0.5mg" },
      { field: "History", text: "28wk Pregnant" },
    ]);
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
      { field: "℞", text: "Sofosbuvir + Velpatasvir" },
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
