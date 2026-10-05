// "Are you sure?" and "this did not work", asked by the app itself.
//
// Until 2026-10-06 both were the browser's: seventeen `window.confirm` /
// `window.alert` calls. Three things were wrong with that on a clinical screen:
//   • The box is the browser's, titled with the site's address, in the system
//     font, with OK / Cancel whatever the question was.
//   • After a second one the browser offers "Prevent this page from creating
//     additional dialogs". Tick it and every later `confirm()` answers false
//     without ever being shown, and every later `alert()` says nothing — among
//     them "Prescription saved, but the printable sheet could not be built" and
//     "2 images were NOT added: a different patient was opened".
//   • `confirm()` freezes the tab, so nothing behind it can be read.
//
//   if (!(await confirmAction({ title: "Remove Rahim from Ward 3?", confirmLabel: "Remove", danger: true }))) return;
//   tell({ title: "Could not send the message.", tone: "danger" });
//
// ⚕️ The question is never skipped. With no <DialogHost> on the page — a unit
// test, or a screen outside the app's providers — both fall back to the
// browser's own box, so an action that asks first still asks.
//
// ⚕️ `confirmAction` is asynchronous and the page stays live behind it. Decide
// WHAT is being removed before the await and carry that through it; re-read
// anything that can change (a list another device edits) after it.

export interface ConfirmRequest {
  // The whole question, naming the thing: "Remove Rahim from Ward 3?"
  title: string;
  // What happens next, when that is not obvious from the question.
  body?: string;
  // The verb of the question ("Remove", "Delete"), never "OK".
  confirmLabel?: string;
  cancelLabel?: string;
  // The action takes something away: red button, and Cancel holds the focus so
  // a stray Enter keeps what was there.
  danger?: boolean;
}

export interface NoticeRequest {
  title: string;
  body?: string;
  tone?: "danger" | "info";
}

export type PendingDialog =
  | ({ id: number; kind: "confirm" } & ConfirmRequest)
  | ({ id: number; kind: "notice" } & NoticeRequest);

type Entry = { dialog: PendingDialog; settle: (ok: boolean) => void; promise: Promise<boolean> };

let seq = 0;
let hosts = 0;
let queue: Entry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const asText = (r: { title: string; body?: string }) => (r.body ? `${r.title}\n\n${r.body}` : r.title);

function browserConfirm(r: ConfirmRequest): boolean {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return false;
  return window.confirm(asText(r));
}

function browserAlert(r: NoticeRequest): void {
  if (typeof window === "undefined" || typeof window.alert !== "function") return;
  window.alert(asText(r));
}

function enqueue(dialog: PendingDialog): Promise<boolean> {
  let settle!: (ok: boolean) => void;
  const promise = new Promise<boolean>((resolve) => { settle = resolve; });
  queue = [...queue, { dialog, settle, promise }];
  emit();
  return promise;
}

// Resolves true only when the doctor pressed the confirm button.
export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  if (hosts === 0) return Promise.resolve(browserConfirm(request));
  return enqueue({ id: ++seq, kind: "confirm", ...request });
}

// Says something that must be read. It stays until it is acknowledged; nothing
// waits on it, so the caller carries on.
export function tell(request: NoticeRequest): Promise<void> {
  if (hosts === 0) {
    browserAlert(request);
    return Promise.resolve();
  }
  // The same message already waiting is one message, not a stack of them — a
  // send that fails five times in a row must not need five presses to clear.
  const same = queue.find((e) => e.dialog.kind === "notice" && e.dialog.title === request.title && e.dialog.body === request.body);
  if (same) return same.promise.then(() => undefined);
  return enqueue({ id: ++seq, kind: "notice", ...request }).then(() => undefined);
}

// ── For <DialogHost> only ─────────────────────────────────────
export function subscribeDialogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// One at a time, in the order they were raised.
export function currentDialog(): PendingDialog | null {
  return queue[0]?.dialog ?? null;
}

export function settleDialog(id: number, ok: boolean): void {
  const entry = queue.find((e) => e.dialog.id === id);
  if (!entry) return;
  queue = queue.filter((e) => e !== entry);
  entry.settle(ok);
  emit();
}

// A host announces itself for as long as it is on the page. When the last one
// leaves with questions still open, nobody can answer them: a confirm counts as
// NOT confirmed, and a message goes to the browser's own box rather than being
// dropped.
export function registerDialogHost(): () => void {
  hosts += 1;
  return () => {
    hosts -= 1;
    if (hosts > 0) return;
    const left = queue;
    queue = [];
    for (const entry of left) {
      if (entry.dialog.kind === "notice") browserAlert(entry.dialog);
      entry.settle(false);
    }
    emit();
  };
}
