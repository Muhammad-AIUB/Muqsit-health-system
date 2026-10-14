"use client";

import { memo, startTransition, useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { C, font } from "@/theme";
import { btnClose, btnDisabled, btnPrimary, btnSecondary, dialogTitle, inputSm, scrim, shadowDialog } from "@/theme/styles";
import { useDialog } from "@/lib/useDialog";
import { ApiError } from "@/lib/api";
import { Loading, LoadError } from "@/components/common/ListState";
import EmptyState from "@/components/common/EmptyState";
import { splitDrugLabel } from "@/lib/rxShorthand";
import { lastUsedLabel } from "@/lib/lastUsed";
import { grouped } from "@/lib/calculators/format";
import {
  bulkSummary, bulkToRxItems, instructionOf, medicinesOnPad, nothingAddedNote, patientsLabel, searchBulk,
  sortBulk, type BulkList, type BulkMedicine, type BulkOrder,
} from "@/lib/bulkMedicines";
import type { RxItem } from "@/types";

// The "Add Bulk Medicine" box: a doctor's own medicines, each with its usual
// instruction, ticked and added to the ℞ pad in one press.
//
// ⚕️ The box only ever ADDS, and only what is ticked. It fills in nothing — a
// cell the doctor left blank when prescribing is added blank — and it changes
// nothing that is on the pad. Every rule about the medicines is in
// `lib/bulkMedicines.ts`; this component holds the ticks, the order and the
// search. It is mounted only while it is open, so every opening starts clean:
// a tick left from the last one is not a choice made for this prescription.

/**
 * What the box has to show: the list is on its way, it did not arrive, or it
 * is here. One of the three, always — "No medicines yet" belongs to the third
 * alone, and a box that could hold a list AND an error at once has to decide
 * which to believe (`bulkBoxState` in BulkMedicineBox.tsx decides it, once).
 */
export type BulkBoxState =
  | { status: "asking" }
  | { status: "failed"; error: unknown; retry: () => void }
  | { status: "list"; list: BulkList };

interface Props {
  state: BulkBoxState;
  onClose: () => void;
  /** What the ℞ pad holds: its medicines are marked, and a line already there is not added again. */
  existing: RxItem[];
  /** The lines to append to the pad, and the sentence that says what happened. */
  onAdd: (items: RxItem[], summary: string) => void;
}

// The line under "could not be loaded". A refusal (403) is worded by the
// server for a person and is shown. Nothing else it says is: "Internal server
// error", "Unauthorized", "Cannot GET /api/…" and "ThrottlerException" are
// the framework's words. No answer at all leaves `LoadError` its own line
// about the connection — which is not what failed when the server did answer.
const reasonOf = (error: unknown): string | undefined => {
  if (!(error instanceof ApiError)) return undefined;
  return error.status === 403 ? error.message : "The server could not answer. Please try again in a moment.";
};

const NONE: BulkMedicine[] = [];
const ORDERS: { key: BulkOrder; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "alphabetical", label: "Alphabetical" },
];
const PAGE = 10; // rows a Page key moves by
const SETTLE_FRAMES = 4; // frames over which the row a key has reached is asked into view

// A mouse or a trackpad: someone who can type at once. Not asked on a touch
// screen, where focusing the search raises the keyboard over half the list.
const hasKeyboardAtHand = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;

interface RowProps {
  m: BulkMedicine;
  on: boolean;
  /** This medicine already has a line on the pad, at this dose or another. */
  onPad: boolean;
  /** The one row Tab lands on; the arrows move along the rest. */
  tabStop: boolean;
  onToggle: (id: string) => void;
  onReach: (id: string) => void;
}

// One medicine. Its own component so that a tick redraws ONE row: the list can
// be two thousand long.
//
// And a row that is out of sight is not laid out or painted until it is
// scrolled to (`ROW_OUT_OF_SIGHT`). Timed in Chromium on a production build,
// with a made-up list of 2,000 (2026-10-14): drawing the box on opening took
// 1.3 s without this and 0.65 s with it, changing the order 0.9–1.1 s and
// 0.2–0.3 s; a tick is the same either way. Every row is still in the page,
// and the keyboard reaches one that was never drawn (a journey holds it). A
// browser that does not know the two properties draws every row, as before. 48px
// stands for what a row HOLDS until it has been drawn once: a row with a
// generic and no tapering lines measures 67 with its padding and its rule.
// (Not 67: the padding is added to this number, and written as 67 every row
// not yet drawn stood 18px taller than it is — caught in review.)
const ROW_OUT_OF_SIGHT = { contentVisibility: "auto", containIntrinsicSize: "auto 48px" } as const;

