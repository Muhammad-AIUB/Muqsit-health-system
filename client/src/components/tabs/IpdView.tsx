"use client";

import { C, colorOf, font } from "@/theme";
import { useMedCare } from "@/context/MedCareContext";
import { ipdData, ipdEvents } from "@/data/patients";
import Pill from "@/components/common/Pill";

export default function IpdView() {
  const { eventsPatient, setEventsPatient, eventMsg, setEventMsg } = useMedCare();

  const sendEvent = () => {
    if (!eventsPatient) return;
    const msg = eventMsg.trim();
    if (!msg) return;
    const now = new Date();
    const ts = `${now.getDate()} ${now.toLocaleString("default", { month: "short" })} ${now.getFullYear()} · ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    ipdEvents[eventsPatient.bed] = [...(ipdEvents[eventsPatient.bed] || []), { ts, author: "Dr.", role: "", note: msg, report: null }];
    setEventMsg("");
    setEventsPatient({ ...eventsPatient });
  };

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>IPD ward management</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <div style={{ background: C.n[100], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.n[600] }}>Total beds</div><div style={{ fontSize: 22, fontWeight: 500 }}>12</div></div>
        <div style={{ background: C.pri[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.pri[600] }}>Occupied</div><div style={{ fontSize: 22, fontWeight: 500, color: C.pri[600] }}>4</div></div>
        <div style={{ background: C.danger[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.danger[800] }}>Critical</div><div style={{ fontSize: 22, fontWeight: 500, color: C.danger[800] }}>1</div></div>
        <div style={{ background: C.info[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.info[800] }}>Discharge</div><div style={{ fontSize: 22, fontWeight: 500, color: C.info[800] }}>1</div></div>
      </div>
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "4px 14px" }}>
        {ipdData.map((p, i) => (
          <div key={p.bed} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < ipdData.length - 1 ? `0.5px solid ${C.n[200]}` : "none" }}>
            <div style={{ width: 40, height: 26, borderRadius: 6, background: C.info[50], color: C.info[800], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{p.bed}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 11, color: C.n[600] }}>{p.diagnosis} · Admitted {p.admitted}</div></div>
            <Pill bg={colorOf(p.color).bg} fg={colorOf(p.color).fg}>{p.status}</Pill>
            <button onClick={() => setEventsPatient(p)} style={{ padding: "5px 12px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 11, cursor: "pointer", fontFamily: font }}>Events</button>
          </div>
        ))}
      </div>

      {eventsPatient && (() => {
        const events = ipdEvents[eventsPatient.bed] || [];
        return (
          <div onClick={() => setEventsPatient(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: C.n[0], borderRadius: 14, width: 480, maxWidth: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
              <div style={{ padding: "16px 20px 12px", borderBottom: `0.5px solid ${C.n[200]}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{eventsPatient.name}</div>
                  <div style={{ fontSize: 11, color: C.n[600] }}>{eventsPatient.bed} · {eventsPatient.diagnosis}</div>
                </div>
                <button onClick={() => setEventsPatient(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.n[500], lineHeight: 1 }}>×</button>
              </div>
              <div style={{ overflowY: "auto", padding: "14px 20px", flex: 1 }}>
                {events.length === 0 ? (
                  <div style={{ textAlign: "center", color: C.n[500], fontSize: 12, padding: "24px 0" }}>No events recorded yet</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {events.map((ev, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 12, paddingBottom: 16, position: "relative" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.pri[400], marginTop: 3, flexShrink: 0 }} />
                          {idx < events.length - 1 && <div style={{ width: 1.5, flex: 1, background: C.n[200], marginTop: 3 }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: C.n[500], marginBottom: 2 }}>{ev.ts}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.n[800], marginBottom: 3 }}>
                            {ev.author}{ev.role ? <span style={{ fontWeight: 400, color: C.n[500] }}> — {ev.role}</span> : ""}
                          </div>
                          <div style={{ fontSize: 12, color: C.n[700], lineHeight: 1.5 }}>{ev.note}</div>
                          {ev.report && (
                            <button style={{ marginTop: 6, padding: "3px 10px", borderRadius: 5, border: `0.5px solid ${C.pri[300]}`, background: C.pri[50], color: C.pri[600], fontSize: 11, cursor: "pointer", fontFamily: font }}>
                              📄 {ev.report}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Message box */}
              <div style={{ borderTop: `0.5px solid ${C.n[200]}`, padding: "10px 16px", display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  value={eventMsg}
                  onChange={(e) => setEventMsg(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendEvent();
                    }
                  }}
                  placeholder="Add an event note… (Enter to send, Shift+Enter for new line)"
                  rows={2}
                  style={{ flex: 1, resize: "none", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, padding: "8px 10px", fontSize: 12, fontFamily: font, color: C.n[800], outline: "none", lineHeight: 1.5, background: C.n[50] }}
                />
                <button
                  onClick={sendEvent}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: font, flexShrink: 0, alignSelf: "flex-end" }}>
                  Send
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
