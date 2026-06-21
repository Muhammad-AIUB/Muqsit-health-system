"use client";

import { useRef, type CSSProperties } from "react";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import type { OeData } from "@/types";

export default function OePopup() {
  const { showOePopup, setShowOePopup, oeData, setOeData, setOnExamination, setPtWeight } = useMuqsit();

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
    const results: string[] = [];
    if (effHCm > 0) results.push("Height: " + effHCm + " cm");
    if (effWKg > 0) results.push("Weight: " + effWKg + " kg");
    if (bmi > 0) results.push("BMI: " + bmi);
    if (ibwLow > 0) results.push("Ideal BW: " + ibwLow + "-" + ibwHigh + " kg");
    if (sbp > 0) results.push("BP: " + sbp + "/" + dbp + " mmHg");
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
    if (oeD.diseaseHistory) results.push("Disease Hx: " + oeD.diseaseHistory);
    if (oeD.surgicalHistory) results.push("Surgical Hx: " + oeD.surgicalHistory);
    setOnExamination(results);
    // 3.docx: weight can be loaded from On-examination — push the effective kg
    // value (entered, or derived from lb) into the header Weight field.
    if (effWKg > 0) setPtWeight(String(effWKg));
    setShowOePopup(false);
  };

  const oeLbl: CSSProperties = { fontSize: 9, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 3 };
  const oeInp: CSSProperties = { width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", background: C.n[0], color: C.n[900], boxSizing: "border-box", fontFamily: "inherit" };
  const oeSel: CSSProperties = Object.assign({}, oeInp, { padding: "6px 4px" });
  const oeRow: CSSProperties = { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" };
  const oeCalc: CSSProperties = { fontSize: 10, color: C.pri[600], background: C.pri[50], padding: "3px 8px", borderRadius: 4, marginTop: 2 };

  if (!showOePopup) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowOePopup(false)}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 700, maxHeight: "88vh", background: C.n[0], borderRadius: 14, border: "0.5px solid " + C.n[200], boxShadow: "0 16px 48px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "0.5px solid " + C.n[200], background: C.n[50] }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: C.n[900] }}>On examination</div>
            <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Physical examination with auto-calculations</div>
          </div>
          <button onClick={() => setShowOePopup(false)} style={{ width: 28, height: 28, borderRadius: 6, border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ padding: "16px 20px", flex: 1, overflowY: "auto" }}>

          <div style={oeRow}>
          </div>

          <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 6, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Anthropometry</div>
          <div style={oeRow}>
            <div style={{ flex: "1 1 80px" }}><div style={oeLbl}>Height (cm)</div><input style={oeInp} value={oeD.heightCm} onChange={(e) => setOe("heightCm", e.target.value)} placeholder="cm" />{hCm > 0 && <div style={oeCalc}>{calcFt} ft {calcIn} in</div>}</div>
            <div style={{ flex: "1 1 60px" }}><div style={oeLbl}>Height (ft)</div><input style={oeInp} value={oeD.heightFt} onChange={(e) => setOe("heightFt", e.target.value)} placeholder="feet" /></div>
            <div style={{ flex: "1 1 60px" }}><div style={oeLbl}>Height (in)</div><input style={oeInp} value={oeD.heightIn} onChange={(e) => setOe("heightIn", e.target.value)} placeholder="inch" />{(hFt > 0 || hIn > 0) && <div style={oeCalc}>{calcCmFromFtIn} cm</div>}</div>
            <div style={{ flex: "1 1 80px" }}><div style={oeLbl}>Weight (lb)</div><input style={oeInp} value={oeD.weightLb} onChange={(e) => setOe("weightLb", e.target.value)} placeholder="lb" />{wLb > 0 && <div style={oeCalc}>{calcKgFromLb} kg</div>}</div>
            <div style={{ flex: "1 1 80px" }}><div style={oeLbl}>Weight (kg)</div><input style={oeInp} value={oeD.weightKg} onChange={(e) => setOe("weightKg", e.target.value)} placeholder="kg" /></div>
          </div>
          <div style={oeRow}>
            <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>BMI (auto)</div><div style={{ padding: "7px 8px", borderRadius: 6, fontSize: 13, fontWeight: 500, background: bmi > 0 ? (bmi < 18.5 ? C.warn[50] : bmi > 25 ? C.danger[50] : C.pri[50]) : C.n[100], color: bmi > 0 ? (bmi < 18.5 ? C.warn[800] : bmi > 25 ? C.danger[800] : C.pri[600]) : C.n[500] }}>{bmi > 0 ? bmi : "—"}</div></div>
            <div style={{ flex: "1 1 180px" }}><div style={oeLbl}>Ideal body weight (auto)</div><div style={{ padding: "7px 8px", borderRadius: 6, fontSize: 12, background: C.n[100], color: C.n[800] }}>{ibwLow > 0 ? ibwLow + " – " + ibwHigh + " kg (" + Math.round(ibwLow * 2.20462) + " – " + Math.round(ibwHigh * 2.20462) + " lb)" : "—"}</div></div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 6, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Vitals</div>
          <div style={oeRow}>
            <div style={{ flex: "1 1 80px" }}><div style={oeLbl}>Systolic BP</div><input style={oeInp} value={oeD.sbp} onChange={onSbpChange} placeholder="120/80" /></div>
            <div style={{ flex: "1 1 80px" }}><div style={oeLbl}>Diastolic BP</div><input ref={dbpRef} style={oeInp} value={oeD.dbp} onChange={(e) => setOe("dbp", e.target.value)} placeholder="mmHg" /></div>
            <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>MAP (auto)</div><div style={{ padding: "7px 8px", borderRadius: 6, fontSize: 13, fontWeight: 500, background: mapVal > 0 ? C.info[50] : C.n[100], color: mapVal > 0 ? C.info[800] : C.n[500] }}>{mapVal > 0 ? mapVal + " mmHg" : "—"}</div></div>
            <div style={{ flex: "1 1 80px" }}><div style={oeLbl}>Pulse (b/m)</div><input style={oeInp} value={oeD.pulse} onChange={(e) => setOe("pulse", e.target.value)} placeholder="b/m" /></div>
            <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>Pulse note</div><input style={oeInp} value={oeD.pulseNote} onChange={(e) => setOe("pulseNote", e.target.value)} placeholder="Regular, irregular..." /></div>
          </div>
          <div style={oeRow}>
            <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>Respiratory rate (/min)</div><input style={oeInp} value={oeD.rr} onChange={(e) => setOe("rr", e.target.value)} placeholder="/min" /></div>
            <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>SpO2 (%)</div><input style={oeInp} value={oeD.spo2} onChange={(e) => setOe("spo2", e.target.value)} placeholder="%" /></div>
            <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>Anaemia</div><select style={oeSel} value={oeD.anaemia} onChange={(e) => setOe("anaemia", e.target.value)}><option value="">None</option><option>+</option><option>++</option><option>+++</option></select></div>
            <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>Jaundice</div><select style={oeSel} value={oeD.jaundice} onChange={(e) => setOe("jaundice", e.target.value)}><option value="">None</option><option>+</option><option>++</option><option>+++</option></select></div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 6, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Clinical findings</div>
          <div style={oeRow}>
            <div style={{ flex: "1 1 120px" }}><div style={oeLbl}>Ascites</div><select style={oeSel} value={oeD.ascites} onChange={(e) => setOe("ascites", e.target.value)}><option value="">Absent</option><option>Mild</option><option>Moderate</option><option>Huge</option></select></div>
            <div style={{ flex: "1 1 200px" }}><div style={oeLbl}>Auscultation of heart</div><input style={oeInp} value={oeD.auscHeart} onChange={(e) => setOe("auscHeart", e.target.value)} placeholder="S1S2 normal, murmur..." /></div>
            <div style={{ flex: "1 1 200px" }}><div style={oeLbl}>Auscultation of lung</div><input style={oeInp} value={oeD.auscLung} onChange={(e) => setOe("auscLung", e.target.value)} placeholder="Clear, crepts, wheeze..." /></div>
          </div>
          <div style={{ marginBottom: 10 }}><div style={oeLbl}>Special note / other findings</div><input style={oeInp} value={oeD.specialNote} onChange={(e) => setOe("specialNote", e.target.value)} placeholder="Any additional examination findings..." /></div>

          <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 6, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>History</div>
          <div style={{ marginBottom: 10 }}><div style={oeLbl}>Disease history</div><input style={oeInp} value={oeD.diseaseHistory} onChange={(e) => setOe("diseaseHistory", e.target.value)} placeholder="e.g. First known, disease event etc." /></div>
          <div style={{ marginBottom: 6 }}><div style={oeLbl}>Surgical / intervention history</div><input style={oeInp} value={oeD.surgicalHistory} onChange={(e) => setOe("surgicalHistory", e.target.value)} placeholder="e.g. Cholecystectomy, RFA, TACE of HCC etc." /></div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "0.5px solid " + C.n[200], background: C.n[50] }}>
          <button onClick={() => setShowOePopup(false)} style={{ padding: "8px 20px", borderRadius: 8, border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={saveOeToItems} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Save examination</button>
        </div>
      </div>
    </div>
  );
}
