"use client";

import { C, font } from "@/theme";
import { useAuth } from "@/context/AuthContext";
import { useMuqsit } from "@/context/MuqsitContext";
import { mirrorApi } from "@/lib/api";

// Nav-bar checkbox (primary accounts only): when on, the user's logged-in
// devices mirror each other in real time — an action on one reflects on all.
// Toggling broadcasts the new state so every device flips together.
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
    <label
      onClick={toggle}
      title="Keep your other logged-in devices on the same page in real time"
      style={{
        display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none",
        padding: "5px 10px", borderRadius: 7, whiteSpace: "nowrap", fontFamily: font,
        border: `0.5px solid ${mirrorOn ? C.pri[400] : C.n[200]}`,
        background: mirrorOn ? C.pri[50] : C.n[0],
      }}
    >
      <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${mirrorOn ? C.pri[400] : C.n[300]}`, background: mirrorOn ? C.pri[400] : "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>
        {mirrorOn ? "✓" : ""}
      </span>
      <span style={{ fontSize: 11, fontWeight: mirrorOn ? 600 : 400, color: mirrorOn ? C.pri[600] : C.n[600] }}>
        Mirror devices
      </span>
    </label>
  );
}
