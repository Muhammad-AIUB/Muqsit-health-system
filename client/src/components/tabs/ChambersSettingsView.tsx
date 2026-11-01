"use client";

// Settings → Chambers (physician's sheet 28/10/2026, item 8: "Settings er add
// chamber dia chamber add kora jabe"). The practice's OPD chambers — each keeps
// its own OPD list, schedule and prescription settings. Add, rename, edit the
// address (what an SMS to the chamber's patients will use later), remove
// (soft, asked first). The main chamber holds the list from before chambers and
// cannot be removed. Changing chambers is the practice doctor's; an assistant
// sees the list read-only.

import { useState } from "react";
import { C } from "@/theme";
import { btnDanger, btnDisabled, btnPrimary, btnSecondary, fieldLabel, inputMd, pageTitle } from "@/theme/styles";
import Icon from "@/components/common/Icon";
import { LoadError } from "@/components/common/ListState";
import { useMuqsit } from "@/context/MuqsitContext";
import { useCreateChamber, useRemoveChamber, useUpdateChamber } from "@/hooks/useChambers";
import { useActiveChamber } from "@/components/layout/ChamberPicker";
import { confirmAction, tell } from "@/lib/dialogs";
import { ApiError, type OpdChamber } from "@/lib/api";

// A refusal the server wrote for a person (400 / 403 / 404 here) is shown as
// written; anything else in plain words.
const why = (e: unknown) =>
  e instanceof ApiError && [400, 403, 404].includes(e.status) && e.message ? e.message : "Check your internet connection and try again.";

export default function ChambersSettingsView({ onBack }: { onBack: () => void }) {
  const { isAssistantMode } = useMuqsit();
  const { chambers, query } = useActiveChamber();
  const create = useCreateChamber();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const canEdit = !isAssistantMode;

  const add = async () => {
    if (!name.trim()) return;
    const sent = { name: name.trim(), address: address.trim() };
    try {
      await create.mutateAsync(sent);
      // Clears only what it sent: what was typed meanwhile stays.
      setName((n) => (n.trim() === sent.name ? "" : n));
      setAddress((a) => (a.trim() === sent.address ? "" : a));
    } catch (e) {
      void tell({ title: "The chamber was not added.", body: why(e) });
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <button onClick={onBack} style={btnSecondary("sm")}><Icon name="arrowLeft" size={14} /> Back</button>
        <div style={pageTitle}>Chambers</div>
      </div>
      <p style={{ fontSize: 13, color: C.n[600], margin: "0 0 14px", lineHeight: 1.5 }}>
        Each chamber keeps its own OPD list, schedule and prescription settings. Choose the one you are working in under <b>My Chamber</b>, beside Prescription.
      </p>

      {query.isError && <LoadError title="Could not load your chambers." onRetry={() => void query.refetch()} retrying={query.isFetching} />}
      {!query.isError && !chambers && <div style={{ fontSize: 13, color: C.n[500] }}>Loading…</div>}
      {!query.isError && chambers && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {chambers.map((c) => <ChamberRow key={c.id} chamber={c} canEdit={canEdit} />)}
        </div>
      )}

      {canEdit ? (
        <div style={{ marginTop: 20, border: `0.5px solid ${C.n[200]}`, borderRadius: 10, background: C.n[0], padding: "14px 16px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.n[900], marginBottom: 10 }}>Add chamber</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
              <span data-caption style={fieldLabel}>Chamber name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} style={inputMd} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "2 1 260px" }}>
              <span data-caption style={fieldLabel}>Address</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} style={inputMd} />
            </label>
            <button
              onClick={() => void add()}
              disabled={!name.trim() || create.isPending}
              style={{ ...btnPrimary("md"), ...(!name.trim() || create.isPending ? btnDisabled : null) }}
            >{create.isPending ? "Adding…" : "+ Add chamber"}</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16, fontSize: 12.5, color: C.n[600] }}>Only the practice doctor can add or change chambers.</div>
      )}
    </div>
  );
}

function ChamberRow({ chamber, canEdit }: { chamber: OpdChamber; canEdit: boolean }) {
  const update = useUpdateChamber();
  const remove = useRemoveChamber();
  // What is typed stays in the boxes until the server has it; a save clears
  // only what it sent.
  const [name, setName] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const shownName = name ?? chamber.name;
  const shownAddress = address ?? chamber.address;
  const dirty = (name !== null && name.trim() !== chamber.name) || (address !== null && address.trim() !== chamber.address);

  const save = async () => {
    const sent = { name: name ?? undefined, address: address ?? undefined };
    if (sent.name !== undefined && !sent.name.trim()) { void tell({ title: "Give the chamber a name.", tone: "info" }); return; }
    try {
      await update.mutateAsync({ id: chamber.id, ...sent });
      setName((n) => (n === sent.name ? null : n));
      setAddress((a) => (a === sent.address ? null : a));
    } catch (e) {
      void tell({ title: `"${chamber.name}" was not saved.`, body: why(e) });
    }
  };

  const doRemove = async () => {
    const ok = await confirmAction({
      title: `Remove the chamber "${chamber.name}"?`,
      body: "It is taken off your list and can no longer be chosen. The OPD visits already queued there are kept.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(chamber.id);
    } catch (e) {
      void tell({ title: `"${chamber.name}" was not removed.`, body: why(e) });
    }
  };

  return (
    <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 10, background: C.n[0], padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Icon name="chamber" size={16} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.n[900] }}>{chamber.name}</span>
        {chamber.isDefault && <span style={{ fontSize: 11, color: C.n[600], border: `0.5px solid ${C.n[300]}`, borderRadius: 6, padding: "0 6px" }}>Main · holds the list from before chambers</span>}
      </div>
      {canEdit ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
            <span data-caption style={fieldLabel}>Name</span>
            <input value={shownName} onChange={(e) => setName(e.target.value)} maxLength={120} style={inputMd} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "2 1 260px" }}>
            <span data-caption style={fieldLabel}>Address</span>
            <input value={shownAddress} onChange={(e) => setAddress(e.target.value)} maxLength={500} style={inputMd} />
          </label>
          <button onClick={() => void save()} disabled={!dirty || update.isPending} style={{ ...btnPrimary("md"), ...(!dirty || update.isPending ? btnDisabled : null) }}>
            {update.isPending ? "Saving…" : "Save"}
          </button>
          {!chamber.isDefault && (
            <button onClick={() => void doRemove()} disabled={remove.isPending} aria-label={`Remove ${chamber.name}`} style={btnDanger("md")}>Remove</button>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.n[700] }}>{chamber.address || <span style={{ color: C.n[500] }}>No address</span>}</div>
      )}
    </div>
  );
}
