import { describe, expect, it } from "vitest";
import { effectiveLayout } from "./chamberLayout";
import type { PrescriptionLayout } from "./api";

const doctor = { footerHtml: "Doctor's own" } as PrescriptionLayout;
const ibn = { footerHtml: "Ibn Sina, Kalyanpur" } as PrescriptionLayout;

describe("effectiveLayout — which settings the OPD sheet prints with", () => {
  it("the default chamber prints with the doctor's own settings", () => {
    expect(effectiveLayout(doctor, null, undefined)).toBe(doctor);
  });
  it("a chamber with its own settings prints with them", () => {
    expect(effectiveLayout(doctor, "ibn", { chamberId: "ibn", layout: ibn })).toBe(ibn);
  });
  it("a chamber with none falls back to the doctor's", () => {
    expect(effectiveLayout(doctor, "ibn", { chamberId: "ibn", layout: null })).toBe(doctor);
  });
  it("never uses another chamber's answer", () => {
    expect(effectiveLayout(doctor, "labaid", { chamberId: "ibn", layout: ibn })).toBe(doctor);
  });
  it("while the chamber's answer is on its way, the doctor's settings stand", () => {
    expect(effectiveLayout(doctor, "ibn", undefined)).toBe(doctor);
  });
});
