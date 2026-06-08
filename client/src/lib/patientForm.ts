import type { Patient, PatientInput } from "@/lib/api";
import type { PtInfo } from "@/types";

// API Patient → Patient Settings form state.
export function patientToPtInfo(p: Patient): PtInfo {
  return {
    name: p.name ?? "",
    dob: p.dob ? p.dob.slice(0, 10) : "",
    age: p.age != null ? String(p.age) : "",
    sex: p.sex ?? "Male",
    ethnicity: p.ethnicity ?? "South Asian",
    religion: p.religion ?? "Islam",
    mobile: p.mobile ?? "",
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
  return {
    name: pi.name.trim(),
    dob: pi.dob || null,
    age: Number.isNaN(ageNum) ? null : ageNum,
    sex: pi.sex || null,
    ethnicity: pi.ethnicity || null,
    religion: pi.religion || null,
    mobile: pi.mobile || null,
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
