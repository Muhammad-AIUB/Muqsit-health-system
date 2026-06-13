"use client";

import { useRef, useState } from "react";
import { C } from "@/theme";
import { ApiError, type AssistantCandidate, type AssistantRecord } from "@/lib/api";
import {
  useAddAssistant,
  useAssistants,
  useAssistantSearch,
  useRemoveAssistant,
  useUpdateAssistant,
} from "@/hooks/useAssistants";

// ── Permission catalog ──────────────────────────────────────
// Mirrors the editable sections of the Prescription page (see
// leftFields in MuqsitContext) and the Patient settings tabs.
// Checking a box grants edit access to that section.
interface Perm {
  key: string;
  label: string;
}
interface PermGroup {
  group: string;
  perms: Perm[];
}

const PERMISSION_GROUPS: PermGroup[] = [
  {
    group: "Prescription page",
    perms: [
      { key: "rx.chiefComplaints", label: "Chief complaints" },
      { key: "rx.history", label: "History" },
      { key: "rx.investigation", label: "Investigation report findings" },
      { key: "rx.drugHistory", label: "Drug history" },
      { key: "rx.onExamination", label: "On examination" },
      { key: "rx.note", label: "Note / plan" },
      { key: "rx.provisionalDiagnosis", label: "Provisional diagnosis" },
      { key: "rx.associatedIllness", label: "Associated illness" },
      { key: "rx.finalDiagnosis", label: "Final diagnosis" },
      { key: "rx.medicines", label: "Medicines (Rx)" },
      { key: "rx.advice", label: "Advice" },
      { key: "rx.adviceTest", label: "Advice — tests" },
      { key: "rx.followUp", label: "Follow-up" },
      { key: "rx.savePrint", label: "Save and print" },
    ],
  },
  {
    group: "Patient settings page",
    perms: [
      { key: "pt.info", label: "Patient information" },
      { key: "pt.doctors", label: "Supervising doctor list" },
      { key: "pt.family", label: "Family tree" },
      { key: "pt.security", label: "Security" },
    ],
  },
];

const ALL_PERMS: Perm[] = PERMISSION_GROUPS.flatMap((g) => g.perms);
const ALL_PERM_KEYS = ALL_PERMS.map((p) => p.key);
const LABEL_OF = new Map(ALL_PERMS.map((p) => [p.key, p.label]));

// Registration professions are stored as snake_case enums — show them nicely.
const prettyProfession = (p: string | null): string =>
  p ? p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

const contactLine = (u: { email: string; mobile: string | null; profession: string | null }) =>
  `${u.email} · ${u.mobile ?? "—"} · ${prettyProfession(u.profession)}`;

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

// ── Shared styles ───────────────────────────────────────────
const card = { background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: 16 };
const btn = (bg: string, fg: string): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer",
  fontSize: 12, fontWeight: 500, background: bg, color: fg, fontFamily: "inherit",
});

