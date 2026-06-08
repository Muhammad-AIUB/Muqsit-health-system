import type { ReactNode } from "react";

interface PillProps {
  bg: string;
  fg: string;
  children: ReactNode;
}

export default function Pill({ bg, fg, children }: PillProps) {
  return (
    <span
      style={{
        fontSize: 10,
        padding: "2px 10px",
        borderRadius: 12,
        fontWeight: 500,
        background: bg,
        color: fg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
