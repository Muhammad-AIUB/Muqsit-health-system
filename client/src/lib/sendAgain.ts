import { ApiError } from "./api";

// ⚕️ A Save & print the server STORED, whose answer was lost on the way back
// (a connection dropped after the write, a 504 from the proxy), was said to the
// doctor as "not saved": the visit stayed "Incomplete" with a prescription on
// the record, and a doctor who changed a word before pressing again filed the
// visit twice. The client cannot tell such a request from one that never left.
// The server can: it answers the very same prescription, sent again, with the
// one on record (`server/src/prescriptions/repeat.ts`). So the same request is
// sent again, quietly, a few times — a re-send can never file it twice — and
// the first answer that arrives says what happened.
//
// Only for a request the server answers ONCE however often it is sent. Any
// other POST sent again is a second write.

/**
 * An answer that does not say whether the server did it: no answer at all (a
 * dropped connection), an answer that could not be read (a 2xx that was not
 * JSON), or the proxy's own 502 / 503 / 504 — it may have passed the request on
 * before the connection went. Every other answer is the server's own, and says
 * what happened.
 */
export function answerLost(e: unknown): boolean {
  return !(e instanceof ApiError) || e.status === 502 || e.status === 503 || e.status === 504;
}

/** The wait before each re-send: three of them, seven seconds of "Saving…" at most. */
export const SEND_AGAIN_AFTER_MS: readonly number[] = [1000, 2000, 4000];

/**
 * Sends, and while the answer is lost sends the SAME request again after each
 * wait. Resolves with the first answer; throws the server's own refusal at
 * once, and the last error once the waits are spent. `onLost` is told of every
 * lost answer — after one, whatever comes next, it is not known that the
 * request was NOT carried out.
 */
export async function sendUntilAnswered<T>(send: () => Promise<T>, onLost?: () => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (e) {
      if (!answerLost(e)) throw e;
      onLost?.();
      if (attempt >= SEND_AGAIN_AFTER_MS.length) throw e;
      await new Promise((resolve) => setTimeout(resolve, SEND_AGAIN_AFTER_MS[attempt]));
    }
  }
}
