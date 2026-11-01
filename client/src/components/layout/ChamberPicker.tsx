"use client";

// "My Chamber" (physician's sheet 28/10/2026, item 8): which chamber the doctor
// is working in — Labaid or Ibn Sina — beside the Prescription tab. The OPD
// list, its tokens and schedule, and the OPD print settings are that chamber's
// (`X-Chamber`, resolved by the server). `ChamberSync` keeps the choice in step
// with the signed-in user and the practice; `lib/chamber.ts` holds it.

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { C, font } from "@/theme";
import Icon from "@/components/common/Icon";
import { useOptionalAuth } from "@/context/AuthContext";
import { useMuqsit } from "@/context/MuqsitContext";
import { useChambers } from "@/hooks/useChambers";
import { pickChamber, savedChamber, setChamber, useChamberId } from "@/lib/chamber";
import { tell } from "@/lib/dialogs";

/** Whose choice it is: this user, in the practice they are working in. */
export function useChamberOwner(): { userId: string; practiceId: string } | null {
  const user = useOptionalAuth()?.user ?? null;
  const { activeWorkstationId } = useMuqsit();
  const practiceId = activeWorkstationId ?? user?.id ?? null;
  return user?.id && practiceId ? { userId: user.id, practiceId } : null;
}

/** The chamber on show and the practice's list (for screens that name it). */
export function useActiveChamber() {
  const who = useChamberOwner();
  const chosen = useChamberId();
  const q = useChambers(who?.practiceId);
  const { chamber } = pickChamber(q.data, chosen);
  return { chamber, chambers: q.data, query: q, who };
}

// Mounted once in the shell. Restores this user's choice for this practice,
// drops what was cached for the last chamber when it changes (an OPD list of
// one chamber must never be shown under the other's name), and — when the
// chosen chamber is no longer in the list (removed on another device) — goes
// back to the default chamber and says so.
export function ChamberSync() {
  const qc = useQueryClient();
  const who = useChamberOwner();
  const chosen = useChamberId();
  const q = useChambers(who?.practiceId);
  const key = who ? `${who.userId}:${who.practiceId}` : "";

  useEffect(() => {
    if (!who) { setChamber(null); return; }
    setChamber(savedChamber(who.userId, who.practiceId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    void qc.cancelQueries({ queryKey: ["opd"] });
    qc.removeQueries({ queryKey: ["opd"] });
    void qc.invalidateQueries({ queryKey: ["opd"] });
  }, [chosen, qc]);

  useEffect(() => {
    if (!who || q.isFetching || !q.isSuccess) return;
    const { chamber, stale } = pickChamber(q.data, chosen);
    if (stale) {
      setChamber(null, who);
      void tell({
        title: "That chamber is no longer in your list.",
        body: `You are now working in ${chamber?.name ?? "your main chamber"}. Choose another under My Chamber.`,
        tone: "info",
      });
    }
  }, [q.data, q.isFetching, q.isSuccess, chosen, who]);

  return null;
}

export default function ChamberPicker({ compact = false }: { compact?: boolean }) {
  // Nothing (and no request) until someone is signed in.
  return useChamberOwner() ? <Picker compact={compact} /> : null;
}

function Picker({ compact }: { compact: boolean }) {
  const { chamber, chambers, query, who } = useActiveChamber();
  if (!who) return null;
  const list = chambers ?? [];
  return (
    <label
      title="The chamber you are working in: its OPD list and its prescription settings"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34, padding: "0 8px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[700], fontSize: 12.5, fontFamily: font }}
    >
      <Icon name="chamber" size={16} />
      {!compact && <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>My Chamber</span>}
      <select
        aria-label="My Chamber"
        value={chamber?.id ?? ""}
        disabled={!query.isSuccess || list.length === 0}
        onChange={(e) => {
          const picked = list.find((c) => c.id === e.target.value);
          setChamber(picked && !picked.isDefault ? picked.id : null, who);
        }}
        style={{ border: "none", background: "transparent", color: C.n[900], fontSize: 12.5, fontFamily: font, cursor: "pointer", maxWidth: 160 }}
      >
        {query.isError && <option value="">Chambers did not load</option>}
        {!query.isSuccess && !query.isError && <option value="">Loading…</option>}
        {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );
}
