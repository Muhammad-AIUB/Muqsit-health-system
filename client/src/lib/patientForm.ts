import type { Patient, PatientInput } from "@/lib/api";
import type { PtInfo } from "@/types";
import { displayAge } from "@/lib/age";

// API Patient → Patient Settings form state.
export function patientToPtInfo(p: Patient): PtInfo {
  return {
    name: p.name ?? "",
    hospitalId: p.hospitalId ?? "",
    bloodGroup: p.bloodGroup ?? "",
    dob: p.dob ? p.dob.slice(0, 10) : "",
    // Show the auto-incremented age (DOB-based, or base age + years elapsed) so
    // the form matches the header. Saving then re-bases it to the current year.
    age: displayAge(p),
    sex: p.sex ?? "Male",
    ethnicity: p.ethnicity ?? "",
    religion: p.religion ?? "Islam",
    mobile: p.mobile ?? "",
    nid: p.nid ?? "",
    spouseMobile: p.spouseMobile ?? "",
    relativeMobile: p.relativeMobile ?? "",
    relativeRelation: p.relativeRelation ?? "",
    district: p.district ?? "",
    fullAddress: p.fullAddress ?? "",
    monthlyIncome: p.monthlyIncome ?? "",
    picture: p.pictureUrl ?? null,
    tags: p.tags ?? [],
  };
}

// Patient Settings form state → API create/update payload.
export function ptInfoToInput(pi: PtInfo): PatientInput {
  const ageNum = pi.age ? parseInt(pi.age, 10) : NaN;
  const hasManualAge = !pi.dob && !Number.isNaN(ageNum);
  return {
    name: pi.name.trim(),
    hospitalId: pi.hospitalId.trim() || null,
    bloodGroup: pi.bloodGroup || null,
    dob: pi.dob || null,
    age: Number.isNaN(ageNum) ? null : ageNum,
    // Stamp the current year as the base for a manually-typed age so it ticks up
    // each year. DOB-driven age needs no base (cleared to null).
    ageAsOfYear: hasManualAge ? new Date().getFullYear() : null,
    sex: pi.sex || null,
    ethnicity: pi.ethnicity || null,
    religion: pi.religion || null,
    mobile: pi.mobile || null,
    nid: pi.nid || null,
    spouseMobile: pi.spouseMobile || null,
    relativeMobile: pi.relativeMobile || null,
    relativeRelation: pi.relativeRelation || null,
    district: pi.district || null,
    fullAddress: pi.fullAddress || null,
    monthlyIncome: pi.monthlyIncome || null,
    pictureUrl: pi.picture || null,
    tags: pi.tags || [],
  };
}
