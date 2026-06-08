"use client";

import React, {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import { drugDB, templateRx } from "@/data/drugs";
import type {
  Page,
  View,
  TabId,
  RxItem,
  Drug,
  OeData,
  PtInfo,
  FamilyForm,
  FamilyMember,
  IpdPatient,
} from "@/types";

type StringList = string[];
type SetStringList = Dispatch<SetStateAction<StringList>>;

export interface LeftField {
  label: string;
  items: StringList;
  set: SetStringList;
  sugKey?: string;
}

// ── Initial values ──────────────────────────────────────────
const initialPtInfo: PtInfo = {
  name: "", dob: "", age: "", sex: "Male", ethnicity: "South Asian", religion: "Islam",
  mobile: "", spouseMobile: "", relativeMobile: "", relativeRelation: "",
  district: "", fullAddress: "", monthlyIncome: "", picture: null, tags: [],
};

const initialOeData: OeData = {
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
  diseaseHistory: "", surgicalHistory: "",
};

// ── The store hook (single source of truth) ─────────────────
function useMuqsitStore() {
  const [page, setPage] = useState<Page>("login");
  const [activeTab, setActiveTab] = useState<TabId>("prescription");
  const [view, setView] = useState<View>("desktop");

  // Patient header
  const [ptName, setPtName] = useState("Fatima Khatun");
  const [ptAge, setPtAge] = useState("34");
  const [ptGender, setPtGender] = useState("Female");
  const [ptAddress, setPtAddress] = useState("Mirpur-10, Dhaka");
  const [ptWeight, setPtWeight] = useState("62");
  const [ptDate, setPtDate] = useState("2026-04-09");
  const [ptPhone, setPtPhone] = useState("+880 1712-345678");

  // Left column fields
  const [chiefComplaints, setChiefComplaints] = useState<StringList>([]);
  const [history, setHistory] = useState<StringList>([]);
  const [investigation, setInvestigation] = useState<StringList>([]);
  const [drugHistory, setDrugHistory] = useState<StringList>([]);
  const [onExamination, setOnExamination] = useState<StringList>([]);
  const [note, setNote] = useState<StringList>([]);
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState<StringList>([]);
  const [associatedIllness, setAssociatedIllness] = useState<StringList>([]);
  const [finalDiagnosis, setFinalDiagnosis] = useState<StringList>([]);

  // Right column
  const [rxItems, setRxItems] = useState<RxItem[]>([]);
  const [advice, setAdvice] = useState<StringList>([]);
  const [adviceTest, setAdviceTest] = useState<StringList>([]);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [showDrugPicker, setShowDrugPicker] = useState(false);
  const [drugSearch, setDrugSearch] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [followUpNum, setFollowUpNum] = useState("");
  const [followUpUnit, setFollowUpUnit] = useState("day");
  const [followUpMandatory, setFollowUpMandatory] = useState(false);

  // Investigation popup
  const [showInvPopup, setShowInvPopup] = useState(false);
  const [invActiveCat, setInvActiveCat] = useState("Hematology");
  const [invFormData, setInvFormData] = useState<Record<string, string>>({});
  const [calDate, setCalDate] = useState<Date>(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [invSearch, setInvSearch] = useState("");
  const [invImages, setInvImages] = useState<Record<string, string>>({});

  // On-examination popup + patient settings
  const [showOePopup, setShowOePopup] = useState(false);
  const [ptSettingsTab, setPtSettingsTab] = useState("info");
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [showFamilyForm, setShowFamilyForm] = useState(false);
  const [familyRelation, setFamilyRelation] = useState("");
  const [familyForm, setFamilyForm] = useState<FamilyForm>({ name: "", mobile: "", nid: "", sex: "" });
  const [ptInfo, setPtInfo] = useState<PtInfo>(initialPtInfo);
  // id of the patient currently loaded for editing (null = creating a new one)
  const [currentPatientId, setCurrentPatientId] = useState<string | null>(null);

  // IPD events + misc
  const [eventsPatient, setEventsPatient] = useState<IpdPatient | null>(null);
  const [eventMsg, setEventMsg] = useState("");
  const [rcQuery, setRcQuery] = useState("");
  const [rcFilter, setRcFilter] = useState("both");
  const [rcSelected, setRcSelected] = useState<Set<string>>(new Set());
  const [watchPatient, setWatchPatient] = useState(false);

  // Health monitoring selections
  const [hmDrugs, setHmDrugs] = useState<Set<string>>(new Set());
  const [hmSymptoms, setHmSymptoms] = useState<Set<string>>(new Set());
  const [hmTests, setHmTests] = useState<Set<string>>(new Set());
  const [oeData, setOeData] = useState<OeData>(initialOeData);

  // ── Handlers ──────────────────────────────────────────────
  const handleLogin = () => setPage("app");

  const addDrug = (name: string) => {
    if (!rxItems.find((r) => r.drug === name))
      setRxItems([...rxItems, { drug: name, dose: "1+0+1", duration: "5 days", instruction: "After meal" }]);
    setShowDrugPicker(false);
    setDrugSearch("");
  };
  const removeDrug = (idx: number) => setRxItems(rxItems.filter((_, i) => i !== idx));
  const updateRx = (idx: number, f: keyof RxItem, v: string) => {
    const c = [...rxItems];
    c[idx] = { ...c[idx], [f]: v };
    setRxItems(c);
  };
  const loadTemplate = (name: string) => {
    setActiveTemplate(name);
    if (templateRx[name]) setRxItems([...templateRx[name]]);
  };
  const savePrescription = () => {
    setSavedMsg("Prescription saved!");
    setTimeout(() => setSavedMsg(""), 2500);
  };

  const filteredDrugs: Drug[] = drugDB.filter(
    (d) =>
      d.name.toLowerCase().includes(drugSearch.toLowerCase()) ||
      d.cat.toLowerCase().includes(drugSearch.toLowerCase())
  );

  // Cost calculation
  const monthlyCost = (() => {
    let total = 0;
    rxItems.forEach((item) => {
      const drug = drugDB.find((d) => d.name === item.drug);
      if (!drug) return;
      const doseParts = item.dose.split("+").map(Number).filter((n) => !isNaN(n));
      const perDay = doseParts.reduce((a, b) => a + b, 0) || 1;
      const durMatch = item.duration.match(/(\d+)/);
      let days = durMatch ? parseInt(durMatch[1]) : 30;
      if (item.duration === "Continue") days = 30;
      if (item.dose.includes("ml")) {
        total += drug.price * Math.ceil(((parseFloat(item.dose) || 10) * perDay * days) / 100);
      } else {
        total += drug.price * perDay * days;
      }
    });
    return total;
  })();

  const allFieldValues: Record<string, StringList> = {
    chiefComplaints, history, investigation, drugHistory, onExamination,
    note, provisionalDiagnosis, associatedIllness, finalDiagnosis,
  };

  const leftFields: LeftField[] = [
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

  return {
    page, setPage, activeTab, setActiveTab, view, setView,
    ptName, setPtName, ptAge, setPtAge, ptGender, setPtGender,
    ptAddress, setPtAddress, ptWeight, setPtWeight, ptDate, setPtDate, ptPhone, setPtPhone,
    chiefComplaints, setChiefComplaints, history, setHistory, investigation, setInvestigation,
    drugHistory, setDrugHistory, onExamination, setOnExamination, note, setNote,
    provisionalDiagnosis, setProvisionalDiagnosis, associatedIllness, setAssociatedIllness,
    finalDiagnosis, setFinalDiagnosis,
    rxItems, setRxItems, advice, setAdvice, adviceTest, setAdviceTest,
    activeTemplate, setActiveTemplate, showDrugPicker, setShowDrugPicker, drugSearch, setDrugSearch,
    savedMsg, setSavedMsg, followUpNum, setFollowUpNum, followUpUnit, setFollowUpUnit,
    followUpMandatory, setFollowUpMandatory,
    showInvPopup, setShowInvPopup, invActiveCat, setInvActiveCat, invFormData, setInvFormData,
    calDate, setCalDate, showMonthPicker, setShowMonthPicker, invSearch, setInvSearch,
    invImages, setInvImages,
    showOePopup, setShowOePopup, ptSettingsTab, setPtSettingsTab, familyMembers, setFamilyMembers,
    showFamilyForm, setShowFamilyForm, familyRelation, setFamilyRelation, familyForm, setFamilyForm,
    ptInfo, setPtInfo, currentPatientId, setCurrentPatientId,
    eventsPatient, setEventsPatient, eventMsg, setEventMsg, rcQuery, setRcQuery,
    rcFilter, setRcFilter, rcSelected, setRcSelected, watchPatient, setWatchPatient,
    hmDrugs, setHmDrugs, hmSymptoms, setHmSymptoms, hmTests, setHmTests, oeData, setOeData,
    // handlers + derived
    handleLogin, addDrug, removeDrug, updateRx, loadTemplate, savePrescription,
    filteredDrugs, monthlyCost, allFieldValues, leftFields,
  };
}

export type MuqsitStore = ReturnType<typeof useMuqsitStore>;

const MuqsitContext = createContext<MuqsitStore | null>(null);

export function MuqsitProvider({ children }: { children: ReactNode }) {
  const store = useMuqsitStore();
  return <MuqsitContext.Provider value={store}>{children}</MuqsitContext.Provider>;
}

export function useMuqsit(): MuqsitStore {
  const ctx = useContext(MuqsitContext);
  if (!ctx) throw new Error("useMuqsit must be used within a MuqsitProvider");
  return ctx;
}
