// Report images attached to an investigation test.
//
// A test's images live in the `invImages` map under a key built from the visit
// date and the test name. The FIRST image keeps the historic unsuffixed key, and
// later ones take a "#N" suffix:
//
//   invImages["05/06/2026:CT Orbits"]   = <url A>   // as it has always been
//   invImages["05/06/2026:CT Orbits#2"] = <url B>   // second image, added 2026-08-16
//
// The suffix is additive on purpose: every draft, prescription and IPD admission
// written before multi-image support still reads back with its one image intact,
// and the "…:[image attached]" marker protocol is unchanged. No test name in
// `data/investigations.ts` contains "#", so the suffix can never be mistaken for
// part of a name.
//
// Two rules the callers depend on:
//   - Keys are NEVER renumbered. Removing the middle of base/#2/#3 leaves a gap;
//     renumbering would rewrite keys inside already-saved prescriptions for a
//     cosmetic tidy-up. `nextImageKey` reuses the lowest free slot instead.
//   - The same URL is never stored twice on one test+date (`hasImageUrl`).

export const IMAGE_MARKER = ":[image attached]";

/** The "…:[image attached]" findings entry that marks an image key as attached. */
export const markerFor = (key: string): string => key + IMAGE_MARKER;

/** The image key for the nth (1-based) image of a test on a date. */
export const imageKeyFor = (date: string, test: string, n = 1): string =>
  n <= 1 ? `${date}:${test}` : `${date}:${test}#${n}`;

// The slot number a key holds for this test, or 0 when the key belongs to
// something else. Base key = slot 1. A suffix that is not a plain integer >= 2
// (e.g. "#0", "#2x", "#") belongs to no slot and is ignored rather than guessed.
const slotOf = (key: string, base: string): number => {
  if (key === base) return 1;
  if (!key.startsWith(base + "#")) return 0;
  const rest = key.slice(base.length + 1);
  if (!/^\d+$/.test(rest)) return 0;
  const n = parseInt(rest, 10);
  return n >= 2 ? n : 0;
};

/**
 * Every image key attached to one test on one date, in slot order (base, #2,
 * #3, … numerically — so #10 sorts after #9, not after #1). Keys belonging to
 * another test are excluded even when one name is a prefix of the other, and
 * pool entries ("dd/mm/yyyy:Report N") never match a real test name.
 */
export function testImageKeys(
  images: Record<string, string>,
  date: string,
  test: string,
): string[] {
  const base = `${date}:${test}`;
  return Object.keys(images)
    .map((k) => ({ k, slot: slotOf(k, base) }))
    .filter((x) => x.slot > 0)
    .sort((a, b) => a.slot - b.slot)
    .map((x) => x.k);
}

/** The URLs behind `testImageKeys`, in the same order. */
export function testImageUrls(
  images: Record<string, string>,
  date: string,
  test: string,
): string[] {
  return testImageKeys(images, date, test).map((k) => images[k]).filter(Boolean);
}

/** True when this exact image is already attached to this test on this date. */
export function hasImageUrl(
  images: Record<string, string>,
  date: string,
  test: string,
  url: string,
): boolean {
  return testImageKeys(images, date, test).some((k) => images[k] === url);
}

/**
 * The key a newly dropped image should take: the LOWEST free slot, so a gap left
 * by a removed image is reused instead of the numbering climbing forever.
 */
export function nextImageKey(
  images: Record<string, string>,
  date: string,
  test: string,
): string {
  const base = `${date}:${test}`;
  const taken = new Set(
    Object.keys(images).map((k) => slotOf(k, base)).filter((s) => s > 0),
  );
  let n = 1;
  while (taken.has(n)) n += 1;
  return imageKeyFor(date, test, n);
}

/**
 * Split a findings entry into its date and test name, or null when it carries no
 * test segment (free-text notes are stored as "dd/mm/yyyy:some text"). Image
 * markers are rejected — they are not findings.
 */
export function parseFindingKey(entry: string): { date: string; test: string } | null {
  if (entry.indexOf(IMAGE_MARKER) >= 0) return null;
  const m = entry.match(/^(\d{2}\/\d{2}\/\d{4}):([^:]+):/);
  return m ? { date: m[1], test: m[2] } : null;
}

/** True when some finding still records a value for this test on this date. */
export function hasValueLine(
  investigation: string[],
  date: string,
  test: string,
): boolean {
  return investigation.some((it) => {
    const p = parseFindingKey(it);
    return !!p && p.date === date && p.test === test;
  });
}
