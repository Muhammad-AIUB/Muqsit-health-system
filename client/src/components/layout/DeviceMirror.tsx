"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useMuqsit } from "@/context/MuqsitContext";
import { mirrorApi } from "@/lib/api";

// Drives the real-time "mirror my devices" sync (primary accounts only). Opens
// the SSE stream, applies snapshots from the user's other devices, and publishes
// this device's state changes back out when mirroring is on. Renders nothing.
export default function DeviceMirror() {
  const { user } = useAuth();
  const {
    mirrorOn, setMirrorOn, mirrorConnId, setMirrorConnId,
    mirrorSnapshot, applyMirrorSnapshot, mirrorApplyingRef,
  } = useMuqsit();
  const isPrimary = user?.accountTier === "primary";

  // Open the SSE stream while signed in as primary.
  useEffect(() => {
    if (!isPrimary) return;
    const es = new EventSource(mirrorApi.streamUrl(), { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type: string; payload: Record<string, unknown> };
        if (msg.type === "hello") { setMirrorConnId(String(msg.payload.connId)); return; }
        if (msg.type === "toggle") {
          // Don't let flipping on/off here immediately re-publish our own state —
          // the device that toggled is the one whose state should propagate.
          mirrorApplyingRef.current = true;
          setMirrorOn(!!msg.payload.on);
          setTimeout(() => { mirrorApplyingRef.current = false; }, 400);
          return;
        }
        if (msg.type === "state") { applyMirrorSnapshot(msg.payload); return; }
      } catch { /* ignore malformed */ }
    };
    // The browser auto-reconnects on error; nothing to do here.
    return () => { es.close(); setMirrorConnId(null); };
  }, [isPrimary, setMirrorConnId, setMirrorOn, applyMirrorSnapshot]);

  // Publish local state changes to the other devices (debounced) while on.
  const snapJson = JSON.stringify(mirrorSnapshot);
  useEffect(() => {
    if (!isPrimary || !mirrorOn || !mirrorConnId) return;
    if (mirrorApplyingRef.current) return; // don't echo a just-applied remote state
    const t = setTimeout(() => {
      void mirrorApi.publish(mirrorConnId, "state", mirrorSnapshot).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapJson, isPrimary, mirrorOn, mirrorConnId]);

  return null;
}
