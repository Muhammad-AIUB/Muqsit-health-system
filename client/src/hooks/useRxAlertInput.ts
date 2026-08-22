"use client";

import { useMemo } from "react";
import { useMuqsit } from "@/context/MuqsitContext";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import { buildRxAlertInput, type RxAlertInput } from "@/lib/rxAlerts";

/**
 * The one assembly of the prescribing-alert input, shared by every surface that
 * shows a warning: the banner in "Notifications, Chats & Reports" and the
 * per-line bubbles in the ℞ pad.
 *
 * ⚕️ ONE ASSEMBLY, ON PURPOSE. Two surfaces building this separately could
 * drift — a field added to one sidebar list and not the other, a different
 * visit date — and then a doctor would see a contraindication in one place and
 * not the other, with no way to tell which was right.
 *
 * This only ASSEMBLES; the matching runs inside the error boundaries in
 * `RxAlerts.tsx` / `RxLineAlert.tsx`. Doing it in a caller's `useMemo` would
 * put the computation outside the boundary, where no wrapper can catch it —
 * see client/CLAUDE.md.
 */
export function useRxAlertInput(): RxAlertInput {
  const { rxItems, leftFields, drugHistory, ptDate } = useMuqsit();
  return useMemo(
    () => buildRxAlertInput({ rxItems, leftFields, drugHistory, visitDate: isoToDdmmyyyy(ptDate) }),
    [rxItems, leftFields, drugHistory, ptDate],
  );
}
