import type { TabId } from "@/types";

// Navigation icons, drawn as strokes so they take the tab's own colour
// (`currentColor`) and look the same on every machine. The glyphs in `tabs.ts`
// (℞ ▤ ▥ ◉ ◈ 🔬 ⚙) came from whatever font the OS fell back to, and the
// microscope was a full-colour emoji that ignored the active/disabled colour.
// `tabs.ts` keeps those strings as the plain-text fallback.
const PATHS: Partial<Record<TabId | "more", string[]>> = {
  // A sheet with lines: the prescription.
  prescription: ["M7 3h7l4 4v14H7z", "M14 3v4h4", "M10 12h5", "M10 16h5"],
  // A list: the queue.
  opd: ["M9 6h11", "M9 12h11", "M9 18h11", "M4.5 6h.01", "M4.5 12h.01", "M4.5 18h.01"],
  // A bed.
  ipd: ["M3 19V6", "M3 15h18v4", "M21 15v-2a3 3 0 0 0-3-3h-7v5", "M7 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"],
  // Two people.
  patients: ["M15 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1", "M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M21 19v-1a4 4 0 0 0-3-3.87", "M15.5 3.13a3.5 3.5 0 0 1 0 6.75"],
  // A person with a tick: a patient someone asked you to look over.
  message: ["M14 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1", "M8 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M16 11l2 2 4-4"],
  // A flask.
  research: ["M9 3h6", "M10 3v6l-5.2 9a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9V3", "M7.5 15h9"],
  // Sliders.
  settings: ["M4 6h9", "M17 6h3", "M4 12h3", "M11 12h9", "M4 18h11", "M19 18h1", "M15 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M9 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
};

export default function TabIcon({ id, size = 16 }: { id: TabId | "more"; size?: number }) {
  const paths = PATHS[id];
  if (!paths) return null;
  // The dotted icons are zero-length strokes; they need a heavier line to read.
  const dots = id === "more";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={dots ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
