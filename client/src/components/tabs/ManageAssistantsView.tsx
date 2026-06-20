"use client";

import { useEffect, useRef, useState } from "react";
import { C } from "@/theme";
import { ApiError, type AssistantCandidate, type AssistantRecord } from "@/lib/api";
import {
  useAddAssistant,
  useAssistantDefaults,
  useAssistants,
  useAssistantSearch,
  useRemoveAssistant,
  useUpdateAssistant,
  useUpdateAssistantDefaults,
} from "@/hooks/useAssistants";
import { PERMISSION_GROUPS, ALL_PERM_KEYS, PERM_LABEL_OF } from "@/lib/permissions";

const LABEL_OF = PERM_LABEL_OF;

const prettyProfession = (p: string | null): string =>
  p ? p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
const contactLine = (u: { email: string; mobile: string | null; profession: string | null }) =>
  `${u.email} · ${u.mobile ?? "—"} · ${prettyProfession(u.profession)}`;
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((k) => b.has(k));

// ── Shared styles ───────────────────────────────────────────
const card = { background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: 16 };
const btn = (bg: string, fg: string): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer",
  fontSize: 12, fontWeight: 500, background: bg, color: fg, fontFamily: "inherit",
});

// ── Checkbox grid (shared by both editors) ──────────────────
function PermissionGrid({ selected, onToggle }: { selected: Set<string>; onToggle: (key: string) => void }) {
  return (
    <>
      {PERMISSION_GROUPS.map((grp) => (
        <div key={grp.group} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: C.n[600], marginBottom: 6 }}>{grp.group}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
            {grp.perms.map((p) => (
              <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(p.key)} onChange={() => onToggle(p.key)} style={{ cursor: "pointer" }} />
                {p.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function MarkedChips({ keys }: { keys: string[] }) {
  if (keys.length === 0) return <div style={{ fontSize: 12, color: C.n[500] }}>Nothing marked yet.</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {keys.map((k) => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 20, background: C.pri[50], color: C.pri[600] }}>
          ✓ {LABEL_OF.get(k) ?? k}
        </span>
      ))}
    </div>
  );
}

const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (key: string) =>
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

export default function ManageAssistantsView({ onBack }: { onBack: () => void }) {
  const assistantsQuery = useAssistants();
  const assistants: AssistantRecord[] = assistantsQuery.data ?? [];
  const defaultsQuery = useAssistantDefaults();
  const defaultPerms: string[] = defaultsQuery.data?.permissions ?? [];

  const addAssistant = useAddAssistant();
  const updateAssistant = useUpdateAssistant();
  const removeAssistant = useRemoveAssistant();
  const updateDefaults = useUpdateAssistantDefaults();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchQuery = useAssistantSearch(query);
  const suggestions: AssistantCandidate[] = searchQuery.data ?? [];

  // Per-assistant editor
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());

  // Global Default access editor — seeded from the server once it loads.
  const [defaultDraft, setDefaultDraft] = useState<Set<string>>(new Set());
  const seeded = useRef(false);
  useEffect(() => {
    if (defaultsQuery.data && !seeded.current) {
      setDefaultDraft(new Set(defaultsQuery.data.permissions));
      seeded.current = true;
    }
  }, [defaultsQuery.data]);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const handleAdd = (u: AssistantCandidate) => {
    setError("");
    addAssistant.mutate(u.id, {
      onSuccess: () => { setQuery(""); setSearchOpen(false); },
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
      onSuccess: () => { if (editingId === a.id) setEditingId(null); },
      onError: (e) => setError(errMsg(e, "Could not remove assistant.")),
    });
  };

  // Open the per-assistant editor. If the assistant has no custom grants yet,
  // pre-fill with the doctor's default access so the defaults show ticked.
  const openEditor = (a: AssistantRecord) => {
    setEditingId((cur) => (cur === a.id ? null : a.id));
    setDraft(new Set(a.permissions.length ? a.permissions : defaultPerms));
  };

  const saveAccess = (a: AssistantRecord) => {
    setError("");
    updateAssistant.mutate(
      { id: a.id, input: { permissions: [...draft] } },
      {
        onSuccess: () => setEditingId(null),
        onError: (e) => setError(errMsg(e, "Could not save permissions.")),
      },
    );
  };

  const saveDefaults = () => {
    setError("");
    setInfo("");
    updateDefaults.mutate([...defaultDraft], {
      onSuccess: (res) => {
        const n = res.updatedAssistants;
        setInfo(n > 0 ? `Default access saved — applied to ${n} assistant${n === 1 ? "" : "s"}.` : "Default access saved.");
      },
      onError: (e) => setError(errMsg(e, "Could not save default access.")),
    });
  };
  const defaultsServerSet = new Set(defaultPerms);
  const defaultsDirty = !sameSet(defaultDraft, defaultsServerSet);

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
            Only registered users can be added — pick from the suggestions below. New assistants start with your default access.
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
          assistants.map((a) => {
            const isEditing = editingId === a.id;
            return (
              <div key={a.id} style={{ ...card, border: isEditing ? `1px solid ${C.info[400]}` : card.border }}>
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
                    <button onClick={() => openEditor(a)} style={btn(C.info[50], C.info[800])}>{isEditing ? "Close" : "Edit permissions"}</button>
                    <button onClick={() => toggleSuspend(a)} style={btn(C.warn[50], C.warn[800])}>{a.status === "active" ? "Suspend" : "Reinstate"}</button>
                    <button onClick={() => handleRemove(a)} style={btn(C.danger[50], C.danger[800])}>Remove</button>
                  </div>
                </div>

                {isEditing && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${C.n[200]}` }}>
                    <div style={{ fontSize: 11, color: C.n[600], marginBottom: 12 }}>
                      Your default access is pre-ticked. Add or remove to give {a.name.split(" ")[0]} different permissions, then Save.
                    </div>
                    <PermissionGrid selected={draft} onToggle={toggleInSet(setDraft)} />
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <button onClick={() => saveAccess(a)} disabled={updateAssistant.isPending} style={{ ...btn(C.pri[400], C.n[0]), opacity: updateAssistant.isPending ? 0.6 : 1 }}>
                        {updateAssistant.isPending ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setEditingId(null)} style={btn(C.n[100], C.n[800])}>Cancel</button>
                      <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                        <button type="button" onClick={() => setDraft(new Set(defaultPerms))} style={{ ...btn("transparent", C.info[800]), padding: "6px 4px" }}>Reset to default</button>
                        <button type="button" onClick={() => setDraft(new Set(ALL_PERM_KEYS))} style={{ ...btn("transparent", C.info[800]), padding: "6px 4px" }}>Select all</button>
                        <button type="button" onClick={() => setDraft(new Set())} style={{ ...btn("transparent", C.n[600]), padding: "6px 4px" }}>Clear</button>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Default access (global baseline) ────────────────── */}
      <div style={{ fontSize: 13, fontWeight: 500, margin: "22px 0 4px" }}>Default access</div>
      <div style={{ fontSize: 11, color: C.n[600], marginBottom: 10 }}>
        Tick the sections all your assistants should be able to edit. Saving applies the change to <strong>every</strong> assistant — ticking grants it to all of them, unticking revokes it from all of them. New assistants inherit this too. Any extra per-assistant permissions you set above are kept.
      </div>
      {info && (
        <div style={{ ...card, padding: "10px 14px", marginBottom: 10, background: C.pri[50], border: `0.5px solid ${C.pri[100]}`, color: C.pri[800], fontSize: 12 }}>
          {info}
        </div>
      )}
      <div style={card}>
        <PermissionGrid selected={defaultDraft} onToggle={toggleInSet(setDefaultDraft)} />

        <div style={{ marginTop: 4, paddingTop: 12, borderTop: `0.5px solid ${C.n[200]}` }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: C.n[600], marginBottom: 6 }}>Marked default access</div>
          <MarkedChips keys={[...defaultDraft]} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <button onClick={saveDefaults} disabled={!defaultsDirty || updateDefaults.isPending} style={{ ...btn(C.pri[400], C.n[0]), opacity: defaultsDirty && !updateDefaults.isPending ? 1 : 0.5, cursor: defaultsDirty && !updateDefaults.isPending ? "pointer" : "default" }}>
            {updateDefaults.isPending ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setDefaultDraft(new Set(defaultPerms))} disabled={!defaultsDirty} style={{ ...btn(C.n[100], C.n[800]), opacity: defaultsDirty ? 1 : 0.5, cursor: defaultsDirty ? "pointer" : "default" }}>Cancel</button>
          {!defaultsDirty && defaultPerms.length > 0 && <span style={{ fontSize: 11, color: C.pri[600], marginLeft: 4 }}>Saved</span>}
        </div>
      </div>
    </div>
  );
}
