// The first-paint half of night mode (lib/theme.ts), on its own: the root
// layout is a SERVER component and imports this, so it must hold no React —
// a hook imported into the layout fails the build ("needs useSyncExternalStore
// … only works in a Client Component"), caught in the browser pass of
// 2026-10-15, past a green typecheck and unit suite.

/** localStorage key of this device's last mode (lib/theme.ts writes it). */
export const THEME_DEVICE_KEY = "mhs_theme";

/**
 * Inline in <head> (app/layout.tsx), before anything is drawn: a doctor working
 * at night must not get a white flash on every load. First-party, fetches
 * nothing; anything but the exact word "dark" — or storage that throws — is light.
 */
export const THEME_BOOT_SCRIPT =
  `try{if(window.localStorage.getItem("${THEME_DEVICE_KEY}")==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;
