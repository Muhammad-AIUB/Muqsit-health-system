import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateANC } from "./anc";
import { calculateBloodVolume } from "./blood-volume";
import { calculateCCI } from "./cci";
import { calculateIronDeficit } from "./iron-deficit";
import { calculatePlasmaDosage } from "./plasma-dosage";

// ⚕️ The same result must READ the same on every machine.
//
// Five calculators wrote their result with `toLocaleString()` and no locale,
// which follows the browser's own language. An absolute neutrophil count of
// 1500 is "1,500" in an English browser — and "1.500" in a German one, which an
// English-reading doctor takes for one and a half; "1 500" in French; "১,৫০০" in
// Bangla; "١٬٥٠٠" in Arabic. Nothing about the patient changed, only the laptop.
//
// What is pinned here is NOT a format of anyone's choosing: it is that the text
// every doctor has been reading on a US- or UK-English browser — and that the
// physician has been using — is what every browser now shows. The numbers
// themselves, the formulas and the wording are untouched. (Indian English is
// in the list below because it is the one English that differed: it groups
// 100,000 and over the lakh way.)

const real = Number.prototype.toLocaleString;

// A browser whose own language is `locale`: a number formatted WITHOUT naming a
// locale comes out in it. One that names its locale is left exactly as asked.
const browserSetTo = (locale: string) =>
  vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (
    this: number,
    locales?: Intl.LocalesArgument,
    options?: Intl.NumberFormatOptions,
  ) {
    return real.call(this, locales ?? locale, options);
  });

afterEach(() => { vi.restoreAllMocks(); });

const results = () => ({
  anc: calculateANC({ neutrophilsPct: 50, bandsPct: 0, wbcCount: 3 }).interpretation,
  ancLow: calculateANC({ neutrophilsPct: 40, bandsPct: 0, wbcCount: 2.6 }).interpretation,
  bloodVolume: calculateBloodVolume({ patientType: "adult", sex: "male", heightCm: 170, weightKg: 70, hematocrit: 45 }).interpretation,
  cciAdequate: calculateCCI({ prePlt: 10, postPlt: 40, timeHour: 1, heightCm: 170, weightKg: 70, unitContent: 3 }).interpretation,
  cciPoor: calculateCCI({ prePlt: 10, postPlt: 15, timeHour: 20, heightCm: 170, weightKg: 70, unitContent: 3 }).interpretation,
  ironDeficit: calculateIronDeficit({ weightKg: 70, targetHbGdl: 15, actualHbGdl: 8, ironStoresMg: 500 }).interpretation,
  plasma: calculatePlasmaDosage({ weightKg: 70, dosageMlKg: 15, unitVolumeMl: 250 }).interpretation,
});

describe("calculator results — the same text on every machine", () => {
  it("this runtime really does write a number differently by language (or the test proves nothing)", () => {
    expect(real.call(1500, "en-US")).toBe("1,500");
    expect(real.call(1500, "de-DE")).toBe("1.500");
    expect(real.call(1500, "bn-BD")).not.toBe("1,500");
  });

  it("every result checked here carries a number of a thousand or more", () => {
    for (const [name, text] of Object.entries(results())) {
      expect(text, name).toMatch(/\d,\d{3}/);
    }
  });

  it.each(["de-DE", "fr-FR", "bn-BD", "ar-EG", "en-IN"])("⚕️ a browser set to %s shows exactly what an English one shows", (locale) => {
    const english = results();
    browserSetTo(locale);
    expect(results()).toEqual(english);
  });

  it("⚕️ a neutrophil count of 1,500 can never be written 1.500", () => {
    browserSetTo("de-DE");
    const { anc, ancLow } = results();
    expect(anc).toContain("ANC 1,500 cells/µL");
    expect(anc).not.toContain("1.500");
    expect(ancLow).toContain("ANC 1,040 cells/µL");
  });

  it("the digits stay the ones the rest of the prescription is written in", () => {
    browserSetTo("bn-BD");
    for (const [name, text] of Object.entries(results())) {
      expect(text, name).not.toMatch(/[০-৯٠-٩]/);
    }
  });
});
