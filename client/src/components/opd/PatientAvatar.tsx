"use client";

import { useState } from "react";
import { C } from "@/theme";
import Icon from "@/components/common/Icon";
import { photoPlaceholder } from "@/lib/sex";

// The patient's picture, or the app's own placeholder for their sex
// (`photoPlaceholder` + `Icon`, as in the prescription header). A picture that
// does not load falls back to it rather than a broken-image box; a new URL after
// a failed one is tried again.
export default function PatientAvatar({ url, sex, name, size = 34 }: {
  url?: string | null; sex?: string | null; name: string; size?: number;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const showPicture = !!url && broken !== url;
  return (
    <span role="img" aria-label={`Photo of ${name}`}
      style={{
        width: size, height: size, borderRadius: "50%", overflow: "hidden",
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        background: C.n[100], border: `0.5px solid ${C.n[200]}`, boxSizing: "border-box",
      }}>
      {showPicture
        ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url as string} alt="" loading="lazy" decoding="async" onError={() => setBroken(url as string)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        )
        : <Icon name={photoPlaceholder(sex)} size={Math.round(size * 0.6)} style={{ color: C.n[500] }} />}
    </span>
  );
}
