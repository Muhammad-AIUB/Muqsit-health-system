"use client";

import { useState } from "react";
import { C } from "@/theme";
import { INV_CATS } from "@/data/investigations";
import { useInvestigationPrefs } from "@/hooks/useInvestigationPrefs";

// "Select from Directories" — the investigation catalog as a tick list, under
// the suggestions in Advised tests / investigation (physician's request,
// 2026-09-24). Every category of `INV_CATS`, in the catalog's own order, the
// doctor's Favourite first; "+" opens one to show its test NAMES — no result
// fields, because here the doctor is ordering a test, not recording one. A
// tick stages the name in the popup's Added list; Done applies it as usual.
//
// Nothing here is new clinical content: the names are the catalog's, exactly
// as the Investigation popup shows them, and Favourite is the doctor's own list
// (Settings → Favourite & unit settings), looked up the same way the popup does.
export default function InvestigationDirectory({ selected, onToggle }: {
  selected: string[];
  onToggle: (name: string) => void;
}) {
  const { favourites } = useInvestigationPrefs();
  const [openCat, setOpenCat] = useState<Set<string>>(() => new Set());

  const all = INV_CATS.flatMap((c) => c.tests);
  const testsOf = (cat: string): string[] =>
    cat === "Favourite"
      ? favourites.filter((n) => all.some((t) => t.name === n))
      : (INV_CATS.find((c) => c.cat === cat)?.tests ?? []).map((t) => t.name);

  const toggleCat = (cat: string) =>
    setOpenCat((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
        Select from Directories
      </div>
      <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 8, overflow: "hidden" }}>
        {INV_CATS.map((c, ci) => {
          const isOpen = openCat.has(c.cat);
          const names = isOpen ? testsOf(c.cat) : [];
          const ticked = testsOf(c.cat).filter((n) => selected.includes(n)).length;
          return (
            <div key={c.cat} style={{ borderTop: ci === 0 ? "none" : `0.5px solid ${C.n[200]}` }}>
              <button
                type="button"
                onClick={() => toggleCat(c.cat)}
                aria-expanded={isOpen}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px",
                  border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 12.5,
                  background: isOpen ? C.pri[50] : C.n[0], color: isOpen ? C.pri[600] : C.n[800], fontWeight: isOpen ? 600 : 400,
                }}
              >
                <span aria-hidden style={{ width: 18, height: 18, borderRadius: 4, border: `1px solid ${isOpen ? C.pri[400] : C.n[300]}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, lineHeight: 1, color: C.pri[600], flexShrink: 0 }}>
                  {isOpen ? "−" : "+"}
                </span>
                <span style={{ flex: 1 }}>{c.cat}</span>
                {ticked > 0 && <span style={{ fontSize: 11, color: C.pri[600], fontWeight: 600 }}>{ticked} selected</span>}
              </button>
              {isOpen && (
                <div style={{ padding: "6px 12px 10px 40px", background: C.n[0], display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "4px 16px" }}>
                  {names.length === 0 && (
                    <div style={{ fontSize: 12, color: C.n[500], padding: "4px 0" }}>
                      {c.cat === "Favourite" ? "No favourites yet. Add them in Settings → Favourite & unit settings." : "No tests in this directory."}
                    </div>
                  )}
                  {names.map((name) => {
                    const on = selected.includes(name);
                    return (
                      <label key={name} style={{ display: "flex", alignItems: "flex-start", gap: 7, cursor: "pointer", userSelect: "none", padding: "3px 0" }}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => onToggle(name)}
                          style={{ width: 15, height: 15, marginTop: 1, flexShrink: 0, accentColor: C.pri[400], cursor: "pointer" }}
                        />
                        <span style={{ fontSize: 12.5, lineHeight: 1.35, color: on ? C.pri[600] : C.n[800], fontWeight: on ? 600 : 400 }}>{name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
