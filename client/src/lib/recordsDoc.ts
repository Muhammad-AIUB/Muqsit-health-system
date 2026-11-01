// A printable page of one history section of the records page (Download).
// Its own HTML in a window of its own, like the investigation summary's: it
// imports no theme and is the same in night mode (`rawColours.test.ts` SKIP).
//
// ⚕️ Shows exactly what is listed on the screen, every line whole — nothing is
// cut to fit; long text wraps.

export interface DocLine { text: string; indent?: boolean; muted?: boolean }
export interface DocGroup { heading: string; lines: DocLine[] }

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildRecordsDoc(opts: {
  title: string;
  printed: string; // dd/mm/yyyy
  patient: [string, string][];
  groups: DocGroup[];
}): string {
  const body = opts.groups.map((g) =>
    `<div class="grp"><div class="gh">${esc(g.heading)}</div>${g.lines.map((l) =>
      `<div class="row${l.indent ? " ind" : ""}${l.muted ? " mut" : ""}">${esc(l.text)}</div>`).join("")}</div>`).join("");
  const pt = opts.patient.map(([k, v]) => `<div><span>${esc(k)}:</span> <b>${esc(v || "—")}</b></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(opts.title)}</title>
<style>
  *{box-sizing:border-box}@page{size:A4;margin:0}
  body{font-family:"DM Sans",Arial,sans-serif;color:#1a1a1a;margin:0;background:#f0f0f0}
  .toolbar{position:sticky;top:0;background:#1a73e8;padding:10px;text-align:center;z-index:10}
  .toolbar button{background:#fff;color:#185abc;border:none;padding:8px 22px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;margin:0 4px}
  .sheet{background:#fff;width:8.27in;min-height:11.69in;margin:16px auto;padding:0.5in;box-shadow:0 2px 12px rgba(0,0,0,.15)}
  h1{font-size:17px;color:#185abc;margin:0 0 2px}
  .printed{font-size:11px;color:#6b6b6b;margin-bottom:10px}
  .pt{display:grid;grid-template-columns:1fr 1fr;gap:3px 24px;font-size:12.5px;border:1px solid #e5e5e3;border-radius:8px;padding:10px 14px;margin-bottom:14px}
  .pt span{color:#6b6b6b}
  .grp{margin-bottom:12px;break-inside:avoid-page}
  .gh{font-size:12px;font-weight:700;color:#185abc;border-bottom:1px solid #1a73e8;padding-bottom:2px;margin-bottom:4px}
  .row{font-size:12.5px;padding:3px 0;border-bottom:0.5px solid #eee;white-space:pre-wrap;overflow-wrap:anywhere}
  .row.ind{padding-left:18px}
  .row.mut{color:#6b6b6b;font-style:italic}
  @media print{.toolbar{display:none}body{background:#fff}.sheet{box-shadow:none;margin:0}}
</style></head><body>
  <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></div>
  <div class="sheet">
    <h1>${esc(opts.title)}</h1>
    <div class="printed">Printed: ${esc(opts.printed)}</div>
    <div class="pt">${pt}</div>
    ${body || '<div style="font-size:12.5px;color:#999">Nothing recorded.</div>'}
  </div>
</body></html>`;
}
