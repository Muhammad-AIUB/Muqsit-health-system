import { Suspense } from "react";
import { notFound } from "next/navigation";
import Muqsit from "@/components/Muqsit";
import { RequireAuth } from "@/components/auth/guards";
import { TAB_PATHS } from "@/components/layout/tabs";

// One page serves every tab URL (/prescription, /opd, …). Which tab renders
// is decided client-side from the pathname (MuqsitContext); tab switches use
// shallow history updates, so this page never remounts while navigating.
// Rendered on demand (no generateStaticParams) — the pages are auth-gated and
// render client-side, so pre-rendering buys nothing.
const VALID_SLUGS = new Set(Object.values(TAB_PATHS).map((p) => p.slice(1)));

export default function TabPage({ params }: { params: { tab: string } }) {
  if (!VALID_SLUGS.has(params.tab)) notFound();

  return (
    <main className="app-root">
      <Suspense>
        <RequireAuth>
          <Muqsit />
        </RequireAuth>
      </Suspense>
    </main>
  );
}
