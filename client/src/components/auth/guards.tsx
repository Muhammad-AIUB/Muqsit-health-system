"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { C, font } from "@/theme";
import { useAuth } from "@/context/AuthContext";

// Only same-origin relative paths are allowed as post-login destinations,
// so a crafted ?next= link can never bounce a user to an external site
// (open-redirect protection).
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes(":")) {
    return "/";
  }
  return raw;
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
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
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
  const params = useSearchParams();

  useEffect(() => {
    if (ready && user) router.replace(safeNext(params.get("next")));
  }, [ready, user, params, router]);

  if (!ready) return <Centered text="Loading…" />;
  if (user) return <Centered text="Redirecting…" />;
  return <>{children}</>;
}
