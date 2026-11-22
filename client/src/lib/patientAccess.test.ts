import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { askFailure, candidateLine, CODE_DIGITS, mayOpenOthers, readCodeInput, secondsLeft, verifyFailure } from "./patientAccess";

// The doctor's side of opening another practice's patient with the patient's own
// code (16/11/2026). The server decides; this is what is typed and what is said.

describe("readCodeInput — what the doctor typed, as a code (a copy of the server's readCode)", () => {
  it.each([
    ["482913", "482913"],
    [" 482913 ", "482913"],
    ["482 913", "482913"],
    ["482 913", "482913"],
    ["000042", "000042"],
  ])("%j is %j", (typed, code) => expect(readCodeInput(typed)).toBe(code));

  it.each([[""], ["   "], ["48291"], ["4829133"], ["48291a"], ["482-913"], ["৪৮২৯১৩"], ["code 482913"]])(
    "%j is not a code",
    (typed) => expect(readCodeInput(typed)).toBeNull(),
  );

  it("the length is the server's", () => {
    expect(CODE_DIGITS).toBe(6);
  });
});

describe("candidateLine — how a patient of another practice is told apart", () => {
  it.each([
    [{ age: 34, sex: "Male" }, "34y · Male"],
    [{ age: 34, sex: null }, "34y"],
    [{ age: null, sex: "Female" }, "Female"],
    [{ age: null, sex: null }, ""],
    [{ age: 0, sex: "Male" }, "0y · Male"], // a newborn is 0y, not "unknown"
  ])("%j → %j", (c, line) => expect(candidateLine(c)).toBe(line));
});

describe("mayOpenOthers — an isolated practice looks at no other practice's patient", () => {
  it("only an explicit isolated:true closes it", () => {
    expect(mayOpenOthers({ isolated: true })).toBe(false);
    expect(mayOpenOthers({ isolated: false })).toBe(true);
    expect(mayOpenOthers({})).toBe(true);
    expect(mayOpenOthers(null)).toBe(true);
    expect(mayOpenOthers(undefined)).toBe(true);
  });
});

describe("secondsLeft", () => {
  it("counts whole seconds up, never negative", () => {
    expect(secondsLeft(1000, 60, 1000)).toBe(60);
    expect(secondsLeft(1000, 60, 1001)).toBe(60); // 59.999 → 60: it is not yet allowed
    expect(secondsLeft(1000, 60, 1000 + 59_000)).toBe(1);
    expect(secondsLeft(1000, 60, 1000 + 60_000)).toBe(0);
    expect(secondsLeft(1000, 60, 1000 + 999_000)).toBe(0);
  });
  it("no wait is none", () => {
    expect(secondsLeft(1000, 0, 5000)).toBe(0);
  });
});

describe("askFailure — asking for the code did not work", () => {
  it("a code just sent: go on to enter it, in the server's words", () => {
    const n = askFailure(new ApiError(429, "A code was just sent. You can ask for another in 40 seconds.", "CODE_COOLDOWN"));
    expect(n).toEqual({ message: "A code was just sent. You can ask for another in 40 seconds.", enter: true, again: false });
  });
  it("too many codes sent to this patient: the server's sentence, nothing to enter", () => {
    const n = askFailure(new ApiError(429, "Too many codes have been sent to this patient. Try again later.", "CODE_LIMIT"));
    expect(n.enter).toBe(false);
    expect(n.message).toContain("Too many codes");
  });
  it("the text service is not set up / failed: the server's sentence", () => {
    expect(askFailure(new ApiError(503, "The text message service is not set up on this server, so the patient's code cannot be sent.", "SMS_NOT_CONFIGURED")).message).toContain("not set up");
    expect(askFailure(new ApiError(502, "The code could not be sent to the patient's phone: x", "SMS_FAILED")).message).toContain("could not be sent");
  });
  it("a patient that is gone (404) is told to search again", () => {
    expect(askFailure(new ApiError(404, "Patient not found")).message).toMatch(/Search the number again/);
  });
  it("a number that cannot receive a text (422) is the server's sentence", () => {
    expect(askFailure(new ApiError(422, "This patient's number cannot receive a text message, so a code cannot be sent.")).message).toContain("cannot receive");
  });
  it("an uncoded server error and a lost connection are never shown raw", () => {
    expect(askFailure(new ApiError(500, "Internal server error")).message).not.toContain("Internal");
    expect(askFailure(new TypeError("Failed to fetch")).message).toMatch(/internet connection/);
    expect(askFailure("boom").message).toMatch(/internet connection/);
  });
});

describe("verifyFailure — the code entered was not accepted", () => {
  it("a wrong code stays on the entry, with the tries left", () => {
    const n = verifyFailure(new ApiError(400, "That code is not right. 3 tries left.", "WRONG_CODE"));
    expect(n).toEqual({ message: "That code is not right. 3 tries left.", enter: true, again: false });
  });
  it("an expired code and a used-up code both send the doctor back to ask again", () => {
    expect(verifyFailure(new ApiError(400, "no code", "CODE_EXPIRED"))).toMatchObject({ again: true, enter: false });
    expect(verifyFailure(new ApiError(429, "locked", "CODE_LOCKED"))).toMatchObject({ again: true, enter: false });
  });
  it("a patient that is gone is told to search again", () => {
    expect(verifyFailure(new ApiError(404, "Patient not found")).message).toMatch(/Search the number again/);
  });
  it("a lost connection keeps the code box (the code may still be good)", () => {
    const n = verifyFailure(new TypeError("Failed to fetch"));
    expect(n.enter).toBe(true);
    expect(n.again).toBe(false);
    expect(n.message).toMatch(/internet connection/);
  });
  it("an isolated practice (403) gets the server's sentence", () => {
    expect(verifyFailure(new ApiError(403, "This practice works on its own patients only, so another doctor's patients cannot be opened.")).message).toContain("own patients only");
  });
});
