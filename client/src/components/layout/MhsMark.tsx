"use client";

import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { hidesMhsLogo } from "@/lib/practiceBrand";

// The "MHS+" tile in the app's header, on a desktop and on a phone. Drawn here,
// once, so that the practice's "Remove MHS logo" setting (admin Profile settings,
// physician's sheet 16/11/2026) is decided in ONE place for both shells — and,
// through `hidesMhsLogo`, the same way as at the foot of the printed prescription.
// The words "Muqsit Health System" beside it are the app's name, not the logo,
// and are not governed by the setting.
export default function MhsMark({ size, radius, fontSize, letterSpacing }: {
  size: { width: number; height: number };
  radius: number;
  fontSize: number;
  letterSpacing?: string;
}) {
  const { activeWorkstation } = useMuqsit();
  if (hidesMhsLogo(activeWorkstation)) return null;
  return (
    <div
      data-mhs-logo
      style={{
        width: size.width, height: size.height, borderRadius: radius, background: C.pri[400],
        display: "flex", alignItems: "center", justifyContent: "center", color: C.n[0],
        fontSize, fontWeight: 700, letterSpacing, flexShrink: 0,
      }}
    >
      MHS+
    </div>
  );
}
