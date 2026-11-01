"use client";

import { useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { C, font } from "@/theme";
import { btnDisabled, btnPrimary, btnSecondary, fieldLabel, inputSm } from "@/theme/styles";
import Icon from "@/components/common/Icon";
import { LoadError } from "@/components/common/ListState";
import { useMuqsit } from "@/context/MuqsitContext";
import { useMedicineSearch } from "@/hooks/useMedicineSearch";
import { usePatientDrugSafety, drugSafetyKey } from "@/hooks/usePatientDrugSafety";
import { ApiError, drugSafetyApi, type DrugSafetyEntry, type MedicineHit } from "@/lib/api";
import { confirmAction, tell } from "@/lib/dialogs";
import { Q_HIGH_ALERT, Q_HYPERSENSITIVE, SECTION_TITLE, drugShown, entryLines } from "@/lib/drugSafety";

// ⚕️ "H/O drug hypersensitivity and High-Alert Medication" (physician's sheet,
// 31/10/2026: "Drug history er por akta tab add hobe … Aikhane drug add korle
// oilekha ajibon thakbe oi pt er jonno. Aita hide kora jabe na. List edit kora
// jabe."). A per-PATIENT list, kept on the server for life
// (`/patients/:id/drug-safety`), read by every practice that reaches the patient.
//
//  • It cannot be hidden: no ⊘ here, and the printed sheet always carries it.
//  • One entry is added at a time with "+": a medicine (picked from the medicines
//    catalogue — its generic comes from the catalogue row — or typed, with no
//    generic) and one or both of the physician's two questions ticked; or a line
//    written as it should read.
//  • "✎ Edit" opens the list: a medicine's ticks, a line's words, and the ✕ —
//    which is shown only there (sheet, 31/10/2026: an accidental delete).
//    Removal is SOFT on the server; "Undo" puts the entry back.
//  • Nothing is shown as recorded before the server has it: what was typed
//    stays in its box until the answer comes, and only then is cleared.
//  • A list that could not be loaded is SAID, with Try again — never drawn as
//    an empty one. Save & print asks before printing without it (PrescriptionView).

const why = (e: unknown, fallback: string): string =>
  // The server's 400 / 403 / 409 sentences here are written for a doctor;
  // anything else (the framework's words, a dropped connection) is not shown.
  e instanceof ApiError && [400, 403, 409].includes(e.status) && e.message ? e.message : fallback;

const markRow: CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 6, padding: "3px 8px", margin: "2px 0",
  borderRadius: 6, background: C.danger[50], borderLeft: `3px solid ${C.danger[400]}`,
  color: C.danger[800], fontSize: 12, fontWeight: 600, lineHeight: 1.45,
};

const tick: CSSProperties = { width: 13, height: 13, margin: "2px 0 0", accentColor: C.danger[400], cursor: "pointer", flexShrink: 0 };