const BulkRow = memo(function BulkRow({ m, on, onPad, tabStop, onToggle, onReach }: RowProps) {
  const { before, name, after } = splitDrugLabel(m.drugLabel);
  // The strength is one piece: a long name wraps, and wrapped anywhere a
  // combination's strength turned in its middle — "… 10" at a line's end and
  // "mg+40 mg+25 mg" on the next. As a piece it goes to the next line whole.
  // The text is the label's, unchanged.
  const strength = after.trimStart();
  const gap = after.slice(0, after.length - strength.length);
  const instruction = instructionOf(m);
  const when = lastUsedLabel(m.lastUsedAt);
  return (
    <label style={{ ...ROW_OUT_OF_SIGHT, display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 20px", cursor: "pointer", borderBottom: `0.5px solid ${C.n[200]}`, background: on ? C.pri[50] : "transparent" }}>
      <input type="checkbox" checked={on} tabIndex={tabStop ? 0 : -1} onChange={() => onToggle(m.id)} onFocus={() => onReach(m.id)}
        style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {/* Only the brand in bold, as on the pad and the printed sheet. */}
        <span data-name style={{ display: "block", fontSize: 13, color: C.n[900], overflowWrap: "anywhere" }}>
          {name ? (
            <>{before}<b>{name}</b>{gap}{strength && <span data-strength style={{ display: "inline-block", maxWidth: "100%" }}>{strength}</span>}</>
          ) : <b>{m.drugLabel}</b>}
        </span>
        {/* The generic is what the prescribing warnings are written against. A
            row without one is a medicine they will not see — as when it is typed
            by hand — and here that can be seen before it is ticked. */}
        {m.generic && <span data-generic style={{ display: "block", fontSize: 11, color: C.n[500], overflowWrap: "anywhere" }}>{m.generic}</span>}
        {/* A blank cell is simply absent. A first line saved with nothing
            beside it says so: it is added with nothing beside it. */}
        <span style={{ display: "block", fontSize: 12, color: instruction ? C.n[700] : C.n[500], marginTop: 2, overflowWrap: "anywhere" }}>
          {instruction || "No dose recorded"}
        </span>
        {m.contLines.map((c, i) => (
          <span key={i} style={{ display: "block", fontSize: 12, color: C.n[700], marginTop: 1, overflowWrap: "anywhere" }}>↳ {instructionOf(c)}</span>
        ))}
      </span>
      <span style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, fontSize: 11, color: C.n[500], whiteSpace: "nowrap", marginTop: 2 }}>
        {onPad && (
          <span data-on-pad title="This medicine is already on the prescription. Ticked, it is added as another line — unless its first line there is the same."
            style={{ padding: "1px 7px", borderRadius: 999, background: C.warn[50], color: C.warn[800], fontWeight: 600 }}>On ℞</span>
        )}
        {/* The count and the date together: a dose given to many patients two
            years ago must not read like the dose of last week. */}
        <span>{patientsLabel(m.patientCount)}</span>
        {when && <span>{when}</span>}
      </span>
    </label>
  );
});

