"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TAB_PATHS, tabFromPath } from "@/components/layout/tabs";
import { drugDB, templateRx } from "@/data/drugs";
import { ApiError, activityApi, patientsApi, prescriptionsApi, prescriptionDraftApi, opdApi, setActiveWorkstationId, type Patient, type Workstation } from "@/lib/api";
import { createRxSnapshotGate } from "@/lib/rxSnapshot";
import { mergeThumbs, safeThumbMap, type ThumbMap } from "@/lib/imageThumbs";
import { buildRxAlertInput, checkRxAlerts } from "@/lib/rxAlerts";
import { patientToPtInfo } from "@/lib/patientForm";
import { displayAge } from "@/lib/age";
import { useAuth } from "@/context/AuthContext";
import { parseInvestigationEntries, mergeFindings, type InvFinding } from "@/lib/investigationSummary";
import { oeEntriesForDate, mergeOe, type OeFinding } from "@/lib/onExaminationSummary";
import { isoToDdmmyyyy } from "@/lib/dateInput";
import { rxDrugHistoryEntries, syncRxDrugHistory, sameEntries } from "@/lib/rxDrugHistory";
import { pruneHidden } from "@/lib/investigationHidden";
import { PERM_KEY_OF_LABEL, ALWAYS_ALLOWED } from "@/lib/permissions";
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
  /**
   * The assistant permission key gating this field, when its LABEL cannot
   * identify it on its own — see `ExpandableField`'s `permKey`. Only "Note" and
   * "Plan" need it today: they share `rx.note`, and "Plan" collides with the
   * IPD sheet's own label.
   */
  permKey?: string;
}

