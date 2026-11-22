"use client";

import { useEffect, useState } from "react";
import { adminApi, ApiError, type DoctorSettings, type PointScoresAnswer, type Registration } from "@/lib/api";
import { buildScoresBody, draftsFrom, isChanged, POINT_MAX, POINT_MIN, SCORE_PROBLEM } from "@/lib/points";
import { Dialog, type Question } from "../../Dialog";
import { btnOff, btnPri, C, card, errBox, h2, note } from "./ui";
import { useLoad } from "./useLoad";

// Account → "Profile settings" (physician's sheet, 16/11/2026): two switches and
// the Point system.

const two = (n: number) => String(n).padStart(2, "0");
// dd/mm/yyyy, hh:mm — written out, never `toLocaleString()` (admin/CLAUDE.md).
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`;
};

export default function ProfileSettings({ reg, onSettings }: { reg: Registration; onSettings: (s: DoctorSettings) => void }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Switches reg={reg} onSettings={onSettings} />
      <PointSystem id={reg.id} />
    </div>
  );
}

// ── The two switches ───────────────────────────────────────────────────
// Each is saved the moment it is ticked, after asking, and the box shows what the
// SERVER answered — never what was pressed. A switch that failed is the same box
// with OK only, and stays as it was.
function Switches({ reg, onSettings }: { reg: Registration; onSettings: (s: DoctorSettings) => void }) {
  const [busy, setBusy] = useState<keyof DoctorSettings | null>(null);
  const [ask, setAsk] = useState<(Question & { answer: (ok: boolean) => void }) | null>(null);
  const [failed, setFailed] = useState("");

  const change = async (key: keyof DoctorSettings, next: boolean, question: Question) => {
    const ok = await new Promise<boolean>((answer) => setAsk({ ...question, answer }));
    setAsk(null);
    if (!ok) return;
    setBusy(key);
    try {
      onSettings(await adminApi.updateSettings(reg.id, { [key]: next }));
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "The change was not made. Check your internet connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const who = reg.name;
  return (
    <section style={card} aria-labelledby="ps-switches">
      <h2 id="ps-switches" style={h2}>Profile settings</h2>

      <Switch
        id="isolated"
        checked={reg.isolated}
        busy={busy === "isolated"}
        title="Isolate this doctor's system from others"
        text="Ticked: this doctor's patients cannot be opened by another doctor with the patient's code, and this doctor cannot open another doctor's patients. Everything stays inside this doctor's own system."
        onChange={(next) =>
          void change("isolated", next, next
            ? { title: `Isolate ${who}'s system?`, body: "Another doctor will no longer be able to open this doctor's patients with the patient's code, and this doctor will no longer be able to open other doctors' patients. This also closes access already given.", confirm: "Isolate" }
            : { title: `Stop isolating ${who}'s system?`, body: "Other doctors will be able to open this doctor's patients with the patient's code again, and this doctor will be able to open other doctors' patients. Access that was given before is open again.", confirm: "Stop isolating" })}
      />
      <Switch
        id="hideMhsLogo"
        checked={reg.hideMhsLogo}
        busy={busy === "hideMhsLogo"}
        title="Remove MHS logo"
        text="Ticked: the MHS mark is taken off this doctor's screens and off the printed prescription. “By EXHORT” stays."
        onChange={(next) =>
          void change("hideMhsLogo", next, next
            ? { title: `Remove the MHS logo for ${who}?`, body: "It will be gone from this doctor's screens and from every prescription this doctor prints from now on. “By EXHORT” stays.", confirm: "Remove logo" }
            : { title: `Show the MHS logo again for ${who}?`, body: "It will be back on this doctor's screens and on printed prescriptions.", confirm: "Show logo" })}
      />

      {ask && <Dialog title={ask.title} body={ask.body} confirm={ask.confirm} danger={ask.danger} onAnswer={ask.answer} />}
      {failed && <Dialog title="That did not work" body={failed} onAnswer={() => setFailed("")} />}
    </section>
  );
}

function Switch({ id, checked, busy, title, text, onChange }: { id: string; checked: boolean; busy: boolean; title: string; text: string; onChange: (next: boolean) => void }) {
  return (
    <label htmlFor={`ps-${id}`} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 0", borderTop: `1px solid ${C.border}`, marginTop: 12, cursor: busy ? "wait" : "pointer" }}>
      <input
        id={`ps-${id}`}
        type="checkbox"
        checked={checked}
        disabled={busy}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, accentColor: C.pri }}
      />
      <span>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: C.n900 }}>{title}</span>
        <span style={{ ...note, display: "block", marginTop: 2 }}>{text}</span>
      </span>
    </label>
  );
}

