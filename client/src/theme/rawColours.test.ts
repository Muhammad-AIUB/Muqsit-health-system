import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

// ⚕️ A colour written as a literal in a component does not switch with night
// mode (src/theme/palette.ts): white text stays white on a light-blue night
// button, a white panel glares in a dark room. Components take colours from `C`.
//
// A literal is allowed only where it must be the SAME in both modes, each with
// its reason. Adding to this list is a decision, not a convenience.
const ALLOWED: { file: string; text: string; why: string }[] = [
  // The image viewer and the report-zoom controls stand on a black backdrop in
  // both modes: white on black there is the same in light and night.
  { file: "components/common/ImageLightbox.tsx", text: "rgba(0,0,0,0.8)", why: "viewer backdrop" },
  { file: "components/common/ImageLightbox.tsx", text: "rgba(0,0,0,0.5)", why: "image shadow on the backdrop" },
  { file: "components/common/ImageLightbox.tsx", text: "#fff", why: "caption on the black backdrop" },
  { file: "components/common/ImageLightbox.tsx", text: "rgba(255,255,255,0.92)", why: "viewer buttons on the backdrop" },
  { file: "components/common/ImageLightbox.tsx", text: "rgba(255,255,255,0.25)", why: "viewer buttons, disabled" },
  { file: "components/investigation/InvestigationPopup.tsx", text: "rgba(0,0,0,0.6)", why: "zoom bar over a report image" },
  { file: "components/investigation/InvestigationPopup.tsx", text: "rgba(255,255,255,0.4)", why: "zoom bar divider over a report image" },
  { file: "components/investigation/InvestigationPopup.tsx", text: 'color: "#fff", cursor', why: "zoom buttons over a report image" },
  { file: "components/investigation/InvestigationPopup.tsx", text: 'fontSize: 10, color: "#fff"', why: "zoom % over a report image" },
  { file: "components/common/ImageGallery.tsx", text: '"#fff"', why: "selection ring on a photo thumbnail" },
  { file: "components/tabs/PrescriptionTemplatesView.tsx", text: "#fff", why: "selection ring on a thumbnail" },
  // Rich text is PAPER: the colours a doctor gives text, the highlighter and the
  // sensitive mark are written for white paper and print on it (theme PAPER).
  { file: "components/common/RichTextEditor.tsx", text: "#", why: "text colours, highlight and swatches a doctor applies; drawn on paper" },
  { file: "components/common/RichTextEditor.tsx", text: "rgba(0,0,0,0.18)", why: "swatch edge" },
  { file: "lib/sensitive.ts", text: "#", why: "the sensitive mark, on paper and in print" },
  // Printed documents: their own HTML, never the app's palette.
  { file: "components/prescription/InvestigationDownload.tsx", text: "", why: "a printout" },
  { file: "components/prescription/PersonalNote.tsx", text: "#1a1a1a", why: "the note's print CSS" },
  { file: "components/prescription/PersonalNote.tsx", text: "#666", why: "the note's print CSS" },
  { file: "components/prescription/PersonalNote.tsx", text: "#444", why: "the note's print CSS" },
  { file: "lib/revisionNotes.ts", text: "#111", why: "the Revision Notes print CSS" },
  { file: "lib/revisionNotes.ts", text: "#555", why: "the Revision Notes print CSS" },
  { file: "components/prescription/PrescriptionView.tsx", text: 'backgroundColor: "#ffffff"', why: "the snapshot of the printed sheet is white paper" },
  // The red glow of a critical patient and a prescribing alert: a light in both modes.
  { file: "components/ipd/CriticalAlert.tsx", text: "rgba(226,75,74", why: "siren glow" },
  { file: "components/prescription/RxPadAlerts.tsx", text: "rgba(226,75,74", why: "alert pulse" },
  // Small shadows in black: a shadow reads in both modes and is kept as it was,
  // so light mode does not move. (The three standing shadows are tokens.)
  { file: "components/layout/LoginPage.tsx", text: "0 12px 40px rgba(26, 115, 232, 0.10), 0 2px 8px rgba(0,0,0,0.04)", why: "sign-in card shadow" },
  { file: "components/prescription/MedicinePad.tsx", text: '"0 2px 10px rgba(0,0,0,0.10)"', why: "a line being dragged" },
  { file: "components/tabs/FavouriteSettingsView.tsx", text: '"0 1px 2px rgba(0,0,0,0.06)"', why: "segmented control" },
  { file: "components/tabs/PrescriptionSettingsView.tsx", text: '"0 1px 2px rgba(0,0,0,0.08)"', why: "segmented control" },
  { file: "components/layout/WorkstationSwitcher.tsx", text: '"4px 0 24px rgba(0,0,0,0.08)"', why: "drawer edge" },
  { file: "components/Muqsit.tsx", text: '"0 1px 2px rgba(0,0,0,0.08)"', why: "Desktop / Mobile segmented control" },
  { file: "components/investigation/InvestigationPopup.tsx", text: "rgba(0,0,0,0.25)", why: "the badge over a report image" },
  // Reads a computed colour, writes none.
  { file: "lib/highlight.ts", text: "rgba(0, 0, 0, 0)", why: "compares against the browser's 'transparent'" },
];

const SRC = join(__dirname, "..");
// prescriptionDoc.ts and opdQueueDoc.ts are printed pages in a frame of their own that import no theme; they are the same in both modes.
const SKIP = /\.test\.|prescriptionDoc\.ts$|opdQueueDoc\.ts$|galleryPdf\.ts$|compressImage\.ts$|decodeImage\.ts$/;
const RAW = /#[0-9a-fA-F]{3,8}\b|rgba?\(|["']white["']/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(n) && !SKIP.test(n) ? [p] : [];
  });
}

describe("no raw colour in a component", () => {
  it("every colour comes from the palette, or is listed with its reason", () => {
    const found: string[] = [];
    for (const file of [...walk(join(SRC, "components")), ...walk(join(SRC, "lib"))]) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "");
        if (!RAW.test(code)) return;
        const ok = ALLOWED.some((a) => a.file === rel && code.includes(a.text));
        if (!ok) found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(found, `colours that will not switch with night mode:\n${found.join("\n")}`).toEqual([]);
  });

  it("every allowance still points at something (a stale one hides nothing, and invites misuse)", () => {
    for (const a of ALLOWED) {
      const text = readFileSync(join(SRC, a.file), "utf8");
      expect(text.includes(a.text), `${a.file}: "${a.text}" (${a.why})`).toBe(true);
    }
  });
});
