import { ApiError } from "./api";
import type { NoticeRequest } from "./dialogs";

// What the Save buttons say: the line under them, and what a doctor is told
// when a save did not happen.
//
// ⚕️ Until 18/10/2026 the line held a bare string and was drawn in the "saved"
// green whatever it said — "Save failed: …" and "Draft NOT saved …" included —
// and two of its sentences ended "Is the API running?". Green is for done /
// normal / saved only, and a doctor cannot start an API (root CLAUDE.md).

/**
 * What KIND of news the line carries, held with its words and never guessed
 * from them: `ok` — it was saved (`C.ok`); `warn` — it was not, for a reason
 * the doctor can put right on the screen (`C.warn`). A save that did not
 * happen for any other reason is not this line at all: it is a box the doctor
 * has to read (`tell()`), since the line goes after a few seconds and after
 * Save & print it is under the print sheet.
 */
export type SaveNoticeKind = "ok" | "warn";
export interface SaveNotice { kind: SaveNoticeKind; text: string }

export const CHECK_CONNECTION = "Check your internet connection and try again.";
export const SERVER_COULD_NOT_SAVE = "The server could not save it just now. Please try again in a moment.";
export const SERVER_REFUSED_AS_WRITTEN = "The server did not accept it as it is written.";
// apiFetch has already tried to renew the session once. Refused, the app goes
// to the sign-in page and the editor with it — so nothing is promised about it.
export const SIGN_IN_AGAIN = "Your sign-in could not be renewed just now. If the sign-in page opens, sign in again and open this patient.";
// The last sentence of the box: the editor is left exactly as it was.
export const STILL_HERE = "Everything you wrote is still here.";

/**
 * Why a save did not reach the record, in the doctor's words.
 *
 * A refusal (403) is worded by the server for a person — the save-and-print
 * grant, `WorkstationGuard` — and is shown as written. Nothing else it says
 * is: "Internal server error", "Unauthorized", "ThrottlerException: Too Many
 * Requests" and "Request failed (502)" are the framework's words, a 400 is a
 * validator's ("note.each value must be shorter than …"), and a 403 that came
 * with no sentence of the server's (a proxy's page: apiFetch's own "Request
 * failed (403)") is not one either. No answer at all — or a successful one
 * that was not JSON (a Wi-Fi sign-in page in its place) — is the connection;
 * such a page sent with an error status is an ApiError, and reads as the
 * server's failure.
 */
export function whyNotSaved(e: unknown): string {
  if (!(e instanceof ApiError)) return CHECK_CONNECTION;
  const said = e.message.trim();
  if (e.status === 401) return SIGN_IN_AGAIN;
  if (e.status === 403 && said && !/^Request failed \(\d+\)$/.test(said)) return /[.!?]$/.test(said) ? said : `${said}.`;
  if (e.status === 400 || e.status === 413) return SERVER_REFUSED_AS_WRITTEN;
  return SERVER_COULD_NOT_SAVE;
}

/** The body of the box for a save that did not reach the record. */
export function notSavedBody(e: unknown): string {
  const why = whyNotSaved(e);
  return why === SIGN_IN_AGAIN ? why : `${why} ${STILL_HERE}`;
}

// A lost answer (`sendAgain.ts`): the server answers the same prescription sent
// again within half an hour with the one on record (REPEAT_WINDOW_MS,
// server/src/prescriptions/repeat.ts — `saveNotice.test.ts` reads it there).
export const MAY_BE_SAVED = "It may have reached the record all the same: if you press Save & print again within half an hour without changing anything, it will not be filed twice.";

/**
 * The box for a Save & print that did not come back saved. `answerLost`: some
 * answer was lost on the way (`sendAgain.ts`), so the prescription may be on the
 * record — "not saved" of a stored prescription is what made a doctor change a
 * word and file the visit twice. Only text refused AS WRITTEN (400, 413) is
 * known not to be there: no copy of it got past the server.
 */
export function rxNotSaved(e: unknown, answerLost: boolean): NoticeRequest {
  const why = whyNotSaved(e);
  if (!answerLost || why === SERVER_REFUSED_AS_WRITTEN) {
    return { title: "The prescription was not saved.", body: notSavedBody(e), tone: "danger" };
  }
  return {
    title: "The prescription may not have been saved.",
    // Over the sign-in page there is nothing to press again, and nothing "still here".
    body: why === SIGN_IN_AGAIN ? why : `${why} ${MAY_BE_SAVED} ${STILL_HERE}`,
    tone: "danger",
  };
}

const listed = (items: string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * The box for a prescription that IS saved while part of the patient's record
 * was not brought up to date with it — naming what failed, or, where that
 * cannot be known (`null`: something threw before every write was sent),
 * saying so. A box, not the line: after Save & print the print sheet covers
 * the line under the buttons.
 */
export function historyNotUpdated(failed: string[] | null): NoticeRequest {
  const what = failed && failed.length
    ? `The ${listed(failed)} kept in the patient's record ${failed.length === 1 ? "was" : "were"} not updated.`
    : "The patient's record may not have been brought up to date with this visit.";
  return {
    title: "Prescription saved, but the patient's history could not be updated.",
    body: `${what} The prescription itself is saved, with everything written on it.`,
    tone: "danger",
  };
}
