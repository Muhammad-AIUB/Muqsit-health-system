"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { C } from "@/theme";
import type { CalculatorInput, CalculationResult } from "@/types/calculator";
import { getCalculator } from "@/lib/calculators/calculator-registry";
import { INPUT_OVERRIDES } from "@/lib/calculators/calc-inputs";

// Unit conversion that mirrors the EXACT factors each calculator applies
// internally, so the value↔unit pair the user sees stays consistent with what
// calculate() will reconvert. (The generic registry converter is not used here —
// its mass↔molar path is unreliable.)
const round4 = (v: number): number => Math.round((v + Number.EPSILON) * 1e4) / 1e4;
function convertUnit(v: number, from: string, to: string, substance?: string): number | null {
  if (from === to) return v;
  if (substance === "creatinine") return from === "mg/dL" ? v * 88.42 : v / 88.42;
  if (substance === "bilirubin") return from === "mg/dL" ? v * 17.1 : v / 17.1;
  if (substance === "iron") {
    if (from === "µg/dL" && to === "µmol/L") return v * 0.1791;
    if (from === "µmol/L" && to === "µg/dL") return v * 5.585;
    return null; // g/dL / g/L (transferrin) handled inside calculate
  }
  if (from === "g/dL" && to === "g/L") return v * 10;
  if (from === "g/L" && to === "g/dL") return v / 10;
  if (from === "kg" && to === "lb") return v * 2.20462;
  if (from === "lb" && to === "kg") return v * 0.453592;
  return null; // no known conversion — leave value as-is
}

// Generic calculator renderer used inside Special-Scores test cards. Resolves a
// calculator from the registry, renders its inputs (number + unit, radio,
// select, toggle), computes live, and calls onAdd(summary) to store the result.
// Holds its own state — independent of the popup's investigation form data.

const VASO_DRUGS = ["dopamine", "dobutamine", "epinephrine", "norepinephrine", "phenylephrine", "milrinone", "vasopressin"];

