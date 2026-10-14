import { useSyncExternalStore } from "react";

// BAN / EN — which language the header switch is on (physician's decision,
// 2026-09-23). Module-level so the switch, the keyboard handler and the ℞ pad
// share one value without widening MuqsitContext. Remembered per signed-in user
// on this device, like the IPD view choice: a shared ward PC must not hand the
// next doctor BAN mode. Not mirrored — each device keeps its own.

export type KbdLang = "en" | "bn";

let mode: KbdLang = "en";
const listeners = new Set<() => void>();
const storageKey = (userId: string) => `mhs_kbd_lang:${userId}`;

/** Set the mode, remembering it for `userId` on this device when given. */
export function setKbdLang(next: KbdLang, userId?: string) {
  mode = next;
  try { if (userId) window.localStorage.setItem(storageKey(userId), next); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

export const getKbdLang = (): KbdLang => mode;

/** This user's last choice on this device; anything unreadable is English. */
export function savedKbdLang(userId: string | undefined): KbdLang {
  let saved: string | null = null;
  try { if (userId) saved = window.localStorage.getItem(storageKey(userId)); } catch { /* private mode */ }
  return saved === "bn" ? "bn" : "en";
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useKbdLang = () => useSyncExternalStore(subscribe, () => mode, () => "en" as KbdLang);
