"use client";

import { useState } from "react";
import { C, font } from "@/theme";
import BulkMedicineBox from "@/components/prescription/BulkMedicineBox";
import type { RxItem } from "@/types";

// The + beside the ℞ mark of the OPD pad: "Add Bulk Medicine". It opens the
// doctor's own medicines, hands the ticked ones to the pad, and says beside
// itself what was added.
//
// ⚕️ THE BOX IS ONE PATIENT'S. It is opened over the pad of the patient in the
// editor, and the editor can move on underneath it: another device picks the
// next patient (device mirroring), or a patient chosen from the OPD queue
// finishes loading. Add would then put the medicines ticked for one patient on
// the next one's prescription. So when the patient changes the box closes —
// in the same render, not an effect later — and what the last Add said goes
// with it. It does not come back if the editor returns to the first patient.
//
// Patients are told apart by their id, so two pads with no id look alike. That
// is safe only because the editor cannot be written in until a patient with an
// id is chosen (`PatientGate`); a caller that shows this over a pad with no
// patient id would need another signal.

interface Props {
  /** The patient whose pad this is; null while the editor holds none. */
  patientId: string | null;
  /** Whose medicines: the practice being worked in, or null for the doctor's own. */
  workstationId: string | null;
  /** May this user write on the ℞ pad (`rx.medicines`)? */
  allowed: boolean;
  /** What the pad holds now: a line already there is not added again. */
  existing: RxItem[];
  /** Append these lines after the pad's last one. */
  onAppend: (items: RxItem[]) => void;
}

const NO_ACCESS = "View only — you don't have access to edit medicines";

export default function BulkMedicineButton({ patientId, workstationId, allowed, existing, onAppend }: Props) {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState("");

  // Reset while rendering (not in an effect): React throws this render away
  // and starts again before anything is drawn, so the box is never on screen
  // over a pad it was not opened for.
  const [seen, setSeen] = useState(patientId);
  if (seen !== patientId) {
    setSeen(patientId);
    setOpen(false);
    setSaid("");
  }
  // The same for a permission taken away while the box is open.
  if (open && !allowed) setOpen(false);

  return (
    <>
      {/* Without the pad's own key the + is greyed, never hidden — and still a
          Tab stop (`aria-disabled`, not `disabled`), so that the reason can be
          reached from the keyboard and is read out with its name. */}
      <button
        type="button"
        className="hit-area"
        aria-label={allowed ? "Add Bulk Medicine" : `Add Bulk Medicine. ${NO_ACCESS}`}
        aria-disabled={!allowed}
        title={allowed ? "Add Bulk Medicine" : NO_ACCESS}
        onClick={() => { if (!allowed) return; setSaid(""); setOpen(true); }}
        // Add hands the focus back here, and Enter still held down from
        // pressing Add would press this again and again: the box back open over
        // the lines just added, and what was said about them wiped. A key that
        // is being HELD presses nothing; a fresh press does.
        onKeyDown={(e) => { if (e.repeat && (e.key === "Enter" || e.key === " ")) e.preventDefault(); }}
        onMouseEnter={(e) => { if (allowed) { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; } }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.n[300]; }}
        style={{ width: 20, height: 20, padding: 0, borderRadius: "50%", border: `1px solid ${C.n[300]}`, background: "transparent", color: allowed ? C.pri[400] : C.n[400], fontSize: 14, lineHeight: 1, cursor: allowed ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: font }}
      >+</button>
      {/* What the last Add did, until the next press or the next patient.
          Something DONE, so in the colour of done (`C.ok`), not of the brand. */}
      <span role="status" aria-label="Add Bulk Medicine result" style={{ fontSize: 11, color: C.ok[600] }}>{said}</span>
      {/* Mounted only while open: every opening asks for the list again. */}
      {open && allowed && (
        <BulkMedicineBox
          workstationId={workstationId}
          onClose={() => setOpen(false)}
          existing={existing}
          onAdd={(items, summary) => {
            onAppend(items);
            setSaid(summary);
          }}
        />
      )}
    </>
  );
}
