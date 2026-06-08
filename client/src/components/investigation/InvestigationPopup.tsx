"use client";

import type { CSSProperties } from "react";
import { C } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { INV_CATS } from "@/data/investigations";

const VALUE_LABELS = ["Value", "Result", "Report", "Finding", "Score", "Status", "Grade"];

export default function InvestigationPopup() {
  const {
    showInvPopup, setShowInvPopup, calDate, setCalDate, showMonthPicker, setShowMonthPicker,
    invSearch, setInvSearch, invActiveCat, setInvActiveCat, invFormData, setInvFormData,
    investigation, setInvestigation, invImages, setInvImages,
  } = useMuqsit();

  // Format date as string for display
  const formatCalDate = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return dd + "/" + mm + "/" + yyyy;
  };

  // Auto-save current form data to the current calDate before changing date
  const autoSaveInvData = () => {
    const dateStr = formatCalDate(calDate);
    let anyData = false;
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
        anyData = true;
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
    return anyData;
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
      if (!investigation.includes(result)) setInvestigation([...investigation, result]);
      fields.forEach((f) => {
        const key = testName + "__" + f.l;
        const key2 = testName + "__" + f.l + "_u2";
        setInvFormData((prev) => { const copy = { ...prev }; delete copy[key]; delete copy[key2]; return copy; });
      });
    }
  };

  const addInvNormal = (testName: string) => {
    const dateStr = formatCalDate(calDate);
    const result = dateStr + ":" + testName + ":normal";
    if (!investigation.includes(result)) setInvestigation([...investigation, result]);
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
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const shiftMonth = (offset: number) => { handleCalDateChange(new Date(y, m + offset, 1)); };
  const shiftYear = (offset: number) => { handleCalDateChange(new Date(y + offset, m, 1)); };
  const isToday = (day: number | null) => !!day && today.getFullYear() === y && today.getMonth() === m && today.getDate() === day;
  const isSel = (day: number | null) => !!day && calDate.getDate() === day;

  const navLeft = [
    { l: "-1Y", fn: () => shiftYear(-1), c: C.danger },
    { l: "-5M", fn: () => shiftMonth(-5), c: C.warn },
    { l: "-3M", fn: () => shiftMonth(-3), c: C.warn },
    { l: "-1M", fn: () => shiftMonth(-1), c: C.info },
  ];
  const navRight = [
    { l: "+1M", fn: () => shiftMonth(1), c: C.info },
    { l: "+3M", fn: () => shiftMonth(3), c: C.warn },
    { l: "+5M", fn: () => shiftMonth(5), c: C.warn },
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

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={handleCloseInvPopup}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxHeight: "85vh", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: "0 16px 48px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `0.5px solid ${C.n[200]}`, background: C.n[50] }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: C.n[900] }}>Investigation report findings</div>
            <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>Enter test results — select a category, fill values, and add</div>
          </div>
          <button onClick={handleCloseInvPopup} style={{ width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[600], fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        {/* Calendar */}
        <div style={{ padding: "6px 20px 5px", borderBottom: "0.5px solid " + C.n[200], background: C.n[0] }}>
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
            {days.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 8, fontWeight: 600, color: C.pri[600], padding: "3px 0", background: C.pri[50], borderRadius: 2 }}>{d}</div>)}
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
                  <button key={r.cat + r.test} onClick={() => { setInvActiveCat(r.cat); setInvSearch(""); }}
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

        {/* Added results */}
        {investigation.length > 0 && (
          <div style={{ padding: "10px 20px", borderBottom: `0.5px solid ${C.n[200]}`, background: C.pri[50], maxHeight: 120, overflowY: "auto" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.pri[600], textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Added results ({investigation.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {investigation.map((item, idx) => {
                const hasImg = item.indexOf("[image attached]") >= 0;
                const imgKey = hasImg ? item.replace(":[image attached]", "") : null;
                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.pri[600], background: C.n[0], padding: "3px 8px 3px 10px", borderRadius: 4, border: `0.5px solid ${C.pri[100]}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {hasImg && imgKey && invImages[imgKey] && <img src={invImages[imgKey]} alt="" style={{ width: 20, height: 20, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} />}
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
            {((INV_CATS.find((c) => c.cat === invActiveCat) || { tests: [] }).tests || []).map((test) => (
              <div key={test.name} style={{ marginBottom: 14, padding: "12px 14px", background: C.n[50], borderRadius: 8, border: `0.5px solid ${C.n[200]}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.n[900] }}>{test.name}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => addInvNormal(test.name)} style={{
                      padding: "4px 12px", borderRadius: 6, border: `0.5px solid ${C.pri[100]}`,
                      background: C.pri[50], color: C.pri[600], fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                    }}>Normal</button>
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
                  </div>
                </div>
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
                {/* Previous entries for this test */}
                {(() => {
                  const prevEntries = investigation.filter((item) => {
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
                      setInvestigation([...investigation, dateStr + ":" + e.currentTarget.value.trim()]);
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
                  if (input && input.value.trim()) { const dateStr = formatCalDate(calDate); setInvestigation([...investigation, dateStr + ":" + input.value.trim()]); input.value = ""; }
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
}
