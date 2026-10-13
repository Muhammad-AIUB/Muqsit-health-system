"use client";

import { useEffect, useMemo, useState } from "react";
import { C, font } from "@/theme";
import { btnClose, btnDisabled, btnPrimary, btnSecondary, dialogTitle, inputSm, scrim, shadowDialog } from "@/theme/styles";
import { useDialog } from "@/lib/useDialog";
import { ApiError } from "@/lib/api";
import { Loading, LoadError } from "@/components/common/ListState";
import EmptyState from "@/components/common/EmptyState";
import { moveSummary } from "@/lib/drugHistorySelect";
import { splitDrugLabel } from "@/lib/rxShorthand";
import { useBulkMedicines } from "@/hooks/useBulkMedicines";
import {
  bulkToRxItems, instructionOf, patientsLabel, searchBulk, sortBulk,
  type BulkList, type BulkMedicine, type BulkOrder,
} from "@/lib/bulkMedicines";
import type { RxItem } from "@/types";

// "Add Bulk Medicine" (physician's request, 2026-10-13): the doctor's own
// medicines, each with the instruction they most often write for it, ticked
// and added to the ℞ pad in one press.
//
// ⚕️ The box only ever ADDS, and only what is ticked. It fills in nothing — a
// cell the doctor left blank when prescribing is added blank — and it edits
// nothing: another dose is changed on the pad. What it shows comes from
// `lib/bulkMedicines.ts`, which has already read the server's response as
// unknown; this component holds only the ticks, the order and the search.

/** The part of a React Query result the box reads. */
export interface BulkListState {
  data?: BulkList;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  isFetching?: boolean;
  refetch: () => unknown;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** What the ℞ pad holds when Add is pressed: a line already there is skipped. */
  existing: RxItem[];
  list: BulkListState;
  /** The lines to append to the pad, and the sentence that says what happened. */
  onAdd: (items: RxItem[], summary: string) => void;
}

// The line under "could not be loaded". A refusal is worded by the server for
// a person and is shown; its own words for a crash ("Internal server error")
// are not. No answer at all leaves `LoadError` its own line about the
// connection — which is not what failed when the server did answer.
const reasonOf = (error: unknown): string | undefined => {
  if (!(error instanceof ApiError)) return undefined;
  return error.status >= 500 ? "The server could not answer. Please try again in a moment." : error.message;
};

const NONE: BulkMedicine[] = [];
const ORDERS: { key: BulkOrder; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "alphabetical", label: "Alphabetical" },
];

