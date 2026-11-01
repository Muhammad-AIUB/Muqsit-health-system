import { useSyncExternalStore } from "react";
import { setActiveChamberId } from "@/lib/api";

// ⚕️ The chamber the user works in (multi-chamber OPD, physician's sheet
// 28/10/2026, item 8). Module-level, like BAN / EN (`kbdLang.ts`), so the
// picker, the OPD screen and every request read one value without widening
// MuqsitContext. Remembered per signed-in user, per PRACTICE, on this device:
// a reception PC at Labaid and a laptop at Ibn Sina each keep their own, and an
// assistant working in two practices keeps one per practice. Not mirrored.
// `null` = the practice's default chamber (no `X-Chamber` header).

let current: string | null = null;
const listeners = new Set<() => void>();
const storageKey = (userId: string, practiceId: string) => `mhs_chamber:${userId}:${practiceId}`;

/** Make `id` the chamber every request names, remembering it when a key is given. */
export function setChamber(id: string | null, who?: { userId: string; practiceId: string }) {
  if (id === current) return;
  current = id;
  setActiveChamberId(id);
  try {
    if (who) {
      if (id) window.localStorage.setItem(storageKey(who.userId, who.practiceId), id);
      else window.localStorage.removeItem(storageKey(who.userId, who.practiceId));
    }
  } catch { /* private mode: the choice lasts for this page only */ }
  listeners.forEach((l) => l());
}

export const getChamber = (): string | null => current;

/** This user's last choice in this practice on this device; null when none. */
export function savedChamber(userId: string | undefined, practiceId: string | undefined): string | null {
  if (!userId || !practiceId) return null;
  try { return window.localStorage.getItem(storageKey(userId, practiceId)) || null; } catch { return null; }
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useChamberId = () => useSyncExternalStore(subscribe, () => current, () => null);

/** The chamber on show among the practice's live chambers: the chosen one, or
 *  the default when none is chosen. `stale` when the chosen one is not in the
 *  list any more (removed on another device) — the caller says so, and falls
 *  back to the default. */
export function pickChamber<T extends { id: string; isDefault: boolean }>(list: T[] | undefined, chosen: string | null): { chamber: T | null; stale: boolean } {
  if (!list || list.length === 0) return { chamber: null, stale: false };
  const def = list.find((c) => c.isDefault) ?? null;
  if (!chosen) return { chamber: def, stale: false };
  const hit = list.find((c) => c.id === chosen);
  return hit ? { chamber: hit, stale: false } : { chamber: def, stale: true };
}
