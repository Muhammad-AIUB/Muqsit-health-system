"use client";

import { useState } from "react";
import { C } from "@/theme";

// The "Investigation report findings" field exactly as it appears on the
// prescription page: a label + "+" that opens the Investigation popup, an Edit
// shortcut, and the dated findings list with attached-report-image lightbox.
// Shared by the prescription LeftColumn and the IPD detail view so the two stay
// identical.
export default function InvestigationFindingsField({
  label, items, invImages, onOpen,
}: {
  label: string;
  items: string[];
  invImages: Record<string, string>;
  onOpen: () => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);

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
      </div>
      {items.length > 0 && (() => {
        // Uploaded report images aren't listed here — only real findings.
        const textItems = items.filter((it) => it.indexOf("[image attached]") < 0);
        // Group findings that share a date under one date heading.
        const DATE_RE = /^(\d{2}\/\d{2}\/\d{4}):(.*)$/;
        const groups: { date: string; items: string[] }[] = [];
        for (const item of textItems) {
          const m = item.match(DATE_RE);
          const date = m ? m[1] : "";
          const rest = m ? m[2] : item;
          let g = groups.find((x) => x.date === date);
          if (!g) { g = { date, items: [] }; groups.push(g); }
          g.items.push(rest);
        }
        return (
          <div style={{ paddingLeft: 14, marginTop: 1, marginBottom: 4 }}>
            {groups.map((g, gi) => (
              <div key={gi} style={{ marginBottom: g.date ? 5 : 0 }}>
                {g.date && <div style={{ fontSize: 11, fontWeight: 600, color: C.n[700], margin: "3px 0 1px" }}>{g.date}</div>}
                {g.items.map((rest, idx) => {
                  const imgUrl = g.date ? invImages[`${g.date}:${rest.split(":")[0]}`] : undefined;
                  return (
                    <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: C.n[800], padding: "1.5px 0", paddingLeft: g.date ? 8 : 0 }}>
                      <span style={{ color: C.n[500], lineHeight: 1.45, flexShrink: 0 }}>•</span>
                      <span
                        onClick={imgUrl ? () => setLightbox(imgUrl) : undefined}
                        title={imgUrl ? "View attached report image" : undefined}
                        style={{ flex: 1, lineHeight: 1.45, cursor: imgUrl ? "pointer" : "default", color: imgUrl ? C.info[800] : C.n[800], textDecoration: imgUrl ? "underline" : "none" }}
                      >{rest}{imgUrl ? " 📎" : ""}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })()}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Report" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} style={{ position: "fixed", top: 18, right: 22, width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.92)", color: C.n[900], fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
      )}
    </div>
  );
}
