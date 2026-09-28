import { describe, it, expect } from "vitest";
import { patientToPtInfo, ptInfoToInput } from "@/lib/patientForm";
import type { Patient } from "@/lib/api";

// A patient record with nothing optional recorded, as the API returns it.
const bare = (over: Partial<Patient> = {}): Patient =>
  ({
    id: "p1", name: "Patient", hospitalId: null, bloodGroup: null, dob: null, age: null, ageAsOfYear: null,
    sex: null, ethnicity: null, religion: null, mobile: null, nid: null, spouseMobile: null, relativeMobile: null,
    relativeRelation: null, district: null, fullAddress: null, monthlyIncome: null, pictureUrl: null, tags: [],
    ...over,
  }) as Patient;

describe("patientToPtInfo — never records what was not recorded", () => {
  // Saving Patient Settings writes the form back: a pre-filled default becomes
  // a fact on the patient's record that nobody ever entered.
  it("leaves an unrecorded religion blank, and a save writes nothing", () => {
    const form = patientToPtInfo(bare());
    expect(form.religion).toBe("");
    expect(ptInfoToInput(form).religion).toBeNull();
  });

  it("leaves an unrecorded sex blank", () => {
    expect(patientToPtInfo(bare()).sex).toBe("");
  });

  it("keeps a recorded religion", () => {
    expect(patientToPtInfo(bare({ religion: "Hinduism" })).religion).toBe("Hinduism");
  });
});
