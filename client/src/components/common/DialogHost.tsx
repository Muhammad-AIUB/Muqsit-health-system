"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import { C, font } from "@/theme";
import { btnDanger, btnPrimary, btnSecondary, dialogTitle, scrim } from "@/theme/styles";
import { currentDialog, registerDialogHost, settleDialog, subscribeDialogs, type PendingDialog } from "@/lib/dialogs";
import { useDialog } from "@/lib/useDialog";
import Icon from "./Icon";

// Where `confirmAction()` and `tell()` are drawn. Mounted once, in Providers, so
// it is on every screen — sign-in included — and above every other popup.
export default function DialogHost() {
  useEffect(() => registerDialogHost(), []);
  const dialog = useSyncExternalStore(subscribeDialogs, currentDialog, () => null);
  // Keyed, so each question is a fresh box: its own focus, its own way back.
  return dialog ? <DialogBox key={dialog.id} dialog={dialog} /> : null;
}

function DialogBox({ dialog }: { dialog: PendingDialog }) {
  const titleId = useId();
  const bodyId = useId();
  const confirm = dialog.kind === "confirm";
  const danger = confirm ? !!dialog.danger : dialog.tone !== "info";
  const answer = (ok: boolean) => settleDialog(dialog.id, ok);
  // Escape is "no" to a question and "read it" to a message.
  const panel = useDialog(true, () => answer(false));

  // …and it belongs to this box alone. Four older popups (the lightbox, the
  // print sheet, special advice, the personal note) listen for Escape by
  // themselves; a message raised over one of them must not close it as well.
  // Capturing on the window gets here before any of them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      settleDialog(dialog.id, false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dialog.id]);

  const tint = danger ? C.danger : C.info;
  return (
    <div
      // A question may be backed out of by clicking away from it. A message may
      // not: it is there to be read, and a stray click must not be what reads it.
      onClick={confirm ? () => answer(false) : undefined}
      style={{ position: "fixed", inset: 0, zIndex: 4000, background: scrim, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: font }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={dialog.body ? bodyId : undefined}
        {...panel}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(420px, 100%)", background: C.n[0], borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(32,33,36,0.28)", outline: "none" }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div aria-hidden style={{ flex: "0 0 36px", width: 36, height: 36, borderRadius: "50%", background: tint[50], color: tint[800], display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="alert" size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <div id={titleId} style={{ ...dialogTitle, overflowWrap: "anywhere" }}>{dialog.title}</div>
            {dialog.body && (
              <div id={bodyId} style={{ fontSize: 13, color: C.n[600], lineHeight: 1.55, marginTop: 6, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{dialog.body}</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginTop: 20 }}>
          {confirm ? (
            <>
              {/* Cancel holds the focus when something is about to be taken
                  away, so a stray Enter keeps it. */}
              <button type="button" autoFocus={danger} onClick={() => answer(false)} style={btnSecondary("md")}>
                {dialog.cancelLabel ?? "Cancel"}
              </button>
              <button type="button" autoFocus={!danger} onClick={() => answer(true)} style={danger ? btnDanger("md") : btnPrimary("md")}>
                {dialog.confirmLabel ?? "Confirm"}
              </button>
            </>
          ) : (
            <button type="button" autoFocus onClick={() => answer(true)} style={btnPrimary("md")}>OK</button>
          )}
        </div>
      </div>
    </div>
  );
}
