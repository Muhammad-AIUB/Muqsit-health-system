"use client";

import { useEffect, useRef, useState } from "react";
import { C, font } from "@/theme";
import RichTextEditor, { type RichTextEditorHandle } from "@/components/common/RichTextEditor";
import { ApiError, prescriptionLayoutApi } from "@/lib/api";

// Mirrors the "Print Layout Configuration → Prescription pad" wizard:
// a 5-step header, a live page preview with margin labels, page-type cards
// and the page-size fields.
type StepId = "page" | "header" | "footer" | "body";

const STEPS: { id: StepId; label: string; icon: string }[] = [
  { id: "page", label: "Page Setup", icon: "▢" },
  { id: "header", label: "Header Section", icon: "▤" },
  { id: "footer", label: "Footer Section", icon: "▭" },
  { id: "body", label: "Body Section", icon: "▥" },
];

interface PageForm {
  totalHeight: string;
  totalWidth: string;
  leftMargin: string;
  rightMargin: string;
  headerHeight: string;
  footerHeight: string;
}

const INITIAL: PageForm = {
  totalHeight: "11",
  totalWidth: "8.25",
  leftMargin: "0.3",
  rightMargin: "0.2",
  headerHeight: "1.7",
  footerHeight: "0.8",
};

export default function PrescriptionSettingsView({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<StepId>("page");
  const [form, setForm] = useState<PageForm>(INITIAL);
  const [unit, setUnit] = useState<"in" | "cm">("in");
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  // Header layout: a single block (aligned) or split into two sections.
  const [headerSplit, setHeaderSplit] = useState(false);
  const [headerAlign, setHeaderAlign] = useState<"left" | "center" | "right">("left");
  const [headerLeftHtml, setHeaderLeftHtml] = useState("");
  const [headerRightHtml, setHeaderRightHtml] = useState("");
  // Body section
  const [bodySplit, setBodySplit] = useState("");
  const [bodyLeftTop, setBodyLeftTop] = useState("0");
  const [bodyRightTop, setBodyRightTop] = useState("0");
  const [bodyBottomLine, setBodyBottomLine] = useState(false);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const headerEditorRef = useRef<RichTextEditorHandle>(null);

  // Load the saved layout (or server defaults) for this doctor.
  useEffect(() => {
    prescriptionLayoutApi
      .get()
      .then((l) => {
        setUnit(l.unit);
        setForm({
          totalHeight: l.totalHeight,
          totalWidth: l.totalWidth,
          leftMargin: l.leftMargin,
          rightMargin: l.rightMargin,
          headerHeight: l.headerHeight,
          footerHeight: l.footerHeight,
        });
        setHeaderSplit(l.headerSplit);
        setHeaderAlign(l.headerAlign);
        setHeaderHtml(l.headerHtml);
        setHeaderLeftHtml(l.headerLeftHtml);
        setHeaderRightHtml(l.headerRightHtml);
        setFooterHtml(l.footerHtml);
        setBodySplit(l.bodySplit);
        setBodyLeftTop(l.bodyLeftTopMargin);
        setBodyRightTop(l.bodyRightTopMargin);
        setBodyBottomLine(l.bodyBottomLine);
      })
      .catch(() => setSaved("Could not load saved settings. Is the API running?"))
      .finally(() => setLoading(false));
  }, []);

  const unitWord = unit === "in" ? "inches" : "cm";
  const unitShort = unit === "in" ? "inch" : "cm";

  const setField = (k: keyof PageForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSaved("");
  };

  // Switching unit converts every value (1 inch = 2.54 cm), rounded to 2dp.
  const switchUnit = (next: "in" | "cm") => {
    if (next === unit) return;
    const factor = next === "cm" ? 2.54 : 1 / 2.54;
    const conv = (s: string) => {
      const n = parseFloat(s);
      return isNaN(n) ? s : String(Math.round(n * factor * 100) / 100);
    };
    setForm((f) => ({
      totalHeight: conv(f.totalHeight),
      totalWidth: conv(f.totalWidth),
      leftMargin: conv(f.leftMargin),
      rightMargin: conv(f.rightMargin),
      headerHeight: conv(f.headerHeight),
      footerHeight: conv(f.footerHeight),
    }));
    // Body-section measurements share the same unit.
    setBodySplit((s) => (s === "" ? "" : conv(s)));
    setBodyLeftTop((s) => conv(s));
    setBodyRightTop((s) => conv(s));
    setUnit(next);
    setSaved("");
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const goNext = () => stepIndex < STEPS.length - 1 && setStep(STEPS[stepIndex + 1].id);
  const goPrev = () => stepIndex > 0 && setStep(STEPS[stepIndex - 1].id);
  const save = async () => {
    setSaving(true);
    setSaved("");
    try {
      await prescriptionLayoutApi.update({
        unit,
        ...form,
        headerSplit,
        headerAlign,
        headerHtml,
        headerLeftHtml,
        headerRightHtml,
        footerHtml,
        bodySplit,
        bodyLeftTopMargin: bodyLeftTop,
        bodyRightTopMargin: bodyRightTop,
        bodyBottomLine,
      });
      setSaved("Saved.");
      setTimeout(() => setSaved(""), 2500);
    } catch (e) {
      setSaved(e instanceof ApiError ? e.message : "Save failed. Is the API running?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ fontFamily: font, maxWidth: 980 }}>
      {/* ── Top bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={btnBack}>← Back</button>
        <div style={{ fontSize: 16, fontWeight: 500 }}>Prescription settings</div>
        <span style={{ fontSize: 12, color: C.n[600], borderLeft: `1px solid ${C.n[200]}`, paddingLeft: 12 }}>
          Print Layout Configuration
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.n[800], border: `0.5px solid ${C.n[200]}`, borderRadius: 8, padding: "6px 12px", background: C.n[0] }}>
          Prescription pad <span style={{ color: C.n[500] }}>▾</span>
        </span>
      </div>

      {/* ── Step wizard ── */}
      <div style={{ display: "flex", marginBottom: 18, border: `1px solid ${C.n[200]}`, borderRadius: 10, overflow: "hidden" }}>
        {STEPS.map((s, i) => {
          const active = s.id === step;
          return (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "11px 14px",
                border: "none",
                borderLeft: i === 0 ? "none" : `1px solid ${active ? C.pri[600] : C.n[200]}`,
                background: active ? C.pri[600] : C.n[0],
                color: active ? "#fff" : C.n[800],
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  flexShrink: 0,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  background: active ? "rgba(255,255,255,0.2)" : C.n[100],
                }}
              >
                {s.icon}
              </span>
              <span style={{ overflow: "hidden" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</div>
                <div style={{ fontSize: 10, color: active ? "rgba(255,255,255,0.85)" : C.n[500] }}>Prescription</div>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Step content ── */}
      {step === "page" ? (
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: 22, display: "grid", gridTemplateColumns: "260px 1fr", gap: 30 }}>
          <PagePreview form={form} unitShort={unitShort} />

          <div>
            <SectionTitle right={<UnitToggle unit={unit} onChange={switchUnit} />}>Page Size</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px 18px" }}>
              <NumField label={`Total Height (${unitWord})`} value={form.totalHeight} onChange={setField("totalHeight")} />
              <NumField label={`Left Margin (${unitWord})`} value={form.leftMargin} onChange={setField("leftMargin")} />
              <NumField label={`Header Height (${unitWord})`} value={form.headerHeight} onChange={setField("headerHeight")} />
              <NumField label={`Total Width (${unitWord})`} value={form.totalWidth} onChange={setField("totalWidth")} />
              <NumField label={`Right Margin (${unitWord})`} value={form.rightMargin} onChange={setField("rightMargin")} />
              <NumField label={`Footer Height (${unitWord})`} value={form.footerHeight} onChange={setField("footerHeight")} />
            </div>
          </div>
        </div>
      ) : step === "header" ? (
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: 22 }}>
          <SectionTitle>Header content</SectionTitle>
          <div style={{ fontSize: 11, color: C.n[600], marginBottom: 12 }}>
            Design the header that prints at the top of every prescription — clinic name, doctor details, logo text, etc.
          </div>

          {/* Layout controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: C.n[600] }}>Alignment</span>
            <div style={{ display: "flex", gap: 14 }}>
              {([["left", "Left"], ["center", "Middle"], ["right", "Right"]] as const).map(([val, label]) => (
                <label
                  key={val}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: headerSplit ? C.n[500] : C.n[800],
                    cursor: headerSplit ? "not-allowed" : "pointer",
                    opacity: headerSplit ? 0.55 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!headerSplit && headerAlign === val}
                    disabled={headerSplit}
                    onChange={() => {
                      setHeaderAlign(val);
                      headerEditorRef.current?.setAlign(val);
                    }}
                    style={{ cursor: headerSplit ? "not-allowed" : "pointer" }}
                  />
                  {label}
                </label>
              ))}
            </div>
            <span style={{ width: 1, height: 20, background: C.n[200] }} />
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.n[800], cursor: "pointer" }}>
              <input type="checkbox" checked={headerSplit} onChange={(e) => setHeaderSplit(e.target.checked)} style={{ cursor: "pointer" }} />
              Split header into 2 sections
            </label>
          </div>

          {headerSplit ? (
            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.n[600], marginBottom: 6 }}>Left section</div>
                <RichTextEditor value={headerLeftHtml} onChange={setHeaderLeftHtml} minHeight={220} placeholder="Left section…" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.n[600], marginBottom: 6 }}>Right section</div>
                <RichTextEditor value={headerRightHtml} onChange={setHeaderRightHtml} minHeight={220} placeholder="Right section…" />
              </div>
            </div>
          ) : (
            <RichTextEditor ref={headerEditorRef} value={headerHtml} onChange={setHeaderHtml} minHeight={240} placeholder="Type your prescription header here…" />
          )}
        </div>
      ) : step === "footer" ? (
        <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: 22 }}>
          <SectionTitle>Footer content</SectionTitle>
          <div style={{ fontSize: 11, color: C.n[600], marginBottom: 10 }}>
            Design the footer that prints at the bottom of every prescription — signature line, address, contact, timing, etc.
          </div>
          <RichTextEditor value={footerHtml} onChange={setFooterHtml} minHeight={240} placeholder="Type your prescription footer here…" />
        </div>
      ) : (
        <BodySection
          totalWidth={form.totalWidth}
          leftMargin={form.leftMargin}
          rightMargin={form.rightMargin}
          unitShort={unitShort}
          unit={unit}
          onUnitChange={switchUnit}
          split={bodySplit}
          setSplit={setBodySplit}
          leftTop={bodyLeftTop}
          setLeftTop={setBodyLeftTop}
          rightTop={bodyRightTop}
          setRightTop={setBodyRightTop}
          bottomLine={bodyBottomLine}
          setBottomLine={setBodyBottomLine}
        />
      )}

      {/* ── Footer (Save + Next) ── */}
      <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", marginTop: 22, minHeight: 40 }}>
        {saved && <span style={{ position: "absolute", left: stepIndex > 0 ? 110 : 0, fontSize: 12, color: saved === "Saved." ? C.pri[600] : C.danger[800] }}>{saved}</span>}
        {stepIndex > 0 && (
          <button onClick={goPrev} style={{ ...btnNext, background: C.n[100], color: C.n[800], position: "absolute", left: 0 }}>
            <span style={{ marginRight: 4 }}>‹</span> Previous
          </button>
        )}
        <button onClick={save} disabled={saving || loading} style={{ ...btnSave, opacity: saving || loading ? 0.6 : 1 }}>
          <span style={{ marginRight: 6 }}>💾</span> {saving ? "Saving…" : "Save"}
        </button>
        {stepIndex < STEPS.length - 1 && (
          <button onClick={goNext} style={{ ...btnNext, position: "absolute", right: 0 }}>
            Next <span style={{ marginLeft: 4 }}>›</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page preview with margin labels ─────────────────────────
function PagePreview({ form, unitShort }: { form: PageForm; unitShort: string }) {
  const cap: React.CSSProperties = { fontSize: 10, color: C.n[600], whiteSpace: "nowrap" };
  const vLabel: React.CSSProperties = { ...cap, writingMode: "vertical-rl" };
  const u = unitShort;

  // Draw the paper to scale: the rectangle keeps the real width:height ratio,
  // and the prescription area is inset by the actual margins.
  const num = (s: string) => {
    const n = parseFloat(s);
    return isNaN(n) || n < 0 ? 0 : n;
  };
  const w = num(form.totalWidth) || 8.5;
  const h = num(form.totalHeight) || 11;
  const scale = Math.min(150 / w, 200 / h); // fit within a 150×200px bound
  const boxW = Math.max(40, w * scale);
  const boxH = Math.max(40, h * scale);
  // Clamp margins so the inner area never inverts on extreme input.
  const top = Math.min(num(form.headerHeight) * scale, boxH * 0.45);
  const bottom = Math.min(num(form.footerHeight) * scale, boxH * 0.45);
  const left = Math.min(num(form.leftMargin) * scale, boxW * 0.45);
  const right = Math.min(num(form.rightMargin) * scale, boxW * 0.45);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...cap, marginBottom: 4 }}>Total Width: {form.totalWidth || "—"} {u}</div>
      <div style={{ ...cap, marginBottom: 6 }}>Margin Top: {form.headerHeight || "—"} {u}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ height: boxH, display: "flex", alignItems: "center" }}>
          <div style={{ ...vLabel, transform: "rotate(180deg)" }}>Total Height: {form.totalHeight || "—"} {u}</div>
        </div>
        <div style={{ height: boxH, display: "flex", alignItems: "center" }}>
          <div style={{ ...vLabel, transform: "rotate(180deg)" }}>Margin Left: {form.leftMargin || "—"} {u}</div>
        </div>
        <div style={{ position: "relative", width: boxW, height: boxH, border: `1px solid ${C.n[300]}`, background: C.n[0], flexShrink: 0 }}>
          {/* Prescription area, inset by the margins */}
          <div
            style={{
              position: "absolute",
              top,
              bottom,
              left,
              right,
              border: `1px dashed ${C.pri[400]}`,
              background: C.pri[50],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              color: C.n[600],
              textAlign: "center",
              overflow: "hidden",
            }}
          >
            Prescription Area
          </div>
        </div>
        <div style={{ height: boxH, display: "flex", alignItems: "center" }}>
          <div style={vLabel}>Margin Right: {form.rightMargin || "—"} {u}</div>
        </div>
      </div>
      <div style={{ ...cap, marginTop: 6 }}>Margin Bottom: {form.footerHeight || "—"} {u}</div>
    </div>
  );
}

// Inch / cm toggle pill.
function UnitToggle({ unit, onChange }: { unit: "in" | "cm"; onChange: (u: "in" | "cm") => void }) {
  const opt = (id: "in" | "cm", label: string) => (
    <button
      onClick={() => onChange(id)}
      style={{
        padding: "4px 14px",
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 500,
        fontFamily: "inherit",
        background: unit === id ? C.n[0] : "transparent",
        color: unit === id ? C.pri[600] : C.n[600],
        boxShadow: unit === id ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "inline-flex", gap: 2, background: C.n[100], borderRadius: 8, padding: 2 }}>
      {opt("in", "Inch")}
      {opt("cm", "cm")}
    </div>
  );
}

// ── Body section (two columns split by a separator) ─────────
const bodyNum = (s: string) => {
  const n = parseFloat(s);
  return isNaN(n) || n < 0 ? 0 : n;
};
const BODY_W = 560; // px width of the preview rectangle
const BODY_H = 300; // px height
const BODY_VMAX = 4; // vertical ruler goes 0 → 4 (page unit)

// Vertical ruler with an editable top-margin value box that slides along it.
function BodyVRuler({ value, onChange, u }: { value: string; onChange: (v: string) => void; u: string }) {
  const v = Math.min(bodyNum(value), BODY_VMAX);
  const y = (v / BODY_VMAX) * BODY_H;
  return (
    <div style={{ position: "relative", width: 66, height: BODY_H }}>
      <div style={{ position: "absolute", right: 4, top: 0, height: BODY_H, width: 1, background: C.n[300] }} />
      {[0, 1, 2, 3, 4].map((t) => (
        <div key={t} style={{ position: "absolute", top: (t / BODY_VMAX) * BODY_H, right: 10, fontSize: 9, color: C.n[600], transform: "translateY(-50%)", whiteSpace: "nowrap" }}>
          {t.toFixed(2)} {u}
        </div>
      ))}
      <div style={{ position: "absolute", top: y, right: 9, transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 2, border: `1px solid ${C.pri[400]}`, background: C.pri[50], borderRadius: 4, padding: "1px 3px" }}>
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" style={{ width: 26, border: "none", background: "transparent", fontSize: 10, outline: "none", fontFamily: "inherit", textAlign: "right", color: C.pri[800] }} />
        <span style={{ fontSize: 9, color: C.pri[600] }}>{u}</span>
      </div>
    </div>
  );
}

function BodySection({
  totalWidth,
  leftMargin,
  rightMargin,
  unitShort,
  unit,
  onUnitChange,
  split,
  setSplit,
  leftTop,
  setLeftTop,
  rightTop,
  setRightTop,
  bottomLine,
  setBottomLine,
}: {
  totalWidth: string;
  leftMargin: string;
  rightMargin: string;
  unitShort: string;
  unit: "in" | "cm";
  onUnitChange: (u: "in" | "cm") => void;
  split: string;
  setSplit: (v: string) => void;
  leftTop: string;
  setLeftTop: (v: string) => void;
  rightTop: string;
  setRightTop: (v: string) => void;
  bottomLine: boolean;
  setBottomLine: (v: boolean) => void;
}) {
  const u = unitShort;
  const bodyW = Math.max(0.1, bodyNum(totalWidth) - bodyNum(leftMargin) - bodyNum(rightMargin));
  const sp = Math.min(split === "" ? bodyW / 2 : bodyNum(split), bodyW);
  const leftPct = (sp / bodyW) * 100;
  const leftPx = (sp / bodyW) * BODY_W;
  const leftW = sp;
  const rightW = bodyW - sp;

  const hTicks: number[] = [];
  for (let i = 0; i <= Math.ceil(bodyW); i++) hTicks.push(i);

  const colLabel: React.CSSProperties = { position: "absolute", top: 26, textAlign: "center", fontSize: 12, color: C.n[800] };

  return (
    <div style={{ background: C.n[0], border: `0.5px solid ${C.n[200]}`, borderRadius: 12, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, marginBottom: 18, borderBottom: `1px solid ${C.n[200]}` }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.n[800] }}>Prescription Body Section</span>
        <UnitToggle unit={unit} onChange={onUnitChange} />
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
        <BodyVRuler value={leftTop} onChange={setLeftTop} u={u} />

        <div>
          {/* Preview rectangle split into two columns */}
          <div style={{ position: "relative", width: BODY_W, height: BODY_H, border: `1px solid ${C.n[300]}`, background: C.n[0] }}>
            <div style={{ position: "absolute", left: leftPx, top: 0, bottom: 0, borderLeft: `1px dashed ${C.n[500]}` }} />
            <div style={{ ...colLabel, left: 0, width: leftPx }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Left Section</div>
              <div><b>Width:</b> {leftW.toFixed(2)}{u} ({leftPct.toFixed(2)}%)</div>
              <div style={{ marginTop: 4 }}><b>Top Margin:</b> {bodyNum(leftTop).toFixed(2)}{u}</div>
            </div>
            <div style={{ ...colLabel, left: leftPx, width: BODY_W - leftPx }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Right Section</div>
              <div><b>Width:</b> {rightW.toFixed(2)}{u} ({(100 - leftPct).toFixed(2)}%)</div>
              <div style={{ marginTop: 4 }}><b>Top Margin:</b> {bodyNum(rightTop).toFixed(2)}{u}</div>
            </div>
            {bottomLine && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, borderBottom: `2px solid ${C.n[600]}` }} />}
          </div>

          {/* Horizontal separator-position slider */}
          <div style={{ position: "relative", width: BODY_W, marginTop: 12 }}>
            <input
              type="range"
              min={0}
              max={bodyW}
              step={0.01}
              value={sp}
              onChange={(e) => setSplit(e.target.value)}
              style={{ width: "100%", accentColor: C.pri[400] }}
            />
            <div style={{ position: "relative", height: 16, marginTop: 2 }}>
              {hTicks.map((t) => (
                <span key={t} style={{ position: "absolute", left: `${Math.min((t / bodyW) * 100, 100)}%`, fontSize: 9, color: C.n[600], transform: "translateX(-50%)" }}>
                  {t.toFixed(2)}
                </span>
              ))}
              <span style={{ position: "absolute", left: `${leftPct}%`, transform: "translateX(-50%)", top: -1, fontSize: 9, fontWeight: 600, color: C.pri[800], background: C.pri[50], border: `1px solid ${C.pri[400]}`, borderRadius: 4, padding: "0 4px" }}>
                {sp.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <BodyVRuler value={rightTop} onChange={setRightTop} u={u} />
      </div>

      <div style={{ marginTop: 18, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: C.n[600], marginBottom: 8 }}>Separator Line Between Sections</div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: C.n[800], cursor: "pointer" }}>
          <input type="checkbox" checked={bottomLine} onChange={(e) => setBottomLine(e.target.checked)} style={{ cursor: "pointer" }} />
          Bottom Line
        </label>
      </div>
    </div>
  );
}

// ── Small building blocks ───────────────────────────────────
function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, marginBottom: 16, borderBottom: `1px solid ${C.n[200]}` }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: C.n[800] }}>{children}</span>
      {right}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.n[600], marginBottom: 6 }}>{label}</div>
      <input value={value} onChange={onChange} inputMode="decimal" style={field} />
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────
const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  borderRadius: 8,
  border: `0.5px solid ${C.n[200]}`,
  fontSize: 13,
  fontFamily: "inherit",
  color: C.n[900],
  background: C.n[0],
  outline: "none",
};
const btnBack: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: `0.5px solid ${C.n[200]}`, background: C.n[0], color: C.n[800], fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
const btnSave: React.CSSProperties = { padding: "11px 30px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnNext: React.CSSProperties = { padding: "11px 24px", borderRadius: 8, border: "none", background: C.pri[400], color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
