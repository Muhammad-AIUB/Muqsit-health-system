import type { CSSProperties } from "react";

// One icon set for the app's chrome: stroked, on a 24px grid, drawn in the
// colour of the text beside it (`currentColor`).
//
// It replaces emoji that were standing in for icons (👤 🔒 👁 🗂 🏥 📎 …). An
// emoji is drawn by the operating system, so the same screen looked different
// on Windows, Android and macOS, could not take the disabled or active colour,
// and sat off the text baseline. The shapes follow the open-source Feather set.
//
// NOT everything is an icon. These stay as text on purpose, because a doctor
// reads them as part of a label and tests pin several of them: ✎ Edit, ⊘ Hide,
// 💊 on the drug-history badge, ★ / ↺ on learned and recent phrases, ↳ on a
// tapering line, ▲ ▼, ✓, ×, ℞. Do not "tidy" those into icons.
const PATHS = {
  user: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  userEdit: ["M14 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1", "M8 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M18.4 11.6a1.4 1.4 0 0 1 2 2L16 18l-2.6.6.6-2.6z"],
  userCheck: ["M14 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1", "M8 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M16 11l2 2 4-4"],
  users: ["M15 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1", "M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M21 19v-1a4 4 0 0 0-3-3.87", "M15.5 3.13a3.5 3.5 0 0 1 0 6.75"],
  lock: ["M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z", "M7 11V7a5 5 0 0 1 10 0v4"],
  eye: ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  eyeOff: ["M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94", "M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19", "M14.12 14.12a3 3 0 1 1-4.24-4.24", "M1 1l22 22"],
  alert: ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"],
  mail: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M22 6l-10 7L2 6"],
  camera: ["M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z", "M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.35-4.35"],
  sliders: ["M4 6h9", "M17 6h3", "M4 12h3", "M11 12h9", "M4 18h11", "M19 18h1", "M15 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M9 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  activity: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  folder: ["M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"],
  sparkles: ["M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z", "M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"],
  building: ["M5 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16", "M17 10h1a2 2 0 0 1 2 2v9", "M3 21h18", "M11 6.5v4", "M9 8.5h4", "M10 21v-4h2v4"],
  paperclip: ["M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"],
  fileText: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"],
  table: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M3 9h18", "M3 15h18", "M9 3v18"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  printer: ["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 14h12v8H6z"],
  image: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z", "M21 15l-5-5L5 21"],
  chevronRight: ["M9 18l6-6-6-6"],
  arrowLeft: ["M19 12H5", "M12 19l-7-7 7-7"],
  star: ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"],
  medal: ["M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M8.21 13.89L7 23l5-3 5 3-1.21-9.12"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "M9 12l2 2 4-4"],
  flask: ["M9 3h6", "M10 3v6l-5.2 9a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9V3", "M7.5 15h9"],
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  /** Width and height in px. Defaults to 16 — the size beside 12–13px text. */
  size?: number;
  style?: CSSProperties;
}

// Decorative by default: the label beside it carries the meaning. A button
// with NO text must name itself with `aria-label`.
export default function Icon({ name, size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" style={{ flexShrink: 0, ...style }}>
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
