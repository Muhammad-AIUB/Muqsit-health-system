"use client";

import { useState } from "react";
import { C } from "@/theme";
import { IMAGE_MARKER, testImageUrls } from "@/lib/investigationImages";
import { allPrintable, isPrintableFinding, toggleHidden } from "@/lib/investigationHidden";
import ImageLightbox from "@/components/common/ImageLightbox";
import HideToggle from "@/components/common/HideToggle";

// The "Investigation report findings" field exactly as it appears on the
// prescription page: a label + "+" that opens the Investigation popup, an Edit
// shortcut, and the dated findings list with attached-report-image lightbox.
// Shared by the prescription LeftColumn and the IPD detail view so the two stay
// identical.
//
// ⚕️ "⊘ Hide" (physician's decision, 2026-09-21) marks findings that must NOT
// appear on the printed prescription — the paper a patient carries to a lab, an
// employer or another doctor. Three rules carry it:
//   • It changes the DOCUMENT, never the record. Every finding stays in
//     `Prescription.investigation` and stays on this screen **in full** — marked
//     amber with a ⊘, never removed, dimmed or truncated. The physician asked
//     for this explicitly: a line missing from the screen is a line the doctor
//     cannot check before printing.
//   • A tick MEANS hidden. There is no second "apply" press, and no inverted
//     "tick to keep" reading for a doctor to get wrong under time pressure.
//   • It is OPT-IN, through `onHidden`. The IPD detail view renders this same
//     component and passes nothing, so the ward sheet is untouched.
// The rules of what prints live in `lib/investigationHidden.ts`.

