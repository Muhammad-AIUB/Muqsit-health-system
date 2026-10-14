import { useSyncExternalStore } from "react";

// Light / night — the header's ☀ / ☾ switch (physician's request, 2026-10-15).
// The mode is ONE attribute on <html> (`data-theme="dark"`, absent for light);
// every colour is a CSS variable that follows it (src/theme/palette.ts), so a
// switch re-renders nothing.
//
// Remembered per signed-in user on this device, like BAN / EN (a shared ward PC
// must not hand the next doctor night mode), and as this device's last choice
// (`mhs_theme`), which the sign-in page and the first paint use before anyone
// is signed in. Not mirrored — each device keeps its own.

export type ThemeMode = "light" | "dark";

const DEVICE_KEY = "mhs_theme";
const userKey = (userId: string) => `${DEVICE_KEY}:${userId}`;

let mode: ThemeMode = "light";
const listeners = new Set<() => void>();

function apply(next: ThemeMode) {
  if (typeof document === "undefined") return;
  if (next === "dark") document.documentElement.dataset.theme = "dark";
  else document.documentElement.removeAttribute("data-theme");
}

/** Set the mode; remembered for `userId` (when given) and as this device's last. */
export function setTheme(next: ThemeMode, userId?: string) {
  mode = next;
  apply(next);
  try {
    window.localStorage.setItem(DEVICE_KEY, next);
    if (userId) window.localStorage.setItem(userKey(userId), next);
  } catch { /* private mode / blocked storage: the mode still applies */ }
  listeners.forEach((l) => l());
}

export const getTheme = (): ThemeMode => mode;

/** This user's own saved choice on this device, or null when they never made one. */
export function userTheme(userId: string | undefined): ThemeMode | null {
  let saved: string | null = null;
  try { if (userId) saved = window.localStorage.getItem(userKey(userId)); } catch { /* blocked */ }
  return saved === "dark" ? "dark" : saved === "light" ? "light" : null;
}

/** This user's mode; anything unreadable is light. */
export const savedTheme = (userId: string | undefined): ThemeMode => userTheme(userId) ?? "light";

// What the first paint set (THEME_BOOT_SCRIPT) is the starting mode, so the
// store and the page agree from the start.
if (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark") mode = "dark";

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useTheme = () => useSyncExternalStore(subscribe, () => mode, () => "light" as ThemeMode);

/**
 * Inline in <head> (app/layout.tsx), before anything is drawn: a doctor working
 * at night must not get a white flash on every load. First-party, fetches
 * nothing; anything but the exact word "dark" — or storage that throws — is light.
 */
export const THEME_BOOT_SCRIPT =
  `try{if(window.localStorage.getItem("${DEVICE_KEY}")==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;
