"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { C, font } from "@/theme";
import { btnPrimary, btnSecondary, btnDisabled, inputSm, pageTitle } from "@/theme/styles";
import RichTextEditor from "@/components/common/RichTextEditor";
import { Loading, LoadError } from "@/components/common/ListState";
import { ApiError, revisionNotesApi, type RevisionNote } from "@/lib/api";
import { sanitizeHtml } from "@/lib/safeHtml";
import { stamp } from "@/lib/stamp";
import { confirmAction } from "@/lib/dialogs";
import { useAuth } from "@/context/AuthContext";
import { onBeforeLogout } from "@/lib/beforeLogout";
import { signedInUser } from "@/lib/signedInUser";
import { afterSave, findMatches, pageCount, revisionNotesPrintHtml, PAGE_HEIGHT_PX, PAGE_WIDTH_PX } from "@/lib/revisionNotes";

// "Revision Notes" (physician's sheet, 18/10/2026, item 4): the signed-in
// doctor's own notebook — "word file er moto": bold and highlight, pages that
// are added as the writing runs on, Print, and Ctrl+F to search a keyword.
//
// What it holds, as the personal note does (client/CLAUDE.md):
//  • ONE text: what was typed since the last save, else the saved notebook.
//    The page shows it, Save sends it, Print prints it.
//  • A save clears only what it SENT; words typed meanwhile stay unsaved.
//  • It saves by itself a moment after typing stops, and when the doctor
//    leaves the tab; a save the server refuses (another screen changed the
//    notebook) keeps the typing on the screen and says so — never lost.
//  • Saves go ONE AT A TIME, each over the copy the last one left, and what is
//    still unsaved when the tab is left is HELD for the signed-in user (in
//    memory, this page) and saved after whatever is on its way; if that save
//    fails it is back on the page on return (review, 18/10/2026: it was lost).

/** How long after the last key the notebook saves itself. */
const AUTOSAVE_MS = 2000;

type Saved = RevisionNote | null;

const CONNECTION = "Not saved — check the connection and press Save. What you typed is still here.";
// The server's own sentence is shown when it gives one; this when the refusal
// is found here (held text whose copy was replaced while the tab was away).
const STALE_HERE = "Your Revision Notes were changed on another screen. What you typed here is kept — use “Show that version” to see theirs first.";
/** Saving by itself waits longer after each failure: 2, 4, 8 … up to 60 s. */
const MAX_BACKOFF_MS = 60_000;

/**
 * The longest notebook that is sent, in characters. Bangla is three bytes a
 * character, so this stays under the server's 8 MB body limit; the DTO holds
 * the same number (`server/src/revision-notes/dto`).
 */
export const REVISION_NOTES_MAX = 2_000_000;
const TOO_LONG = "The notebook is too long to save in one piece. Keep part of it elsewhere, then press Save.";

// Kept across a tab change (the view unmounts), per signed-in user, never in
// storage: what was typed and is not saved yet (and whether the server has
// already refused it as written over an older copy), and the copy the server
// holds as last seen here — the copy held text is written over.
interface Held { html: string; conflict: boolean }
const held = new Map<string, Held>();
const lastSaved = new Map<string, Saved>();
let queue: Promise<unknown> = Promise.resolve();

/** For tests: forget what is held between them. */
export function forgetHeldRevisionNotes() { held.clear(); lastSaved.clear(); queue = Promise.resolve(); }

// While anything is held — the view gone, its own `beforeunload` with it — the
// PAGE asks before it is left; held text is tried again when the connection
// comes back, and saved before a logout, while the session still exists
// (second review, 18/10/2026: it existed only in that tab's memory).
let listening = false;
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeunload", (e) => {
    // Asked of the user whose text it is — another user cannot save it.
    const me = signedInUser();
    if (!me || !held.has(me)) return;
    e.preventDefault();
    e.returnValue = "";
  });
  window.addEventListener("online", () => { void flushAllHeld(); });
  onBeforeLogout(() => flushAllHeld());
}
/**
 * ⚕️ Only the text of the user signed in NOW is ever sent — under their own
 * session. On a shared PC every user's held text went out under whoever was
 * signed in, and one doctor's notes became the next user's notebook (release
 * review, 18/10/2026). Another user's held text waits, unsent, for its owner.
 */
