"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { INV_CATS } from "@/data/investigations";
import type { InvTest } from "@/types";
import { uploadImage } from "@/lib/api";
import { parseFlexibleDate } from "@/lib/dateInput";
import CalcRenderer from "./CalcRenderer";
import { useActivityLog } from "@/hooks/useActivity";
import { useInvestigationPrefs } from "@/hooks/useInvestigationPrefs";

const VALUE_LABELS = ["Value", "Result", "Report", "Finding", "Score", "Status", "Grade"];

export default function InvestigationPopup() {
  const {
    showInvPopup, setShowInvPopup, calDate, setCalDate, showMonthPicker, setShowMonthPicker,
    invSearch, setInvSearch, invActiveCat, setInvActiveCat, invFormData, setInvFormData,
    investigation, setInvestigation, invImages, setInvImages,
    reportImages: galleryReportImages, saveReportImages,
  } = useMuqsit();

  // Mirror investigation adds into the activity feed (Notification, Charts &
  // Reports), like the other clinical-assessment sections do.
  const logActivity = useActivityLog();
  const logInv = (detail: string, imageUrl?: string) =>
    logActivity("Investigation report findings", detail, "added", imageUrl);

  // The "Favourite" category is built from the doctor's saved favourites
  // (Settings → Favourite & unit settings), looked up across all categories.
  const { favourites, unitPrefs } = useInvestigationPrefs();
  const favTests = (() => {
    const all = INV_CATS.flatMap((c) => c.tests);
    return favourites.map((n) => all.find((t) => t.name === n)).filter((t): t is NonNullable<typeof t> => !!t);
  })();
  const activeTests = invActiveCat === "Favourite"
    ? favTests
    : (INV_CATS.find((c) => c.cat === invActiveCat)?.tests ?? []);

  // Index of the report image currently shown in the left-side viewer + its zoom.
  const [reportIdx, setReportIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [showReports, setShowReports] = useState(true);
  // Inline edit of an added result (keyed by the result string).
  const [editItem, setEditItem] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  // Drag-to-tag: which test card is the report image currently hovering over.
  const [dropTest, setDropTest] = useState<string | null>(null);

  // Jump-to-test from a search result: clicking a chip switches category and
  // then scrolls that test card into view + briefly flashes it. Refs are keyed
  // by test name (unique within the rendered category); the nonce re-fires the
  // scroll effect even when the clicked test is already in the active category.
  const testRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollTargetRef = useRef<string | null>(null);
  const [scrollNonce, setScrollNonce] = useState(0);
  const [flashTest, setFlashTest] = useState<string | null>(null);

  useEffect(() => {
    const target = scrollTargetRef.current;
    if (!target) return;

    // Center the target card inside its scroll container and focus its first
    // field. We measure against the container directly (getBoundingClientRect)
    // rather than scrollIntoView, because when the category was just switched
    // the long list isn't laid out yet at the first frame and scrollIntoView
    // lands short. Two rAFs let layout settle before we measure.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const card = testRefs.current[target];
        const container = card?.parentElement;
        if (!card || !container) return;
        const cRect = container.getBoundingClientRect();
        const kRect = card.getBoundingClientRect();
        const delta = (kRect.top - cRect.top) - (container.clientHeight - card.clientHeight) / 2;
        container.scrollBy({ top: delta, behavior: "smooth" });
        card.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true });
      });
    });
    const clear = setTimeout(() => setFlashTest(null), 1600);
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); clearTimeout(clear); };
  }, [scrollNonce]);

  const jumpToTest = (cat: string, test: string) => {
    setInvActiveCat(cat);
    setInvSearch("");
    scrollTargetRef.current = test;
    setFlashTest(test);
    setScrollNonce((n) => n + 1);
  };

  // Drag-to-pan the (zoomed) report image: hold left mouse and move.
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const onPanStart = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    el.style.cursor = "grabbing";
    e.preventDefault();
  };
  const onPanMove = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el || !dragRef.current) return;
    el.scrollLeft = dragRef.current.sl - (e.clientX - dragRef.current.x);
    el.scrollTop = dragRef.current.st - (e.clientY - dragRef.current.y);
  };
  const onPanEnd = () => {
    dragRef.current = null;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  };

  // Format date as string for display
  const formatCalDate = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return dd + "/" + mm + "/" + yyyy;
  };

  // Pool entries are "dd/mm/yyyy:Report N:[image attached]" — uploaded images
  // tagged to the date they were added on, but still shown in the viewer for
  // every date (a staging pool). Distinguished from real test images by the
  // "Report N" middle segment. They get re-tagged to a test on data entry.
  const isPoolEntry = (it: string) => /:Report \d+:\[image attached\]$/.test(it);

  // Bulk-add report images into the pool, tagged to the selected date. Each file
  // is uploaded to the server and stored as a hosted URL (not base64) so it
  // persists in the draft cheaply and can be shown in the notification feed.
  const addReportImages = async (files: FileList) => {
    const dateStr = formatCalDate(calDate);
    const maxIdx = investigation.reduce((mx, it) => {
      const m = it.match(/:Report (\d+):\[image attached\]$/);
      return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
    }, 0);
    const arr = Array.from(files);
    const uploaded: string[] = [];
    for (let i = 0; i < arr.length; i++) {
      try {
        const url = await uploadImage(arr[i]);
        uploaded.push(url);
        const num = maxIdx + i + 1;
        const imgKey = dateStr + ":Report " + num;
        setInvImages((prev) => ({ ...prev, [imgKey]: url }));
        const entry = imgKey + ":[image attached]";
        setInvestigation((prev) => (prev.indexOf(entry) === -1 ? prev.concat([entry]) : prev));
        // Every uploaded report is saved server-side and shown in the
        // notification feed with a clickable link — no matter how many.
        logInv(`Report ${num} (${dateStr})`, url);
      } catch (e) {
        console.warn("[investigation] report image upload failed:", e);
      }
    }
    // Also surface every uploaded report in the patient's "All reports" gallery
    // on the records page (deduped against what's already there).
    if (uploaded.length) {
      const fresh = uploaded.filter((u) => !galleryReportImages.includes(u));
      if (fresh.length) saveReportImages([...galleryReportImages, ...fresh]);
    }
  };

  // The image to attach to a test result: one uploaded straight onto the test,
  // else the report image CURRENTLY OPEN in the left viewer (so each result links
  // to the report the doctor is actually looking at — not always the first one).
  // Returns the URL, and links it so the finding shows the 📎.
  const resolveTestImage = (testName: string): string | undefined => {
    const dateStr = formatCalDate(calDate);
    const direct = invImages[dateStr + ":" + testName];
    if (direct) return direct;
    const pool = investigation.filter(isPoolEntry);
    if (pool.length === 0) return undefined;
    const idx = Math.min(reportIdx, pool.length - 1);
    const url = invImages[pool[idx].replace(":[image attached]", "")];
    if (!url) return undefined;
    const targetKey = dateStr + ":" + testName;
    setInvImages((prev) => (prev[targetKey] ? prev : { ...prev, [targetKey]: url }));
    setInvestigation((prev) => {
      const te = targetKey + ":[image attached]";
      return prev.includes(te) ? prev : prev.concat([te]);
    });
    return url;
  };

  // ── Shared result-entry helpers (used by single-test add, calc, normal and
  // the bulk auto-save) — one place for the form→findings string protocol. ──

  // Collect a test's filled-in fields into display parts, e.g.
  // ["Hb:13.5g/dL", "12000"]. Returns [] when nothing was entered. For dual-unit
  // fields, the doctor's preferred unit (Settings → Favourite & unit settings)
  // decides which value/label is recorded.
  const collectTestParts = (test: InvTest): string[] =>
    (test.fields || [])
      .map((f) => {
        const preferU2 = f.u2 ? unitPrefs[test.name + "__" + f.l] === "u2" : false;
        const val = invFormData[test.name + "__" + f.l + (preferU2 ? "_u2" : "")];
        if (!val) return null;
        const unit = preferU2 ? (f.u2 ?? "") : (f.u1 ?? "");
        const label = VALUE_LABELS.includes(f.l) ? "" : f.l + ":";
        return label + val + unit;
      })
      .filter((p): p is string => Boolean(p));

  // Clear a test's entry fields (value + secondary-unit) after it's saved.
  const clearTestFields = (test: InvTest) =>
    (test.fields || []).forEach((f) => {
      const key = test.name + "__" + f.l;
      const key2 = key + "_u2";
      setInvFormData((prev) => { const copy = { ...prev }; delete copy[key]; delete copy[key2]; return copy; });
    });

  // Append a "dd/mm/yyyy:Test:..." findings line if not already present and
  // mirror it to the activity feed. Functional update — safe under batching.
  const commitResult = (result: string, logText?: string) => {
    if (investigation.includes(result)) return;
    setInvestigation((prev) => (prev.includes(result) ? prev : prev.concat([result])));
    if (logText) logInv(logText);
  };

  // Auto-save current form data to the current calDate before changing date or
  // closing the popup. Each newly-committed finding is logged to the activity
  // feed too — `commitResult` only logs genuinely-new entries, so navigating
  // dates never re-logs an existing finding.
  const autoSaveInvData = () => {
    const dateStr = formatCalDate(calDate);
    let savedAny = false;
    INV_CATS.flatMap((c) => c.tests).forEach((test) => {
      const parts = collectTestParts(test);
      if (parts.length === 0) return;
      savedAny = true;
      resolveTestImage(test.name); // link the open report to this finding (📎)
      commitResult(dateStr + ":" + test.name + ":" + parts.join(","), test.name + ": " + parts.join(", "));
      clearTestFields(test);
    });
    return savedAny;
  };

  const handleInvFieldChange = (testName: string, fLabel: string, value: string) => {
    const key = testName + "__" + fLabel;
    setInvFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Change calendar date — auto-save any pending data first
  const handleCalDateChange = (newDate: Date) => {
    autoSaveInvData();
    setCalDate(newDate);
  };

  // Add a single test's entered results for the selected date.
  const addInvResult = (testName: string) => {
    const test = INV_CATS.flatMap((c) => c.tests).find((t) => t.name === testName);
    if (!test) return;
    const parts = collectTestParts(test);
    if (parts.length === 0) return;
    // Attach the open report image to this finding so it shows the 📎 link.
    // (The image's own notification entry is logged when it's uploaded.)
    resolveTestImage(testName);
    commitResult(formatCalDate(calDate) + ":" + testName + ":" + parts.join(","), testName + ": " + parts.join(", "));
    clearTestFields(test);
  };

  // Push a computed score-calculator result for the selected date.
  const addCalcResult = (testName: string, summary: string) =>
    commitResult(formatCalDate(calDate) + ":" + testName + ":" + summary, testName + ": " + summary);

  const addInvNormal = (testName: string) => {
    resolveTestImage(testName);
    commitResult(formatCalDate(calDate) + ":" + testName + ":normal", testName + ": normal");
  };

  // Auto-save when popup closes
  const handleCloseInvPopup = () => {
    autoSaveInvData();
    setShowInvPopup(false);
  };

  if (!showInvPopup) return null;

  const today = new Date();
  const y = calDate.getFullYear();
  const m = calDate.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // The 1st always sits in the leftmost column; the weekday headers rotate so
  // each column still shows the correct day of the week.
  const rotatedDays = days.slice(firstDay).concat(days.slice(0, firstDay));
  const cells: (number | null)[] = [];
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const shiftMonth = (offset: number) => { handleCalDateChange(new Date(y, m + offset, 1)); };
  const shiftYear = (offset: number) => { handleCalDateChange(new Date(y + offset, m, 1)); };
  const isToday = (day: number | null) => !!day && today.getFullYear() === y && today.getMonth() === m && today.getDate() === day;
  const isSel = (day: number | null) => !!day && calDate.getDate() === day;

  const navLeft = [
    { l: "-1Y", fn: () => shiftYear(-1), c: C.danger },
    { l: "-6M", fn: () => shiftMonth(-6), c: C.warn },
    { l: "-3M", fn: () => shiftMonth(-3), c: C.warn },
    { l: "-2M", fn: () => shiftMonth(-2), c: C.info },
    { l: "-1M", fn: () => shiftMonth(-1), c: C.info },
  ];
  const navRight = [
    { l: "+1M", fn: () => shiftMonth(1), c: C.info },
    { l: "+2M", fn: () => shiftMonth(2), c: C.info },
    { l: "+3M", fn: () => shiftMonth(3), c: C.warn },
    { l: "+6M", fn: () => shiftMonth(6), c: C.warn },
    { l: "+1Y", fn: () => shiftYear(1), c: C.danger },
  ];

  const inp: CSSProperties = { width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 12, border: "0.5px solid " + C.n[200], outline: "none", background: C.n[0], color: C.n[900], fontFamily: "inherit", boxSizing: "border-box" };

  const searchResults: { cat: string; test: string }[] = [];
  if (invSearch) {
    INV_CATS.forEach((cat) => {
      cat.tests.forEach((test) => {
        if (test.name.toLowerCase().indexOf(invSearch.toLowerCase()) >= 0) {
          searchResults.push({ cat: cat.cat, test: test.name });
        }
      });
    });
  }

  // Uploaded report images (date-independent pool) shown in the left viewer.
  const reportImages = investigation.filter(isPoolEntry);
  const repIdx = Math.min(reportIdx, Math.max(0, reportImages.length - 1));
  // Added (text) results — shown in a right-side panel; the popup widens to fit.
  const textResults = investigation.filter((it) => it.indexOf("[image attached]") < 0);
  const modalWidth = (reportImages.length > 0 && showReports ? 1500 : 860) + (textResults.length > 0 ? 320 : 0);
  const navBtn = (disabled: boolean): CSSProperties => ({
    padding: "4px 10px", borderRadius: 6, fontSize: 11, fontFamily: "inherit",
    border: `0.5px solid ${C.n[200]}`, background: C.n[0],
    color: disabled ? C.n[300] : C.pri[600], cursor: disabled ? "default" : "pointer",
  });
  const zoomBtn: CSSProperties = { width: 22, height: 22, border: "none", background: "transparent", color: "#fff", cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1000, overflow: "auto" }}
      onClick={handleCloseInvPopup}>
      <div onClick={(e) => e.stopPropagation()} className="invModal" style={{ width: modalWidth, maxWidth: "100%", height: reportImages.length > 0 && showReports ? "85vh" : undefined, maxHeight: "85vh", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: "0 16px 48px rgba(0,0,0,0.15)", display: "flex", flexDirection: "row", overflow: "hidden", minHeight: 0 }}>
        <style>{`
          @media (max-width: 820px) {
            .invModal { flex-direction: column !important; width: 100% !important; }
            .invReports { width: 100% !important; flex-shrink: 1 !important; max-height: 38vh; border-right: none !important; border-bottom: 0.5px solid ${C.n[200]}; }
            .invBody { flex-direction: column !important; overflow-y: auto !important; }
            .invSidebar { width: 100% !important; max-height: 150px; flex-shrink: 1 !important; border-right: none !important; border-bottom: 0.5px solid ${C.n[200]}; }
            .invResults { width: 100% !important; flex-shrink: 1 !important; border-left: none !important; border-top: 0.5px solid ${C.n[200]}; }
          }
        `}</style>

        {/* Left reports pane — half-screen viewer shown once reports are uploaded */}
        {reportImages.length > 0 && showReports && (() => {
          const entry = reportImages[repIdx];
          const imgKey = entry.replace(":[image attached]", "");
          const pm = imgKey.match(/^(.*):Report (\d+)$/);
          const name = pm ? `Report ${pm[2]} (${pm[1]})` : imgKey;
          return (
            <div className="invReports" style={{ width: "38%", flexShrink: 0, borderRight: `0.5px solid ${C.n[200]}`, background: C.n[50], display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: `0.5px solid ${C.n[200]}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.n[0] }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.n[900] }}>Reports ({reportImages.length})</span>
                <span style={{ fontSize: 11, color: C.n[500], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{name}</span>
              </div>
              <div style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ flex: 1, position: "relative", borderRadius: 8, overflow: "hidden", border: `0.5px solid ${C.n[200]}`, background: C.n[100], minHeight: 0 }}>
                  <div
                    ref={scrollRef}
                    onMouseDown={onPanStart}
                    onMouseMove={onPanMove}
                    onMouseUp={onPanEnd}
                    onMouseLeave={onPanEnd}
                    style={{ position: "absolute", inset: 0, overflow: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", cursor: "grab", userSelect: "none" }}
                  >
                    {invImages[imgKey] && (
                      <img src={invImages[imgKey]} alt={name} draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/mhs-report-image", invImages[imgKey] || ""); e.dataTransfer.effectAllowed = "copy"; }}
                        style={{ width: `${zoom * 100}%`, maxWidth: "none", height: "auto", display: "block", flexShrink: 0, transform: `rotate(${rotation}deg)`, transition: "width 0.12s, transform 0.15s", cursor: "grab" }} />
                    )}
                  </div>
                  {/* Zoom + rotate controls */}
                  <div style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center", gap: 2, background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: 2 }}>
                    <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} title="Zoom out" style={zoomBtn}>−</button>
                    <span style={{ fontSize: 10, color: "#fff", minWidth: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} title="Zoom in" style={zoomBtn}>+</button>
                    <button onClick={() => setZoom(1)} title="Reset zoom" style={{ ...zoomBtn, fontSize: 12 }}>⤢</button>
                    <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.4)" }} />
                    <button onClick={() => setRotation((r) => (r + 270) % 360)} title="Rotate left" style={zoomBtn}>↺</button>
                    <button onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate right" style={zoomBtn}>↻</button>
                    <a href={invImages[imgKey]} target="_blank" rel="noreferrer" title="Open full image" style={{ ...zoomBtn, textDecoration: "none" }}>⤤</a>
                  </div>
                  {invImages[imgKey] && (
                    <div
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/mhs-report-image", invImages[imgKey] || ""); e.dataTransfer.effectAllowed = "copy"; }}
                      title="Drag onto a test's “Add report image” to tag this report there"
                      style={{ position: "absolute", top: 8, right: 8, zIndex: 3, background: C.pri[400], color: "#fff", fontSize: 10.5, fontWeight: 600, padding: "5px 11px", borderRadius: 999, cursor: "grab", boxShadow: "0 2px 8px rgba(0,0,0,0.25)", userSelect: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
                    >⠿ Drag to tag</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                  <button onClick={() => { setReportIdx(Math.max(0, repIdx - 1)); setZoom(1); setRotation(0); }} disabled={repIdx === 0} style={navBtn(repIdx === 0)}>‹ Previous</button>
                  <span style={{ fontSize: 12, color: C.n[600] }}>{repIdx + 1} / {reportImages.length}</span>
                  <button onClick={() => { setReportIdx(Math.min(reportImages.length - 1, repIdx + 1)); setZoom(1); setRotation(0); }} disabled={repIdx === reportImages.length - 1} style={navBtn(repIdx === reportImages.length - 1)}>Next ›</button>
                </div>
                <button onClick={() => { setInvestigation(investigation.filter((it) => it !== entry)); setReportIdx(0); setZoom(1); setRotation(0); }} style={{
                  marginTop: 8, padding: "7px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 11, fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  border: `1px solid ${C.danger[100]}`, background: C.danger[50], color: C.danger[800],
                }}>🗑 Delete this report</button>

                <div style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto", paddingBottom: 4 }}>
                  {reportImages.map((e2, i) => {
                    const k2 = e2.replace(":[image attached]", "");
                    return (
                      <button key={i} onClick={() => { setReportIdx(i); setZoom(1); setRotation(0); }} style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 6, overflow: "hidden", border: `2px solid ${i === repIdx ? C.pri[400] : C.n[200]}`, padding: 0, cursor: "pointer", background: C.n[100] }}>
                        {invImages[k2] && <img src={invImages[k2]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Main column (form side) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, minHeight: 0 }}>

        {/* Header — title + actions (show/hide reports, add images, close) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, rowGap: 8, padding: "12px 20px", borderBottom: `0.5px solid ${C.n[200]}`, background: C.n[50] }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: C.n[900] }}>Investigation report findings</div>
            <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Enter test results — select a category, fill values, and add</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, rowGap: 8 }}>
            {reportImages.length > 0 && (
              <button onClick={() => setShowReports((s) => !s)} style={{
                padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                fontSize: 12, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6,
                border: `1px solid ${showReports ? C.pri[400] : C.n[200]}`,
                background: showReports ? C.pri[50] : C.n[0], color: showReports ? C.pri[600] : C.n[700],
              }}>{showReports ? "🙈 Hide reports" : "👁 Show reports"} ({reportImages.length})</button>
            )}
            <label style={{
              padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
              fontSize: 12, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6,
              border: `1px solid ${C.n[200]}`, background: C.n[0], color: C.n[700],
            }}>
              🖼 Add all reports image
              <input type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={(e) => { if (e.target.files && e.target.files.length) { addReportImages(e.target.files); setReportIdx(0); setShowReports(true); } e.target.value = ""; }} />
            </label>
            <button onClick={handleCloseInvPopup} style={{ width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
          </div>
        </div>

        {/* Calendar */}
        <div style={{ padding: "6px 20px 5px", borderBottom: "0.5px solid " + C.n[200], background: C.n[0] }}>
          <div style={{ maxWidth: 620, margin: "0 auto" }}>
          {/* Type-to-jump date box — DDMMYY (e.g. 060625 → 06/06/2025). */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
            <QuickDateBox onPick={handleCalDateChange} />
          </div>
          {/* Selected date display */}
          <div style={{ textAlign: "center", marginBottom: 5 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: C.pri[600], letterSpacing: "0.02em" }}>{String(calDate.getDate()).padStart(2, "0")}</span>
            <span style={{ fontSize: 12, color: C.n[500], margin: "0 3px" }}>/</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: C.pri[600] }}>{String(calDate.getMonth() + 1).padStart(2, "0")}</span>
            <span style={{ fontSize: 12, color: C.n[500], margin: "0 3px" }}>/</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: C.pri[600] }}>{calDate.getFullYear()}</span>
            <span style={{ fontSize: 10, color: C.n[500], marginLeft: 8 }}>{calDate.toLocaleDateString("en-US", { weekday: "long" })}</span>
          </div>
          {/* Nav row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, rowGap: 6, marginBottom: 5 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, rowGap: 4 }}>
              {navLeft.map((b) => (
                <button key={b.l} onClick={b.fn} style={{ padding: "2px 7px", borderRadius: 4, border: "1px solid " + b.c[400], background: b.c[50], color: b.c[800] || b.c[600], fontSize: 9, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}>{b.l}</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Clickable month with dropdown */}
              <div style={{ position: "relative" }}>
                <span onClick={() => setShowMonthPicker(!showMonthPicker)} style={{ fontSize: 12, fontWeight: 500, color: C.pri[600], cursor: "pointer", padding: "1px 5px", borderRadius: 4, background: showMonthPicker ? C.pri[50] : "transparent" }}>{months[m]}</span>
                {showMonthPicker && (
                  <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 3, background: C.n[0], border: "0.5px solid " + C.n[200], borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 20, width: 110, maxHeight: 180, overflowY: "auto" }}>
                    {months.map((mn, idx) => (
                      <div key={mn} onClick={() => { handleCalDateChange(new Date(y, idx, 1)); setShowMonthPicker(false); }}
                        style={{ padding: "5px 10px", fontSize: 10, cursor: "pointer", fontWeight: idx === m ? 600 : 400, color: idx === m ? C.pri[600] : C.n[800], background: idx === m ? C.pri[50] : "transparent" }}
                        onMouseEnter={(e) => { if (idx !== m) e.currentTarget.style.background = C.n[100]; }}
                        onMouseLeave={(e) => { if (idx !== m) e.currentTarget.style.background = "transparent"; }}
                      >{mn}</div>
                    ))}
                  </div>
                )}
              </div>
              {/* Scrollable year */}
              <span onWheel={(e) => { e.preventDefault(); if (e.deltaY < 0) shiftYear(1); else shiftYear(-1); }}
                style={{ fontSize: 12, fontWeight: 500, color: C.n[900], cursor: "ns-resize", padding: "1px 5px", borderRadius: 4, userSelect: "none" }}
                title="Scroll to change year">{y}</span>
              <button onClick={() => { handleCalDateChange(new Date()); setShowMonthPicker(false); }} style={{ padding: "1px 7px", borderRadius: 4, border: "1px solid " + C.pri[400], background: C.pri[400], color: "#fff", fontSize: 8, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Today</button>
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {navRight.map((b) => (
                <button key={b.l} onClick={b.fn} style={{ padding: "2px 7px", borderRadius: 4, border: "1px solid " + b.c[400], background: b.c[50], color: b.c[800] || b.c[600], fontSize: 9, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}>{b.l}</button>
              ))}
            </div>
          </div>
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0 }}>
            {rotatedDays.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 8, fontWeight: 600, color: C.pri[600], padding: "3px 0", background: C.pri[50], borderRadius: 2 }}>{d}</div>)}
            {cells.map((day, i) => {
              const todayMatch = isToday(day);
              const selected = isSel(day);
              return (
                <div key={i} onClick={() => { if (day) handleCalDateChange(new Date(y, m, day)); }}
                  style={{ textAlign: "center", padding: "3px 0", fontSize: 10, cursor: day ? "pointer" : "default",
                    color: day ? (todayMatch ? "#fff" : C.n[800]) : "transparent",
                    background: todayMatch ? C.pri[400] : (selected && !todayMatch ? C.pri[50] : "transparent"),
                    borderRadius: todayMatch ? 4 : (selected ? 4 : 0),
                    fontWeight: todayMatch ? 600 : 400,
                  }}>{day || ""}</div>
              );
            })}
          </div>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ padding: "6px 20px", borderBottom: "0.5px solid " + C.n[200], background: C.n[50] }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: C.n[500], flexShrink: 0 }}>&#x2315;</span>
            <input value={invSearch} onChange={(e) => setInvSearch(e.target.value)}
              placeholder="Search test name across all categories..."
              style={{ flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 11, border: "0.5px solid " + C.n[200], outline: "none", background: C.n[0], color: C.n[900], fontFamily: "inherit" }} />
            {invSearch && <button onClick={() => setInvSearch("")} style={{ background: "none", border: "none", color: C.n[500], cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>}
          </div>
          {invSearch && (
            searchResults.length === 0 ? (
              <div style={{ fontSize: 10, color: C.n[500], marginTop: 4 }}>No tests found for &quot;{invSearch}&quot;</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {searchResults.slice(0, 12).map((r) => (
                  <button key={r.cat + r.test} onClick={() => jumpToTest(r.cat, r.test)}
                    style={{ padding: "3px 10px", borderRadius: 5, fontSize: 10, cursor: "pointer", border: "0.5px solid " + C.n[200], background: C.n[0], color: C.n[800], fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.pri[50]; e.currentTarget.style.borderColor = C.pri[400]; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = C.n[0]; e.currentTarget.style.borderColor = C.n[200]; }}>
                    <span style={{ fontWeight: 500 }}>{r.test}</span>
                    <span style={{ fontSize: 8, color: C.n[500] }}>{r.cat}</span>
                  </button>
                ))}
                {searchResults.length > 12 && <span style={{ fontSize: 9, color: C.n[500], alignSelf: "center" }}>+{searchResults.length - 12} more</span>}
              </div>
            )
          )}
        </div>

        {/* Body */}
        <div className="invBody" style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
          {/* Category sidebar */}
          <div className="invSidebar" style={{ width: 160, borderRight: `0.5px solid ${C.n[200]}`, padding: "8px 0", overflowY: "auto", flexShrink: 0 }}>
            {INV_CATS.map((c) => (
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
            {invActiveCat === "Favourite" && favTests.length === 0 && (
              <div style={{ fontSize: 12, color: C.n[500], padding: "10px 4px" }}>
                No favourites yet. Add them in Settings → Favourite &amp; unit settings.
              </div>
            )}
            {activeTests.map((test) => (
              <div key={test.name} ref={(el) => { testRefs.current[test.name] = el; }} style={{
                marginBottom: 14, padding: "12px 14px", borderRadius: 8,
                background: flashTest === test.name ? C.pri[50] : C.n[50],
                border: `${flashTest === test.name ? 1.5 : 0.5}px solid ${flashTest === test.name ? C.pri[400] : C.n[200]}`,
                boxShadow: flashTest === test.name ? `0 0 0 3px ${C.pri[100]}` : "none",
                transition: "background 0.3s, border-color 0.3s, box-shadow 0.3s",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.n[900] }}>{test.name}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => addInvNormal(test.name)} style={{
                      padding: "4px 12px", borderRadius: 6, border: `0.5px solid ${C.pri[100]}`,
                      background: C.pri[50], color: C.pri[600], fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                    }}>Normal</button>
                    {(
                      <label
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                        onDragEnter={() => setDropTest(test.name)}
                        onDragLeave={() => setDropTest((t) => (t === test.name ? null : t))}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDropTest(null);
                          const url = e.dataTransfer.getData("text/mhs-report-image");
                          if (!url) return;
                          const dateStr = formatCalDate(calDate);
                          setInvImages((prev) => ({ ...prev, [dateStr + ":" + test.name]: url }));
                          const entry = dateStr + ":" + test.name + ":[image attached]";
                          setInvestigation((prev) => (prev.indexOf(entry) === -1 ? prev.concat([entry]) : prev));
                          logInv(`${test.name} report image (${dateStr})`, url);
                        }}
                        style={{
                        padding: "4px 12px", borderRadius: 6,
                        border: dropTest === test.name ? "2px dashed #fff" : "none",
                        background: dropTest === test.name ? C.pri[600] : C.pri[400], color: "#fff", fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                        display: "inline-flex", alignItems: "center", gap: 4,
                      }}>
                        <span>Add report image</span>
                        <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={async (e) => {
                          const file = e.target.files && e.target.files[0];
                          if (file) {
                            try {
                              const url = await uploadImage(file);
                              const dateStr = formatCalDate(calDate);
                              const imgKey = dateStr + ":" + test.name;
                              setInvImages((prev) => ({ ...prev, [imgKey]: url }));
                              const entry = dateStr + ":" + test.name + ":[image attached]";
                              setInvestigation((prev) => (prev.indexOf(entry) === -1 ? prev.concat([entry]) : prev));
                              logInv(`${test.name} report image (${dateStr})`, url);
                            } catch (err) {
                              console.warn("[investigation] report image upload failed:", err);
                            }
                          }
                          e.target.value = "";
                        }} />
                      </label>
                    )}
                  </div>
                </div>
                {test.calc ? (
                  <CalcRenderer calcId={test.calc} onAdd={(summary) => addCalcResult(test.name, summary)} />
                ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {test.fields.map((f) => {
                    const key1 = test.name + "__" + f.l;
                    const key2 = test.name + "__" + f.l + "_u2";
                    const fieldW = test.fields.length <= 2 ? "1 1 200px" : (f.u2 ? "1 1 200px" : "1 1 100px");

                    if (f.t === "dd") {
                      return (
                        <div key={f.l} style={{ flex: fieldW, minWidth: 0 }}>
                          <div style={{ fontSize: 9, color: C.n[500], textTransform: "uppercase", marginBottom: 3 }}>{f.l}</div>
                          <select value={invFormData[key1] || ""} onChange={(e) => handleInvFieldChange(test.name, f.l, e.target.value)}
                            style={{ ...inp, padding: "6px 4px" }}>
                            <option value="">Select</option>
                            {(f.opts || []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      );
                    }

                    if (f.t === "text") {
                      return (
                        <div key={f.l} style={{ flex: fieldW, minWidth: 0 }}>
                          <div style={{ fontSize: 9, color: C.n[500], textTransform: "uppercase", marginBottom: 3 }}>{f.l}</div>
                          <input value={invFormData[key1] || ""} onChange={(e) => handleInvFieldChange(test.name, f.l, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") addInvResult(test.name); }}
                            placeholder="Enter..." style={inp} />
                        </div>
                      );
                    }

                    // num field — with optional dual unit conversion
                    if (f.u2) {
                      const v1 = invFormData[key1] || "";
                      const v2 = invFormData[key2] || "";
                      return (
                        <div key={f.l} style={{ flex: "1 1 200px", minWidth: 0 }}>
                          <div style={{ fontSize: 9, color: C.n[500], textTransform: "uppercase", marginBottom: 3 }}>{f.l}</div>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <div style={{ flex: 1 }}>
                              <input value={v1} placeholder={f.u1}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  handleInvFieldChange(test.name, f.l, val);
                                  const num = parseFloat(val);
                                  if (!isNaN(num) && f.c12) {
                                    handleInvFieldChange(test.name, f.l + "_u2", (Math.round(num * f.c12 * 100) / 100).toString());
                                  } else {
                                    handleInvFieldChange(test.name, f.l + "_u2", "");
                                  }
                                }}
                                onKeyDown={(e) => { if (e.key === "Enter") addInvResult(test.name); }}
                                style={inp} />
                              <div style={{ fontSize: 8, color: C.n[500], marginTop: 1 }}>{f.u1}</div>
                            </div>
                            <span style={{ fontSize: 10, color: C.n[400], flexShrink: 0 }}>=</span>
                            <div style={{ flex: 1 }}>
                              <input value={v2} placeholder={f.u2}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  handleInvFieldChange(test.name, f.l + "_u2", val);
                                  const num = parseFloat(val);
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
                        <input value={invFormData[key1] || ""} onChange={(e) => handleInvFieldChange(test.name, f.l, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") addInvResult(test.name); }}
                          placeholder={f.u1 || "Value"} style={inp} />
                      </div>
                    );
                  })}
                </div>
                )}
                {/* Previous entries for this test */}
                {(() => {
                  const prevEntries = investigation.filter((item) => {
                    if (item.indexOf("[image attached]") >= 0) return false; // skip image markers
                    const colonIdx = item.indexOf(":");
                    if (colonIdx < 0) return false;
                    const afterDate = item.substring(colonIdx + 1);
                    const secondColon = afterDate.indexOf(":");
                    const testPart = secondColon >= 0 ? afterDate.substring(0, secondColon) : afterDate;
                    return testPart === test.name;
                  });
                  if (prevEntries.length === 0) return null;
                  return (
                    <div style={{ marginTop: 6, borderTop: "0.5px dashed " + C.n[200], paddingTop: 4 }}>
                      {prevEntries.map((entry, ei) => (
                        <div key={ei} style={{ fontSize: 9, color: C.info[800], background: C.info[50], padding: "2px 8px", borderRadius: 3, marginBottom: 2, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          prev: {entry}
                        </div>
                      ))}
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.currentTarget.value.trim()) {
                      const dateStr = formatCalDate(calDate);
                      const text = e.currentTarget.value.trim();
                      setInvestigation([...investigation, dateStr + ":" + text]);
                      logInv(text);
                      e.currentTarget.value = "";
                    }
                  }}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 6, fontSize: 12,
                    border: `0.5px solid ${C.n[200]}`, outline: "none", background: C.n[50],
                    color: C.n[900], fontFamily: "inherit",
                  }} />
                <button onClick={(e) => {
                  const input = e.currentTarget.previousSibling as HTMLInputElement | null;
                  if (input && input.value.trim()) { const dateStr = formatCalDate(calDate); const text = input.value.trim(); setInvestigation([...investigation, dateStr + ":" + text]); logInv(text); input.value = ""; }
                }} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
              </div>
            </div>
          </div>

          {/* Added results — right-side panel */}
          {textResults.length > 0 && (
            <div className="invResults" style={{ width: 290, flexShrink: 0, borderLeft: `0.5px solid ${C.n[200]}`, background: C.n[0], overflowY: "auto", padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.n[700], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Added results ({textResults.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {textResults.map((item, idx) => {
                  const parts = item.split(":");
                  const date = parts[0] || "";
                  const test = parts.length >= 3 ? parts[1] : "";
                  const rawValue = parts.length >= 3 ? parts.slice(2).join(":") : parts.slice(1).join(":");
                  const displayValue = rawValue.replace(/,(?=\S)/g, ", ");
                  const editing = editItem === item;
                  const commitEdit = () => {
                    const v = editVal.trim();
                    if (v) {
                      const next = test ? `${date}:${test}:${v}` : `${date}:${v}`;
                      setInvestigation(investigation.map((x) => (x === item ? next : x)));
                    }
                    setEditItem(null);
                  };
                  return (
                    <div key={idx} style={{ background: C.n[0], border: `0.5px solid ${editing ? C.pri[400] : C.n[200]}`, borderRadius: 7, padding: "9px 11px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontSize: 12, color: C.n[800] }}>{date}</span>
                        {!editing && (
                          <button onClick={() => { setEditItem(item); setEditVal(rawValue); }} style={{ fontSize: 11, color: C.pri[600], background: C.pri[50], border: `0.5px solid ${C.pri[100]}`, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>✎ Edit</button>
                        )}
                      </div>
                      {test && <div style={{ fontSize: 13.5, fontWeight: 600, color: C.n[900], marginTop: 1 }}>{test}</div>}
                      {editing ? (
                        <div style={{ marginTop: 5 }}>
                          <input
                            autoFocus
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditItem(null); }}
                            style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 6, fontSize: 12.5, border: `0.5px solid ${C.n[200]}`, outline: "none", fontFamily: "inherit", color: C.n[900] }}
                          />
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <button onClick={commitEdit} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: C.pri[400], color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                            <button onClick={() => setEditItem(null)} style={{ padding: "5px 12px", borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                            <button onClick={() => { setInvestigation(investigation.filter((x) => x !== item)); setEditItem(null); }} style={{ padding: "5px 12px", borderRadius: 6, border: `0.5px solid ${C.danger[100]}`, background: C.danger[50], color: C.danger[800], fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12.5, color: C.n[900], marginTop: 3, lineHeight: 1.45, wordBreak: "break-word" }}>{displayValue}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50] }}>
          <button onClick={handleCloseInvPopup} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
        </div>
        </div>{/* /Main column */}
      </div>
    </div>
  );
}

// Small type-to-jump date box for the investigation calendar. Type DDMMYY (or a
// slashed date) and it jumps the calendar to that date the moment a full,
// valid date is entered — no clicking needed. e.g. 060625 → 06/06/2025.
function QuickDateBox({ onPick }: { onPick: (d: Date) => void }) {
  const [text, setText] = useState("");
  const jump = (v: string) => {
    const iso = parseFlexibleDate(v);
    if (!iso) return;
    const d = new Date(iso + "T00:00:00");
    if (!Number.isNaN(d.getTime())) onPick(d);
  };
  return (
    <input
      value={text}
      onChange={(e) => { const v = e.target.value; setText(v); jump(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") { jump(text); (e.target as HTMLInputElement).blur(); } }}
      onBlur={() => setText("")}
      placeholder="Type date — ddmmyy"
      inputMode="numeric"
      title="Type a date as DDMMYY (e.g. 060625 → 06/06/2025) — jumps the calendar instantly"
      style={{
        width: 150, textAlign: "center", padding: "3px 8px", borderRadius: 6,
        border: "0.5px solid " + C.n[300], fontSize: 11, outline: "none",
        background: C.n[0], color: C.n[900], fontFamily: "inherit",
      }}
    />
  );
}