export default function CalcRenderer({ calcId, onAdd }: { calcId: string; onAdd: (summary: string) => void }) {
  const calc = getCalculator(calcId);
  const fields: CalculatorInput[] = useMemo(() => {
    if (!calc) return [];
    return INPUT_OVERRIDES[calcId] ?? calc.inputs ?? [];
  }, [calc, calcId]);

  // State: radio/select store the selected option index (string); number stores
  // the raw numeric string; toggle stores "true"/""; units store the unit string.
  const initial = useMemo(() => {
    const o: Record<string, string> = {};
    fields.forEach((f) => {
      if ((f.type === "radio" || f.type === "select") && f.options && f.options.length) o[f.id] = "0";
      if (f.units && f.units.length) o[f.id + "Unit"] = f.defaultUnit || f.units[0];
    });
    return o;
  }, [fields]);

  const [vals, setVals] = useState<Record<string, string>>(initial);
  const set = (id: string, v: string) => setVals((p) => ({ ...p, [id]: v }));

  // Vasopressor drug list (special case — calculate reads inputs.drugs[]).
  const [drugDoses, setDrugDoses] = useState<Record<string, string>>({});
  const [drugUnits, setDrugUnits] = useState<Record<string, string>>({});

  const visible = (f: CalculatorInput): boolean => {
    if (f.dependsOn) {
      const dep = fields.find((x) => x.id === f.dependsOn!.field);
      if (dep && (dep.type === "radio" || dep.type === "select") && dep.options) {
        const idx = Number(vals[dep.id] ?? "0");
        const depVal = dep.options[idx]?.value;
        if (depVal !== f.dependsOn.value) return false;
      }
    }
    // BMI: single height field hidden when ft+in is chosen.
    if (calcId === "bmi" && f.id === "height") {
      const hu = fields.find((x) => x.id === "heightUnit");
      if (hu && hu.options) {
        const idx = Number(vals.heightUnit ?? "0");
        if (hu.options[idx]?.value === "ft+in") return false;
      }
    }
    return true;
  };

  // Assemble the typed inputs object that the calculator's calculate() expects.
  const buildInputs = (): { inputs: Record<string, unknown>; complete: boolean } => {
    const inputs: Record<string, unknown> = {};
    let complete = true;

    fields.forEach((f) => {
      if (!visible(f)) return;
      if (f.type === "radio" || f.type === "select") {
        const idx = vals[f.id];
        if (idx === undefined || idx === "") {
          if (f.required) complete = false;
          return;
        }
        inputs[f.id] = f.options?.[Number(idx)]?.value;
      } else if (f.type === "toggle") {
        if (f.options && f.options.length) {
          const idx = vals[f.id];
          if (idx === undefined || idx === "") { if (f.required) complete = false; return; }
          inputs[f.id] = f.options[Number(idx)]?.value;
        } else {
          inputs[f.id] = vals[f.id] === "true";
        }
      } else {
        // number / date
        const raw = vals[f.id];
        if (raw === undefined || raw === "") {
          if (f.required) complete = false;
          return;
        }
        inputs[f.id] = raw;
        if (f.units && f.units.length) inputs[f.id + "Unit"] = vals[f.id + "Unit"] || f.defaultUnit || f.units[0];
      }
    });

    if (calcId === "vasopressor") {
      const drugs = VASO_DRUGS.map((name) => ({
        name,
        dose: Number(drugDoses[name] || 0),
        unit: drugUnits[name] || (name === "vasopressin" ? "units/min" : "mcg/kg/min"),
        enabled: Number(drugDoses[name] || 0) > 0,
      })).filter((d) => d.dose > 0);
      inputs.drugs = drugs;
    }

    return { inputs, complete };
  };

  const result: CalculationResult | null = useMemo(() => {
    if (!calc) return null;
    const { inputs, complete } = buildInputs();
    if (!complete) return null;
    try {
      const r = calc.calculate(inputs);
      // Some calculators return an "incomplete" placeholder — treat as no result.
      if (r && r.label && r.label !== "Incomplete") return r;
      return null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc, vals, drugDoses, drugUnits]);

  if (!calc) return <div style={{ fontSize: 12, color: C.danger[800] }}>Unknown calculator: {calcId}</div>;

  const inp: CSSProperties = {
    width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 12,
    border: "0.5px solid " + C.n[200], outline: "none", background: C.n[0],
    color: C.n[900], fontFamily: "inherit", boxSizing: "border-box",
  };
  const lbl: CSSProperties = { fontSize: 9, color: C.n[500], textTransform: "uppercase", marginBottom: 3, display: "block" };

  const summaryOf = (r: CalculationResult): string => {
    const score = r.score ?? r.value;
    let base = r.label || "";
    if (score !== undefined && score !== null && !base.includes(String(score))) {
      base = base ? `${base}: ${score}${r.unit ? " " + r.unit : ""}` : `${score}${r.unit ? " " + r.unit : ""}`;
    }
    return r.interpretation ? `${base} — ${r.interpretation}` : base;
  };

  const renderField = (f: CalculatorInput) => {
    if (!visible(f)) return null;
    const wide = (f.options && f.options.length > 3) || (f.options && f.options.some((o) => String(o.label).length > 22));
    const basis = wide ? "1 1 100%" : "1 1 200px";

    let control;
    if (f.type === "radio" || f.type === "select" || (f.type === "toggle" && f.options)) {
      control = (
        <select value={vals[f.id] ?? "0"} onChange={(e) => set(f.id, e.target.value)} style={{ ...inp, padding: "6px 4px" }}>
          {(f.options || []).map((o, i) => <option key={i} value={String(i)}>{o.label}</option>)}
        </select>
      );
    } else if (f.type === "toggle") {
      control = (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.n[800], cursor: "pointer", padding: "5px 0" }}>
          <input type="checkbox" checked={vals[f.id] === "true"} onChange={(e) => set(f.id, e.target.checked ? "true" : "")} />
          {f.label}
        </label>
      );
      return <div key={f.id} style={{ flex: basis, minWidth: 0 }}>{control}</div>;
    } else if (f.type === "date") {
      control = <input type="date" value={vals[f.id] || ""} onChange={(e) => set(f.id, e.target.value)} style={inp} />;
    } else {
      // number — with optional unit selector. Changing the unit converts the
      // entered value (and equivalents in the other units are shown below), so
      // typing in one unit auto-fills the others — like the source calculators.
      const curUnit = vals[f.id + "Unit"] || f.defaultUnit || (f.units && f.units[0]) || "";
      const raw = vals[f.id] || "";
      const numVal = parseFloat(raw);
      const hasNum = raw !== "" && !isNaN(numVal);

      const changeUnit = (newUnit: string) => {
        if (hasNum) {
          const converted = convertUnit(numVal, curUnit, newUnit, f.substance);
          const next = converted === null ? numVal : round4(converted);
          setVals((p) => ({ ...p, [f.id]: String(next), [f.id + "Unit"]: newUnit }));
        } else {
          set(f.id + "Unit", newUnit);
        }
      };

      const equivalents = f.units && f.units.length > 1 && hasNum
        ? f.units.filter((u) => u !== curUnit)
            .map((u) => { const c = convertUnit(numVal, curUnit, u, f.substance); return c === null ? null : `${round4(c)} ${u}`; })
            .filter((s): s is string => s !== null)
        : [];

      control = (
        <div>
          <div style={{ display: "flex", gap: 4 }}>
            <input type="number" inputMode="decimal" value={raw} placeholder={f.placeholder || ""}
              onChange={(e) => set(f.id, e.target.value)} style={inp} />
            {f.units && f.units.length > 0 && (
              <select value={curUnit} onChange={(e) => changeUnit(e.target.value)}
                style={{ ...inp, width: "auto", flexShrink: 0, padding: "6px 4px" }}>
                {f.units.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
          </div>
          {equivalents.length > 0 && (
            <div style={{ fontSize: 9.5, color: C.n[500], marginTop: 2 }}>= {equivalents.join("  ·  ")}</div>
          )}
        </div>
      );
    }

    return (
      <div key={f.id} style={{ flex: basis, minWidth: 0 }}>
        <span style={lbl}>{f.label}</span>
        {control}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {fields.map(renderField)}
      </div>

      {/* Vasopressor drug list */}
      {calcId === "vasopressor" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: C.n[500], textTransform: "uppercase", marginBottom: 4 }}>Vasoactive agents</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {VASO_DRUGS.map((name) => {
              const isVaso = name === "vasopressin";
              const units = isVaso ? ["units/min", "units/hr"] : ["mcg/kg/min", "mcg/min", "mg/hr", "mcg/hr", "ng/kg/min"];
              return (
                <div key={name} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ flex: "0 0 120px", fontSize: 11, color: C.n[700], textTransform: "capitalize" }}>{name}</span>
                  <input type="number" inputMode="decimal" placeholder="dose" value={drugDoses[name] || ""}
                    onChange={(e) => setDrugDoses((p) => ({ ...p, [name]: e.target.value }))} style={{ ...inp, flex: 1 }} />
                  <select value={drugUnits[name] || units[0]} onChange={(e) => setDrugUnits((p) => ({ ...p, [name]: e.target.value }))}
                    style={{ ...inp, width: "auto", flexShrink: 0, padding: "6px 4px" }}>
                    {units.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live result */}
      {result && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: C.pri[50], border: `0.5px solid ${C.pri[100]}` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            {(result.score ?? result.value) !== undefined && (
              <span style={{ fontSize: 18, fontWeight: 700, color: C.pri[600] }}>
                {String(result.score ?? result.value)}{result.unit ? <span style={{ fontSize: 12, fontWeight: 500, color: C.n[600] }}> {result.unit}</span> : null}
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 600, color: C.n[800] }}>{result.label}</span>
          </div>
          {result.interpretation && <div style={{ fontSize: 12, color: C.n[700], marginTop: 3 }}>{result.interpretation}</div>}

          {result.details && result.details.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 18px", marginTop: 6 }}>
              {result.details.map((d, i) => (
                <div key={i} style={{ fontSize: 11, color: C.n[600] }}>
                  <span style={{ color: C.n[500] }}>{d.label}: </span>
                  <span style={{ fontWeight: 600, color: C.n[800] }}>{String(d.value)}{d.unit ? " " + d.unit : ""}</span>
                </div>
              ))}
            </div>
          )}
          {result.subResults && result.subResults.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {result.subResults.map((s, i) => (
                <div key={i} style={{ fontSize: 11, color: C.n[600] }}>
                  <span style={{ color: C.n[500] }}>{s.label}: </span>
                  <span style={{ fontWeight: 500, color: C.n[800] }}>{String(s.value)}{s.unit ? " " + s.unit : ""}</span>
                </div>
              ))}
            </div>
          )}
          {result.warnings && result.warnings.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: C.danger[800] }}>
              {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}

          <button onClick={() => onAdd(summaryOf(result))} style={{
            marginTop: 8, padding: "6px 16px", borderRadius: 6, border: "none",
            background: C.pri[400], color: "#fff", fontSize: 11, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}>Add result</button>
        </div>
      )}
    </div>
  );
}
