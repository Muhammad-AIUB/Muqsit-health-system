import { useState, useRef } from "react";

// ═══════════════════════════════════════════════════════════
// MUQSIT — Complete Patient Management & Prescription System
// Built from full design session: 13 revisions
// ═══════════════════════════════════════════════════════════

const C = {
  pri: { 50: "#E1F5EE", 100: "#9FE1CB", 400: "#1D9E75", 600: "#0F6E56", 800: "#085041" },
  warn: { 50: "#FAEEDA", 100: "#FAC775", 400: "#EF9F27", 600: "#BA7517", 800: "#854F0B" },
  danger: { 50: "#FCEBEB", 100: "#F7C1C1", 400: "#E24B4A", 800: "#A32D2D" },
  info: { 50: "#E6F1FB", 100: "#B5D4F4", 400: "#378ADD", 800: "#185FA5" },
  n: { 0: "#FFF", 50: "#F8F8F6", 100: "#EEEEEC", 200: "#E5E5E3", 300: "#D4D4D2", 500: "#999", 600: "#6B6B6B", 800: "#333", 900: "#1A1A1A" },
};

const suggestionDB = {
  "Chief complaints": ["Fever for _ days","Headache","Body ache","Running nose","Cough for _ days","Sore throat","Abdominal pain","Chest pain","Shortness of breath","Vomiting","Diarrhea for _ days","Burning urination","Back pain","Joint pain","Skin rash","Dizziness","Loss of appetite","Weight loss","Fatigue","Palpitation"],
  "History": ["H/O fever for 3 days","H/O cough with expectoration","H/O similar episodes before","No significant past history","Known diabetic for _ years","Known hypertensive","H/O drug allergy —","Surgical history —","Family history — DM/HTN","No H/O TB, Asthma, Epilepsy","Non-smoker, non-alcoholic","Smoker — _ pack years","Immunization up to date","H/O recent travel","H/O contact with TB patient"],
  "Investigation report findings": ["CBC — WBC: _/cumm, Hb: _g/dL, Plt: _","CBC — normal","CRP — _ mg/L (elevated)","CRP — normal","ESR — _ mm/hr","RBS — _ mg/dL","FBS — _ mg/dL","HbA1c — _%","Lipid profile — TC: _, LDL: _, HDL: _, TG: _","LFT — SGPT: _, SGOT: _, Bilirubin: _","RFT — Creatinine: _, BUN: _","Urine R/E — normal","Urine R/E — pus cells: _/hpf","Chest X-ray — normal","Chest X-ray — bilateral infiltrates","ECG — normal sinus rhythm","ECG — ST changes","USG abdomen — normal","USG abdomen — fatty liver","Dengue NS1 — positive","Dengue NS1 — negative","Widal — positive (TO: _, TH: _)","Blood culture — no growth","Thyroid — TSH: _ mIU/L","ECHO — EF: _%"],
  "Drug history": ["Tab. Paracetamol 500mg — ongoing","Cap. Omeprazole 20mg — 6 months","Tab. Metformin 500mg — 2 years","Tab. Amlodipine 5mg — 1 year","Tab. Losartan 50mg — ongoing","Tab. Atorvastatin 10mg — ongoing","Insulin Glargine — 1 year","Tab. Aspirin 75mg — ongoing","Tab. Thyroxine 50mcg — 3 years","Tab. Clopidogrel 75mg — 6 months","Inhaler Salbutamol — as needed","Tab. Montelukast 10mg — 1 year","No regular medications","Self-medicated with — ","Over-the-counter painkillers","Herbal/Ayurvedic medications","Antibiotic course — recently completed","Steroid course — _ weeks ago","Oral contraceptives — ongoing","Vitamin D supplement — ongoing"],
  "On examination": ["Temp: _°F","BP: _/_ mmHg","Pulse: _/min","SpO2: _%","RR: _/min","Throat — congested","Throat — normal","Lungs — clear","Lungs — bilateral crepts","Abdomen — soft, non-tender","Abdomen — tender in epigastric region","CVS — S1S2 normal","CNS — intact","No lymphadenopathy","No pallor, icterus, cyanosis","Pedal edema present","JVP not raised","Hepatomegaly","Splenomegaly"],
  "Note / plan": ["Patient advised rest","Review after investigation","Referred to specialist","Counsel regarding diet","Explained prognosis","Monitor blood sugar","Watch for warning signs","Emergency visit if condition worsens","Follow medication schedule strictly","Avoid self-medication"],
  "Provisional diagnosis": ["Acute viral fever","URTI","Acute gastroenteritis","UTI","LRTI / Pneumonia","Dengue fever","Typhoid fever","Viral hepatitis","Peptic ulcer disease","GERD","Hypertension","Type 2 DM","Bronchial asthma","COPD exacerbation","Migraine","Tension headache","Allergic rhinitis","Osteoarthritis","Lumbar spondylosis","Iron deficiency anemia"],
  "Associated illness": ["Diabetes mellitus","Hypertension","Bronchial asthma","COPD","IHD","Hypothyroidism","CKD","Liver disease","Epilepsy","Rheumatoid arthritis","Obesity","Depression","Anxiety disorder","Anemia","None"],
  "Final diagnosis": ["Acute viral upper respiratory infection","Acute febrile illness","AGE — viral","Community-acquired pneumonia","Dengue fever — NS1 positive","Enteric fever","Peptic ulcer disease","GERD with esophagitis","Uncontrolled T2DM","Hypertensive urgency","Acute exacerbation of asthma","UTI — uncomplicated"],
};

const drugDB = [
  { name: "Tab. Paracetamol 500mg", cat: "Analgesic", price: 1.5 },
  { name: "Cap. Amoxicillin 500mg", cat: "Antibiotic", price: 4.0 },
  { name: "Cap. Omeprazole 20mg", cat: "PPI", price: 3.5 },
  { name: "Tab. Metformin 500mg", cat: "Antidiabetic", price: 2.5 },
  { name: "Tab. Amlodipine 5mg", cat: "Antihypertensive", price: 3.0 },
  { name: "Tab. Cetirizine 10mg", cat: "Antihistamine", price: 2.0 },
  { name: "Tab. Azithromycin 500mg", cat: "Antibiotic", price: 12.0 },
  { name: "Tab. Montelukast 10mg", cat: "Leukotriene", price: 8.0 },
  { name: "Tab. Pantoprazole 40mg", cat: "PPI", price: 4.0 },
  { name: "Tab. Losartan 50mg", cat: "ARB", price: 5.0 },
  { name: "Cap. Doxycycline 100mg", cat: "Antibiotic", price: 3.5 },
  { name: "Fluticasone nasal spray", cat: "Corticosteroid", price: 180.0 },
  { name: "Syp. Ambroxol 30mg/5ml", cat: "Mucolytic", price: 45.0 },
  { name: "Tab. Domperidone 10mg", cat: "Antiemetic", price: 2.0 },
  { name: "Tab. Diclofenac 50mg", cat: "NSAID", price: 2.5 },
  { name: "Tab. Levofloxacin 500mg", cat: "Antibiotic", price: 8.0 },
  { name: "Tab. Atorvastatin 10mg", cat: "Statin", price: 5.0 },
  { name: "Tab. Clopidogrel 75mg", cat: "Antiplatelet", price: 6.0 },
];

const templateRx = {
  "Fever + cold": [
    { drug: "Tab. Paracetamol 500mg", dose: "1+0+1", duration: "5 days", instruction: "After meal" },
    { drug: "Tab. Cetirizine 10mg", dose: "0+0+1", duration: "5 days", instruction: "At night" },
    { drug: "Cap. Amoxicillin 500mg", dose: "1+1+1", duration: "7 days", instruction: "After meal" },
  ],
  "Gastric": [
    { drug: "Cap. Omeprazole 20mg", dose: "1+0+1", duration: "14 days", instruction: "Before meal (30 min)" },
    { drug: "Tab. Domperidone 10mg", dose: "1+1+1", duration: "7 days", instruction: "Before meal" },
  ],
  "Hypertension": [
    { drug: "Tab. Amlodipine 5mg", dose: "1+0+0", duration: "30 days", instruction: "Morning" },
    { drug: "Tab. Losartan 50mg", dose: "0+0+1", duration: "30 days", instruction: "At night" },
  ],
  "Diabetes": [
    { drug: "Tab. Metformin 500mg", dose: "1+0+1", duration: "30 days", instruction: "After meal" },
  ],
};

const opdQueue = [
  { id: 1, name: "Fatima Khatun", phone: "+880 1712-345678", age: 34, gender: "F", init: "FK", type: "Follow-up", token: "T-07", color: "pri" },
  { id: 2, name: "Akhtar Rahman", phone: "+880 1945-678901", age: 52, gender: "M", init: "AR", type: "New", token: "T-08", color: "warn" },
  { id: 3, name: "Sadia Begum", phone: "+880 1678-234567", age: 28, gender: "F", init: "SB", type: "Urgent", token: "T-09", color: "danger" },
  { id: 4, name: "Monir Hossain", phone: "+880 1834-567890", age: 45, gender: "M", init: "MH", type: "New", token: "T-10", color: "info" },
  { id: 5, name: "Taslima Akter", phone: "+880 1556-123456", age: 38, gender: "F", init: "TA", type: "Follow-up", token: "T-11", color: "pri" },
];

const ipdData = [
  { bed: "B-3", name: "Rashida Sultana", diagnosis: "Pneumonia", status: "Stable", admitted: "Apr 2", color: "pri" },
  { bed: "B-5", name: "Kamal Uddin", diagnosis: "Chest pain", status: "Observation", admitted: "Apr 4", color: "warn" },
  { bed: "B-7", name: "Nusrat Jahan", diagnosis: "Dengue", status: "Critical", admitted: "Apr 1", color: "danger" },
  { bed: "B-9", name: "Hasan Ali", diagnosis: "Post-op", status: "Discharge", admitted: "Mar 30", color: "info" },
];

const ipdEvents = {
  "B-3": [],
  "B-5": [],
  "B-7": [
    { ts: "15 May 2026 · 20:23", author: "Dr. Zahid", role: "Intern", note: "Pt. have severe RUQ pain", report: null },
    { ts: "15 May 2026 · 21:00", author: "Prof. Imtiaz", role: "", note: "Keep NPO TFO, Inj. Nalbun SOS, do MRCP if available, if not USG", report: null },
    { ts: "15 May 2026 · 22:30", author: "Dr. Fahim", role: "CA", note: "Pain subsided to tolerable level, MRCP arrangement in process", report: null },
    { ts: "16 May 2026 · 06:23", author: "Dr. Tushar", role: "", note: "MRCP finding: dilated CBD 14 mm", report: "MRCP Report" },
  ],
  "B-9": [],
};

const recentlySeenPatients = [
  { id: "r1", name: "Fatima Khatun",   age: 34, gender: "F", init: "FK", phone: "+880 1712-345678", lastSeen: "Today, 10:30 AM",    diagnosis: "Diabetes · Hypertension",   color: "pri" },
  { id: "r2", name: "Akhtar Rahman",   age: 52, gender: "M", init: "AR", phone: "+880 1945-678901", lastSeen: "Yesterday, 3:00 PM", diagnosis: "COPD · Hypertension",        color: "warn" },
  { id: "r3", name: "Sadia Begum",     age: 28, gender: "F", init: "SB", phone: "+880 1678-234567", lastSeen: "16 May, 11:15 AM",  diagnosis: "Dengue · Anaemia",           color: "danger" },
  { id: "r4", name: "Monir Hossain",   age: 45, gender: "M", init: "MH", phone: "+880 1834-567890", lastSeen: "15 May, 9:00 AM",   diagnosis: "Diabetes · Fatty liver",     color: "info" },
  { id: "r5", name: "Taslima Akter",   age: 38, gender: "F", init: "TA", phone: "+880 1556-123456", lastSeen: "14 May, 4:45 PM",   diagnosis: "Thyroid disorder",           color: "pri" },
];

const questionPatients = [
  { id: "q1", name: "Nusrat Jahan",   age: 24, gender: "F", init: "NJ", phone: "+880 1712-000003", time: "2 min ago",   msg: "Vitals deteriorating — needs immediate review",       type: "alert",      color: "danger" },
  { id: "q2", name: "Fatima Khatun", age: 34, gender: "F", init: "FK", phone: "+880 1712-345678", time: "15 min ago",  msg: "Lab results ready — CBC, CRP reports available",      type: "info",       color: "pri" },
  { id: "q3", name: "Akhtar Rahman", age: 52, gender: "M", init: "AR", phone: "+880 1945-678901", time: "1 hr ago",    msg: "Consider checking HbA1c — last checked 3 months ago", type: "suggestion",  color: "warn" },
  { id: "q4", name: "Kamal Uddin",   age: 62, gender: "M", init: "KU", phone: "+880 1712-000002", time: "2 hrs ago",   msg: "Patient asks: can I resume normal diet today?",       type: "question",    color: "info" },
];

const researchPatients = [
  { id: "p1", name: "Fatima Khatun",   age: 34, gender: "F", phone: "+880 1712-345678", source: "OPD", diseases: ["Diabetes", "Hypertension", "Gastric"],          tags: ["Diabetic", "Hypertensive", "Follow-up", "Chronic"] },
  { id: "p2", name: "Akhtar Rahman",   age: 52, gender: "M", phone: "+880 1945-678901", source: "OPD", diseases: ["COPD", "Hypertension"],                          tags: ["Hypertensive", "Smoker", "New patient"] },
  { id: "p3", name: "Sadia Begum",     age: 28, gender: "F", phone: "+880 1678-234567", source: "OPD", diseases: ["Dengue", "Anaemia"],                             tags: ["Urgent", "Febrile illness", "Young adult"] },
  { id: "p4", name: "Monir Hossain",   age: 45, gender: "M", phone: "+880 1834-567890", source: "OPD", diseases: ["Diabetes", "Fatty liver"],                      tags: ["Diabetic", "Obese", "New patient"] },
  { id: "p5", name: "Taslima Akter",   age: 38, gender: "F", phone: "+880 1556-123456", source: "OPD", diseases: ["Thyroid disorder", "Hypertension"],             tags: ["Hypertensive", "Follow-up", "Hormonal"] },
  { id: "p6", name: "Rashida Sultana", age: 58, gender: "F", phone: "+880 1712-000001", source: "IPD", diseases: ["Pneumonia"],                                    tags: ["Stable", "Elderly", "Respiratory"] },
  { id: "p7", name: "Kamal Uddin",     age: 62, gender: "M", phone: "+880 1712-000002", source: "IPD", diseases: ["Chest pain", "Hypertension", "Dyslipidaemia"],  tags: ["Observation", "Cardiac risk", "Elderly"] },
  { id: "p8", name: "Nusrat Jahan",    age: 24, gender: "F", phone: "+880 1712-000003", source: "IPD", diseases: ["Dengue", "Choledocholithiasis"],                tags: ["Critical", "Young adult", "Febrile illness", "Surgical candidate"] },
  { id: "p9", name: "Hasan Ali",       age: 48, gender: "M", phone: "+880 1712-000004", source: "IPD", diseases: ["Post-cholecystectomy"],                        tags: ["Post-op", "Discharge", "Surgical"] },
];

const ptHealthDrugs = [
  { name: "Metformin 500mg",     start: "2026-01-01", end: "2026-05-17", color: "#60a5fa" },
  { name: "Amlodipine 5mg",      start: "2026-02-15", end: "2026-05-17", color: "#f472b6" },
  { name: "Paracetamol 500mg",   start: "2026-03-10", end: "2026-03-20", color: "#34d399" },
  { name: "Inj. Ceftriaxone 1g", start: "2026-04-09", end: "2026-04-16", color: "#fb923c" },
  { name: "Inj. Nalbupine SOS",  start: "2026-05-15", end: "2026-05-16", color: "#a78bfa" },
];
const ptHealthSymptoms = [
  { name: "Fever",     color: "#f87171", data: [{ d: "2026-03-10", v: 3 }, { d: "2026-03-12", v: 4 }, { d: "2026-03-15", v: 2 }, { d: "2026-04-09", v: 3 }, { d: "2026-04-11", v: 4 }, { d: "2026-05-15", v: 4 }] },
  { name: "RUQ Pain",  color: "#fb923c", data: [{ d: "2026-05-15", v: 5 }, { d: "2026-05-16", v: 2 }] },
  { name: "Cough",     color: "#38bdf8", data: [{ d: "2026-03-10", v: 2 }, { d: "2026-03-15", v: 3 }, { d: "2026-03-18", v: 1 }] },
  { name: "Nausea",    color: "#a3e635", data: [{ d: "2026-04-09", v: 2 }, { d: "2026-04-10", v: 3 }] },
  { name: "Headache",  color: "#c084fc", data: [{ d: "2026-03-12", v: 2 }, { d: "2026-04-09", v: 2 }] },
];
const ptHealthTests = [
  { name: "WBC",           unit: "×10³/μL", normal: [4, 11],  color: "#0ea5e9", data: [{ d: "2026-03-10", v: 11.2 }, { d: "2026-04-09", v: 13.4 }, { d: "2026-05-16", v: 8.1  }] },
  { name: "Haemoglobin",   unit: "g/dL",    normal: [12, 16], color: "#ec4899", data: [{ d: "2026-03-10", v: 11.8 }, { d: "2026-04-09", v: 10.2 }, { d: "2026-05-16", v: 12.1 }] },
  { name: "Blood Glucose", unit: "mmol/L",  normal: [4, 7],   color: "#f59e0b", data: [{ d: "2026-03-10", v: 7.2  }, { d: "2026-04-09", v: 8.1  }, { d: "2026-05-16", v: 6.8  }] },
  { name: "CBD Width",     unit: "mm",      normal: [0, 8],   color: "#6366f1", data: [{ d: "2026-05-16", v: 14   }] },
  { name: "CRP",           unit: "mg/L",    normal: [0, 10],  color: "#ef4444", data: [{ d: "2026-03-10", v: 18   }, { d: "2026-04-09", v: 42   }, { d: "2026-05-16", v: 12   }] },
];

