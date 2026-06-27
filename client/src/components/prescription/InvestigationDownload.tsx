"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { C, font } from "@/theme";
import { useMuqsit } from "@/context/MuqsitContext";
import { type InvFinding, filterByDate, groupByDate, groupByCategory } from "@/lib/investigationSummary";

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const isoToMs = (iso: string) => (iso ? new Date(iso + "T00:00:00").getTime() : null);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Download the patient's investigation history as PDF or Excel, filtered by date
// window + category, grouped by date or category (3.docx records request).
export default function InvestigationDownload({ findings, onClose }: { findings: InvFinding[]; onClose: () => void }) {
  const { ptName, ptAge, ptPhone, ptAddress, ptInfo } = useMuqsit();
  const [dateMode, setDateMode] = useState<"all" | "6m" | "12m" | "custom">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [groupMode, setGroupMode] = useState<"date" | "category">("date");
  const [category, setCategory] = useState("all");

  const categories = useMemo(() => Array.from(new Set(findings.map((f) => f.category))).sort(), [findings]);

  const filtered = useMemo(() => {
    const now = new Date();
    let fromMs: number | null = null;
    let toMs: number | null = null;
    if (dateMode === "6m") fromMs = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()).getTime();
    else if (dateMode === "12m") fromMs = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).getTime();
    else if (dateMode === "custom") { fromMs = isoToMs(from); toMs = isoToMs(to); if (toMs != null) toMs += 86400000 - 1; }
    let list = filterByDate(findings, fromMs, toMs);
    if (category !== "all") list = list.filter((f) => f.category === category);
    return list;
  }, [findings, dateMode, from, to, category]);

  const demo: [string, string][] = [
    ["Name", ptName || "—"],
    ["Age", ptAge || "—"],
    ["Mobile", ptPhone || "—"],
    ["NID", ptInfo.nid || "—"],
    ["Address", ptAddress || "—"],
  ];

  const ordered = () =>
    groupMode === "date"
      ? groupByDate(filtered).flatMap((g) => g.items)
      : groupByCategory(filtered).flatMap((g) => g.items);

  const downloadPdf = () => {
    let body = "";
    if (groupMode === "date") {
      body = groupByDate(filtered).map((g) =>
        `<div class="grp"><div class="gh">${esc(g.date)}</div>${g.items.map((f) =>
          `<div class="row"><span class="t">${esc(f.category)} &middot; ${esc(f.test)}</span><span class="v">${esc(f.value)}</span></div>`).join("")}</div>`).join("");
    } else {
      body = groupByCategory(filtered).map((g) =>
        `<div class="grp"><div class="gh">${esc(g.category)}</div>${g.items.map((f) =>
          `<div class="row"><span class="t">${esc(f.date)} &middot; ${esc(f.test)}</span><span class="v">${esc(f.value)}</span></div>`).join("")}</div>`).join("");
    }
    const demoHtml = demo.map(([k, v]) => `<div><span>${esc(k)}:</span> <b>${esc(v)}</b></div>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Investigation summary — ${esc(ptName || "Patient")}</title>
<style>
  *{box-sizing:border-box}@page{size:A4;margin:0}
  body{font-family:"DM Sans",Arial,sans-serif;color:#1a1a1a;margin:0;background:#f0f0f0}
  .toolbar{position:sticky;top:0;background:#1d9e75;padding:10px;text-align:center;z-index:10}
  .toolbar button{background:#fff;color:#0f6e56;border:none;padding:8px 22px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;margin:0 4px}
  .sheet{background:#fff;width:8.27in;min-height:11.69in;margin:16px auto;padding:0.5in 0.5in;box-shadow:0 2px 12px rgba(0,0,0,.15)}
  h1{font-size:17px;color:#0f6e56;margin:0 0 2px}
  .printed{font-size:11px;color:#6b6b6b;margin-bottom:10px}
  .pt{display:grid;grid-template-columns:1fr 1fr;gap:3px 24px;font-size:12.5px;border:1px solid #e5e5e3;border-radius:8px;padding:10px 14px;margin-bottom:14px}
  .pt span{color:#6b6b6b}
  .grp{margin-bottom:12px}
  .gh{font-size:12px;font-weight:700;color:#0f6e56;border-bottom:1px solid #1d9e75;padding-bottom:2px;margin-bottom:4px}
  .row{display:flex;justify-content:space-between;font-size:12.5px;padding:2px 0;border-bottom:0.5px solid #eee}
  .t{color:#333}.v{font-weight:600;color:#0f6e56;white-space:nowrap;padding-left:14px}
  @media print{.toolbar{display:none}body{background:#fff}.sheet{box-shadow:none;margin:0}}
</style></head><body>
  <div class="toolbar"><button onclick="window.print()">🖨️ Print / Save as PDF</button><button onclick="window.close()">Close</button></div>
  <div class="sheet">
    <h1>Investigation reports summary</h1>
    <div class="printed">Printed: ${esc(todayStr())}</div>
    <div class="pt">${demoHtml}</div>
    ${body || '<div style="font-size:12.5px;color:#999">No findings in the selected range.</div>'}
  </div>
</body></html>`;
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) { window.alert("Please allow pop-ups to download the PDF."); return; }
    w.document.write(html);
    w.document.close();
  };

  const downloadXlsx = () => {
    const aoa: (string | number)[][] = [];
    aoa.push(["Investigation reports summary"]);
    aoa.push(["Printed", todayStr()]);
    demo.forEach(([k, v]) => aoa.push([k, v]));
    aoa.push([]);
    aoa.push(["Date", "Category", "Test", "Value"]);
    ordered().forEach((f) => aoa.push([f.date, f.category, f.test, f.value]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 26 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Investigations");
    const safe = (ptName || "patient").replace(/[^a-z0-9]+/gi, "_");
    XLSX.writeFile(wb, `Investigations_${safe}.xlsx`);
  };

  const seg = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: font,
    border: `1px solid ${active ? C.pri[400] : C.n[200]}`, background: active ? C.pri[50] : C.n[0],
    color: active ? C.pri[600] : C.n[700], fontWeight: active ? 600 : 400,
  });
  const inp: React.CSSProperties = { padding: "6px 10px", borderRadius: 7, border: `0.5px solid ${C.n[200]}`, fontSize: 12, outline: "none", fontFamily: font };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: C.n[600], textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,32,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500, fontFamily: font, padding: 16 }}>
      <div style={{ background: C.n[0], borderRadius: 14, padding: 22, width: 480, maxWidth: "100%", boxShadow: "0 18px 50px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.n[900] }}>Download investigation summary</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: C.n[500], cursor: "pointer" }}>×</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={lbl}>By date</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setDateMode("all")} style={seg(dateMode === "all")}>All dates</button>
            <button onClick={() => setDateMode("6m")} style={seg(dateMode === "6m")}>Last 6 months</button>
            <button onClick={() => setDateMode("12m")} style={seg(dateMode === "12m")}>Last 12 months</button>
            <button onClick={() => setDateMode("custom")} style={seg(dateMode === "custom")}>Select dates</button>
          </div>
          {dateMode === "custom" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
              <label style={{ fontSize: 12, color: C.n[600] }}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} /></label>
              <label style={{ fontSize: 12, color: C.n[600] }}>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} /></label>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 20, marginBottom: 18, flexWrap: "wrap" }}>
          <div>
            <div style={lbl}>By category</div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inp, cursor: "pointer", minWidth: 170 }}>
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={lbl}>Group by</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setGroupMode("date")} style={seg(groupMode === "date")}>Date</button>
              <button onClick={() => setGroupMode("category")} style={seg(groupMode === "category")}>Category</button>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: C.n[500], marginBottom: 14 }}>{filtered.length} finding{filtered.length === 1 ? "" : "s"} in selection.</div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={downloadPdf} disabled={!filtered.length} style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: filtered.length ? C.pri[400] : C.n[200], color: filtered.length ? "#fff" : C.n[500], fontSize: 13, fontWeight: 600, cursor: filtered.length ? "pointer" : "not-allowed", fontFamily: font }}>📄 PDF</button>
          <button onClick={downloadXlsx} disabled={!filtered.length} style={{ padding: "10px 20px", borderRadius: 9, border: `0.5px solid ${C.pri[400]}`, background: C.n[0], color: filtered.length ? C.pri[600] : C.n[400], fontSize: 13, fontWeight: 600, cursor: filtered.length ? "pointer" : "not-allowed", fontFamily: font }}>📊 Excel</button>
        </div>
      </div>
    </div>
  );
}
