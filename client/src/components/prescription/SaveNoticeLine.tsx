"use client";

import { C } from "@/theme";
import type { SaveNotice, SaveNoticeKind } from "@/lib/saveNotice";

// The line under the Save buttons. Its colour is the KIND the store holds with
// the words (lib/saveNotice.ts): green for saved, amber for "not yet, and why".
const INK: Record<SaveNoticeKind, string> = { ok: C.ok[600], warn: C.warn[800] };

// On the page from the start, empty: a status region that arrives together
// with its words is often not read out.
export default function SaveNoticeLine({ notice, gap = 8 }: { notice: SaveNotice | null; gap?: number }) {
  return (
    <div role="status" style={{ textAlign: "center", fontSize: 12, fontWeight: 500, marginTop: notice ? gap : 0, color: notice ? INK[notice.kind] : undefined }}>
      {notice?.text}
    </div>
  );
}
