"use client";

import { useMemo, useState } from "react";
import { C, font } from "@/theme";
import { INV_CATS } from "@/data/investigations";
import { useInvestigationPrefs, useSaveFavourites } from "@/hooks/useInvestigationPrefs";

// Settings → Favourite & unit settings.
// Part 1 (this view): pick favourite investigations — they populate the
// "Favourite" category in the Investigation popup. Preferred-unit settings are
// the next part (placeholder below).
export default function FavouriteSettingsView({ onBack }: { onBack: () => void }) {
  const { favourites, isLoading } = useInvestigationPrefs();
  const save = useSaveFavourites();

  // Categories to browse from (everything except the dynamic "Favourite" tab).
  const browseCats = useMemo(() => INV_CATS.filter((c) => c.cat !== "Favourite" && c.tests.length > 0), []);
  const [activeCat, setActiveCat] = useState(() => browseCats[0]?.cat ?? "Hematology");
  const tests = INV_CATS.find((c) => c.cat === activeCat)?.tests ?? [];

  const isFav = (name: string) => favourites.includes(name);
  const toggle = (name: string) => {
    const next = isFav(name) ? favourites.filter((n) => n !== name) : [...favourites, name];
    save.mutate(next);
  };
  const removeFav = (name: string) => save.mutate(favourites.filter((n) => n !== name));

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={btnBack}>← Back</button>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Favourite &amp; unit settings</div>
      </div>

      {save.isError && (
        <div style={{ fontSize: 12.5, color: C.danger[800], background: C.danger[50], border: `0.5px solid ${C.danger[100]}`, borderRadius: 8, padding: "9px 13px", marginBottom: 14 }}>
          Couldn’t save — the change was undone. If this just started, the API needs a <b>Prisma client regenerate + restart</b>.
        </div>
      )}

      {/* Your favourite list */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.n[800], marginBottom: 8 }}>Your favourite investigation list</div>
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: 14 }}>
          {favourites.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.n[500] }}>
              No favourites yet. Star tests below — they’ll appear in the <b>Favourite</b> tab of the Investigation popup.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {favourites.map((name, i) => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.n[900] }}>
                  <span style={{ color: C.n[500], width: 18, textAlign: "right" }}>{i + 1}.</span>
                  <span style={{ flex: 1 }}>{name}</span>
                  <button onClick={() => removeFav(name)} title="Remove from favourites" style={{ border: "none", background: "transparent", color: C.danger[400], cursor: "pointer", fontSize: 15, lineHeight: 1 }}>★</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Browse and add */}
      <div style={{ fontSize: 13, fontWeight: 600, color: C.n[800], marginBottom: 8 }}>Add to favourites</div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {/* Category sidebar */}
        <div style={{ width: 170, flexShrink: 0, border: `0.5px solid ${C.n[200]}`, borderRadius: 10, background: C.n[0], padding: "6px 0", maxHeight: 460, overflowY: "auto" }}>
          {browseCats.map((c) => (
            <button key={c.cat} onClick={() => setActiveCat(c.cat)} style={{
              display: "block", width: "100%", textAlign: "left", padding: "8px 14px", border: "none", cursor: "pointer",
              fontSize: 12.5, fontFamily: font,
              background: activeCat === c.cat ? C.pri[50] : "transparent",
              color: activeCat === c.cat ? C.pri[600] : C.n[600],
              fontWeight: activeCat === c.cat ? 600 : 400,
              borderLeft: activeCat === c.cat ? `3px solid ${C.pri[400]}` : "3px solid transparent",
            }}>{c.cat}</button>
          ))}
        </div>

        {/* Test list with star toggles */}
        <div style={{ flex: 1, border: `0.5px solid ${C.n[200]}`, borderRadius: 10, background: C.n[0], padding: 10, maxHeight: 460, overflowY: "auto" }}>
          {isLoading ? (
            <div style={{ fontSize: 12.5, color: C.n[500], padding: 8 }}>Loading…</div>
          ) : (
            tests.map((t) => {
              const fav = isFav(t.name);
              return (
                <div key={t.name} onClick={() => toggle(t.name)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                  background: fav ? C.pri[50] : "transparent",
                }}
                  onMouseEnter={(e) => { if (!fav) e.currentTarget.style.background = C.n[50]; }}
                  onMouseLeave={(e) => { if (!fav) e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ fontSize: 16, color: fav ? C.warn[400] : C.n[300], lineHeight: 1 }}>{fav ? "★" : "☆"}</span>
                  <span style={{ flex: 1, fontSize: 13, color: C.n[900] }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: fav ? C.pri[600] : C.n[400] }}>{fav ? "Favourited" : "Add"}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Preferred units — next part */}
      <div style={{ fontSize: 13, fontWeight: 600, color: C.n[800], margin: "22px 0 8px" }}>Choose preferred unit in investigation</div>
      <div style={{ background: C.n[50], border: `0.5px dashed ${C.n[300]}`, borderRadius: 10, padding: 14, fontSize: 12.5, color: C.n[500] }}>
        Coming next — choose a preferred unit for dual-unit tests (e.g. Bilirubin mg/dL ↔ µmol/L).
      </div>
    </div>
  );
}

const btnBack: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[800], fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font };
