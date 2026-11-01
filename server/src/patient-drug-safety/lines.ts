// The words an entry is shown and logged with. The client has its own copy for
// the screen and the printed sheet (client/src/lib/drugSafety.ts); this one is
// used for the activity feed only.
//
// ⚕️ The physician's own examples (sheet, 31/10/2026): "Hypersensitive to
// NAPA(Paracetamol)" and "high alert drug: NAPA(Paracetamol)". The brand is
// written in capitals up to its first digit — a strength typed into the name
// keeps the letters it was typed with — and the generic is the catalogue's,
// or left out when none is known. Nothing is guessed.

export interface DrugSafetyWords {
  kind: string;
  brand: string;
  generic: string | null;
  hypersensitive: boolean;
  highAlert: boolean;
  text: string;
}

export const brandShown = (brand: string): string =>
  brand.trim().replace(/^[^0-9]*/, (m) => m.toUpperCase());

export function drugShown(brand: string, generic: string | null): string {
  const g = (generic ?? '').trim();
  return g ? `${brandShown(brand)}(${g})` : brandShown(brand);
}

export function entryLines(e: DrugSafetyWords): string[] {
  if (e.kind === 'text') return [e.text];
  const out: string[] = [];
  if (e.hypersensitive)
    out.push(`Hypersensitive to ${drugShown(e.brand, e.generic)}`);
  if (e.highAlert)
    out.push(`High-alert drug: ${drugShown(e.brand, e.generic)}`);
  return out;
}

/** Case and spacing set aside — what "already on the list" compares. */
export const fold = (s: string | null | undefined): string =>
  (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export const sameEntryKey = (
  e: Pick<DrugSafetyWords, 'kind' | 'brand' | 'generic' | 'text'>,
): string =>
  e.kind === 'text'
    ? `text|${fold(e.text)}`
    : `drug|${fold(e.brand)}|${fold(e.generic)}`;
