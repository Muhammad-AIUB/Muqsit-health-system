"use client";

import { useState } from "react";
import { C, font } from "@/theme";
import MedicinePad, { type Row } from "@/components/prescription/MedicinePad";
import { rowsFromRxItems, rxItemsFromRows } from "@/lib/rxRows";
import {
  CATEGORY_LABEL,
  deleteTemplate,
  getTemplates,
  saveTemplate,
  type RxTemplate,
  type TemplateCategory,
} from "@/lib/rxTemplates";

const CATEGORIES: { cat: TemplateCategory; desc: string; icon: string }[] = [
  { cat: "opd", desc: "Templates for outdoor / consultation prescriptions.", icon: "▤" },
  { cat: "ipd", desc: "Templates for in-patient prescriptions.", icon: "▥" },
  { cat: "custom", desc: "Your own custom prescription templates.", icon: "🛠️" },
];

export default function PrescriptionTemplatesView({ onBack }: { onBack: () => void }) {
  const [cat, setCat] = useState<TemplateCategory | null>(null);
  // null = list view; "new" = blank editor; RxTemplate = editing existing.
  const [editing, setEditing] = useState<RxTemplate | "new" | null>(null);
  const [tick, setTick] = useState(0); // bump to re-read templates after delete
  // Remove mode: select one or more templates, then delete together.
  const [removeMode, setRemoveMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const exitRemove = () => { setRemoveMode(false); setSelected(new Set()); };
  const openCategory = (c: TemplateCategory) => { exitRemove(); setCat(c); };
  const toggleSelect = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const deleteSelected = () => {
    if (!cat || selected.size === 0) return;
    if (window.confirm(`Delete ${selected.size} selected template${selected.size === 1 ? "" : "s"}?`)) {
      selected.forEach((id) => deleteTemplate(cat, id));
      exitRemove();
      setTick((x) => x + 1);
    }
  };

  // ── Editor (blank or existing) ──
  if (cat && editing) {
    return (
      <TemplateEditor
        cat={cat}
        template={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
      />
    );
  }

  // ── A category's templates (Blank + saved cards) ──
  if (cat) {
    void tick; // referenced so a delete re-reads localStorage
    const templates = getTemplates(cat);
    return (
      <div style={{ fontFamily: font, maxWidth: 1000 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <button onClick={() => { exitRemove(); setCat(null); }} style={btnBack}>← Back</button>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{CATEGORY_LABEL[cat]}</div>

          {/* Upper-right: enter/leave remove mode */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {removeMode && (
              <button
                onClick={deleteSelected}
                disabled={selected.size === 0}
                style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: selected.size === 0 ? C.n[200] : C.danger[400], color: selected.size === 0 ? C.n[500] : "#fff", fontSize: 12.5, fontWeight: 600, cursor: selected.size === 0 ? "default" : "pointer", fontFamily: font }}
              >
                Delete selected{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
            )}
            {templates.length > 0 && (
              <button
                onClick={() => (removeMode ? exitRemove() : setRemoveMode(true))}
                style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${removeMode ? C.n[300] : C.danger[400]}`, background: removeMode ? C.n[100] : C.n[0], color: removeMode ? C.n[700] : C.danger[800], fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: font }}
              >
                {removeMode ? "Cancel" : "Click to Remove any template"}
              </button>
            )}
          </div>
        </div>

        {removeMode && (
          <div style={{ fontSize: 12, color: C.n[600], marginBottom: 12 }}>
            Select the templates you want to remove, then press “Delete selected”.
          </div>
        )}

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          {/* Blank → new template (hidden while removing) */}
          {!removeMode && (
            <button onClick={() => setEditing("new")} style={blankCard}>
              <div style={{ flex: 1, width: "100%", border: `1.5px dashed ${C.n[300]}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: C.info[400], fontSize: 34, fontWeight: 300 }}>
                +
              </div>
              <div style={{ fontSize: 13, color: C.n[600], marginTop: 8 }}>Blank</div>
            </button>
          )}

          {/* Saved templates */}
          {templates.map((t) => {
            const isSel = selected.has(t.id);
            return (
              <div key={t.id} style={{ width: 150, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <button
                  onClick={() => (removeMode ? toggleSelect(t.id) : setEditing(t))}
                  title={removeMode ? "Select to remove" : `${t.items.length} medicine(s)`}
                  style={{ ...tplCard, border: `${isSel ? 2 : 1}px solid ${isSel ? C.danger[400] : C.pri[100]}`, background: isSel ? C.danger[50] : C.pri[50] }}
                >
                  <span style={{ fontSize: 30, color: isSel ? C.danger[800] : C.pri[600] }}>℞</span>
                  <span style={{ position: "absolute", bottom: 8, right: 10, fontSize: 10, color: isSel ? C.danger[800] : C.pri[600] }}>{t.items.length} item{t.items.length === 1 ? "" : "s"}</span>
                  {removeMode && (
                    <span style={{ position: "absolute", top: 8, left: 8, width: 20, height: 20, borderRadius: "50%", border: `2px solid ${isSel ? C.danger[400] : C.n[300]}`, background: isSel ? C.danger[400] : C.n[0], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                      {isSel ? "✓" : ""}
                    </span>
                  )}
                </button>
                <div style={{ fontSize: 13, color: C.n[900], marginTop: 8, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Three categories ──
  return (
    <div style={{ fontFamily: font, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <button onClick={onBack} style={btnBack}>← Back</button>
        <div style={{ fontSize: 16, fontWeight: 500 }}>Prescription templates</div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {CATEGORIES.map(({ cat: c, desc, icon }) => (
          <div
            key={c}
            onClick={() => openCategory(c)}
            style={{ flex: "1 1 240px", background: C.n[0], border: `1px solid ${C.n[200]}`, borderRadius: 12, padding: 18, cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: C.n[100], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.n[900] }}>{CATEGORY_LABEL[c]}</div>
            </div>
            <div style={{ fontSize: 12, color: C.n[600], lineHeight: 1.5 }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Template editor: name + Rx pad + Save / Cancel ──────────
function TemplateEditor({ cat, template, onClose }: { cat: TemplateCategory; template: RxTemplate | null; onClose: () => void }) {
  const [name, setName] = useState(template?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() => rowsFromRxItems(template?.items ?? []));
  const [error, setError] = useState("");

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Please enter a template name."); return; }
    const items = rxItemsFromRows(rows);
    if (items.length === 0) { setError("Add at least one medicine or note."); return; }
    saveTemplate(cat, { id: template?.id, name: trimmed, items });
    onClose();
  };

  return (
    <div style={{ fontFamily: font, maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <button onClick={onClose} style={btnBack}>← Back</button>
        <div style={{ fontSize: 16, fontWeight: 500 }}>{template ? "Edit template" : "New template"}</div>
        <span style={{ fontSize: 12, color: C.n[500], borderLeft: `1px solid ${C.n[200]}`, paddingLeft: 12 }}>{CATEGORY_LABEL[cat]}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: C.n[800], whiteSpace: "nowrap" }}>Name of the template:</label>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          placeholder="e.g. AVH"
          autoFocus
          style={{ flex: 1, maxWidth: 420, padding: "9px 14px", borderRadius: 8, border: `0.5px solid ${C.n[300]}`, fontSize: 14, fontFamily: font, color: C.n[900], background: C.n[0], outline: "none" }}
        />
      </div>

      <div style={{ fontSize: 22, fontWeight: 500, color: C.pri[400], fontStyle: "italic", marginBottom: 6 }}>℞</div>
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 8, padding: "8px 12px" }}>
        <MedicinePad rows={rows} setRows={setRows} minHeight={320} noteText="Start typing a medicine or note…" showCheck={false} />
      </div>

      {error && <div style={{ fontSize: 12, color: C.danger[800], marginTop: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 18, paddingTop: 14, borderTop: `0.5px solid ${C.n[200]}` }}>
        <button onClick={save} style={{ padding: "10px 26px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Save</button>
        <button onClick={onClose} style={{ padding: "10px 26px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[700], fontSize: 13, cursor: "pointer", fontFamily: font }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Styles ──
const btnBack: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[800], fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font };
const blankCard: React.CSSProperties = { width: 150, height: 200, display: "flex", flexDirection: "column", alignItems: "center", padding: 14, borderRadius: 14, border: `1px solid ${C.n[200]}`, background: C.n[0], cursor: "pointer", fontFamily: font };
const tplCard: React.CSSProperties = { position: "relative", width: 150, height: 200, borderRadius: 14, border: `1px solid ${C.pri[100]}`, background: C.pri[50], color: C.pri[600], cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font };
