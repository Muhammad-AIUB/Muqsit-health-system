// The printed OPD queue (physician's sheet, 28/10/2026, "Print Queue").
//
// ⚕️ A sheet that is handed to reception: it shows exactly what the queue holds.
// A value that is not recorded is a dash — never a guess — and a name is never
// cut to fit. The appointment time is the one the screen shows, worked out from
// the day's SAVED schedule by the caller; with none it is a dash.
//
// Like prescriptionDoc.ts it imports no theme: it is a printed page in a frame of
// its own, the same in both modes, and its colours are plain greys.

import { dayLabel } from "@/lib/opdDay";
import { clockText } from "@/lib/opdSchedule";
import { PRINT_FONT } from "@/lib/prescriptionDoc";
import { sexLabel } from "@/lib/sex";

export interface QueueDocRow { name: string; phone: string | null; age: number | null; gender: string | null }

export interface QueueDocInput {
  /** The practice's doctor. "" prints no name line. */
  doctorName: string;
  /** The queue day, yyyy-mm-dd. */
  day: string;
  /** In serial order. */
  rows: QueueDocRow[];
  /** Minutes since midnight, by row index; shorter than `rows` (or empty) = no time. */
  times: (number | undefined)[];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const DASH = "—";

export function buildQueueDoc({ doctorName, day, rows, times }: QueueDocInput): string {
  const body = rows
    .map((r, i) => {
      const t = times[i];
      const cells = [
        String(i + 1),
        r.name.trim() || DASH,
        sexLabel(r.gender),
        r.age == null ? DASH : `${r.age}y`,
        r.phone?.trim() || DASH,
        t === undefined ? DASH : clockText(t),
      ];
      return `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
    })
    .join("");

  const name = doctorName.trim();
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>OPD queue ${esc(dayLabel(day))}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: ${PRINT_FONT}; color: #1a1a1a; margin: 0; padding: 14mm; background: #fff; font-size: 13px; }
  header { margin-bottom: 14px; }
  .doctor { font-size: 18px; font-weight: 700; }
  .meta { margin-top: 4px; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 12px; border-bottom: 1.5px solid #1a1a1a; padding: 6px 8px; }
  th { white-space: nowrap; }
  td { padding: 6px 8px; border-bottom: 0.5px solid #bbb; vertical-align: top; overflow-wrap: anywhere; }
  /* Only the name may wrap. Gender, age, mobile and time stay on one line: with the
     name taking the spare width, "Female" printed as "Femal / e" and a number the
     reception dials was split in two (browser pass, 30/10/2026). */
  td:nth-child(n+3) { white-space: nowrap; overflow-wrap: normal; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  td:first-child, th:first-child { width: 48px; }
  @media print { body { padding: 0; } }
</style></head><body>
<header>
${name ? `<div class="doctor" data-doctor>${esc(name)}</div>` : ""}
<div class="meta">OPD queue · ${esc(dayLabel(day))} · Total patients: ${rows.length}</div>
</header>
<table>
<thead><tr><th>Serial</th><th>Name</th><th>Gender</th><th>Age</th><th>Mobile</th><th>Appointment time</th></tr></thead>
<tbody>${body}</tbody>
</table>
</body></html>`;
}