// ── Initial values ──────────────────────────────────────────
const initialPtInfo: PtInfo = {
  name: "", hospitalId: "", bloodGroup: "", dob: "", age: "", sex: "", ethnicity: "", religion: "Islam",
  mobile: "", nid: "", spouseMobile: "", relativeMobile: "", relativeRelation: "",
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

// Returns today's date as YYYY-MM-DD (ISO) in the device's local timezone.
// Using an explicit template keeps the format stable on stripped-ICU runtimes
// where toLocaleDateString("en-CA") may not return YYYY-MM-DD.
function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

// ── The store hook (single source of truth) ─────────────────
function useMuqsitStore() {
  const queryClient = useQueryClient();
  // The signed-in user — used (via ref, so callbacks stay stable) to tell a
  // SUPERVISED patient (owned by another doctor) from an owned one.
  const { user: authUser } = useAuth();
  const authIdRef = useRef<string | null>(null);
  useEffect(() => { authIdRef.current = authUser?.id ?? null; }, [authUser]);
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
  const [ptDate, setPtDate] = useState(todayISO);
  const [ptPhone, setPtPhone] = useState("");
  const [ptHospitalId, setPtHospitalId] = useState("");

  // Left column fields
  const [chiefComplaints, setChiefComplaints] = useState<StringList>([]);
  const [previousComplaints, setPreviousComplaints] = useState<StringList>([]);
  const [history, setHistory] = useState<StringList>([]);
  const [investigation, setInvestigation] = useState<StringList>([]);
  // ⚕️ Investigation findings the doctor marked "do not print" (2026-09-21),
  // by their exact stored string. It changes the printed document only — the
  // findings themselves stay in the record and stay on screen. Carried in the
  // draft snapshot, so the marks survive a reload and a patient switch and last
  // until the doctor unhides them; a new visit starts with an empty list and so
  // with nothing hidden. See `lib/investigationHidden.ts`.
  const [hiddenInvestigation, setHiddenInvestigation] = useState<StringList>([]);
  // ⚕️ The WHOLE Drug history section, kept off the printed sheet (2026-09-21).
  // A boolean, not a list: the medicines live behind a modal, so this row can
  // only offer an all-or-nothing choice — see `DrugHistoryField`.
  const [hideDrugHistory, setHideDrugHistory] = useState(false);
  // ⚕️ A hide mark must not outlive the finding it was put on. Without this, a
  // line deleted and later re-typed — the same words, a different clinical
  // moment — would come back already hidden, with nothing on screen saying why.
  // Returns `prev` unchanged when nothing was orphaned, so this cannot loop.
  useEffect(() => {
    setHiddenInvestigation((prev) => {
      if (prev.length === 0) return prev;
      const next = pruneHidden(prev, investigation);
      return next.length === prev.length ? prev : next;
    });
  }, [investigation]);
  const [drugHistory, setDrugHistory] = useState<StringList>([]);
  const [onExamination, setOnExamination] = useState<StringList>([]);
  // "Note / plan" was one field until 2026-09-07; the physician split it into
  // two lists. `note` keeps its column (and everything already stored in it).
  const [note, setNote] = useState<StringList>([]);
  const [plan, setPlan] = useState<StringList>([]);
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
  // Fingerprint of the printed sheet behind the newest AUTO gallery snapshot
  // (lib/rxSnapshot.ts). A ref, not state: nothing renders it, and a ref reads
  // at its current value rather than the value some earlier render closed over
  // — which matters because the click handler that uses it was built before the
  // save it belongs to even started.
  const rxGateRef = useRef(createRxSnapshotGate());
  // ⚕️ Prescribing warnings the doctor pressed "Ignore warning" on, by
  // `RxAlert.id`. THIS PRESCRIPTION ONLY (physician's decision, 2026-08-23):
  // never persisted, cleared when the visit is saved and when the editor is
  // reset, so the next visit puts the same decision in front of the doctor
  // again. It hides the ℞ pad's bubble and nothing else — the advisory in
  // "Notifications, Chats & Reports" stays up, and the save-time audit line
  // is written whether the warning was ignored or not.
  const [ignoredAlerts, setIgnoredAlerts] = useState<ReadonlySet<string>>(() => new Set());
  const ignoreAlert = useCallback((id: string) => {
    setIgnoredAlerts((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);
  const [reportImages, setReportImages] = useState<string[]>([]);
  // Small copies for both galleries above, keyed by full image URL. Display-only
  // (lib/imageThumbs.ts), and kept in a ref as well as state because it is
  // merged inside save callbacks that must not re-create on every change.
  const [imageThumbs, setImageThumbs] = useState<ThumbMap>({});
  const imageThumbsRef = useRef<ThumbMap>({});
  const putThumbs = useCallback((added: ThumbMap): ThumbMap | null => {
    if (!added || Object.keys(added).length === 0) return null;
    const next = mergeThumbs(imageThumbsRef.current, added);
    imageThumbsRef.current = next;
    setImageThumbs(next);
    return next;
  }, []);

  // On-examination popup + patient settings
  const [showOePopup, setShowOePopup] = useState(false);
  const [ptSettingsTab, setPtSettingsTab] = useState("info");
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  // Persistent per-patient investigation history (records-page summary).
  const [investigationSummary, setInvestigationSummary] = useState<InvFinding[]>([]);
  const [onExaminationSummary, setOnExaminationSummary] = useState<OeFinding[]>([]);
  const [showFamilyForm, setShowFamilyForm] = useState(false);
  const [familyRelation, setFamilyRelation] = useState("");
  const [familyForm, setFamilyForm] = useState<FamilyForm>({ name: "", mobile: "", nid: "", sex: "" });
  const [ptInfo, setPtInfo] = useState<PtInfo>(initialPtInfo);
  // Patient-settings form unlock: existing patients open read-only until
  // "Edit" is pressed. Lives here (not in the view) so it can be mirrored.
  const [ptEditing, setPtEditing] = useState(true);
  // id of the patient currently loaded for editing (null = creating a new one)
  const [currentPatientId, setCurrentPatientId] = useState<string | null>(null);
  // `currentPatientId` as of RIGHT NOW. A callback created before the patient
  // existed still closes over the old state, and `savePrescription` creates the
  // patient mid-flight — which is how the very first gallery snapshot used to be
  // dropped for a new patient: the PATCH was skipped for a null id and the
  // patient-load effect then replaced the local list with the server's.
  const patientIdRef = useRef<string | null>(null);
  useEffect(() => { patientIdRef.current = currentPatientId; }, [currentPatientId]);

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
  //
  // ⚕️ NOT re-entrant, and it does not serialise itself. Two overlapping calls
  // POST twice and the consultation lands in the record as two prescriptions —
  // which is exactly what a double-press on Save & print used to do. Its one
  // caller, `PrescriptionView#handleSave`, holds a synchronous in-flight guard;
  // any new caller owes the same.
  const savePrescription = async (): Promise<boolean> => {
    // A prescription is saveable with a medicine OR any clinical detail/advice —
    // not every visit prescribes a drug. Only a completely empty form is blocked.
    const hasContent =
      rxItems.length > 0 ||
      [
        chiefComplaints, previousComplaints, history, investigation, drugHistory,
        onExamination, note, plan, provisionalDiagnosis, associatedIllness, finalDiagnosis,
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
          // Header age is always manual — base it to this year so it auto-increments.
          ageAsOfYear: ptAge ? new Date().getFullYear() : undefined,
          sex: ptGender || undefined,
          mobile: ptPhone || undefined,
          fullAddress: ptAddress || undefined,
          pictureUrl: ptInfo.picture || undefined,
        });
        pid = patient.id;
        setCurrentPatientId(pid);
        // Synchronously, not via the effect: the rest of this save (and the
        // gallery snapshot that follows it) runs before React re-renders.
        patientIdRef.current = pid;
        // A patient created a moment ago has no stored drug history, so what is
        // in the editor IS their history — the guard on the write below can let
        // it through.
        drugHistoryHydratedRef.current = pid;
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
        note, plan, provisionalDiagnosis, associatedIllness, finalDiagnosis,
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

      // Measurement for "Your usual": what share of ℞ lines the suggestions
      // actually saved the doctor from typing. There is no proxy for this
      // number — it is the whole point of the feature — and it cannot be
      // recovered later, because `fromHabit` is stripped before the
      // prescription is stored (a record says what was prescribed, never how it
      // was typed). One activity line per prescription carries both halves, so
      // the ratio is a sum over the feed.
      //
      // Fire-and-forget and silent: a failed measurement must never disturb a
      // save that has already succeeded, and must never be visible to the
      // doctor mid-consultation.
      const rxLines = rxItems.filter((r) => !r.isNote);
      const fromHabit = rxLines.filter((r) => r.fromHabit).length;
      if (fromHabit > 0) {
        void activityApi
          .log({
            section: "Prescribing habits",
            detail: `${fromHabit} of ${rxLines.length} ℞ line${rxLines.length === 1 ? "" : "s"} inserted from "Your usual"`,
            action: "saved",
            patientId: pid ?? undefined,
          })
          .catch(() => {});
      }
      // ⚕️ The prescribing warnings this visit raised, written to the activity
      // feed so they OUTLIVE the screen (physician's decision, 2026-08-23).
      // The advisory itself is derived and vanishes with the editor; this line
      // is the permanent record that the doctor was warned, and it is written
      // whether or not they pressed "Ignore warning" — a dismissal hides the
      // bubble, never the fact that the warning was raised.
      //
      // The message is logged VERBATIM. It is the physician's own rule text
      // (data/rxAlerts.ts); rewording it here would put a sentence no one
      // approved into the patient's permanent record.
      //
      // Same shape as the habit line above: fire-and-forget, wrapped, silent.
      // The matcher is written never to throw, but a save that has already
      // succeeded must not be disturbed by an audit line that failed.
      try {
        const alerts = checkRxAlerts(
          buildRxAlertInput({ rxItems, leftFields, drugHistory, visitDate: isoToDdmmyyyy(ptDate) }),
        ).alerts;
        for (const a of alerts) {
          void activityApi
            .log({
              section: "Prescribing alert", detail: a.message, action: "saved",
              // Name the patient. An audit line that says a contraindication was
              // raised is worth little if the record cannot say for whom.
              patientId: pid ?? undefined, patientName: ptName.trim() || undefined,
            })
            .catch(() => {});
        }
      } catch { /* an audit line is never worth a failed save */ }

      // Merge this visit's investigation findings into the patient's permanent
      // investigation history (records-page summary).
      if (pid) {
        const parsed = parseInvestigationEntries(investigation);
        if (parsed.length) {
          const merged = mergeFindings(investigationSummary, parsed);
          setInvestigationSummary(merged);
          void patientsApi.update(pid, { investigationSummary: merged }).catch(() => {});
        }
        // Same for on-examination: keep a dated record of this visit's findings.
        const oeAdds = oeEntriesForDate(onExamination, isoToDdmmyyyy(ptDate));
        if (oeAdds.length) {
          const mergedOe = mergeOe(onExaminationSummary, oeAdds);
          setOnExaminationSummary(mergedOe);
          void patientsApi.update(pid, { onExaminationSummary: mergedOe }).catch(() => {});
        }
        // Persist the (date-stamped) drug history so it carries across visits;
        // the Current/Distant-past split is derived from the date on load.
        //
        // ⚕️ ONLY once this patient's own list is actually in hand. A save fired
        // inside the window before the patient fetch lands would otherwise write
        // the blank the editor starts with straight over their recorded
        // medications — and the ℞ mirror now fills that blank with today's
        // medicines, which is exactly what makes the loss look like real data.
        if (drugHistoryHydratedRef.current === pid) {
          void patientsApi.update(pid, { drugHistory }).catch(() => {});
        }
      }
      // "Save & print" = complete: clear the patient's incomplete draft and flag
      // their OPD entry Complete (don't let the auto-save re-mark it incomplete).
      if (pid) {
        rxCompletedRef.current = pid;
        rxFlaggedRef.current = null;
        void patientsApi.update(pid, { incompleteRx: null }).catch(() => {});
        void opdApi.setRxStatus({
          patientId: pid, rxStatus: "complete",
          name: ptName.trim() || undefined, phone: ptPhone || undefined,
          age: ptAge ? Number(ptAge) : undefined, gender: ptGender || undefined,
        }).then(() => queryClient.invalidateQueries({ queryKey: ["opd"] })).catch(() => {});
      }
    } catch (e) {
      setSavedMsg(e instanceof ApiError ? `Save failed: ${e.message}` : "Save failed. Is the API running?");
    }
    // The visit is on the record — the next one asks about its warnings afresh.
    if (ok) setIgnoredAlerts(new Set());
    setTimeout(() => setSavedMsg(""), 3000);
    return ok;
  };

  // ⚕️ "the drug history in state belongs to THIS patient and came from stored
  // data" — not from the blank slate `resetEditor` leaves behind. The ℞ → Drug
  // history mirror below refuses to run until this matches, because merging
  // today's medicines into a not-yet-hydrated (empty) list would show the doctor
  // a patient with no drug history and hand that emptiness to whatever saves next.
  const drugHistoryHydratedRef = useRef<string | null>(null);

  // Load the patient's saved image galleries whenever a different patient is
  // opened (and clear them when starting a fresh, unsaved patient).
  useEffect(() => {
    if (!currentPatientId) {
      drugHistoryHydratedRef.current = null;
      setRxImages([]); rxGateRef.current.reset(null); setReportImages([]);
      imageThumbsRef.current = {}; setImageThumbs({});
      setHmDrugs(new Set()); setFamilyMembers([]); setInvestigationSummary([]); setOnExaminationSummary([]);
      return;
    }
    let cancelled = false;
    patientsApi
      .get(currentPatientId)
      .then((p) => {
        if (!cancelled) {
          setRxImages(p.prescriptionImages ?? []);
          rxGateRef.current.reset(p.lastRxImageKey ?? null);
          setReportImages(p.reportImages ?? []);
          const thumbs = safeThumbMap(p.imageThumbs);
          imageThumbsRef.current = thumbs;
          setImageThumbs(thumbs);
          setHmDrugs(new Set(p.hmSelectedDrugs ?? []));
          setFamilyMembers((p.familyMembers as FamilyMember[]) ?? []);
          setInvestigationSummary((p.investigationSummary as InvFinding[]) ?? []);
          setOnExaminationSummary((p.onExaminationSummary as OeFinding[]) ?? []);
          setDrugHistory((p.drugHistory as string[]) ?? []);
          drugHistoryHydratedRef.current = currentPatientId;
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentPatientId]);

  // Update a gallery and persist it to the loaded patient. If no patient is
  // saved yet it's a no-op on the server — the array is included when the
  // patient is created in savePrescription.
  //
  // `addedThumbs` is the small copy of each image being added, folded into the
  // patient's map and sent in the SAME PATCH as the array — one write, so the
  // gallery and its thumbnails cannot end up describing different sets. Omit it
  // for a remove or a reorder: those change the order, not the images, and the
  // map is keyed by URL rather than by position.
  const saveRxImages = useCallback((next: string[], addedThumbs?: ThumbMap) => {
    setRxImages(next);
    const thumbs = addedThumbs ? putThumbs(addedThumbs) : null;
    if (currentPatientId) {
      void patientsApi.update(currentPatientId, {
        prescriptionImages: next,
        ...(thumbs ? { imageThumbs: thumbs } : {}),
      }).catch(() => {});
    }
  }, [currentPatientId, putThumbs]);
  // ── "Save & print" gallery snapshot ────────────────────────────────────
  // Claim this sheet for the patient's gallery. False means the gallery already
  // holds it, so there is nothing to capture: the doctor re-saved a visit they
  // changed nothing on (physician's decision, 2026-08-23). The claim is taken
  // HERE, before the capture, and the capture is slow — a second click landing
  // mid-capture therefore finds the key already taken instead of filing the
  // same paper twice. Whoever claims must then either file it or release it.
  const claimRxSnapshot = useCallback((key: string | null): boolean => rxGateRef.current.claim(key), []);
  // ⚕️ The capture or the upload failed. Hand the fingerprint back, or the next
  // identical save would be suppressed for a sheet that never reached the
  // gallery — a printed document with no copy on file.
  const releaseRxSnapshot = useCallback(() => rxGateRef.current.release(), []);
  // File it: the image and the fingerprint of the sheet it pictures go in ONE
  // PATCH, so the two can never disagree. The id comes from the ref and the
  // insert is functional, because this runs after `savePrescription` may have
  // just created the patient.
  //
  // ⚕️ Newest FIRST (physician's decision, 2026-08-30): the sheet just printed
  // goes to the front of the gallery, so today's prescription is the one the
  // doctor sees without scrolling past years of visits. The URLs carry no date
  // (uploads are named by UUID), so the array order is the only record of
  // order — which is also why nothing here re-sorts what is already stored: a
  // gallery the doctor dragged into their own order stays in it.
  const saveRxSnapshot = useCallback((url: string, key: string | null, thumbUrl?: string) => {
    const pid = patientIdRef.current;
    rxGateRef.current.file(key);
    const thumbs = thumbUrl ? putThumbs({ [url]: thumbUrl }) : null;
    setRxImages((prev) => {
      const next = [url, ...prev];
      if (pid) {
        void patientsApi.update(pid, {
          prescriptionImages: next,
          ...(key ? { lastRxImageKey: key } : {}),
          ...(thumbs ? { imageThumbs: thumbs } : {}),
        }).catch(() => {});
      }
      return next;
    });
  }, [putThumbs]);
  const saveReportImages = useCallback((next: string[], addedThumbs?: ThumbMap) => {
    setReportImages(next);
    const thumbs = addedThumbs ? putThumbs(addedThumbs) : null;
    if (currentPatientId) {
      void patientsApi.update(currentPatientId, {
        reportImages: next,
        ...(thumbs ? { imageThumbs: thumbs } : {}),
      }).catch(() => {});
    }
  }, [currentPatientId, putThumbs]);

  // Clear the whole prescription editor — every patient is different, so this is
  // called whenever a patient is switched/opened/created so one patient's
  // clinical assessment can never bleed into the next. Identity (currentPatientId,
  // ptInfo) is set by the caller right after.
  const resetEditor = useCallback(() => {
    setPtName(""); setPtAge(""); setPtGender(""); setPtAddress(""); setPtWeight("");
    setPtDate(todayISO()); setPtPhone(""); setPtHospitalId("");
    setChiefComplaints([]); setPreviousComplaints([]); setHistory([]); setInvestigation([]); setHiddenInvestigation([]); setHideDrugHistory(false);
    setDrugHistory([]); setOnExamination([]); setNote([]); setPlan([]); setProvisionalDiagnosis([]);
    setAssociatedIllness([]); setFinalDiagnosis([]);
    setRxItems([]); setAdvice([]); setAdviceTest([]);
    setFollowUpNum(""); setFollowUpUnit("day"); setFollowUpMandatory(false);
    setActiveTemplate(null); setInvImages({}); setOeData(initialOeData);
    setIgnoredAlerts(new Set());
    drugHistoryHydratedRef.current = null; // blank list — nothing to mirror onto yet
  }, []);

  // Apply a saved editor snapshot (header + clinical) — used to restore a
  // patient's in-progress, not-yet-printed prescription (incompleteRx).
  const applyEditorSnapshot = useCallback((d: Record<string, unknown>) => {
    const str = (k: string, set: (v: string) => void) => { if (typeof d[k] === "string") set(d[k] as string); };
    const arr = (k: string, set: (v: string[]) => void) => { if (Array.isArray(d[k])) set(d[k] as string[]); };
    str("ptName", setPtName); str("ptAge", setPtAge); str("ptGender", setPtGender);
    str("ptAddress", setPtAddress); str("ptWeight", setPtWeight);
    // Restore the visit date but advance it to today if the draft is from a prior
    // calendar day. Keeps the prescription header and drug-history Current/Past
    // split both anchored to today across all callers (loadPatient + page-reload).
    str("ptDate", (v) => { const today = todayISO(); setPtDate(v < today ? today : v); });
    str("ptPhone", setPtPhone); str("ptHospitalId", setPtHospitalId);
    arr("chiefComplaints", setChiefComplaints); arr("previousComplaints", setPreviousComplaints);
    arr("history", setHistory); arr("investigation", setInvestigation);
    arr("hiddenInvestigation", setHiddenInvestigation);
    arr("drugHistory", setDrugHistory); arr("onExamination", setOnExamination);
    arr("note", setNote); arr("plan", setPlan); arr("provisionalDiagnosis", setProvisionalDiagnosis);
    arr("associatedIllness", setAssociatedIllness); arr("finalDiagnosis", setFinalDiagnosis);
    arr("advice", setAdvice); arr("adviceTest", setAdviceTest);
    if (Array.isArray(d.rxItems)) setRxItems(d.rxItems as RxItem[]);
    str("followUpNum", setFollowUpNum); str("followUpUnit", setFollowUpUnit);
    if (typeof d.followUpMandatory === "boolean") setFollowUpMandatory(d.followUpMandatory);
    if (typeof d.hideDrugHistory === "boolean") setHideDrugHistory(d.hideDrugHistory);
    if (d.invImages && typeof d.invImages === "object") setInvImages(d.invImages as Record<string, string>);
    if (d.oeData && typeof d.oeData === "object") setOeData(d.oeData as OeData);
  }, []);

  // Tracks the loaded patient's prescription lifecycle so the auto-save below
  // doesn't re-flag a just-completed visit as incomplete.
  const rxFlaggedRef = useRef<string | null>(null);   // patient already flagged incomplete in OPD
  const rxCompletedRef = useRef<string | null>(null); // patient whose Rx was just completed
  // True while the loaded patient belongs to ANOTHER practice (opened as their
  // supervising doctor). A supervisor's edits must NEVER be written into the
  // owner's shared Patient.incompleteRx / OPD flag — only into the supervisor's
  // own per-user server draft.
  const supervisedRef = useRef<boolean>(false);
  // Latest editor snapshot pending debounced save, so a patient/workstation
  // switch can flush it synchronously before the editor is reset (otherwise the
  // last <1200 ms of edits are silently discarded).
  const pendingDraftRef = useRef<{ snapshot: Record<string, unknown>; pid: string | null; supervised: boolean; hasRx: boolean } | null>(null);

  // Load a saved patient into the editor (header + settings form), starting from
  // a clean clinical slate. If the patient has an in-progress (not printed)
  // prescription saved, restore it. Galleries / health-monitoring / family tree
  // are hydrated by the currentPatientId effect below.
  // Synchronously persist the pending editor snapshot for the OUTGOING patient
  // before we reset the editor for a new one, so the last <1200 ms of edits are
  // not lost. Never writes the owner's incompleteRx for a supervised patient.
  const flushEditorDraft = useCallback(() => {
    if (!draftReadyRef.current) return;
    const p = pendingDraftRef.current;
    if (!p) return;
    void prescriptionDraftApi.save(p.snapshot).catch(() => {});
    if (p.pid && p.hasRx && !p.supervised && rxCompletedRef.current !== p.pid) {
      void patientsApi.update(p.pid, { incompleteRx: p.snapshot }).catch(() => {});
    }
  }, []);

  const loadPatient = useCallback((p: Patient) => {
    flushEditorDraft();       // persist the outgoing patient's last edits first
    resetEditor();
    setPtName(p.name);
    setPtAge(displayAge(p));
    setPtGender(p.sex || "");
    setPtPhone(p.mobile || "");
    setPtAddress(p.fullAddress || "");
    setPtHospitalId(p.hospitalId || "");
    setPtInfo(patientToPtInfo(p));
    setWatchPatient(p.watched);
    setCurrentPatientId(p.id);
    rxCompletedRef.current = null;
    // A patient from ANOTHER practice (opened as their supervising doctor) gets
    // a FRESH prescription — never the owner's in-progress draft. The owner's
    // saved prescriptions stay hidden too (those queries scope to the owner).
    // Effective doctor = chosen workstation, else the signed-in user themselves
    // (covers loads that happen before a workstation is selected).
    const effectiveDoctor = activeWsRef.current ?? authIdRef.current;
    const supervised = !!p.doctorId && !!effectiveDoctor && p.doctorId !== effectiveDoctor;
    supervisedRef.current = supervised; // gate the auto-save's incompleteRx/OPD writes
    const inc = p.incompleteRx;
    if (!supervised && inc && typeof inc === "object" && Object.keys(inc).length > 0) {
      applyEditorSnapshot(inc as Record<string, unknown>); // advances ptDate if draft is stale
      // The parked draft carries this patient's own drug history, so it is a valid
      // base to mirror onto while the background patient fetch is still in flight.
      drugHistoryHydratedRef.current = p.id;
      rxFlaggedRef.current = p.id; // already saved as incomplete
    } else {
      rxFlaggedRef.current = null;
    }
  }, [resetEditor, applyEditorSnapshot, flushEditorDraft]);

  // Convenience: load by id (fetches first). Returns the patient, or null.
  const loadPatientById = useCallback(async (id: string): Promise<Patient | null> => {
    try {
      const p = await patientsApi.get(id);
      loadPatient(p);
      return p;
    } catch {
      return null;
    }
  }, [loadPatient]);

  // ── Active workstation (the practice the user is currently working in) ──
  // `null` until chosen. Switching scopes every API request to that doctor
  // (via the X-Workstation header) and starts a clean editor for that practice.
  const [activeWorkstation, setActiveWorkstationState] = useState<Workstation | null>(null);
  const [showWorkstations, setShowWorkstations] = useState(false);
  const activeWsRef = useRef<string | null>(null);
  const selectWorkstation = useCallback((ws: Workstation) => {
    const prev = activeWsRef.current;
    if (prev === ws.doctorId) { setShowWorkstations(false); return; }
    const isFirstSelect = prev === null; // page-load auto-select vs an actual switch
    // Persist the current practice's pending edits before the header switches.
    if (!isFirstSelect) flushEditorDraft();
    activeWsRef.current = ws.doctorId;
    setActiveWorkstationId(ws.doctorId);     // module-level → goes out as a header
    setActiveWorkstationState(ws);
    setShowWorkstations(false);
    // Only wipe the editor when CHANGING practice — not on the first auto-select,
    // so a reloaded draft (own workspace) isn't lost.
    if (!isFirstSelect) {
      resetEditor();
      setCurrentPatientId(null);
    }
    void queryClient.invalidateQueries();    // (re)fetch all data under this doctor
  }, [resetEditor, queryClient, flushEditorDraft]);
  const activeWorkstationId = activeWorkstation?.doctorId ?? null;

  // Permission check for the active workstation. Owner (or before a workstation
  // is chosen) → full access. Assistant → only the granted keys (+ always-on).
  const can = useCallback((key: string): boolean => {
    if (!activeWorkstation || activeWorkstation.role === "owner") return true;
    return activeWorkstation.permissions.includes(key) || ALWAYS_ALLOWED.includes(key);
  }, [activeWorkstation]);
  // Is a section (identified by its display label) editable? Labels that aren't
  // gated sections are always editable.
  const canEditLabel = useCallback((label: string): boolean => {
    const key = PERM_KEY_OF_LABEL.get(label);
    return key ? can(key) : true;
  }, [can]);
  // True only while acting as an assistant in someone else's workstation.
  const isAssistantMode = !!activeWorkstation && activeWorkstation.role === "assistant";

  // Persist family members whenever the list changes (add or remove).
  const saveFamilyMembers = useCallback((next: FamilyMember[]) => {
    setFamilyMembers(next);
    if (currentPatientId) void patientsApi.update(currentPatientId, { familyMembers: next }).catch(() => {});
  }, [currentPatientId]);

  // Persist the patient's investigation history (records-page summary + Add).
  const saveInvestigationSummary = useCallback((next: InvFinding[]) => {
    setInvestigationSummary(next);
    if (currentPatientId) void patientsApi.update(currentPatientId, { investigationSummary: next }).catch(() => {});
  }, [currentPatientId]);

  // Persist the patient's on-examination history (records-page summary).
  const saveOnExaminationSummary = useCallback((next: OeFinding[]) => {
    setOnExaminationSummary(next);
    if (currentPatientId) void patientsApi.update(currentPatientId, { onExaminationSummary: next }).catch(() => {});
  }, [currentPatientId]);

  // Persist the patient's date-stamped drug history (carries across visits).
  const saveDrugHistory = useCallback((next: string[]) => {
    setDrugHistory(next);
    if (currentPatientId) void patientsApi.update(currentPatientId, { drugHistory: next }).catch(() => {});
  }, [currentPatientId]);

  // ⚕️ Live mirror — every medicine on TODAY'S ℞ pad shows up in Drug history →
  // "Current medications" as it is written, and is still there, as Distant past,
  // on the next visit. Physician's decision, 2026-09-07 (live on every change,
  // not deferred to "Save & print").
  //
  // Until this existed the ℞ pad and Drug history were two lists that never
  // spoke: "Current medications" held only what the doctor re-typed into the
  // modal by hand, so a patient prescribed Napa today still read "0 current".
  //
  // Four properties are what make writing into a clinical list from a keystroke
  // safe. Do not drop one to simplify this:
  //  • it only ever withdraws entries THIS mirror added — `rxDerivedRef` is the
  //    record of what it contributed last time — so a medication the doctor
  //    typed into the modal by hand can never be deleted by editing the ℞;
  //  • it echoes the pad verbatim and completes nothing (see rxDrugHistory.ts);
  //  • it is idempotent, so it settles instead of oscillating, and the
  //    `sameEntries` guard means an unchanged ℞ costs no render;
  //  • it never persists by itself. `Patient.drugHistory` keeps exactly the
  //    writers it already had — "Save & print" (savePrescription) and the
  //    modal's Done (saveDrugHistory) — while the debounced editor auto-save
  //    carries it inside `incompleteRx`, so a parked or reloaded visit keeps
  //    it. One writer per field, and no new race against the patient fetch.
  //
  // Known and intended: deleting an ℞-mirrored row inside the Drug-history modal
  // does not stick, because the medicine is still on today's prescription — the
  // ℞ pad owns its own lines. Remove it from the pad instead.
  const rxDerivedRef = useRef<{ pid: string | null; entries: string[] }>({ pid: null, entries: [] });
  useEffect(() => {
    // An unsaved patient has no stored history to lose. A saved one must have
    // had their own list hydrated first, or we would be mirroring onto a blank.
    if (currentPatientId && drugHistoryHydratedRef.current !== currentPatientId) return;
    const nextDerived = rxDrugHistoryEntries(rxItems, isoToDdmmyyyy(ptDate));
    // A pad belonging to a DIFFERENT patient says nothing about this one's list:
    // forget it rather than withdraw an entry from a stranger's record.
    const prevDerived = rxDerivedRef.current.pid === currentPatientId ? rxDerivedRef.current.entries : [];
    rxDerivedRef.current = { pid: currentPatientId, entries: nextDerived };
    const merged = syncRxDrugHistory(drugHistory, prevDerived, nextDerived);
    if (!sameEntries(merged, drugHistory)) setDrugHistory(merged);
  }, [rxItems, ptDate, currentPatientId, drugHistory]);

  // "Add" on the records page opens the investigation popup in SUMMARY mode:
  // whatever is entered goes only to the patient's investigation history, not
  // the current prescription. We snapshot the editor's findings, let the popup
  // write as usual, then on close move the additions to the summary and restore.
  const [invSummaryMode, setInvSummaryMode] = useState(false);
  const invSnapshotRef = useRef<string[]>([]);
  const openInvForSummary = useCallback(() => {
    invSnapshotRef.current = [...investigation];
    setInvSummaryMode(true);
    setShowInvPopup(true);
  }, [investigation]);
  useEffect(() => {
    if (showInvPopup || !invSummaryMode) return; // only act when it CLOSES in summary mode
    const additions = investigation.filter((e) => !invSnapshotRef.current.includes(e));
    const parsed = parseInvestigationEntries(additions);
    if (parsed.length) saveInvestigationSummary(mergeFindings(investigationSummary, parsed));
    setInvestigation(invSnapshotRef.current); // keep the prescription untouched
    setInvSummaryMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInvPopup]);

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
    // On a FRESH login: blank & gated (mobile-first — enter a number first), and
    // clear the stored draft. On a plain page RELOAD (no login): restore the
    // draft so the loaded patient + editor survive the refresh.
    const fresh = typeof window !== "undefined" && window.sessionStorage.getItem("mhs_fresh_login") === "1";
    if (fresh) {
      window.sessionStorage.removeItem("mhs_fresh_login");
      resetEditor();
      setCurrentPatientId(null);
      void prescriptionDraftApi.save({}).catch(() => {});
      draftReadyRef.current = true;
      return;
    }

    let cancelled = false;
    prescriptionDraftApi
      .get()
      .then(async (res) => {
        if (cancelled) return;
        const d = (res.data ?? {}) as Record<string, unknown>;
        const pid = typeof d.currentPatientId === "string" ? d.currentPatientId : null;
        // Guard: if the draft points at a SUPERVISED patient (another doctor's),
        // never restore its editor content — that would resurrect the owner's
        // prescription. Reload the patient fresh instead (blank Rx, header only).
        if (pid) {
          try {
            const p = await patientsApi.get(pid);
            const me = authIdRef.current;
            if (p.doctorId && me && p.doctorId !== me && !cancelled) {
              loadPatient(p); // sets supervisedRef and gives a fresh Rx
              return;
            }
          } catch { /* patient unreachable in own context — restore as before */ }
        }
        if (cancelled) return;
        supervisedRef.current = false; // own patient (or none) — normal restore
        applyEditorSnapshot(d);
        if (pid) { drugHistoryHydratedRef.current = pid; setCurrentPatientId(pid); }
      })
      .catch((e) => console.warn("[draft] load failed — editor will not restore on reload:", e))
      .finally(() => { if (!cancelled) draftReadyRef.current = true; });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // True once the editor holds real prescription work (any clinical detail or a
  // medicine) — distinguishes a started-but-unprinted visit from an empty one.
  const hasRxContent =
    rxItems.length > 0 ||
    [chiefComplaints, previousComplaints, history, investigation, drugHistory,
      onExamination, note, plan, provisionalDiagnosis, associatedIllness, finalDiagnosis,
      advice, adviceTest].some((a) => a.length > 0);

  // Auto-save the live editor to the server (debounced) on any change. While a
  // patient is loaded with real content, also persist it as that patient's
  // incomplete (not-yet-printed) prescription and flag them "Incomplete" in OPD.
  useEffect(() => {
    if (!draftReadyRef.current) return;
    const snapshot: Record<string, unknown> = {
      ptName, ptAge, ptGender, ptAddress, ptWeight, ptDate, ptPhone, ptHospitalId,
      chiefComplaints, previousComplaints, history, investigation, drugHistory,
      onExamination, note, plan, provisionalDiagnosis, associatedIllness, finalDiagnosis,
      rxItems, advice, adviceTest, followUpNum, followUpUnit, followUpMandatory,
      hideDrugHistory,
      invImages, oeData, currentPatientId,
      hiddenInvestigation,
    };
    // Keep the latest snapshot available for a synchronous flush on switch.
    pendingDraftRef.current = { snapshot, pid: currentPatientId, supervised: supervisedRef.current, hasRx: hasRxContent };
    const t = setTimeout(() => {
      void prescriptionDraftApi.save(snapshot).catch((e) => console.warn("[draft] save failed:", e));
      // A supervising doctor's edits go only to their own per-user draft above —
      // never into the owner's shared Patient.incompleteRx or their OPD queue.
      if (!supervisedRef.current && currentPatientId && hasRxContent && rxCompletedRef.current !== currentPatientId) {
        const pid = currentPatientId;
        void patientsApi.update(pid, { incompleteRx: snapshot }).catch(() => {});
        if (rxFlaggedRef.current !== pid) {
          rxFlaggedRef.current = pid;
          void opdApi.setRxStatus({
            patientId: pid, rxStatus: "incomplete",
            name: ptName.trim() || undefined, phone: ptPhone || undefined,
            age: ptAge ? Number(ptAge) : undefined, gender: ptGender || undefined,
          }).then(() => queryClient.invalidateQueries({ queryKey: ["opd"] })).catch(() => {});
        }
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [
    hasRxContent,
    ptName, ptAge, ptGender, ptAddress, ptWeight, ptDate, ptPhone, ptHospitalId,
    chiefComplaints, previousComplaints, history, investigation, drugHistory,
    onExamination, note, plan, provisionalDiagnosis, associatedIllness, finalDiagnosis,
    rxItems, advice, adviceTest, followUpNum, followUpUnit, followUpMandatory,
    hideDrugHistory,
    invImages, oeData, currentPatientId,
    hiddenInvestigation,
  ]);

  // "Save to complete later" — the doctor-initiated twin of the auto-save above, for a visit
  // that has to be parked (patient fetching a report, next one already waiting).
  // Two things it does that the background write deliberately does not:
  //   • it is AWAITED and its outcome is shown. The editor is cleared only after
  //     the server confirms, so a failed save can never look like a saved one.
  //     On failure nothing is touched — the doctor still has every value.
  //   • it flags OPD unconditionally. flushEditorDraft doesn't, so a patient
  //     typed-into and left within the 1200 ms debounce could end up with stored
  //     work and no Incomplete badge to find it by.
  const saveDraftNow = useCallback(async (): Promise<boolean> => {
    const p = pendingDraftRef.current;
    if (!draftReadyRef.current || !p || !p.pid || !p.hasRx) {
      setSavedMsg("Add a medicine or some clinical detail before saving.");
      setTimeout(() => setSavedMsg(""), 3000);
      return false;
    }
    const pid = p.pid;
    try {
      await prescriptionDraftApi.save(p.snapshot);
      // A supervising doctor's draft stays in their own per-user draft only —
      // never the owner's shared incompleteRx, never the owner's OPD queue.
      if (!p.supervised && rxCompletedRef.current !== pid) {
        await patientsApi.update(pid, { incompleteRx: p.snapshot });
        await opdApi.setRxStatus({
          patientId: pid, rxStatus: "incomplete",
          name: ptName.trim() || undefined, phone: ptPhone || undefined,
          age: ptAge ? Number(ptAge) : undefined, gender: ptGender || undefined,
        });
        rxFlaggedRef.current = pid;
        void queryClient.invalidateQueries({ queryKey: ["opd"] });
      }
    } catch (e) {
      setSavedMsg(e instanceof ApiError ? `Draft NOT saved: ${e.message}` : "Draft NOT saved. Is the API running?");
      setTimeout(() => setSavedMsg(""), 5000);
      return false;                    // editor left intact — nothing is lost
    }
    resetEditor();
    setCurrentPatientId(null);
    setSavedMsg("Draft saved — you can complete it later.");
    setTimeout(() => setSavedMsg(""), 3000);
    return true;
  }, [resetEditor, ptName, ptPhone, ptAge, ptGender]);

  // ── Device mirroring (real-time multi-device sync, primary only) ──────────
  // A serialisable snapshot of the mirrorable app state (navigation + the
  // prescription editor + the loaded patient) that gets pushed to the user's
  // other devices, and applied here when one of them changes.
  const [mirrorOn, setMirrorOn] = useState(false);
  const [mirrorConnId, setMirrorConnId] = useState<string | null>(null);
  const mirrorApplyingRef = useRef(false);

  const mirrorSnapshot = useMemo(() => ({
    activeTab, view, ptSettingsTab, currentPatientId,
    // Carry the supervised flag so the receiving device gates the incompleteRx/
    // OPD auto-save the same way (recomputed alongside currentPatientId).
    supervised: supervisedRef.current,
    ptName, ptAge, ptGender, ptAddress, ptWeight, ptDate, ptPhone, ptHospitalId,
    chiefComplaints, previousComplaints, history, investigation, drugHistory,
    onExamination, note, plan, provisionalDiagnosis, associatedIllness, finalDiagnosis,
    rxItems, advice, adviceTest, followUpNum, followUpUnit, followUpMandatory,
    hideDrugHistory,
    invImages, oeData,
    hiddenInvestigation,
    // Patient settings: the info form, its Edit/locked state, family tree
    ptInfo, ptEditing, familyMembers, showFamilyForm, familyRelation, familyForm,
    // Popups / pickers, so opening one shows up on the other device too
    showOePopup, showInvPopup, invActiveCat, invFormData, invSearch,
    showDrugPicker, drugSearch,
  }), [
    activeTab, view, ptSettingsTab, currentPatientId,
    ptName, ptAge, ptGender, ptAddress, ptWeight, ptDate, ptPhone, ptHospitalId,
    chiefComplaints, previousComplaints, history, investigation, drugHistory,
    onExamination, note, plan, provisionalDiagnosis, associatedIllness, finalDiagnosis,
    rxItems, advice, adviceTest, followUpNum, followUpUnit, followUpMandatory,
    hideDrugHistory,
    invImages, oeData,
    hiddenInvestigation,
    ptInfo, ptEditing, familyMembers, showFamilyForm, familyRelation, familyForm,
    showOePopup, showInvPopup, invActiveCat, invFormData, invSearch,
    showDrugPicker, drugSearch,
  ]);

  // Apply a snapshot received from another device. Guarded so applying it
  // doesn't immediately re-publish (echo).
  const applyMirrorSnapshot = useCallback((d: Record<string, unknown>) => {
    mirrorApplyingRef.current = true;
    const str = (k: string, set: (v: string) => void) => { if (typeof d[k] === "string") set(d[k] as string); };
    const arr = (k: string, set: (v: string[]) => void) => { if (Array.isArray(d[k])) set(d[k] as string[]); };
    if (typeof d.activeTab === "string") setActiveTab(d.activeTab as TabId);
    if (d.view === "desktop" || d.view === "mobile") setView(d.view);
    if (typeof d.ptSettingsTab === "string") setPtSettingsTab(d.ptSettingsTab as string);
    setCurrentPatientId(typeof d.currentPatientId === "string" ? d.currentPatientId : null);
    // Keep supervisedRef consistent with the peer device so this device's
    // auto-save doesn't write the owner's incompleteRx / flag OPD for a
    // mirror-applied supervised patient (finding: stale supervised flag).
    supervisedRef.current = d.supervised === true;
    str("ptName", setPtName); str("ptAge", setPtAge); str("ptGender", setPtGender);
    str("ptAddress", setPtAddress); str("ptWeight", setPtWeight);
    // Same stale-date guard as applyEditorSnapshot: a secondary device joining
    // before the primary's first auto-save might receive a pre-advance snapshot.
    str("ptDate", (v) => { const today = todayISO(); setPtDate(v < today ? today : v); });
    str("ptPhone", setPtPhone); str("ptHospitalId", setPtHospitalId);
    arr("chiefComplaints", setChiefComplaints); arr("previousComplaints", setPreviousComplaints);
    arr("history", setHistory); arr("investigation", setInvestigation);
    arr("hiddenInvestigation", setHiddenInvestigation);
    arr("drugHistory", setDrugHistory); arr("onExamination", setOnExamination);
    arr("note", setNote); arr("plan", setPlan); arr("provisionalDiagnosis", setProvisionalDiagnosis);
    arr("associatedIllness", setAssociatedIllness); arr("finalDiagnosis", setFinalDiagnosis);
    arr("advice", setAdvice); arr("adviceTest", setAdviceTest);
    if (Array.isArray(d.rxItems)) setRxItems(d.rxItems as RxItem[]);
    str("followUpNum", setFollowUpNum); str("followUpUnit", setFollowUpUnit);
    if (typeof d.followUpMandatory === "boolean") setFollowUpMandatory(d.followUpMandatory);
    if (typeof d.hideDrugHistory === "boolean") setHideDrugHistory(d.hideDrugHistory);
    if (d.invImages && typeof d.invImages === "object") setInvImages(d.invImages as Record<string, string>);
    if (d.oeData && typeof d.oeData === "object") setOeData(d.oeData as OeData);
    // Patient settings form + family tree
    if (d.ptInfo && typeof d.ptInfo === "object") setPtInfo(d.ptInfo as PtInfo);
    if (typeof d.ptEditing === "boolean") setPtEditing(d.ptEditing);
    if (Array.isArray(d.familyMembers)) setFamilyMembers(d.familyMembers as FamilyMember[]);
    if (typeof d.showFamilyForm === "boolean") setShowFamilyForm(d.showFamilyForm);
    str("familyRelation", setFamilyRelation);
    if (d.familyForm && typeof d.familyForm === "object") setFamilyForm(d.familyForm as FamilyForm);
    // Popups / pickers
    if (typeof d.showOePopup === "boolean") setShowOePopup(d.showOePopup);
    if (typeof d.showInvPopup === "boolean") setShowInvPopup(d.showInvPopup);
    str("invActiveCat", setInvActiveCat); str("invSearch", setInvSearch);
    if (d.invFormData && typeof d.invFormData === "object") setInvFormData(d.invFormData as Record<string, string>);
    if (typeof d.showDrugPicker === "boolean") setShowDrugPicker(d.showDrugPicker);
    str("drugSearch", setDrugSearch);
    // Release the echo guard after the batched state settles.
    setTimeout(() => { mirrorApplyingRef.current = false; }, 300);
  }, [setActiveTab]);

  // Loading/clearing a patient re-locks the settings form — unless the change
  // came from a mirror snapshot, which carries its own ptEditing.
  useEffect(() => {
    if (mirrorApplyingRef.current) return;
    setPtEditing(!currentPatientId);
  }, [currentPatientId]);

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
    note, plan, provisionalDiagnosis, associatedIllness, finalDiagnosis,
  };

  const leftFields: LeftField[] = [
    { label: "Chief complaints", items: chiefComplaints, set: setChiefComplaints },
    { label: "Previous complaints", items: previousComplaints, set: setPreviousComplaints },
    { label: "History", items: history, set: setHistory },
    { label: "Investigation report findings", items: investigation, set: setInvestigation, sugKey: "Investigation report findings" },
    { label: "Drug history", items: drugHistory, set: setDrugHistory },
    { label: "On examination", items: onExamination, set: setOnExamination },
    // ⚕️ One field until 2026-09-07, then two at the physician's request. Both
    // still carry the ONE permission key the combined field had (`rx.note`), and
    // they say so explicitly: "Plan" is also the IPD sheet's label, which is
    // deliberately not gated by any assistant key, so a label lookup would take
    // the IPD field away from assistants who can edit it today.
    { label: "Note", items: note, set: setNote, permKey: "rx.note" },
    { label: "Plan", items: plan, set: setPlan, permKey: "rx.note" },
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
    hiddenInvestigation, setHiddenInvestigation,
    hideDrugHistory, setHideDrugHistory,
    drugHistory, setDrugHistory, onExamination, setOnExamination, note, setNote, plan, setPlan,
    provisionalDiagnosis, setProvisionalDiagnosis, associatedIllness, setAssociatedIllness,
    finalDiagnosis, setFinalDiagnosis,
    rxItems, setRxItems, advice, setAdvice, adviceTest, setAdviceTest,
    activeTemplate, setActiveTemplate, showDrugPicker, setShowDrugPicker, drugSearch, setDrugSearch,
    savedMsg, setSavedMsg, followUpNum, setFollowUpNum, followUpUnit, setFollowUpUnit,
    followUpMandatory, setFollowUpMandatory,
    showInvPopup, setShowInvPopup, invActiveCat, setInvActiveCat, invFormData, setInvFormData,
    calDate, setCalDate, showMonthPicker, setShowMonthPicker, invSearch, setInvSearch,
    invImages, setInvImages,
    rxImages, setRxImages, reportImages, setReportImages, saveRxImages,
    claimRxSnapshot, releaseRxSnapshot, saveRxSnapshot, saveReportImages, imageThumbs,
    ignoredAlerts, ignoreAlert,
    showOePopup, setShowOePopup, ptSettingsTab, setPtSettingsTab, familyMembers, setFamilyMembers, saveFamilyMembers,
    investigationSummary, setInvestigationSummary, saveInvestigationSummary, openInvForSummary,
    onExaminationSummary, setOnExaminationSummary, saveOnExaminationSummary,
    saveDrugHistory,
    showFamilyForm, setShowFamilyForm, familyRelation, setFamilyRelation, familyForm, setFamilyForm,
    ptInfo, setPtInfo, ptEditing, setPtEditing, currentPatientId, setCurrentPatientId,
    eventsPatient, setEventsPatient, eventMsg, setEventMsg, rcQuery, setRcQuery,
    rcFilter, setRcFilter, rcSelected, setRcSelected, watchPatient, setWatchPatient,
    hmDrugs, setHmDrugs, oeData, setOeData,
    // handlers + derived
    handleLogin, addDrug, removeDrug, updateRx, loadTemplate, savePrescription, toggleWatch,
    resetEditor, flushEditorDraft, saveDraftNow, hasRxContent, loadPatient, loadPatientById, filteredDrugs, monthlyCost, allFieldValues, leftFields,
    activeWorkstation, activeWorkstationId, showWorkstations, setShowWorkstations, selectWorkstation,
    can, canEditLabel, isAssistantMode,
    // device mirroring
    mirrorOn, setMirrorOn, mirrorConnId, setMirrorConnId, mirrorSnapshot, applyMirrorSnapshot, mirrorApplyingRef,
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