export default function DrugSafetyField({ canEdit }: { canEdit: boolean }) {
  const { currentPatientId } = useMuqsit();
  const q = usePatientDrugSafety();
  const qc = useQueryClient();
  const entries = q.data ?? [];
  const anyEditable = entries.some((e) => e.editable);

  const [adding, setAdding] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // One request at a time from this section.
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState<DrugSafetyEntry | null>(null);

  // Every practice's copy of THIS patient's list (the key's second part).
  const refresh = (pid: string) => qc.invalidateQueries({ queryKey: drugSafetyKey(pid, null).slice(0, 2) });

  // Every write names the patient it was pressed FOR — fixed at the press.
  const run = async <T,>(pid: string, fn: () => Promise<T>, failTitle: string): Promise<T | null> => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      await tell({ title: failTitle, body: why(e, "Check your internet connection and try again."), tone: "danger" });
      return null;
    } finally {
      setBusy(false);
      void refresh(pid);
    }
  };

  const removeEntry = async (e: DrugSafetyEntry) => {
    const pid = currentPatientId;
    if (!pid) return;
    const ok = await run(pid, () => drugSafetyApi.remove(pid, e.id), "The entry was not removed.");
    if (ok) setRemoved(e);
  };
  const undoRemove = async () => {
    const pid = currentPatientId;
    const e = removed;
    if (!pid || !e) return;
    const ok = await run(pid, () => drugSafetyApi.restore(pid, e.id), "The entry was not put back.");
    if (ok) setRemoved(null);
  };

  const showControls = canEdit && !!currentPatientId;

  return (
    <div style={{ marginBottom: 2 }} data-testid="drug-safety">
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 28, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.danger[800] }}>{SECTION_TITLE}</span>
        {showControls ? (
          <button className="hit-area" type="button" aria-label={`Add to ${SECTION_TITLE}`} title="Add one entry"
            disabled={adding || busy || !q.isSuccess}
            onClick={() => { setAdding(true); setEditOpen(false); }}
            style={{ width: 20, height: 20, borderRadius: "50%", border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, ...(adding || busy || !q.isSuccess ? btnDisabled : null) }}>+</button>
        ) : (
          <span title="View only — you don't have access to edit this section" style={{ color: C.n[400], display: "flex" }}><Icon name="lock" size={12} /></span>
        )}
        {showControls && anyEditable && !adding && (
          <button type="button" onClick={() => setEditOpen((v) => !v)} disabled={busy}
            title={editOpen ? "Finish editing" : "Edit this list"}
            style={{ fontSize: 11, color: C.pri[600], background: C.pri[50], border: `0.5px solid ${editOpen ? C.pri[400] : C.pri[100]}`, borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontFamily: "inherit" }}
          >{editOpen ? "✓ Done" : "✎ Edit"}</button>
        )}
      </div>

      {q.isError ? (
        <LoadError compact title="Could not load this patient's drug hypersensitivity / high-alert list." onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : q.isPending ? (
        currentPatientId ? <div role="status" style={{ fontSize: 11.5, color: C.n[500], paddingLeft: 14 }}>Loading…</div> : null
      ) : (
        entries.length > 0 && (
          <div style={{ paddingLeft: 14, marginTop: 1, marginBottom: 4 }}>
            {entries.map((e) =>
              editOpen && e.editable ? (
                <EditRow key={e.id} entry={e} busy={busy} onRemove={() => void removeEntry(e)}
                  onSave={(input, failTitle) => { const pid = currentPatientId; return pid ? run(pid, () => drugSafetyApi.update(pid, e.id, input), failTitle) : Promise.resolve(null); }} />
              ) : (
                entryLines(e).map((line, i) => (
                  <div key={`${e.id}-${i}`} style={markRow} data-testid="drug-safety-line">
                    <Icon name="alert" size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{line}</span>
                  </div>
                ))
              ),
            )}
          </div>
        )
      )}

      {removed && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 6px 14px", padding: "4px 8px", borderRadius: 6, background: C.n[50], border: `0.5px solid ${C.n[200]}`, fontSize: 11.5, color: C.n[700] }}>
          <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>Removed “{entryLines(removed).join("; ")}”</span>
          <button type="button" onClick={() => void undoRemove()} disabled={busy} style={{ border: "none", background: "none", color: C.pri[600], fontWeight: 600, fontSize: 11.5, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Undo</button>
          <button type="button" aria-label="Dismiss" onClick={() => setRemoved(null)} style={{ border: "none", background: "none", color: C.n[500], fontSize: 13, cursor: "pointer", padding: 0, lineHeight: 1, fontFamily: "inherit" }}>×</button>
        </div>
      )}

      {adding && currentPatientId && (
        <AddPanel
          patientId={currentPatientId}
          busy={busy}
          onClose={() => setAdding(false)}
          onAdd={async (pid, input) => !!(await run(pid, () => drugSafetyApi.add(pid, input), "The entry was not added."))}
        />
      )}
    </div>
  );
}

