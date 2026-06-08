import type { HealthDrug, HealthSymptom, HealthTest } from "@/types";

export const ptHealthDrugs: HealthDrug[] = [
  { name: "Metformin 500mg",     start: "2026-01-01", end: "2026-05-17", color: "#60a5fa" },
  { name: "Amlodipine 5mg",      start: "2026-02-15", end: "2026-05-17", color: "#f472b6" },
  { name: "Paracetamol 500mg",   start: "2026-03-10", end: "2026-03-20", color: "#34d399" },
  { name: "Inj. Ceftriaxone 1g", start: "2026-04-09", end: "2026-04-16", color: "#fb923c" },
  { name: "Inj. Nalbupine SOS",  start: "2026-05-15", end: "2026-05-16", color: "#a78bfa" },
];

export const ptHealthSymptoms: HealthSymptom[] = [
  { name: "Fever",     color: "#f87171", data: [{ d: "2026-03-10", v: 3 }, { d: "2026-03-12", v: 4 }, { d: "2026-03-15", v: 2 }, { d: "2026-04-09", v: 3 }, { d: "2026-04-11", v: 4 }, { d: "2026-05-15", v: 4 }] },
  { name: "RUQ Pain",  color: "#fb923c", data: [{ d: "2026-05-15", v: 5 }, { d: "2026-05-16", v: 2 }] },
  { name: "Cough",     color: "#38bdf8", data: [{ d: "2026-03-10", v: 2 }, { d: "2026-03-15", v: 3 }, { d: "2026-03-18", v: 1 }] },
  { name: "Nausea",    color: "#a3e635", data: [{ d: "2026-04-09", v: 2 }, { d: "2026-04-10", v: 3 }] },
  { name: "Headache",  color: "#c084fc", data: [{ d: "2026-03-12", v: 2 }, { d: "2026-04-09", v: 2 }] },
];

export const ptHealthTests: HealthTest[] = [
  { name: "WBC",           unit: "×10³/μL", normal: [4, 11],  color: "#0ea5e9", data: [{ d: "2026-03-10", v: 11.2 }, { d: "2026-04-09", v: 13.4 }, { d: "2026-05-16", v: 8.1  }] },
  { name: "Haemoglobin",   unit: "g/dL",    normal: [12, 16], color: "#ec4899", data: [{ d: "2026-03-10", v: 11.8 }, { d: "2026-04-09", v: 10.2 }, { d: "2026-05-16", v: 12.1 }] },
  { name: "Blood Glucose", unit: "mmol/L",  normal: [4, 7],   color: "#f59e0b", data: [{ d: "2026-03-10", v: 7.2  }, { d: "2026-04-09", v: 8.1  }, { d: "2026-05-16", v: 6.8  }] },
  { name: "CBD Width",     unit: "mm",      normal: [0, 8],   color: "#6366f1", data: [{ d: "2026-05-16", v: 14   }] },
  { name: "CRP",           unit: "mg/L",    normal: [0, 10],  color: "#ef4444", data: [{ d: "2026-03-10", v: 18   }, { d: "2026-04-09", v: 42   }, { d: "2026-05-16", v: 12   }] },
];