// ── Point system ───────────────────────────────────────────────────────
// Ten criteria, a whole number 1–10 each, kept as typed. The boxes show what was
// SAVED (the server's answer after Save), never what was pressed; a box with
// something wrong says so under itself and nothing is sent until every box is
// right. An empty box is "not scored", not 0.
function PointSystem({ id }: { id: string }) {
  const loaded = useLoad<PointScoresAnswer>(() => adminApi.getPointScores(id), `points:${id}`, "Could not load the point system.");
  const [saved, setSaved] = useState<PointScoresAnswer | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  const take = (a: PointScoresAnswer) => {
    setSaved(a);
    setDrafts(draftsFrom(a.criteria.map((c) => c.key), a.scores));
    setProblems({});
  };
  useEffect(() => { if (loaded.data) take(loaded.data); }, [loaded.data]);

  if (loaded.error) {
    return <section style={card}><div style={{ ...errBox, display: "flex", gap: 10, alignItems: "center" }}><span>{loaded.error}</span><button type="button" onClick={loaded.retry} style={{ ...btnPri, padding: "6px 12px" }}>Try again</button></div></section>;
  }
  if (!saved) {
    return <section style={card}><div role="status" style={{ fontSize: 12.5, color: C.n600 }}>Loading the point system…</div></section>;
  }

  const keys = saved.criteria.map((c) => c.key);
  const dirty = isChanged(keys, drafts, saved.scores);
  const canSave = dirty && !busy;

  const save = async () => {
    const body = buildScoresBody(keys, drafts);
    if (!body.ok) {
      setProblems(body.problems);
      return;
    }
    setBusy(true);
    setJustSaved(false);
    try {
      take(await adminApi.savePointScores(id, body.scores));
      setJustSaved(true);
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "The scores were not saved. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={card} aria-labelledby="ps-points">
      <h2 id="ps-points" style={h2}>Point system</h2>
      <div style={{ ...note, margin: "2px 0 12px" }}>
        A value from {POINT_MIN} to {POINT_MAX} for each. Only you see these; the doctor does not.
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (canSave) void save(); }}>
        <div style={{ display: "grid", gap: 6, maxWidth: 460 }}>
          {saved.criteria.map((c) => {
            const problem = problems[c.key];
            return (
              <div key={c.key}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label htmlFor={`pt-${c.key}`} style={{ flex: 1, fontSize: 13.5, color: C.n900 }}>{c.label}</label>
                  <input
                    id={`pt-${c.key}`}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={2}
                    value={drafts[c.key] ?? ""}
                    aria-invalid={!!problem}
                    aria-describedby={problem ? `pt-${c.key}-problem` : undefined}
                    disabled={busy}
                    onChange={(e) => { setDrafts((d) => ({ ...d, [c.key]: e.target.value })); setProblems((p) => { const { [c.key]: _gone, ...rest } = p; return rest; }); setJustSaved(false); }}
                    style={{ width: 64, padding: "8px 10px", borderRadius: 8, border: `1px solid ${problem ? C.danger : C.border}`, fontSize: 13.5, textAlign: "center", fontFamily: "inherit", fontVariantNumeric: "tabular-nums", outline: "none" }}
                  />
                  <span style={{ width: 28, fontSize: 13.5, color: C.n600 }}>/{POINT_MAX}</span>
                </div>
                {problem && <div id={`pt-${c.key}-problem`} role="alert" style={{ fontSize: 12, color: C.dangerDark, textAlign: "right", marginTop: 2 }}>{problem}</div>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <button type="submit" disabled={!canSave} style={{ ...btnPri, ...(canSave ? {} : btnOff) }}>{busy ? "Saving…" : "Save"}</button>
          <span role="status" style={{ fontSize: 12.5, color: justSaved ? C.okDark : C.n600 }}>
            {justSaved ? "Saved." : saved.updatedAt ? `Last saved ${stamp(saved.updatedAt)}` : "Not saved yet."}
          </span>
        </div>
        <div style={{ ...note, fontSize: 11.5, marginTop: 8 }}>{SCORE_PROBLEM} A box left empty is not scored.</div>
      </form>
      {failed && <Dialog title="Not saved" body={failed} onAnswer={() => setFailed("")} />}
    </section>
  );
}