// ── ✎ Edit: one entry ───────────────────────────────────────
function EditRow({ entry, busy, onRemove, onSave }: {
  entry: DrugSafetyEntry;
  busy: boolean;
  onRemove: () => void;
  onSave: (input: { hypersensitive?: boolean; highAlert?: boolean; text?: string }, failTitle: string) => Promise<unknown>;
}) {
  const [text, setText] = useState(entry.text);
  const commitText = async () => {
    const next = text.trim();
    if (next === entry.text.trim()) return;
    if (!next) {
      // A blanked box is a mis-key, not a removal — the ✕ is the removal.
      setText(entry.text);
      return;
    }
    await onSave({ text: next }, "The line was not changed.");
  };
  const setTick = (which: "hypersensitive" | "highAlert", value: boolean) => {
    const other = which === "hypersensitive" ? entry.highAlert : entry.hypersensitive;
    if (!value && !other) {
      void tell({ title: "Tick at least one.", body: "To take this medicine off the list, press ✕." });
      return;
    }
    void onSave({ [which]: value }, "The entry was not changed.");
  };
  const label = entry.kind === "text" ? entry.text : drugShown(entry.brand, entry.generic);
  return (
    <div style={{ ...markRow, alignItems: "center", flexWrap: "wrap" }} data-testid="drug-safety-edit">
      <Icon name="alert" size={12} style={{ flexShrink: 0 }} />
      {entry.kind === "text" ? (
        <input
          aria-label="Edit this line"
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void commitText(); }
            else if (e.key === "Escape") { e.preventDefault(); setText(entry.text); }
          }}
          onBlur={() => void commitText()}
          maxLength={500}
          style={{ ...inputSm, flex: 1, minWidth: 120, fontWeight: 400 }}
        />
      ) : (
        <span style={{ flex: "1 1 100%", minWidth: 0, overflowWrap: "anywhere" }}>
          {drugShown(entry.brand, entry.generic)}
          <span style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 3, fontWeight: 400, color: C.n[800] }}>
            <label style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" style={tick} checked={entry.hypersensitive} disabled={busy} onChange={(e) => setTick("hypersensitive", e.target.checked)} />
              {Q_HYPERSENSITIVE}
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" style={tick} checked={entry.highAlert} disabled={busy} onChange={(e) => setTick("highAlert", e.target.checked)} />
              {Q_HIGH_ALERT}
            </label>
          </span>
        </span>
      )}
      <button
        type="button"
        aria-label={`Remove "${label}"`}
        title="Remove this entry"
        disabled={busy}
        onMouseDown={(e) => e.preventDefault() /* the text box's blur must not save first */}
        onClick={onRemove}
        style={{ width: 20, height: 20, flexShrink: 0, borderRadius: "50%", border: "none", background: C.danger[100], color: C.danger[800], fontSize: 11, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit", marginLeft: "auto" }}
      >✕</button>
    </div>
  );
}

// ── "+": one entry ──────────────────────────────────────────
type Picked = { brand: string; generic: string | null };

