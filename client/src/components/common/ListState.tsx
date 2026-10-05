import { C } from "@/theme";
import { btnSecondary } from "@/theme/styles";
import Icon from "./Icon";

// The two other things a list can be besides full or empty (`EmptyState`):
// on its way, and failed.
//
// Both were one grey or red 12px line, each written by hand. "Loading queue…"
// with nothing moving beside it reads as a caption, and on a slow connection as
// a page that has stopped. And a red line that says "try again" with nothing to
// press leaves the doctor to reload the whole app — and lose what they were
// writing on the way.

// A list that is being fetched. The ring is `.spinner` from globals.css: it
// turns, and holds still under reduced motion, where the words carry it.
export function Loading({ label = "Loading…", compact }: { label?: string; compact?: boolean }) {
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: compact ? "10px 0" : "24px 0", fontSize: 12.5, color: C.n[600] }}>
      <span className="spinner" aria-hidden />
      {label}
    </div>
  );
}

// A list that could not be fetched. `title` says WHAT did not load, in the
// doctor's words ("Could not load the OPD queue."). The line under it is the
// one thing they can check themselves; a reason the server gave replaces it
// when there is one. `onRetry` asks again in place — nothing else on the page
// is touched.
export function LoadError({ title, detail, onRetry, retrying, compact }: {
  title: string;
  detail?: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}) {
  return (
    <div role="alert" style={{ textAlign: "center", padding: compact ? "14px 12px" : "28px 16px" }}>
      <div aria-hidden style={{ width: 40, height: 40, borderRadius: "50%", background: C.danger[50], color: C.danger[800], display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        <Icon name="alert" size={18} />
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.n[800] }}>{title}</div>
      <div style={{ fontSize: 12, color: C.n[600], marginTop: 4, lineHeight: 1.5 }}>{detail || "Check your internet connection and try again."}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} disabled={retrying} style={{ ...btnSecondary("sm"), marginTop: 12 }}>
          {retrying ? "Trying again…" : "Try again"}
        </button>
      )}
    </div>
  );
}