function flushAllHeld(): Promise<void> {
  const me = signedInUser();
  return me && held.has(me) ? flushHeld(me) : Promise.resolve();
}

/** Runs `job` after every request already queued — one at a time. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

/** Hold `html` for `uid` and save it after whatever is on its way. */
function holdForLater(uid: string, html: string, conflict: boolean) {
  held.set(uid, { html, conflict });
  listen();
  void flushHeld(uid);
}

/** Save what is held for `uid`, after whatever is on its way. Kept if it fails. */
function flushHeld(uid: string): Promise<void> {
  return enqueue(async () => {
    if (signedInUser() !== uid) return; // never under another user's session
    const h = held.get(uid);
    const base = lastSaved.get(uid);
    if (!h || h.conflict || base === undefined || h.html.length > REVISION_NOTES_MAX) return;
    if (base && base.html === h.html) { held.delete(uid); return; } // already the saved copy
    try {
      const res = await revisionNotesApi.save({ html: h.html, baseUpdatedAt: base ? base.updatedAt : null });
      lastSaved.set(uid, res);
      if (held.get(uid)?.html === h.html) held.delete(uid);
    } catch (e) {
      // Refused as written over an older copy: it stays a refusal — never
      // turned into an ordinary edit for the next save to push through.
      if (e instanceof ApiError && e.status === 409 && held.get(uid)?.html === h.html) held.set(uid, { ...h, conflict: true });
    }
  }).catch(() => { /* kept in `held`, and shown again on return */ });
}

/** The text nodes under `root`, with where each starts in their joined text. */
function textNodes(root: HTMLElement): { node: Text; at: number }[] {
  const out: { node: Text; at: number }[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let at = 0;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n as Text;
    out.push({ node: t, at });
    at += t.data.length;
  }
  return out;
}

/** A Range over [start, end) of the joined text. */
function rangeOf(nodes: { node: Text; at: number }[], start: number, end: number): Range | null {
  const pos = (i: number, isEnd: boolean) => {
    for (const { node, at } of nodes) {
      const len = node.data.length;
      if (i < at + len || (isEnd && i === at + len)) return { node, off: i - at };
    }
    return null;
  };
  const a = pos(start, false);
  const b = pos(end, true);
  if (!a || !b) return null;
  const r = document.createRange();
  r.setStart(a.node, a.off);
  r.setEnd(b.node, b.off);
  return r;
}

type HighlightRegistry = { set: (n: string, h: unknown) => void; delete: (n: string) => void };
const highlights = (): HighlightRegistry | null => {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const H = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  return css?.highlights && H ? css.highlights : null;
};

/**
 * Scroll the match ITSELF to the middle of the screen. Its element will not do:
 * text typed straight into the page has the whole 1123px page as its element
 * (seen in the browser, 18/10/2026: the page scrolled to its empty middle with
 * the match above the screen). The zoom is on <body>, not on <html>, so the
 * window scrolls in the same screen pixels a Range is measured in.
 */
function bringIntoView(r: Range) {
  if (typeof r.getBoundingClientRect !== "function") return;
  const b = r.getBoundingClientRect();
  if (!b || (!b.width && !b.height)) return;
  if (b.top >= 60 && b.bottom <= window.innerHeight - 40) return; // already in sight
  window.scrollBy({ top: b.top + b.height / 2 - window.innerHeight / 2 });
}

function printNotes(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) { frame.remove(); return; }
  doc.open();
  doc.write(revisionNotesPrintHtml(sanitizeHtml(html), stamp(new Date().toISOString())));
  doc.close();
  setTimeout(() => {
    try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { /* a browser without print */ }
    setTimeout(() => frame.remove(), 1000);
  }, 150);
}

