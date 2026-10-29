// Reception's marks on the OPD queue and what they make of a row (physician's
// sheet, 29/10/2026). Everything here is worked out when shown, never stored.

export type PadStage = "history" | "pending" | null;

export interface PresenceFields {
  status: string;
  rxStatus: string | null;
  presentAt: string | null;
  criticallyIll: boolean;
  urgent: boolean;
  padStage: PadStage;
}

export type RowTone = "danger" | "warn" | "ok" | null;
export type VisitStatus = "" | "Waiting" | "History taken" | "Prescription pending" | "Completed";

// Urgent over Critically ill over Present: all three can be ticked, only the
// colour takes the most pressing one.
export function rowTone(v: Pick<PresenceFields, "urgent" | "criticallyIll" | "presentAt">): RowTone {
  if (v.urgent) return "danger";
  if (v.criticallyIll) return "warn";
  return v.presentAt ? "ok" : null;
}

// Seen: Done pressed, or the prescription printed (Save & print marks it complete
// and leaves the visit waiting).
export const isCompleted = (v: Pick<PresenceFields, "status" | "rxStatus">): boolean =>
  v.status === "done" || v.rxStatus === "complete";

// The later stage wins. Empty before the patient is marked present and before
// the doctor has anything on the pad.
export function visitStatus(v: PresenceFields): VisitStatus {
  if (isCompleted(v)) return "Completed";
  if (v.padStage === "pending") return "Prescription pending";
  if (v.padStage === "history") return "History taken";
  return v.presentAt ? "Waiting" : "";
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

// `6.00pm`. Bangladesh is a fixed UTC+6, so the arithmetic is exact and no
// locale is asked (root CLAUDE.md: never toLocale… for a time).
export function presentClock(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const t = new Date(ms + DHAKA_OFFSET_MS);
  const h = t.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}.${String(t.getUTCMinutes()).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

export function queueCounts(rows: PresenceFields[]) {
  let present = 0, completed = 0, waiting = 0;
  for (const r of rows) {
    const done = isCompleted(r);
    if (r.presentAt) present += 1;
    if (done) completed += 1;
    if (r.presentAt && !done) waiting += 1;
  }
  return { total: rows.length, present, completed, waiting };
}
