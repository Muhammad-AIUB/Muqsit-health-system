// Single source of truth for the assistant permission keys. Both the Manage
// Assistants editor (where a doctor grants them) and the in-app section gating
// (where they're enforced for an assistant) read from here — so changing this
// one list updates both. The client expects this list to evolve over time.

export interface Perm {
  key: string;
  label: string;
}
export interface PermGroup {
  group: string;
  perms: Perm[];
}

export const PERMISSION_GROUPS: PermGroup[] = [
  {
    group: "Prescription page",
    perms: [
      { key: "rx.chiefComplaints", label: "Chief complaints" },
      { key: "rx.history", label: "History" },
      { key: "rx.investigation", label: "Investigation report findings" },
      { key: "rx.drugHistory", label: "Drug history" },
      { key: "rx.onExamination", label: "On examination" },
      { key: "rx.note", label: "Note / plan" },
      { key: "rx.provisionalDiagnosis", label: "Provisional diagnosis" },
      { key: "rx.associatedIllness", label: "Associated illness" },
      { key: "rx.finalDiagnosis", label: "Final diagnosis" },
      { key: "rx.medicines", label: "Medicines (Rx)" },
      { key: "rx.advice", label: "Advice" },
      { key: "rx.adviceTest", label: "Advice — tests" },
      { key: "rx.followUp", label: "Follow-up" },
      { key: "rx.savePrint", label: "Save and print" },
    ],
  },
  {
    group: "Patient settings page",
    perms: [
      { key: "pt.info", label: "Patient information" },
      { key: "pt.doctors", label: "Supervising doctor list" },
      { key: "pt.family", label: "Family tree" },
      { key: "pt.security", label: "Security" },
    ],
  },
];

export const ALL_PERMS: Perm[] = PERMISSION_GROUPS.flatMap((g) => g.perms);
export const ALL_PERM_KEYS: string[] = ALL_PERMS.map((p) => p.key);
export const PERM_LABEL_OF = new Map(ALL_PERMS.map((p) => [p.key, p.label]));
// The prescription/section label → its permission key (for gating by label).
export const PERM_KEY_OF_LABEL = new Map(ALL_PERMS.map((p) => [p.label, p.key]));

// Always-granted to every assistant, regardless of the doctor's selection
// (e.g. OPD "Add new patient").
export const ALWAYS_ALLOWED: string[] = ["opd.addPatient"];
