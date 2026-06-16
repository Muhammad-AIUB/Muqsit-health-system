"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { C, font } from "@/theme";
import { useAuth } from "@/context/AuthContext";

// Where to send the user after they sign in. Kept in sessionStorage (not in the
// URL) so the login link stays clean — "/login", not "/login?next=%2F…".
const POST_LOGIN_KEY = "mhs_post_login";

// Only same-origin relative paths are allowed as post-login destinations, so a
// stored value can never bounce a user to an external site (open-redirect
// protection).
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes(":")) {
    return "/";
  }
  return raw;
}

function rememberDestination(path: string | null): void {
  if (typeof window === "undefined") return;
  const safe = safeNext(path);
  if (safe !== "/") window.sessionStorage.setItem(POST_LOGIN_KEY, safe);
  else window.sessionStorage.removeItem(POST_LOGIN_KEY);
}

// Read + clear the remembered destination (defaults to "/").
function takeDestination(): string {
  if (typeof window === "undefined") return "/";
  const raw = window.sessionStorage.getItem(POST_LOGIN_KEY);
  window.sessionStorage.removeItem(POST_LOGIN_KEY);
  return safeNext(raw);
}

function Centered({ text }: { text: string }) {
  return (
    <div style={{ fontFamily: font, color: C.n[500], fontSize: 13, padding: 40, textAlign: "center" }}>{text}</div>
  );
}

// Wraps protected pages: waits for the session restore, then either renders
// the page or replaces the URL with /login (preserving where the user was
// headed via ?next=). Protected UI is never rendered for guests, not even
// for a frame.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready || user) return;
    rememberDestination(pathname); // remembered out-of-band, not in the URL
    router.replace("/login");
  }, [ready, user, pathname, router]);

  if (!ready) return <Centered text="Loading…" />;
  if (!user) return <Centered text="Redirecting to sign in…" />;
  return <>{children}</>;
}

// Wraps guest-only pages (login / signup): an already signed-in user is sent
// back into the app instead of seeing the auth forms again.
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && user) router.replace(takeDestination());
  }, [ready, user, router]);

  if (!ready) return <Centered text="Loading…" />;
  if (user) return <Centered text="Redirecting…" />;
  return <>{children}</>;
}