export default function ManageAssistantsView({ onBack }: { onBack: () => void }) {
  const assistantsQuery = useAssistants();
  const assistants: AssistantRecord[] = assistantsQuery.data ?? [];

  const addAssistant = useAddAssistant();
  const updateAssistant = useUpdateAssistant();
  const removeAssistant = useRemoveAssistant();

  // Add-assistant search box
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchQuery = useAssistantSearch(query);
  const suggestions: AssistantCandidate[] = searchQuery.data ?? [];

  // The Default access panel doubles as the per-assistant permission editor.
  // `editingId` is the assistant link currently loaded into it; `draft` is the
  // working set of ticked permissions. Both clear after Save/Cancel.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const accessRef = useRef<HTMLDivElement>(null);

  const editing = assistants.find((a) => a.id === editingId) ?? null;

  const handleAdd = (u: AssistantCandidate) => {
    setError("");
    addAssistant.mutate(u.id, {
      onSuccess: () => {
        setQuery("");
        setSearchOpen(false);
      },
      onError: (e) => setError(errMsg(e, "Could not add assistant.")),
    });
  };

  const toggleSuspend = (a: AssistantRecord) => {
    setError("");
    updateAssistant.mutate(
      { id: a.id, input: { status: a.status === "active" ? "suspended" : "active" } },
      { onError: (e) => setError(errMsg(e, "Could not update status.")) },
    );
  };

  const handleRemove = (a: AssistantRecord) => {
    if (!window.confirm(`Permanently remove ${a.name}? This cannot be undone.`)) return;
    setError("");
    removeAssistant.mutate(a.id, {
      onSuccess: () => {
        if (editingId === a.id) {
          setEditingId(null);
          setDraft(new Set());
        }
      },
      onError: (e) => setError(errMsg(e, "Could not remove assistant.")),
    });
  };

  // Click "Edit permissions" → load this assistant's saved access into the
  // Default access panel (pre-ticked) and scroll it into view.
  const openEditor = (a: AssistantRecord) => {
    setEditingId(a.id);
    setDraft(new Set(a.permissions));
    requestAnimationFrame(() => accessRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const toggleDraft = (key: string) =>
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Save writes the draft back to the assistant, then clears the panel.
  const saveAccess = () => {
    if (!editingId) return;
    setError("");
    updateAssistant.mutate(
      { id: editingId, input: { permissions: [...draft] } },
      {
        onSuccess: () => {
          setEditingId(null);
          setDraft(new Set());
        },
        onError: (e) => setError(errMsg(e, "Could not save permissions.")),
      },
    );
  };

  const cancelAccess = () => {
    setEditingId(null);
    setDraft(new Set());
  };

  const saving = updateAssistant.isPending;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ ...btn(C.n[100], C.n[800]), padding: "4px 10px" }}>← Back</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Manage your assistants</div>
          <div style={{ fontSize: 11, color: C.n[600] }}>Role based access control &amp; dynamic permission</div>
        </div>
      </div>

      {error && (
        <div style={{ ...card, padding: "10px 14px", marginBottom: 12, background: C.danger[50], border: `0.5px solid ${C.danger[100]}`, color: C.danger[800], fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* ── Your assistants ─────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>Your assistants</div>
        <button onClick={() => setSearchOpen((s) => !s)} style={btn(C.pri[50], C.pri[600])}>+ Add new assistant</button>
      </div>

      {/* Add-by-search box */}
      {searchOpen && (
        <div style={{ ...card, marginBottom: 12 }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email or phone number…"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 7, border: `0.5px solid ${C.n[300]}`, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 11, color: C.n[500], marginTop: 6 }}>
            Only registered users can be added — pick from the suggestions below.
          </div>
          {query.trim() && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {searchQuery.isLoading ? (
                <div style={{ fontSize: 12, color: C.n[500], padding: "6px 2px" }}>Searching…</div>
              ) : suggestions.length === 0 ? (
                <div style={{ fontSize: 12, color: C.n[500], padding: "6px 2px" }}>No registered user matches that email or phone.</div>
              ) : (
                suggestions.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => !addAssistant.isPending && handleAdd(u)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, border: `0.5px solid ${C.n[200]}`, cursor: addAssistant.isPending ? "default" : "pointer", background: C.n[50], opacity: addAssistant.isPending ? 0.6 : 1 }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: C.n[600] }}>{contactLine(u)}</div>
                    </div>
                    <span style={{ fontSize: 12, color: C.pri[600], fontWeight: 500 }}>Add</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Assistant list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {assistantsQuery.isLoading ? (
          <div style={{ ...card, textAlign: "center", color: C.n[500], fontSize: 12 }}>Loading assistants…</div>
        ) : assistantsQuery.isError ? (
          <div style={{ ...card, textAlign: "center", color: C.danger[800], fontSize: 12 }}>Could not load assistants. Is the API running?</div>
        ) : assistants.length === 0 ? (
          <div style={{ ...card, textAlign: "center", color: C.n[500], fontSize: 12 }}>
            No assistants yet. Use “Add new assistant” to add as many as you want.
          </div>
        ) : (
          assistants.map((a) => (
            <div
              key={a.id}
              style={{ ...card, border: editingId === a.id ? `1px solid ${C.info[400]}` : card.border }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 20, background: a.status === "active" ? C.pri[50] : C.warn[50], color: a.status === "active" ? C.pri[600] : C.warn[800] }}>
                      {a.status === "active" ? "Active" : "Suspended"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: C.n[600], marginTop: 2 }}>{contactLine(a)}</div>
                  <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>{a.permissions.length} permission{a.permissions.length === 1 ? "" : "s"} granted</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => openEditor(a)} style={btn(C.info[50], C.info[800])}>
                    {editingId === a.id ? "Editing…" : "Edit permissions"}
                  </button>
                  <button onClick={() => toggleSuspend(a)} style={btn(C.warn[50], C.warn[800])}>{a.status === "active" ? "Suspend" : "Reinstate"}</button>
                  <button onClick={() => handleRemove(a)} style={btn(C.danger[50], C.danger[800])}>Remove</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Default access (per-assistant permission editor) ── */}
      <div ref={accessRef} style={{ fontSize: 13, fontWeight: 500, margin: "22px 0 4px" }}>
        Default access{editing ? ` — ${editing.name}` : ""}
      </div>
      <div style={{ fontSize: 11, color: C.n[600], marginBottom: 10 }}>
        {editing
          ? `Tick the sections ${editing.name.split(" ")[0]} may edit, then Save. Already-granted access is pre-ticked; saving updates their access and clears this panel.`
          : "Click “Edit permissions” on an assistant above to load and edit their access here."}
      </div>

      <div style={{ ...card, opacity: editing ? 1 : 0.6 }}>
        {PERMISSION_GROUPS.map((grp) => (
          <div key={grp.group} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.n[600], marginBottom: 6 }}>{grp.group}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
              {grp.perms.map((p) => (
                <label
                  key={p.key}
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: editing ? "pointer" : "default", color: editing ? "inherit" : C.n[500] }}
                >
                  <input
                    type="checkbox"
                    checked={draft.has(p.key)}
                    disabled={!editing}
                    onChange={() => toggleDraft(p.key)}
                    style={{ cursor: editing ? "pointer" : "default" }}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* Marked access summary */}
        <div style={{ marginTop: 4, paddingTop: 12, borderTop: `0.5px solid ${C.n[200]}` }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: C.n[600], marginBottom: 6 }}>Marked access</div>
          {draft.size === 0 ? (
            <div style={{ fontSize: 12, color: C.n[500] }}>Nothing marked yet.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[...draft].map((k) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 20, background: C.pri[50], color: C.pri[600] }}>
                  ✓ {LABEL_OF.get(k) ?? k}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <button onClick={saveAccess} disabled={!editing || saving} style={{ ...btn(C.pri[400], C.n[0]), opacity: editing && !saving ? 1 : 0.5, cursor: editing && !saving ? "pointer" : "default" }}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={cancelAccess} disabled={!editing} style={{ ...btn(C.n[100], C.n[800]), opacity: editing ? 1 : 0.5, cursor: editing ? "pointer" : "default" }}>Cancel</button>
          {editing && (
            <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setDraft(new Set(ALL_PERM_KEYS))} style={{ ...btn("transparent", C.info[800]), padding: "6px 4px" }}>Select all</button>
              <button type="button" onClick={() => setDraft(new Set())} style={{ ...btn("transparent", C.n[600]), padding: "6px 4px" }}>Clear</button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
