// A doctor's own investigation groups (physician's request, 2026-09-24): a
// name and a list of test names, made in Advised tests / investigation →
// "Investigations group", and ticked to put every test of the group into the
// Advised tests list at once. Stored per signed-in user in
// `User.investigationGroups`. Pinned in investigationGroups.test.ts.
//
// Nothing here is clinical content of the system's own: a group is only ever
// what the doctor put in it, the tests picked from the catalog's directories.

export interface InvestigationGroup {
  name: string;
  tests: string[];
}

/** What the server sent, read safely: it comes from a Json column, so anything
 *  that is not a named group with at least one test is skipped, never thrown on. */
export function safeGroups(raw: unknown): InvestigationGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: InvestigationGroup[] = [];
  for (const g of raw) {
    if (!g || typeof g !== "object") continue;
    const name = typeof (g as { name?: unknown }).name === "string" ? (g as { name: string }).name.trim() : "";
    const testsRaw = (g as { tests?: unknown }).tests;
    const tests = Array.isArray(testsRaw) ? testsRaw.filter((t): t is string => typeof t === "string" && t.trim() !== "") : [];
    if (name && tests.length) out.push({ name, tests });
  }
  return out;
}

const key = (s: string) => s.trim().toLowerCase();

/** Why a new group cannot be saved yet, in words for the doctor — or null. */
export function newGroupProblem(name: string, tests: string[], existing: InvestigationGroup[]): string | null {
  if (!name.trim()) return "Give the group a name.";
  if (tests.length === 0) return "Tick at least one test from the directories.";
  if (existing.some((g) => key(g.name) === key(name))) return `A group named "${name.trim()}" already exists.`;
  return null;
}

/** A group reads as ticked when every one of its tests is already in the list. */
export function groupTicked(group: InvestigationGroup, selected: string[]): boolean {
  return group.tests.length > 0 && group.tests.every((t) => selected.includes(t));
}

/**
 * Ticking a group adds its tests that are missing (never a duplicate).
 * Unticking takes its tests back out — except any test that another still
 * ticked group also carries, so unticking one group never silently removes a
 * test the doctor is still asking for through another.
 */
export function toggleGroup(
  group: InvestigationGroup,
  selected: string[],
  all: InvestigationGroup[],
): { add: string[]; remove: string[] } {
  if (!groupTicked(group, selected)) {
    return { add: group.tests.filter((t, i) => !selected.includes(t) && group.tests.indexOf(t) === i), remove: [] };
  }
  const keptByOthers = new Set(
    all.filter((g) => g !== group && g.name !== group.name && groupTicked(g, selected)).flatMap((g) => g.tests),
  );
  return { add: [], remove: group.tests.filter((t) => !keptByOthers.has(t)) };
}