export default function BulkMedicineModal({ state, onClose, existing, onAdd }: Props) {
  const [order, setOrder] = useState<BulkOrder>("popular");
  // What is typed, and what the rows are drawn for. The rows follow a moment
  // behind (`seek`): a long list is re-drawn between key presses, not during
  // one, so typing stays quick however long it is.
  const [search, setSearch] = useState("");
  const [sought, setSought] = useState("");
  const typed = useRef("");
  // A mouse or a trackpad at hand: asked once, when the box opens.
  const [keys] = useState(hasKeyboardAtHand);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState("");
  const [reached, setReached] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pressedVeil = useRef(false);
  // The row the keyboard has just reached, while it is being settled into view.
  const settling = useRef<Element | null>(null);

  const list = state.status === "list" ? state.list : null;
  const all = list?.medicines ?? NONE;
  const sorted = useMemo(() => sortBulk(all, order), [all, order]);
  const shown = useMemo(() => searchBulk(sorted, sought), [sorted, sought]);
  const seek = (q: string) => {
    typed.current = q;
    setSearch(q);
    startTransition(() => setSought(q));
  };
  // ⚕️ Tab never lands on a row the search has already dismissed. It is the
  // keyboard's way from the search box to the rows, and before it lands the
  // rows are brought up to what is typed — or `napa`, Tab, Space on a slow
  // machine ticked the first row of the list as it stood BEFORE the search.
  // (A pointer ticks the row it is on, which is the row that is seen.)
  const catchUp = () => flushSync(() => setSought(typed.current));
  // The rows whose medicine stands on the pad — worked out when the list or
  // the pad changes, not at every tick: telling whether two labels are one
  // medicine rewrites both, and for two thousand rows that was some 0.02 s on
  // every tick, every letter of a search and every press of an arrow.
  const onPad = useMemo(() => {
    const there = medicinesOnPad(existing);
    const ids = new Set<string>();
    if (there.size) for (const m of all) if (there.has(m.drugLabel)) ids.add(m.id);
    return ids;
  }, [all, existing]);

  const toggle = useCallback((id: string) => {
    setNote(""); // it was about the last press
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Counted over the whole list, in the order on screen — not over what a
  // search leaves in view: a tick on a row that is filtered out is still a
  // tick. A tick whose row is no longer in the list is not one.
  const chosen = sorted.filter((m) => picked.has(m.id));
  const count = chosen.length;
  // Ticks a search has put out of sight are added all the same, so the footer
  // says they are there: a medicine must not reach the pad unseen.
  const outOfSight = count - shown.filter((m) => picked.has(m.id)).length;
  // The list is ONE Tab stop. Tab goes search → list → Cancel → Add; inside the
  // list the arrows move and Space ticks. A stop on every row put two hundred
  // presses of Tab between the search and Add.
  const tabStop = shown.some((m) => m.id === reached) ? reached : shown[0]?.id ?? null;

  const moveAlongList = (e: KeyboardEvent<HTMLDivElement>) => {
    const boxes = Array.from(listRef.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []);
    const at = boxes.indexOf(e.target as HTMLInputElement);
    if (at === -1) return;
    const to = e.key === "ArrowDown" ? at + 1 : e.key === "ArrowUp" ? at - 1
      : e.key === "PageDown" ? at + PAGE : e.key === "PageUp" ? at - PAGE
      : e.key === "Home" ? 0 : e.key === "End" ? boxes.length - 1 : null;
    if (to === null) return;
    e.preventDefault(); // these keys move the tick mark's place, not the page
    const next = boxes[Math.max(0, Math.min(boxes.length - 1, to))];
    if (!next) return;
    next.focus();
    // ⚕️ A row that has the focus and is not on screen is ticked unseen. The
    // focus brings the row into view by where it stands NOW — and the rows
    // that came near with it are drawn a frame later, taller than the space
    // kept for them, and push it out again. Chromium holds the page still
    // through that (scroll anchoring); a browser without it does not — Safari
    // is documented as having none, and was not run. So the row is asked into
    // view on each of the next few frames (one ask, a frame later, came before
    // the rows were drawn: in Chromium with anchoring switched off, End left
    // the last row below the edge — second review, before release). Then it
    // is left alone, and a key pressed meanwhile takes over.
    const row = next.closest("label");
    if (!row || typeof requestAnimationFrame !== "function") return;
    settling.current = row;
    const ask = (left: number) => requestAnimationFrame(() => {
      if (settling.current !== row) return;
      row.scrollIntoView?.({ block: "nearest" });
      if (left > 1) ask(left - 1);
      else settling.current = null;
    });
    ask(SETTLE_FRAMES);
  };

  const add = () => {
    if (count === 0) return;
    const result = bulkToRxItems(chosen, existing);
    if (result.added === 0) {
      // Nothing to hand over: closing now would look as if it had worked.
      setNote(nothingAddedNote(count, result.otherTaper));
      return;
    }
    onAdd(result.items, bulkSummary(result));
    onClose();
  };

  // ⚕️ With medicines ticked, only Add, Cancel and the × leave the box. A
  // press on the veil and Escape close it while nothing is ticked; with ticks
  // they say how to close instead. A stray press beside the box threw every
  // tick away without a word — and so did Escape, which is also the key that
  // clears the search: pressed once too often, it emptied the box.
  const leave = () => {
    if (count === 0) { onClose(); return; }
    setNote(`${count} ${count === 1 ? "medicine is" : "medicines are"} ticked. Press Add to add ${count === 1 ? "it" : "them"}, or Cancel to close without adding.`);
  };
  const dialog = useDialog(true, leave);
  // Not a press that began inside the box (a drag to select text, let go outside).
  const veilPressed = () => { if (pressedVeil.current) leave(); };

  const notes: string[] = [];
  // The number is of the rows that are listed — not the server's cap written
  // out again here, to go on saying 2,000 after the server's has changed.
  if (list?.truncated) notes.push(`Showing the ${grouped(all.length)} most used medicines.`);
  const unreadable = list?.unreadable ?? 0;
  if (unreadable > 0) notes.push(`${unreadable} ${unreadable === 1 ? "medicine" : "medicines"} could not be read and ${unreadable === 1 ? "is" : "are"} not listed.`);

  return (
    // The veil's padding is the box's margin: no `vh` / `vw` under the page zoom.
    <div style={{ position: "fixed", inset: 0, padding: 16, background: scrim, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onMouseDown={(e) => { pressedVeil.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget) veilPressed(); }}>
      <div role="dialog" aria-modal="true" aria-label="Add Bulk Medicine" {...dialog}
        style={{ width: "min(640px, 100%)", maxWidth: "100%", height: 620, maxHeight: "100%", background: C.n[0], borderRadius: 14, border: `0.5px solid ${C.n[200]}`, boxShadow: shadowDialog, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: font }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "16px 20px 12px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...dialogTitle }}>Add Bulk Medicine</div>
            <div style={{ fontSize: 11, color: C.n[500], marginTop: 2 }}>
              Medicines prescribed here before, each with its usual instruction. Tick, then Add.
              {/* The list is one Tab stop: without this, Tab from its first row
                  goes to Cancel, and the rest of it looks out of the keyboard's reach. */}
              {keys && " ↑ ↓ move along the list, Space ticks."}
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={btnClose}>×</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "0 20px 12px", borderBottom: `0.5px solid ${C.n[200]}` }}>
          <div role="group" aria-label="Order" style={{ display: "inline-flex", border: `1px solid ${C.n[300]}`, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
            {ORDERS.map((o, i) => (
              <button key={o.key} type="button" aria-pressed={order === o.key} onClick={() => setOrder(o.key)}
                style={{ padding: "6px 14px", border: "none", borderLeft: i ? `1px solid ${C.n[300]}` : "none", background: order === o.key ? C.pri[50] : C.n[0], color: order === o.key ? C.pri[600] : C.n[600], fontSize: 12, fontWeight: order === o.key ? 600 : 400, cursor: "pointer", fontFamily: font }}>
                {o.label}
              </button>
            ))}
          </div>
          <input aria-label="Search medicines" placeholder="Search by name or generic…" value={search} autoFocus={keys}
            onChange={(e) => seek(e.target.value)}
            onKeyDown={(e) => {
              // Escape with something typed clears the search and nothing else.
              if (e.key === "Escape" && search) { e.preventDefault(); seek(""); }
              if (e.key === "Tab") catchUp();
            }}
            style={{ ...inputSm, flex: "1 1 160px", width: "auto", minWidth: 0 }} />
        </div>

        <div ref={listRef} onKeyDown={moveAlongList} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
          {...(shown.length ? { role: "group", "aria-label": "Medicines. The arrow keys move along the list; Space ticks." } : null)}>
          {state.status === "asking" ? (
            <Loading label="Loading the medicine list…" />
          ) : state.status === "failed" ? (
            <LoadError title="The medicine list could not be loaded." detail={reasonOf(state.error)} onRetry={state.retry} />
          ) : (
            <>
              {notes.map((n) => (
                <div key={n} style={{ padding: "8px 20px", fontSize: 11.5, color: C.n[700], background: C.n[50], borderBottom: `0.5px solid ${C.n[200]}` }}>{n}</div>
              ))}
              {all.length === 0 ? (
                // With rows left out, the notice above is the whole truth: there
                // ARE medicines, and none of them could be read.
                unreadable > 0 ? null : <EmptyState icon="fileText" title="No medicines yet" hint="They appear here after prescriptions are saved." />
              ) : shown.length === 0 ? (
                <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 12.5, color: C.n[600] }}>
                  No medicine matches “{sought.trim()}”{list?.truncated ? ` among the ${grouped(all.length)} shown` : ""}.
                </div>
              ) : (
                shown.map((m) => (
                  <BulkRow key={m.id} m={m} on={picked.has(m.id)} onPad={onPad.has(m.id)} tabStop={m.id === tabStop} onToggle={toggle} onReach={setReached} />
                ))
              )}
            </>
          )}
        </div>

        {/* What the last press did not do. Above the buttons and in the colour
            of "look at this": as one more grey line of the footer it was missed.
            The region is on the page from the start and only its words change:
            one that arrives with its words already in it is often not read out. */}
        <div role="status" aria-label="Notice"
          style={note ? { padding: "8px 20px", fontSize: 12, lineHeight: 1.45, color: C.warn[800], background: C.warn[50], borderTop: `0.5px solid ${C.warn[100]}` } : undefined}>{note}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 20px", borderTop: `0.5px solid ${C.n[200]}`, background: C.n[50], flexWrap: "wrap" }}>
          <span aria-live="polite" style={{ fontSize: 11.5, color: C.n[600], flex: "1 1 160px", minWidth: 0 }}>
            {count
              ? `${count} selected${outOfSight ? ` · ${outOfSight} not shown by this search` : ""}`
              : "Tick the medicines to add."}
          </span>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button type="button" onClick={onClose} style={btnSecondary("md")}>Cancel</button>
            <button type="button" onClick={add} disabled={count === 0}
              title={count === 0 ? "Tick a medicine first" : "Add the ticked medicines to this prescription"}
              style={{ ...btnPrimary("md"), fontWeight: 600, ...(count ? null : { ...btnDisabled, cursor: "default" }) }}>
              Add{count ? ` (${count})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
