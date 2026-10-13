"use client";

import { useBulkMedicines } from "@/hooks/useBulkMedicines";
import type { BulkList } from "@/lib/bulkMedicines";
import type { RxItem } from "@/types";
import BulkMedicineModal, { type BulkBoxState } from "./BulkMedicineModal";

/** The part of a React Query result the box is decided from. */
export interface BulkQuery {
  data: BulkList | undefined;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * Which of its three faces the box shows.
 *
 * ⚕️ The order of these lines is the rule. "No medicines yet" may be drawn only
 * for a list that is HERE — so each state in which nothing is here has to end
 * somewhere else:
 *   • a request on its way is "asking", whatever is still held from before. A
 *     list replaced by a newer one while it is on screen re-sorts itself under
 *     the doctor's finger, and the tick lands on the medicine that moved in;
 *   • a failure is "failed" even with an older list held: what could not be
 *     asked for again is not offered;
 *   • nothing here, nothing on its way and nothing failed — a request React
 *     Query is holding back — is still "asking", never an empty list.
 */
export function bulkBoxState(q: BulkQuery): BulkBoxState {
  if (q.isFetching) return { status: "asking" };
  if (q.isError) return { status: "failed", error: q.error, retry: () => { void q.refetch(); } };
  if (q.data !== undefined) return { status: "list", list: q.data };
  return { status: "asking" };
}

/**
 * The "Add Bulk Medicine" box with its list. ⚕️ Mount it ONLY WHILE IT IS OPEN:
 * the list is asked for when this mounts, so every opening shows what the
 * doctor has prescribed up to now.
 */
export default function BulkMedicineBox({ workstationId, onClose, existing, onAdd }: {
  /** Whose list: the practice being worked in, or null for the doctor's own. */
  workstationId: string | null;
  onClose: () => void;
  /** What the ℞ pad holds: a line already there is not added again. */
  existing: RxItem[];
  /** The lines to append to the pad, and the sentence that says what happened. */
  onAdd: (items: RxItem[], summary: string) => void;
}) {
  const state = bulkBoxState(useBulkMedicines(workstationId));
  return <BulkMedicineModal state={state} onClose={onClose} existing={existing} onAdd={onAdd} />;
}