export default function BulkMedicineModal({ open, onClose, existing, list, onAdd }: Props) {
  const [order, setOrder] = useState<BulkOrder>("popular");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState("");
  const dialog = useDialog(open, onClose);

  // Every opening starts clean: a tick left from the last one is not a choice
  // made for this prescription.
  useEffect(() => {
    if (!open) return;
    setOrder("popular");
    setSearch("");
    setPicked(new Set());
    setNote("");
  }, [open]);

  const all = list.data?.medicines ?? NONE;
  const sorted = useMemo(() => sortBulk(all, order), [all, order]);
  const shown = useMemo(() => searchBulk(sorted, search), [sorted, search]);

  if (!open) return null;

  // Counted over the whole list, in the order on screen — not over what a
  // search leaves in view: a tick on a row that is filtered out is still a
  // tick. And a tick whose row is no longer in the list is not one.
  const chosen = sorted.filter((m) => picked.has(m.id));
  const count = chosen.length;

  const toggle = (id: string) => {
    setNote("");
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const add = () => {
    if (count === 0) return;
    const { items, added, skipped } = bulkToRxItems(chosen, existing);
    if (added === 0) {
      // Nothing to hand over: closing now would look as if it had worked.
      setNote(count === 1
        ? "That medicine is already on ℞ with the same instruction — nothing was added."
        : "Those medicines are already on ℞ with the same instructions — nothing was added.");
      return;
    }
    onAdd(items, moveSummary(added, skipped));
    onClose();
  };

  const row = (m: BulkMedicine) => {
    const on = picked.has(m.id);
    const { before, name, after } = splitDrugLabel(m.drugLabel);
    // The strength, apart from the space before it. Drawn as one piece: a long
    // name wraps, and wrapped anywhere a combination's strength turned in its
    // middle — "… 10" at a line's end and "mg+40 mg+25 mg" on the next. As a
    // piece it goes to the next line whole (and wraps inside itself only if it
    // is longer than a whole line). The text is the label's, unchanged.
    const strength = after.trimStart();
    const gap = after.slice(0, after.length - strength.length);
    const line = instructionOf(m);
    return (
      <label key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 20px", cursor: "pointer", borderBottom: `0.5px solid ${C.n[200]}`, background: on ? C.pri[50] : "transparent" }}>
        <input type="checkbox" checked={on} onChange={() => toggle(m.id)} style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          {/* Only the brand in bold, as on the pad and the printed sheet. */}
          <span data-name style={{ display: "block", fontSize: 13, color: C.n[900], overflowWrap: "anywhere" }}>
            {name ? (
              <>{before}<b>{name}</b>{gap}{strength && <span data-strength style={{ display: "inline-block", maxWidth: "100%" }}>{strength}</span>}</>
            ) : <b>{m.drugLabel}</b>}
          </span>
          {/* A blank cell is simply absent. A medicine saved with nothing
              beside it says so: it will be added with nothing beside it. */}
          <span style={{ display: "block", fontSize: 12, color: line ? C.n[700] : C.n[500], marginTop: 2, overflowWrap: "anywhere" }}>
            {line || "No dose recorded"}
          </span>
          {m.contLines.map((c, i) => (
            <span key={i} style={{ display: "block", fontSize: 12, color: C.n[700], marginTop: 1, overflowWrap: "anywhere" }}>↳ {instructionOf(c)}</span>
          ))}
        </span>
        <span style={{ flexShrink: 0, fontSize: 11, color: C.n[500], whiteSpace: "nowrap", marginTop: 2 }}>{patientsLabel(m.patientCount)}</span>
      </label>
    );
  };

  const notes: string[] = [];
  if (list.data?.truncated) notes.push("Showing your 2,000 most used medicines.");
  const unreadable = list.data?.unreadable ?? 0;
  if (unreadable > 0) notes.push(`${unreadable} ${unreadable === 1 ? "medicine" : "medicines"} could not be read and ${unreadable === 1 ? "is" : "are"} not listed.`);

  // A failure is said even when an older list is still held: "could not be
  // loaded" must never be drawn as "No medicines yet".
  const failed = list.isError && all.length === 0;

  return (
    // The veil's padding is the box's margin: no `vh` / `vw` under the page zoom.
    <div style={{ position: "fixed", inset: 0, padding: 16, background: scrim, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add Bulk Medicine" {...dialog} onClick={(e) => e.stopPropagation()}
        style={{ width: "min(640px, 100%)", maxWidth: "100%", height: 620, maxHeight: "100%", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: shadowDialog, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: font }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "16px 20px 12px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...dialogTitle }}>Add Bulk Medicine</div>
            <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Medicines you have prescribed before, each with the instruction you most often write. Tick, then Add.</div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={btnClose}>×</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "0 20px 12px", borderBottom: `0.5px solid ${C.n[200]}` }}>
          <div role="group" aria-label="Order" style={{ display: "inline-flex", border: `1px solid ${C.n[300]}`, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
            {ORDERS.map((o, i) => (
              <button key={o.key} type="button" aria-pressed={order === o.key} onClick={() => setOrder(o.key)}
                style={{ padding: "6px 14px", border: "none", borderLeft: i ? `1px solid ${C.n[300]}` : "none", background: order === o.key ? C.pri[50] : C.n[0], color: order === o.key ? C.pri[600] : C.n[600], fontSize: 12, fontWeight: order === o.key ? 600 : 400, cursor: "pointer", fontFamily: font }}>
                {o.label}
              </button>
            ))}
          </div>
          <input aria-label="Search medicines" placeholder="Search medicines…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // Escape with something typed clears the search and nothing else:
              // the same key closes the box, and the ticks with it.
              if (e.key === "Escape" && search) { e.preventDefault(); setSearch(""); }
            }}
            style={{ ...inputSm, flex: "1 1 160px", width: "auto", minWidth: 0 }} />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {notes.map((n) => (
            <div key={n} style={{ padding: "8px 20px", fontSize: 11.5, color: C.n[700], background: C.n[50], borderBottom: `0.5px solid ${C.n[200]}` }}>{n}</div>
          ))}
          {list.isLoading ? (
            <Loading label="Loading your medicines…" />
          ) : failed ? (
            <LoadError title="Your medicines could not be loaded." detail={reasonOf(list.error)} onRetry={() => list.refetch()} retrying={list.isFetching} />
          ) : all.length === 0 ? (
            <EmptyState icon="fileText" title="No medicines yet" hint="They appear here after you save prescriptions." />
          ) : shown.length === 0 ? (
            <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 12.5, color: C.n[600] }}>No medicine matches “{search.trim()}”.</div>
          ) : (
            shown.map(row)
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50], flexWrap: "wrap" }}>
          <span aria-live="polite" style={{ fontSize: 11.5, color: note ? C.n[900] : C.n[600], fontWeight: note ? 500 : 400, flex: "1 1 160px", minWidth: 0 }}>
            {note || (count ? `${count} selected` : "Tick the medicines to add.")}
          </span>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button type="button" onClick={onClose} style={btnSecondary("md")}>Cancel</button>
            <button type="button" onClick={add} disabled={count === 0}
              title={count === 0 ? "Tick a medicine first" : "Add the ticked medicines to this prescription"}
              style={{ ...btnPrimary("md"), fontWeight: 600, ...(count ? null : { ...btnDisabled, cursor: "default" }) }}>
              Add{count ? ` (${count})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The box with its list. ⚕️ Mount it ONLY WHILE IT IS OPEN: the list is asked
 * for when this mounts (`useBulkMedicines`), so every opening shows what the
 * doctor has prescribed up to now.
 *
 * While the server is being asked — the first time, again after a failure, or
 * for another practice — the box says "Loading" and draws no rows, whatever is
 * still held from before. A list that is replaced by a newer one while it is
 * on screen re-sorts itself under the doctor's finger.
 */
export function BulkMedicineBox({ workstationId, onClose, existing, onAdd }: {
  /** Whose list: the practice being worked in, or null for the doctor's own. */
  workstationId: string | null;
  onClose: () => void;
  existing: RxItem[];
  onAdd: (items: RxItem[], summary: string) => void;
}) {
  const q = useBulkMedicines(workstationId);
  const list: BulkListState = {
    data: q.data, isLoading: q.isFetching, isError: q.isError, error: q.error, isFetching: q.isFetching, refetch: q.refetch,
  };
  return <BulkMedicineModal open onClose={onClose} existing={existing} list={list} onAdd={onAdd} />;
}
