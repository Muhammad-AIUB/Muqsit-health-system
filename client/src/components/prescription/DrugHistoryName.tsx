"use client";

import { C, font } from "@/theme";
import { btnSecondary } from "@/theme/styles";
import { GENERIC_NOT_FOUND, GENERIC_SEVERAL, GENERICS_NOT_LOADED, type GenericAnswer } from "@/lib/drugHistoryGeneric";
import type { DrugHistoryGenerics } from "@/hooks/useDrugHistoryGenerics";

/** What a Drug-history row shows for its medicine: the generic, else the entry as stored. */
export function shownName(label: string, answer: GenericAnswer | null): string {
  return answer?.kind === "generic" ? answer.shown : label;
}

/**
 * ⚕️ A Drug-history medicine's name as it is READ (physician, 02/11/2026): the
 * generic where the medicine chart gives exactly one; otherwise the entry as
 * stored, with a quiet note saying why — never hidden, never guessed. While
 * the chart is still being asked, or could not be reached, the stored entry is
 * shown with no note (the list says the lookup failed, once, above it).
 */
export default function DrugHistoryName({ label, answer }: { label: string; answer: GenericAnswer | null }) {
  const note = answer?.kind === "none" ? GENERIC_NOT_FOUND : answer?.kind === "several" ? GENERIC_SEVERAL : null;
  return (
    <>
      {shownName(label, answer)}
      {note ? <span data-generic-note style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 400, color: C.n[500] }}>({note})</span> : null}
    </>
  );
}

/** Said once above a list whose generics could not be loaded, with Try again. */
export function GenericsNotLoaded({ g }: { g: DrugHistoryGenerics }) {
  if (g.state !== "failed") return null;
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11.5, color: C.n[600], padding: "6px 0", fontFamily: font }}>
      <span>{GENERICS_NOT_LOADED}</span>
      <button type="button" onClick={g.retry} disabled={g.retrying} style={btnSecondary("sm")}>{g.retrying ? "Trying again…" : "Try again"}</button>
    </div>
  );
}
