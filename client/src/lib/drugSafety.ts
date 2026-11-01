// ⚕️ "H/O drug hypersensitivity and High-Alert Medication" (physician's sheet,
// 31/10/2026): the words an entry is shown and printed with.
//
// The physician's own examples: "Hypersensitive to NAPA(Paracetamol)" and
// "high alert drug: NAPA(Paracetamol)" (written here "High-alert drug: …").
//  • The brand is written in capitals up to its first digit — a strength typed
//    into the name keeps the letters it was typed with (`NAPA 500 mg`, never
//    `NAPA 500 MG`).
//  • The generic is the medicines catalogue's, stored when the medicine was
//    picked from the list. A medicine typed and not picked has none, and is
//    shown by its brand alone. Nothing here guesses one.
//  • A written line ("Patient is hypersensitive to sulphar containing drug")
//    is shown exactly as typed.
// The server has a copy for its activity feed (server/src/patient-drug-safety/lines.ts).

import type { DrugSafetyEntry } from "./api";

export const SECTION_TITLE = "H/O drug hypersensitivity and High-Alert Medication";

/** The two questions asked of a medicine (the physician's, typos fixed). */
export const Q_HYPERSENSITIVE = "Is the patient hypersensitive to this drug?";
export const Q_HIGH_ALERT = "Is it a high-alert medication?";

export const brandShown = (brand: string): string =>
  brand.trim().replace(/^[^0-9]*/, (m) => m.toUpperCase());

export function drugShown(brand: string, generic: string | null | undefined): string {
  const g = (generic ?? "").trim();
  return g ? `${brandShown(brand)}(${g})` : brandShown(brand);
}

type Words = Pick<DrugSafetyEntry, "kind" | "brand" | "generic" | "hypersensitive" | "highAlert" | "text">;

/** One entry's lines: a medicine ticked both ways is two lines. */
export function entryLines(e: Words): string[] {
  if (e.kind === "text") return e.text.trim() ? [e.text] : [];
  const out: string[] = [];
  if (e.hypersensitive) out.push(`Hypersensitive to ${drugShown(e.brand, e.generic)}`);
  if (e.highAlert) out.push(`High-alert drug: ${drugShown(e.brand, e.generic)}`);
  return out;
}

/** Every line of the list, in its order — what the printed sheet carries. */
export const printLines = (entries: readonly Words[]): string[] => entries.flatMap(entryLines);

/** Case and spacing set aside — the server's "already on the list". */
const fold = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
export const sameEntryKey = (e: Pick<Words, "kind" | "brand" | "generic" | "text">): string =>
  e.kind === "text" ? `text|${fold(e.text)}` : `drug|${fold(e.brand)}|${fold(e.generic)}`;

/**
 * The server's answer, checked to BE the list before it is read as one. Anything
 * else — an empty body, a Wi-Fi sign-in page in its place — is null, and the
 * caller says the list could not be loaded: an unreadable answer must never be
 * shown, or printed, as "no hypersensitivity recorded".
 */
export function readDrugSafetyList(raw: unknown): DrugSafetyEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const out: DrugSafetyEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || (o.kind !== "drug" && o.kind !== "text")) return null;
    if (typeof o.brand !== "string" || typeof o.text !== "string") return null;
    if (o.generic !== null && typeof o.generic !== "string") return null;
    if (typeof o.hypersensitive !== "boolean" || typeof o.highAlert !== "boolean") return null;
    out.push({
      id: o.id,
      kind: o.kind,
      brand: o.brand,
      generic: o.generic as string | null,
      hypersensitive: o.hypersensitive,
      highAlert: o.highAlert,
      text: o.text,
      createdByName: typeof o.createdByName === "string" ? o.createdByName : "",
      createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
      updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
      editable: o.editable === true,
    });
  }
  return out;
}

/**
 * ⚕️ The lines for a sheet about to be printed. The list is asked for again
 * (`refetch`), so an entry another device added is on the paper. Any copy the
 * answer gives — new, or the older one the screen shows when the new ask
 * failed — is printed. With NO copy at all the list is never printed as "none
 * recorded": `ask` puts it to the doctor, and "no" is `null` — the caller then
 * stops, before anything is saved or printed.
 */
export async function linesForPrint(
  refetch: () => Promise<{ data?: readonly Words[] | undefined }>,
  ask: () => Promise<boolean>,
): Promise<string[] | null> {
  let data: readonly Words[] | undefined;
  try {
    data = (await refetch()).data;
  } catch {
    data = undefined;
  }
  if (data) return printLines(data);
  return (await ask()) ? [] : null;
}
