import type { ReactNode } from "react";

interface PillProps {
  bg: string;
  fg: string;
  children: ReactNode;
  // For a row that re-orders its parts on a phone (`.row-after`, globals.css).
  className?: string;
}

export default function Pill({ bg, fg, children, className }: PillProps) {
  return (
    <span
      className={className}
      style={{
        fontSize: 11,
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