function AddPanel({ patientId, busy, onClose, onAdd }: {
  patientId: string;
  busy: boolean;
  onClose: () => void;
  onAdd: (patientId: string, input: { kind: "drug" | "text"; brand?: string; generic?: string; hypersensitive?: boolean; highAlert?: boolean; text?: string }) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"drug" | "text">("drug");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [hyper, setHyper] = useState(false);
  const [highAlert, setHighAlert] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const { results, isLoading } = useMedicineSearch(mode === "drug" && !picked ? query : "");

  const typed = mode === "drug" ? query.trim() || picked !== null : text.trim();

  const cancel = async () => {
    if (typed && !(await confirmAction({ title: "Discard what was typed?", body: "It has not been added to the list.", confirmLabel: "Discard", danger: true }))) return;
    onClose();
  };

  const pick = (m: MedicineHit) => {
    setPicked({ brand: m.brandName.trim(), generic: m.genericName?.trim() || null });
    setMsg("");
  };
  const pickTyped = () => {
    const brand = query.replace(/\s+/g, " ").trim();
    if (brand) { setPicked({ brand, generic: null }); setMsg(""); }
  };

  const submit = async () => {
    if (busy) return;
    if (mode === "text") {
      const line = text.trim();
      if (!line) { setMsg("Write the line to add."); return; }
      if (await onAdd(patientId, { kind: "text", text: line })) { setText(""); onClose(); }
      return;
    }
    if (!picked) { setMsg("Choose the medicine from the list first."); return; }
    if (!hyper && !highAlert) { setMsg("Tick at least one of the two questions."); return; }
    const sent = picked;
    const ok = await onAdd(patientId, {
      kind: "drug", brand: sent.brand, ...(sent.generic ? { generic: sent.generic } : {}),
      hypersensitive: hyper, highAlert: highAlert,
    });
    if (ok) onClose();
  };

  const seg = (on: boolean): CSSProperties => ({
    fontSize: 11.5, padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontFamily: font,
    border: `0.5px solid ${on ? C.pri[400] : C.n[300]}`, background: on ? C.pri[50] : "transparent", color: on ? C.pri[600] : C.n[700],
  });

  return (
    <div role="group" aria-label={`Add to ${SECTION_TITLE}`} style={{ margin: "4px 0 8px 14px", padding: 10, borderRadius: 8, border: `0.5px solid ${C.danger[100]}`, background: C.n[0], display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" aria-pressed={mode === "drug"} style={seg(mode === "drug")} onClick={() => { setMode("drug"); setMsg(""); }}>Medicine</button>
        <button type="button" aria-pressed={mode === "text"} style={seg(mode === "text")} onClick={() => { setMode("text"); setMsg(""); }}>Write a line</button>
      </div>

      {mode === "text" ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={fieldLabel}>Line</span>
          <input
            autoFocus value={text} maxLength={500} disabled={busy}
            onChange={(e) => { setText(e.target.value); setMsg(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
            placeholder="e.g. Patient is hypersensitive to sulpha-containing drugs"
            style={inputSm}
          />
        </label>
      ) : picked ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.danger[800] }} data-testid="drug-safety-picked">{drugShown(picked.brand, picked.generic)}</span>
            {!picked.generic && <span style={{ fontSize: 11, color: C.n[500] }}>(not from the medicine list — no generic name)</span>}
            <button type="button" onClick={() => { setPicked(null); setHyper(false); setHighAlert(false); }} disabled={busy}
              style={{ border: "none", background: "none", color: C.pri[600], fontSize: 11.5, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Change</button>
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: C.n[800], cursor: "pointer" }}>
            <input type="checkbox" style={tick} checked={hyper} disabled={busy} onChange={(e) => { setHyper(e.target.checked); setMsg(""); }} />
            {Q_HYPERSENSITIVE}
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: C.n[800], cursor: "pointer" }}>
            <input type="checkbox" style={tick} checked={highAlert} disabled={busy} onChange={(e) => { setHighAlert(e.target.checked); setMsg(""); }} />
            {Q_HIGH_ALERT}
          </label>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={fieldLabel}>Medicine</span>
            <input
              autoFocus value={query} disabled={busy} maxLength={200}
              onChange={(e) => { setQuery(e.target.value); setMsg(""); }}
              placeholder="Type a brand name, e.g. Napa"
              style={inputSm}
            />
          </label>
          {query.trim().length >= 2 && (
            <div role="list" aria-label="Medicines" style={{ maxHeight: 180, overflowY: "auto", border: `0.5px solid ${C.n[200]}`, borderRadius: 6 }}>
              {isLoading && results.length === 0 && <div role="status" style={{ fontSize: 11.5, color: C.n[500], padding: "6px 8px" }}>Searching…</div>}
              {results.map((m) => (
                <div role="listitem" key={m.id}>
                  <button type="button" onClick={() => pick(m)}
                    style={{ width: "100%", textAlign: "left", border: "none", borderBottom: `0.5px solid ${C.n[100]}`, background: "transparent", padding: "5px 8px", cursor: "pointer", fontFamily: font, fontSize: 12, color: C.n[900] }}>
                    <b>{m.brandName}</b>{" "}
                    <span style={{ color: C.n[600] }}>{[m.dosageForm, m.strength].filter(Boolean).join(" ")}</span>
                    {m.genericName && <span style={{ color: C.n[600] }}> — {m.genericName}</span>}
                  </button>
                </div>
              ))}
              {!isLoading && (
                <div role="listitem">
                  <button type="button" onClick={pickTyped}
                    style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "5px 8px", cursor: "pointer", fontFamily: font, fontSize: 11.5, color: C.pri[600] }}>
                    Use “{query.trim()}” as typed (no generic name)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {msg && <div role="alert" style={{ fontSize: 11.5, color: C.danger[800] }}>{msg}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={() => void cancel()} disabled={busy} style={btnSecondary("sm")}>Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={busy} style={{ ...btnPrimary("sm"), ...(busy ? btnDisabled : null) }}>{busy ? "Adding…" : "Add"}</button>
      </div>
    </div>
  );
}
