"use client";

import { useEffect, useRef, useState } from "react";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { usePatientChat, useSendChat } from "@/hooks/useChat";
import { uploadImage, type ChatMessage } from "@/lib/api";
import { formatActivityTime } from "@/lib/activityFormat";

// 4.docx: a per-patient team chat. Shown under the prescription's Notification
// area whenever a patient is loaded. Participants — owner, assistants and
// assigned supervising doctors — discuss the patient. Text + image/file
// attachment; polled; no edit/delete.

const isImageUrl = (u: string) => /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(u);

export default function PatientChat() {
  const { currentPatientId, ptName } = useMuqsit();
  const { data: messages = [], isLoading } = usePatientChat(currentPatientId);
  const send = useSendChat(currentPatientId);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ url: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (!currentPatientId) return null;

  const onAttach = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setPendingFile({ url, name: file.name });
    } catch {
      window.alert("Could not upload the file.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const body = text.trim();
    if (!body && !pendingFile) return;
    try {
      await send.mutateAsync({ body: body || undefined, attachmentUrl: pendingFile?.url });
      setText(""); setPendingFile(null);
    } catch {
      window.alert("Could not send the message.");
    }
  };

  const canSend = !send.isPending && (!!text.trim() || !!pendingFile);

  return (
    <div style={{ marginTop: 22, paddingTop: 16, borderTop: `0.5px solid ${C.n[200]}` }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.n[800], textAlign: "center", marginBottom: 4 }}>
        Patient discussion
      </div>
      <div style={{ fontSize: 11, color: C.n[500], textAlign: "center", marginBottom: 12 }}>
        Team chat for {ptName.trim() || "this patient"} — primary, assistants &amp; supervising doctors.
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
          <span>📎 {pendingFile.name}</span>
          <button onClick={() => setPendingFile(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
      )}

      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => { onAttach(e.target.files?.[0]); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Attach image / file" style={{ padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 14, cursor: "pointer" }}>{uploading ? "…" : "📎"}</button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Write a message…  (Enter to send, Shift+Enter for newline)"
          rows={1}
          style={{ flex: 1, resize: "none", padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, fontSize: 13, fontFamily: font, outline: "none", color: C.n[900], maxHeight: 120, boxSizing: "border-box" }}
        />
        <button onClick={submit} disabled={!canSend} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 13, fontWeight: 600, cursor: canSend ? "pointer" : "not-allowed", fontFamily: font, opacity: canSend ? 1 : 0.6 }}>Send</button>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.mine;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "80%", background: mine ? C.pri[400] : C.n[0], color: mine ? "#fff" : C.n[900], border: mine ? "none" : `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "7px 11px", fontSize: 12.5, lineHeight: 1.45 }}>
        {!mine && <div style={{ fontSize: 10.5, fontWeight: 700, color: C.pri[600], marginBottom: 2 }}>{m.authorName}</div>}
        {m.body && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>}
        {m.attachmentUrl && (
          isImageUrl(m.attachmentUrl) ? (
            <a href={m.attachmentUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.attachmentUrl} alt="attachment" style={{ maxWidth: "100%", borderRadius: 6, marginTop: m.body ? 6 : 0, display: "block" }} />
            </a>
          ) : (
            <a href={m.attachmentUrl} target="_blank" rel="noreferrer" style={{ color: mine ? "#fff" : C.info[800], textDecoration: "underline", fontSize: 12, display: "inline-block", marginTop: m.body ? 4 : 0 }}>📎 Attachment</a>
          )
        )}
      </div>
      <div style={{ fontSize: 10, color: C.n[400], marginTop: 2 }}>{formatActivityTime(m.createdAt)}</div>
    </div>
  );
}
