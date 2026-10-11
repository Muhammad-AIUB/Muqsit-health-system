"use client";

import { C, font } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { useMuqsit } from "@/context/MuqsitContext";
import { mirrorApi } from "@/lib/api";

// Nav-bar switch (primary accounts only): when on, the user's logged-in
// devices mirror each other in real time — an action on one reflects on all.
// Toggling broadcasts the new state so every device flips together.
//
// A <button role="switch">, like "Keep eye on this patient" — NOT a <label>
// with a click handler, which it was until 2026-10-12. A label is not a Tab
// stop, so the switch had no keyboard route at all; and a label with no
// control inside it reads as a caption, so when captions learnt to put the
// cursor in the box after them (`lib/captionFocus.ts`) a press here also sent
// the cursor into the patient search beside it.
export default function MirrorToggle() {
  const { user } = useAuth();
  const { mirrorOn, setMirrorOn, mirrorConnId } = useMuqsit();
  if (user?.accountTier !== "primary") return null;

  const toggle = () => {
    const next = !mirrorOn;
    setMirrorOn(next);
    if (mirrorConnId) void mirrorApi.publish(mirrorConnId, "toggle", { on: next }).catch(() => {});
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={mirrorOn}
      onClick={toggle}
      title="Keep your other logged-in devices on the same page in real time"
      style={{
        display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none",
        minHeight: 32, padding: "0 10px", borderRadius: 8, whiteSpace: "nowrap", fontFamily: font,
        boxSizing: "border-box", lineHeight: "normal",
        border: `1px solid ${mirrorOn ? C.pri[400] : C.n[300]}`,
        background: mirrorOn ? C.pri[50] : C.n[0],
      }}
    >
      <span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${mirrorOn ? C.pri[400] : C.n[300]}`, background: mirrorOn ? C.pri[400] : "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>
        {mirrorOn ? "✓" : ""}
      </span>
      <span style={{ fontSize: 12, fontWeight: mirrorOn ? 600 : 500, color: mirrorOn ? C.pri[600] : C.n[600] }}>
        Mirror devices
      </span>
    </button>
  );
}
