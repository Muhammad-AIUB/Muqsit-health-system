"use client";

import { useEffect } from "react";

// The last net under the app. If a screen throws while rendering, Next would
// otherwise replace the whole page with "Application error: a client-side
// exception has occurred" — on a screen a doctor prescribes through, with no
// way forward and no word on what happened to their work.
//
// What it says is deliberately limited to what is true: a rendering error
// changes nothing that was already saved, and the editor keeps an auto-saved
// draft of the prescription being written. It does not claim that unsaved
// typing survived.
//
// Plain colours, no theme import: this must render even when the app's own
// modules are what failed.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] screen failed to render:", error);
  }, [error]);

  const button = { display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" } as const;

  return (
    <main role="alert" style={{ minHeight: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center", color: "#202124" }}>
      <div aria-hidden style={{ width: 48, height: 48, borderRadius: 12, background: "#1A73E8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }}>MHS+</div>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>This screen stopped working</h1>
      <p style={{ fontSize: 13.5, color: "#565A5F", maxWidth: 420, lineHeight: 1.55 }}>
        Nothing you had already saved has been changed. Try again; if it happens again, reload the page —
        a prescription you were writing is restored from its last auto-saved draft.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
        <button type="button" onClick={reset} style={{ ...button, border: "1px solid #1A73E8", background: "#1A73E8", color: "#fff" }}>Try again</button>
        <button type="button" onClick={() => window.location.reload()} style={{ ...button, border: "1px solid #CDD1D6", background: "#fff", color: "#303438" }}>Reload the page</button>
      </div>
      {error.digest && <p style={{ fontSize: 11, color: "#6B7075" }}>Reference: {error.digest}</p>}
    </main>
  );
}