const colorOf = (c) => {
  const map = { pri: { bg: C.pri[50], fg: C.pri[600] }, warn: { bg: C.warn[50], fg: C.warn[800] }, danger: { bg: C.danger[50], fg: C.danger[800] }, info: { bg: C.info[50], fg: C.info[800] } };
  return map[c] || map.pri;
};

// ─── Expandable Field Component ───
function ExpandableField({ label, items, setItems, suggestions, allFields }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [showSugs, setShowSugs] = useState(false);
  const inputRef = useRef(null);

  const getFiltered = () => {
    let sugs = suggestions || [];
    const allText = Object.values(allFields || {}).flat().join(" ").toLowerCase();
    let scored = sugs.map(s => {
      let score = 0;
      if (inputVal && s.toLowerCase().includes(inputVal.toLowerCase())) score += 10;
      if (allText.includes("fever") && (s.toLowerCase().includes("fever") || s.toLowerCase().includes("temp"))) score += 3;
      if (allText.includes("cough") && (s.toLowerCase().includes("cough") || s.toLowerCase().includes("lung"))) score += 3;
      if (allText.includes("diabetes") && (s.toLowerCase().includes("diab") || s.toLowerCase().includes("sugar"))) score += 3;
      if (allText.includes("hypertension") && (s.toLowerCase().includes("hypertens") || s.toLowerCase().includes("bp"))) score += 3;
      if (!inputVal) score += 1;
      return { text: s, score };
    });
    if (inputVal) scored = scored.filter(s => s.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.filter(s => !items.includes(s.text)).slice(0, 8);
  };

  const addItem = (text) => {
    if (text.trim() && !items.includes(text.trim())) setItems([...items, text.trim()]);
    setInputVal("");
    setShowSugs(true);
    inputRef.current && inputRef.current.focus();
  };
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const handleOpen = () => { setOpen(true); setShowSugs(true); setTimeout(() => inputRef.current && inputRef.current.focus(), 100); };
  const filteredSugs = getFiltered();

  const tagStyle = { fontSize: 11, color: C.n[800], background: C.n[100], padding: "2px 8px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4 };
  const greenTag = { fontSize: 11, color: C.pri[600], background: C.pri[50], padding: "4px 10px 4px 12px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6, border: `0.5px solid ${C.pri[100]}` };

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Collapsed row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minHeight: 28 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.n[800], paddingTop: 4, cursor: "pointer" }} onClick={handleOpen}>{label}</span>
        {items.length === 0 && (
          <button onClick={handleOpen} style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0, transition: "all 0.12s" }}
            onMouseEnter={e => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.n[300]; }}>+</button>
        )}
        {items.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1, alignItems: "center", paddingTop: 2 }}>
            {items.map((item, idx) => (
              <span key={idx} style={tagStyle}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item}</span>
                <button onClick={(e) => { e.stopPropagation(); removeItem(idx); }} style={{ background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button></span>
            ))}
            <button onClick={handleOpen} style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
          </div>
        )}
      </div>

      {/* POPUP MODAL */}
      {open && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000
        }} onClick={() => { setOpen(false); setShowSugs(false); }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 520, maxHeight: "80vh", background: C.n[0], borderRadius: 14,
            border: `0.5px solid ${C.n[200]}`, boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
            display: "flex", flexDirection: "column", overflow: "hidden"
          }}>
            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: `0.5px solid ${C.n[200]}`
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: C.n[900] }}>{label}</div>
                <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Add or edit items for this field</div>
              </div>
              <button onClick={() => { setOpen(false); setShowSugs(false); }} style={{
                width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${C.n[200]}`,
                background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>×</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: "16px 20px", flex: 1, overflowY: "auto" }}>
              {/* Added items */}
              {items.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Added ({items.length})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {items.map((item, idx) => (
                      <span key={idx} style={greenTag}>
                        {item}
                        <button onClick={() => removeItem(idx)} style={{ background: "none", border: "none", color: C.pri[400], cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Input row */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input ref={inputRef} value={inputVal}
                  onChange={e => { setInputVal(e.target.value); setShowSugs(true); }}
                  onFocus={() => setShowSugs(true)}
                  onKeyDown={e => { if (e.key === "Enter" && inputVal.trim()) addItem(inputVal); }}
                  placeholder={`Type ${label.toLowerCase()} and press Enter...`}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 8, fontSize: 13,
                    border: `0.5px solid ${C.n[200]}`, outline: "none", background: C.n[50],
                    color: C.n[900], fontFamily: "inherit"
                  }} />
                <button onClick={() => { if (inputVal.trim()) addItem(inputVal); }} style={{
                  padding: "10px 18px", borderRadius: 8, border: "none",
                  background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500,
                  cursor: "pointer", whiteSpace: "nowrap"
                }}>Add</button>
              </div>

              {/* Suggestions */}
              {showSugs && filteredSugs.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Suggestions</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {filteredSugs.map(s => (
                      <button key={s.text} onClick={() => addItem(s.text)} style={{
                        padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                        border: `0.5px solid ${C.n[200]}`, background: C.n[50], color: C.n[800],
                        transition: "all 0.12s", fontFamily: "inherit", lineHeight: 1.3
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; e.currentTarget.style.color = C.pri[600]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = C.n[50]; e.currentTarget.style.borderColor = C.n[200]; e.currentTarget.style.color = C.n[800]; }}
                      >{s.text}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              display: "flex", justifyContent: "flex-end", gap: 8,
              padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50]
            }}>
              <button onClick={() => { setOpen(false); setShowSugs(false); }} style={{
                padding: "8px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`,
                background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: "inherit"
              }}>Cancel</button>
              <button onClick={() => { setOpen(false); setShowSugs(false); }} style={{
                padding: "8px 24px", borderRadius: 8, border: "none",
                background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit"
              }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pill Component ───
const Pill = ({ bg, fg, children }) => (<span style={{ fontSize: 10, padding: "2px 10px", borderRadius: 12, fontWeight: 500, background: bg, color: fg, whiteSpace: "nowrap" }}>{children}</span>);

const INV_CATS = [
  {cat:"Hematology",tests:[
    {name:"CBC",fields:[{l:"RBC",t:"num",u1:"million/uL"},{l:"Hb",t:"num",u1:"g/dL"},{l:"Hct",t:"num",u1:"%"},{l:"MCV",t:"num",u1:"fL"},{l:"MCH",t:"num",u1:"pg"},{l:"MCHC",t:"num",u1:"g/dL"},{l:"RDW",t:"num",u1:"%"},{l:"WBC",t:"num",u1:"cells/uL"},{l:"Neutrophils",t:"num",u1:"%"},{l:"Lymphocytes",t:"num",u1:"%"},{l:"Monocytes",t:"num",u1:"%"},{l:"Eosinophils",t:"num",u1:"%"},{l:"Basophils",t:"num",u1:"%"},{l:"PLT",t:"num",u1:"/uL"},{l:"MPV",t:"num",u1:"fL"}]},
    {name:"ESR",fields:[{l:"Value",t:"num",u1:"mm/1st hr"}]},
    {name:"Prothrombin Time",fields:[{l:"Patient",t:"num",u1:"sec"},{l:"Test",t:"num",u1:"sec"},{l:"INR",t:"num",u1:""}]},
    {name:"APTT",fields:[{l:"Value",t:"num",u1:"sec"}]},
    {name:"Fibrinogen",fields:[{l:"Value",t:"num",u1:"g/L",u2:"mg/L",c12:100,c21:0.01}]},
    {name:"D-dimer",fields:[{l:"Value",t:"num",u1:"ng/mL"}]},
    {name:"Bleeding Time",fields:[{l:"Value",t:"num",u1:"sec"}]},
    {name:"Clotting Time",fields:[{l:"Value",t:"num",u1:"sec"}]},
    {name:"Reticulocyte",fields:[{l:"Value",t:"num",u1:"%"}]},
    {name:"PBF",fields:[{l:"Finding",t:"text"}]},
    {name:"LDH",fields:[{l:"Value",t:"num",u1:"U/L"}]},
    {name:"S. Iron",fields:[{l:"Value",t:"num",u1:"ug/dL",u2:"umol/L",c12:0.179,c21:5.587}]},
    {name:"TIBC",fields:[{l:"Value",t:"num",u1:"ug/L"}]},
    {name:"S. Ferritin",fields:[{l:"Value",t:"num",u1:"ng/mL"}]},
    {name:"TSAT",fields:[{l:"Value",t:"num",u1:"%"}]},
    {name:"S. B12",fields:[{l:"Value",t:"num",u1:"ug/L"}]},
    {name:"S. Folate",fields:[{l:"Value",t:"num",u1:"ug/L",u2:"ng/mL",c12:1,c21:1}]},
    {name:"Bone Marrow",fields:[{l:"Finding",t:"text"}]},
  ]},
  {cat:"LFT / Liver",tests:[
    {name:"ALT/SGPT",fields:[{l:"Value",t:"num",u1:"U/L"}]},
    {name:"AST/SGOT",fields:[{l:"Value",t:"num",u1:"U/L"}]},
    {name:"ALP",fields:[{l:"Value",t:"num",u1:"U/L"}]},
    {name:"Bilirubin Total",fields:[{l:"Value",t:"num",u1:"mg/dL",u2:"umol/L",c12:17.1,c21:0.0585}]},
    {name:"Bilirubin Direct",fields:[{l:"Value",t:"num",u1:"mg/dL",u2:"umol/L",c12:17.1,c21:0.0585}]},
    {name:"Bilirubin Indirect",fields:[{l:"Value",t:"num",u1:"mg/dL",u2:"umol/L",c12:17.1,c21:0.0585}]},
    {name:"S. Albumin",fields:[{l:"Value",t:"num",u1:"g/dL",u2:"g/L",c12:10,c21:0.1}]},
    {name:"S. Globulin",fields:[{l:"Value",t:"num",u1:"g/dL",u2:"g/L",c12:10,c21:0.1}]},
    {name:"A/G Ratio",fields:[{l:"Value",t:"num",u1:""}]},
    {name:"S. Total Protein",fields:[{l:"Value",t:"num",u1:"g/dL"}]},
    {name:"HBsAg",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]},{l:"Method",t:"dd",opts:["ICT","ELISA","CIMA"]}]},
    {name:"HBeAg",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"Anti-HBe",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"Anti-HBc IgM",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"Anti-HBc Total",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"HBV DNA",fields:[{l:"Value",t:"num",u1:"IU/mL",u2:"C/mL",c12:5.6,c21:0.179}]},
    {name:"Anti-HCV",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]},{l:"Method",t:"dd",opts:["ICT","ELISA","CIMA"]}]},
    {name:"HCV RNA",fields:[{l:"Value",t:"num",u1:"IU/mL",u2:"C/mL",c12:4.4,c21:0.227}]},
    {name:"HCV Genotype",fields:[{l:"Genotype",t:"text"}]},
    {name:"Anti-HAV IgM",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"Anti-HEV IgM",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"Ascites Fluid",fields:[{l:"Appearance",t:"dd",opts:["Clear","Cloudy","Bloody"]},{l:"SAAG",t:"num",u1:""},{l:"Protein",t:"num",u1:"g/dL"},{l:"WBC",t:"num",u1:""},{l:"Cytology",t:"dd",opts:["Positive malignant","Negative malignant"]},{l:"ADA",t:"dd",opts:["Positive","Negative"]}]},
  ]},
  {cat:"RFT / Renal",tests:[
    {name:"S. Creatinine",fields:[{l:"Value",t:"num",u1:"mg/dL",u2:"umol/L",c12:88.42,c21:0.0113}]},
    {name:"Electrolytes",fields:[{l:"Na+",t:"num",u1:"mmol/L"},{l:"K+",t:"num",u1:"mmol/L"},{l:"Cl-",t:"num",u1:"mmol/L"},{l:"HCO3-",t:"num",u1:"mmol/L"}]},
    {name:"BUN",fields:[{l:"Value",t:"num",u1:"mg/dL"}]},
    {name:"eGFR",fields:[{l:"Value",t:"num",u1:"mL/min/1.73m2"}]},
  ]},
  {cat:"Cardiology",tests:[
    {name:"Lipid Profile",fields:[{l:"TC",t:"num",u1:"mg/dL",u2:"mmol/L",c12:0.02586,c21:38.67},{l:"TG",t:"num",u1:"mg/dL",u2:"mmol/L",c12:0.01129,c21:88.57},{l:"LDL",t:"num",u1:"mg/dL",u2:"mmol/L",c12:0.02586,c21:38.67},{l:"HDL",t:"num",u1:"mg/dL",u2:"mmol/L",c12:0.02586,c21:38.67},{l:"VLDL",t:"num",u1:"mg/dL",u2:"mmol/L",c12:0.02586,c21:38.67},{l:"TC/HDL",t:"num",u1:""}]},
    {name:"Trop I",fields:[{l:"Value",t:"num",u1:"ng/mL"}]},
    {name:"hs-Trop I",fields:[{l:"Value",t:"num",u1:"pg/mL"}]},
    {name:"CK-MB",fields:[{l:"Value",t:"num",u1:"U/L"}]},
    {name:"BNP",fields:[{l:"Value",t:"num",u1:"pg/mL"}]},
  ]},
  {cat:"Infectious",tests:[
    {name:"Blood Culture",fields:[{l:"Organism",t:"text"},{l:"Sensitivity",t:"text"}]},
    {name:"Urine Culture",fields:[{l:"Organism",t:"text"},{l:"Sensitivity",t:"text"}]},
    {name:"Widal",fields:[{l:"TO",t:"text"},{l:"TH",t:"text"}]},
    {name:"Dengue NS1",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"Dengue IgM/IgG",fields:[{l:"IgM",t:"dd",opts:["Positive","Negative"]},{l:"IgG",t:"dd",opts:["Positive","Negative"]}]},
    {name:"Malaria",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]},{l:"Species",t:"text"}]},
    {name:"TB GeneXpert",fields:[{l:"Result",t:"dd",opts:["Detected","Not detected"]},{l:"Rif",t:"dd",opts:["Detected","Not detected","Indeterminate"]}]},
    {name:"AFB Stain",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"HIV",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"CRP",fields:[{l:"Value",t:"num",u1:"mg/L"}]},
    {name:"Procalcitonin",fields:[{l:"Value",t:"num",u1:"ng/mL"}]},
    {name:"Urine R/E",fields:[{l:"Protein",t:"dd",opts:["Nil","Trace","+","++","+++"]},{l:"Glucose",t:"dd",opts:["Nil","+","++","+++"]},{l:"RBC",t:"num",u1:"/hpf"},{l:"Pus cells",t:"num",u1:"/hpf"},{l:"Bacteria",t:"dd",opts:["None","Few","Many"]}]},
    {name:"Stool R/E",fields:[{l:"Blood",t:"dd",opts:["Absent","Present"]},{l:"Mucus",t:"dd",opts:["Absent","Present"]},{l:"Ova",t:"dd",opts:["Absent","Present"]},{l:"Cysts",t:"dd",opts:["Absent","Present"]}]},
  ]},
  {cat:"Autoimmune",tests:[
    {name:"ANA",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]},{l:"Titer",t:"text"},{l:"Pattern",t:"text"}]},
    {name:"Anti-dsDNA",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]},{l:"Note",t:"text"}]},
    {name:"Anti-Sm",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"Anti-SSA/Ro60",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"Anti-SSB/La",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"Anti-Scl-70",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"Anti-Jo-1",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"Anti-TPO",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"pANCA",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"cANCA",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"ASMA",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
  ]},
  {cat:"Rheumatology",tests:[
    {name:"RF",fields:[{l:"Value",t:"num",u1:"IU/mL"}]},
    {name:"Anti-CCP",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]},{l:"Value",t:"num",u1:"U/mL"}]},
    {name:"HLA-B27",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
    {name:"C3",fields:[{l:"Value",t:"num",u1:"mg/dL"}]},
    {name:"C4",fields:[{l:"Value",t:"num",u1:"mg/dL"}]},
    {name:"Uric acid",fields:[{l:"Value",t:"num",u1:"mg/dL",u2:"umol/L",c12:59.48,c21:0.0168}]},
  ]},
  {cat:"Endocrinology",tests:[
    {name:"TSH",fields:[{l:"Value",t:"num",u1:"mIU/L"}]},
    {name:"FT3",fields:[{l:"Value",t:"num",u1:"pg/mL"}]},
    {name:"FT4",fields:[{l:"Value",t:"num",u1:"ng/dL"}]},
    {name:"RBS",fields:[{l:"Value",t:"num",u1:"mg/dL",u2:"mmol/L",c12:0.0555,c21:18.02}]},
    {name:"FBS",fields:[{l:"Value",t:"num",u1:"mg/dL",u2:"mmol/L",c12:0.0555,c21:18.02}]},
    {name:"HbA1c",fields:[{l:"Value",t:"num",u1:"%"}]},
    {name:"Cortisol AM",fields:[{l:"Value",t:"num",u1:"ug/dL",u2:"nmol/L",c12:27.59,c21:0.0362}]},
    {name:"Vitamin D",fields:[{l:"Value",t:"num",u1:"ng/mL",u2:"nmol/L",c12:2.496,c21:0.4006}]},
    {name:"Calcium",fields:[{l:"Value",t:"num",u1:"mg/dL",u2:"mmol/L",c12:0.2495,c21:4.008}]},
    {name:"PTH",fields:[{l:"Value",t:"num",u1:"pg/mL"}]},
    {name:"Prolactin",fields:[{l:"Value",t:"num",u1:"ng/mL"}]},
  ]},
  {cat:"Tumor Markers",tests:[
    {name:"AFP",fields:[{l:"Value",t:"num",u1:"ng/mL"}]},
    {name:"CEA",fields:[{l:"Value",t:"num",u1:"ng/mL"}]},
    {name:"CA 19-9",fields:[{l:"Value",t:"num",u1:"U/mL"}]},
    {name:"CA 125",fields:[{l:"Value",t:"num",u1:"U/mL"}]},
    {name:"PSA",fields:[{l:"Value",t:"num",u1:"ng/mL"}]},
    {name:"Beta-HCG",fields:[{l:"Value",t:"num",u1:"mIU/mL"}]},
  ]},
  {cat:"Imaging",tests:[
    {name:"X-ray",fields:[{l:"Region",t:"text"},{l:"Report",t:"text"}]},
    {name:"USG",fields:[{l:"Region",t:"text"},{l:"Report",t:"text"}]},
    {name:"CT Scan",fields:[{l:"Region",t:"text"},{l:"Report",t:"text"}]},
    {name:"MRI",fields:[{l:"Region",t:"text"},{l:"Report",t:"text"}]},
    {name:"MRCP",fields:[{l:"Report",t:"text"}]},
    {name:"ECG",fields:[{l:"Report",t:"text"}]},
    {name:"Echo",fields:[{l:"Type",t:"dd",opts:["2D","3D","4D"]},{l:"EF",t:"num",u1:"%"},{l:"Report",t:"text"}]},
    {name:"Histopathology",fields:[{l:"Source",t:"text"},{l:"Report",t:"text"}]},
    {name:"Endoscopy",fields:[{l:"Report",t:"text"}]},
    {name:"FibroScan",fields:[{l:"kPa",t:"num",u1:"kPa"},{l:"CAP",t:"num",u1:"dB/m"}]},
  ]},
  {cat:"Special Scores",tests:[
    {name:"Child-Pugh",fields:[{l:"Score",t:"num",u1:""},{l:"Class",t:"dd",opts:["A","B","C"]}]},
    {name:"MELD",fields:[{l:"Score",t:"num",u1:""}]},
    {name:"MELD-Na",fields:[{l:"Score",t:"num",u1:""}]},
    {name:"Hepatic Encephalopathy",fields:[{l:"Grade",t:"dd",opts:["None","Grade 1","Grade 2","Grade 3","Grade 4"]}]},
    {name:"GCS",fields:[{l:"Eye",t:"num",u1:"/4"},{l:"Verbal",t:"num",u1:"/5"},{l:"Motor",t:"num",u1:"/6"}]},
  ]},
  {cat:"Neurology",tests:[
    {name:"EEG",fields:[{l:"Report",t:"text"}]},
    {name:"EMG/NCS",fields:[{l:"Report",t:"text"}]},
    {name:"CSF",fields:[{l:"Protein",t:"num",u1:"mg/dL"},{l:"Glucose",t:"num",u1:"mg/dL"},{l:"WBC",t:"num",u1:"cells/uL"},{l:"Gram stain",t:"dd",opts:["Positive","Negative"]},{l:"Culture",t:"text"}]},
  ]},
  {cat:"Ophthalmology",tests:[
    {name:"Visual Acuity",fields:[{l:"Right",t:"text"},{l:"Left",t:"text"}]},
    {name:"IOP",fields:[{l:"Right",t:"num",u1:"mmHg"},{l:"Left",t:"num",u1:"mmHg"}]},
    {name:"Fundoscopy",fields:[{l:"Report",t:"text"}]},
  ]},
  {cat:"Dermatology",tests:[
    {name:"Skin Biopsy",fields:[{l:"Report",t:"text"}]},
    {name:"KOH",fields:[{l:"Result",t:"dd",opts:["Positive","Negative"]}]},
  ]},
  {cat:"Reproductive",tests:[
    {name:"FSH",fields:[{l:"Value",t:"num",u1:"mIU/mL"}]},
    {name:"LH",fields:[{l:"Value",t:"num",u1:"mIU/mL"}]},
    {name:"Estradiol",fields:[{l:"Value",t:"num",u1:"pg/mL"}]},
    {name:"Testosterone",fields:[{l:"Value",t:"num",u1:"ng/dL",u2:"nmol/L",c12:0.0347,c21:28.82}]},
    {name:"Beta-HCG",fields:[{l:"Value",t:"num",u1:"mIU/mL"}]},
    {name:"AMH",fields:[{l:"Value",t:"num",u1:"ng/mL"}]},
    {name:"Pap Smear",fields:[{l:"Report",t:"text"}]},
  ]},
];

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function Muqsit() {
  const [page, setPage] = useState("login");
  const [activeTab, setActiveTab] = useState("prescription");
  const [view, setView] = useState("desktop");

  // Patient header
  const [ptName, setPtName] = useState("Fatima Khatun");
  const [ptAge, setPtAge] = useState("34");
  const [ptGender, setPtGender] = useState("Female");
  const [ptAddress, setPtAddress] = useState("Mirpur-10, Dhaka");
  const [ptWeight, setPtWeight] = useState("62");
  const [ptDate, setPtDate] = useState("2026-04-09");
  const [ptPhone, setPtPhone] = useState("+880 1712-345678");

  // Left column fields (each is array of items)
  const [chiefComplaints, setChiefComplaints] = useState([]);
  const [history, setHistory] = useState([]);
  const [investigation, setInvestigation] = useState([]);
  const [drugHistory, setDrugHistory] = useState([]);
  const [onExamination, setOnExamination] = useState([]);
  const [note, setNote] = useState([]);
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState([]);
  const [associatedIllness, setAssociatedIllness] = useState([]);
  const [finalDiagnosis, setFinalDiagnosis] = useState([]);

  // Right column
  const [rxItems, setRxItems] = useState([]);
  const [advice, setAdvice] = useState([]);
  const [adviceTest, setAdviceTest] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [showDrugPicker, setShowDrugPicker] = useState(false);
  const [drugSearch, setDrugSearch] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [followUpNum, setFollowUpNum] = useState("");
  const [followUpUnit, setFollowUpUnit] = useState("day");
  const [followUpMandatory, setFollowUpMandatory] = useState(false);
  const [showInvPopup, setShowInvPopup] = useState(false);
  const [invActiveCat, setInvActiveCat] = useState("Hematology");
  const [invFormData, setInvFormData] = useState({});
  const [calDate, setCalDate] = useState(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [invSearch, setInvSearch] = useState("");
  const [invImages, setInvImages] = useState({});
  const [showOePopup, setShowOePopup] = useState(false);
  const [ptSettingsTab, setPtSettingsTab] = useState("info");
  const [familyMembers, setFamilyMembers] = useState([]);
  const [showFamilyForm, setShowFamilyForm] = useState(false);
  const [familyRelation, setFamilyRelation] = useState("");
  const [familyForm, setFamilyForm] = useState({ name: "", mobile: "", nid: "", sex: "" });
  const [ptInfo, setPtInfo] = useState({
    name: "", dob: "", age: "", sex: "Male", ethnicity: "South Asian", religion: "Islam",
    mobile: "", spouseMobile: "", relativeMobile: "", relativeRelation: "",
    district: "", fullAddress: "", monthlyIncome: "", picture: null, tags: []
  });
  const [eventsPatient, setEventsPatient] = useState(null);
  const [eventMsg, setEventMsg] = useState("");
  const [rcQuery, setRcQuery] = useState("");
  const [rcFilter, setRcFilter] = useState("both");
  const [rcSelected, setRcSelected] = useState(new Set());
  const [watchPatient, setWatchPatient] = useState(false);
  const [hmDrugs, setHmDrugs] = useState(new Set());
  const [hmSymptoms, setHmSymptoms] = useState(new Set());
  const [hmTests, setHmTests] = useState(new Set());
  const [oeData, setOeData] = useState({
    age: "", dob: "", bloodGroup: "A+",
    heightCm: "", heightFt: "", heightIn: "",
    weightLb: "", weightKg: "",
    sbp: "", dbp: "",
    pulse: "", pulseNote: "",
    rr: "", spo2: "",
    anaemia: "", jaundice: "",
    ascites: "",
    auscHeart: "", auscLung: "",
    specialNote: "",
    diseaseHistory: "", surgicalHistory: ""
  });

  const handleLogin = () => setPage("app");
  const addDrug = (name) => { if (!rxItems.find(r => r.drug === name)) setRxItems([...rxItems, { drug: name, dose: "1+0+1", duration: "5 days", instruction: "After meal" }]); setShowDrugPicker(false); setDrugSearch(""); };
  const removeDrug = (idx) => setRxItems(rxItems.filter((_, i) => i !== idx));
  const updateRx = (idx, f, v) => { const c = [...rxItems]; c[idx] = { ...c[idx], [f]: v }; setRxItems(c); };
  const loadTemplate = (name) => { setActiveTemplate(name); if (templateRx[name]) setRxItems([...templateRx[name]]); };
  const savePrescription = () => { setSavedMsg("Prescription saved!"); setTimeout(() => setSavedMsg(""), 2500); };
  const filteredDrugs = drugDB.filter(d => d.name.toLowerCase().includes(drugSearch.toLowerCase()) || d.cat.toLowerCase().includes(drugSearch.toLowerCase()));

  // Cost calculation
  const monthlyCost = (() => {
    let total = 0;
    rxItems.forEach(item => {
      const drug = drugDB.find(d => d.name === item.drug);
      if (!drug) return;
      const doseParts = item.dose.split("+").map(Number).filter(n => !isNaN(n));
      const perDay = doseParts.reduce((a, b) => a + b, 0) || 1;
      const durMatch = item.duration.match(/(\d+)/);
      let days = durMatch ? parseInt(durMatch[1]) : 30;
      if (item.duration === "Continue") days = 30;
      if (item.dose.includes("ml")) { total += drug.price * Math.ceil((parseFloat(item.dose) || 10) * perDay * days / 100); }
      else { total += drug.price * perDay * days; }
    });
    return total;
  })();

  const font = "'DM Sans', 'Outfit', system-ui, sans-serif";
  const inputSm = { width: "100%", padding: "6px 10px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, fontSize: 12, outline: "none", boxSizing: "border-box", background: C.n[0], color: C.n[900], fontFamily: font };
  const fieldLabel = { fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" };

  const tabs = [
    { id: "prescription", label: "Prescription", icon: "℞" },
    { id: "opd", label: "OPD", icon: "▤" },
    { id: "ipd", label: "IPD", icon: "▥" },
    { id: "patients", label: "Patients", icon: "◉" },
    { id: "chat", label: "Chat", icon: "◈" },
    { id: "research", label: "Research companion", icon: "🔬" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];
  const mobileTabs = [
    { id: "prescription", label: "Rx", icon: "℞" },
    { id: "opd", label: "OPD", icon: "▤" },
    { id: "ipd", label: "IPD", icon: "▥" },
    { id: "chat", label: "Chat", icon: "◈" },
    { id: "research", label: "Research", icon: "🔬" },
    { id: "settings", label: "More", icon: "⋯" },
  ];

  const allFieldValues = { chiefComplaints, history, investigation, drugHistory, onExamination, note, provisionalDiagnosis, associatedIllness, finalDiagnosis };

  const leftFields = [
    { label: "Chief complaints", items: chiefComplaints, set: setChiefComplaints },
    { label: "History", items: history, set: setHistory },
    { label: "Investigation report findings", items: investigation, set: setInvestigation, sugKey: "Investigation report findings" },
    { label: "Drug history", items: drugHistory, set: setDrugHistory },
    { label: "On examination", items: onExamination, set: setOnExamination },
    { label: "Note / plan", items: note, set: setNote },
    { label: "Provisional diagnosis", items: provisionalDiagnosis, set: setProvisionalDiagnosis },
    { label: "Associated illness", items: associatedIllness, set: setAssociatedIllness },
    { label: "Final diagnosis", items: finalDiagnosis, set: setFinalDiagnosis },
  ];

  // ─── LOGIN ───
  if (page === "login") {
    return (
      <div style={{ fontFamily: font, minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${C.n[50]} 0%, #f0f7f4 100%)`, borderRadius: 16, padding: 40 }}>
        <div style={{ width: 380, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 32, padding: "12px 20px", background: C.n[0], borderRadius: 12, border: `0.5px solid ${C.n[200]}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 600 }}>M+</div>
            <span style={{ fontSize: 22, fontWeight: 500, color: C.n[900], letterSpacing: "-0.02em" }}>Muqsit Health System</span>
          </div>
          <p style={{ fontSize: 13, color: C.n[600], marginBottom: 24 }}>Patient management & prescription system</p>
          <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 14, padding: 28, textAlign: "left" }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: C.n[600], display: "block", marginBottom: 5 }}>Mobile number or email</label>
              <input defaultValue="+880 1712-345678" style={{ ...inputSm, padding: "10px 14px", fontSize: 13 }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: C.n[600], display: "block", marginBottom: 5 }}>Password</label>
              <input type="password" defaultValue="password123" style={{ ...inputSm, padding: "10px 14px", fontSize: 13 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <label style={{ fontSize: 11, color: C.n[600], display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" defaultChecked style={{ accentColor: C.pri[400], width: 14, height: 14 }} /> Remember me
              </label>
              <span style={{ fontSize: 11, color: C.pri[400], cursor: "pointer", fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>Forgot password?</span>
            </div>
            <button onClick={handleLogin} style={{ width: "100%", padding: "12px 20px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "opacity 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.92"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>Sign in as Doctor</button>
            <div style={{ textAlign: "center", fontSize: 11, color: C.n[600], marginTop: 16 }}>Patient? <span style={{ color: C.pri[400], cursor: "pointer", fontWeight: 500 }}>Sign in here</span></div>
          </div>
          <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 4, alignItems: "center" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.pri[400] }} />
            <span style={{ fontSize: 10, color: C.n[600] }}>Offline-ready · Encrypted · HIPAA compliant</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── PATIENT HEADER ───
  const PatientHeader = ({ mobile }) => (
    <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: mobile ? 10 : 14, marginBottom: mobile ? 10 : 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: mobile ? 6 : 10 }}>
        <div style={{ flex: mobile ? "1 1 45%" : "1 1 180px" }}><label style={fieldLabel}>Patient name</label><input value={ptName} readOnly style={{ ...inputSm, background: C.n[50], color: C.n[800], cursor: "default" }} /></div>
        <div style={{ flex: "0 0 55px" }}><label style={fieldLabel}>Age</label><input value={ptAge} readOnly style={{ ...inputSm, background: C.n[50], color: C.n[800], cursor: "default" }} /></div>
        <div style={{ flex: "0 0 78px" }}><label style={fieldLabel}>Gender</label><input value={ptGender} readOnly style={{ ...inputSm, background: C.n[50], color: C.n[800], cursor: "default", padding: "6px 10px" }} /></div>
        <div style={{ flex: mobile ? "1 1 100%" : "1 1 160px" }}><label style={fieldLabel}>Address</label><input value={ptAddress} readOnly style={{ ...inputSm, background: C.n[50], color: C.n[800], cursor: "default" }} /></div>
        <div style={{ flex: "0 0 60px" }}><label style={fieldLabel}>Weight</label><input value={ptWeight} readOnly style={{ ...inputSm, background: C.n[50], color: C.n[800], cursor: "default" }} /></div>
        <div style={{ flex: "0 0 120px" }}><label style={fieldLabel}>Date</label><input value={ptDate} readOnly style={{ ...inputSm, background: C.n[50], color: C.n[800], cursor: "default" }} /></div>
        {!mobile && <div style={{ flex: "0 0 140px" }}><label style={fieldLabel}>Mobile</label><input value={ptPhone} readOnly style={{ ...inputSm, background: C.n[50], color: C.n[800], cursor: "default" }} /></div>}
        <div style={{ flex: mobile ? "1 1 45%" : "0 0 150px" }}>
          <label style={fieldLabel}>Total monthly cost</label>
          <div style={{ padding: "6px 10px", borderRadius: 6, fontSize: 14, fontWeight: 600, background: monthlyCost > 0 ? C.pri[50] : C.n[100], border: `0.5px solid ${monthlyCost > 0 ? C.pri[100] : C.n[200]}`, color: monthlyCost > 0 ? C.pri[600] : C.n[500], display: "flex", alignItems: "center", gap: 4, minHeight: 30 }}>
            <span style={{ fontSize: 11, fontWeight: 400 }}>৳</span>{monthlyCost > 0 ? monthlyCost.toFixed(1) : "0.0"}
          </div>
        </div>
        {/* Watch checkbox */}
        <div style={{ flex: mobile ? "1 1 100%" : "0 0 auto", display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
          <label onClick={() => setWatchPatient(w => !w)} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", padding: "6px 12px", borderRadius: 8, border: `0.5px solid ${watchPatient ? "#f59e0b" : C.n[200]}`, background: watchPatient ? "#fffbeb" : C.n[0], userSelect: "none", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{watchPatient ? "👁️" : "👁"}</span>
            <span style={{ fontSize: 11, fontWeight: watchPatient ? 600 : 400, color: watchPatient ? "#b45309" : C.n[600] }}>Keep eye on this patient</span>
            <input type="checkbox" checked={watchPatient} onChange={() => {}} style={{ display: "none" }} />
            <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${watchPatient ? "#f59e0b" : C.n[300]}`, background: watchPatient ? "#f59e0b" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: "#fff", fontWeight: 700 }}>{watchPatient ? "✓" : ""}</span>
          </label>
        </div>

        <div style={{ flex: mobile ? "1 1 100%" : "0 0 auto", display: "flex", alignItems: "flex-end", gap: 6, paddingBottom: 1 }}>
          <button onClick={() => setActiveTab("pt-settings")} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `0.5px solid ${activeTab === "pt-settings" ? C.info[400] : C.n[200]}`, background: activeTab === "pt-settings" ? C.info[50] : C.n[0], color: activeTab === "pt-settings" ? C.info[800] : C.n[600], display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontFamily: font }}>
            <span style={{ fontSize: 13 }}>⊕</span> Patient Settings
          </button>
          <button onClick={() => setActiveTab("idsp")} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `0.5px solid ${activeTab === "idsp" ? C.warn[400] : C.n[200]}`, background: activeTab === "idsp" ? C.warn[50] : C.n[0], color: activeTab === "idsp" ? C.warn[800] : C.n[600], display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontFamily: font }}>
            <span style={{ fontSize: 13 }}>◎</span> Integrated health monitoring and overview
          </button>
        </div>
      </div>
    </div>
  );

  // ─── LEFT COLUMN ───
  const LeftColumn = () => (
    <div>
      {leftFields.map(f => {
        if (f.label === "Investigation report findings" || f.label === "On examination") {
          var openFn = f.label === "Investigation report findings" ? () => setShowInvPopup(true) : () => setShowOePopup(true);
          return (
            <div key={f.label} style={{ marginBottom: 2 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minHeight: 28 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.n[800], paddingTop: 4, cursor: "pointer" }} onClick={openFn}>{f.label}</span>
                {f.items.length === 0 && (
                  <button onClick={openFn} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid " + C.n[300], background: "transparent", color: C.pri[400], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 }}
                    onMouseEnter={function(e) { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; }}
                    onMouseLeave={function(e) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.n[300]; }}>+</button>
                )}
                {f.items.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1, alignItems: "center", paddingTop: 2 }}>
                    {f.items.map((item, idx) => (
                      <span key={idx} style={{ fontSize: 11, color: C.n[800], background: C.n[100], padding: "2px 8px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {item}
                        <button onClick={() => f.set(f.items.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                    <button onClick={openFn} style={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid " + C.n[300], background: "transparent", color: C.pri[400], fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
                  </div>
                )}
              </div>
            </div>
          );
        }
        return <ExpandableField key={f.label} label={f.label} items={f.items} setItems={f.set} suggestions={suggestionDB[f.sugKey || f.label] || []} allFields={allFieldValues} />;
      })}
    </div>
  );

  // ─── INVESTIGATION REPORT FINDINGS POPUP ───

  // Format date as string for display
  var formatCalDate = function(d) {
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var yyyy = d.getFullYear();
    return dd + "/" + mm + "/" + yyyy;
  };

  // Auto-save current form data to the current calDate before changing date
  var autoSaveInvData = function() {
    var dateStr = formatCalDate(calDate);
    var anyData = false;
    var allTests = INV_CATS.flatMap(function(c) { return c.tests; });
    allTests.forEach(function(test) {
      var fields = test.fields || [];
      var parts = fields.map(function(f) {
        var key = test.name + "__" + f.l;
        var val = invFormData[key];
        if (!val) return null;
        var unit = f.u1 ? f.u1 : "";
        var label = (f.l === "Value" || f.l === "Result" || f.l === "Report" || f.l === "Finding" || f.l === "Score" || f.l === "Status" || f.l === "Grade") ? "" : f.l + ":";
        return label + val + unit;
      }).filter(Boolean);
      if (parts.length > 0) {
        anyData = true;
        var result = dateStr + ":" + test.name + ":" + parts.join(",");
        if (!investigation.includes(result)) {
          setInvestigation(function(prev) { return prev.concat([result]); });
        }
        // Clear those fields
        fields.forEach(function(f) {
          var key = test.name + "__" + f.l;
          var key2 = test.name + "__" + f.l + "_u2";
          setInvFormData(function(prev) { var copy = Object.assign({}, prev); delete copy[key]; delete copy[key2]; return copy; });
        });
      }
    });
    return anyData;
  };

  const handleInvFieldChange = (testName, fieldLabel, value) => {
    const key = testName + "__" + fieldLabel;
    setInvFormData(prev => ({ ...prev, [key]: value }));
  };

  // Change calendar date — auto-save any pending data first
  var handleCalDateChange = function(newDate) {
    autoSaveInvData();
    setCalDate(newDate);
  };

  const addInvResult = (testName) => {
    var dateStr = formatCalDate(calDate);
    const found = INV_CATS.flatMap(c => c.tests).find(t => t.name === testName);
    const fields = (found && found.fields) ? found.fields : [];
    const parts = fields.map(f => {
      const key = testName + "__" + f.l;
      const val = invFormData[key];
      if (!val) return null;
      const unit = f.u1 ? f.u1 : "";
      const label = (f.l === "Value" || f.l === "Result" || f.l === "Report" || f.l === "Finding" || f.l === "Score" || f.l === "Status" || f.l === "Grade") ? "" : f.l + ":";
      return label + val + unit;
    }).filter(Boolean);
    if (parts.length > 0) {
      const result = dateStr + ":" + testName + ":" + parts.join(",");
      if (!investigation.includes(result)) setInvestigation([...investigation, result]);
      fields.forEach(f => {
        const key = testName + "__" + f.l;
        const key2 = testName + "__" + f.l + "_u2";
        setInvFormData(prev => { const copy = { ...prev }; delete copy[key]; delete copy[key2]; return copy; });
      });
    }
  };

  const addInvNormal = (testName) => {
    var dateStr = formatCalDate(calDate);
    const result = dateStr + ":" + testName + ":normal";
    if (!investigation.includes(result)) setInvestigation([...investigation, result]);
  };

  // Auto-save when popup closes
  var handleCloseInvPopup = function() {
    autoSaveInvData();
    setShowInvPopup(false);
  };

  const InvestigationPopup = () => showInvPopup && (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={handleCloseInvPopup}>
      <div onClick={e => e.stopPropagation()} style={{ width: 680, maxHeight: "85vh", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: "0 16px 48px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `0.5px solid ${C.n[200]}`, background: C.n[50] }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: C.n[900] }}>Investigation report findings</div>
            <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Enter test results — select a category, fill values, and add</div>
          </div>
          <button onClick={handleCloseInvPopup} style={{ width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        {/* Calendar */}
        {(function() {
          var today = new Date();
          var y = calDate.getFullYear();
          var m = calDate.getMonth();
          var firstDay = new Date(y, m, 1).getDay();
          var daysInMonth = new Date(y, m + 1, 0).getDate();
          var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
          var days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          var cells = [];
          for (var i = 0; i < firstDay; i++) cells.push(null);
          for (var d = 1; d <= daysInMonth; d++) cells.push(d);
          var shiftMonth = function(offset) { handleCalDateChange(new Date(y, m + offset, 1)); };
          var shiftYear = function(offset) { handleCalDateChange(new Date(y + offset, m, 1)); };
          var isToday = function(day) { return day && today.getFullYear() === y && today.getMonth() === m && today.getDate() === day; };
          var isSel = function(day) { return day && calDate.getDate() === day; };

          return (
            <div style={{ padding: "6px 20px 5px", borderBottom: "0.5px solid " + C.n[200], background: C.n[0] }}>
              {/* Selected date display */}
              <div style={{ textAlign: "center", marginBottom: 5 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: C.pri[600], letterSpacing: "0.02em" }}>{String(calDate.getDate()).padStart(2,"0")}</span>
                <span style={{ fontSize: 12, color: C.n[500], margin: "0 3px" }}>/</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: C.pri[600] }}>{String(calDate.getMonth()+1).padStart(2,"0")}</span>
                <span style={{ fontSize: 12, color: C.n[500], margin: "0 3px" }}>/</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: C.pri[600] }}>{calDate.getFullYear()}</span>
                <span style={{ fontSize: 10, color: C.n[500], marginLeft: 8 }}>{calDate.toLocaleDateString("en-US",{weekday:"long"})}</span>
              </div>
              {/* Nav row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ display: "flex", gap: 3 }}>
                  {[{l:"-1Y",fn:function(){shiftYear(-1)},c:C.danger},{l:"-5M",fn:function(){shiftMonth(-5)},c:C.warn},{l:"-3M",fn:function(){shiftMonth(-3)},c:C.warn},{l:"-1M",fn:function(){shiftMonth(-1)},c:C.info}].map(function(b) {
                    return <button key={b.l} onClick={b.fn} style={{ padding: "2px 7px", borderRadius: 4, border: "1px solid " + b.c[400], background: b.c[50], color: b.c[800] || b.c[600], fontSize: 9, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}>{b.l}</button>;
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {/* Clickable month with dropdown */}
                  <div style={{ position: "relative" }}>
                    <span onClick={function() { setShowMonthPicker(!showMonthPicker); }} style={{ fontSize: 12, fontWeight: 500, color: C.pri[600], cursor: "pointer", padding: "1px 5px", borderRadius: 4, background: showMonthPicker ? C.pri[50] : "transparent" }}>{months[m]}</span>
                    {showMonthPicker && (
                      <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 3, background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 20, width: 110, maxHeight: 180, overflowY: "auto" }}>
                        {months.map(function(mn, idx) {
                          return <div key={mn} onClick={function() { handleCalDateChange(new Date(y, idx, 1)); setShowMonthPicker(false); }}
                            style={{ padding: "5px 10px", fontSize: 10, cursor: "pointer", fontWeight: idx === m ? 600 : 400, color: idx === m ? C.pri[600] : C.n[800], background: idx === m ? C.pri[50] : "transparent" }}
                            onMouseEnter={function(e) { if (idx !== m) e.currentTarget.style.background = C.n[100]; }}
                            onMouseLeave={function(e) { if (idx !== m) e.currentTarget.style.background = "transparent"; }}
                          >{mn}</div>;
                        })}
                      </div>
                    )}
                  </div>
                  {/* Scrollable year */}
                  <span onWheel={function(e) { e.preventDefault(); if (e.deltaY < 0) shiftYear(1); else shiftYear(-1); }}
                    style={{ fontSize: 12, fontWeight: 500, color: C.n[900], cursor: "ns-resize", padding: "1px 5px", borderRadius: 4, userSelect: "none" }}
                    title="Scroll to change year">{y}</span>
                  <button onClick={function() { handleCalDateChange(new Date()); setShowMonthPicker(false); }} style={{ padding: "1px 7px", borderRadius: 4, border: "1px solid " + C.pri[400], background: C.pri[400], color: "#fff", fontSize: 8, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Today</button>
                </div>
                <div style={{ display: "flex", gap: 3 }}>
                  {[{l:"+1M",fn:function(){shiftMonth(1)},c:C.info},{l:"+3M",fn:function(){shiftMonth(3)},c:C.warn},{l:"+5M",fn:function(){shiftMonth(5)},c:C.warn},{l:"+1Y",fn:function(){shiftYear(1)},c:C.danger}].map(function(b) {
                    return <button key={b.l} onClick={b.fn} style={{ padding: "2px 7px", borderRadius: 4, border: "1px solid " + b.c[400], background: b.c[50], color: b.c[800] || b.c[600], fontSize: 9, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}>{b.l}</button>;
                  })}
                </div>
              </div>
              {/* Day headers */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0 }}>
                {days.map(function(d) { return <div key={d} style={{ textAlign: "center", fontSize: 8, fontWeight: 600, color: C.pri[600], padding: "3px 0", background: C.pri[50], borderRadius: 2 }}>{d}</div>; })}
                {cells.map(function(day, i) {
                  var todayMatch = isToday(day);
                  var selected = isSel(day);
                  return (
                    <div key={i} onClick={function() { if (day) handleCalDateChange(new Date(y, m, day)); }}
                      style={{ textAlign: "center", padding: "3px 0", fontSize: 10, cursor: day ? "pointer" : "default",
                        color: day ? (todayMatch ? "#fff" : C.n[800]) : "transparent",
                        background: todayMatch ? C.pri[400] : (selected && !todayMatch ? C.pri[50] : "transparent"),
                        borderRadius: todayMatch ? 4 : (selected ? 4 : 0),
                        fontWeight: todayMatch ? 600 : 400
                      }}>{day || ""}</div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Search bar */}
        <div style={{ padding: "6px 20px", borderBottom: "0.5px solid " + C.n[200], background: C.n[50] }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: C.n[500], flexShrink: 0 }}>&#x2315;</span>
            <input value={invSearch} onChange={function(e) { setInvSearch(e.target.value); }}
              placeholder="Search test name across all categories..."
              style={{ flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 11, border: "0.5px solid " + C.n[200], outline: "none", background: C.n[0], color: C.n[900], fontFamily: "inherit" }} />
            {invSearch && <button onClick={function() { setInvSearch(""); }} style={{ background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>}
          </div>
          {invSearch && (function() {
            var results = [];
            INV_CATS.forEach(function(cat) {
              cat.tests.forEach(function(test) {
                if (test.name.toLowerCase().indexOf(invSearch.toLowerCase()) >= 0) {
                  results.push({ cat: cat.cat, test: test.name });
                }
              });
            });
            if (results.length === 0) return <div style={{ fontSize: 10, color: C.n[500], marginTop: 4 }}>No tests found for "{invSearch}"</div>;
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {results.slice(0, 12).map(function(r) {
                  return (
                    <button key={r.cat + r.test} onClick={function() { setInvActiveCat(r.cat); setInvSearch(""); }}
                      style={{ padding: "3px 10px", borderRadius: 5, fontSize: 10, cursor: "pointer", border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[800], fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}
                      onMouseEnter={function(e) { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; }}
                      onMouseLeave={function(e) { e.currentTarget.style.background = C.n[0]; e.currentTarget.style.borderColor = C.n[200]; }}>
                      <span style={{ fontWeight: 500 }}>{r.test}</span>
                      <span style={{ fontSize: 8, color: C.n[500] }}>{r.cat}</span>
                    </button>
                  );
                })}
                {results.length > 12 && <span style={{ fontSize: 9, color: C.n[500], alignSelf: "center" }}>+{results.length - 12} more</span>}
              </div>
            );
          })()}
        </div>

        {/* Added results */}
        {investigation.length > 0 && (
          <div style={{ padding: "10px 20px", borderBottom: `0.5px solid ${C.n[200]}`, background: C.pri[50], maxHeight: 120, overflowY: "auto" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.pri[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Added results ({investigation.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {investigation.map((item, idx) => {
                var hasImg = item.indexOf("[image attached]") >= 0;
                var imgKey = hasImg ? item.replace(":[image attached]", "") : null;
                return (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.pri[600], background: C.n[0], padding: "3px 8px 3px 10px", borderRadius: 4, border: `0.5px solid ${C.pri[100]}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {hasImg && invImages[imgKey] && <img src={invImages[imgKey]} style={{ width: 20, height: 20, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} />}
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", fontFamily: "monospace", fontSize: 10 }}>{item}</span>
                  <button onClick={() => setInvestigation(investigation.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: C.pri[400], cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Category sidebar */}
          <div style={{ width: 160, borderRight: `0.5px solid ${C.n[200]}`, padding: "8px 0", overflowY: "auto", flexShrink: 0 }}>
            {INV_CATS.map(c => (
              <button key={c.cat} onClick={() => setInvActiveCat(c.cat)} style={{
                display: "block", width: "100%", padding: "8px 16px", border: "none", cursor: "pointer",
                fontSize: 12, textAlign: "left", fontFamily: "inherit",
                background: invActiveCat === c.cat ? C.pri[50] : "transparent",
                color: invActiveCat === c.cat ? C.pri[600] : C.n[600],
                fontWeight: invActiveCat === c.cat ? 500 : 400,
                borderLeft: invActiveCat === c.cat ? `3px solid ${C.pri[400]}` : "3px solid transparent",
              }}>{c.cat}</button>
            ))}
          </div>

          {/* Test forms */}
          <div style={{ flex: 1, padding: "12px 20px", overflowY: "auto" }}>
            {(((INV_CATS.find(c => c.cat === invActiveCat)) || {}).tests || []).map(test => (
              <div key={test.name} style={{ marginBottom: 14, padding: "12px 14px", background: C.n[50], borderRadius: 8, border: `0.5px solid ${C.n[200]}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.n[900] }}>{test.name}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => addInvNormal(test.name)} style={{
                      padding: "4px 12px", borderRadius: 6, border: `0.5px solid ${C.pri[100]}`,
                      background: C.pri[50], color: C.pri[600], fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "inherit"
                    }}>Normal</button>
                    <label style={{
                      padding: "4px 12px", borderRadius: 6, border: "none",
                      background: C.pri[400], color: "#fff", fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                      display: "inline-flex", alignItems: "center", gap: 4
                    }}>
                      <span>Add report image</span>
                      <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={function(e) {
                        var file = e.target.files && e.target.files[0];
                        if (file) {
                          var reader = new FileReader();
                          reader.onload = function(ev) {
                            var dateStr = formatCalDate(calDate);
                            var imgKey = dateStr + ":" + test.name;
                            setInvImages(function(prev) { return Object.assign({}, prev, {[imgKey]: ev.target.result}); });
                            var entry = dateStr + ":" + test.name + ":[image attached]";
                            setInvestigation(function(prev) {
                              if (prev.indexOf(entry) === -1) return prev.concat([entry]);
                              return prev;
                            });
                          };
                          reader.readAsDataURL(file);
                        }
                        e.target.value = "";
                      }} />
                    </label>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {test.fields.map(function(f) {
                    var key1 = test.name + "__" + f.l;
                    var key2 = test.name + "__" + f.l + "_u2";
                    var fieldW = test.fields.length <= 2 ? "1 1 200px" : (f.u2 ? "1 1 200px" : "1 1 100px");
                    var inp = { width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", background: C.n[0], color: C.n[900], fontFamily: "inherit", boxSizing: "border-box" };

                    if (f.t === "dd") {
                      return (
                        <div key={f.l} style={{ flex: fieldW, minWidth: 0 }}>
                          <div style={{ fontSize: 9, color: C.n[500], textTransform: "uppercase", marginBottom: 3 }}>{f.l}</div>
                          <select value={invFormData[key1] || ""} onChange={function(e) { handleInvFieldChange(test.name, f.l, e.target.value); }}
                            style={Object.assign({}, inp, { padding: "6px 4px" })}>
                            <option value="">Select</option>
                            {(f.opts || []).map(function(o) { return <option key={o} value={o}>{o}</option>; })}
                          </select>
                        </div>
                      );
                    }

                    if (f.t === "text") {
                      return (
                        <div key={f.l} style={{ flex: fieldW, minWidth: 0 }}>
                          <div style={{ fontSize: 9, color: C.n[500], textTransform: "uppercase", marginBottom: 3 }}>{f.l}</div>
                          <input value={invFormData[key1] || ""} onChange={function(e) { handleInvFieldChange(test.name, f.l, e.target.value); }}
                            onKeyDown={function(e) { if (e.key === "Enter") addInvResult(test.name); }}
                            placeholder="Enter..." style={inp} />
                        </div>
                      );
                    }

                    // num field — with optional dual unit conversion
                    if (f.u2) {
                      var v1 = invFormData[key1] || "";
                      var v2 = invFormData[key2] || "";
                      return (
                        <div key={f.l} style={{ flex: "1 1 200px", minWidth: 0 }}>
                          <div style={{ fontSize: 9, color: C.n[500], textTransform: "uppercase", marginBottom: 3 }}>{f.l}</div>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <div style={{ flex: 1 }}>
                              <input value={v1} placeholder={f.u1}
                                onChange={function(e) {
                                  var val = e.target.value;
                                  handleInvFieldChange(test.name, f.l, val);
                                  var num = parseFloat(val);
                                  if (!isNaN(num) && f.c12) {
                                    handleInvFieldChange(test.name, f.l + "_u2", (Math.round(num * f.c12 * 100) / 100).toString());
                                  } else {
                                    handleInvFieldChange(test.name, f.l + "_u2", "");
                                  }
                                }}
                                onKeyDown={function(e) { if (e.key === "Enter") addInvResult(test.name); }}
                                style={inp} />
                              <div style={{ fontSize: 8, color: C.n[500], marginTop: 1 }}>{f.u1}</div>
                            </div>
                            <span style={{ fontSize: 10, color: C.n[400], flexShrink: 0 }}>=</span>
                            <div style={{ flex: 1 }}>
                              <input value={v2} placeholder={f.u2}
                                onChange={function(e) {
                                  var val = e.target.value;
                                  handleInvFieldChange(test.name, f.l + "_u2", val);
                                  var num = parseFloat(val);
                                  if (!isNaN(num) && f.c21) {
                                    handleInvFieldChange(test.name, f.l, (Math.round(num * f.c21 * 100) / 100).toString());
                                  } else {
                                    handleInvFieldChange(test.name, f.l, "");
                                  }
                                }}
                                style={inp} />
                              <div style={{ fontSize: 8, color: C.n[500], marginTop: 1 }}>{f.u2}</div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Single unit num field
                    return (
                      <div key={f.l} style={{ flex: fieldW, minWidth: 0 }}>
                        <div style={{ fontSize: 9, color: C.n[500], textTransform: "uppercase", marginBottom: 3 }}>{f.l} {f.u1 && <span style={{ color: C.n[300] }}>({f.u1})</span>}</div>
                        <input value={invFormData[key1] || ""} onChange={function(e) { handleInvFieldChange(test.name, f.l, e.target.value); }}
                          onKeyDown={function(e) { if (e.key === "Enter") addInvResult(test.name); }}
                          placeholder={f.u1 || "Value"} style={inp} />
                      </div>
                    );
                  })}
                </div>
                {/* Previous entries for this test */}
                {(function() {
                  var prevEntries = investigation.filter(function(item) {
                    var colonIdx = item.indexOf(":");
                    if (colonIdx < 0) return false;
                    var afterDate = item.substring(colonIdx + 1);
                    var secondColon = afterDate.indexOf(":");
                    var testPart = secondColon >= 0 ? afterDate.substring(0, secondColon) : afterDate;
                    return testPart === test.name;
                  });
                  if (prevEntries.length === 0) return null;
                  return (
                    <div style={{ marginTop: 6, borderTop: "0.5px dashed " + C.n[200], paddingTop: 4 }}>
                      {prevEntries.map(function(entry, ei) {
                        return (
                          <div key={ei} style={{ fontSize: 9, color: C.info[800], background: C.info[50], padding: "2px 8px", borderRadius: 3, marginBottom: 2, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            prev: {entry}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            ))}

            {/* Free text entry */}
            <div style={{ marginTop: 8, padding: "12px 14px", background: C.n[0], borderRadius: 8, border: `1px dashed ${C.n[300]}` }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.n[600], marginBottom: 6 }}>Other / free text</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  placeholder="Type any investigation finding..."
                  onKeyDown={e => {
                    if (e.key === "Enter" && e.target.value.trim()) {
                      var dateStr = formatCalDate(calDate);
                      setInvestigation([...investigation, dateStr + ":" + e.target.value.trim()]);
                      e.target.value = "";
                    }
                  }}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 6, fontSize: 12,
                    border: `0.5px solid ${C.n[200]}`, outline: "none", background: C.n[50],
                    color: C.n[900], fontFamily: "inherit"
                  }} />
                <button onClick={e => {
                  const input = e.currentTarget.previousSibling;
                  if (input.value.trim()) { var dateStr = formatCalDate(calDate); setInvestigation([...investigation, dateStr + ":" + input.value.trim()]); input.value = ""; }
                }} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50] }}>
          <button onClick={handleCloseInvPopup} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
        </div>
      </div>
    </div>
  );

  // ─── RIGHT COLUMN ───
  const RightColumn = ({ mobile }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 8 : 10 }}>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {Object.keys(templateRx).map(t => (<button key={t} onClick={() => loadTemplate(t)} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 10, cursor: "pointer", border: `0.5px solid ${activeTemplate === t ? C.pri[400] : C.n[200]}`, background: activeTemplate === t ? C.pri[50] : C.n[0], color: activeTemplate === t ? C.pri[600] : C.n[600], fontFamily: font }}>{t}</button>))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 22, fontWeight: 500, color: C.pri[400], fontStyle: "italic" }}>℞</div>
        <button onClick={() => setShowDrugPicker(true)} style={{ padding: "4px 12px", borderRadius: 6, border: `1px dashed ${C.n[300]}`, background: "transparent", color: C.pri[400], fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: font }}>+ Add drug</button>
      </div>
      <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 8 }}>
        {rxItems.length === 0 && <div style={{ textAlign: "center", padding: "24px 16px", color: C.n[500], fontSize: 11 }}>No drugs added yet</div>}
        {rxItems.map((item, idx) => (
          <div key={idx} style={{ padding: mobile ? "8px 10px" : "10px 14px", borderBottom: idx < rxItems.length - 1 ? `0.5px solid ${C.n[200]}` : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{idx + 1}. {item.drug}</span>
              <button onClick={() => removeDrug(idx)} style={{ background: "none", border: "none", color: C.danger[400], cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: "flex", gap: mobile ? 4 : 8, flexWrap: "wrap" }}>
              {[{ f: "dose", opts: ["1+0+0","0+0+1","1+0+1","1+1+1","1+1+1+1","½+0+½","5ml","10ml","As needed"] },
                { f: "duration", opts: ["3 days","5 days","7 days","10 days","14 days","21 days","30 days","Continue"] },
                { f: "instruction", opts: ["Before meal","After meal","Before meal (30 min)","Empty stomach","Morning","At night","SOS"] }
              ].map(({ f, opts }) => (<select key={f} value={item[f]} onChange={e => updateRx(idx, f, e.target.value)} style={{ ...inputSm, fontSize: 10, padding: "3px 4px", flex: "1 1 70px", minWidth: 0 }}>{opts.map(o => <option key={o}>{o}</option>)}</select>))}
            </div>
          </div>
        ))}
      </div>
      <ExpandableField label="Advice" items={advice} setItems={setAdvice} suggestions={["Rest for 3 days","Drink plenty of fluids","Avoid cold water","Avoid oily/spicy food","Light diet","Regular exercise","Monitor blood sugar","Follow medication schedule","Avoid self-medication","Emergency visit if worsens","Elevate affected limb","Apply warm compress"]} allFields={allFieldValues} />
      <ExpandableField label="Advised tests / investigation" items={adviceTest} setItems={setAdviceTest} suggestions={["CBC","CRP","ESR","RBS","FBS","HbA1c","Lipid profile","LFT","RFT","Urine R/E","Chest X-ray PA","ECG","USG abdomen","Blood culture","Thyroid profile","Serum electrolytes","Dengue NS1","Widal test","D-dimer","Troponin I","PT/INR"]} allFields={allFieldValues} />
      <div>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.n[800] }}>Follow-up</span>
        <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input type="number" min="1" value={followUpNum} onChange={function(e) { setFollowUpNum(e.target.value); }}
            placeholder="No." style={{ width: 60, padding: "6px 8px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", background: C.n[0], color: C.n[900], fontFamily: "inherit", textAlign: "center" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: followUpUnit === "day" ? C.pri[600] : C.n[600], cursor: "pointer" }}>
            <input type="radio" name="fuUnit" checked={followUpUnit === "day"} onChange={function() { setFollowUpUnit("day"); }} style={{ accentColor: C.pri[400] }} />
            Day
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: followUpUnit === "month" ? C.pri[600] : C.n[600], cursor: "pointer" }}>
            <input type="radio" name="fuUnit" checked={followUpUnit === "month"} onChange={function() { setFollowUpUnit("month"); }} style={{ accentColor: C.pri[400] }} />
            Month
          </label>
          <div style={{ width: 1, height: 20, background: C.n[200], margin: "0 2px" }}></div>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: followUpMandatory ? C.danger[800] : C.n[600], cursor: "pointer", fontWeight: followUpMandatory ? 500 : 400 }}>
            <input type="checkbox" checked={followUpMandatory} onChange={function() { setFollowUpMandatory(!followUpMandatory); }} style={{ accentColor: C.danger[400] }} />
            Mandatory
          </label>
        </div>
        {followUpMandatory && followUpNum && (
          <div style={{ marginTop: 5, fontSize: 9, color: C.warn[800], background: C.warn[50], padding: "4px 10px", borderRadius: 4, display: "inline-block" }}>
            Reminder will be sent 2 days before follow-up date
          </div>
        )}
      </div>
    </div>
  );

  // ─── DRUG PICKER ───
  const DrugPicker = ({ mobile }) => showDrugPicker && (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.2)", display: "flex", alignItems: mobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, borderRadius: 12 }} onClick={() => setShowDrugPicker(false)}>
      <div onClick={e => e.stopPropagation()} style={{ width: mobile ? "100%" : 440, maxHeight: mobile ? "70%" : 440, background: C.n[0], borderRadius: mobile ? "16px 16px 0 0" : 12, border: `0.5px solid ${C.n[200]}`, padding: 16, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 14, fontWeight: 500 }}>Add drug</span><button onClick={() => setShowDrugPicker(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.n[600] }}>×</button></div>
        <input autoFocus value={drugSearch} onChange={e => setDrugSearch(e.target.value)} placeholder="Search drug name or category..." style={{ ...inputSm, marginBottom: 10 }} />
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredDrugs.map(d => { const added = rxItems.find(r => r.drug === d.name); return (
            <div key={d.name} onClick={() => !added && addDrug(d.name)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 6px", cursor: added ? "default" : "pointer", borderBottom: `0.5px solid ${C.n[100]}` }}>
              <div><div style={{ fontSize: 12, fontWeight: 500 }}>{d.name}</div><div style={{ fontSize: 10, color: C.n[600] }}>{d.cat} · ৳{d.price}/unit</div></div>
              {added ? <Pill bg={C.pri[50]} fg={C.pri[600]}>Added</Pill> : <span style={{ fontSize: 18, color: C.pri[400] }}>+</span>}
            </div>); })}
        </div>
      </div>
    </div>
  );

  // ─── ON EXAMINATION POPUP ───
  var oeD = oeData;
  var setOe = function(field, val) { setOeData(function(prev) { return Object.assign({}, prev, { [field]: val }); }); };
  // Auto-calculations
  var hCm = parseFloat(oeD.heightCm) || 0;
  var hFt = parseFloat(oeD.heightFt) || 0;
  var hIn = parseFloat(oeD.heightIn) || 0;
  var wKg = parseFloat(oeD.weightKg) || 0;
  var wLb = parseFloat(oeD.weightLb) || 0;
  var sbp = parseFloat(oeD.sbp) || 0;
  var dbp = parseFloat(oeD.dbp) || 0;
  var calcCmFromFtIn = Math.round((hFt * 30.48 + hIn * 2.54) * 10) / 10;
  var calcTotalIn = hCm / 2.54;
  var calcFt = Math.floor(calcTotalIn / 12);
  var calcIn = Math.round((calcTotalIn - calcFt * 12) * 10) / 10;
  var calcKgFromLb = Math.round(wLb * 0.453592 * 10) / 10;
  var hM = hCm / 100;
  var bmi = (hM > 0 && wKg > 0) ? Math.round(wKg / (hM * hM) * 10) / 10 : 0;
  var ibwLow = hM > 0 ? Math.round(19.5 * hM * hM * 10) / 10 : 0;
  var ibwHigh = hM > 0 ? Math.round(25 * hM * hM * 10) / 10 : 0;
  var map = (sbp > 0 && dbp > 0) ? Math.round((sbp + 2 * dbp) / 3 * 10) / 10 : 0;

  var saveOeToItems = function() {
    var results = [];
    if (oeD.age) results.push("Age: " + oeD.age);
    if (oeD.bloodGroup) results.push("Blood group: " + oeD.bloodGroup);
    if (hCm > 0) results.push("Height: " + hCm + " cm");
    if (wKg > 0) results.push("Weight: " + wKg + " kg");
    if (bmi > 0) results.push("BMI: " + bmi);
    if (ibwLow > 0) results.push("Ideal BW: " + ibwLow + "-" + ibwHigh + " kg");
    if (sbp > 0) results.push("BP: " + sbp + "/" + dbp + " mmHg");
    if (map > 0) results.push("MAP: " + map + " mmHg");
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
    setShowOePopup(false);
  };

  var oeLbl = { fontSize: 9, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 3 };
  var oeInp = { width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", background: C.n[0], color: C.n[900], boxSizing: "border-box", fontFamily: "inherit" };
  var oeSel = Object.assign({}, oeInp, { padding: "6px 4px" });
  var oeRow = { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" };
  var oeCalc = { fontSize: 10, color: C.pri[600], background: C.pri[50], padding: "3px 8px", borderRadius: 4, marginTop: 2 };

  var OePopup = function() {
    if (!showOePopup) return null;
    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={function() { setShowOePopup(false); }}>
        <div onClick={function(e) { e.stopPropagation(); }} style={{ width: 700, maxHeight: "88vh", background: C.n[0], borderRadius: 14, border: "0.5px solid " + C.n[200], boxShadow: "0 16px 48px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "0.5px solid " + C.n[200], background: C.n[50] }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: C.n[900] }}>On examination</div>
              <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Physical examination with auto-calculations</div>
            </div>
            <button onClick={function() { setShowOePopup(false); }} style={{ width: 28, height: 28, borderRadius: 6, border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
          <div style={{ padding: "16px 20px", flex: 1, overflowY: "auto" }}>

            <div style={oeRow}>
              <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>Age</div><input style={oeInp} value={oeD.age} onChange={function(e){setOe("age",e.target.value)}} placeholder="e.g. 34" /></div>
              <div style={{ flex: "1 1 120px" }}><div style={oeLbl}>Date of birth</div><input style={oeInp} type="date" value={oeD.dob} onChange={function(e){setOe("dob",e.target.value)}} /></div>
              <div style={{ flex: "1 1 120px" }}><div style={oeLbl}>Blood group & Rh</div><select style={oeSel} value={oeD.bloodGroup} onChange={function(e){setOe("bloodGroup",e.target.value)}}><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option><option>Other</option></select></div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 6, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Anthropometry</div>
            <div style={oeRow}>
              <div style={{ flex: "1 1 80px" }}><div style={oeLbl}>Height (cm)</div><input style={oeInp} value={oeD.heightCm} onChange={function(e){setOe("heightCm",e.target.value)}} placeholder="cm" />{hCm > 0 && <div style={oeCalc}>{calcFt} ft {calcIn} in</div>}</div>
              <div style={{ flex: "1 1 60px" }}><div style={oeLbl}>Height (ft)</div><input style={oeInp} value={oeD.heightFt} onChange={function(e){setOe("heightFt",e.target.value)}} placeholder="feet" /></div>
              <div style={{ flex: "1 1 60px" }}><div style={oeLbl}>Height (in)</div><input style={oeInp} value={oeD.heightIn} onChange={function(e){setOe("heightIn",e.target.value)}} placeholder="inch" />{(hFt > 0 || hIn > 0) && <div style={oeCalc}>{calcCmFromFtIn} cm</div>}</div>
              <div style={{ flex: "1 1 80px" }}><div style={oeLbl}>Weight (lb)</div><input style={oeInp} value={oeD.weightLb} onChange={function(e){setOe("weightLb",e.target.value)}} placeholder="lb" />{wLb > 0 && <div style={oeCalc}>{calcKgFromLb} kg</div>}</div>
              <div style={{ flex: "1 1 80px" }}><div style={oeLbl}>Weight (kg)</div><input style={oeInp} value={oeD.weightKg} onChange={function(e){setOe("weightKg",e.target.value)}} placeholder="kg" /></div>
            </div>
            <div style={oeRow}>
              <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>BMI (auto)</div><div style={{ padding: "7px 8px", borderRadius: 6, fontSize: 13, fontWeight: 500, background: bmi > 0 ? (bmi < 18.5 ? C.warn[50] : bmi > 25 ? C.danger[50] : C.pri[50]) : C.n[100], color: bmi > 0 ? (bmi < 18.5 ? C.warn[800] : bmi > 25 ? C.danger[800] : C.pri[600]) : C.n[500] }}>{bmi > 0 ? bmi : "—"}</div></div>
              <div style={{ flex: "1 1 180px" }}><div style={oeLbl}>Ideal body weight (auto)</div><div style={{ padding: "7px 8px", borderRadius: 6, fontSize: 12, background: C.n[100], color: C.n[800] }}>{ibwLow > 0 ? ibwLow + " – " + ibwHigh + " kg (" + Math.round(ibwLow * 2.20462) + " – " + Math.round(ibwHigh * 2.20462) + " lb)" : "—"}</div></div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 6, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Vitals</div>
            <div style={oeRow}>
              <div style={{ flex: "1 1 80px" }}><div style={oeLbl}>Systolic BP</div><input style={oeInp} value={oeD.sbp} onChange={function(e){setOe("sbp",e.target.value)}} placeholder="mmHg" /></div>
              <div style={{ flex: "1 1 80px" }}><div style={oeLbl}>Diastolic BP</div><input style={oeInp} value={oeD.dbp} onChange={function(e){setOe("dbp",e.target.value)}} placeholder="mmHg" /></div>
              <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>MAP (auto)</div><div style={{ padding: "7px 8px", borderRadius: 6, fontSize: 13, fontWeight: 500, background: map > 0 ? C.info[50] : C.n[100], color: map > 0 ? C.info[800] : C.n[500] }}>{map > 0 ? map + " mmHg" : "—"}</div></div>
              <div style={{ flex: "1 1 80px" }}><div style={oeLbl}>Pulse (b/m)</div><input style={oeInp} value={oeD.pulse} onChange={function(e){setOe("pulse",e.target.value)}} placeholder="b/m" /></div>
              <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>Pulse note</div><input style={oeInp} value={oeD.pulseNote} onChange={function(e){setOe("pulseNote",e.target.value)}} placeholder="Regular, irregular..." /></div>
            </div>
            <div style={oeRow}>
              <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>Respiratory rate (/min)</div><input style={oeInp} value={oeD.rr} onChange={function(e){setOe("rr",e.target.value)}} placeholder="/min" /></div>
              <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>SpO2 (%)</div><input style={oeInp} value={oeD.spo2} onChange={function(e){setOe("spo2",e.target.value)}} placeholder="%" /></div>
              <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>Anaemia</div><select style={oeSel} value={oeD.anaemia} onChange={function(e){setOe("anaemia",e.target.value)}}><option value="">None</option><option>+</option><option>++</option><option>+++</option></select></div>
              <div style={{ flex: "1 1 100px" }}><div style={oeLbl}>Jaundice</div><select style={oeSel} value={oeD.jaundice} onChange={function(e){setOe("jaundice",e.target.value)}}><option value="">None</option><option>+</option><option>++</option><option>+++</option></select></div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 6, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Clinical findings</div>
            <div style={oeRow}>
              <div style={{ flex: "1 1 120px" }}><div style={oeLbl}>Ascites</div><select style={oeSel} value={oeD.ascites} onChange={function(e){setOe("ascites",e.target.value)}}><option value="">Absent</option><option>Mild</option><option>Moderate</option><option>Huge</option></select></div>
              <div style={{ flex: "1 1 200px" }}><div style={oeLbl}>Auscultation of heart</div><input style={oeInp} value={oeD.auscHeart} onChange={function(e){setOe("auscHeart",e.target.value)}} placeholder="S1S2 normal, murmur..." /></div>
              <div style={{ flex: "1 1 200px" }}><div style={oeLbl}>Auscultation of lung</div><input style={oeInp} value={oeD.auscLung} onChange={function(e){setOe("auscLung",e.target.value)}} placeholder="Clear, crepts, wheeze..." /></div>
            </div>
            <div style={{ marginBottom: 10 }}><div style={oeLbl}>Special note / other findings</div><input style={oeInp} value={oeD.specialNote} onChange={function(e){setOe("specialNote",e.target.value)}} placeholder="Any additional examination findings..." /></div>

            <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 6, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>History</div>
            <div style={{ marginBottom: 10 }}><div style={oeLbl}>Disease history</div><input style={oeInp} value={oeD.diseaseHistory} onChange={function(e){setOe("diseaseHistory",e.target.value)}} placeholder="e.g. First known, disease event etc." /></div>
            <div style={{ marginBottom: 6 }}><div style={oeLbl}>Surgical / intervention history</div><input style={oeInp} value={oeD.surgicalHistory} onChange={function(e){setOe("surgicalHistory",e.target.value)}} placeholder="e.g. Cholecystectomy, RFA, TACE of HCC etc." /></div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "0.5px solid " + C.n[200], background: C.n[50] }}>
            <button onClick={function() { setShowOePopup(false); }} style={{ padding: "8px 20px", borderRadius: 8, border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button onClick={saveOeToItems} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Save examination</button>
          </div>
        </div>
      </div>
    );
  };

  // ─── PAGE RENDERERS ───
  const renderPage = () => {
    switch (activeTab) {
      case "opd": return (
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>OPD queue management</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            <div style={{ background: C.n[100], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.n[600] }}>Total today</div><div style={{ fontSize: 22, fontWeight: 500 }}>24</div></div>
            <div style={{ background: C.pri[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.pri[600] }}>Completed</div><div style={{ fontSize: 22, fontWeight: 500, color: C.pri[600] }}>18</div></div>
            <div style={{ background: C.warn[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.warn[800] }}>Waiting</div><div style={{ fontSize: 22, fontWeight: 500, color: C.warn[800] }}>6</div></div>
          </div>
          <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "4px 14px" }}>
            {opdQueue.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < opdQueue.length - 1 ? `0.5px solid ${C.n[200]}` : "none" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: colorOf(p.color).bg, color: colorOf(p.color).fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{p.init}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 11, color: C.n[600] }}>{p.phone} · {p.age}y/{p.gender}</div></div>
                <Pill bg={colorOf(p.color).bg} fg={colorOf(p.color).fg}>{p.type}</Pill>
                <Pill bg={C.n[100]} fg={C.n[800]}>{p.token}</Pill>
                <button onClick={() => { setPtName(p.name); setPtAge(String(p.age)); setPtGender(p.gender === "F" ? "Female" : "Male"); setActiveTab("prescription"); setRxItems([]); setActiveTemplate(null); }}
                  style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: font }}>Prescribe</button>
              </div>
            ))}
          </div>
        </div>
      );
      case "ipd": return (
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
                <div onClick={e => e.stopPropagation()} style={{ background: C.n[0], borderRadius: 14, width: 480, maxWidth: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
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
                      onChange={e => setEventMsg(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          const msg = eventMsg.trim();
                          if (!msg) return;
                          const now = new Date();
                          const ts = `${now.getDate()} ${now.toLocaleString("default",{month:"short"})} ${now.getFullYear()} · ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
                          ipdEvents[eventsPatient.bed] = [...(ipdEvents[eventsPatient.bed]||[]), { ts, author: "Dr.", role: "", note: msg, report: null }];
                          setEventMsg("");
                          setEventsPatient({ ...eventsPatient });
                        }
                      }}
                      placeholder="Add an event note… (Enter to send, Shift+Enter for new line)"
                      rows={2}
                      style={{ flex: 1, resize: "none", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, padding: "8px 10px", fontSize: 12, fontFamily: font, color: C.n[800], outline: "none", lineHeight: 1.5, background: C.n[50] }}
                    />
                    <button
                      onClick={() => {
                        const msg = eventMsg.trim();
                        if (!msg) return;
                        const now = new Date();
                        const ts = `${now.getDate()} ${now.toLocaleString("default",{month:"short"})} ${now.getFullYear()} · ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
                        ipdEvents[eventsPatient.bed] = [...(ipdEvents[eventsPatient.bed]||[]), { ts, author: "Dr.", role: "", note: msg, report: null }];
                        setEventMsg("");
                        setEventsPatient({ ...eventsPatient });
                      }}
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
      case "pt-settings": {
        var pI = ptInfo;
        var setPi = function(f, v) { setPtInfo(function(prev) { return Object.assign({}, prev, {[f]: v}); }); };
        var districts = ["Dhaka","Faridpur","Gazipur","Gopalganj","Kishoreganj","Madaripur","Manikganj","Munshiganj","Narayanganj","Narsingdi","Rajbari","Shariatpur","Tangail","Chattogram","Cox's Bazar","Cumilla","Feni","Brahmanbaria","Noakhali","Lakshmipur","Chandpur","Khagrachhari","Rangamati","Bandarban","Rajshahi","Chapai Nawabganj","Naogaon","Natore","Pabna","Bogura","Sirajganj","Joypurhat","Khulna","Jessore","Satkhira","Narail","Chuadanga","Kushtia","Meherpur","Jhenaidah","Bagerhat","Magura","Barishal","Bhola","Jhalokathi","Pirojpur","Patuakhali","Barguna","Sylhet","Moulvibazar","Sunamganj","Habiganj","Rangpur","Dinajpur","Thakurgaon","Panchagarh","Kurigram","Lalmonirhat","Nilphamari","Gaibandha","Mymensingh","Netrokona","Jamalpur","Sherpur"];
        var ethnicities = ["South Asian","Caucasian / European descent","African / African-American","East Asian","Southeast Asian","Middle Eastern / Arab","Native American / Indigenous Peoples","Pacific Islander / Polynesian","Hispanic / Latino","Aboriginal / Indigenous Australian","Jewish (Ashkenazi, Sephardic, Mizrahi)","Mediterranean","Scandinavian / Northern European","Black Caribbean","Mixed Ethnicity (Multiracial)"];
        var religions = ["Islam","Hinduism","Christianity","Buddhism","Sikhism","Judaism","Confucianism","Other"];
        var piAge = "";
        if (pI.dob) { var bd = new Date(pI.dob); var today = new Date(); piAge = String(Math.floor((today - bd) / (365.25 * 24 * 60 * 60 * 1000))); }
        var piLbl = { fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 };
        var piInp = { width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", background: C.n[0], color: C.n[900], boxSizing: "border-box", fontFamily: "inherit" };
        var piSel = Object.assign({}, piInp, { padding: "8px 6px" });
        var piRow = { display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" };
        var psTabStyle = function(id) { return { padding: "6px 16px", borderRadius: 7, border: "none", cursor: ptSettingsTab === "security" && id === "security" ? "not-allowed" : "pointer", fontSize: 12, background: ptSettingsTab === id ? C.info[50] : "transparent", color: ptSettingsTab === id ? C.info[800] : C.n[600], fontWeight: ptSettingsTab === id ? 500 : 400, fontFamily: "inherit", opacity: id === "security" ? 0.5 : 1 }; };
        var filteredDistricts = districts.filter(function(d) { return !pI.district || d.toLowerCase().indexOf(pI.district.toLowerCase()) >= 0; });

        return (
          <div>
            <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "0.5px solid " + C.n[200], paddingBottom: 8 }}>
              <button onClick={function(){setPtSettingsTab("info")}} style={psTabStyle("info")}>Patient information</button>
              <button onClick={function(){}} style={psTabStyle("security")} title="Coming soon">Data security level</button>
              <button onClick={function(){setPtSettingsTab("doctors")}} style={psTabStyle("doctors")}>Supervising doctor list</button>
              <button onClick={function(){setPtSettingsTab("family")}} style={psTabStyle("family")}>Family tree</button>
            </div>

            {ptSettingsTab === "info" && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Patient information</div>
                <div style={{ background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 10, padding: 16 }}>
                  <div style={piRow}>
                    <div style={{ flex: "1 1 200px" }}><div style={piLbl}>Name *</div><input style={piInp} value={pI.name} onChange={function(e){setPi("name",e.target.value)}} placeholder="Full name" /></div>
                    <div style={{ flex: "0 0 140px" }}><div style={piLbl}>Date of birth</div><input style={piInp} type="date" value={pI.dob} onChange={function(e){setPi("dob",e.target.value)}} /></div>
                    <div style={{ flex: "0 0 70px" }}><div style={piLbl}>Age *</div><input style={piInp} value={piAge || pI.age} onChange={function(e){setPi("age",e.target.value)}} placeholder="Auto" />{piAge && <div style={{ fontSize: 9, color: C.pri[600], marginTop: 2 }}>Auto from DOB</div>}</div>
                    <div style={{ flex: "0 0 100px" }}><div style={piLbl}>Sex *</div><select style={piSel} value={pI.sex} onChange={function(e){setPi("sex",e.target.value)}}><option>Male</option><option>Female</option><option>Other</option></select></div>
                  </div>
                  <div style={piRow}>
                    <div style={{ flex: "1 1 200px" }}><div style={piLbl}>Ethnicity</div><select style={piSel} value={pI.ethnicity} onChange={function(e){setPi("ethnicity",e.target.value)}}>{ethnicities.map(function(e){return <option key={e}>{e}</option>})}</select></div>
                    <div style={{ flex: "1 1 150px" }}><div style={piLbl}>Religion</div><select style={piSel} value={pI.religion} onChange={function(e){setPi("religion",e.target.value)}}>{religions.map(function(r){return <option key={r}>{r}</option>})}</select></div>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 8, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Contact numbers</div>
                  <div style={piRow}>
                    <div style={{ flex: "1 1 160px" }}><div style={piLbl}>Patient mobile * (11 digit)</div><input style={piInp} value={pI.mobile} onChange={function(e){var v=e.target.value.replace(/\D/g,""); if(v.length<=11) setPi("mobile",v)}} placeholder="01XXXXXXXXX" maxLength="11" />{pI.mobile && pI.mobile.length !== 11 && <div style={{ fontSize: 9, color: C.danger[800], marginTop: 2 }}>Must be 11 digits</div>}</div>
                    <div style={{ flex: "1 1 160px" }}><div style={piLbl}>Spouse mobile (11 digit)</div><input style={piInp} value={pI.spouseMobile} onChange={function(e){var v=e.target.value.replace(/\D/g,""); if(v.length<=11) setPi("spouseMobile",v)}} placeholder="01XXXXXXXXX" maxLength="11" /></div>
                  </div>
                  <div style={piRow}>
                    <div style={{ flex: "1 1 160px" }}><div style={piLbl}>1st degree relative mobile *</div><input style={piInp} value={pI.relativeMobile} onChange={function(e){var v=e.target.value.replace(/\D/g,""); if(v.length<=11) setPi("relativeMobile",v)}} placeholder="01XXXXXXXXX" maxLength="11" /></div>
                    <div style={{ flex: "1 1 200px" }}><div style={piLbl}>Relation</div><input style={piInp} value={pI.relativeRelation} onChange={function(e){setPi("relativeRelation",e.target.value)}} placeholder="e.g. Brother, Sister, Father, Mother" /></div>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 8, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Financial</div>
                  <div style={piRow}>
                    <div style={{ flex: "1 1 200px" }}><div style={piLbl}>Patient's / attendant's monthly income</div><div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 12, color: C.n[600] }}>৳</span><input style={piInp} value={pI.monthlyIncome || ""} onChange={function(e){setPi("monthlyIncome",e.target.value.replace(/[^0-9]/g,""))}} placeholder="e.g. 25000" /></div></div>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 8, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Address</div>
                  <div style={piRow}>
                    <div style={{ flex: "1 1 200px", position: "relative" }}>
                      <div style={piLbl}>District (type to search)</div>
                      <input style={piInp} value={pI.district} onChange={function(e){setPi("district",e.target.value)}} placeholder="Start typing district..." />
                      {pI.district && pI.district.length > 0 && filteredDistricts.length > 0 && filteredDistricts.length < 10 && !districts.includes(pI.district) && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 6, maxHeight: 150, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                          {filteredDistricts.map(function(d) { return (
                            <div key={d} onClick={function(){setPi("district",d)}} style={{ padding: "6px 10px", fontSize: 11, cursor: "pointer", borderBottom: "0.5px solid " + C.n[100] }}
                              onMouseEnter={function(e){e.currentTarget.style.background=C.pri[50]}}
                              onMouseLeave={function(e){e.currentTarget.style.background="transparent"}}>{d}</div>
                          ); })}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: "2 1 300px" }}><div style={piLbl}>Full address</div><input style={piInp} value={pI.fullAddress} onChange={function(e){setPi("fullAddress",e.target.value)}} placeholder="House, Road, Area, Upazila..." /></div>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 8, marginTop: 12, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Picture</div>
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 12 }}>
                    {/* Photo preview */}
                    <div style={{ width: 100, height: 100, borderRadius: 10, border: "1px dashed " + C.n[300], background: C.n[50], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                      {pI.picture ? (
                        <img src={pI.picture} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
                      ) : (
                        <div style={{ textAlign: "center", color: C.n[500] }}>
                          <div style={{ fontSize: 24, marginBottom: 2 }}>+</div>
                          <div style={{ fontSize: 8 }}>Photo</div>
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: C.n[600], marginBottom: 6 }}>Upload patient photo for identification</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <label style={{ padding: "6px 14px", borderRadius: 6, border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[800], fontSize: 11, cursor: "pointer", fontFamily: "inherit", display: "inline-block" }}>
                          Choose file
                          <input type="file" accept="image/*" style={{ display: "none" }} onChange={function(e) {
                            var file = e.target.files && e.target.files[0];
                            if (file) {
                              var reader = new FileReader();
                              reader.onload = function(ev) { setPi("picture", ev.target.result); };
                              reader.readAsDataURL(file);
                            }
                          }} />
                        </label>
                        {pI.picture && <button onClick={function() { setPi("picture", null); }} style={{ padding: "6px 14px", borderRadius: 6, border: "0.5px solid " + C.danger[400], background: C.danger[50], color: C.danger[800], fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 500, color: C.n[800], marginBottom: 8, marginTop: 4, paddingBottom: 4, borderBottom: "0.5px solid " + C.n[200] }}>Tags</div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: C.n[600], marginBottom: 6 }}>Add tags to categorize this patient (e.g., VIP, Chronic, Elderly, Diabetic, Follow-up)</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {(pI.tags || []).map(function(tag, i) {
                        return (
                          <span key={i} style={{ fontSize: 11, color: C.pri[600], background: C.pri[50], padding: "4px 8px 4px 10px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 5, border: "0.5px solid " + C.pri[100] }}>
                            {tag}
                            <button onClick={function() { setPi("tags", (pI.tags || []).filter(function(_, idx) { return idx !== i; })); }} style={{ background: "none", border: "none", color: C.pri[400], cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                          </span>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input id="tagInput" placeholder="Type a tag and press Enter..." onKeyDown={function(e) {
                        if (e.key === "Enter" && e.target.value.trim()) {
                          var newTag = e.target.value.trim();
                          if (!(pI.tags || []).includes(newTag)) { setPi("tags", (pI.tags || []).concat([newTag])); }
                          e.target.value = "";
                        }
                      }} style={piInp} />
                      <button onClick={function() {
                        var inp = document.getElementById("tagInput");
                        if (inp && inp.value.trim()) {
                          var newTag = inp.value.trim();
                          if (!(pI.tags || []).includes(newTag)) { setPi("tags", (pI.tags || []).concat([newTag])); }
                          inp.value = "";
                        }
                      }} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Add tag</button>
                    </div>
                    {/* Quick tag suggestions */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                      {["VIP", "Chronic", "Elderly", "Diabetic", "Hypertensive", "Pregnant", "Pediatric", "Follow-up", "Critical", "Post-surgery", "Cancer", "Transplant", "Dialysis", "Mental health"].map(function(st) {
                        var already = (pI.tags || []).includes(st);
                        return (
                          <button key={st} onClick={function() { if (!already) setPi("tags", (pI.tags || []).concat([st])); }}
                            style={{ padding: "3px 10px", borderRadius: 5, fontSize: 9, cursor: already ? "default" : "pointer",
                              border: "0.5px solid " + (already ? C.pri[400] : C.n[200]),
                              background: already ? C.pri[50] : C.n[50],
                              color: already ? C.pri[600] : C.n[600],
                              opacity: already ? 0.5 : 1, fontFamily: "inherit"
                            }}>{already ? "✓ " : ""}{st}</button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={function() { if(pI.name) setPtName(pI.name); if(piAge || pI.age) setPtAge(piAge || pI.age); if(pI.sex) setPtGender(pI.sex); if(pI.mobile) setPtPhone(pI.mobile); setSavedMsg("Patient info saved!"); setTimeout(function(){setSavedMsg("")},2000); }} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Save patient info</button>
                  </div>
                </div>
              </div>
            )}

            {ptSettingsTab === "security" && (
              <div style={{ textAlign: "center", padding: 50, color: C.n[500] }}>
                <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>⊛</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.n[800] }}>Data security level</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>This feature is currently disabled and will be available in a future update.</div>
              </div>
            )}

            {ptSettingsTab === "doctors" && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Supervising doctor list</div>
                <div style={{ background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 10, padding: 16 }}>
                  {[{ name: "Dr. Rahman (You)", role: "Primary", spec: "General Medicine", status: "Active" },
                    { name: "Dr. Farzana Akter", role: "Consultant", spec: "Cardiology", status: "Active" },
                    { name: "Dr. Kamal Hossain", role: "Referred", spec: "Gastroenterology", status: "Pending" }
                  ].map(function(doc, i) { return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < 2 ? "0.5px solid " + C.n[200] : "none" }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.pri[50], color: C.pri[600], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500 }}>{doc.name.charAt(4) + doc.name.charAt(5)}</div>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{doc.name}</div><div style={{ fontSize: 10, color: C.n[600] }}>{doc.spec} · {doc.role}</div></div>
                      <Pill bg={doc.status === "Active" ? C.pri[50] : C.warn[50]} fg={doc.status === "Active" ? C.pri[600] : C.warn[800]}>{doc.status}</Pill>
                    </div>
                  ); })}
                  <button style={{ marginTop: 12, padding: "8px 16px", borderRadius: 6, border: "1px dashed " + C.n[300], background: "transparent", color: C.pri[400], fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>+ Add supervising doctor</button>
                </div>
              </div>
            )}

            {ptSettingsTab === "family" && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Family tree</div>

                {/* Patient info summary */}
                <div style={{ background: C.pri[50], border: "0.5px solid " + C.pri[100], borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.pri[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Patient</div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                    <div><span style={{ color: C.n[600] }}>Name: </span><span style={{ fontWeight: 500 }}>{ptName || "—"}</span></div>
                    <div><span style={{ color: C.n[600] }}>Mobile: </span><span style={{ fontWeight: 500 }}>{ptPhone || "—"}</span></div>
                    <div><span style={{ color: C.n[600] }}>NID: </span><span style={{ color: C.n[500] }}>Not provided</span></div>
                    <div><span style={{ color: C.n[600] }}>Sex: </span><span style={{ fontWeight: 500 }}>{ptGender}</span></div>
                  </div>
                </div>

                {/* Add relation buttons */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {[
                    { rel: "Spouse", icon: "♥", autoSex: "" },
                    { rel: "Father", icon: "♂", autoSex: "Male" },
                    { rel: "Mother", icon: "♀", autoSex: "Female" },
                    { rel: "Brother", icon: "♂", autoSex: "Male" },
                    { rel: "Sister", icon: "♀", autoSex: "Female" },
                    { rel: "Son", icon: "♂", autoSex: "Male" },
                    { rel: "Daughter", icon: "♀", autoSex: "Female" },
                  ].map(function(r) {
                    return (
                      <button key={r.rel} onClick={function() {
                        setFamilyRelation(r.rel);
                        setFamilyForm({ name: "", mobile: "", nid: "", sex: r.autoSex });
                        setShowFamilyForm(true);
                      }} style={{
                        padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer",
                        border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[800],
                        display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit"
                      }}>
                        <span style={{ fontSize: 13 }}>{r.icon}</span> Add {r.rel.toLowerCase()}
                      </button>
                    );
                  })}
                </div>

                {/* Family member list */}
                <div style={{ background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 10, padding: familyMembers.length > 0 ? "4px 16px" : 16 }}>
                  {familyMembers.length === 0 && (
                    <div style={{ textAlign: "center", padding: "24px 0", color: C.n[500], fontSize: 12 }}>No family members added yet. Use the buttons above to add.</div>
                  )}
                  {familyMembers.map(function(fm, i) {
                    var relColors = {
                      Spouse: { bg: C.danger[50], fg: C.danger[800] },
                      Father: { bg: C.info[50], fg: C.info[800] },
                      Mother: { bg: C.pri[50], fg: C.pri[600] },
                      Brother: { bg: C.info[50], fg: C.info[800] },
                      Sister: { bg: C.pri[50], fg: C.pri[600] },
                      Son: { bg: C.warn[50], fg: C.warn[800] },
                      Daughter: { bg: C.warn[50], fg: C.warn[800] }
                    };
                    var rc = relColors[fm.relation] || { bg: C.n[100], fg: C.n[800] };
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < familyMembers.length - 1 ? "0.5px solid " + C.n[200] : "none" }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: rc.bg, color: rc.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500 }}>
                          {fm.name.charAt(0)}{fm.name.indexOf(" ") > 0 ? fm.name.charAt(fm.name.indexOf(" ") + 1) : ""}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{fm.name}</div>
                          <div style={{ fontSize: 10, color: C.n[600] }}>{fm.sex}{fm.mobile ? " · " + fm.mobile : ""}{fm.nid ? " · NID: " + fm.nid : ""}</div>
                        </div>
                        <Pill bg={rc.bg} fg={rc.fg}>{fm.relation}</Pill>
                        <button onClick={function() { setFamilyMembers(familyMembers.filter(function(_, idx) { return idx !== i; })); }}
                          style={{ background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 14, padding: "2px 6px" }}>×</button>
                      </div>
                    );
                  })}
                </div>

                {/* Add family member modal */}
                {showFamilyForm && (
                  <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
                    onClick={function() { setShowFamilyForm(false); }}>
                    <div onClick={function(e) { e.stopPropagation(); }} style={{ width: 460, background: C.n[0], borderRadius: 14, border: "0.5px solid " + C.n[200], boxShadow: "0 12px 40px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                      <div style={{ padding: "16px 20px", borderBottom: "0.5px solid " + C.n[200], display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 500 }}>Add {familyRelation.toLowerCase()}</div>
                          <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Fill in the details below</div>
                        </div>
                        <button onClick={function() { setShowFamilyForm(false); }} style={{ width: 28, height: 28, borderRadius: 6, border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                      </div>
                      <div style={{ padding: "16px 20px" }}>
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", marginBottom: 4 }}>Name</div>
                          <input value={familyForm.name} onChange={function(e) { setFamilyForm(Object.assign({}, familyForm, { name: e.target.value })); }}
                            placeholder="Full name" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: C.n[900] }} />
                        </div>
                        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", marginBottom: 4 }}>Mobile (11 digit)</div>
                            <input value={familyForm.mobile} onChange={function(e) { var v = e.target.value.replace(/\D/g, ""); if (v.length <= 11) setFamilyForm(Object.assign({}, familyForm, { mobile: v })); }}
                              placeholder="01XXXXXXXXX" maxLength="11" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: C.n[900] }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", marginBottom: 4 }}>NID number</div>
                            <input value={familyForm.nid} onChange={function(e) { setFamilyForm(Object.assign({}, familyForm, { nid: e.target.value.replace(/\D/g, "") })); }}
                              placeholder="National ID" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: C.n[900] }} />
                          </div>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: C.n[600], textTransform: "uppercase", marginBottom: 4 }}>Sex {familyForm.sex && <span style={{ fontSize: 9, color: C.pri[600], fontWeight: 400 }}>(auto-set from relation)</span>}</div>
                          <select value={familyForm.sex} onChange={function(e) { setFamilyForm(Object.assign({}, familyForm, { sex: e.target.value })); }}
                            style={{ width: "100%", padding: "8px 6px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: C.n[900] }}>
                            <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "0.5px solid " + C.n[200], background: C.n[50] }}>
                        <button onClick={function() { setShowFamilyForm(false); }} style={{ padding: "8px 20px", borderRadius: 8, border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                        <button onClick={function() {
                          if (familyForm.name.trim()) {
                            setFamilyMembers(familyMembers.concat([Object.assign({}, familyForm, { relation: familyRelation })]));
                            setShowFamilyForm(false);
                          }
                        }} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Add {familyRelation.toLowerCase()}</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }
      case "idsp": return (() => {
        const RANGE_START = new Date("2026-01-01");
        const RANGE_END   = new Date("2026-05-17");
        const toXPct = (ds) => ((new Date(ds) - RANGE_START) / (RANGE_END - RANGE_START)) * 100;

        const selDrugs    = ptHealthDrugs.filter(d => hmDrugs.has(d.name));
        const selSymptoms = ptHealthSymptoms.filter(s => hmSymptoms.has(s.name));
        const selTests    = ptHealthTests.filter(t => hmTests.has(t.name));
        const tracks = [
          ...selDrugs.map(d => ({ type: "drug", item: d })),
          ...selSymptoms.map(s => ({ type: "symptom", item: s })),
          ...selTests.map(t => ({ type: "test", item: t })),
        ];

        const LW = 148, PR = 16, PT = 20, PB = 36, RH = 34, SVG_W = 800;
        const chartH = Math.max(90, tracks.length * RH + PT + PB);
        const areaW  = SVG_W - LW - PR;
        const toX    = (ds) => LW + (toXPct(ds) / 100) * areaW;

        const months = [];
        let mc = new Date(RANGE_START);
        while (mc <= RANGE_END) {
          months.push({ label: mc.toLocaleString("default", { month: "short" }), x: toX(mc.toISOString().slice(0,10)) });
          mc = new Date(mc.getFullYear(), mc.getMonth() + 1, 1);
        }
        const todayX = toX("2026-05-17");

        return (
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Integrated health monitoring and overview</div>
            <div style={{ fontSize: 12, color: C.n[600], marginBottom: 14 }}>Track disease patterns, health trends, and plan personalised care</div>

            {/* ── TIMELINE CHART ── */}
            <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.n[700], marginBottom: 10 }}>Timeline · Jan – May 2026</div>
              {tracks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "36px 0", color: C.n[400], fontSize: 12 }}>
                  Select drugs, symptoms, or tests below to visualise on the timeline
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <svg width="100%" viewBox={`0 0 ${SVG_W} ${chartH}`} style={{ display: "block", minWidth: 360 }}>
                    {/* gridlines + month labels */}
                    {months.map(m => (
                      <g key={m.label}>
                        <line x1={m.x} y1={PT} x2={m.x} y2={chartH - PB} stroke={C.n[200]} strokeWidth={0.5} />
                        <text x={m.x} y={chartH - PB + 14} textAnchor="middle" fontSize={9} fill={C.n[500]}>{m.label}</text>
                      </g>
                    ))}
                    {/* x-axis */}
                    <line x1={LW} y1={chartH - PB} x2={SVG_W - PR} y2={chartH - PB} stroke={C.n[300]} strokeWidth={0.5} />
                    {/* today line */}
                    <line x1={todayX} y1={PT} x2={todayX} y2={chartH - PB} stroke="#f87171" strokeWidth={1} strokeDasharray="3,3" />
                    <text x={todayX + 3} y={PT + 8} fontSize={8} fill="#f87171">Today</text>

                    {tracks.map(({ type, item }, idx) => {
                      const cy = PT + idx * RH + RH / 2;
                      const rowBg = idx % 2 === 0;
                      return (
                        <g key={item.name}>
                          {rowBg && <rect x={LW} y={PT + idx * RH} width={areaW} height={RH} fill={C.n[50]} />}
                          <text x={LW - 8} y={cy + 4} textAnchor="end" fontSize={10} fill={C.n[700]}>
                            {item.name.length > 18 ? item.name.slice(0, 17) + "…" : item.name}
                          </text>

                          {type === "drug" && (() => {
                            const x1 = toX(item.start), x2 = toX(item.end);
                            return (
                              <g>
                                <rect x={x1} y={cy - 8} width={Math.max(6, x2 - x1)} height={16} rx={4} fill={item.color} opacity={0.85} />
                              </g>
                            );
                          })()}

                          {type === "symptom" && item.data.map(pt => {
                            const cx = toX(pt.d), r = 4 + pt.v * 1.4;
                            return (
                              <g key={pt.d}>
                                <circle cx={cx} cy={cy} r={r} fill={item.color} opacity={0.75} />
                                <text x={cx} y={cy + 3} textAnchor="middle" fontSize={7} fill="#fff" fontWeight="600">{pt.v}</text>
                              </g>
                            );
                          })}

                          {type === "test" && (() => {
                            if (!item.data.length) return null;
                            const vals = item.data.map(p => p.v);
                            const maxV = Math.max(...vals) * 1.25 || 1;
                            const pts = item.data.map(pt => ({
                              cx: toX(pt.d),
                              cy: cy + 12 - ((pt.v / maxV) * 24),
                              v: pt.v,
                            }));
                            const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.cx},${p.cy}`).join(" ");
                            return (
                              <g>
                                {pts.length > 1 && <path d={path} fill="none" stroke={item.color} strokeWidth={1.5} strokeLinejoin="round" />}
                                {pts.map((p, i) => (
                                  <g key={i}>
                                    <circle cx={p.cx} cy={p.cy} r={3.5} fill={item.color} />
                                    <text x={p.cx} y={p.cy - 5} textAnchor="middle" fontSize={8} fill={item.color} fontWeight="600">{p.v}</text>
                                  </g>
                                ))}
                              </g>
                            );
                          })()}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
            </div>

            {/* ── CHECKBOXES ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
              {/* Drugs */}
              <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>💊 Drugs</div>
                {ptHealthDrugs.map(d => (
                  <label key={d.name} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={hmDrugs.has(d.name)} onChange={e => { const s = new Set(hmDrugs); e.target.checked ? s.add(d.name) : s.delete(d.name); setHmDrugs(s); }} style={{ accentColor: d.color, width: 13, height: 13, cursor: "pointer", flexShrink: 0 }} />
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: C.n[800], lineHeight: 1.3 }}>{d.name}</span>
                  </label>
                ))}
              </div>

              {/* Symptoms */}
              <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>🩺 Symptoms</div>
                <label style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, cursor: "pointer" }}>
                  <input type="checkbox"
                    checked={hmSymptoms.size === ptHealthSymptoms.length && ptHealthSymptoms.length > 0}
                    onChange={e => setHmSymptoms(e.target.checked ? new Set(ptHealthSymptoms.map(s => s.name)) : new Set())}
                    style={{ width: 13, height: 13, cursor: "pointer", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: C.n[500], fontStyle: "italic" }}>All symptoms</span>
                </label>
                {ptHealthSymptoms.map(s => (
                  <label key={s.name} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={hmSymptoms.has(s.name)} onChange={e => { const ns = new Set(hmSymptoms); e.target.checked ? ns.add(s.name) : ns.delete(s.name); setHmSymptoms(ns); }} style={{ accentColor: s.color, width: 13, height: 13, cursor: "pointer", flexShrink: 0 }} />
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: C.n[800] }}>{s.name}</span>
                  </label>
                ))}
              </div>

              {/* Tests */}
              <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>🧪 Lab Tests</div>
                {ptHealthTests.map(t => (
                  <label key={t.name} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={hmTests.has(t.name)} onChange={e => { const ns = new Set(hmTests); e.target.checked ? ns.add(t.name) : ns.delete(t.name); setHmTests(ns); }} style={{ accentColor: t.color, width: 13, height: 13, cursor: "pointer", flexShrink: 0 }} />
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: C.n[800] }}>{t.name} <span style={{ color: C.n[400], fontSize: 10 }}>({t.unit})</span></span>
                  </label>
                ))}
              </div>
            </div>

            {/* ── STATS ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
              <div style={{ background: C.danger[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.danger[800] }}>Active alerts</div><div style={{ fontSize: 22, fontWeight: 500, color: C.danger[800] }}>3</div><div style={{ fontSize: 10, color: C.danger[800], marginTop: 2 }}>Dengue, Typhoid, Viral</div></div>
              <div style={{ background: C.warn[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.warn[800] }}>This week cases</div><div style={{ fontSize: 22, fontWeight: 500, color: C.warn[800] }}>47</div><div style={{ fontSize: 10, color: C.warn[800], marginTop: 2 }}>↑ 12% from last week</div></div>
              <div style={{ background: C.pri[50], borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 10, color: C.pri[600] }}>Reports submitted</div><div style={{ fontSize: 22, fontWeight: 500, color: C.pri[600] }}>12</div><div style={{ fontSize: 10, color: C.pri[600], marginTop: 2 }}>All up to date</div></div>
            </div>

            {/* ── MENU ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[{ t: "Disease trend analysis", d: "View disease patterns — weekly, monthly, seasonal trends", i: "📊", c: C.info },
                { t: "IDSP Form P/L/S reporting", d: "Generate and submit presumptive, lab-confirmed, and syndromic forms", i: "📋", c: C.warn },
                { t: "Outbreak detection", d: "Automated alerts when case counts exceed threshold", i: "⚠️", c: C.danger },
                { t: "Area-wise mapping", d: "Geographic heatmap of disease cases by patient address", i: "🗺️", c: C.pri },
                { t: "Vaccination tracking", d: "Track immunization coverage and pending vaccinations", i: "💉", c: C.info },
                { t: "Export IDSP data", d: "Export surveillance reports for health authorities", i: "↓", c: C.pri },
              ].map(s => (
                <div key={s.t} style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: s.c[50], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{s.i}</div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{s.t}</div><div style={{ fontSize: 11, color: C.n[600] }}>{s.d}</div></div>
                  <span style={{ color: C.n[500], fontSize: 14 }}>→</span>
                </div>
              ))}
            </div>
          </div>
        );
      })();
      case "patients": return (() => {
        const surveillanceList = watchPatient
          ? [{ id: "s1", name: ptName, age: ptAge, gender: ptGender, init: (ptName||"").split(" ").map(w=>w[0]).join("").slice(0,2), phone: ptPhone, diagnosis: "Under monitoring", color: "warn" }]
          : [];

        const typeStyle = (type) => {
          if (type === "alert")      return { bg: C.danger[50], fg: C.danger[800], label: "🚨 Alert" };
          if (type === "info")       return { bg: C.info[50],   fg: C.info[800],   label: "ℹ️ Info" };
          if (type === "suggestion") return { bg: C.warn[50],   fg: C.warn[800],   label: "💡 Suggestion" };
          if (type === "question")   return { bg: C.pri[50],    fg: C.pri[600],    label: "❓ Question" };
          return { bg: C.n[100], fg: C.n[700], label: type };
        };

        const PatientRow = ({ p, rightSlot }) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: colorOf(p.color).bg, color: colorOf(p.color).fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{p.init}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.n[900] }}>{p.name}</div>
              <div style={{ fontSize: 11, color: C.n[500] }}>{p.age}y · {p.gender === "F" ? "Female" : "Male"} · {p.phone}</div>
              {p.diagnosis && <div style={{ fontSize: 11, color: C.n[600], marginTop: 1 }}>{p.diagnosis}</div>}
            </div>
            {rightSlot}
          </div>
        );

        const SectionHeader = ({ icon, title, count, color }) => (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.n[800] }}>{title}</span>
            <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 10, background: color[50], color: color[800], fontWeight: 600 }}>{count}</span>
          </div>
        );

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 2 }}>Patient Records</div>

            {/* ── GROUP 1: Surveillance ── */}
            <div style={{ background: C.n[0], border: `0.5px solid ${C.warn[200]}`, borderRadius: 12, padding: "14px 16px" }}>
              <SectionHeader icon="👁️" title="Patients on your surveillance" count={surveillanceList.length} color={C.warn} />
              {surveillanceList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: C.n[400], fontSize: 12 }}>
                  No patients flagged — tick <strong>"Keep eye on this patient"</strong> in the prescription header to add one here
                </div>
              ) : (
                <div style={{ borderTop: `0.5px solid ${C.n[100]}` }}>
                  {surveillanceList.map((p, i) => (
                    <div key={p.id} style={{ borderBottom: i < surveillanceList.length - 1 ? `0.5px solid ${C.n[100]}` : "none" }}>
                      <PatientRow p={p} rightSlot={
                        <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 10, background: "#fffbeb", color: "#b45309", border: "0.5px solid #fde68a", fontWeight: 600, whiteSpace: "nowrap" }}>👁️ Watching</span>
                      } />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── GROUP 2: Recently Seen ── */}
            <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "14px 16px" }}>
              <SectionHeader icon="🕐" title="Recently seen patients" count={recentlySeenPatients.length} color={C.pri} />
              <div style={{ borderTop: `0.5px solid ${C.n[100]}` }}>
                {recentlySeenPatients.map((p, i) => (
                  <div key={p.id} style={{ borderBottom: i < recentlySeenPatients.length - 1 ? `0.5px solid ${C.n[100]}` : "none" }}>
                    <PatientRow p={p} rightSlot={
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: C.n[500], marginBottom: 3 }}>{p.lastSeen}</div>
                        <button onClick={() => { setPtName(p.name); setPtAge(String(p.age)); setPtGender(p.gender === "F" ? "Female" : "Male"); setPtPhone(p.phone); setActiveTab("prescription"); }}
                          style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 10, cursor: "pointer", fontFamily: font }}>Open</button>
                      </div>
                    } />
                  </div>
                ))}
              </div>
            </div>

            {/* ── GROUP 3: Questions & Suggestions ── */}
            <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: "14px 16px" }}>
              <SectionHeader icon="💬" title="Questions & suggestions from patients" count={questionPatients.length} color={C.info} />
              <div style={{ borderTop: `0.5px solid ${C.n[100]}` }}>
                {questionPatients.map((p, i) => {
                  const ts = typeStyle(p.type);
                  return (
                    <div key={p.id} style={{ borderBottom: i < questionPatients.length - 1 ? `0.5px solid ${C.n[100]}` : "none", padding: "10px 0", display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: colorOf(p.color).bg, color: colorOf(p.color).fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0, marginTop: 2 }}>{p.init}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.n[900] }}>{p.name}</span>
                          <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: ts.bg, color: ts.fg, fontWeight: 600 }}>{ts.label}</span>
                          <span style={{ fontSize: 10, color: C.n[400] }}>{p.time}</span>
                        </div>
                        <div style={{ fontSize: 12, color: C.n[700], lineHeight: 1.5 }}>{p.msg}</div>
                      </div>
                      <button style={{ padding: "4px 12px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[700], fontSize: 10, cursor: "pointer", fontFamily: font, flexShrink: 0, marginTop: 2 }}>Reply</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })();
      case "chat": return <div style={{ textAlign: "center", padding: 60, color: C.n[500] }}><div style={{ fontSize: 32, marginBottom: 8 }}>◈</div><div style={{ fontSize: 16, fontWeight: 500, color: C.n[800] }}>Live Chat</div><div style={{ fontSize: 12, marginTop: 4 }}>End-to-end encrypted doctor-patient messaging</div></div>;
      case "research": return (() => {
        const q = rcQuery.trim().toLowerCase();
        const rcResults = q.length < 1 ? [] : researchPatients.filter(p => {
          if (rcFilter === "disease") return p.diseases.some(d => d.toLowerCase().includes(q));
          if (rcFilter === "tags")    return p.tags.some(t => t.toLowerCase().includes(q));
          return p.diseases.some(d => d.toLowerCase().includes(q)) || p.tags.some(t => t.toLowerCase().includes(q));
        });
        const allSelected = rcResults.length > 0 && rcResults.every(p => rcSelected.has(p.id));

        const highlight = (text) => {
          if (!q) return text;
          const idx = text.toLowerCase().indexOf(q);
          if (idx === -1) return text;
          return <span>{text.slice(0, idx)}<mark style={{ background: C.warn[100], color: C.warn[900], borderRadius: 2, padding: "0 1px" }}>{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</span>;
        };

        return (
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Research Companion</div>
            <div style={{ fontSize: 12, color: C.n[600], marginBottom: 16 }}>Find patients by disease, tags, or both</div>

            {/* Search bar */}
            <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 15, color: C.n[400] }}>🔍</span>
              <input
                value={rcQuery}
                onChange={e => { setRcQuery(e.target.value); setRcSelected(new Set()); }}
                placeholder="Search by disease or tag…"
                style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: C.n[900], background: "transparent", fontFamily: font }}
                autoFocus
              />
              {rcQuery && <button onClick={() => { setRcQuery(""); setRcSelected(new Set()); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.n[400], fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
            </div>


            {/* Results */}
            {q.length > 0 && (
              <div>
                {rcResults.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: C.n[400], fontSize: 12 }}>No patients found for "{rcQuery}"</div>
                ) : (
                  <div>
                    {/* Header row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input type="checkbox" checked={allSelected} onChange={e => {
                            if (e.target.checked) setRcSelected(new Set(rcResults.map(p => p.id)));
                            else setRcSelected(new Set());
                          }} style={{ width: 14, height: 14, accentColor: C.pri[400], cursor: "pointer" }} />
                          <span style={{ fontSize: 11, color: C.n[600] }}>Select all</span>
                        </label>
                        <span style={{ fontSize: 11, color: C.n[500] }}>·</span>
                        <span style={{ fontSize: 11, color: C.n[600] }}>{rcResults.length} patient{rcResults.length !== 1 ? "s" : ""} found</span>
                      </div>
                      {rcSelected.size > 0 && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: C.pri[600], fontWeight: 500 }}>{rcSelected.size} selected</span>
                          <button style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: font }}>Compare</button>
                          <button style={{ padding: "4px 12px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[700], fontSize: 11, cursor: "pointer", fontFamily: font }}>Export</button>
                        </div>
                      )}
                    </div>

                    {/* Patient cards */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {rcResults.map(p => {
                        const sel = rcSelected.has(p.id);
                        return (
                          <div key={p.id} onClick={() => {
                            const s = new Set(rcSelected);
                            sel ? s.delete(p.id) : s.add(p.id);
                            setRcSelected(s);
                          }} style={{ background: sel ? C.pri[50] : C.n[0], border: `0.5px solid ${sel ? C.pri[300] : C.n[200]}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, transition: "background 0.15s" }}>
                            <input type="checkbox" checked={sel} onChange={() => {}} onClick={e => e.stopPropagation()} style={{ width: 14, height: 14, accentColor: C.pri[400], cursor: "pointer", marginTop: 2, flexShrink: 0 }} />
                            <div style={{ width: 34, height: 34, borderRadius: "50%", background: colorOf(p.gender === "F" ? "pri" : "info").bg, color: colorOf(p.gender === "F" ? "pri" : "info").fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                              {p.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: C.n[900] }}>{p.name}</span>
                                <span style={{ fontSize: 10, color: C.n[500] }}>{p.age}y · {p.gender === "F" ? "Female" : "Male"}</span>
                                <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 10, background: p.source === "IPD" ? C.info[50] : C.pri[50], color: p.source === "IPD" ? C.info[800] : C.pri[600], fontWeight: 600 }}>{p.source}</span>
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 5 }}>
                                {p.diseases.map(d => (
                                  <span key={d} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: C.danger[50], color: C.danger[800], border: `0.5px solid ${C.danger[100]}` }}>
                                    🩺 {highlight(d)}
                                  </span>
                                ))}
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                {p.tags.map(t => (
                                  <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: C.n[100], color: C.n[700] }}>
                                    # {highlight(t)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {q.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.n[400] }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔬</div>
                <div style={{ fontSize: 13, color: C.n[500] }}>Type a disease name or tag to find matching patients</div>
                <div style={{ fontSize: 11, color: C.n[400], marginTop: 4 }}>e.g. "Dengue", "Diabetic", "Elderly", "Post-op"</div>
              </div>
            )}
          </div>
        );
      })();
      case "settings": return (
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>Settings</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[{ t: "Profile", d: "Doctor name, specialization, clinic info", i: "◉" },
              { t: "Assistants & RBAC", d: "Manage assistant accounts and dynamic permissions", i: "⊕" },
              { t: "Prescription templates", d: "Create, edit, delete medicine templates", i: "℞" },
              { t: "Data export", d: "Export patient data with date range filter", i: "↓" },
              { t: "Data sharing", d: "Control which data patients can access", i: "⇄" },
              { t: "Security", d: "Password, biometric lock, 2FA settings", i: "⊛" },
              { t: "Offline & sync", d: "Sync status, conflict resolution, storage", i: "◎" },
            ].map(s => (
              <div key={s.t} style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: C.n[100], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{s.i}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{s.t}</div><div style={{ fontSize: 11, color: C.n[600] }}>{s.d}</div></div>
                <span style={{ color: C.n[500], fontSize: 14 }}>→</span>
              </div>
            ))}
          </div>
        </div>
      );
      default: return null;
    }
  };

  const showHeader = ["prescription", "pt-settings", "idsp"].includes(activeTab);
  const tabTitle = activeTab === "pt-settings" ? "Patient Settings" : activeTab === "idsp" ? "Health Monitoring" : (tabs.find(t => t.id === activeTab) || {}).label || "Muqsit Health System";

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════
  return (
    <div style={{ fontFamily: font, color: C.n[900] }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 20, height: 20, borderRadius: 4, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 600 }}>M+</div>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Muqsit Health System</span>
        </div>
        <div style={{ display: "flex", gap: 2, background: C.n[100], borderRadius: 6, padding: 2, marginLeft: 6 }}>
          {["desktop", "mobile"].map(v => (<button key={v} onClick={() => setView(v)} style={{ padding: "3px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 500, background: view === v ? "#fff" : "transparent", color: view === v ? C.n[900] : C.n[600], boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.06)" : "none", fontFamily: font }}>{v === "desktop" ? "Desktop" : "Mobile"}</button>))}
        </div>
        <div style={{ marginLeft: "auto", fontSize: 10, color: C.n[600], display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: C.pri[400] }} /> Synced</div>
      </div>

      {/* ══════ DESKTOP ══════ */}
      {view === "desktop" && (
        <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 12, overflow: "hidden", background: C.n[50], position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", height: 48, background: C.n[0], borderBottom: `0.5px solid ${C.n[200]}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 600 }}>M+</div>
              <span style={{ fontSize: 14, fontWeight: 500, marginRight: 20 }}>Muqsit Health System</span>
              <div style={{ display: "flex", gap: 1 }}>
                {tabs.map(t => (<button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "5px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, background: activeTab === t.id || (t.id === "prescription" && ["pt-settings","idsp"].includes(activeTab)) ? C.pri[50] : "transparent", color: activeTab === t.id || (t.id === "prescription" && ["pt-settings","idsp"].includes(activeTab)) ? C.pri[600] : C.n[600], fontWeight: activeTab === t.id ? 500 : 400, display: "flex", alignItems: "center", gap: 4, fontFamily: font }}><span style={{ fontSize: 12 }}>{t.icon}</span>{t.label}</button>))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input placeholder="Search by mobile..." style={{ padding: "5px 10px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, fontSize: 11, width: 170, outline: "none", background: C.n[0], color: C.n[900], fontFamily: font }} />
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 500 }}>DR</div>
            </div>
          </div>
          <div style={{ padding: 18 }}>
            {showHeader && <PatientHeader />}
            {activeTab === "prescription" ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "0.6fr 0.5px 1.4fr", gap: 0 }}>
                  <div style={{ paddingRight: 12 }}><div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.n[200]}`, color: C.n[800] }}>Clinical assessment</div><LeftColumn /></div>
                  <div style={{ background: C.n[200] }} />
                  <div style={{ paddingLeft: 16 }}><div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.pri[400]}`, color: C.pri[600] }}>Prescription</div><RightColumn /></div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18, paddingTop: 14, borderTop: `0.5px solid ${C.n[200]}` }}>
                  <button onClick={savePrescription} style={{ flex: 1, padding: "11px 20px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: font }}>Save & print prescription</button>
                  <button style={{ padding: "11px 20px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 12, cursor: "pointer", fontFamily: font }}>Preview PDF</button>
                </div>
                {savedMsg && <div style={{ textAlign: "center", fontSize: 12, color: C.pri[400], fontWeight: 500, marginTop: 8 }}>{savedMsg}</div>}

                {/* Notifications, updates, suggestions & chats bar */}
                <div style={{ marginTop: 14, background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "0.5px solid " + C.n[200], background: C.n[50] }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.danger[400] }}></div>
                      <span style={{ fontSize: 12, fontWeight: 500, color: C.n[900] }}>Notifications and updates, suggestions and chats</span>
                    </div>
                    <span style={{ fontSize: 10, color: C.n[500] }}>3 new</span>
                  </div>
                  <div style={{ padding: "0 14px" }}>
                    {[
                      { type: "alert", icon: "!", color: C.danger, text: "Nusrat Jahan (B-7) critical — vitals deteriorating, needs immediate review", time: "2 min ago" },
                      { type: "update", icon: "i", color: C.info, text: "Lab results ready for Fatima Khatun — CBC, CRP reports available", time: "15 min ago" },
                      { type: "suggestion", icon: "S", color: C.pri, text: "Consider checking HbA1c for Akhtar Rahman — diabetic, last checked 3 months ago", time: "1 hr ago" },
                    ].map(function(n, i) {
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: i < 2 ? "0.5px solid " + C.n[200] : "none" }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: n.color[50], color: n.color[800] || n.color[600], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, flexShrink: 0, marginTop: 1 }}>{n.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: C.n[800], lineHeight: 1.4 }}>{n.text}</div>
                            <div style={{ fontSize: 9, color: C.n[500], marginTop: 2 }}>{n.time}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : renderPage()}
          </div>
          {DrugPicker({})}
          {InvestigationPopup()}
          {OePopup()}
        </div>
      )}

      {/* ══════ MOBILE ══════ */}
      {view === "mobile" && (
        <div style={{ width: 375, margin: "0 auto", border: `0.5px solid ${C.n[200]}`, borderRadius: 32, padding: 10, background: C.n[100] }}>
          <div style={{ borderRadius: 24, overflow: "hidden", background: C.n[50], height: 760, display: "flex", flexDirection: "column", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 18px", fontSize: 10, color: C.n[600] }}><span style={{ fontWeight: 500 }}>5:04 PM</span><div style={{ display: "flex", gap: 4, alignItems: "center" }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: C.pri[400] }} /><span>Synced</span></div></div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 14px 8px", background: C.n[0], borderBottom: `0.5px solid ${C.n[200]}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 600 }}>M+</div>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{tabTitle}</span>
              </div>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.pri[400], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 500 }}>DR</div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              {showHeader && <PatientHeader mobile />}
              {activeTab === "prescription" ? (
                <>
                  <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.n[200]}`, color: C.n[800] }}>Clinical assessment</div><LeftColumn /></div>
                  <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.pri[400]}`, color: C.pri[600] }}>Prescription</div><RightColumn mobile /></div>
                  <button onClick={savePrescription} style={{ width: "100%", padding: "11px 20px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: font }}>Save & print</button>
                  {savedMsg && <div style={{ textAlign: "center", fontSize: 12, color: C.pri[400], fontWeight: 500, marginTop: 6 }}>{savedMsg}</div>}
                </>
              ) : renderPage()}
            </div>
            <div style={{ display: "flex", justifyContent: "space-around", padding: "6px 0 14px", background: C.n[0], borderTop: `0.5px solid ${C.n[200]}` }}>
              {mobileTabs.map(t => (<div key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer", color: activeTab === t.id || (t.id === "prescription" && ["pt-settings","idsp"].includes(activeTab)) ? C.pri[400] : C.n[500] }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, background: activeTab === t.id || (t.id === "prescription" && ["pt-settings","idsp"].includes(activeTab)) ? C.pri[400] : C.n[200], color: activeTab === t.id || (t.id === "prescription" && ["pt-settings","idsp"].includes(activeTab)) ? "#fff" : C.n[600], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{t.icon}</div>
                <span style={{ fontSize: 9, fontWeight: activeTab === t.id ? 500 : 400 }}>{t.label}</span>
              </div>))}
            </div>
            {DrugPicker({mobile: true})}
            {InvestigationPopup()}
            {OePopup()}
          </div>
        </div>
      )}
    </div>
  );
}
