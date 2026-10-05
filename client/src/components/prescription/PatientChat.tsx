"use client";

import { useEffect, useRef, useState } from "react";
import { C, font } from "@/theme";
import { tell } from "@/lib/dialogs";
import { btnPrimary, btnSecondary } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";
import { usePatientChat, useSendChat } from "@/hooks/useChat";
import { ApiError, uploadImage, type ChatMessage } from "@/lib/api";
import { formatActivityTime } from "@/lib/activityFormat";
import { imageUrlIsRenderable } from "@/lib/imageFormats";
import Icon from "@/components/common/Icon";

// 4.docx: a per-patient team chat. Shown under the prescription's Notification
// area whenever a patient is loaded. Participants — owner, assistants and
// assigned supervising doctors — discuss the patient. Text + image/file
// attachment; polled; no edit/delete.

// One table for the whole app (`lib/imageFormats.ts`). This regex was the app's
// FIFTH disagreeing format list: it knew nothing of AVIF — which the server
// stores — so an AVIF attachment rendered as a bare link, and it listed `svg`,
// which the magic-byte check has never accepted and which must never be drawn
// inline anyway (an SVG carries script).
const isImageUrl = imageUrlIsRenderable;
// Only ever emit an href/src for an http(s) URL. A javascript:/data: payload
// (e.g. a stored-XSS attempt from a supervising doctor) is rendered as plain
// text instead of a clickable/loadable link so it can never execute.
const safeUrl = (u?: string | null): string | undefined =>
  u && /^https?:\/\//i.test(u) ? u : undefined;

export default function PatientChat({ patientId: pidProp, patientName }: { patientId?: string | null; patientName?: string } = {}) {
  const { currentPatientId, ptName } = useMuqsit();
  // Use the explicit patient when given (e.g. the Supervised-patients view),
  // otherwise the editor's loaded patient.
  const currentPatient = pidProp !== undefined ? pidProp : currentPatientId;
  const displayName = patientName !== undefined ? patientName : ptName;
  const { data: messages = [], isLoading } = usePatientChat(currentPatient);
  const send = useSendChat(currentPatient);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ url: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ⚕️ A half-typed note or attached file belongs to the patient it was
  // written for. When the patient changes under a mounted chat (the editor
  // loads another patient, or a caller reuses this instance), drop both — Send
  // would otherwise post patient A's note/photo into patient B's team thread.
  const patientRef = useRef(currentPatient);
  patientRef.current = currentPatient;
  const [draftFor, setDraftFor] = useState(currentPatient);
  if (draftFor !== currentPatient) {
    setDraftFor(currentPatient);
    setText("");
    setPendingFile(null);
  }

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (!currentPatient) return null;

  const onAttach = async (file?: File) => {
    if (!file) return;
    const forPatient = currentPatient;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      // Resolved after a patient switch: it was meant for the previous patient.
      if (patientRef.current !== forPatient) return;
      setPendingFile({ url, name: file.name });
    } catch (e) {
      tell({ title: "The file was not attached.", body: e instanceof ApiError ? e.message : "Check your internet connection and try again." });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const body = text.trim();
    if (!body && !pendingFile) return;
    const forPatient = currentPatient;
    try {
      await send.mutateAsync({ body: body || undefined, attachmentUrl: pendingFile?.url });
      // Don't wipe a draft already started for the next patient.
      if (patientRef.current === forPatient) { setText(""); setPendingFile(null); }
    } catch (e) {
      // The text stays in the box, so nothing typed is lost.
      tell({ title: "The message was not sent.", body: e instanceof ApiError ? e.message : "Check your internet connection and try again." });
    }
  };

  const canSend = !send.isPending && (!!text.trim() || !!pendingFile);

  return (
    <div style={{ marginTop: 22, paddingTop: 16, borderTop: `0.5px solid ${C.n[200]}` }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.n[800], textAlign: "center", marginBottom: 4 }}>
        Patient discussion
      </div>
      <div style={{ fontSize: 11, color: C.n[500], textAlign: "center", marginBottom: 12 }}>
        Team chat for {displayName.trim() || "this patient"} — primary, assistants &amp; supervising doctors.
      </div>

      <div ref={scrollRef} style={{ background: C.n[50], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: 12, maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {isLoading && messages.length === 0 ? (
          <div style={{ fontSize: 12, color: C.n[500], textAlign: "center", padding: 12 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ fontSize: 12, color: C.n[500], textAlign: "center", padding: 12 }}>No messages yet — start the discussion below.</div>
        ) : (
          messages.map((msg) => <Bubble key={msg.id} m={msg} />)
        )}
      </div>

      {pendingFile && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.n[700], background: C.pri[50], border: `0.5px solid ${C.pri[100]}`, borderRadius: 8, padding: "6px 10px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}><Icon name="paperclip" size={13} /> {pendingFile.name}</span>
          <button aria-label="Remove attachment" onClick={() => setPendingFile(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
      )}

      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => { onAttach(e.target.files?.[0]); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Attach image / file" aria-label="Attach image or file" style={{ ...btnSecondary("md"), padding: "0 11px", color: C.n[600] }}>{uploading ? "…" : <Icon name="paperclip" size={16} />}</button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Write a message…  (Enter to send, Shift+Enter for newline)"
          rows={1}
          style={{ flex: 1, resize: "none", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.n[300]}`, fontSize: 13, fontFamily: font, outline: "none", color: C.n[900], maxHeight: 120, boxSizing: "border-box" }}
        />
        <button onClick={submit} disabled={!canSend} style={{ ...btnPrimary("md"), fontWeight: 600, cursor: canSend ? "pointer" : "not-allowed", opacity: canSend ? 1 : 0.6 }}>Send</button>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.mine;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "80%", background: mine ? C.pri[400] : C.n[0], color: mine ? "#fff" : C.n[900], border: mine ? "none" : `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "7px 11px", fontSize: 12.5, lineHeight: 1.45 }}>
        {!mine && <div style={{ fontSize: 11, fontWeight: 700, color: C.pri[600], marginBottom: 2 }}>{m.authorName}</div>}
        {m.body && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>}
        {m.attachmentUrl && (() => {
          const href = safeUrl(m.attachmentUrl);
          // Non-http(s) attachment: never make it clickable/loadable — show it
          // as inert text so a javascript:/data: payload can't execute.
          if (!href) {
            return (
              <div style={{ fontSize: 12, color: mine ? "#fff" : C.n[500], marginTop: m.body ? 4 : 0, wordBreak: "break-word" }}><Icon name="paperclip" size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />Attachment</div>
            );
          }
          return isImageUrl(href) ? (
            <a href={href} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={href} alt="attachment" style={{ maxWidth: "100%", borderRadius: 6, marginTop: m.body ? 6 : 0, display: "block" }} />
            </a>
          ) : (
            <a href={href} target="_blank" rel="noreferrer" style={{ color: mine ? "#fff" : C.info[800], textDecoration: "underline", fontSize: 12, display: "inline-block", marginTop: m.body ? 4 : 0 }}><Icon name="paperclip" size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />Attachment</a>
          );
        })()}
      </div>
      <div style={{ fontSize: 11, color: C.n[400], marginTop: 2 }}>{formatActivityTime(m.createdAt)}</div>
    </div>
  );
}
