"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TAB_PATHS, tabFromPath } from "@/components/layout/tabs";
import { drugDB, templateRx } from "@/data/drugs";
import { ApiError, patientsApi, prescriptionsApi, prescriptionDraftApi, setActiveWorkstationId } from "@/lib/api";
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
  name: "", hospitalId: "", bloodGroup: "", dob: "", age: "", sex: "", ethnicity: "", religion: "Islam",
  mobile: "", spouseMobile: "", relativeMobile: "", relativeRelation: "",
  district: "", fullAddress: "", monthlyIncome: "", picture: null, tags: [],
};

const initialOeData: OeData = {
  age: "", dob: "",
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
  const queryClient = useQueryClient();
  const [page, setPage] = useState<Page>("login");
  const [view, setView] = useState<View>("desktop");

  // The active tab is mirrored to the URL (see TAB_PATHS): switching tabs
  // pushes a history entry via the native History API — a shallow update,
  // so the app shell (and all the state below) survives tab changes —
  // while refresh and deep links are served by the app/[tab] route.
  const [activeTab, setActiveTabState] = useState<TabId>(() =>
    typeof window === "undefined" ? "prescription" : tabFromPath(window.location.pathname) ?? "prescription",
  );

  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
    const path = TAB_PATHS[tab];
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }, []);

  // Browser back/forward moves between tabs.
  useEffect(() => {
    const onPop = () => setActiveTabState(tabFromPath(window.location.pathname) ?? "prescription");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Patient header — starts empty; the date defaults to today.
  const [ptName, setPtName] = useState("");
  const [ptAge, setPtAge] = useState("");
  const [ptGender, setPtGender] = useState("");
  const [ptAddress, setPtAddress] = useState("");
  const [ptWeight, setPtWeight] = useState("");
  const [ptDate, setPtDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [ptPhone, setPtPhone] = useState("");
  const [ptHospitalId, setPtHospitalId] = useState("");

  // Left column fields
  const [chiefComplaints, setChiefComplaints] = useState<StringList>([]);
  const [previousComplaints, setPreviousComplaints] = useState<StringList>([]);
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

  // "Patient records" view galleries — uploaded prescription and report image
  // URLs (self-hosted /uploads). Persisted on the Patient record.
  const [rxImages, setRxImages] = useState<string[]>([]);
  const [reportImages, setReportImages] = useState<string[]>([]);

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
  // Saves the prescription to the API. If no saved patient is loaded,
  // a patient record is created first from the header fields.
  const savePrescription = async (): Promise<boolean> => {
    // A prescription is saveable with a medicine OR any clinical detail/advice —
    // not every visit prescribes a drug. Only a completely empty form is blocked.
    const hasContent =
      rxItems.length > 0 ||
      [
        chiefComplaints, previousComplaints, history, investigation, drugHistory,
        onExamination, note, provisionalDiagnosis, associatedIllness, finalDiagnosis,
        advice, adviceTest,
      ].some((a) => a.length > 0);
    if (!hasContent) {
      setSavedMsg("Add a medicine or some clinical detail before saving.");
      setTimeout(() => setSavedMsg(""), 3000);
      return false;
    }
    let ok = false;
    try {
      let pid = currentPatientId;
      if (!pid) {
        const patient = await patientsApi.create({
          name: ptName.trim() || "Unnamed patient",
          hospitalId: ptHospitalId || undefined,
          age: ptAge ? Number(ptAge) : undefined,
          sex: ptGender || undefined,
          mobile: ptPhone || undefined,
          fullAddress: ptAddress || undefined,
          pictureUrl: ptInfo.picture || undefined,
        });
        pid = patient.id;
        setCurrentPatientId(pid);
        // Flush everything that was entered BEFORE this patient existed — the
        // per-change PATCHes (family tree, health-monitoring ticks/dates, watch,
        // image galleries) all no-op without a patient id, so carry them over
        // now. Non-fatal: a prescription must still save even if this fails.
        const carryOver: Parameters<typeof patientsApi.update>[1] = {};
        if (rxImages.length) carryOver.prescriptionImages = rxImages;
        if (reportImages.length) carryOver.reportImages = reportImages;
        if (familyMembers.length) carryOver.familyMembers = familyMembers;
        if (hmDrugs.size) carryOver.hmSelectedDrugs = Array.from(hmDrugs);
        if (watchPatient) carryOver.watched = true;
        if (Object.keys(carryOver).length) {
          void patientsApi.update(pid, carryOver).catch(() => {});
        }
      }

      await prescriptionsApi.create({
        patientId: pid,
        chiefComplaints, previousComplaints, history, investigation, drugHistory, onExamination,
        note, provisionalDiagnosis, associatedIllness, finalDiagnosis,
        advice, adviceTest,
        followUpNum: followUpNum || undefined,
        followUpUnit: followUpUnit || undefined,
        followUpMandatory,
        // Tapering lines carry an empty drug (they belong to the line above) —
        // fill the name back in so each saved item is self-contained.
        items: (() => {
          let lastDrug = "";
          return rxItems.map((r, i) => {
            // Notes are free text — they don't carry a drug name forward.
            if (r.isNote) return { ...r, order: i };
            if (r.drug.trim()) lastDrug = r.drug.trim();
            return { ...r, drug: r.drug.trim() || lastDrug, order: i };
          });
        })(),
      });
      setSavedMsg("Prescription saved!");
      ok = true;
    } catch (e) {
      setSavedMsg(e instanceof ApiError ? `Save failed: ${e.message}` : "Save failed. Is the API running?");
    }
    setTimeout(() => setSavedMsg(""), 3000);
    return ok;
  };

  // Load the patient's saved image galleries whenever a different patient is
  // opened (and clear them when starting a fresh, unsaved patient).
  useEffect(() => {
    if (!currentPatientId) {
      setRxImages([]); setReportImages([]);
      setHmDrugs(new Set()); setFamilyMembers([]);
      return;
    }
    let cancelled = false;
    patientsApi
      .get(currentPatientId)
      .then((p) => {
        if (!cancelled) {
          setRxImages(p.prescriptionImages ?? []);
          setReportImages(p.reportImages ?? []);
          setHmDrugs(new Set(p.hmSelectedDrugs ?? []));
          setFamilyMembers((p.familyMembers as FamilyMember[]) ?? []);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentPatientId]);

  // Update a gallery and persist it to the loaded patient. If no patient is
  // saved yet it's a no-op on the server — the array is included when the
  // patient is created in savePrescription.
  const saveRxImages = useCallback((next: string[]) => {
    setRxImages(next);
    if (currentPatientId) void patientsApi.update(currentPatientId, { prescriptionImages: next }).catch(() => {});
  }, [currentPatientId]);
  const saveReportImages = useCallback((next: string[]) => {
    setReportImages(next);
    if (currentPatientId) void patientsApi.update(currentPatientId, { reportImages: next }).catch(() => {});
  }, [currentPatientId]);

  // Clear the whole prescription editor — every patient is different, so this is
  // called whenever a patient is switched/opened/created so one patient's
  // clinical assessment can never bleed into the next. Identity (currentPatientId,
  // ptInfo) is set by the caller right after.
  const resetEditor = useCallback(() => {
    setPtName(""); setPtAge(""); setPtGender(""); setPtAddress(""); setPtWeight("");
    setPtDate(new Date().toLocaleDateString("en-CA")); setPtPhone(""); setPtHospitalId("");
    setChiefComplaints([]); setPreviousComplaints([]); setHistory([]); setInvestigation([]);
    setDrugHistory([]); setOnExamination([]); setNote([]); setProvisionalDiagnosis([]);
    setAssociatedIllness([]); setFinalDiagnosis([]);
    setRxItems([]); setAdvice([]); setAdviceTest([]);
    setFollowUpNum(""); setFollowUpUnit("day"); setFollowUpMandatory(false);
    setActiveTemplate(null); setInvImages({}); setOeData(initialOeData);
  }, []);

  // ── Active workstation (the practice the user is currently working in) ──
  // `null` until chosen. Switching scopes every API request to that doctor
  // (via the X-Workstation header) and starts a clean editor for that practice.
  const [activeWorkstationId, setActiveWorkstationIdState] = useState<string | null>(null);
  const [showWorkstations, setShowWorkstations] = useState(false);
  const activeWsRef = useRef<string | null>(null);
  const selectWorkstation = useCallback((doctorId: string) => {
    const prev = activeWsRef.current;
    if (prev === doctorId) { setShowWorkstations(false); return; }
    const isFirstSelect = prev === null; // page-load auto-select vs an actual switch
    activeWsRef.current = doctorId;
    setActiveWorkstationId(doctorId);        // module-level → goes out as a header
    setActiveWorkstationIdState(doctorId);
    setShowWorkstations(false);
    // Only wipe the editor when CHANGING practice — not on the first auto-select,
    // so a reloaded draft (own workspace) isn't lost.
    if (!isFirstSelect) {
      resetEditor();
      setCurrentPatientId(null);
    }
    void queryClient.invalidateQueries();    // (re)fetch all data under this doctor
  }, [resetEditor, queryClient]);

  // Persist family members whenever the list changes (add or remove).
  const saveFamilyMembers = useCallback((next: FamilyMember[]) => {
    setFamilyMembers(next);
    if (currentPatientId) void patientsApi.update(currentPatientId, { familyMembers: next }).catch(() => {});
  }, [currentPatientId]);

  // ── Server-side prescription draft ──────────────────────────
  // The whole editor (header + clinical sections + investigation findings +
  // medicines + advice) is auto-saved to the server as the doctor types, so a
  // page reload restores exactly where they left off. One active draft per
  // doctor; the saved draft always mirrors the live editor.
  const draftReadyRef = useRef(false);

  // Hydrate the editor from the server draft once, on mount (the provider only
  // renders for a signed-in doctor). `draftReadyRef` then unlocks auto-save so
  // the empty initial state can't overwrite the stored draft before it loads.
  useEffect(() => {
    let cancelled = false;
    prescriptionDraftApi
      .get()
      .then((res) => {
        if (cancelled) return;
        const d = (res.data ?? {}) as Record<string, unknown>;
        const str = (k: string, set: (v: string) => void) => { if (typeof d[k] === "string") set(d[k] as string); };
        const arr = (k: string, set: (v: string[]) => void) => { if (Array.isArray(d[k])) set(d[k] as string[]); };
        str("ptName", setPtName); str("ptAge", setPtAge); str("ptGender", setPtGender);
        str("ptAddress", setPtAddress); str("ptWeight", setPtWeight); str("ptDate", setPtDate);
        str("ptPhone", setPtPhone); str("ptHospitalId", setPtHospitalId);
        arr("chiefComplaints", setChiefComplaints); arr("previousComplaints", setPreviousComplaints);
        arr("history", setHistory); arr("investigation", setInvestigation);
        arr("drugHistory", setDrugHistory); arr("onExamination", setOnExamination);
        arr("note", setNote); arr("provisionalDiagnosis", setProvisionalDiagnosis);
        arr("associatedIllness", setAssociatedIllness); arr("finalDiagnosis", setFinalDiagnosis);
        arr("advice", setAdvice); arr("adviceTest", setAdviceTest);
        if (Array.isArray(d.rxItems)) setRxItems(d.rxItems as RxItem[]);
        str("followUpNum", setFollowUpNum); str("followUpUnit", setFollowUpUnit);
        if (typeof d.followUpMandatory === "boolean") setFollowUpMandatory(d.followUpMandatory);
        if (d.invImages && typeof d.invImages === "object") setInvImages(d.invImages as Record<string, string>);
        if (d.oeData && typeof d.oeData === "object") setOeData(d.oeData as OeData);
        if (typeof d.currentPatientId === "string") setCurrentPatientId(d.currentPatientId);
      })
      .catch((e) => console.warn("[draft] load failed — editor will not restore on reload:", e))
      .finally(() => { if (!cancelled) draftReadyRef.current = true; });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save the live editor to the server (debounced) on any change.
  useEffect(() => {
    if (!draftReadyRef.current) return;
    const snapshot: Record<string, unknown> = {
      ptName, ptAge, ptGender, ptAddress, ptWeight, ptDate, ptPhone, ptHospitalId,
      chiefComplaints, previousComplaints, history, investigation, drugHistory,
      onExamination, note, provisionalDiagnosis, associatedIllness, finalDiagnosis,
      rxItems, advice, adviceTest, followUpNum, followUpUnit, followUpMandatory,
      invImages, oeData, currentPatientId,
    };
    const t = setTimeout(() => { void prescriptionDraftApi.save(snapshot).catch((e) => console.warn("[draft] save failed:", e)); }, 1200);
    return () => clearTimeout(t);
  }, [
    ptName, ptAge, ptGender, ptAddress, ptWeight, ptDate, ptPhone, ptHospitalId,
    chiefComplaints, previousComplaints, history, investigation, drugHistory,
    onExamination, note, provisionalDiagnosis, associatedIllness, finalDiagnosis,
    rxItems, advice, adviceTest, followUpNum, followUpUnit, followUpMandatory,
    invImages, oeData, currentPatientId,
  ]);

  // Toggle "Keep eye on this patient" — persists when a saved patient is loaded.
  const toggleWatch = () => {
    const next = !watchPatient;
    setWatchPatient(next);
    if (currentPatientId) {
      void patientsApi
        .update(currentPatientId, { watched: next })
        .then(() => queryClient.invalidateQueries({ queryKey: ["patients"] }))
        .catch(() => setWatchPatient(!next)); // revert on failure
    }
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
    { label: "Previous complaints", items: previousComplaints, set: setPreviousComplaints },
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
    ptHospitalId, setPtHospitalId,
    chiefComplaints, setChiefComplaints, previousComplaints, setPreviousComplaints,
    history, setHistory, investigation, setInvestigation,
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
    rxImages, setRxImages, reportImages, setReportImages, saveRxImages, saveReportImages,
    showOePopup, setShowOePopup, ptSettingsTab, setPtSettingsTab, familyMembers, setFamilyMembers, saveFamilyMembers,
    showFamilyForm, setShowFamilyForm, familyRelation, setFamilyRelation, familyForm, setFamilyForm,
    ptInfo, setPtInfo, currentPatientId, setCurrentPatientId,
    eventsPatient, setEventsPatient, eventMsg, setEventMsg, rcQuery, setRcQuery,
    rcFilter, setRcFilter, rcSelected, setRcSelected, watchPatient, setWatchPatient,
    hmDrugs, setHmDrugs, oeData, setOeData,
    // handlers + derived
    handleLogin, addDrug, removeDrug, updateRx, loadTemplate, savePrescription, toggleWatch,
    resetEditor, filteredDrugs, monthlyCost, allFieldValues, leftFields,
    activeWorkstationId, showWorkstations, setShowWorkstations, selectWorkstation,
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
