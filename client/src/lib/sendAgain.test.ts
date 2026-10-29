import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { SEND_AGAIN_AFTER_MS, answerLost, sendUntilAnswered } from "./sendAgain";

// ⚕️ A Save & print the server STORED, whose answer was lost on the way back
// (a connection dropped after the write, a 504 from the proxy), was said to the
// doctor as "not saved" — and the visit stayed "Incomplete" with a prescription
// on the record. The same request is sent again, quietly, a few times: the
// server answers the very same prescription with the one on record
// (`server/src/prescriptions/repeat.ts`), so a re-send can never file it twice,
// and the first answer that arrives says what happened.

describe("answerLost — an answer that does not say whether the server did it", () => {
  it("no answer at all, or an answer that could not be read", () => {
    expect(answerLost(new TypeError("Failed to fetch"))).toBe(true);
    // A 2xx that was not JSON — a hospital Wi-Fi's sign-in page in its place.
    expect(answerLost(new SyntaxError("Unexpected token '<'"))).toBe(true);
  });

  it("the proxy's own failures: it may have passed the request on before the connection went", () => {
    for (const status of [502, 503, 504]) expect(answerLost(new ApiError(status, `Request failed (${status})`)), `${status}`).toBe(true);
  });

  it("an answer of the server's own says what happened, and is not sent again", () => {
    for (const status of [400, 401, 403, 404, 409, 413, 429, 500]) {
      expect(answerLost(new ApiError(status, "x")), `${status}`).toBe(false);
    }
  });
});

describe("sendUntilAnswered", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("sends once when the answer arrives", async () => {
    const send = vi.fn().mockResolvedValue({ id: "rx1" });
    await expect(sendUntilAnswered(send)).resolves.toEqual({ id: "rx1" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends again after a lost answer, and resolves with the first answer that arrives", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new ApiError(504, "Request failed (504)"))
      .mockResolvedValueOnce({ id: "rx1", repeat: true });
    const lost = vi.fn();
    const done = sendUntilAnswered(send, lost);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    // Not at once: a connection that has just dropped is given a moment.
    await vi.advanceTimersByTimeAsync(SEND_AGAIN_AFTER_MS[0] - 1);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(SEND_AGAIN_AFTER_MS[1]);
    await expect(done).resolves.toEqual({ id: "rx1", repeat: true });
    expect(send).toHaveBeenCalledTimes(3);
    expect(lost).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last wait and throws the last error, every lost answer counted", async () => {
    const send = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const lost = vi.fn();
    const done = sendUntilAnswered(send, lost);
    const caught = done.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(SEND_AGAIN_AFTER_MS.reduce((a, b) => a + b, 0));
    expect(await caught).toBeInstanceOf(TypeError);
    expect(send).toHaveBeenCalledTimes(SEND_AGAIN_AFTER_MS.length + 1);
    expect(lost).toHaveBeenCalledTimes(SEND_AGAIN_AFTER_MS.length + 1);
    // Seven seconds of "Saving the prescription…" at most, before the box.
    expect(SEND_AGAIN_AFTER_MS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(7000);
  });

  it("stops at the first answer of the server's own, and throws it", async () => {
    const refused = new ApiError(500, "Internal server error");
    const send = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce(refused);
    const lost = vi.fn();
    const caught = sendUntilAnswered(send, lost).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await caught).toBe(refused);
    expect(send).toHaveBeenCalledTimes(2);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it("never sends again what the server answered itself", async () => {
    const send = vi.fn().mockRejectedValue(new ApiError(403, "You do not have permission to save prescriptions"));
    const caught = sendUntilAnswered(send).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await caught).toBeInstanceOf(ApiError);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
