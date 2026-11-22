// The doctor's side of opening another practice's patient with the patient's own
// code (physician's sheet, 16/11/2026) — the pure parts, so that they are pinned
// without a screen. The server decides everything that matters
// (`server/src/patient-access/`); this reads what was TYPED and turns the server's
// refusals into a next step for the doctor. Nothing here changes a code: spaces
// are taken out, nothing else is guessed.

import { ApiError } from "./api";

export const CODE_DIGITS = 6;

/** What was typed, as a code — or null when it cannot be one. A COPY of `server/src/patient-access/code.ts#readCode`. */
export function readCodeInput(typed: string): string | null {
  const digits = typed.replace(/\s+/g, "");
  return new RegExp(`^\\d{${CODE_DIGITS}}$`).test(digits) ? digits : null;
}

/** "34y · Male", "34y", "Female", or "" — how a patient of another practice is told apart in the list. */
export function candidateLine(c: { age: number | null; sex: string | null }): string {
  return [c.age != null ? `${c.age}y` : "", c.sex ?? ""].filter(Boolean).join(" · ");
}

/** Whether the practice may look for other practices' patients at all (isolated: no). */
export const mayOpenOthers = (w: { isolated?: boolean } | null | undefined): boolean => w?.isolated !== true;

/** Whole seconds until another code may be asked for; 0 once it may. */
export function secondsLeft(sentAtMs: number, afterSeconds: number, nowMs: number): number {
  return Math.max(0, Math.ceil((sentAtMs + afterSeconds * 1000 - nowMs) / 1000));
}

export interface Next {
  /** In a doctor's words. */
  message: string;
  /** The doctor can go on to enter a code (one was sent, or may still be live). */
  enter: boolean;
  /** This code is finished: it has to be asked for again. */
  again: boolean;
}

const GENERIC = "Something went wrong. Check your internet connection and try again.";

/** What to tell the doctor when asking for a code failed. */
export function askFailure(e: unknown): Next {
  if (!(e instanceof ApiError)) return { message: GENERIC, enter: false, again: false };
  // A code was sent a moment ago: it is on the patient's phone, enter it.
  if (e.code === "CODE_COOLDOWN") return { message: e.message, enter: true, again: false };
  if (e.status === 404) return { message: "This patient is not available any more. Search the number again.", enter: false, again: false };
  // A 4xx, and our own coded 5xx (SMS not set up / the gateway failed), carry a
  // sentence written for the doctor.
  if (e.code !== undefined || (e.status >= 400 && e.status < 500)) return { message: e.message, enter: false, again: false };
  return { message: GENERIC, enter: false, again: false };
}

/** What to tell the doctor when the code they entered was not accepted. */
export function verifyFailure(e: unknown): Next {
  if (!(e instanceof ApiError)) return { message: GENERIC, enter: true, again: false };
  if (e.code === "WRONG_CODE") return { message: e.message, enter: true, again: false };
  if (e.code === "CODE_EXPIRED" || e.code === "CODE_LOCKED") return { message: e.message, enter: false, again: true };
  if (e.status === 404) return { message: "This patient is not available any more. Search the number again.", enter: false, again: false };
  if (e.status >= 400 && e.status < 500) return { message: e.message, enter: false, again: false };
  return { message: GENERIC, enter: true, again: false };
}
