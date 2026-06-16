"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { INV_CATS } from "@/data/investigations";
import CalcRenderer from "./CalcRenderer";
import { useActivityLog } from "@/hooks/useActivity";
import { useInvestigationPrefs } from "@/hooks/useInvestigationPrefs";

const VALUE_LABELS = ["Value", "Result", "Report", "Finding", "Score", "Status", "Grade"];

export default function InvestigationPopup() {
  const {
    showInvPopup, setShowInvPopup, calDate, setCalDate, showMonthPicker, setShowMonthPicker,
    invSearch, setInvSearch, invActiveCat, setInvActiveCat, invFormData, setInvFormData,
    investigation, setInvestigation, invImages, setInvImages,
  } = useMuqsit();

  // Mirror investigation adds into the activity feed (Notification, Charts &
  // Reports), like the other clinical-assessment sections do.
  const logActivity = useActivityLog();
  const logInv = (detail: string) => logActivity("Investigation report findings", detail);

  // The "Favourite" category is built from the doctor's saved favourites
  // (Settings → Favourite & unit settings), looked up across all categories.
  const { favourites } = useInvestigationPrefs();
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
  // Manual "tag this image to a result" picker in the report viewer.
  const [tagOpen, setTagOpen] = useState(false);

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

  // Bulk-add report images into the pool, tagged to the selected date.
  const addReportImages = (files: FileList) => {
    const dateStr = formatCalDate(calDate);
    const maxIdx = investigation.reduce((mx, it) => {
      const m = it.match(/:Report (\d+):\[image attached\]$/);
      return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
    }, 0);
    Array.from(files).forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const imgKey = dateStr + ":Report " + (maxIdx + i + 1);
        setInvImages((prev) => Object.assign({}, prev, { [imgKey]: dataUrl }));
        const entry = imgKey + ":[image attached]";
        setInvestigation((prev) => (prev.indexOf(entry) === -1 ? prev.concat([entry]) : prev));
      };
      reader.readAsDataURL(file);
    });
  };

  // Tag the currently-open report image to a test (the date + test name) on
  // data entry. It's a COPY — the report stays in the pool and the viewer stays
  // exactly where it is, so several tests can be read off the same report.
  const tagOpenImage = (testName: string) => {
    const pool = investigation.filter(isPoolEntry);
    if (pool.length === 0) return;
    const idx = Math.min(reportIdx, pool.length - 1);
    const poolKey = pool[idx].replace(":[image attached]", "");
    const dataUrl = invImages[poolKey];
    if (!dataUrl) return;
    const targetKey = formatCalDate(calDate) + ":" + testName;
    setInvImages((prev) => ({ ...prev, [targetKey]: dataUrl }));
    setInvestigation((prev) => {
      const te = targetKey + ":[image attached]";
      return prev.indexOf(te) === -1 ? prev.concat([te]) : prev;
    });
  };

  // Auto-save current form data to the current calDate before changing date
  const autoSaveInvData = () => {
    const dateStr = formatCalDate(calDate);
    const savedTests: string[] = [];
    const allTests = INV_CATS.flatMap((c) => c.tests);
    allTests.forEach((test) => {
      const fields = test.fields || [];
      const parts = fields.map((f) => {
        const key = test.name + "__" + f.l;
        const val = invFormData[key];
        if (!val) return null;
        const unit = f.u1 ? f.u1 : "";
        const label = VALUE_LABELS.includes(f.l) ? "" : f.l + ":";
        return label + val + unit;
      }).filter(Boolean);
      if (parts.length > 0) {
        savedTests.push(test.name);
        const result = dateStr + ":" + test.name + ":" + parts.join(",");
        if (!investigation.includes(result)) {
          setInvestigation((prev) => prev.concat([result]));
        }
        // Clear those fields
        fields.forEach((f) => {
          const key = test.name + "__" + f.l;
          const key2 = test.name + "__" + f.l + "_u2";
          setInvFormData((prev) => { const copy = Object.assign({}, prev); delete copy[key]; delete copy[key2]; return copy; });
        });
      }
    });
    // Image tagging is manual now (no auto-tag on save).
    return savedTests.length > 0;
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

  const addInvResult = (testName: string) => {
    const dateStr = formatCalDate(calDate);
    const found = INV_CATS.flatMap((c) => c.tests).find((t) => t.name === testName);
    const fields = found && found.fields ? found.fields : [];
    const parts = fields.map((f) => {
      const key = testName + "__" + f.l;
      const val = invFormData[key];
      if (!val) return null;
      const unit = f.u1 ? f.u1 : "";
      const label = VALUE_LABELS.includes(f.l) ? "" : f.l + ":";
      return label + val + unit;
    }).filter(Boolean);
    if (parts.length > 0) {
      const result = dateStr + ":" + testName + ":" + parts.join(",");
      if (!investigation.includes(result)) {
        setInvestigation([...investigation, result]);
        logInv(testName + ": " + parts.join(", "));
      }
      fields.forEach((f) => {
        const key = testName + "__" + f.l;
        const key2 = testName + "__" + f.l + "_u2";
        setInvFormData((prev) => { const copy = { ...prev }; delete copy[key]; delete copy[key2]; return copy; });
      });
      // Tagging the open report image is now manual — use the per-test
      // "Left image corresponds to this report" button instead.
    }
  };

  // Push a computed score-calculator result for the selected date.
  const addCalcResult = (testName: string, summary: string) => {
    const dateStr = formatCalDate(calDate);
    const result = dateStr + ":" + testName + ":" + summary;
    if (!investigation.includes(result)) {
      setInvestigation([...investigation, result]);
      logInv(testName + ": " + summary);
    }
  };

  const addInvNormal = (testName: string) => {
    const dateStr = formatCalDate(calDate);
    const result = dateStr + ":" + testName + ":normal";
    if (!investigation.includes(result)) {
      setInvestigation([...investigation, result]);
      logInv(testName + ": normal");
    }
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
      <div onClick={(e) => e.stopPropagation()} style={{ width: modalWidth, maxWidth: "100%", height: reportImages.length > 0 && showReports ? "85vh" : undefined, maxHeight: "85vh", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: "0 16px 48px rgba(0,0,0,0.15)", display: "flex", flexDirection: "row", overflow: "hidden", minHeight: 0 }}>

        {/* Left reports pane — half-screen viewer shown once reports are uploaded */}
        {reportImages.length > 0 && showReports && (() => {
          const entry = reportImages[repIdx];
          const imgKey = entry.replace(":[image attached]", "");
          const pm = imgKey.match(/^(.*):Report (\d+)$/);
          const name = pm ? `Report ${pm[2]} (${pm[1]})` : imgKey;
          return (
            <div style={{ width: "38%", flexShrink: 0, borderRight: `0.5px solid ${C.n[200]}`, background: C.n[50], display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
                      <img src={invImages[imgKey]} alt={name} draggable={false} style={{ width: `${zoom * 100}%`, maxWidth: "none", height: "auto", display: "block", flexShrink: 0, transform: `rotate(${rotation}deg)`, transition: "width 0.12s, transform 0.15s" }} />
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

                {/* Tag / Edit — attach this image to any added result */}
                <button onClick={() => setTagOpen((o) => !o)} style={{
                  marginTop: 6, padding: "7px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 11, fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  border: `1px solid ${tagOpen ? C.pri[400] : C.info[100]}`, background: tagOpen ? C.pri[50] : C.info[50], color: C.info[800],
                }}>🏷 Tag / Edit</button>
                {tagOpen && (
                  <div style={{ marginTop: 6, border: `0.5px solid ${C.n[200]}`, borderRadius: 8, background: C.n[0], padding: 8, maxHeight: 180, overflowY: "auto" }}>
                    <div style={{ fontSize: 10, color: C.n[600], marginBottom: 6 }}>Tag this image to a result:</div>
                    {textResults.length === 0 ? (
                      <div style={{ fontSize: 11, color: C.n[500] }}>No results yet — add a test result first.</div>
                    ) : (
                      textResults.map((r, i) => {
                        const p = r.split(":");
                        const targetKey = p.length >= 2 ? `${p[0]}:${p[1]}` : p[0];
                        const tagged = invImages[targetKey] === invImages[imgKey] && !!invImages[imgKey];
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              const dataUrl = invImages[imgKey];
                              if (dataUrl) setInvImages((prev) => ({ ...prev, [targetKey]: dataUrl }));
                              setInvestigation((prev) => {
                                const te = targetKey + ":[image attached]";
                                return prev.indexOf(te) === -1 ? prev.concat([te]) : prev;
                              });
                              setTagOpen(false);
                            }}
                            style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 8px", borderRadius: 5, marginBottom: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 11, border: `0.5px solid ${tagged ? C.pri[400] : C.n[200]}`, background: tagged ? C.pri[50] : C.n[0], color: C.n[800] }}
                          >
                            {tagged ? "✓ " : ""}{r}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 20px", borderBottom: `0.5px solid ${C.n[200]}`, background: C.n[50] }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: C.n[900] }}>Investigation report findings</div>
            <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Enter test results — select a category, fill values, and add</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
            <div style={{ display: "flex", gap: 3 }}>
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
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
          {/* Category sidebar */}
          <div style={{ width: 160, borderRight: `0.5px solid ${C.n[200]}`, padding: "8px 0", overflowY: "auto", flexShrink: 0 }}>
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
                    {reportImages.length > 0 && showReports ? (() => {
                      // A report image is open on the left → let the doctor tag
                      // THAT image to this test (replaces the old auto-tag).
                      const openPoolKey = reportImages[repIdx]?.replace(":[image attached]", "");
                      const openImg = openPoolKey ? invImages[openPoolKey] : undefined;
                      const myKey = formatCalDate(calDate) + ":" + test.name;
                      const tagged = !!openImg && invImages[myKey] === openImg;
                      return (
                        <button onClick={() => tagOpenImage(test.name)} title="Tag the report image shown on the left to this test" style={{
                          padding: "4px 12px", borderRadius: 6,
                          border: `0.5px solid ${tagged ? C.pri[400] : C.info[100]}`,
                          background: tagged ? C.pri[50] : C.info[50], color: tagged ? C.pri[600] : C.info[800],
                          fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                        }}>{tagged ? "✓ Image tagged" : "⬅ Left image corresponds to this report"}</button>
                      );
                    })() : (
                      <label style={{
                        padding: "4px 12px", borderRadius: 6, border: "none",
                        background: C.pri[400], color: "#fff", fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                        display: "inline-flex", alignItems: "center", gap: 4,
                      }}>
                        <span>Add report image</span>
                        <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => {
                          const file = e.target.files && e.target.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const dateStr = formatCalDate(calDate);
                              const imgKey = dateStr + ":" + test.name;
                              const dataUrl = ev.target?.result as string;
                              setInvImages((prev) => Object.assign({}, prev, { [imgKey]: dataUrl }));
                              const entry = dateStr + ":" + test.name + ":[image attached]";
                              setInvestigation((prev) => (prev.indexOf(entry) === -1 ? prev.concat([entry]) : prev));
                            };
                            reader.readAsDataURL(file);
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
            <div style={{ width: 290, flexShrink: 0, borderLeft: `0.5px solid ${C.n[200]}`, background: C.n[0], overflowY: "auto", padding: "12px 14px" }}>
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
