// Read-only summary of a patient's symptom (chief complaint) history for the
// Health trends chart. There is no independent date field for a complaint —
// confirmed the Prescription model has no ptDate column — so a mention's
// date is that visit's Prescription.createdAt. Only chiefComplaints is used:
// previousComplaints is a separately-encoded doctor-typed history field
// (lib/previousComplaints.ts), not a reliable "still active" signal.

export interface SymptomMentionRange { name: string; start: string; end: string } // start/end: ISO (createdAt)

interface PrescriptionLike { chiefComplaints?: string[]; createdAt: string }

// Groups by exact, trimmed complaint text (no fuzzy/case-insensitive
// matching — this is doctor-typed free text, not a controlled vocabulary,
// so "Abdominal pain" and "abdominal pain" stay separate tracks rather than
// being silently merged).
export function symptomMentionRanges(prescriptions: PrescriptionLike[]): SymptomMentionRange[] {
  const map = new Map<string, { start: string; end: string }>();
  for (const p of prescriptions) {
    for (const raw of p.chiefComplaints ?? []) {
      const name = raw.trim();
      if (!name) continue;
      const cur = map.get(name);
      if (!cur) { map.set(name, { start: p.createdAt, end: p.createdAt }); continue; }
      if (new Date(p.createdAt).getTime() < new Date(cur.start).getTime()) cur.start = p.createdAt;
      if (new Date(p.createdAt).getTime() > new Date(cur.end).getTime()) cur.end = p.createdAt;
    }
  }
  return Array.from(map.entries()).map(([name, r]) => ({ name, ...r }));
}
