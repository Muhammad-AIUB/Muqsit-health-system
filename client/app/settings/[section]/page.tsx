import { Suspense } from "react";
import { notFound } from "next/navigation";
import Muqsit from "@/components/Muqsit";
import { RequireAuth } from "@/components/auth/guards";
import { SETTINGS_SECTION_SLUGS } from "@/components/layout/tabs";

// Deep-linkable sub-pages of the Settings tab (e.g. /settings/assistants).
// Like app/[tab], the active section is decided client-side from the
// pathname (SettingsView); this page just serves the auth-gated shell.
export default function SettingsSectionPage({ params }: { params: { section: string } }) {
  if (!SETTINGS_SECTION_SLUGS.has(params.section)) notFound();

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
