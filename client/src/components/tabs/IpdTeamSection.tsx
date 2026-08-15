"use client";

import { useState } from "react";
import { C } from "@/theme";
import { ApiError, type Ward, type WardCandidate } from "@/lib/api";
import {
  useAddWardMember,
  useCreateWard,
  useDeleteWard,
  useRemoveWardMember,
  useRenameWard,
  useUpdateWardMember,
  useWardMemberSearch,
  useWards,
} from "@/hooks/useWards";
import { ALL_IPD_PERM_KEYS, IPD_PERMISSION_GROUPS } from "@/lib/permissions";
import {
  MarkedChips, PermissionGrid, btn, card, contactLine, sameSet, toggleInSet,
} from "./permissionUi";

// ⚕️ "Your IPD team" — the second half of the Manage assistants page
// ("new correction 2.docx" #2).
//
// A ward groups admissions; its team is who works that ward. Every admission
// on the ward is under the whole team, and membership is expected to change
// (rotations), so nothing is copied onto the admission itself.
//
// Permissions are ticked PER MEMBER, at the physician's request — a ward team
// mixes doctors and nurses, and they should not automatically get the same
// reach. A brand-new member starts with NOTHING ticked: on a ward, silence has
// to mean "cannot", never "can".

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function IpdTeamSection() {
  const wardsQuery = useWards();
  const wards: Ward[] = wardsQuery.data ?? [];

  const createWard = useCreateWard();
  const renameWard = useRenameWard();
  const deleteWard = useDeleteWard();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  const submitWard = () => {
    const name = newName.trim();
    if (!name) return setError("Enter a ward name.");
    setError("");
    createWard.mutate(name, {
      onSuccess: () => { setNewName(""); setAdding(false); },
      onError: (e) => setError(errMsg(e, "Could not create the ward.")),
    });
  };

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>Your IPD team</div>
        <button onClick={() => { setAdding((s) => !s); setError(""); }} style={btn(C.pri[50], C.pri[600])}>
          {adding ? "Cancel" : "+ Add ward"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: C.n[600], marginBottom: 10 }}>
        A ward holds admitted patients, and its team is whoever works that ward — every patient
        on the ward is under the whole team. Tick what each member may do; a new member starts
        with nothing ticked. Change the team whenever the rota changes.
      </div>

      {error && (
        <div style={{ ...card, padding: "10px 14px", marginBottom: 10, background: C.danger[50], border: `0.5px solid ${C.danger[100]}`, color: C.danger[800], fontSize: 12 }}>
          {error}
        </div>
      )}

      {adding && (
        <div style={{ ...card, marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitWard(); }}
            placeholder="Ward name — e.g. Ward 3, Male Medicine, Cabin block A"
            style={{ flex: "1 1 240px", padding: "8px 12px", borderRadius: 7, border: `0.5px solid ${C.n[300]}`, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
          />
          <button onClick={submitWard} disabled={createWard.isPending} style={{ ...btn(C.pri[400], C.n[0]), opacity: createWard.isPending ? 0.6 : 1 }}>
            {createWard.isPending ? "Adding…" : "Add ward"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {wardsQuery.isLoading ? (
          <div style={{ ...card, textAlign: "center", color: C.n[500], fontSize: 12 }}>Loading wards…</div>
        ) : wardsQuery.isError ? (
          <div style={{ ...card, textAlign: "center", color: C.danger[800], fontSize: 12 }}>Could not load wards. Is the API running?</div>
        ) : wards.length === 0 ? (
          <div style={{ ...card, textAlign: "center", color: C.n[500], fontSize: 12 }}>
            No wards yet. Add one, then put your team on it.
          </div>
        ) : (
          wards.map((w) => (
            <WardCard
              key={w.id}
              ward={w}
              onError={setError}
              onRename={(name) => renameWard.mutate({ id: w.id, name }, { onError: (e) => setError(errMsg(e, "Could not rename the ward.")) })}
              onDelete={() => deleteWard.mutate(w.id, { onError: (e) => setError(errMsg(e, "Could not delete the ward.")) })}
              busy={renameWard.isPending || deleteWard.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

function WardCard({
  ward, onRename, onDelete, onError, busy,
}: {
  ward: Ward;
  onRename: (name: string) => void;
  onDelete: () => void;
  onError: (msg: string) => void;
  busy: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(ward.name);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useWardMemberSearch(searchOpen ? ward.id : null, query);
  const candidates: WardCandidate[] = search.data ?? [];

  const addMember = useAddWardMember();
  const updateMember = useUpdateWardMember();
  const removeMember = useRemoveWardMember();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());

  const commitRename = () => {
    const next = name.trim();
    setRenaming(false);
    if (!next || next === ward.name) { setName(ward.name); return; }
    onRename(next);
  };

  // Deleting a ward never deletes an admitted patient — the admissions are
  // unlinked and keep their record. Say the number out loud so the doctor is
  // deciding with the consequence in front of them, not after it.
  const confirmDelete = () => {
    const tail = ward.admissionCount
      ? ` ${ward.admissionCount} admitted patient${ward.admissionCount === 1 ? "" : "s"} will stay in IPD but no longer belong to a ward team.`
      : "";
    if (!window.confirm(`Delete the ward "${ward.name}" and its team of ${ward.members.length}?${tail}`)) return;
    onDelete();
  };

  const openEditor = (memberId: string, permissions: string[]) => {
    setEditingId((cur) => (cur === memberId ? null : memberId));
    setDraft(new Set(permissions));
  };

  const savePerms = (memberId: string) => {
    updateMember.mutate(
      { wardId: ward.id, memberId, input: { permissions: [...draft] } },
      { onSuccess: () => setEditingId(null), onError: (e) => onError(errMsg(e, "Could not save permissions.")) },
    );
  };

  return (
    <div style={card}>
      {/* Ward header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") { setName(ward.name); setRenaming(false); }
            }}
            style={{ flex: "1 1 200px", padding: "5px 10px", borderRadius: 7, border: `0.5px solid ${C.n[300]}`, fontSize: 13, fontFamily: "inherit" }}
          />
        ) : (
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{ward.name}</div>
            <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>
              {ward.members.length} team member{ward.members.length === 1 ? "" : "s"} · {ward.admissionCount} admitted patient{ward.admissionCount === 1 ? "" : "s"}
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button onClick={() => { setSearchOpen((s) => !s); setQuery(""); }} style={btn(C.pri[50], C.pri[600])}>
            {searchOpen ? "Close" : "+ Add team member"}
          </button>
          <button onClick={() => { setName(ward.name); setRenaming(true); }} disabled={busy} style={btn(C.info[50], C.info[800])}>Rename</button>
          <button onClick={confirmDelete} disabled={busy} style={btn(C.danger[50], C.danger[800])}>Delete ward</button>
        </div>
      </div>

      {/* Add a member */}
      {searchOpen && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${C.n[200]}` }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email or phone number…"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 7, border: `0.5px solid ${C.n[300]}`, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 11, color: C.n[500], marginTop: 6 }}>
            Only registered users can be added — pick from the suggestions below. They join with no
            permissions until you tick them.
          </div>
          {query.trim() && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {search.isLoading ? (
                <div style={{ fontSize: 12, color: C.n[500], padding: "6px 2px" }}>Searching…</div>
              ) : candidates.length === 0 ? (
                <div style={{ fontSize: 12, color: C.n[500], padding: "6px 2px" }}>No registered user matches that email or phone.</div>
              ) : (
                candidates.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => {
                      if (addMember.isPending) return;
                      addMember.mutate(
                        { wardId: ward.id, userId: u.id },
                        {
                          onSuccess: () => { setQuery(""); setSearchOpen(false); },
                          onError: (e) => onError(errMsg(e, "Could not add the team member.")),
                        },
                      );
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, border: `0.5px solid ${C.n[200]}`, cursor: addMember.isPending ? "default" : "pointer", background: C.n[50], opacity: addMember.isPending ? 0.6 : 1 }}
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

      {/* Team members */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {ward.members.length === 0 ? (
          <div style={{ fontSize: 12, color: C.n[500] }}>No one on this team yet.</div>
        ) : (
          ward.members.map((m) => {
            const isEditing = editingId === m.id;
            const dirty = !sameSet(draft, new Set(m.permissions));
            return (
              <div key={m.id} style={{ border: `0.5px solid ${isEditing ? C.info[400] : C.n[200]}`, borderRadius: 8, padding: 12, background: C.n[50] }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 20, background: m.status === "active" ? C.pri[50] : C.warn[50], color: m.status === "active" ? C.pri[600] : C.warn[800] }}>
                        {m.status === "active" ? "Active" : "Suspended"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: C.n[600], marginTop: 2 }}>{contactLine(m)}</div>
                    <div style={{ fontSize: 11, color: m.permissions.length ? C.n[500] : C.warn[800], marginTop: 2 }}>
                      {m.permissions.length
                        ? `${m.permissions.length} permission${m.permissions.length === 1 ? "" : "s"} granted`
                        : "No permissions yet — read only"}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button onClick={() => openEditor(m.id, m.permissions)} style={btn(C.info[50], C.info[800])}>
                      {isEditing ? "Close" : "Edit permissions"}
                    </button>
                    <button
                      onClick={() => updateMember.mutate(
                        { wardId: ward.id, memberId: m.id, input: { status: m.status === "active" ? "suspended" : "active" } },
                        { onError: (e) => onError(errMsg(e, "Could not update status.")) },
                      )}
                      style={btn(C.warn[50], C.warn[800])}
                    >
                      {m.status === "active" ? "Suspend" : "Reinstate"}
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm(`Remove ${m.name} from ${ward.name}?`)) return;
                        removeMember.mutate(
                          { wardId: ward.id, memberId: m.id },
                          { onSuccess: () => { if (editingId === m.id) setEditingId(null); }, onError: (e) => onError(errMsg(e, "Could not remove the member.")) },
                        );
                      }}
                      style={btn(C.danger[50], C.danger[800])}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${C.n[200]}` }}>
                    <div style={{ fontSize: 11, color: C.n[600], marginBottom: 12 }}>
                      Tick what {m.name.split(" ")[0]} may edit on this ward. Anything left unticked stays read-only for them.
                    </div>
                    <PermissionGrid selected={draft} onToggle={toggleInSet(setDraft)} groups={IPD_PERMISSION_GROUPS} />
                    <div style={{ marginTop: 4, paddingTop: 12, borderTop: `0.5px solid ${C.n[200]}` }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: C.n[600], marginBottom: 6 }}>Marked access</div>
                      <MarkedChips keys={[...draft]} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                      <button
                        onClick={() => savePerms(m.id)}
                        disabled={!dirty || updateMember.isPending}
                        style={{ ...btn(C.pri[400], C.n[0]), opacity: dirty && !updateMember.isPending ? 1 : 0.5, cursor: dirty && !updateMember.isPending ? "pointer" : "default" }}
                      >
                        {updateMember.isPending ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setEditingId(null)} style={btn(C.n[100], C.n[800])}>Cancel</button>
                      <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                        <button type="button" onClick={() => setDraft(new Set(ALL_IPD_PERM_KEYS))} style={{ ...btn("transparent", C.info[800]), padding: "6px 4px" }}>Select all</button>
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
    </div>
  );
}