const DATE_RE = /^(\d{2}\/\d{2}\/\d{4}):(.*)$/;
// "dd/mm/yyyy:TestName:[image attached]" or "…:TestName#2:[image attached]".
const IMAGE_ENTRY_RE = /^(\d{2}\/\d{2}\/\d{4}):(.+?)(?:#\d+)?:\[image attached\]$/;
// Report-pool uploads are staging, not a finding — they never get a row.
const POOL_TEST_RE = /^Report \d+$/;

type Row = { text: string; test: string; images: string[]; synthetic: boolean; raw: string };

export default function InvestigationFindingsField({
  label, items, invImages, onOpen, hidden, onHidden,
}: {
  label: string;
  items: string[];
  invImages: Record<string, string>;
  onOpen: () => void;
  /** Findings marked "do not print", by their exact stored string. */
  hidden?: string[];
  /** Opt-in: given, the ⊘ Hide button and the per-row ticks render. */
  onHidden?: (next: string[]) => void;
}) {
  // The open lightbox: every image on one finding, plus which one is showing.
  const [lightbox, setLightbox] = useState<{ urls: string[]; idx: number } | null>(null);

  const canHide = typeof onHidden === "function";
  const hiddenSet = new Set(hidden ?? []);
  // Counted over what COULD print, so "Hidden (3)" can never include a line the
  // sheet was never going to carry.
  const printable = allPrintable(items);
  const hiddenCount = printable.filter((p) => hiddenSet.has(p)).length;
  // One control, two directions: nothing hidden → hide the field; anything
  // hidden → bring it all back. This is the "select all" the physician asked
  // for, and it cannot drift out of step with the row ticks.
  const toggleAll = () => onHidden?.(hiddenCount > 0 ? [] : printable);

  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 28 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.n[800], cursor: "pointer" }} onClick={onOpen}>{label}</span>
        <button onClick={onOpen} style={{ width: 20, height: 20, borderRadius: "50%", border: "1px solid " + C.n[300], background: "transparent", color: C.pri[400], fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.n[300]; }}>+</button>
        {items.length > 0 && (
          <button onClick={onOpen} style={{ fontSize: 11, color: C.pri[600], background: C.pri[50], border: `0.5px solid ${C.pri[100]}`, borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontFamily: "inherit" }}>✎ Edit</button>
        )}
        {canHide && printable.length > 0 && (
          <HideToggle hidden={hiddenCount > 0} count={hiddenCount} onToggle={toggleAll} what={label} />
        )}
      </div>
      {items.length > 0 && (() => {
        // Uploaded report images aren't listed here — only real findings.
        const textItems = items.filter((it) => it.indexOf(IMAGE_MARKER) < 0);

        // Every test that carries at least one attached report, read from the
        // markers rather than the image map so pool uploads stay excluded.
        const tagged: { date: string; test: string }[] = [];
        for (const it of items) {
          const m = it.match(IMAGE_ENTRY_RE);
          if (!m || POOL_TEST_RE.test(m[2])) continue;
          if (!tagged.some((t) => t.date === m[1] && t.test === m[2])) tagged.push({ date: m[1], test: m[2] });
        }

        // Group findings that share a date under one date heading.
        const groups: { date: string; rows: Row[] }[] = [];
        const groupFor = (date: string) => {
          let g = groups.find((x) => x.date === date);
          if (!g) { g = { date, rows: [] }; groups.push(g); }
          return g;
        };
        for (const item of textItems) {
          const m = item.match(DATE_RE);
          const date = m ? m[1] : "";
          const rest = m ? m[2] : item;
          const test = rest.split(":")[0];
          const g = groupFor(date);
          // Images belong to the test, so they hang off its FIRST value line —
          // repeating the 📎 on every line would suggest one report per value.
          const first = date ? !g.rows.some((r) => r.test === test) : false;
          g.rows.push({
            text: rest,
            test,
            images: first ? testImageUrls(invImages, date, test) : [],
            synthetic: false,
            // The exact stored string — what a hide mark is keyed by, so a tick
            // can only ever suppress the one line it sits on.
            raw: item,
          });
        }

        // A test tagged with a report but never given a value would otherwise
        // render nowhere — the doctor would have no way to tell from this screen
        // that a report is attached. Built here, not stored, so it stays off the
        // printed prescription (where a value-less test name would read as a
        // missing result).
        for (const t of tagged) {
          const g = groupFor(t.date);
          if (g.rows.some((r) => r.test === t.test && !r.synthetic)) continue;
          if (g.rows.some((r) => r.test === t.test && r.synthetic)) continue;
          // No `raw`: a synthesised row is not a stored finding and never prints,
          // so it takes no tick — one that changed nothing on paper would be a lie.
          g.rows.push({ text: t.test, test: t.test, images: testImageUrls(invImages, t.date, t.test), synthetic: true, raw: "" });
        }
        // Synthesised rows sort after the value lines, by test name, so the list
        // does not reshuffle as images are attached and removed.
        for (const g of groups) {
          const values = g.rows.filter((r) => !r.synthetic);
          const synth = g.rows.filter((r) => r.synthetic).sort((a, b) => a.test.localeCompare(b.test));
          g.rows = values.concat(synth);
        }

        if (groups.every((g) => g.rows.length === 0)) return null;

        return (
          <div style={{ paddingLeft: 14, marginTop: 1, marginBottom: 4 }}>
            {groups.map((g, gi) => (
              <div key={gi} style={{ marginBottom: g.date ? 5 : 0 }}>
                {g.date && <div style={{ fontSize: 11, fontWeight: 600, color: C.n[700], margin: "3px 0 1px" }}>{g.date}</div>}
                {g.rows.map((row, idx) => {
                  const n = row.images.length;
                  const markable = canHide && isPrintableFinding(row.raw);
                  const off = markable && hiddenSet.has(row.raw);
                  return (
                    <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: C.n[800], padding: "1.5px 0", paddingLeft: g.date ? 8 : 0 }}>
                      {canHide && (
                        <span style={{ width: 12, flexShrink: 0, display: "flex", alignItems: "center", height: 17 }}>
                          {markable && (
                            <input
                              type="checkbox" checked={off}
                              onChange={() => onHidden?.(toggleHidden(hidden ?? [], row.raw))}
                              aria-label={`Hide "${row.text}" in printed prescription`}
                              title="Hide in Printed Prescription"
                              style={{ width: 11, height: 11, margin: 0, accentColor: C.warn[400], cursor: "pointer" }}
                            />
                          )}
                        </span>
                      )}
                      <span style={{ color: off ? C.warn[400] : C.n[500], lineHeight: 1.45, flexShrink: 0 }}>•</span>
                      {/* ⚕️ The text keeps its own colour and size when hidden.
                          The physician's instruction was explicit: do not remove
                          or fade a line on screen — mark it, so the doctor can
                          still read and check it before printing. */}
                      <span
                        onClick={n ? () => setLightbox({ urls: row.images, idx: 0 }) : undefined}
                        title={n ? (n > 1 ? `View ${n} attached report images` : "View attached report image") : undefined}
                        style={{ flex: 1, lineHeight: 1.45, cursor: n ? "pointer" : "default", color: n ? C.info[800] : C.n[800], textDecoration: n ? "underline" : "none" }}
                      >
                        {row.text}{n ? (n > 1 ? ` 📎 ${n}` : " 📎") : ""}
                        {off && <span title="Will not print" style={{ color: C.warn[600], fontWeight: 600, marginLeft: 5 }}>⊘</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })()}

      {lightbox && (
        <ImageLightbox
          urls={lightbox.urls}
          index={lightbox.idx}
          onIndex={(idx) => setLightbox((lb) => (lb ? { ...lb, idx } : lb))}
          onClose={() => setLightbox(null)}
          alt="Report"
          wrap
        />
      )}
    </div>
  );
}
