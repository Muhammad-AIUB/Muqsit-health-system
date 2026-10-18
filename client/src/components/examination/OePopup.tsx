"use client";

import { useRef, useState, type CSSProperties } from "react";
import { C } from "@/theme";
import { btnPrimary, btnSecondary, dialogTitle, scrim, shadowDialog, btnClose } from "@/theme/styles";
import { useMuqsit } from "@/context/MuqsitContext";
import type { OeData } from "@/types";
import { useDialog } from "@/lib/useDialog";
import { addHistoryEntry, historyEntries, historyLines, removeHistoryEntry } from "@/lib/oeHistory";
import { confirmAction } from "@/lib/dialogs";

type HistField = "diseaseHistory" | "surgicalHistory";
interface HistDraft { text: string; date: string; error: string }
const EMPTY_DRAFT: HistDraft = { text: "", date: "", error: "" };

export default function OePopup() {
  const { showOePopup, setShowOePopup, oeData, setOeData, setOnExamination, setPtWeight, currentPatientId } = useMuqsit();

  const oeD = oeData;
  const setOe = (field: keyof OeData, val: string) =>
    setOeData((prev) => Object.assign({}, prev, { [field]: val }));

  // Doctors write BP as "120/80" — typing "/" in systolic moves the rest to
  // diastolic and jumps the cursor there.
  const dbpRef = useRef<HTMLInputElement>(null);
  const onSbpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const slash = v.indexOf("/");
    if (slash >= 0) {
      setOeData((prev) => ({ ...prev, sbp: v.slice(0, slash), dbp: v.slice(slash + 1) }));
      dbpRef.current?.focus();
    } else {
      setOe("sbp", v);
    }
  };

  // ⚕️ Disease / surgical history are LISTS of dated entries (physician's
  // sheet, 18/10/2026, item 3): a text box, a date box (DDMMYY) and Add; the
  // entries are listed under them. What is typed and not yet added is added by
  // Save too — a doctor reads the box as part of the form — and a date that
  // cannot be read stops the Save and says why, rather than drop the entry.
  const [hist, setHist] = useState<Record<HistField, HistDraft>>({ diseaseHistory: EMPTY_DRAFT, surgicalHistory: EMPTY_DRAFT });
  // ⚕️ The popup stays mounted for the whole session: what was typed and not
  // added is dropped when it closes, and when another patient is loaded under
  // it — or Save would add one patient's history to the next (review, 18/10/2026).
  const owner = showOePopup ? currentPatientId ?? "" : null;
  const [histOwner, setHistOwner] = useState(owner);
  // The entry last taken off with ×, for its Undo (the 15/10/2026 decision on
  // accidental deletes: a line taken off in one press can be put back).
  const [removed, setRemoved] = useState<{ f: HistField; index: number; text: string } | null>(null);
  if (owner !== histOwner) {
    setHistOwner(owner);
    setHist({ diseaseHistory: EMPTY_DRAFT, surgicalHistory: EMPTY_DRAFT });
    setRemoved(null);
  }
  const setDraft = (f: HistField, d: Partial<HistDraft>) => setHist((prev) => ({ ...prev, [f]: { ...prev[f], ...d } }));
  /** The field's value with its typed entry added; null (and the reason shown) when the date cannot be read. */
  const withTyped = (f: HistField): string | null => {
    const d = hist[f];
    if (!d.text.trim() && !d.date.trim()) return oeD[f];
    const r = addHistoryEntry(oeD[f], d.text, d.date);
    if (!r.ok) { setDraft(f, { error: r.reason }); return null; }
    return r.value;
  };
  const addTyped = (f: HistField) => {
    const v = withTyped(f);
    if (v === null || v === oeD[f]) return;
    setOe(f, v);
    setDraft(f, EMPTY_DRAFT);
    setRemoved(null);
  };
  const removeEntry = (f: HistField, index: number) => {
    const text = historyEntries(oeD[f])[index];
    if (text === undefined) return;
    setOe(f, removeHistoryEntry(oeD[f], index));
    setRemoved({ f, index, text });
  };
  const undoRemove = () => {
    if (!removed) return;
    const list = historyEntries(oeD[removed.f]);
    list.splice(Math.min(removed.index, list.length), 0, removed.text);
    setOe(removed.f, list.join("\n"));
    setRemoved(null);
  };

  // ⚕️ Every way out of the popup comes here (×, Cancel, Escape, the veil).
  // History typed and not added is not dropped without a word (second review,
  // 18/10/2026): the doctor keeps it — added as typed — or lets it go.
  const requestClose = async () => {
    const typed = (["diseaseHistory", "surgicalHistory"] as const).filter((f) => hist[f].text.trim() || hist[f].date.trim());
    if (!typed.length) { setShowOePopup(false); return; }
    // Fixed before the question: the popup stays live behind it.
    const what = typed.map((f) => hist[f].text.trim() || hist[f].date.trim()).join("”, “");
    const keep = await confirmAction({
      title: "Keep the history you typed?",
      body: `“${what}” was typed but not added.`,
      confirmLabel: "Add it",
      cancelLabel: "Discard",
    });
    if (keep) {
      let next = { diseaseHistory: oeD.diseaseHistory, surgicalHistory: oeD.surgicalHistory };
      for (const f of typed) {
        const v = withTyped(f);
        if (v === null) return; // the date could not be read: said under its box, the popup stays
        next = { ...next, [f]: v };
      }
      setOeData((prev) => ({ ...prev, ...next }));
    }
    setHist({ diseaseHistory: EMPTY_DRAFT, surgicalHistory: EMPTY_DRAFT });
    setShowOePopup(false);
  };

  // Auto-calculations
  const hCm = parseFloat(oeD.heightCm) || 0;
  const hFt = parseFloat(oeD.heightFt) || 0;
  const hIn = parseFloat(oeD.heightIn) || 0;
  const wKg = parseFloat(oeD.weightKg) || 0;
  const wLb = parseFloat(oeD.weightLb) || 0;
  const sbp = parseFloat(oeD.sbp) || 0;
  const dbp = parseFloat(oeD.dbp) || 0;
  const calcCmFromFtIn = Math.round((hFt * 30.48 + hIn * 2.54) * 10) / 10;
  const calcTotalIn = hCm / 2.54;
  const calcFt = Math.floor(calcTotalIn / 12);
  const calcIn = Math.round((calcTotalIn - calcFt * 12) * 10) / 10;
  const calcKgFromLb = Math.round(wLb * 0.453592 * 10) / 10;
  const calcLbFromKg = Math.round(wKg * 2.20462 * 10) / 10;
  // Effective height/weight — use the entered unit, or derive it from the other
  // (ft/in → cm, lb → kg) so BMI & ideal body weight compute either way.
  const effHCm = hCm > 0 ? hCm : calcCmFromFtIn;
  const effWKg = wKg > 0 ? wKg : calcKgFromLb;
  const hM = effHCm / 100;
  const bmi = hM > 0 && effWKg > 0 ? Math.round((effWKg / (hM * hM)) * 10) / 10 : 0;
  const ibwLow = hM > 0 ? Math.round(19.5 * hM * hM * 10) / 10 : 0;
  const ibwHigh = hM > 0 ? Math.round(25 * hM * hM * 10) / 10 : 0;
  const mapVal = sbp > 0 && dbp > 0 ? Math.round(((sbp + 2 * dbp) / 3) * 10) / 10 : 0;

  const saveOeToItems = () => {
    const disease = withTyped("diseaseHistory");
    const surgical = withTyped("surgicalHistory");
    if (disease === null || surgical === null) return;
    if (disease !== oeD.diseaseHistory || surgical !== oeD.surgicalHistory) {
      setOeData((prev) => ({ ...prev, diseaseHistory: disease, surgicalHistory: surgical }));
    }
    setHist({ diseaseHistory: EMPTY_DRAFT, surgicalHistory: EMPTY_DRAFT });
    const results: string[] = [];
    if (effHCm > 0) results.push("Height: " + effHCm + " cm");
    if (effWKg > 0) results.push("Weight: " + effWKg + " kg");
    if (bmi > 0) results.push("BMI: " + bmi);
    if (ibwLow > 0) results.push("Ideal BW: " + ibwLow + "-" + ibwHigh + " kg");
    // BP is written exactly as typed, like Pulse/RR/SpO2 below. A blank
    // diastolic stays blank — never an invented "/0" on the prescription.
    if (sbp > 0) results.push("BP: " + oeD.sbp.trim() + (oeD.dbp.trim() ? "/" + oeD.dbp.trim() : "") + " mmHg");
    if (mapVal > 0) results.push("MAP: " + mapVal + " mmHg");
    if (oeD.pulse) results.push("Pulse: " + oeD.pulse + " b/m" + (oeD.pulseNote ? " (" + oeD.pulseNote + ")" : ""));
    if (oeD.rr) results.push("RR: " + oeD.rr + "/min");
    if (oeD.spo2) results.push("SpO2: " + oeD.spo2 + "%");
    if (oeD.anaemia) results.push("Anaemia: " + oeD.anaemia);
    if (oeD.jaundice) results.push("Jaundice: " + oeD.jaundice);
    if (oeD.ascites) results.push("Ascites: " + oeD.ascites);
    if (oeD.auscHeart) results.push("Heart: " + oeD.auscHeart);
    if (oeD.auscLung) results.push("Lung: " + oeD.auscLung);
    if (oeD.specialNote) results.push("Note: " + oeD.specialNote);
    results.push(...historyLines("Disease Hx", disease), ...historyLines("Surgical Hx", surgical));
    setOnExamination(results);
    // 3.docx: weight can be loaded from On-examination — push the effective kg
    // value (entered, or derived from lb) into the header Weight field.
    if (effWKg > 0) setPtWeight(String(effWKg));
    setShowOePopup(false);
  };

  // No forced capitals: these labels carry units (cm, kg, b/m, /min).
  const oeLbl: CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: C.n[600], lineHeight: 1.25, marginBottom: 3 };
  const oeInp: CSSProperties = { width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 12.5, border: "1px solid " + C.n[300], outline: "none", background: C.n[0], color: C.n[900], boxSizing: "border-box", fontFamily: "inherit" };
  const oeSel: CSSProperties = Object.assign({}, oeInp, { padding: "6px 4px" });
  const oeRow: CSSProperties = { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" };
  const oeCalc: CSSProperties = { fontSize: 11, color: C.pri[600], background: C.pri[50], padding: "3px 8px", borderRadius: 4, marginTop: 2 };

  const dialog = useDialog(showOePopup, () => { void requestClose(); });

  if (!showOePopup) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, padding: 16, background: scrim, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { void requestClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="On examination" {...dialog} onClick={(e) => e.stopPropagation()} style={{ width: "min(700px, 100%)", maxWidth: "100%", maxHeight: "88vh", background: C.n[0], borderRadius: 14, border: "0.5px solid " + C.n[200], boxShadow: shadowDialog, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: "0.5px solid " + C.n[200], background: C.n[50] }}>
          <div>
            <div style={{ ...dialogTitle }}>On examination</div>
            <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Physical examination with auto-calculations</div>
          </div>
          <button aria-label="Close" onClick={() => { void requestClose(); }} style={btnClose}>×</button>
        </div>
        <div style={{ padding: "16px 20px", flex: 1, overflowY: "auto" }}>

          <div style={oeRow}>
          </div>

          <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 6, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Anthropometry</div>
          <div style={oeRow}>
            <div style={{ flex: "1 1 80px" }}><label data-caption style={oeLbl}>Height (cm)</label><input aria-label="Height (cm)" style={oeInp} value={oeD.heightCm} onChange={(e) => setOe("heightCm", e.target.value)} placeholder="cm" />{hCm > 0 && <div style={oeCalc}>{calcFt} ft {calcIn} in</div>}</div>
            <div style={{ flex: "1 1 60px" }}><label data-caption style={oeLbl}>Height (ft)</label><input aria-label="Height (ft)" style={oeInp} value={oeD.heightFt} onChange={(e) => setOe("heightFt", e.target.value)} placeholder="feet" /></div>
            <div style={{ flex: "1 1 60px" }}><label data-caption style={oeLbl}>Height (in)</label><input aria-label="Height (in)" style={oeInp} value={oeD.heightIn} onChange={(e) => setOe("heightIn", e.target.value)} placeholder="inch" />{(hFt > 0 || hIn > 0) && <div style={oeCalc}>{calcCmFromFtIn} cm</div>}</div>
            <div style={{ flex: "1 1 80px" }}><label data-caption style={oeLbl}>Weight (lb)</label><input aria-label="Weight (lb)" style={oeInp} value={oeD.weightLb} onChange={(e) => setOe("weightLb", e.target.value)} placeholder="lb" />{wLb > 0 && <div style={oeCalc}>{calcKgFromLb} kg</div>}</div>
            <div style={{ flex: "1 1 80px" }}><label data-caption style={oeLbl}>Weight (kg)</label><input aria-label="Weight (kg)" style={oeInp} value={oeD.weightKg} onChange={(e) => setOe("weightKg", e.target.value)} placeholder="kg" />{wKg > 0 && <div style={oeCalc}>{calcLbFromKg} lb</div>}</div>
          </div>
          <div style={oeRow}>
            <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>BMI (auto)</div><div style={{ padding: "7px 8px", borderRadius: 6, fontSize: 13, fontWeight: 500, background: bmi > 0 ? (bmi < 18.5 ? C.warn[50] : bmi > 25 ? C.danger[50] : C.ok[50]) : C.n[100], color: bmi > 0 ? (bmi < 18.5 ? C.warn[800] : bmi > 25 ? C.danger[800] : C.ok[600]) : C.n[500] }}>{bmi > 0 ? bmi : "—"}</div></div>
            <div style={{ flex: "1 1 180px" }}><div style={oeLbl}>Ideal body weight (auto)</div><div style={{ padding: "7px 8px", borderRadius: 6, fontSize: 12, background: C.n[100], color: C.n[800] }}>{ibwLow > 0 ? ibwLow + " – " + ibwHigh + " kg (" + Math.round(ibwLow * 2.20462) + " – " + Math.round(ibwHigh * 2.20462) + " lb)" : "—"}</div></div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 6, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Vitals</div>
          <div style={oeRow}>
            <div style={{ flex: "1 1 80px" }}><label data-caption style={oeLbl}>Systolic BP</label><input aria-label="Systolic BP" style={oeInp} value={oeD.sbp} onChange={onSbpChange} placeholder="120/80" /></div>
            <div style={{ flex: "1 1 80px" }}><label data-caption style={oeLbl}>Diastolic BP</label><input aria-label="Diastolic BP" ref={dbpRef} style={oeInp} value={oeD.dbp} onChange={(e) => setOe("dbp", e.target.value)} placeholder="mmHg" /></div>
            <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>MAP (auto)</div><div style={{ padding: "7px 8px", borderRadius: 6, fontSize: 13, fontWeight: 500, background: mapVal > 0 ? C.info[50] : C.n[100], color: mapVal > 0 ? C.info[800] : C.n[500] }}>{mapVal > 0 ? mapVal + " mmHg" : "—"}</div></div>
            <div style={{ flex: "1 1 80px" }}><label data-caption style={oeLbl}>Pulse (b/m)</label><input aria-label="Pulse (b/m)" style={oeInp} value={oeD.pulse} onChange={(e) => setOe("pulse", e.target.value)} placeholder="b/m" /></div>
            <div style={{ flex: "1 1 100px" }}><label data-caption style={oeLbl}>Pulse note</label><input aria-label="Pulse note" style={oeInp} value={oeD.pulseNote} onChange={(e) => setOe("pulseNote", e.target.value)} placeholder="Regular, irregular..." /></div>
          </div>
          <div style={oeRow}>
            <div style={{ flex: "1 1 100px" }}><label data-caption style={oeLbl}>Respiratory rate (/min)</label><input aria-label="Respiratory rate (/min)" style={oeInp} value={oeD.rr} onChange={(e) => setOe("rr", e.target.value)} placeholder="/min" /></div>
            <div style={{ flex: "1 1 100px" }}><label data-caption style={oeLbl}>SpO2 (%)</label><input aria-label="SpO2 (%)" style={oeInp} value={oeD.spo2} onChange={(e) => setOe("spo2", e.target.value)} placeholder="%" /></div>
            <div style={{ flex: "1 1 100px" }}><label data-caption style={oeLbl}>Anaemia</label><select aria-label="Anaemia" style={oeSel} value={oeD.anaemia} onChange={(e) => setOe("anaemia", e.target.value)}><option value="">None</option><option>+</option><option>++</option><option>+++</option></select></div>
            <div style={{ flex: "1 1 100px" }}><label data-caption style={oeLbl}>Jaundice</label><select aria-label="Jaundice" style={oeSel} value={oeD.jaundice} onChange={(e) => setOe("jaundice", e.target.value)}><option value="">None</option><option>+</option><option>++</option><option>+++</option></select></div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 6, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Clinical findings</div>
          <div style={oeRow}>
            <div style={{ flex: "1 1 120px" }}><label data-caption style={oeLbl}>Ascites</label><select aria-label="Ascites" style={oeSel} value={oeD.ascites} onChange={(e) => setOe("ascites", e.target.value)}><option value="">Absent</option><option>Mild</option><option>Moderate</option><option>Huge</option></select></div>
            <div style={{ flex: "1 1 200px" }}><label data-caption style={oeLbl}>Auscultation of heart</label><input aria-label="Auscultation of heart" style={oeInp} value={oeD.auscHeart} onChange={(e) => setOe("auscHeart", e.target.value)} placeholder="S1S2 normal, murmur..." /></div>
            <div style={{ flex: "1 1 200px" }}><label data-caption style={oeLbl}>Auscultation of lung</label><input aria-label="Auscultation of lung" style={oeInp} value={oeD.auscLung} onChange={(e) => setOe("auscLung", e.target.value)} placeholder="Clear, crepts, wheeze..." /></div>
          </div>
          <div style={{ marginBottom: 10 }}><label data-caption style={oeLbl}>Special note / other findings</label><input aria-label="Special note / other findings" style={oeInp} value={oeD.specialNote} onChange={(e) => setOe("specialNote", e.target.value)} placeholder="Any additional examination findings..." /></div>

          <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 6, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>History</div>
          {([
            ["diseaseHistory", "Disease history", "e.g. First known, disease event etc."],
            ["surgicalHistory", "Surgical / intervention history", "e.g. H/O cholecystectomy, RFA, TACE of HCC etc."],
          ] as const).map(([f, label, ph]) => {
            const d = hist[f];
            const entries = historyEntries(oeD[f]);
            return (
              <div key={f} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ flex: "3 1 220px" }}>
                    <label data-caption style={oeLbl}>{label}</label>
                    <input aria-label={label} style={oeInp} value={d.text} placeholder={ph}
                      onChange={(e) => setDraft(f, { text: e.target.value, error: "" })}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(f); } }} />
                  </div>
                  <div style={{ flex: "1 1 110px" }}>
                    <label data-caption style={oeLbl}>Date</label>
                    <input aria-label={`${label} date`} style={oeInp} value={d.date} placeholder="DDMMYY" inputMode="numeric"
                      title="Type DDMMYY — e.g. 151026 → 15/10/2026. Optional."
                      onChange={(e) => setDraft(f, { date: e.target.value, error: "" })}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(f); } }} />
                  </div>
                  <button type="button" aria-label={`Add ${label.toLowerCase()}`} onClick={() => addTyped(f)} style={btnPrimary("sm")}>Add</button>
                </div>
                {d.error && <div role="alert" style={{ fontSize: 11, color: C.danger[800], marginTop: 3 }}>{d.error}</div>}
                {entries.length > 0 && (
                  <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none" }}>
                    {entries.map((e, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.n[800], padding: "3px 0" }}>
                        <span aria-hidden style={{ color: C.n[400] }}>•</span>
                        <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{e}</span>
                        <button type="button" aria-label={`Remove “${e}”`} title="Remove" onClick={() => removeEntry(f, i)}
                          style={{ border: "none", background: "transparent", color: C.n[500], cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 4px" }}>×</button>
                      </li>
                    ))}
                  </ul>
                )}
                {removed?.f === f && (
                  <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.n[700], marginTop: 4 }}>
                    <span>Removed “{removed.text}”</span>
                    <button type="button" onClick={undoRemove} style={btnSecondary("sm")}>Undo</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "0.5px solid " + C.n[200], background: C.n[50] }}>
          <button onClick={() => { void requestClose(); }} style={btnSecondary("md")}>Cancel</button>
          <button onClick={saveOeToItems} style={btnPrimary("md")}>Save examination</button>
        </div>
      </div>
    </div>
  );
}