export default function RevisionNotesView() {
  const uid = useAuth().user?.id ?? "";
  const qc = useQueryClient();
  const key = ["revision-notes", uid];
  const query = useQuery({
    queryKey: key,
    // After any save still on its way from a visit to this tab just left.
    queryFn: () => enqueue(() => revisionNotesApi.get()),
    // Asked whatever the browser says about being online: a list that was never
    // asked for must not be drawn as an empty notebook.
    networkMode: "always",
    refetchOnWindowFocus: false,
    // Asked EVERY time the notebook opens, and only that answer is taken
    // (`isFetchedAfterMount`, below). With "never stale", a layout switch (desktop
    // ↔ phone draws the view again in one render) found the answer cached when
    // the notebook was first opened — empty — and showed "Nothing written yet"
    // over a full notebook (seen in the browser, 18/10/2026).
    refetchOnMount: "always",
    gcTime: 0,
  });

  // `undefined` until the notebook has arrived; then the copy edits are based on.
  const [saved, setSaved] = useState<Saved | undefined>(undefined);
  const [edited, setEdited] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  // A refusal that sending again will not change (too long, refused as invalid):
  // no saving by itself until the doctor types again.
  const [hold, setHold] = useState(false);
  // Failed saves in a row (connection, server): saving by itself waits longer.
  const [failures, setFailures] = useState(0);
  const savedRef = useRef<Saved | undefined>(undefined);
  const editedRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const conflictRef = useRef(false);
  savedRef.current = saved;
  editedRef.current = edited;
  conflictRef.current = conflict;

  useEffect(() => {
    if (saved !== undefined || query.data === undefined || !query.isFetchedAfterMount) return;
    const fresh = query.data;
    setSaved(fresh);
    // Typing held from the last visit to this tab, whose save has not landed.
    const kept = held.get(uid);
    const base = lastSaved.get(uid); // the copy that text was written over
    if (kept) {
      held.delete(uid);
      if (kept.html !== (fresh?.html ?? "")) {
        setEdited(kept.html);
        // ⚕️ Refused already, or the server's copy is no longer the one it was
        // written over: a conflict, shown as one — the next save must not write
        // over another screen's version (second review, 18/10/2026). The base
        // stays the OLD copy, so no save goes through until the doctor chooses.
        const replaced = base !== undefined && (base?.updatedAt ?? null) !== (fresh?.updatedAt ?? null);
        if (kept.conflict || replaced) {
          setConflict(true);
          setError(STALE_HERE);
          return;
        }
      }
    }
    lastSaved.set(uid, fresh);
  }, [query.data, query.isFetchedAfterMount, saved, uid]);

  const text = edited ?? saved?.html ?? "";

  const save = useCallback(async () => {
    const sent = editedRef.current;
    if (sent === null || savedRef.current === undefined || savingRef.current || conflictRef.current) return;
    if (sent.length > REVISION_NOTES_MAX) { setError(TOO_LONG); setHold(true); return; }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const res = await enqueue(() => {
        // Over the copy the last save left — also one made after this tab was left.
        const base = lastSaved.has(uid) ? lastSaved.get(uid) : savedRef.current;
        return revisionNotesApi.save({ html: sent, baseUpdatedAt: base ? base.updatedAt : null });
      });
      lastSaved.set(uid, res);
      qc.setQueryData(key, res); // the cache holds the copy that is saved, never an older one
      setSaved(res);
      setFailures(0);
      setEdited((now) => afterSave(now, sent));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        setError(e.message);
      } else if (e instanceof ApiError && (e.status === 400 || e.status === 403 || e.status === 413)) {
        // Sending it again will not change the answer.
        setHold(true);
        setError(e.status === 403 ? e.message : e.status === 413 ? TOO_LONG : "This notebook could not be saved as it is. What you typed is still here.");
      } else {
        setError(CONNECTION);
        setFailures((n) => n + 1);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    // `key` is made of `uid` alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, qc]);

  // Saves by itself once typing has stopped for a moment — and waits longer
  // after each failure in a row: a failing server was asked again every two
  // seconds, for ever (second review, 18/10/2026).
  useEffect(() => {
    if (edited === null || conflict || saving || hold) return;
    const t = setTimeout(() => { void save(); }, Math.min(AUTOSAVE_MS * 2 ** failures, MAX_BACKOFF_MS));
    return () => clearTimeout(t);
  }, [edited, conflict, saving, hold, failures, save]);

  // Leaving the tab HOLDS what is typed and saves it after whatever is on its
  // way; leaving the page asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (editedRef.current !== null) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    // A logout while the notebook is open saves it first, while the session exists.
    const off = onBeforeLogout(async () => {
      const now = editedRef.current;
      if (now === null || savedRef.current === undefined) return;
      held.set(uid, { html: now, conflict: conflictRef.current });
      listen();
      await flushHeld(uid);
    });
    return () => {
      window.removeEventListener("beforeunload", warn);
      off();
      const left = editedRef.current;
      if (left !== null && savedRef.current !== undefined) holdForLater(uid, left, conflictRef.current);
    };
  }, [uid]);

  // After a refusal: the other screen's version, once the doctor agrees to put
  // it in place of what is typed here.
  const takeTheirs = async () => {
    const ok = await confirmAction({
      title: "Show the version saved on the other screen?",
      body: "What you typed here since your last save will be replaced. Copy it first if you need it.",
      confirmLabel: "Show that version",
      danger: true,
    });
    if (!ok) return;
    const r = await query.refetch();
    if (r.isError || r.data === undefined) {
      setError("The version saved on the other screen could not be loaded. Check the connection and try again — what you typed is still here.");
      return;
    }
    lastSaved.set(uid, r.data);
    setSaved(r.data);
    setEdited(null);
    setConflict(false);
    setError("");
  };

  // ── Pages ────────────────────────────────────────────────
  const paperRef = useRef<HTMLDivElement>(null);
  const [surfaceBox, setSurfaceBox] = useState({ top: 0, height: 0 });
  useEffect(() => {
    const el = paperRef.current?.querySelector<HTMLElement>(".rte-surface");
    if (!el) return;
    // From the top of the paper: the editor's own box is positioned too, and
    // `offsetTop` alone left out the toolbar above the writing.
    const measure = () => {
      let top = 0;
      for (let n: HTMLElement | null = el; n && n !== paperRef.current; n = n.offsetParent as HTMLElement | null) top += n.offsetTop;
      setSurfaceBox({ top, height: el.offsetHeight });
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [saved === undefined]);
  const pages = pageCount(surfaceBox.height);

  // ── Search (Ctrl+F) ──────────────────────────────────────
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [current, setCurrent] = useState(0);
  const matches = useMemo(() => {
    const el = paperRef.current?.querySelector<HTMLElement>(".rte-surface");
    if (!el || !q.trim()) return [];
    return findMatches(textNodes(el).map(({ node }) => node.data).join(""), q);
    // `text` is what the surface holds; a change to it is a change to the matches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, text, saved === undefined]);
  const at = matches.length ? Math.min(current, matches.length - 1) : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Mark every match, and bring the current one into view.
  useEffect(() => {
    const el = paperRef.current?.querySelector<HTMLElement>(".rte-surface");
    const reg = highlights();
    if (!el) return;
    if (!matches.length) { reg?.delete("rn-match"); reg?.delete("rn-current"); return; }
    const nodes = textNodes(el);
    const ranges = matches.map((m) => rangeOf(nodes, m.start, m.end)).filter((r): r is Range => !!r);
    const cur = ranges[at];
    if (reg) {
      const H = (globalThis as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
      reg.set("rn-match", new H(...ranges));
      if (cur) reg.set("rn-current", new H(cur)); else reg.delete("rn-current");
    }
    if (cur) bringIntoView(cur);
    return () => { reg?.delete("rn-match"); reg?.delete("rn-current"); };
  }, [matches, at]);

  const step = (by: number) => { if (matches.length) setCurrent((at + by + matches.length) % matches.length); };

  // ── Draw ─────────────────────────────────────────────────
  const statusText = saving ? "Saving…"
    : edited !== null ? "Unsaved changes"
    : saved ? `Saved · ${stamp(saved.updatedAt)}`
    : "Nothing written yet";

  const ready = saved !== undefined;

  return (
    <div style={{ fontFamily: font }}>
      <style>{`::highlight(rn-match){background-color:${C.warn[100]};color:inherit} ::highlight(rn-current){background-color:${C.warn[400]};color:${C.n[900]}}`}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h1 data-title style={{ ...pageTitle, margin: 0 }}>Revision Notes</h1>
          <div style={{ fontSize: 11.5, color: C.n[600], marginTop: 2 }}>Your own notebook — only you can see it.</div>
        </div>
        {ready && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span role="status" aria-label="Save status" style={{ fontSize: 11.5, color: edited !== null ? C.warn[800] : C.n[600] }}>{statusText}</span>
            <button type="button" onClick={() => printNotes(text)} style={btnSecondary("md")}>Print</button>
            <button type="button" onClick={() => { void save(); }} disabled={edited === null || saving || conflict}
              style={{ ...btnPrimary("md"), ...(edited === null || saving || conflict ? btnDisabled : null) }}>Save</button>
          </div>
        )}
      </div>

      {ready && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input ref={searchRef} type="search" aria-label="Search in Revision Notes" placeholder="Search a keyword (Ctrl+F)…" value={q}
            onChange={(e) => { setQ(e.target.value); setCurrent(0); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
              else if (e.key === "Escape" && q) { e.preventDefault(); setQ(""); }
            }}
            style={{ ...inputSm, flex: "1 1 220px", maxWidth: 360 }} />
          {q.trim() && (
            <>
              <span style={{ fontSize: 12, color: C.n[700], minWidth: 56 }}>{matches.length ? `${at + 1} of ${matches.length}` : "No match"}</span>
              <button type="button" aria-label="Previous match" onClick={() => step(-1)} disabled={!matches.length} style={{ ...btnSecondary("sm"), ...(matches.length ? null : btnDisabled) }}>▲</button>
              <button type="button" aria-label="Next match" onClick={() => step(1)} disabled={!matches.length} style={{ ...btnSecondary("sm"), ...(matches.length ? null : btnDisabled) }}>▼</button>
            </>
          )}
          <span style={{ fontSize: 11.5, color: C.n[600], marginLeft: "auto" }}>{pages} {pages === 1 ? "page" : "pages"}</span>
        </div>
      )}

      {error && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 12px", marginBottom: 10, borderRadius: 8, background: C.warn[50], color: C.warn[800], fontSize: 12.5 }}>
          <span style={{ flex: "1 1 240px" }}>{error}</span>
          {conflict && <button type="button" onClick={() => { void takeTheirs(); }} style={btnSecondary("sm")}>Show that version</button>}
        </div>
      )}

      {query.isError && !ready ? (
        <LoadError title="Your Revision Notes could not be loaded." detail="Check your internet connection and try again." onRetry={() => { void query.refetch(); }} retrying={query.isFetching} />
      ) : !ready ? (
        <Loading label="Opening your Revision Notes…" />
      ) : (
        // A page of A4, with a line where each page ends: the notebook grows a
        // page at a time as it is written, as Word does.
        <div ref={paperRef} style={{ position: "relative", width: `min(${PAGE_WIDTH_PX}px, 100%)`, margin: "0 auto" }}>
          <style>{`@media (max-width: 1100px) { .rn-page-label { display: none; } }`}</style>
          <div style={{ border: `0.5px solid ${C.n[200]}`, borderRadius: 8, overflow: "hidden" }}>
            <RichTextEditor value={text} onChange={(html) => { setHold(false); setEdited(html === (saved?.html ?? "") ? null : html); }}
              minHeight={PAGE_HEIGHT_PX} placeholder="Write your notes here…" highlight allowImages={false} />
          </div>
          {/* Where a page ends: a short tick in each margin, and "Page N" beside
              the paper where the screen has room. Never a line across the page:
              one ran through a line of writing, which then read as struck out
              (seen in the browser, 18/10/2026). The count above says it on a
              narrow screen. */}
          {Array.from({ length: pages - 1 }, (_, i) => (
            <div key={i} aria-hidden data-page-end={String(i + 2)}
              style={{ position: "absolute", top: surfaceBox.top + (i + 1) * PAGE_HEIGHT_PX, width: "100%", height: 0, pointerEvents: "none" }}>
              <span data-tick style={{ position: "absolute", left: 0, top: 0, width: 10, borderTop: `1px solid ${C.n[400]}` }} />
              <span data-tick style={{ position: "absolute", right: 0, top: 0, width: 10, borderTop: `1px solid ${C.n[400]}` }} />
              <span className="rn-page-label" style={{ position: "absolute", left: "calc(100% + 8px)", top: -7, fontSize: 10.5, color: C.n[500], whiteSpace: "nowrap" }}>Page {i + 2}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
